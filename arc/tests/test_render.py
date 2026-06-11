from agent_work_evidence.models import (
    BoundaryFinding,
    Claim,
    ContractEvaluation,
    EvidenceBrief,
    ReviewerConcern,
    ReviewerConcernSummary,
    RiskSignal,
    ScopeEvidence,
)
from agent_work_evidence.render import render_markdown


def _top(md: str) -> str:
    return md.split("<details>", 1)[0]


def _details(md: str) -> str:
    return md.split("<details>", 1)[1]


def test_render_contract_verdicts_are_primary_and_honest():
    expected = {
        "blocked": (
            "Blocked",
            "ARC found a deterministic assignment-boundary violation.",
        ),
        "needs_review": (
            "Needs Review",
            "ARC could not verify every required assignment boundary.",
        ),
        "pass": (
            "Pass",
            "ARC found no deterministic contract or required-evidence violation.",
        ),
    }
    for verdict, (heading, reason) in expected.items():
        brief = EvidenceBrief(
            repo="owner/repo",
            pr_number=1,
            title="Change feature",
            scope=ScopeEvidence(status="clear"),
            confidence="high",
            contract_evaluation=ContractEvaluation(verdict=verdict),
        )

        md = render_markdown(brief)

        assert f"## ARC Trust Brief: {heading}" in md
        assert reason in md
        assert md.index("## ARC Trust Brief") < md.index("## What this PR does")
        assert "ARC approved the implementation" not in md
        assert "ready to merge" not in md.lower()


def test_render_includes_arc_verified_command_evidence():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=1,
        title="Change feature",
        scope=ScopeEvidence(status="clear"),
        confidence="high",
        contract_evaluation=ContractEvaluation(
            verdict="pass",
            verified_evidence=[
                "Required command passed on abc123: pytest -q "
                "(120ms, output " + ("a" * 64) + ")"
            ],
        ),
    )

    md = render_markdown(brief)

    assert "### ARC-Verified Evidence" in md
    assert "pytest -q" in md


def test_render_denied_import_includes_resolution_chain_without_clean_false_positive():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=2,
        title="Use shared export",
        scope=ScopeEvidence(status="clear"),
        confidence="high",
        contract_evaluation=ContractEvaluation(
            verdict="blocked",
            findings=[
                BoundaryFinding(
                    rule_id="feature-auth-boundary",
                    severity="blocked",
                    message="src/feature/use-secret.ts imports secretValue from denied origin src/auth/secret.ts",
                    evidence=[
                        "src/feature/use-secret.ts imports secretValue from ../shared",
                        "secretValue resolves to src/auth/secret.ts",
                        "rule feature-auth-boundary denies src/auth/**",
                    ],
                )
            ],
        ),
    )

    md = render_markdown(brief)

    assert "src/feature/use-secret.ts imports secretValue from ../shared" in md
    assert "secretValue resolves to src/auth/secret.ts" in md
    assert "rule feature-auth-boundary denies src/auth/**" in md
    assert "cleanValue" not in md


def test_render_markdown_names_pr_review_brief_not_code_review():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=123,
        title="Fix login redirect",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=["No acceptance criteria"]),
        confidence="medium",
        risk="medium",
        risk_signals=[RiskSignal(name="no_tests_changed", level="medium", evidence=["No tests changed"], human_question="Was this tested?")],
    )

    md = render_markdown(brief)

    assert "# PR Review Brief: owner/repo#123" in md
    assert "Code Review" not in md
    sections = [
        "## What this PR does",
        "## Reviewer Action",
        "## What to do next",
        "## Inspect First",
        "## Evidence Summary",
        "## Reviewer/Bot Comments to Triage",
        "## Missing Context",
        "<details>",
    ]
    for section in sections:
        assert section in md
    for before, after in zip(sections, sections[1:]):
        assert md.index(before) < md.index(after)


