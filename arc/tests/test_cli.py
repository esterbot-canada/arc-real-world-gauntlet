import json

from typer.testing import CliRunner

from agent_work_evidence.cli import app
from agent_work_evidence.command_receipts import CommandReceipt, CommandResult
from agent_work_evidence.models import EvidenceBrief, ScopeEvidence


def test_cli_help_mentions_pr_command():
    runner = CliRunner()
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "pr" in result.output


def test_evidence_brief_has_scope_and_confidence():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=123,
        title="Improve login flow",
        scope=ScopeEvidence(status="unclear", signals=[], gaps=["No linked issue"]),
        confidence="low",
    )
    assert brief.scope.status == "unclear"
    assert brief.confidence == "low"


def test_pr_command_writes_evidence_brief(tmp_path, monkeypatch):
    from agent_work_evidence import cli

    monkeypatch.setattr(cli, "fetch_pr_view", lambda repo, number: {
        "repo": repo,
        "number": number,
        "title": "Fix login redirect",
        "body": "- Added login redirect handling",
        "branch": "agent/fix-login",
        "head_sha": "abc123",
        "author": "coding-agent",
    })
    monkeypatch.setattr(cli, "fetch_pr_files", lambda repo, number: [{"path": "src/auth/session.ts", "additions": 10, "deletions": 2}])
    monkeypatch.setattr(cli, "fetch_pr_commits", lambda repo, number: [])
    monkeypatch.setattr(cli, "fetch_pr_diff", lambda repo, number: "diff --git a/src/auth/session.ts b/src/auth/session.ts")
    monkeypatch.setattr(cli, "fetch_pr_checks", lambda repo, number: [{"name": "test", "conclusion": "success", "status": "COMPLETED"}])
    monkeypatch.setattr(cli, "fetch_pr_review_comments", lambda repo, number: [{"source": "review_comment", "author": "maintainer", "body": "Please verify auth edge case", "path": "src/auth/session.ts"}])
    monkeypatch.setattr(cli, "fetch_pr_issue_comments", lambda repo, number: [])
    monkeypatch.setattr(cli, "fetch_pr_reviews", lambda repo, number: [])

    out = tmp_path / "brief.md"
    trust_out = tmp_path / "trust-brief.md"
    trust_json_out = tmp_path / "trust-brief.json"
    operator_addendum_out = tmp_path / "operator-addendum.md"
    runner = CliRunner()
    result = runner.invoke(
        app,
        [
            "pr",
            "owner/repo",
            "123",
            "--out",
            str(out),
            "--trust-out",
            str(trust_out),
            "--trust-json-out",
            str(trust_json_out),
            "--operator-addendum-out",
            str(operator_addendum_out),
        ],
    )

    assert result.exit_code == 0
    text = out.read_text(encoding="utf-8")
    assert "# PR Review Brief: owner/repo#123" in text
    assert "## What this PR does" in text
    assert "## Reviewer Action" in text
    assert "## What to do next" in text
    assert "## Inspect First" in text
    assert "## Evidence Summary" in text
    assert "## Reviewer/Bot Comments to Triage" in text
    assert "Please verify auth edge case" in text
    assert "## ARC Trust Brief: Needs Review" in text
    trust_text = trust_out.read_text(encoding="utf-8")
    trust_payload = json.loads(trust_json_out.read_text(encoding="utf-8"))
    addendum = operator_addendum_out.read_text(encoding="utf-8")
    assert trust_text.startswith("## ARC Trust Brief: Needs Review")
    assert trust_payload["verdict"] == "needs_review"
    assert trust_payload["repository"] == "owner/repo"
    assert "Human-authored context" in addendum
    assert "cannot change the ARC verdict" in addendum
    assert "Human-authored context" not in trust_text


def test_pr_command_requires_contract_and_rules_together():
    runner = CliRunner()

    result = runner.invoke(app, ["pr", "owner/repo", "123", "--contract", "contract.json"])

    assert result.exit_code != 0
    assert "--contract and --rules must be supplied together" in result.output


