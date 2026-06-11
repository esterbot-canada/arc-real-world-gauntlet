import re

from agent_work_evidence.diff_features import (
    CODE_FENCE_RE,
    IDENTIFIER_LINE_RE,
    INLINE_CODE_CHANGE_RE,
    TYPO_FIX_CHANGELOG_RE,
    changed_lines,
    changed_pairs,
    diff_contains_any,
)
from agent_work_evidence.file_classifier import (
    is_agent_context_path,
    is_boundary_auth_permission_path,
    is_api_network_path,
    is_docs_only,
    is_native_runtime_path,
    is_sensitive_path,
    is_strong_auth_permission_path,
    is_test_path,
)
from agent_work_evidence.models import RiskSignal

CREDENTIAL_TLS_PATH_TERMS = [
    "credential",
    "credentials",
    "auth",
    "secret",
    "transport",
    "request",
    "proxy",
    "http-proxy-agent",
]

CREDENTIAL_TLS_DIFF_TERMS = [
    "certificate",
    "cert",
    "private key",
    "passphrase",
    "mtls",
    "tls",
    "tlsoptions",
    "agentoptions",
    "normalizepem",
    "requestwithauthentication",
    "undici",
    "agent(",
    "password: true",
]

SUPPLY_CHAIN_EXACT_PATHS = {
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    "requirements.txt",
    "pyproject.toml",
    "poetry.lock",
    "pipfile.lock",
    "go.mod",
    "go.sum",
    "cargo.toml",
    "cargo.lock",
    "gemfile",
    "gemfile.lock",
    "composer.json",
    "composer.lock",
}

SUPPLY_CHAIN_FILE_NAMES = {
    ".npmrc",
    ".yarnrc",
    ".yarnrc.yml",
    ".pypirc",
    "pnpm-workspace.yaml",
}

SUPPLY_CHAIN_DIFF_TERMS = [
    "dependencies",
    "devdependencies",
    "peerdependencies",
    "optionaldependencies",
    "overrides",
    "resolutions",
    "packageManager",
    "lockfileVersion",
    "integrity",
    "resolved",
    "version:",
    "specifier:",
    "npm audit",
    "cve-",
    "vulnerability",
    "install --frozen-lockfile",
    "frozen-lockfile",
    "npm ci",
    "pnpm install",
    "yarn install",
    "setup-node",
    "corepack",
]

PACKAGE_DEPENDENCY_LINE_RE = re.compile(
    r"^[-+]\s*(?:\"(?:@?[A-Za-z0-9_.-]+/)?[A-Za-z0-9_.-]+\"\s*:\s*\"(?:[~^<>=]*\d|workspace:|npm:|file:|link:)|[A-Za-z0-9_.-]+@(?:[~^<>=]*\d|npm:|file:|link:))",
    re.I,
)

AUTH_PERMISSION_DIFF_RE = re.compile(
    r"\b(requireAuth|isAuthenticated|authori[sz]e|authori[sz]ed|isAuthori[sz]ed|permissions?|roles?|admin|owner|member|tenantId|workspaceId|organizationId|orgId|userId|accountId|sessions?|cookies?|jwt|tokens?|scopes?|canAccess|canEdit|canDelete|isOwner|isAdmin|forbidden|unauthori[sz]ed|401|403|login|logout|oauth|sso)\b",
    re.I,
)

AUTH_PERMISSION_STRONG_DIFF_RE = re.compile(
    r"\b(requireAuth|isAuthenticated|authori[sz]e|isAuthori[sz]ed|permissions?|roles?|admin|tenantId|workspaceId|organizationId|orgId|userId|accountId|sessions?|cookies?|jwt|tokens?|scopes?|canAccess|canEdit|canDelete|isOwner|isAdmin|forbidden|unauthori[sz]ed|401|403|oauth|sso)\b",
    re.I,
)

AUTH_PERMISSION_RISK_SHAPE_RE = re.compile(
    r"(!|!==|===|==|&&|\|\||\?\?|\bif\b|\breturn\b|\bthrow\b|\bempty\b|\bexpire\b|\bverify\b|\bguard\b|\bmiddleware\b|\bbypass\b|\bskip\b|\bdebug\b|\btrue\b|\bfalse\b|\bfind\b|\bmatch\b)",
    re.I,
)

API_NETWORK_RE = re.compile(
    r"\b(api|endpoint|route|rest|webhook|http|fetch|axios|mapget|mappost|mapput|mapdelete|controller|ratelimit|ratelimiting|rate limit|requireauthorization|addauthentication|cors|upload|download|socket|grpc)\b",
    re.I,
)

