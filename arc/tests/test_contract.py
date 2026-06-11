import pytest

from agent_work_evidence.contract import ContractError, parse_contract


def _valid_contract():
    return {
        "schema_version": 1,
        "status": "frozen",
        "allowed_scope": {"files": ["src/feature/**", "src/shared/index.ts"]},
        "excluded_scope": {"files": ["src/auth/**", "config/**"]},
        "expected_evidence": {"required_commands": ["pytest -q"]},
        "approved_exceptions": [
            {
                "rule_id": "protected-shared-config",
                "files": ["config/feature.json"],
                "reason": "Approved feature flag.",
            }
        ],
    }


def test_parse_valid_frozen_contract():
    contract = parse_contract(_valid_contract())

    assert contract.status == "frozen"
    assert contract.allowed_scope.files == ("src/feature/**", "src/shared/index.ts")
    assert contract.excluded_scope.files == ("src/auth/**", "config/**")
    assert contract.expected_evidence.required_commands == ("pytest -q",)
    assert contract.approved_exceptions[0].reason == "Approved feature flag."


@pytest.mark.parametrize(
    ("mutate", "match"),
    [
        (lambda data: data.update(status="draft"), "frozen"),
        (lambda data: data.update(extra=True), "unknown fields"),
        (lambda data: data["allowed_scope"].update(extra=True), "invalid fields"),
        (lambda data: data["allowed_scope"].update(files=["**"]), "entire repository"),
        (lambda data: data["excluded_scope"].update(files=["/etc/**"]), "repository-relative"),
        (lambda data: data["excluded_scope"].update(files=["src/**/../auth/**"]), "traversal"),
        (
            lambda data: data["approved_exceptions"].append(
                {
                    "rule_id": "protected-shared-config",
                    "files": ["config/feature.json"],
                    "reason": "Duplicate.",
                }
            ),
            "duplicate approved exception",
        ),
        (
            lambda data: data["approved_exceptions"][0].update(reason=""),
            "non-empty string",
        ),
        (
            lambda data: data["approved_exceptions"][0].update(files=["config/**"]),
            "exact paths",
        ),
        (
            lambda data: data["expected_evidence"].update(
                required_commands=["pytest -q", "pytest -q"]
            ),
            "duplicate required command",
        ),
        (
            lambda data: data["expected_evidence"].update(
                required_commands=["pytest -q\nrm -rf build"]
            ),
            "single-line commands",
        ),
    ],
)
def test_parse_contract_rejects_hostile_schema(mutate, match):
    data = _valid_contract()
    mutate(data)
    with pytest.raises(ContractError, match=match):
        parse_contract(data)
