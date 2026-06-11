import re
from collections import defaultdict

from agent_work_evidence.file_classifier import is_test_path
from agent_work_evidence.models import (
    BoundaryFinding,
    ContractEvaluation,
    EvidenceBrief,
    ReviewerConcern,
    RiskSignal,
)
from agent_work_evidence.trust_brief import build_trust_brief_document

MAX_TOP_CHECKS = 3
MAX_CHANGED_FILES = 8
MAX_INLINE_EVIDENCE = 2
MAX_CHECKS = 6
MAX_GAPS = 5
MAX_TOP_GAPS = 4
MAX_REVIEWER_CONCERNS = 3


STATE_WORDS = {
    "failure": "failed",
    "failed": "failed",
    "error": "errored",
    "cancelled": "cancelled",
    "canceled": "cancelled",
    "timed_out": "timed out",
    "timed-out": "timed out",
    "success": "passed",
    "passed": "passed",
    "skipped": "skipped",
    "neutral": "neutral",
    "pending": "pending",
    "unknown": "unknown",
}


CHECK_ENTRY_RE = re.compile(r"^(?P<workflow>.+?)\s*/\s*(?P<check>[^:]+):\s*(?P<state>[a-zA-Z_-]+)$")
CONVENTIONAL_PREFIX_RE = re.compile(r"^(?P<prefix>[a-z]+)(?:\([^)]+\))?!?:\s*(?P<rest>.+)$", re.I)


def _bullets(items: list[str]) -> str:
    if not items:
        return "- None found\n"
    return "".join(f"- {item}\n" for item in items)


def _limited(items: list[str], limit: int, more_label: str = "raw receipts") -> list[str]:
    if len(items) <= limit:
        return items
    return items[:limit] + [f"See {more_label} for {len(items) - limit} more"]


