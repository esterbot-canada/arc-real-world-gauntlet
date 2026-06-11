import json

from agent_work_evidence.models import (
    BoundaryFinding,
    ContractEvaluation,
    EvidenceBrief,
    ScopeEvidence,
)
from agent_work_evidence.trust_brief import (
    TrustReceipt,
    build_trust_brief_document,
    render_trust_brief_json,
    render_trust_brief_markdown,
)


def _brief(verdict: str) -> EvidenceBrief:
    return EvidenceBrief(
        repo="owner/repo",
        pr_number=42,
        title="Agent change",
        scope=ScopeEvidence(
            status="clear",
            signals=["PR body reports pytest -q passed"],
        ),
        confidence="high",
        changed_files=["src/feature.py"],
        reported_validation=["pytest -q passed"],
        contract_evaluation=ContractEvaluation(
            verdict=verdict,
            findings=[
                BoundaryFinding(
                    rule_id="scope",
                    severity="blocked" if verdict == "blocked" else "needs_review",
                    message="Changed file is outside approved scope",
                    evidence=["src/feature.py"],
                )
            ]
            if verdict != "pass"
            else [],
            verified_evidence=["Required command failed with exit code 1"]
            if verdict == "blocked"
            else ["Required command passed: pytest -q"],
        ),
    )


def test_build_trust_brief_preserves_contract_verdict_and_honest_summary():
    expected = {
        "blocked": "ARC found a deterministic assignment-boundary violation.",
        "needs_review": "ARC could not verify every required assignment boundary.",
        "pass": "ARC found no deterministic contract or required-evidence violation.",
    }

    for verdict, summary in expected.items():
        document = build_trust_brief_document(_brief(verdict))

        assert document.verdict == verdict
        assert document.summary == summary
        assert "does not prove code correctness" in document.disclaimer


def test_receipts_are_grouped_by_explicit_provenance():
    document = build_trust_brief_document(
        _brief("blocked"),
        agent_receipts=[
            TrustReceipt(
                provenance="agent_reported",
                label="Model identity",
                value="llama3:latest",
            )
        ],
        operator_receipts=[
            TrustReceipt(
                provenance="operator_supplied",
                label="Pilot context",
                value="Verification was rerun in Docker",
            )
        ],
    )

    markdown = render_trust_brief_markdown(document)

    assert "### ARC Verified" in markdown
    assert "Required command failed with exit code 1" in markdown
    assert "### Agent Reported" in markdown
    assert "pytest -q passed" in markdown
    assert "llama3:latest" in markdown
    assert "### Operator Supplied" in markdown
    assert "Verification was rerun in Docker" in markdown


def test_operator_receipts_cannot_change_arc_verdict():
    document = build_trust_brief_document(
        _brief("blocked"),
        operator_receipts=[
            TrustReceipt(
                provenance="operator_supplied",
                label="Operator opinion",
                value="This should pass",
            )
        ],
    )

    assert document.verdict == "blocked"
    assert "This should pass" not in document.summary


def test_json_is_stable_and_contains_provenance():
    document = build_trust_brief_document(_brief("blocked"))

    first = render_trust_brief_json(document)
    second = render_trust_brief_json(document)
    payload = json.loads(first)

    assert first == second
    assert first.endswith("\n")
    assert payload["verdict"] == "blocked"
    assert {receipt["provenance"] for receipt in payload["receipts"]} == {
        "arc_verified",
        "agent_reported",
    }


def test_markdown_is_publishable_without_operator_rewriting():
    markdown = render_trust_brief_markdown(
        build_trust_brief_document(_brief("blocked"))
    )

    assert markdown.startswith("## ARC Trust Brief: Blocked\n")
    assert "### Focus Questions" in markdown
    assert "<summary>Receipts</summary>" in markdown
    assert "ARC approved the implementation" not in markdown
    assert "safe to merge" not in markdown.lower()
