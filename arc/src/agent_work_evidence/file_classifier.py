from pathlib import PurePosixPath
import re

DOCS_LIKE_RE = re.compile(r"(^|/)(docs?|documentation|changelog|history|readme)(/|\.)|\.(md|mdx|rst|txt)$", re.I)
TEST_PATH_RE = re.compile(r"(^|/)(test|tests|__tests__)(/|_)|(_test|\.spec|\.test)\.", re.I)
API_NETWORK_PATH_RE = re.compile(r"(^|[/_.-])(api|apis|routes?|controllers?|webhooks?|clients?|servers?|http|network|requests?|responses?|endpoints?)([/_.-]|$)", re.I)
NATIVE_RUNTIME_PATH_RE = re.compile(r"\.(c|cc|cpp|cxx|h|hpp|hh)$|(^|[/_.-])(render|renderer|gl|opengl|d3d|d3d11|vulkan|bootstrap|startup|runtime|threads?|memory|parser|swapbuffers?)([/_.-]|$)", re.I)
SENSITIVE_PATH_RE = re.compile(
    r"auth|session|permission|role|billing|payment|checkout|webhook|migration|schema|database|db|\.env|secret|token|config|\.github/workflows|github/workflows|package-lock|pnpm-lock|yarn.lock|requirements\.txt|pyproject\.toml|package\.json",
    re.I,
)
AUTH_PERMISSION_STRONG_PATH_RE = re.compile(
    r"(^|[/_.-])(auth|authentication|authorization|permissions?|roles?|rbac|access-control|acl|sessions?|cookies?|tokens?|jwt|oauth|sso|login|logout|middleware|guards?|polic(?:y|ies))([/_.-]|$)",
    re.I,
)
AUTH_PERMISSION_BOUNDARY_PATH_RE = re.compile(
    r"(^|[/_.-])(workspaces?|tenants?|organizations?|orgs?|projects?|owners?|members?|memberships?)([/_.-]|$)",
    re.I,
)

EXACT_AGENT_CONTEXT_BASENAMES = {
    "AGENTS.md",
    "CLAUDE.md",
    "CURSOR.md",
    "GEMINI.md",
    "AIDER.md",
    "COPILOT.md",
    "SKILL.md",
    "TOOLS.md",
    "system.md",
    "prompt.md",
    ".cursorrules",
}

AGENT_CONTEXT_PREFIXES = (
    ".cursor/rules/",
    "prompts/",
    "prompt/",
    "instructions/",
    "instruction/",
    "policies/",
    "policy/",
    "guardrails/",
    "guardrail/",
)


def normalize_path(path: str) -> str:
    normalized = path.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def is_docs_like(path: str) -> bool:
    return bool(DOCS_LIKE_RE.search(normalize_path(path)))


def is_test_path(path: str) -> bool:
    return bool(TEST_PATH_RE.search(normalize_path(path)))


def is_sensitive_path(path: str) -> bool:
    return bool(SENSITIVE_PATH_RE.search(normalize_path(path)))


def is_api_network_path(path: str) -> bool:
    return bool(API_NETWORK_PATH_RE.search(normalize_path(path)))


def is_native_runtime_path(path: str) -> bool:
    return bool(NATIVE_RUNTIME_PATH_RE.search(normalize_path(path)))


def is_strong_auth_permission_path(path: str) -> bool:
    return bool(AUTH_PERMISSION_STRONG_PATH_RE.search(normalize_path(path)))


def is_boundary_auth_permission_path(path: str) -> bool:
    return bool(AUTH_PERMISSION_BOUNDARY_PATH_RE.search(normalize_path(path)))


def is_agent_context_path(path: str) -> bool:
    normalized = normalize_path(path)
    basename = PurePosixPath(normalized).name

    if basename in EXACT_AGENT_CONTEXT_BASENAMES:
        return True

    if normalized == ".github/copilot-instructions.md":
        return True

    if normalized.startswith("skills/") and basename == "SKILL.md":
        return True

    if basename.lower().startswith("mcp") and basename.lower().endswith(".json"):
        return True

    return any(normalized.startswith(prefix) for prefix in AGENT_CONTEXT_PREFIXES)


def is_docs_only(changed_files: list[str]) -> bool:
    return bool(changed_files) and all(is_docs_like(path) for path in changed_files)
