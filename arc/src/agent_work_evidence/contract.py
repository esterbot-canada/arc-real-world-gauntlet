import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from agent_work_evidence.path_policy import PathPolicyError, normalize_repo_path, validate_glob


class ContractError(ValueError):
    pass


@dataclass(frozen=True)
class ScopePolicy:
    files: tuple[str, ...]


@dataclass(frozen=True)
class ExpectedEvidence:
    required_commands: tuple[str, ...]


@dataclass(frozen=True)
class ApprovedException:
    rule_id: str
    files: tuple[str, ...]
    reason: str


@dataclass(frozen=True)
class AssignmentContract:
    schema_version: int
    status: str
    allowed_scope: ScopePolicy
    excluded_scope: ScopePolicy
    expected_evidence: ExpectedEvidence
    approved_exceptions: tuple[ApprovedException, ...]


def _require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{label} must be an object")
    return value


def _require_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    actual = set(value)
    if actual != expected:
        unknown = sorted(actual - expected)
        missing = sorted(expected - actual)
        details = []
        if unknown:
            details.append(f"unknown fields: {', '.join(unknown)}")
        if missing:
            details.append(f"missing fields: {', '.join(missing)}")
        raise ContractError(f"{label} has invalid fields ({'; '.join(details)})")


def _parse_non_empty_strings(value: Any, label: str, *, globs: bool = False) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise ContractError(f"{label} must be an array")
    parsed: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ContractError(f"{label} entries must be non-empty strings")
        candidate = item.strip()
        if globs:
            try:
                candidate = validate_glob(candidate)
            except PathPolicyError as error:
                raise ContractError(f"{label}: {error}") from error
        parsed.append(candidate)
    return tuple(parsed)


def _parse_scope(value: Any, label: str) -> ScopePolicy:
    obj = _require_object(value, label)
    _require_exact_keys(obj, {"files"}, label)
    return ScopePolicy(files=_parse_non_empty_strings(obj["files"], f"{label}.files", globs=True))


def _parse_expected_evidence(value: Any) -> ExpectedEvidence:
    obj = _require_object(value, "expected_evidence")
    _require_exact_keys(obj, {"required_commands"}, "expected_evidence")
    commands = _parse_non_empty_strings(
        obj["required_commands"],
        "expected_evidence.required_commands",
    )
    seen: set[str] = set()
    for command in commands:
        if "\n" in command or "\r" in command or "\0" in command:
            raise ContractError(
                "expected_evidence.required_commands entries must be single-line commands"
            )
        if command in seen:
            raise ContractError(
                f"duplicate required command: {command}"
            )
        seen.add(command)
    return ExpectedEvidence(required_commands=commands)


def _parse_exceptions(value: Any) -> tuple[ApprovedException, ...]:
    if not isinstance(value, list):
        raise ContractError("approved_exceptions must be an array")
    parsed: list[ApprovedException] = []
    seen: set[tuple[str, str]] = set()
    for index, item in enumerate(value):
        label = f"approved_exceptions[{index}]"
        obj = _require_object(item, label)
        _require_exact_keys(obj, {"rule_id", "files", "reason"}, label)
        rule_id = obj["rule_id"]
        reason = obj["reason"]
        if not isinstance(rule_id, str) or not rule_id.strip():
            raise ContractError(f"{label}.rule_id must be a non-empty string")
        if not isinstance(reason, str) or not reason.strip():
            raise ContractError(f"{label}.reason must be a non-empty string")
        raw_files = _parse_non_empty_strings(obj["files"], f"{label}.files")
        files_list: list[str] = []
        for raw_file in raw_files:
            if any(character in raw_file for character in "*?["):
                raise ContractError(f"{label}.files must contain exact paths, not globs")
            try:
                files_list.append(normalize_repo_path(raw_file))
            except PathPolicyError as error:
                raise ContractError(f"{label}.files: {error}") from error
        files = tuple(files_list)
        for pattern in files:
            key = (rule_id.strip(), pattern)
            if key in seen:
                raise ContractError(
                    f"duplicate approved exception for rule {rule_id.strip()} and file {pattern}"
                )
            seen.add(key)
        parsed.append(
            ApprovedException(
                rule_id=rule_id.strip(),
                files=files,
                reason=reason.strip(),
            )
        )
    return tuple(parsed)


def parse_contract(data: dict[str, Any]) -> AssignmentContract:
    obj = _require_object(data, "contract")
    _require_exact_keys(
        obj,
        {
            "schema_version",
            "status",
            "allowed_scope",
            "excluded_scope",
            "expected_evidence",
            "approved_exceptions",
        },
        "contract",
    )
    if obj["schema_version"] != 1:
        raise ContractError("schema_version must be 1")
    if obj["status"] != "frozen":
        raise ContractError("contract status must be frozen")
    return AssignmentContract(
        schema_version=1,
        status="frozen",
        allowed_scope=_parse_scope(obj["allowed_scope"], "allowed_scope"),
        excluded_scope=_parse_scope(obj["excluded_scope"], "excluded_scope"),
        expected_evidence=_parse_expected_evidence(obj["expected_evidence"]),
        approved_exceptions=_parse_exceptions(obj["approved_exceptions"]),
    )


def load_contract(path: Path) -> AssignmentContract:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ContractError(f"could not read contract: {error}") from error
    return parse_contract(data)