NATIVE_RUNTIME_RE = re.compile(
    r"\b(opengl|d3d|d3d11|vulkan|swapbuffers?|bootstrap|startup|runtime|thread|mutex|lock|memory|pointer|nullptr|segfault|crash|render|renderer|parser|filesystem|native|c\+\+)\b",
    re.I,
)


def _has_explicit_code_or_mapping_marker(pair: str) -> bool:
    return "`" in pair or "```" in pair or "=>" in pair


def _only_history_or_changelog_files(changed_files: list[str]) -> bool:
    return bool(changed_files) and all(
        "history" in path.lower() or "changelog" in path.lower() for path in changed_files
    )


def _markdown_code_identifier_evidence(changed_files: list[str], diff: str) -> list[str]:
    evidence: list[str] = []
    require_explicit_marker = _only_history_or_changelog_files(changed_files)
    for pair in changed_pairs(diff):
        if require_explicit_marker and not _has_explicit_code_or_mapping_marker(pair):
            continue
        pseudo_line = "+ " + pair
        if INLINE_CODE_CHANGE_RE.search(pseudo_line) or CODE_FENCE_RE.search(pseudo_line) or IDENTIFIER_LINE_RE.search(pseudo_line):
            evidence.append(pair)

    def priority(item: str) -> tuple[int, str]:
        text = item.lower()
        if "exat" in text or "exact?:" in text:
            return (0, item)
        if "schema.atleast" in text or "schema.at least" in text:
            return (1, item)
        if "=>" in text and "typo" in text:
            return (2, item)
        if "?:" in text or "=>" in text:
            return (3, item)
        if "(" in item and ")" in item:
            return (4, item)
        if "`" in item:
            return (5, item)
        return (6, item)

    unique = list(dict.fromkeys(evidence))
    return sorted(unique, key=priority)[:12]


def _historical_changelog_evidence(changed_files: list[str], diff: str) -> list[str]:
    if not any("changelog" in path.lower() or "history" in path.lower() for path in changed_files):
        return []
    evidence = [
        pair
        for pair in changed_pairs(diff)
        if _has_explicit_code_or_mapping_marker(pair) and TYPO_FIX_CHANGELOG_RE.search("+ " + pair)
    ]

    def priority(item: str) -> tuple[int, str]:
        text = item.lower().replace("`", "")
        if "algorythm => algorithm" in text and "algorithm => algorithm" in text:
            return (0, item)
        if "algorithm => algorithm" in text:
            return (1, item)
        if "=>" in text or "->" in text:
            return (2, item)
        if "typo" in text:
            return (3, item)
        return (4, item)

    unique = list(dict.fromkeys(evidence))
    return sorted(unique, key=priority)[:12]


def _credential_tls_paths(changed_files: list[str]) -> list[str]:
    matches: list[str] = []
    for path in changed_files:
        lower = path.lower()
        if any(term in lower for term in CREDENTIAL_TLS_PATH_TERMS):
            matches.append(path)
    return matches


def _credential_tls_evidence(changed_files: list[str], diff: str) -> list[str]:
    path_matches = _credential_tls_paths(changed_files)
    if not path_matches or not diff:
        return []

    if not diff_contains_any(diff, CREDENTIAL_TLS_DIFF_TERMS):
        return []

    evidence = list(path_matches[:4])
    for line in changed_lines(diff):
        lower = line.lower()
        if any(term in lower for term in CREDENTIAL_TLS_DIFF_TERMS):
            evidence.append(line[1:].strip()[:220])
    return list(dict.fromkeys(evidence))[:12]


def _supply_chain_paths(changed_files: list[str]) -> list[str]:
    matches: list[str] = []
    for path in changed_files:
        normalized = path.replace("\\", "/").lower()
        basename = normalized.rsplit("/", 1)[-1]
        if normalized.startswith(".github/workflows/"):
            matches.append(path)
        elif basename in SUPPLY_CHAIN_EXACT_PATHS or basename in SUPPLY_CHAIN_FILE_NAMES:
            matches.append(path)
    return matches


def _supply_chain_evidence(changed_files: list[str], diff: str) -> list[str]:
    path_matches = _supply_chain_paths(changed_files)
    if not path_matches or not diff:
        return []

    changed_dependency_lines: list[str] = []
    for line in changed_lines(diff):
        lower = line.lower()
        if any(term.lower() in lower for term in SUPPLY_CHAIN_DIFF_TERMS) or PACKAGE_DEPENDENCY_LINE_RE.search(line):
            changed_dependency_lines.append(line[1:].strip()[:220])

    if not changed_dependency_lines:
        return []

    evidence = list(path_matches[:4]) + changed_dependency_lines
    return list(dict.fromkeys(evidence))[:12]


