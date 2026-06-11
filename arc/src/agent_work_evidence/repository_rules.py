import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from agent_work_evidence.contract import AssignmentContract
from agent_work_evidence.path_policy import PathPolicyError, validate_glob


class RepositoryRulesError(ValueError):
    pass


@dataclass(frozen=True)
class ProtectedPathRule:
    id: str
    kind: Literal["protected_path"]
    files: tuple[str, ...]


@dataclass(frozen=True)
class ImportBoundaryRule:
    id: str
    kind: Literal["import_boundary"]
    from_patterns: tuple[str, ...]
    deny: tuple[str, ...]


RepositoryRule = ProtectedPathRule | ImportBoundaryRule


@dataclass(frozen=True)
class RepositoryRules:
    schema_version: int
    rules: tuple[RepositoryRule, ...]


def _exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    actual = set(value)
    if actual != expected:
        raise RepositoryRulesError(
            f"{label} fields must be exactly {', '.join(sorted(expected))}"
        )


def _patterns(value: Any, label: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not value:
        raise RepositoryRulesError(f"{label} must be a non-empty array")
    parsed: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise RepositoryRulesError(f"{label} entries must be non-empty strings")
        try:
            parsed.append(validate_glob(item.strip()))
        except PathPolicyError as error:
            raise RepositoryRulesError(f"{label}: {error}") from error
    return tuple(parsed)


def parse_repository_rules(data: dict[str, Any]) -> RepositoryRules:
    if not isinstance(data, dict):
        raise RepositoryRulesError("rules document must be an object")
    _exact_keys(data, {"schema_version", "rules"}, "rules document")
    if data["schema_version"] != 1:
        raise RepositoryRulesError("schema_version must be 1")
    if not isinstance(data["rules"], list):
        raise RepositoryRulesError("rules must be an array")

    parsed: list[RepositoryRule] = []
    seen_ids: set[str] = set()
    for index, item in enumerate(data["rules"]):
        label = f"rules[{index}]"
        if not isinstance(item, dict):
            raise RepositoryRulesError(f"{label} must be an object")
        rule_id = item.get("id")
        kind = item.get("kind")
        if not isinstance(rule_id, str) or not rule_id.strip():
            raise RepositoryRulesError(f"{label}.id must be a non-empty string")
        rule_id = rule_id.strip()
        if rule_id in seen_ids:
            raise RepositoryRulesError(f"duplicate rule id: {rule_id}")
        seen_ids.add(rule_id)

        if kind == "protected_path":
            _exact_keys(item, {"id", "kind", "files"}, label)
            parsed.append(
                ProtectedPathRule(
                    id=rule_id,
                    kind="protected_path",
                    files=_patterns(item["files"], f"{label}.files"),
                )
            )
        elif kind == "import_boundary":
            _exact_keys(item, {"id", "kind", "from", "deny"}, label)
            parsed.append(
                ImportBoundaryRule(
                    id=rule_id,
                    kind="import_boundary",
                    from_patterns=_patterns(item["from"], f"{label}.from"),
                    deny=_patterns(item["deny"], f"{label}.deny"),
                )
            )
        else:
            raise RepositoryRulesError(f"{label}.kind is unsupported: {kind}")

    return RepositoryRules(schema_version=1, rules=tuple(parsed))


def load_repository_rules(path: Path) -> RepositoryRules:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RepositoryRulesError(f"could not read repository rules: {error}") from error
    return parse_repository_rules(data)


def validate_contract_exceptions(
    contract: AssignmentContract,
    repository_rules: RepositoryRules,
) -> None:
    rules_by_id = {rule.id: rule for rule in repository_rules.rules}
    for exception in contract.approved_exceptions:
        rule = rules_by_id.get(exception.rule_id)
        if rule is None:
            raise RepositoryRulesError(
                f"approved exception refers to unknown rule: {exception.rule_id}"
            )
        if not isinstance(rule, ProtectedPathRule):
            raise RepositoryRulesError(
                f"approved exception rule must be protected_path: {exception.rule_id}"
            )