def test_render_top_is_plain_english_and_avoids_academic_wording():
    brief = EvidenceBrief(
        repo="n8n-io/n8n",
        pr_number=30589,
        title="test(core): Add Playwright LangSmith eval scaffolding (no-changelog)",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="medium",
        risk="high",
        changed_files=[
            "packages/testing/playwright/fixtures/langsmith.ts",
            "packages/testing/playwright/reporters/langsmith-eval.ts",
            "packages/testing/playwright/package.json",
            "pnpm-lock.yaml",
        ],
        risk_signals=[
            RiskSignal(
                name="supply_chain_security_change",
                level="medium",
                evidence=["packages/testing/playwright/package.json", "pnpm-lock.yaml"],
                human_question="Do dependency changes preserve trusted sources?",
            ),
        ],
    )

    top = _top(render_markdown(brief))

    assert "Appears to be about: Add Playwright LangSmith eval scaffolding" in top
    assert "test/eval files" in top
    assert "dependency/package files" in top
    assert "Falsify this" not in top


def test_render_groups_failed_ci_for_human_readability():
    brief = EvidenceBrief(
        repo="n8n-io/n8n",
        pr_number=30589,
        title="test(core): Add Playwright LangSmith eval scaffolding (no-changelog)",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="medium",
        risk="high",
        checks_summary=[
            "CI/check aggregate: success 41, failure 2, skipped 10",
            "Failed/error/cancelled checks needing attention: CI: PR Quality Checks / Ownership Acknowledgement: failure; CI: PR Quality Checks / Required PR Quality Checks: failure",
        ],
        risk_signals=[
            RiskSignal(
                name="failing_ci",
                level="high",
                evidence=[
                    "CI: PR Quality Checks / Ownership Acknowledgement: failure",
                    "CI: PR Quality Checks / Required PR Quality Checks: failure",
                ],
                human_question="Which failed, errored, or cancelled checks need attention before review?",
            )
        ],
    )

    top = _top(render_markdown(brief))

    assert "BLOCK BEFORE MERGE" in top
    assert "CI: PR Quality Checks" in top
    assert "Ownership Acknowledgement — failed" in top
    assert "Required PR Quality Checks — failed" in top
    assert "Failed/error/cancelled checks needing attention:" not in top
    assert "; CI: PR Quality Checks" not in top


def test_render_preserves_workflow_prefix_from_failed_check_summary_without_signal_evidence():
    brief = EvidenceBrief(
        repo="n8n-io/n8n",
        pr_number=30589,
        title="test(core): Add Playwright LangSmith eval scaffolding",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="medium",
        risk="high",
        checks_summary=[
            "CI/check aggregate: success 41, failure 1",
            "Failed/error/cancelled checks needing attention: CI: PR Quality Checks / Ownership Acknowledgement: failure",
        ],
        risk_signals=[
            RiskSignal(
                name="failing_ci",
                level="high",
                evidence=[],
                human_question="Which failed, errored, or cancelled checks need attention before review?",
            )
        ],
    )

    top = _top(render_markdown(brief))

    assert "CI: PR Quality Checks" in top
    assert "Ownership Acknowledgement — failed" in top


def test_render_elevates_failed_ci_over_lower_priority_signals():
    brief = EvidenceBrief(
        repo="lobu-ai/lobu",
        pr_number=827,
        title="Stabilize app",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="medium",
        risk="high",
        checks_summary=[
            "CI/check aggregate: failure (success 10, failure 2)",
            "Failed/error checks needing attention: CI / integration: failure; PR Validation / build-test: failure",
        ],
        risk_signals=[
            RiskSignal(name="supply_chain_security_change", level="medium", evidence=["package.json"], human_question="Do dependency changes preserve trusted sources?"),
            RiskSignal(name="failing_ci", level="high", evidence=["CI / integration: failure", "PR Validation / build-test: failure"], human_question="Which failed checks need attention?"),
        ],
    )

    top = _top(render_markdown(brief))

    assert "BLOCK BEFORE MERGE" in top
    assert "CI/checks are failing or cancelled" in top
    assert top.index("Failed PR quality checks") < top.index("Dependency/supply-chain changed")
    assert "integration — failed" in top
    assert "build-test — failed" in top


def test_render_no_tests_changed_mentions_reported_validation_context():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=5005,
        title="Track search result clicks",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="medium",
        risk="medium",
        changed_files=["src/search-analytics.ts"],
        reported_validation=["Use PR preview and verify search click analytics appear"],
        risk_signals=[
            RiskSignal(
                name="no_tests_changed",
                level="medium",
                evidence=["No changed file looks like a test file"],
                human_question="Is there other evidence that the changed behavior was tested?",
            ),
        ],
    )

    top = _top(render_markdown(brief))

    assert "NEEDS DEEP REVIEW" in top
    assert "No test files changed; reported/manual validation exists but still needs verification" in top
    assert "No test files changed, but reported validation exists" in top
    assert "reported/manual validation covers the changed behavior" in top
    assert "Author reported 1 validation step(s)" in top


