from agent_work_evidence.reviewer_concerns import summarize_reviewer_concerns


def test_summarize_reviewer_concerns_classifies_human_high_security_concern():
    summary = summarize_reviewer_concerns([
        {
            "source": "review_comment",
            "author": "maintainer",
            "body": "This may allow unauthorized access; please verify auth permissions before merge.",
            "path": "src/auth/session.ts",
            "url": "https://github.com/owner/repo/pull/1#discussion_r1",
        }
    ])

    assert summary.total == 1
    assert summary.high_count == 1
    assert summary.items[0].source == "human_review"
    assert summary.items[0].severity == "high"
    assert summary.items[0].path == "src/auth/session.ts"
    assert "unauthorized access" in summary.items[0].body


def test_summarize_reviewer_concerns_classifies_bot_medium_test_concern():
    summary = summarize_reviewer_concerns([
        {
            "source": "issue_comment",
            "author": "github-actions[bot]",
            "body": "The test coverage report changed. Please add an edge case test for null input.",
            "url": "https://github.com/owner/repo/pull/1#issuecomment-1",
        }
    ])

    assert summary.total == 1
    assert summary.medium_count == 1
    assert summary.items[0].source == "bot_review"
    assert summary.items[0].severity == "medium"


def test_summarize_reviewer_concerns_classifies_check_annotations():
    summary = summarize_reviewer_concerns([
        {
            "source": "check_annotation",
            "author": "eslint",
            "body": "Error: unsafe optional chaining can throw.",
            "path": "src/app.ts",
        }
    ])

    assert summary.items[0].source == "check_annotation"
    assert summary.items[0].severity == "high"


def test_summarize_reviewer_concerns_filters_positive_bot_noise():
    summary = summarize_reviewer_concerns([
        {"source": "issue_comment", "author": "cubic-dev-ai[bot]", "body": "No issues found across 14 files."},
        {"source": "issue_comment", "author": "CLAassistant", "body": "All committers have signed the CLA."},
        {"source": "issue_comment", "author": "reviewer", "body": "Could this regression break existing sessions?"},
    ])

    assert summary.total == 1
    assert summary.items[0].author == "reviewer"
    assert summary.items[0].severity == "high"


def test_summarize_reviewer_concerns_filters_empty_and_limits_items():
    raw = [{"source": "issue_comment", "author": "a", "body": ""}]
    raw.extend(
        {
            "source": "issue_comment",
            "author": f"reviewer-{index}",
            "body": f"Concern {index}: maybe performance issue here",
        }
        for index in range(8)
    )

    summary = summarize_reviewer_concerns(raw, limit=3)

    assert summary.total == 8
    assert len(summary.items) == 3
    assert summary.medium_count == 8
