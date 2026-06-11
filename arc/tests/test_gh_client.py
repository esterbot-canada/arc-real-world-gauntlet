import json

from agent_work_evidence.gh_client import parse_issue_comments, parse_pr_review_comments, parse_pr_reviews, parse_pr_view


def test_parse_pr_view_extracts_scope_inputs():
    raw = json.dumps({
        "title": "Fix login redirect",
        "body": "Closes #42\n\nAdds missing redirect after login.",
        "headRefName": "agent/fix-login-redirect",
        "headRefOid": "abc123",
        "author": {"login": "coding-agent"},
    })
    pr = parse_pr_view("owner/repo", 7, raw)
    assert pr["title"] == "Fix login redirect"
    assert pr["body"].startswith("Closes #42")
    assert pr["branch"] == "agent/fix-login-redirect"
    assert pr["head_sha"] == "abc123"


def test_parse_pr_review_comments_extracts_concern_fields():
    raw = json.dumps([
        {
            "body": "Please verify this auth edge case.",
            "path": "src/auth/session.ts",
            "html_url": "https://github.com/owner/repo/pull/7#discussion_r1",
            "user": {"login": "maintainer"},
        }
    ])

    comments = parse_pr_review_comments(raw)

    assert comments == [
        {
            "source": "review_comment",
            "author": "maintainer",
            "body": "Please verify this auth edge case.",
            "path": "src/auth/session.ts",
            "url": "https://github.com/owner/repo/pull/7#discussion_r1",
        }
    ]


def test_parse_issue_comments_extracts_concern_fields():
    raw = json.dumps([
        {
            "body": "Coverage dropped on this patch.",
            "html_url": "https://github.com/owner/repo/pull/7#issuecomment-1",
            "user": {"login": "codecov[bot]"},
        }
    ])

    comments = parse_issue_comments(raw)

    assert comments[0]["source"] == "issue_comment"
    assert comments[0]["author"] == "codecov[bot]"
    assert comments[0]["body"] == "Coverage dropped on this patch."


def test_parse_pr_reviews_extracts_submitted_review_body():
    raw = json.dumps([
        {
            "body": "Requesting changes because migration rollback is missing.",
            "state": "CHANGES_REQUESTED",
            "html_url": "https://github.com/owner/repo/pull/7#pullrequestreview-1",
            "user": {"login": "reviewer"},
        },
        {"body": "", "state": "APPROVED", "user": {"login": "reviewer-2"}},
    ])

    reviews = parse_pr_reviews(raw)

    assert reviews == [
        {
            "source": "pull_request_review",
            "author": "reviewer",
            "body": "Requesting changes because migration rollback is missing.",
            "path": "",
            "url": "https://github.com/owner/repo/pull/7#pullrequestreview-1",
            "state": "CHANGES_REQUESTED",
        }
    ]
