import pytest

from agent_work_evidence.contract import parse_contract
from agent_work_evidence.repository_rules import (
    ImportBoundaryRule,
    ProtectedPathRule,
    RepositoryRulesError,
    parse_repository_rules,
    validate_contract_exceptions,
)


def _valid_rules():
    return {
        "schema_version": 1,
        "rules": [
            {
                "id": "protected-shared-config",
                "kind": "protected_path",
                "files": ["config/**", "src/auth/**"],
            },
            {
                "id": "feature-auth-boundary",
                "kind": "import_boundary",
                "from": ["src/feature/**"],
                "deny": ["src/auth/**"],
            },
        ],
    }


def _contract(exception_rule_id="protected-shared-config"):
    return parse_contract(
        {
            "schema_version": 1,
            "status": "frozen",
            "allowed_scope": {"files": ["src/feature/**"]},
            "excluded_scope": {"files": ["src/auth/**"]},
            "expected_evidence": {"required_commands": []},
            "approved_exceptions": [
                {
                    "rule_id": exception_rule_id,
                    "files": ["config/feature.json"],
                    "reason": "Approved.",
                }
            ],
        }
    )


def test_parse_both_supported_rule_kinds():
    rules = parse_repository_rules(_valid_rules())

    assert isinstance(rules.rules[0], ProtectedPathRule)
    assert rules.rules[0].files == ("config/**", "src/auth/**")
    assert isinstance(rules.rules[1], ImportBoundaryRule)
    assert rules.rules[1].from_patterns == ("src/feature/**",)
    assert rules.rules[1].deny == ("src/auth/**",)


@pytest.mark.parametrize(
    ("mutate", "match"),
    [
        (lambda data: data["rules"].append(dict(data["rules"][0])), "duplicate rule id"),
        (lambda data: data["rules"][0].update(extra=True), "fields must be exactly"),
        (lambda data: data["rules"][0].update(kind="regex"), "unsupported"),
        (lambda data: data["rules"][0].update(files=[]), "non-empty array"),
        (lambda data: data["rules"][0].update(files=["**"]), "entire repository"),
        (lambda data: data["rules"][1].update(deny=["../auth/**"]), "traversal"),
    ],
)
def test_reject_invalid_repository_rules(mutate, match):
    data = _valid_rules()
    mutate(data)
    with pytest.raises(RepositoryRulesError, match=match):
        parse_repository_rules(data)


def test_validate_contract_exceptions_rejects_unknown_rule():
    rules = parse_repository_rules(_valid_rules())
    with pytest.raises(RepositoryRulesError, match="unknown rule"):
        validate_contract_exceptions(_contract("missing"), rules)


def test_validate_contract_exceptions_rejects_import_boundary_rule():
    rules = parse_repository_rules(_valid_rules())
    with pytest.raises(RepositoryRulesError, match="protected_path"):
        validate_contract_exceptions(_contract("feature-auth-boundary"), rules)