def test_render_keeps_higher_priority_decision_reason_when_no_tests_have_reported_validation():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=527,
        title="Add installer config",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="medium",
        risk="medium",
        changed_files=["config/installers.json"],
        reported_validation=["cargo test --all"],
        risk_signals=[
            RiskSignal(name="sensitive_path", level="medium", evidence=["config/installers.json"], human_question="Do these sensitive files match the intended scope?"),
            RiskSignal(name="no_tests_changed", level="medium", evidence=["No changed file looks like a test file"], human_question="Is there other evidence that the changed behavior was tested?"),
        ],
    )

    top = _top(render_markdown(brief))

    assert "Do these sensitive files match the intended scope?" in top
    assert "No test files changed; reported/manual validation exists but still needs verification" not in top
    assert top.index("Sensitive path changed") < top.index("No test files changed, but reported validation exists")


def test_render_surfaces_open_reviewer_concerns_without_raw_bot_dump():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=7,
        title="Change auth flow",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="medium",
        risk="medium",
        reviewer_concerns=ReviewerConcernSummary(
            total=2,
            high_count=1,
            medium_count=1,
            items=[
                ReviewerConcern(source="human_review", severity="high", author="maintainer", body="This may allow unauthorized access; please verify permissions.", path="src/auth/session.ts"),
                ReviewerConcern(source="bot_review", severity="medium", author="codecov[bot]", body="## [Codecov](https://example.com) Coverage dropped for this patch."),
            ],
        ),
    )

    top = _top(render_markdown(brief))

    assert top.index("## Reviewer/Bot Comments to Triage") > top.index("## Evidence Summary")
    assert "1 high, 1 medium" in top
    assert "HIGH / human_review" in top
    assert "unauthorized access" in top
    assert "src/auth/session.ts" in top


def test_render_details_are_complete_raw_receipts_without_omitted_lines():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=999,
        title="feat: many changes",
        scope=ScopeEvidence(status="partial", signals=[f"signal-{i}" for i in range(7)], gaps=[f"gap-{i}" for i in range(7)]),
        confidence="medium",
        risk="medium",
        changed_files=[f"src/file-{i}.ts" for i in range(12)],
        checks_summary=[f"CI / check-{i}: success" for i in range(8)],
        claims=[Claim(text="Adds behavior", status="unverified", evidence=[f"evidence-{i}" for i in range(5)])],
        risk_signals=[RiskSignal(name="large_diff", level="medium", evidence=[f"risk-evidence-{i}" for i in range(5)], human_question="Can this be reviewed effectively?")],
        reviewer_concerns=ReviewerConcernSummary(total=1, low_count=1, items=[ReviewerConcern(source="bot_review", severity="low", body="Coverage note")]),
    )

    details = _details(render_markdown(brief))

    assert "Raw evidence receipts" in details
    assert "more omitted" not in details
    assert "..." not in details
    assert "src/file-11.ts" in details
    assert "Evidence: evidence-4" in details
    assert "risk-evidence-4" in details
    assert "signal-6" in details
    assert "gap-6" in details


def test_render_unclear_intent_fallback_is_honest():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=44,
        title="",
        scope=ScopeEvidence(status="unclear", signals=[], gaps=["No PR body", "No PR title"]),
        confidence="low",
        risk="medium",
    )

    top = _top(render_markdown(brief))

    assert "Could not confidently summarize intent" in top
    assert "NEEDS DEEP REVIEW" in top


