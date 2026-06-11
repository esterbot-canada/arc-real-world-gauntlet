from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from tree_sitter import Language, Node, Parser
import tree_sitter_typescript

from agent_work_evidence.path_policy import normalize_repo_path

ImportKind = Literal["named", "default", "namespace", "side_effect"]
ExportKind = Literal["named", "star", "local"]


@dataclass(frozen=True)
class ImportBinding:
    imported_name: str | None
    local_name: str | None
    module_specifier: str
    kind: ImportKind


@dataclass(frozen=True)
class ExportBinding:
    exported_name: str | None
    imported_name: str | None
    module_specifier: str | None
    kind: ExportKind


@dataclass(frozen=True)
class TypeScriptModule:
    imports: tuple[ImportBinding, ...] = ()
    exports: tuple[ExportBinding, ...] = ()
    has_errors: bool = False


@dataclass(frozen=True)
class ImportResolution:
    resolved: dict[str, str] = field(default_factory=dict)
    evidence: dict[str, tuple[str, ...]] = field(default_factory=dict)
    gaps: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class _ExportResolution:
    origin: str | None = None
    chain: tuple[str, ...] = ()
    gap: str | None = None


_LANGUAGE = Language(tree_sitter_typescript.language_typescript())
_PARSER = Parser(_LANGUAGE)
_MAX_RESOLUTION_DEPTH = 32


def _text(node: Node, source: bytes) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8")


def _module_specifier(statement: Node, source: bytes) -> str:
    source_node = statement.child_by_field_name("source")
    if source_node is None:
        return ""
    fragments = [child for child in source_node.named_children if child.type == "string_fragment"]
    return _text(fragments[0], source) if fragments else _text(source_node, source).strip("\"'")


def _descendants(node: Node, node_type: str) -> list[Node]:
    found: list[Node] = []
    stack = [node]
    while stack:
        current = stack.pop()
        if current.type == node_type:
            found.append(current)
        stack.extend(reversed(current.named_children))
    return found


def _parse_import(statement: Node, source: bytes) -> list[ImportBinding]:
    module_specifier = _module_specifier(statement, source)
    clause = next(
        (child for child in statement.named_children if child.type == "import_clause"),
        None,
    )
    if clause is None:
        return [ImportBinding(None, None, module_specifier, "side_effect")]

    bindings: list[ImportBinding] = []
    for child in clause.named_children:
        if child.type == "identifier":
            bindings.append(
                ImportBinding("default", _text(child, source), module_specifier, "default")
            )
        elif child.type == "namespace_import":
            identifier = next(
                (item for item in child.named_children if item.type == "identifier"),
                None,
            )
            bindings.append(
                ImportBinding(
                    None,
                    _text(identifier, source) if identifier else None,
                    module_specifier,
                    "namespace",
                )
            )
        elif child.type == "named_imports":
            for specifier in _descendants(child, "import_specifier"):
                name = specifier.child_by_field_name("name")
                alias = specifier.child_by_field_name("alias")
                imported_name = _text(name, source)
                bindings.append(
                    ImportBinding(
                        imported_name,
                        _text(alias, source) if alias else imported_name,
                        module_specifier,
                        "named",
                    )
                )
    return bindings


def _declared_export_names(declaration: Node, source: bytes) -> list[str]:
    if declaration.type in {
        "function_declaration",
        "class_declaration",
        "interface_declaration",
        "type_alias_declaration",
        "enum_declaration",
    }:
        name = declaration.child_by_field_name("name")
        return [_text(name, source)] if name else []
    if declaration.type in {"lexical_declaration", "variable_declaration"}:
        names = []
        for declarator in _descendants(declaration, "variable_declarator"):
            name = declarator.child_by_field_name("name")
            if name and name.type == "identifier":
                names.append(_text(name, source))
        return names
    return []


def _parse_export(statement: Node, source: bytes) -> list[ExportBinding]:
    module_specifier = _module_specifier(statement, source) or None
    if any(child.type == "*" for child in statement.children):
        return [ExportBinding(None, None, module_specifier, "star")]

    export_clause = next(
        (child for child in statement.named_children if child.type == "export_clause"),
        None,
    )
    if export_clause is not None:
        bindings: list[ExportBinding] = []
        for specifier in _descendants(export_clause, "export_specifier"):
            name = specifier.child_by_field_name("name")
            alias = specifier.child_by_field_name("alias")
            imported_name = _text(name, source)
            exported_name = _text(alias, source) if alias else imported_name
            bindings.append(
                ExportBinding(
                    exported_name=exported_name,
                    imported_name=imported_name,
                    module_specifier=module_specifier,
                    kind="named" if module_specifier else "local",
                )
            )
        return bindings

    declaration = statement.child_by_field_name("declaration")
    if declaration is None:
        return []
    return [
        ExportBinding(name, name, None, "local")
        for name in _declared_export_names(declaration, source)
    ]


def parse_typescript(source_text: str) -> TypeScriptModule:
    source = source_text.encode("utf-8")
    tree = _PARSER.parse(source)
    imports: list[ImportBinding] = []
    exports: list[ExportBinding] = []
    for statement in tree.root_node.named_children:
        if statement.type == "import_statement":
            imports.extend(_parse_import(statement, source))
        elif statement.type == "export_statement":
            exports.extend(_parse_export(statement, source))
    return TypeScriptModule(tuple(imports), tuple(exports), tree.root_node.has_error)


