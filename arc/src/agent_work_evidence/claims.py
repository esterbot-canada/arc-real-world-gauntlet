import re

from agent_work_evidence.models import Claim

BULLET_RE = re.compile(r"^\s*[-*]\s+(?P<claim>.+?)\s*$")
ORDERED_LIST_RE = re.compile(r"^\s*\d+[.)]\s+(?P<claim>.+?)\s*$")
CHECKBOX_RE = re.compile(r"^\[(?:x|X| )\]\s+")
MARKDOWN_HEADING_RE = re.compile(r"^\s*#{1,6}\s+(?P<heading>.+?)\s*#*\s*$")
COLON_HEADING_RE = re.compile(r"^\s*(?P<heading>[A-Za-z][A-Za-z0-9\s/_-]*):\s*$")
INLINE_VALIDATION_RE = re.compile(
    r"\b(?:validation|verification|testing|suggested\s+test\s+plan|test\s+plan|tests|qa|checks)(?:\s*[`*_]+)?\s*:\s*(?P<text>.+?)\s*$",
    re.I,
)
TEST_PATH_RE = re.compile(r"(^|/)(test|tests|spec|__tests__)(/|_)|(_test|\.spec|\.test)\.", re.I)
TEST_CLAIM_RE = re.compile(
    r"\b(?:"
    r"test|tests|tested|testing|"
    r"unit\s+tests?|integration\s+tests?|e2e\s+tests?|"
    r"pytest|unittest|jest|vitest|playwright|cypress|"
    r"specs?|coverage"
    r")\b",
    re.I,
)
CHANGE_HEADINGS = {"changes", "change", "implementation", "what changed", "summary", "fix", "features", "new features"}
VALIDATION_HEADINGS = {"validation", "verification", "test", "tests", "testing", "test plan", "suggested test plan", "to test", "qa", "checks"}


def _normalize_heading(text: str) -> str:
    cleaned = text.strip().strip("#").strip().lower()
    cleaned = re.sub(r"[`*_]+", "", cleaned)
    cleaned = re.sub(r"[^a-z0-9\s/_-]", "", cleaned)
    cleaned = re.sub(r"[\s/_-]+", " ", cleaned).strip()
    return cleaned


def _section_name(line: str) -> str | None:
    markdown_match = MARKDOWN_HEADING_RE.match(line)
    if markdown_match:
        return _normalize_heading(markdown_match.group("heading"))

    colon_candidate = line.strip().strip("`*_").strip()
    colon_candidate = re.sub(r"[`*_]+\s*:$", ":", colon_candidate)
    colon_match = COLON_HEADING_RE.match(colon_candidate)
    if colon_match:
        return _normalize_heading(colon_match.group("heading"))

    return None


def _list_item_text(line: str) -> str | None:
    match = BULLET_RE.match(line) or ORDERED_LIST_RE.match(line)
    if not match:
        return None
    return CHECKBOX_RE.sub("", match.group("claim").strip()).strip()


def _inline_validation_text(line: str) -> str | None:
    match = INLINE_VALIDATION_RE.search(line)
    if not match:
        return None
    text = match.group("text").strip().strip("*_").strip()
    return text or None


def _is_test_claim(text: str) -> bool:
    return bool(TEST_CLAIM_RE.search(text))


def extract_claims(text: str) -> list[Claim]:
    """Extract implementation claims, not validation commands.

    PR bodies often contain both "Changes" and "Validation" bullet lists. Validation
    bullets are not facts about the diff and should not be marked supported just
    because command words appear in the patch.
    """
    claims: list[Claim] = []
    current_section: str | None = None
    saw_change_heading = False

    for line in text.splitlines():
        heading = _section_name(line)
        if heading:
            current_section = heading
            if heading in CHANGE_HEADINGS:
                saw_change_heading = True
            continue

        claim_text = _list_item_text(line)
        if not claim_text:
            continue

        if current_section in VALIDATION_HEADINGS:
            continue
        if _inline_validation_text(claim_text):
            continue
        if saw_change_heading and current_section not in CHANGE_HEADINGS:
            continue

        if claim_text:
            claims.append(Claim(text=claim_text, status="unverified"))
    return claims


def extract_reported_validation(text: str) -> list[str]:
    """Extract validation commands/statements reported in the PR body."""
    validations: list[str] = []
    current_section: str | None = None

    for line in text.splitlines():
        heading = _section_name(line)
        if heading:
            current_section = heading
            continue

        inline_validation = _inline_validation_text(line)
        if inline_validation:
            validations.append(inline_validation)
            continue

        item_text = _list_item_text(line)
        if item_text and current_section in VALIDATION_HEADINGS:
            validations.append(item_text)
    return validations


def verify_claims(claims: list[Claim], changed_files: list[str], diff: str) -> list[Claim]:
    verified: list[Claim] = []
    tests_changed = any(TEST_PATH_RE.search(path) for path in changed_files)
    diff_lower = diff.lower()

    for claim in claims:
        text = claim.text.lower()
        evidence: list[str] = []
        status = "unverified"

        if _is_test_claim(text):
            if tests_changed:
                status = "supported"
                evidence.append("At least one changed file looks like a test file")
            else:
                evidence.append("No changed files look like tests")
        else:
            claim_terms = [term for term in re.split(r"\W+", text) if len(term) >= 5][:5]
            matched = [term for term in claim_terms if term in diff_lower]
            if matched:
                status = "supported"
                evidence.append(f"Claim terms appear in diff: {', '.join(matched)}")
            elif claim_terms:
                evidence.append("No strong textual support found in diff for this claim")

        verified.append(Claim(text=claim.text, status=status, evidence=evidence))

    return verified
