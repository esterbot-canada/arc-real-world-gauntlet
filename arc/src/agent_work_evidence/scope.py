import re
from typing import Any

from agent_work_evidence.models import ScopeEvidence

ISSUE_RE = re.compile(r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+|https?://\S+", re.I)
ACCEPTANCE_RE = re.compile(r"acceptance criteria|expected behavior|steps to reproduce|definition of done|success criteria", re.I)


def extract_scope_evidence(title: str, body: str, branch: str, commits: list[dict[str, Any]]) -> ScopeEvidence:
    signals: list[str] = []
    gaps: list[str] = []

    if title.strip():
        signals.append(f"PR title present: {title.strip()}")
    else:
        gaps.append("No PR title")

    if body.strip():
        signals.append("PR body present")
    else:
        gaps.append("No PR body")

    if ISSUE_RE.search(body or ""):
        signals.append("Linked issue or task reference found in PR body")
    else:
        gaps.append("No linked issue or task reference")

    if ACCEPTANCE_RE.search(body or ""):
        signals.append("Acceptance/success criteria language found in PR body")
    else:
        gaps.append("No explicit acceptance criteria")

    if branch.strip():
        signals.append(f"Branch name available: {branch.strip()}")

    if commits:
        signals.append(f"{len(commits)} commit(s) available for scope inference")
    else:
        gaps.append("No commit metadata available")

    if len(gaps) >= 3:
        status = "unclear"
    elif gaps:
        status = "partial"
    else:
        status = "clear"

    return ScopeEvidence(status=status, signals=signals, gaps=gaps)