def test_receipt_out_requires_explicit_command_verification():
    runner = CliRunner()

    result = runner.invoke(
        app,
        ["pr", "owner/repo", "123", "--receipt-out", "receipt.json"],
    )

    assert result.exit_code != 0
    assert "--receipt-out requires --verify-required-commands" in result.output


def test_contract_evaluation_blocks_malformed_config(tmp_path):
    from agent_work_evidence.cli import _contract_evaluation

    contract = tmp_path / "contract.json"
    rules = tmp_path / "rules.json"
    contract.write_text('{"schema_version": 1, "status": "draft"}', encoding="utf-8")
    rules.write_text('{"schema_version": 1, "rules": []}', encoding="utf-8")

    result = _contract_evaluation(contract, rules, ["src/feature/use.ts"], None)

    assert result.verdict == "blocked"
    assert result.findings[0].rule_id == "configuration"


def test_contract_evaluation_trusts_only_same_run_command_results(tmp_path, monkeypatch):
    from agent_work_evidence import cli

    contract = tmp_path / "contract.json"
    rules = tmp_path / "rules.json"
    receipt_out = tmp_path / "receipt.json"
    contract.write_text(
        """
        {
          "schema_version": 1,
          "status": "frozen",
          "allowed_scope": {"files": ["src/**"]},
          "excluded_scope": {"files": ["config/**"]},
          "expected_evidence": {"required_commands": ["pytest -q"]},
          "approved_exceptions": []
        }
        """,
        encoding="utf-8",
    )
    rules.write_text('{"schema_version": 1, "rules": []}', encoding="utf-8")
    monkeypatch.setattr(
        cli,
        "execute_required_commands",
        lambda **kwargs: CommandReceipt(
            schema_version=1,
            repository="owner/repo",
            commit_sha="abc123",
            generated_at="2026-06-06T00:00:00Z",
            results=(
                CommandResult(
                    command="pytest -q",
                    exit_code=0,
                    duration_ms=100,
                    timed_out=False,
                    output_sha256="a" * 64,
                ),
            ),
        ),
    )

    result = cli._contract_evaluation(
        contract,
        rules,
        ["src/feature.py"],
        tmp_path,
        repository="owner/repo",
        reviewed_sha="abc123",
        verify_required_commands=True,
        receipt_out=receipt_out,
    )

    assert result.verdict == "pass"
    assert result.verified_evidence
    assert receipt_out.exists()


def test_summarize_checks_counts_full_rollup_and_failed_examples():
    from agent_work_evidence.cli import _summarize_checks

    aggregate, summary, failed_examples = _summarize_checks([
        {"name": "unit", "workflowName": "CI", "conclusion": "SUCCESS", "status": "COMPLETED"},
        {"name": "backend", "workflowName": "CI", "conclusion": "FAILURE", "status": "COMPLETED"},
        {"name": "backend", "workflowName": "CI", "conclusion": "FAILURE", "status": "COMPLETED"},
        {"name": "integration", "workflowName": "CI", "conclusion": "ERROR", "status": "COMPLETED"},
        {"name": "deploy", "workflowName": "CI", "conclusion": "CANCELLED", "status": "COMPLETED"},
        {"context": "coverage", "state": "PENDING"},
        {"name": "docs", "workflowName": "CI", "conclusion": "SKIPPED", "status": "COMPLETED"},
    ])

    assert aggregate == "failure"
    assert "failure 1" in summary[0]
    assert "error 1" in summary[0]
    assert "cancelled 1" in summary[0]
    assert "pending 1" in summary[0]
    assert "skipped 1" in summary[0]
    assert failed_examples == ["CI / backend: failure", "CI / integration: error", "CI / deploy: cancelled"]


def test_summarize_checks_all_success_does_not_fail():
    from agent_work_evidence.cli import _summarize_checks

    aggregate, summary, failed_examples = _summarize_checks([
        {"name": "unit", "workflowName": "CI", "conclusion": "SUCCESS"},
        {"context": "license/cla", "state": "SUCCESS"},
    ])

    assert aggregate == "success"
    assert failed_examples == []
    assert "success 2" in summary[0]
