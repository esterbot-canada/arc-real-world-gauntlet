from pathlib import Path

import pytest

from agent_work_evidence.ts_import_graph import (
    parse_typescript,
    resolve_import_origins,
)


@pytest.fixture
def fixture_root() -> Path:
    return Path(__file__).parent / "fixtures" / "import_bleed"


def test_parser_preserves_import_and_export_bindings():
    module = parse_typescript(
        """
        import defaultThing, { cleanValue as localClean } from "./shared";
        import * as shared from "./shared";
        import "./side-effect";
        export { cleanValue as publicClean } from "./clean";
        export * from "./ambiguous";
        """
    )

    assert [(item.kind, item.imported_name, item.local_name, item.module_specifier) for item in module.imports] == [
        ("default", "default", "defaultThing", "./shared"),
        ("named", "cleanValue", "localClean", "./shared"),
        ("namespace", None, "shared", "./shared"),
        ("side_effect", None, None, "./side-effect"),
    ]
    assert [(item.kind, item.exported_name, item.imported_name, item.module_specifier) for item in module.exports] == [
        ("named", "publicClean", "cleanValue", "./clean"),
        ("star", None, None, "./ambiguous"),
    ]


def test_named_import_resolves_to_clean_origin_without_flagging_mixed_barrel(fixture_root):
    result = resolve_import_origins(
        fixture_root / "src/feature/use-clean.ts",
        fixture_root,
    )
    assert result.resolved["cleanValue"] == "src/shared/clean.ts"
    assert not result.gaps
    assert not any("secret" in line for line in result.evidence["cleanValue"])


def test_named_import_resolves_to_denied_origin_through_mixed_barrel(fixture_root):
    result = resolve_import_origins(
        fixture_root / "src/feature/use-secret.ts",
        fixture_root,
    )
    assert result.resolved["secretValue"] == "src/auth/secret.ts"


def test_namespace_import_from_mixed_barrel_is_ambiguous(fixture_root):
    result = resolve_import_origins(
        fixture_root / "src/feature/use-namespace.ts",
        fixture_root,
    )
    assert result.gaps == [
        "Namespace import from ../shared in src/feature/use-namespace.ts cannot be resolved to a specific export"
    ]


def test_alias_import_preserves_local_name(tmp_path):
    (tmp_path / "source.ts").write_text("export const value = 1;", encoding="utf-8")
    importer = tmp_path / "use.ts"
    importer.write_text('import { value as alias } from "./source";', encoding="utf-8")

    result = resolve_import_origins(importer, tmp_path)

    assert result.resolved == {"alias": "source.ts"}


def test_missing_package_and_path_escape_become_gaps(tmp_path):
    package_import = tmp_path / "package.ts"
    package_import.write_text('import { value } from "@app/source";', encoding="utf-8")
    escape_import = tmp_path / "escape.ts"
    escape_import.write_text('import { value } from "../outside";', encoding="utf-8")

    package_result = resolve_import_origins(package_import, tmp_path)
    escape_result = resolve_import_origins(escape_import, tmp_path)

    assert "Unsupported package or alias" in package_result.gaps[0]
    assert "leaves repository root" in escape_result.gaps[0]


def test_cycle_duplicate_and_star_exports_become_gaps(tmp_path):
    (tmp_path / "a.ts").write_text('export { value } from "./b";', encoding="utf-8")
    (tmp_path / "b.ts").write_text('export { value } from "./a";', encoding="utf-8")
    (tmp_path / "cycle.ts").write_text('import { value } from "./a";', encoding="utf-8")
    (tmp_path / "duplicate.ts").write_text(
        'export { value } from "./one";\nexport { value } from "./two";',
        encoding="utf-8",
    )
    (tmp_path / "one.ts").write_text("export const value = 1;", encoding="utf-8")
    (tmp_path / "two.ts").write_text("export const value = 2;", encoding="utf-8")
    (tmp_path / "duplicate-use.ts").write_text(
        'import { value } from "./duplicate";',
        encoding="utf-8",
    )
    (tmp_path / "star.ts").write_text(
        'export * from "./one";\nexport * from "./two";',
        encoding="utf-8",
    )
    (tmp_path / "star-use.ts").write_text('import { value } from "./star";', encoding="utf-8")

    assert "Cycle" in resolve_import_origins(tmp_path / "cycle.ts", tmp_path).gaps[0]
    assert "Duplicate export" in resolve_import_origins(
        tmp_path / "duplicate-use.ts",
        tmp_path,
    ).gaps[0]
    assert "Ambiguous export *" in resolve_import_origins(
        tmp_path / "star-use.ts",
        tmp_path,
    ).gaps[0]


def test_malformed_typescript_becomes_analysis_gap(tmp_path):
    importer = tmp_path / "broken.ts"
    importer.write_text('import { value from "./source";', encoding="utf-8")

    result = resolve_import_origins(importer, tmp_path)

    assert result.gaps == [
        "TypeScript parse errors in broken.ts prevent deterministic import analysis"
    ]