def _short(text: str, limit: int = 96) -> str:
    compact = " ".join(str(text or "").strip().split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def _normalize_state(state: str) -> str:
    return STATE_WORDS.get(str(state or "").strip().lower(), str(state or "").strip().lower() or "unknown")


def _humanize_title(title: str) -> str:
    compact = " ".join(str(title or "").strip().split())
    match = CONVENTIONAL_PREFIX_RE.match(compact)
    if match:
        compact = match.group("rest").strip()
    compact = compact.rstrip(".")
    if not compact:
        return ""
    return compact[0].upper() + compact[1:]


def _path_area(path: str) -> str:
    lower = path.lower()
    filename = lower.rsplit("/", 1)[-1]
    if ".github/workflows" in lower or "workflow" in lower or lower.endswith((".yml", ".yaml")) and ".github" in lower:
        return "CI/workflow files"
    if filename in {"package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb", "poetry.lock", "requirements.txt", "cargo.lock", "go.sum"}:
        return "dependency/package files"
    if is_test_path(path) or any(part in lower for part in ("playwright", "cypress", "eval")):
        return "test/eval files"
    if any(part in lower for part in ("auth", "permission", "session", "credential", "secret", "tls", "security")):
        return "auth/security-sensitive files"
    if filename.endswith((".md", ".mdx", ".rst", ".txt")):
        return "docs/text files"
    if any(part in lower for part in ("config", "settings", "release", "deploy")):
        return "config/release files"
    return "application/code files"


def _changed_summary(files: list[str]) -> list[str]:
    if not files:
        return ["No changed files returned by GitHub"]
    md_count = sum(1 for path in files if path.lower().endswith((".md", ".mdx", ".rst", ".txt")))
    summary = [f"{len(files)} file(s) changed"]
    if md_count == len(files):
        summary.append("All changed files are documentation/text files")
    elif md_count:
        summary.append(f"{md_count} documentation/text file(s) changed")
    return summary


def _top_signals(signals: list[RiskSignal]) -> list[RiskSignal]:
    actionable = [signal for signal in signals if signal.name not in {"missing_ci_evidence", "docs_only_change"}]
    candidate_signals = actionable or signals
    priority = {
        "agent_instruction_context": 0,
        "credential_tls_security_change": 1,
        "auth_permission_change": 2,
        "failing_ci": 3,
        "supply_chain_security_change": 4,
        "api_network_surface_change": 5,
        "native_runtime_surface_change": 6,
        "markdown_code_identifier_change": 7,
        "historical_changelog_semantic_change": 8,
        "sensitive_path": 9,
        "large_diff": 10,
        "no_tests_changed": 11,
        "missing_ci_evidence": 12,
        "docs_only_change": 13,
    }
    level_priority = {"high": 0, "medium": 1, "low": 2}
    return sorted(candidate_signals, key=lambda s: (level_priority.get(s.level, 9), priority.get(s.name, 99)))[:MAX_TOP_CHECKS]


def _signal_label(signal: RiskSignal) -> str:
    labels = {
        "agent_instruction_context": "Agent instruction/context changed",
        "credential_tls_security_change": "Credential/TLS security changed",
        "auth_permission_change": "Auth/permission behavior changed",
        "supply_chain_security_change": "Dependency/supply-chain changed",
        "api_network_surface_change": "API/network surface changed",
        "native_runtime_surface_change": "Native/runtime surface changed",
        "markdown_code_identifier_change": "Markdown changes code/API identifiers",
        "historical_changelog_semantic_change": "Changelog/history wording may be semantic",
        "docs_only_change": "Docs/text-only change",
        "missing_ci_evidence": "No CI evidence returned",
        "sensitive_path": "Sensitive path changed",
        "no_tests_changed": "No tests changed",
        "large_diff": "Large diff",
        "failing_ci": "CI/checks need attention",
    }
    return labels.get(signal.name, signal.name.replace("_", " ").title())


def _display_label(brief: EvidenceBrief, signal: RiskSignal) -> str:
    if signal.name == "no_tests_changed" and brief.reported_validation:
        return "No test files changed, but reported validation exists"
    return _signal_label(signal)


def _display_prompt(brief: EvidenceBrief, signal: RiskSignal) -> str:
    if signal.name == "no_tests_changed" and brief.reported_validation:
        return "Check whether the reported/manual validation covers the changed behavior and whether automated tests should be added."
    return signal.human_question or f"Verify {_signal_label(signal).lower()}."


def _one_line_reason(brief: EvidenceBrief, top: list[RiskSignal]) -> str:
    if not top:
        return "No deterministic risk signals found."
    names = {signal.name for signal in top}
    if "failing_ci" in names:
        return "CI/checks are not passing; this needs attention before relying on the PR's validation story."
    if "agent_instruction_context" in names:
        return "Agent instruction/context files changed, which can alter tool behavior or prompt-injection exposure."
    if "credential_tls_security_change" in names:
        return "Credential, secret, or TLS transport behavior changed; reviewer should verify safe storage, gating, and request-path wiring."
    if "auth_permission_change" in names:
        return "Authentication, permission, session, or ownership-boundary behavior changed; reviewer should verify access checks still enforce the intended users, roles, tenants, and workspaces."
    if "supply_chain_security_change" in names:
        return "Dependency, lockfile, package-manager, or CI install behavior changed; reviewer should verify trusted sources and reproducible installs."
    if "api_network_surface_change" in names:
        return "API, route, webhook, rate-limit, or network boundary changed; reviewer should verify request/response and abuse-control behavior."
    if "native_runtime_surface_change" in names:
        return "Native, runtime, rendering, bootstrap, or platform behavior changed; reviewer should verify crash/regression risk on affected platforms."
    if "markdown_code_identifier_change" in names and "historical_changelog_semantic_change" in names:
        return "Docs-only PR, but some edits touch code/API identifiers and historical changelog wording."
    if "markdown_code_identifier_change" in names:
        return "Docs-only PR, but some edits appear to change code/API identifiers."
    if "historical_changelog_semantic_change" in names:
        return "Docs-only PR, but some edits may alter historical release-note meaning."
    if "docs_only_change" in names and brief.risk == "low":
        return "Text/docs-only change with no stronger deterministic risk signal."
    if top[0].name == "no_tests_changed" and brief.reported_validation:
        return "No test files changed; reported/manual validation exists but still needs verification."
    return top[0].human_question or _signal_label(top[0])


def _has_signal(brief: EvidenceBrief, name: str) -> bool:
    return any(signal.name == name for signal in brief.risk_signals)


CONCERN_BLOCKER_RE = re.compile(r"\b(build|test|ci|compile|failure|failed|error|merge|broken|regression)\b", re.I)


def _has_missing_diff_or_files(brief: EvidenceBrief) -> bool:
    gap_text = "\n".join(brief.evidence_gaps).lower()
    return "no diff" in gap_text or "no changed files" in gap_text


def _has_pending_ci(brief: EvidenceBrief) -> bool:
    return any("pending" in item.lower() or "queued" in item.lower() or "in_progress" in item.lower() for item in brief.checks_summary)


def _high_concerns(brief: EvidenceBrief) -> list[ReviewerConcern]:
    return [concern for concern in brief.reviewer_concerns.items if concern.severity == "high"]


def _has_blocking_high_concern(brief: EvidenceBrief) -> bool:
    return any(CONCERN_BLOCKER_RE.search(concern.body) for concern in _high_concerns(brief))


def _decision(brief: EvidenceBrief, top: list[RiskSignal]) -> tuple[str, str]:
    signal_names = {signal.name for signal in brief.risk_signals}
    if _has_missing_diff_or_files(brief):
        return "BLOCK BEFORE REVIEW", "No changed files/diff evidence is available; refetch PR evidence before trusting this brief."
    if "failing_ci" in signal_names:
        return "BLOCK BEFORE MERGE", "CI/checks are failing or cancelled; resolve or explain before relying on the PR."
    if _has_blocking_high_concern(brief):
        return "BLOCK BEFORE MERGE", "A high-severity reviewer concern mentions build/test/failure; resolve or triage it before relying on the PR."
    if brief.risk == "high":
        return "BLOCK BEFORE MERGE", _one_line_reason(brief, top)
    if _high_concerns(brief):
        return "NEEDS DEEP REVIEW", "High-severity reviewer/bot comments need triage before this can be skimmed."
    if _has_pending_ci(brief) and (brief.risk in {"medium", "high"} or top):
        return "NEEDS DEEP REVIEW", "CI/checks are still pending; wait for results or inspect which pending checks matter."
    if brief.risk == "medium" or brief.scope.status == "unclear":
        return "NEEDS DEEP REVIEW", _one_line_reason(brief, top)
    return "LOW-RISK SKIM", _one_line_reason(brief, top)


def _check_entries(summary_items: list[str]) -> list[tuple[str, str, str]]:
    entries: list[tuple[str, str, str]] = []
    summary_prefixes = (
        "failed/error/cancelled checks needing attention:",
        "failed/error checks needing attention:",
        "pending checks:",
    )
    for raw in summary_items:
        text = str(raw or "").strip()
        if not text:
            continue
        lower = text.lower()
        for prefix in summary_prefixes:
            if lower.startswith(prefix):
                text = text[len(prefix):].strip()
                break
        if text.lower().startswith("examples:"):
            text = text.split(":", 1)[1].strip()
        for part in [piece.strip() for piece in text.split(";") if piece.strip()]:
            match = CHECK_ENTRY_RE.match(part)
            if match:
                entries.append((match.group("workflow").strip(), match.group("check").strip(), _normalize_state(match.group("state"))))
    return entries


def _failed_check_entries(brief: EvidenceBrief) -> list[tuple[str, str, str]]:
    failed_states = {"failed", "errored", "cancelled", "timed out"}
    from_summary = _check_entries([item for item in brief.checks_summary if "fail" in item.lower() or "error" in item.lower() or "cancel" in item.lower() or "timed" in item.lower()])
    from_signals: list[tuple[str, str, str]] = []
    for signal in brief.risk_signals:
        if signal.name != "failing_ci":
            continue
        from_signals.extend(_check_entries(signal.evidence))
    seen: set[tuple[str, str, str]] = set()
    rows: list[tuple[str, str, str]] = []
    for entry in from_summary + from_signals:
        if entry[2] in failed_states and entry not in seen:
            rows.append(entry)
            seen.add(entry)
    return rows


def _grouped_check_lines(entries: list[tuple[str, str, str]], limit: int | None = None) -> list[str]:
    grouped: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for workflow, check, state in entries[: limit or len(entries)]:
        grouped[workflow].append((check, state))

    lines: list[str] = []
    for workflow, checks in grouped.items():
        lines.append(f"- {workflow}")
        for check, state in checks:
            lines.append(f"  - {check} — {state}")
    remaining = len(entries) - (limit or len(entries))
    if remaining > 0:
        lines.append(f"- See raw receipts for {remaining} more check(s)")
    return lines


def _pr_intent(brief: EvidenceBrief) -> str:
    title = _humanize_title(brief.title)
    has_body_signal = any("PR body present" in signal for signal in brief.scope.signals)
    if brief.scope.status == "unclear" and not has_body_signal and not title:
        return "Could not confidently summarize intent from title/body/path evidence. Review the PR description and changed files directly."
    if brief.scope.status == "unclear" and not has_body_signal:
        return f"Appears to be about: {title}. Intent is still unclear because no PR body or acceptance context was found."
    if title:
        return f"Appears to be about: {title}."
    return "Could not confidently summarize intent from title/body/path evidence. Review the PR description and changed files directly."


def _main_areas_touched(brief: EvidenceBrief) -> list[str]:
    if not brief.changed_files:
        return ["No changed files returned by GitHub"]
    areas: dict[str, list[str]] = defaultdict(list)
    for path in brief.changed_files:
        area = _path_area(path)
        if len(areas[area]) < 2:
            areas[area].append(path)
    rows: list[str] = []
    for area, paths in list(areas.items())[:5]:
        if len(paths) == 1:
            rows.append(f"{area}: `{paths[0]}`")
        else:
            rows.append(f"{area}: " + ", ".join(f"`{path}`" for path in paths))
    return rows


def _next_action(brief: EvidenceBrief, top: list[RiskSignal], verdict: str) -> str:
    names = {signal.name for signal in brief.risk_signals}
    if _has_missing_diff_or_files(brief):
        return "Refetch PR files/diff before reviewing; this brief does not have enough evidence to guide approval."
    if "failing_ci" in names:
        return "Fix or explain the failed PR quality checks before requesting review or merge."
    if _has_blocking_high_concern(brief):
        return "Resolve or triage the high-severity reviewer/bot comment before review or merge."
    if _high_concerns(brief):
        return "Triage the high-severity reviewer/bot comment first, then review the changed files it points at."
    if _has_pending_ci(brief) and (brief.risk in {"medium", "high"} or top):
        return "Wait for pending CI/checks or inspect which pending checks cover the risky change."
    if {"credential_tls_security_change", "auth_permission_change"} & names:
        return "Review the security/auth path first, then verify the reported validation covers the risky behavior."
    if "supply_chain_security_change" in names:
        return "Review package, lockfile, and install-surface changes before reviewing lower-risk files."
    if "api_network_surface_change" in names:
        return "Review API routes, request/response boundaries, rate limits, and authorization behavior before lower-risk files."
    if "native_runtime_surface_change" in names:
        return "Review platform/runtime bootstrap and crash-regression risk before treating this as a simple change."
    if brief.scope.status == "unclear" or "No explicit acceptance criteria" in brief.scope.gaps:
        return "Clarify the intended behavior and acceptance criteria, then review the highest-risk changed files."
    if "no_tests_changed" in names:
        return "Verify the reported/manual validation and decide whether an automated test should be added."
    if verdict == "LOW-RISK SKIM":
        return "Skim the diff against the stated scope and confirm no unexpected files were touched."
    return "Review the inspect-first items before relying on the PR."


def _reviewer_action(verdict: str, decision_reason: str) -> list[str]:
    return [f"**{verdict}**", "", "Why:", f"- {decision_reason}"]


def _risk_review_line(brief: EvidenceBrief, signal: RiskSignal) -> str:
    label = _display_label(brief, signal)
    prompt = _display_prompt(brief, signal)
    evidence = signal.evidence[:MAX_INLINE_EVIDENCE]
    if evidence:
        evidence_lines = "\n".join(f"   - `{_short(item, 140)}`" for item in evidence)
        return f"**{label}** — {prompt}\n{evidence_lines}"
    return f"**{label}** — {prompt}"


def _inspect_first(brief: EvidenceBrief, top: list[RiskSignal]) -> list[str]:
    if _has_missing_diff_or_files(brief):
        return ["Missing PR file/diff evidence — refetch GitHub PR evidence before using this brief for review."]
    failed_entries = _failed_check_entries(brief)
    rows: list[str] = []
    for concern in _high_concerns(brief)[:2]:
        rows.append(f"**High reviewer/bot comment** — {_short(_clean_concern_body(concern.body), 180)}")
    if failed_entries:
        rows.append("**Failed PR quality checks**\n" + "\n".join(f"   {line}" for line in _grouped_check_lines(failed_entries, limit=5)))
    for signal in top:
        if signal.name == "failing_ci" and failed_entries:
            continue
        rows.append(_risk_review_line(brief, signal))
    if rows:
        return rows[:MAX_TOP_CHECKS]
    return ["No deterministic risk signal found; skim the diff against stated scope."]


def _ci_summary(brief: EvidenceBrief) -> list[str]:
    if not brief.checks_summary:
        return ["CI: unknown — no CI/check evidence returned by GitHub"]
    rows: list[str] = []
    for item in brief.checks_summary:
        if item.startswith("CI/check aggregate:"):
            rows.append("CI:" + item.split(":", 1)[1])
            break
    failed_entries = _failed_check_entries(brief)
    if failed_entries:
        rows.append(f"Failed checks: {len(failed_entries)}")
    return rows or [brief.checks_summary[0]]


def _evidence_summary(brief: EvidenceBrief) -> list[str]:
    rows: list[str] = []
    rows.extend(_ci_summary(brief))
    rows.append(f"Author reported {len(brief.reported_validation)} validation step(s)" if brief.reported_validation else "Author reported no validation steps in the PR body")
    rows.extend(_changed_summary(brief.changed_files))
    if brief.reviewer_concerns.total:
        rows.append(f"{brief.reviewer_concerns.total} reviewer/bot concern(s) found")
    else:
        rows.append("No open reviewer/bot concerns found from fetched comments/reviews")
    return rows


def _blast_radius(brief: EvidenceBrief) -> list[str]:
    rows: list[str] = _changed_summary(brief.changed_files)
    if _has_signal(brief, "auth_permission_change"):
        rows.append("auth/permissions — access, ownership, session, tenant, role, or scope boundaries touched")
    if _has_signal(brief, "credential_tls_security_change"):
        rows.append("credential/TLS — secrets, certificates, private keys, passphrases, or request transport touched")
    if _has_signal(brief, "supply_chain_security_change"):
        rows.append("supply-chain/deps — package, lockfile, workflow, or install surface touched")
    if _has_signal(brief, "api_network_surface_change"):
        rows.append("API/network — routes, webhooks, rate limits, request/response, or external network boundaries touched")
    if _has_signal(brief, "native_runtime_surface_change"):
        rows.append("native/runtime — C/C++, rendering, platform bootstrap, parser, memory, or threading behavior touched")
    if _has_signal(brief, "markdown_code_identifier_change") or _has_signal(brief, "historical_changelog_semantic_change") or _has_signal(brief, "docs_only_change"):
        rows.append("docs/API/history — docs, examples, identifiers, or historical release wording touched")
    if _has_signal(brief, "failing_ci") or brief.checks_summary:
        rows.append("CI/checks — validation status is part of the review surface")
    if _has_signal(brief, "sensitive_path") or _has_signal(brief, "agent_instruction_context"):
        rows.append("sensitive files — config, agent instructions, security, release, or repo-control files touched")
    if _has_signal(brief, "no_tests_changed"):
        if brief.reported_validation:
            rows.append("tests — no changed file looks like a test file; reported validation exists but is unverified")
        else:
            rows.append("tests — no changed file looks like a test file")
    if _has_signal(brief, "credential_tls_security_change") or _has_signal(brief, "supply_chain_security_change"):
        rows.append("external effects — network/transport, dependency fetch, or external trust boundary may change")
    return list(dict.fromkeys(rows))


def _looks_like_validation_command(text: str) -> bool:
    stripped = text.strip().strip("`").lower()
    return stripped.startswith(("npm ", "pnpm ", "yarn ", "bun ", "uv ", "python -m pytest", "pytest", "git diff --check", "make test"))


def _claims_vs_evidence(brief: EvidenceBrief) -> list[str]:
    if not brief.claims:
        return ["No explicit author/agent implementation claims extracted."]

    rows: list[str] = []
    status_order = {"contradicted": 0, "unverified": 1, "supported": 2}
    candidate_claims = [
        claim
        for claim in brief.claims
        if not claim.text.lstrip().startswith(("[x]", "[X]", "[ ]")) and not _looks_like_validation_command(claim.text)
    ]
    if not candidate_claims:
        return ["No explicit author/agent implementation claims extracted beyond PR-template checklist items."]
    claims = sorted(candidate_claims, key=lambda claim: status_order.get(claim.status, 9))[:MAX_TOP_CHECKS]
    for claim in claims:
        evidence = f" Evidence: {'; '.join(_short(item) for item in claim.evidence[:MAX_INLINE_EVIDENCE])}." if claim.evidence else ""
        rows.append(f"{claim.status.upper()} — {_short(claim.text)}.{evidence}")
    if len(candidate_claims) > MAX_TOP_CHECKS:
        rows.append(f"See raw receipts for {len(candidate_claims) - MAX_TOP_CHECKS} more claim(s)")
    return rows


def _concern_counts(brief: EvidenceBrief) -> str:
    concerns = brief.reviewer_concerns
    parts = []
    if concerns.high_count:
        parts.append(f"{concerns.high_count} high")
    if concerns.medium_count:
        parts.append(f"{concerns.medium_count} medium")
    if concerns.low_count:
        parts.append(f"{concerns.low_count} low")
    return ", ".join(parts) if parts else "0 open"


def _clean_concern_body(body: str) -> str:
    text = " ".join(str(body or "").split())
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"^#+\s*", "", text)
    text = text.replace("> [!NOTE]", "Note:").replace("[!NOTE]", "Note:")
    text = re.sub(r"(^|\s)>\s*", " ", text)
    return " ".join(text.split())