def test_render_blast_radius_evidence_survives_in_summary_and_receipts():
    brief = EvidenceBrief(
        repo="n8n-io/n8n",
        pr_number=27309,
        title="Add mTLS to OpenAI credentials",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="medium",
        risk="medium",
        changed_files=["packages/nodes-base/credentials/OpenAiApi.credentials.ts"],
        risk_signals=[
            RiskSignal(name="credential_tls_security_change", level="medium", evidence=["packages/nodes-base/credentials/OpenAiApi.credentials.ts", "agentOptions"], human_question="Are TLS options safely wired?"),
            RiskSignal(name="no_tests_changed", level="medium", evidence=["No changed file looks like a test file"], human_question="Is there other evidence that this was tested?"),
        ],
    )

    md = render_markdown(brief)
    top = _top(md)
    details = _details(md)

    assert "Credential/TLS security changed" in top
    assert "auth/security-sensitive files" in top
    assert "No tests changed" in top
    assert "credential_tls_security_change" in details
    assert "No changed file looks like a test file" in details


def test_high_reviewer_build_concern_blocks_safe_to_skim():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=88,
        title="Suppress duplicate logs",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="medium",
        risk="low",
        changed_files=["src/commands/init.ts", "test/unit/init.test.ts"],
        checks_summary=["CI/check aggregate: success 34, pending 1", "Pending checks: E2E / smoke: pending"],
        reviewer_concerns=ReviewerConcernSummary(
            total=1,
            high_count=1,
            items=[ReviewerConcern(source="human_review", severity="high", author="maintainer", body="fix build error before merge")],
        ),
    )

    top = _top(render_markdown(brief))

    assert "BLOCK BEFORE MERGE" in top
    assert "reviewer concern mentions build/test/failure" in top
    assert "Resolve or triage the high-severity reviewer/bot comment before review or merge." in top
    assert "SAFE TO SKIM" not in top


def test_low_risk_verdict_does_not_claim_pr_is_safe():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=89,
        title="docs: fix typo",
        scope=ScopeEvidence(status="clear", signals=["PR body present"], gaps=[]),
        confidence="high",
        risk="low",
        changed_files=["docs/readme.md"],
        risk_signals=[],
    )

    top = _top(render_markdown(brief))

    assert "LOW-RISK SKIM" in top
    assert "SAFE TO SKIM" not in top


def test_missing_changed_files_blocks_review_and_suppresses_no_tests_advice():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=104,
        title="Fix date formatting",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="low",
        risk="medium",
        changed_files=[],
        evidence_gaps=["No changed files were returned by GitHub", "No diff was returned by GitHub"],
        risk_signals=[RiskSignal(name="no_tests_changed", level="medium", evidence=["No changed file looks like a test file"], human_question="Is there other evidence that the changed behavior was tested?")],
    )

    top = _top(render_markdown(brief))

    assert "BLOCK BEFORE REVIEW" in top
    assert "No changed files/diff evidence is available" in top
    assert "Refetch PR files/diff before reviewing" in top
    assert "No tests changed" not in top


def test_pending_ci_drives_next_action_for_medium_risk():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=2353,
        title="Update dependency",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="medium",
        risk="medium",
        changed_files=["package.json", "package-lock.json"],
        checks_summary=["CI/check aggregate: success 2, pending 5", "Pending checks: CI / unit: pending"],
        risk_signals=[RiskSignal(name="supply_chain_security_change", level="medium", evidence=["package.json", "package-lock.json"], human_question="Do dependency changes preserve trusted sources?")],
    )

    top = _top(render_markdown(brief))

    assert "NEEDS DEEP REVIEW" in top
    assert "Wait for pending CI/checks" in top


def test_api_and_native_risk_labels_render_plainly():
    brief = EvidenceBrief(
        repo="owner/repo",
        pr_number=9,
        title="Add API rate limiting",
        scope=ScopeEvidence(status="partial", signals=["PR body present"], gaps=[]),
        confidence="medium",
        risk="medium",
        changed_files=["Program.cs", "src/render/gl/opengl.cpp"],
        risk_signals=[
            RiskSignal(name="api_network_surface_change", level="medium", evidence=["Program.cs", "app.MapGet(\"/contacts\")"], human_question="Are API routes, network calls, webhooks, rate limits, and request/response boundaries safely wired?"),
            RiskSignal(name="native_runtime_surface_change", level="medium", evidence=["src/render/gl/opengl.cpp", "SK_GL_SwapBuffers"], human_question="Could this native/runtime change cause platform-specific crashes, rendering regressions, memory issues, or startup/bootstrap failures?"),
        ],
    )

    top = _top(render_markdown(brief))

    assert "API/network surface changed" in top
    assert "Native/runtime surface changed" in top
