from typing import Any

from agent_work_evidence.models import ReviewerConcern, ReviewerConcernSeverity, ReviewerConcernSource, ReviewerConcernSummary

HIGH_TERMS = {
    "auth",
    "authorization",
    "permission",
    "unauthorized",
    "security",
    "vulnerability",
    "secret",
    "token",
    "credential",
    "regression",
    "breaking",
    "production",
    "data loss",
    "migration",
    "rollback",
    "unsafe",
    "error",
    "fail",
    "failure",
}

MEDIUM_TERMS = {
    "test",
    "coverage",
    "edge case",
    "null",
    "undefined",
    "type",
    "performance",
    "slow",
    "dependency",
    "api",
    "uncertain",
    "assumption",
    "scope",
    "maybe",
    "please verify",
}

BOT_MARKERS = ("[bot]", "bot", "github-actions", "dependabot", "renovate", "codecov", "sonar", "eslint", "vercel")
NON_CONCERN_PHRASES = (
    "no issues found",
    "no issue found",
    "all committers have signed the cla",
    "cla assistant check",
    "cla-bot has been summoned",
    "re-checked this pull request",
    "looks good to me",
    "lgtm",
    "approved",
)

SOURCE_PRIORITY = {"check_annotation": 0, "human_review": 1, "bot_review": 2, "unknown": 3}
SEVERITY_PRIORITY = {"high": 0, "medium": 1, "low": 2}


def _compact(text: str, limit: int = 500) -> str:
    compact = " ".join(str(text or "").strip().split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def _classify_source(raw: dict[str, Any]) -> ReviewerConcernSource:
    raw_source = str(raw.get("source") or "").lower()
    author = str(raw.get("author") or "").lower()
    if raw_source == "check_annotation":
        return "check_annotation"
    if any(marker in author for marker in BOT_MARKERS):
        return "bot_review"
    if raw_source in {"review_comment", "pull_request_review", "issue_comment"}:
        return "human_review"
    return "unknown"


def _is_non_concern(body: str) -> bool:
    lowered = body.lower()
    return any(phrase in lowered for phrase in NON_CONCERN_PHRASES)


def _classify_severity(body: str) -> ReviewerConcernSeverity:
    lowered = body.lower()
    if any(term in lowered for term in HIGH_TERMS):
        return "high"
    if any(term in lowered for term in MEDIUM_TERMS):
        return "medium"
    return "low"


def summarize_reviewer_concerns(raw_items: list[dict[str, Any]], limit: int = 5, gaps: list[str] | None = None) -> ReviewerConcernSummary:
    concerns: list[ReviewerConcern] = []
    for raw in raw_items:
        body = _compact(str(raw.get("body") or ""))
        if not body or _is_non_concern(body):
            continue
        concerns.append(
            ReviewerConcern(
                source=_classify_source(raw),
                severity=_classify_severity(body),
                body=body,
                author=_compact(str(raw.get("author") or ""), limit=80),
                path=_compact(str(raw.get("path") or ""), limit=160),
                url=_compact(str(raw.get("url") or ""), limit=240),
            )
        )

    concerns = sorted(concerns, key=lambda item: (SEVERITY_PRIORITY[item.severity], SOURCE_PRIORITY[item.source], item.author, item.body))
    return ReviewerConcernSummary(
        total=len(concerns),
        high_count=sum(1 for item in concerns if item.severity == "high"),
        medium_count=sum(1 for item in concerns if item.severity == "medium"),
        low_count=sum(1 for item in concerns if item.severity == "low"),
        items=concerns[:limit],
        gaps=gaps or [],
    )