def parse_typescript_file(path: Path) -> TypeScriptModule:
    return parse_typescript(path.read_text(encoding="utf-8"))


def _repo_relative(path: Path, repo_root: Path) -> str:
    return normalize_repo_path(path.relative_to(repo_root).as_posix())


def _resolve_module(
    importer: Path,
    module_specifier: str,
    repo_root: Path,
) -> tuple[Path | None, str | None]:
    if not module_specifier.startswith("."):
        return None, f"Unsupported package or alias import {module_specifier} in {_repo_relative(importer, repo_root)}"

    root = repo_root.resolve()
    unresolved = (importer.parent / module_specifier).resolve()
    try:
        unresolved.relative_to(root)
    except ValueError:
        return None, f"Import {module_specifier} leaves repository root from {_repo_relative(importer, repo_root)}"

    candidates: list[Path]
    if unresolved.suffix in {".ts", ".tsx"}:
        candidates = [unresolved]
    elif unresolved.suffix:
        candidates = []
    else:
        candidates = [
            unresolved.with_suffix(".ts"),
            unresolved.with_suffix(".tsx"),
            unresolved / "index.ts",
            unresolved / "index.tsx",
        ]
    matches = [candidate for candidate in candidates if candidate.is_file()]
    if len(matches) == 1:
        return matches[0], None
    if len(matches) > 1:
        return None, f"Ambiguous module {module_specifier} from {_repo_relative(importer, repo_root)}"
    return None, f"Could not resolve module {module_specifier} from {_repo_relative(importer, repo_root)}"


def _resolve_export(
    module_path: Path,
    export_name: str,
    repo_root: Path,
    visited: frozenset[tuple[Path, str]],
    depth: int,
) -> _ExportResolution:
    key = (module_path.resolve(), export_name)
    if key in visited:
        return _ExportResolution(gap=f"Cycle while resolving {export_name} from {_repo_relative(module_path, repo_root)}")
    if depth > _MAX_RESOLUTION_DEPTH:
        return _ExportResolution(gap=f"Resolution depth exceeded for {export_name}")

    module = parse_typescript_file(module_path)
    matches = [
        binding
        for binding in module.exports
        if binding.exported_name == export_name
    ]
    if len(matches) > 1:
        return _ExportResolution(
            gap=f"Duplicate export {export_name} in {_repo_relative(module_path, repo_root)}"
        )
    if len(matches) == 1:
        binding = matches[0]
        current = _repo_relative(module_path, repo_root)
        if binding.module_specifier is None:
            return _ExportResolution(origin=current, chain=(f"{export_name} resolves to {current}",))
        target, gap = _resolve_module(module_path, binding.module_specifier, repo_root)
        if gap:
            return _ExportResolution(gap=gap)
        nested = _resolve_export(
            target,
            binding.imported_name or export_name,
            repo_root,
            visited | {key},
            depth + 1,
        )
        if nested.gap:
            return nested
        return _ExportResolution(
            origin=nested.origin,
            chain=(
                f"{export_name} re-exported by {current} from {binding.module_specifier}",
                *nested.chain,
            ),
        )

    star_exports = [binding for binding in module.exports if binding.kind == "star"]
    if star_exports:
        return _ExportResolution(
            gap=f"Ambiguous export * while resolving {export_name} from {_repo_relative(module_path, repo_root)}"
        )
    return _ExportResolution(
        gap=f"Export {export_name} not found in {_repo_relative(module_path, repo_root)}"
    )


def resolve_import_origins(importer: Path, repo_root: Path) -> ImportResolution:
    root = repo_root.resolve()
    source_path = importer.resolve()
    try:
        source_path.relative_to(root)
    except ValueError:
        return ImportResolution(gaps=[f"Importer {importer} is outside repository root"])

    importer_relative = _repo_relative(source_path, root)
    module = parse_typescript_file(source_path)
    if module.has_errors:
        return ImportResolution(
            gaps=[f"TypeScript parse errors in {importer_relative} prevent deterministic import analysis"]
        )
    resolved: dict[str, str] = {}
    evidence: dict[str, tuple[str, ...]] = {}
    gaps: list[str] = []
    for binding in module.imports:
        if binding.kind != "named":
            label = {
                "namespace": "Namespace",
                "default": "Default",
                "side_effect": "Side-effect",
            }[binding.kind]
            gaps.append(
                f"{label} import from {binding.module_specifier} in {importer_relative} cannot be resolved to a specific export"
            )
            continue

        target, gap = _resolve_module(source_path, binding.module_specifier, root)
        if gap:
            gaps.append(gap)
            continue
        export_name = binding.imported_name or ""
        result = _resolve_export(target, export_name, root, frozenset(), 0)
        if result.gap:
            gaps.append(result.gap)
            continue
        key = binding.local_name or export_name
        resolved[key] = result.origin or ""
        evidence[key] = (
            f"{importer_relative} imports {export_name} from {binding.module_specifier}",
            *result.chain,
        )
    return ImportResolution(resolved=resolved, evidence=evidence, gaps=gaps)
