import re

CODE_FENCE_RE = re.compile(r"^[-+].*```")
INLINE_CODE_CHANGE_RE = re.compile(r"^[-+].*`[^`]+`")
IDENTIFIER_LINE_RE = re.compile(r"^[-+].*\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\([^)]*\)|\?:|:|=>|->)")
TYPO_FIX_CHANGELOG_RE = re.compile(r"^[-+].*(?:typo|fix(?:ed)?|bug|change|breaking|release|changelog).*(?:=>|->|`[^`]+`)", re.I)


def changed_lines(diff: str) -> list[str]:
    return [line for line in diff.splitlines() if line.startswith(("+", "-")) and not line.startswith(("+++", "---"))]


def changed_pairs(diff: str) -> list[str]:
    pairs: list[str] = []
    pending_removed: str | None = None
    for line in changed_lines(diff):
        if line.startswith("-"):
            pending_removed = line[1:].strip()
            continue
        if line.startswith("+"):
            added = line[1:].strip()
            if pending_removed:
                pairs.append(f"{pending_removed} -> {added}"[:220])
                pending_removed = None
            else:
                pairs.append(added[:220])
    return pairs


def diff_contains_any(diff: str, terms: list[str]) -> bool:
    lower = diff.lower()
    return any(term.lower() in lower for term in terms)


def evidence_lines_for_terms(diff: str, terms: list[str], limit: int = 8) -> list[str]:
    lower_terms = [term.lower() for term in terms]
    evidence: list[str] = []
    for line in changed_lines(diff):
        line_lower = line.lower()
        if any(term in line_lower for term in lower_terms):
            evidence.append(line[1:].strip()[:220])
    return list(dict.fromkeys(evidence))[:limit]