def _concern_line(concern: ReviewerConcern, limit: int = 180) -> str:
    location = f" `{concern.path}`" if concern.path else ""
    author = f" by {concern.author}" if concern.author else ""
    return f"**{concern.severity.upper()} / {concern.source}**{author}{location} — {_short(_clean_concern_body(concern.body), limit)}"


def _raw_concern_line(concern: ReviewerConcern) -> str:
    location = f" `{concern.path}`" if concern.path else ""
    author = f" by {concern.author}" if concern.author else ""
    return f"**{concern.severity.upper()} / {concern.source}**{author}{location} — {concern.body}"


def _open_concerns(brief: EvidenceBrief) -> list[str]:
    summary = brief.reviewer_concerns
    if not summary.items:
        rows = ["None found from fetched PR comments/reviews."]
        rows.extend(f"Fetch gap: {gap}" for gap in summary.gaps[:2])
        return rows

    rows = [f"{summary.total} comment(s) to triage: {_concern_counts(brief)}"]
    rows.extend(_concern_line(concern, limit=160) for concern in summary.items[:MAX_REVIEWER_CONCERNS])
    if summary.total > len(summary.items[:MAX_REVIEWER_CONCERNS]):
        rows.append(f"See raw receipts for {summary.total - len(summary.items[:MAX_REVIEWER_CONCERNS])} more concern(s)")
    rows.extend(f"Fetch gap: {gap}" for gap in summary.gaps[:2])
    return rows