def _auth_permission_paths(changed_files: list[str]) -> tuple[list[str], list[str]]:
    strong: list[str] = []
    boundary: list[str] = []
    for path in changed_files:
        if is_strong_auth_permission_path(path):
            strong.append(path)
        elif is_boundary_auth_permission_path(path):
            boundary.append(path)
    return strong, boundary


def _auth_permission_diff_evidence(diff: str) -> list[str]:
    evidence: list[str] = []
    for line in changed_lines(diff):
        text = line[1:].strip()
        if AUTH_PERMISSION_DIFF_RE.search(text):
            evidence.append(text[:220])
    return list(dict.fromkeys(evidence))[:12]


def _auth_permission_evidence(changed_files: list[str], diff: str) -> list[str]:
    if not changed_files or is_docs_only(changed_files):
        return []

    if _supply_chain_paths(changed_files) and len(_supply_chain_paths(changed_files)) == len(changed_files):
        return []

    if all(is_test_path(path) for path in changed_files):
        return []

    source_files = [path for path in changed_files if not is_test_path(path)]
    strong_paths, boundary_paths = _auth_permission_paths(source_files)
    diff_evidence = _auth_permission_diff_evidence(diff)
    has_diff_signal = bool(diff_evidence)
    has_strong_diff_signal = any(AUTH_PERMISSION_STRONG_DIFF_RE.search(item) for item in diff_evidence)
    has_risk_shape = any(AUTH_PERMISSION_RISK_SHAPE_RE.search(item) for item in diff_evidence)

    if strong_paths:
        if not diff:
            return list(dict.fromkeys(strong_paths[:4]))
        if has_diff_signal:
            return list(dict.fromkeys(strong_paths[:4] + diff_evidence))[:12]
        return []

    if boundary_paths and has_strong_diff_signal and has_risk_shape:
        return list(dict.fromkeys(boundary_paths[:4] + diff_evidence))[:12]

    # Some auth/session code lives in generic bootstrap files (for example app/init/resources.php).
    # Require both a strong auth term and a changed guard/lookup/expiry shape before flagging generic paths.
    if has_strong_diff_signal and has_risk_shape:
        return diff_evidence[:12]

    return []


def evaluate_agent_context(changed_files: list[str]) -> list[RiskSignal]:
    agent_context_files = [path for path in changed_files if is_agent_context_path(path)]
    if not agent_context_files:
        return []
    return [RiskSignal(
        name="agent_instruction_context",
        level="high",
        evidence=agent_context_files,
        human_question="Could this change modify agent behavior, trust boundaries, tool usage, review policy, or prompt-injection exposure?",
    )]


def evaluate_credential_tls_security(changed_files: list[str], diff: str) -> list[RiskSignal]:
    evidence = _credential_tls_evidence(changed_files, diff)
    if not evidence:
        return []
    return [RiskSignal(
        name="credential_tls_security_change",
        level="medium",
        evidence=evidence,
        human_question="Are secrets, certificates, private keys, passphrases, and TLS options safely stored, gated, normalized, and passed only to the intended request paths?",
    )]


def evaluate_auth_permission_change(changed_files: list[str], diff: str) -> list[RiskSignal]:
    evidence = _auth_permission_evidence(changed_files, diff)
    if not evidence:
        return []
    return [RiskSignal(
        name="auth_permission_change",
        level="medium",
        evidence=evidence,
        human_question="Could this change allow unauthorized access, bypass role checks, leak tenant/workspace data, weaken sessions, or change who can perform an action?",
    )]


def evaluate_supply_chain_security(changed_files: list[str], diff: str) -> list[RiskSignal]:
    evidence = _supply_chain_evidence(changed_files, diff)
    if not evidence:
        return []
    return [RiskSignal(
        name="supply_chain_security_change",
        level="medium",
        evidence=evidence,
        human_question="Do dependency, lockfile, package-manager, or CI install changes preserve trusted sources, pinned versions, reproducible installs, and expected vulnerability posture?",
    )]


def _semantic_evidence(changed_files: list[str], diff: str, title: str, body: str, pattern: re.Pattern[str], path_predicate) -> list[str]:
    evidence: list[str] = []
    evidence.extend(path for path in changed_files if path_predicate(path))
    for text in (title, body):
        compact = " ".join(str(text or "").split())
        if compact and pattern.search(compact):
            evidence.append(compact[:220])
    for line in changed_lines(diff):
        text = line[1:].strip()
        if pattern.search(text):
            evidence.append(text[:220])
    return list(dict.fromkeys(evidence))[:12]


