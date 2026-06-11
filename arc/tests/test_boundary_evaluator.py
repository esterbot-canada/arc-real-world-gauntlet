from pathlib import Path

import pytest

from agent_work_evidence.boundary_evaluator import evaluate_boundaries
from agent_work_evidence.command_receipts import CommandReceipt, CommandResult
from agent_work_evidence.contract import parse_contract
from agent_work_evidence.repository_rules import parse_repository_rules


def _contract(
    *,
    allowed=None,
    excluded=None,
    commands=None,
    exceptions=None,
):
    return parse_contract(
        {
            "schema_version": 1,
            "status": "frozen",
            "allowed_scope": {"files": allowed or ["src/feature/**"]},
            "excluded_scope": {"files": excluded or ["src/auth/**"]},
            "expected_evidence": {"required_commands": commands or []},
            "approved_exceptions": exceptions or [],
        }
    )


def _rules(*rules):
    return parse_repository_rules({"schema_version": 1, "rules": list(rules)})


def _protected_rule():
    return {
        "id": "protected-config",
        "kind": "protected_path",
        "files": ["config/**"],
    }


def _import_rule():
    return {
        "id": "feature-auth-boundary",
        "kind": "import_boundary",
        "from": ["src/feature/**"],
        "deny": ["src/auth/**"],
    }


def test_changed_file_scope_verdicts():
    rules = _rules()

    assert evaluate_boundaries(_contract(), rules, ["src/feature/use.ts"]).verdict == "pass"
    assert evaluate_boundaries(_contract(), rules, ["README.md"]).verdict == "needs_review"
    assert evaluate_boundaries(_contract(), rules, ["src/auth/session.ts"]).verdict == "blocked"


def test_protected_path_exception_is_exact_and_never_passes():
    contract = _contract(
        allowed=["config/**"],
        exceptions=[
            {
                "rule_id": "protected-config",
                "files": ["config/feature.json"],
                "reason": "Approved feature flag.",
            }
        ],
    )
    rules = _rules(_protected_rule())

    approved = evaluate_boundaries(contract, rules, ["config/feature.json"])
    sibling = evaluate_boundaries(contract, rules, ["config/other.json"])

    assert approved.verdict == "needs_review"
    assert "Approved feature flag." in approved.findings[0].evidence[1]
    assert sibling.verdict == "blocked"


def test_unverified_required_commands_cannot_pass():
    result = evaluate_boundaries(
        _contract(commands=["pytest -q"]),
        _rules(),
        ["src/feature/use.ts"],
    )

    assert result.verdict == "needs_review"
    assert result.findings[0].rule_id == "required_commands"


def _receipt(*results):
    return CommandReceipt(
        schema_version=1,
        repository="owner/repo",
        commit_sha="abc123",
        generated_at="2026-06-06T00:00:00Z",
        results=tuple(results),
    )


def test_verified_required_commands_can_pass():
    result = evaluate_boundaries(
        _contract(commands=["pytest -q"]),
        _rules(),
        ["src/feature/use.ts"],
        command_receipt=_receipt(
            CommandResult(
                command="pytest -q",
                exit_code=0,
                duration_ms=120,
                timed_out=False,
                output_sha256="a" * 64,
            )
        ),
    )

    assert result.verdict == "pass"
    assert result.findings == []
    assert "pytest -q" in result.verified_evidence[0]


@pytest.mark.parametrize(
    "command_result,status",
    [
        (
            CommandResult(
                command="pytest -q",
                exit_code=1,
                duration_ms=120,
                timed_out=False,
                output_sha256="b" * 64,
            ),
            "exited 1",
        ),
        (
            CommandResult(
                command="pytest -q",
                exit_code=None,
                duration_ms=1000,
                timed_out=True,
                output_sha256="c" * 64,
            ),
            "timed out",
        ),
    ],
)
def test_failed_or_timed_out_required_command_blocks(command_result, status):
    result = evaluate_boundaries(
        _contract(commands=["pytest -q"]),
        _rules(),
        ["src/feature/use.ts"],
        command_receipt=_receipt(command_result),
    )

    assert result.verdict == "blocked"
    assert status in result.findings[0].evidence[0]


def test_mixed_barrel_import_boundary_verdicts():
    fixture_root = Path(__file__).parent / "fixtures" / "import_bleed"
    contract = _contract(
        allowed=["src/feature/**", "src/shared/**"],
        excluded=["src/auth/**"],
    )
    rules = _rules(_import_rule())

    clean = evaluate_boundaries(
        contract,
        rules,
        ["src/feature/use-clean.ts"],
        fixture_root,
    )
    denied = evaluate_boundaries(
        contract,
        rules,
        ["src/feature/use-secret.ts"],
        fixture_root,
    )
    namespace = evaluate_boundaries(
        contract,
        rules,
        ["src/feature/use-namespace.ts"],
        fixture_root,
    )

    assert clean.verdict == "pass"
    assert clean.findings == []
    assert denied.verdict == "blocked"
    assert denied.findings[0].rule_id == "feature-auth-boundary"
    assert "src/auth/secret.ts" in denied.findings[0].message
    assert namespace.verdict == "needs_review"
    assert "Namespace import" in namespace.findings[0].evidence[0]


def test_import_boundary_without_checkout_needs_review_and_irrelevant_file_skips():
    contract = _contract()
    rules = _rules(_import_rule())

    missing_checkout = evaluate_boundaries(
        contract,
        rules,
        ["src/feature/use.ts"],
    )
    irrelevant = evaluate_boundaries(
        _contract(allowed=["docs/**"]),
        rules,
        ["docs/readme.md"],
    )

    assert missing_checkout.verdict == "needs_review"
    assert "local checkout" in missing_checkout.findings[0].message
    assert irrelevant.verdict == "pass"