def _validation_receipt(brief: EvidenceBrief) -> list[str]:
    rows: list[str] = []
    rows.extend(_ci_summary(brief))
    if brief.reported_validation:
        for item in _limited(brief.reported_validation, 2):
            rows.append(f"Reported validation: UNVERIFIED — {_short(item)}")
    else:
        rows.append("Reported validation: none in PR body")
    return rows


def _missing_context(brief: EvidenceBrief, evidence_gaps: list[str]) -> list[str]:
    unknowns: list[str] = []
    all_gaps = evidence_gaps + brief.scope.gaps + brief.context.gaps
    for gap in all_gaps:
        normalized = gap.strip()
        if normalized and normalized not in unknowns:
            unknowns.append(normalized)

    if brief.reported_validation:
        unknowns.append("Reported validation was not independently run by this CLI")
    if not brief.context.changed_symbols and not brief.context.call_sites and not brief.context.related_tests:
        local_gap = "No repo-root/local context proving call sites, related tests, or rollback paths"
        if local_gap not in unknowns:
            unknowns.append(local_gap)
    if not unknowns:
        unknowns.append("No major missing context surfaced by available evidence")
    return _limited(unknowns, MAX_TOP_GAPS)


def _details_section(brief: EvidenceBrief) -> list[str]:
    lines: list[str] = []
    lines.append("<details>")
    lines.append("<summary>Raw evidence receipts</summary>\n")

    lines.append("## Contract Boundary Receipts")
    evaluation = _effective_contract_evaluation(brief)
    if evaluation.findings:
        for finding in evaluation.findings:
            lines.append(
                f"- **{finding.severity.upper()} / {finding.rule_id}**: {finding.message}"
            )
            for evidence in finding.evidence:
                lines.append(f"  - Evidence: {evidence}")
    else:
        lines.append("- No deterministic contract or boundary finding.")
    if evaluation.verified_evidence:
        lines.append("\n### ARC-Verified Command Evidence")
        lines.extend(f"- {item}" for item in evaluation.verified_evidence)

    lines.append("## Changed Files")
    lines.append(_bullets(brief.changed_files))

    lines.append("\n## CI / Check Evidence")
    lines.append(_bullets(brief.checks_summary))

    failed_entries = _failed_check_entries(brief)
    if failed_entries:
        lines.append("\n### Failed Checks")
        lines.extend(_grouped_check_lines(failed_entries))

    lines.append("\n## Reported Validation")
    if brief.reported_validation:
        lines.append(_bullets([f"UNVERIFIED (reported by PR author): {item}" for item in brief.reported_validation]))
    else:
        lines.append("- None reported in PR body.\n")

    lines.append("\n## Scope Evidence")
    lines.append("**Signals**")
    lines.append(_bullets(brief.scope.signals))
    lines.append("\n**Gaps**")
    lines.append(_bullets(brief.scope.gaps))

    lines.append("\n## Claims Check")
    if brief.claims:
        for claim in brief.claims:
            lines.append(f"- **{claim.status.upper()}**: {claim.text}")
            for evidence in claim.evidence:
                lines.append(f"  - Evidence: {evidence}")
    else:
        lines.append("- No explicit agent/task claims extracted.")

    lines.append("\n## Risk Signals")
    if brief.risk_signals:
        for signal in brief.risk_signals:
            lines.append(f"- **{signal.level.upper()} / {signal.name}**")
            for evidence in signal.evidence:
                lines.append(f"  - Evidence: {evidence}")
            if signal.human_question:
                lines.append(f"  - Human question: {signal.human_question}")
    else:
        lines.append("- No deterministic risk signals found.")

    lines.append("\n## Reviewer/Bot Concerns")
    if brief.reviewer_concerns.items:
        lines.append(f"- Total: {brief.reviewer_concerns.total} ({_concern_counts(brief)})")
        for concern in brief.reviewer_concerns.items:
            lines.append(f"- {_raw_concern_line(concern)}")
            if concern.url:
                lines.append(f"  - URL: {concern.url}")
    else:
        lines.append("- None found from fetched PR comments/reviews.")
    for gap in brief.reviewer_concerns.gaps:
        lines.append(f"- Fetch gap: {gap}")

    lines.append("\n## Context Gaps")
    lines.append(_bullets(brief.context.gaps))
    lines.append("\n</details>")
    return lines