def evaluate_api_network_surface(changed_files: list[str], diff: str, title: str = "", body: str = "") -> list[RiskSignal]:
    if not changed_files or is_docs_only(changed_files):
        return []
    # PR templates often mention generic "breaking API change" checkboxes; use title,
    # paths, and actual diff lines for the top-level API/network signal.
    evidence = _semantic_evidence(changed_files, diff, title, "", API_NETWORK_RE, is_api_network_path)
    if not evidence:
        return []
    return [RiskSignal(
        name="api_network_surface_change",
        level="medium",
        evidence=evidence,
        human_question="Are API routes, network calls, webhooks, rate limits, and request/response boundaries safely wired?",
    )]


def evaluate_native_runtime_surface(changed_files: list[str], diff: str, title: str = "", body: str = "") -> list[RiskSignal]:
    if not changed_files or is_docs_only(changed_files):
        return []
    evidence = _semantic_evidence(changed_files, diff, title, body, NATIVE_RUNTIME_RE, is_native_runtime_path)
    if not evidence:
        return []
    return [RiskSignal(
        name="native_runtime_surface_change",
        level="medium",
        evidence=evidence,
        human_question="Could this native/runtime change cause platform-specific crashes, rendering regressions, memory issues, or startup/bootstrap failures?",
    )]


def evaluate_docs_semantics(changed_files: list[str], diff: str) -> list[RiskSignal]:
    if not is_docs_only(changed_files):
        return []
    signals: list[RiskSignal] = []
    markdown_identifier_evidence = _markdown_code_identifier_evidence(changed_files, diff)
    if markdown_identifier_evidence:
        signals.append(RiskSignal(
            name="markdown_code_identifier_change",
            level="medium",
            evidence=markdown_identifier_evidence,
            human_question="Are these words actually code/API identifiers rather than typos?",
        ))
    changelog_evidence = _historical_changelog_evidence(changed_files, diff)
    if changelog_evidence:
        signals.append(RiskSignal(
            name="historical_changelog_semantic_change",
            level="medium",
            evidence=changelog_evidence,
            human_question="Does this change corrupt historical release notes or intentionally quoted typo text instead of fixing prose?",
        ))
    level = "medium" if markdown_identifier_evidence or changelog_evidence else "low"
    signals.append(RiskSignal(
        name="docs_only_change",
        level=level,
        evidence=changed_files,
        human_question="Confirm the text-only change is accurate and does not alter code examples, API names, generated docs, or release semantics.",
    ))
    return signals


def evaluate_generic_reviewability(
    changed_files: list[str],
    additions: int,
    deletions: int,
    checks_conclusion: str | None,
    check_failure_evidence: list[str] | None = None,
) -> list[RiskSignal]:
    signals: list[RiskSignal] = []
    total = additions + deletions
    docs_only = is_docs_only(changed_files)

    sensitive = [path for path in changed_files if is_sensitive_path(path)]
    if sensitive:
        signals.append(RiskSignal(
            name="sensitive_path",
            level="medium",
            evidence=sensitive,
            human_question="Do these sensitive files match the intended scope and have adequate verification?",
        ))

    tests_changed = any(is_test_path(path) for path in changed_files)
    if changed_files and not tests_changed and not docs_only:
        signals.append(RiskSignal(
            name="no_tests_changed",
            level="medium",
            evidence=["No changed file looks like a test file"],
            human_question="Is there other evidence that the changed behavior was tested?",
        ))

    if total >= 400:
        signals.append(RiskSignal(
            name="large_diff",
            level="medium",
            evidence=[f"{additions} additions, {deletions} deletions"],
            human_question="Can this PR be reviewed effectively as one unit, or should it be split?",
        ))

    if checks_conclusion in (None, "", "missing"):
        signals.append(RiskSignal(
            name="missing_ci_evidence",
            level="medium",
            evidence=["No passing CI/check conclusion available"],
            human_question="What evidence supports the changed behavior?",
        ))
    elif checks_conclusion not in ("success", "neutral", "skipped", "pending"):
        signals.append(RiskSignal(
            name="failing_ci",
            level="high",
            evidence=check_failure_evidence or [f"Check conclusion: {checks_conclusion}"],
            human_question="Which failed, errored, or cancelled checks need attention before review?",
        ))

    return signals