def _effective_contract_evaluation(brief: EvidenceBrief) -> ContractEvaluation:
    if brief.contract_evaluation is not None:
        return brief.contract_evaluation
    return ContractEvaluation(
        verdict="needs_review",
        findings=[
            BoundaryFinding(
                rule_id="missing_contract",
                severity="needs_review",
                message="No frozen ARC contract evaluation was provided",
                evidence=[],
            )
        ],
    )


def _contract_heading(evaluation: ContractEvaluation) -> str:
    return {
        "blocked": "Blocked",
        "needs_review": "Needs Review",
        "pass": "Pass",
    }[evaluation.verdict]


def _contract_reason(evaluation: ContractEvaluation) -> str:
    if evaluation.verdict == "blocked":
        return "The PR crossed a frozen boundary."
    if evaluation.verdict == "needs_review":
        return "ARC could not deterministically resolve every boundary."
    return "ARC found no deterministic contract or evidence violation."


def _boundary_finding_line(finding: BoundaryFinding) -> str:
    evidence = "; ".join(finding.evidence[:2])
    suffix = f" Evidence: {evidence}" if evidence else ""
    return f"**{finding.rule_id}** — {finding.message}.{suffix}"


def render_markdown(brief: EvidenceBrief) -> str:
    top = _top_signals(brief.risk_signals)
    evidence_gaps = _limited(brief.evidence_gaps + brief.scope.gaps + brief.context.gaps, MAX_GAPS)
    verdict, decision_reason = _decision(brief, top)
    contract_evaluation = _effective_contract_evaluation(brief)
    trust_document = build_trust_brief_document(brief)

    lines: list[str] = []
    lines.append(f"# PR Review Brief: {brief.repo}#{brief.pr_number}\n")
    lines.append(f"## ARC Trust Brief: {_contract_heading(contract_evaluation)}")
    lines.append(trust_document.summary)
    lines.append("\n### Boundary Findings")
    if contract_evaluation.findings:
        lines.extend(
            f"- {_boundary_finding_line(finding)}"
            for finding in contract_evaluation.findings
        )
    else:
        lines.append("- No deterministic boundary finding.")
    if contract_evaluation.verified_evidence:
        lines.append("\n### ARC-Verified Evidence")
        lines.extend(
            f"- {evidence}" for evidence in contract_evaluation.verified_evidence
        )
    lines.append("\n### Focus Questions")
    for index, signal in enumerate(top[:MAX_TOP_CHECKS], start=1):
        lines.append(f"{index}. {_display_prompt(brief, signal)}")
    if not top:
        lines.append("1. Does the implementation still match the intended product behavior?")

    lines.append("## What this PR does")
    lines.append(_pr_intent(brief))
    lines.append("")
    lines.append("Main areas touched:")
    lines.extend(f"- {item}" for item in _main_areas_touched(brief))

    lines.append("\n## Reviewer Action")
    lines.extend(_reviewer_action(verdict, decision_reason))

    lines.append("\n## What to do next")
    lines.append(_next_action(brief, top, verdict))

    lines.append("\n## Inspect First")
    for i, check in enumerate(_inspect_first(brief, top), start=1):
        lines.append(f"{i}. {check}")

    lines.append("\n## Evidence Summary")
    lines.extend(f"- {item}" for item in _evidence_summary(brief))

    lines.append("\n## Reviewer/Bot Comments to Triage")
    lines.extend(f"- {item}" for item in _open_concerns(brief))

    lines.append("\n## Missing Context")
    lines.extend(f"- {item}" for item in _missing_context(brief, evidence_gaps))

    lines.append("\n")
    lines.extend(_details_section(brief))

    return "\n".join(lines).rstrip() + "\n"
