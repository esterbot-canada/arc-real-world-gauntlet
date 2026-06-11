from fnmatch import fnmatchcase
from pathlib import PurePosixPath, PureWindowsPath


class PathPolicyError(ValueError):
    pass


def _normalized_parts(value: str) -> tuple[str, ...]:
    if PureWindowsPath(value).is_absolute():
        raise PathPolicyError("path must be non-empty and repository-relative")
    normalized = value.replace("\\", "/")
    if not normalized or normalized.startswith("/"):
        raise PathPolicyError("path must be non-empty and repository-relative")
    path = PurePosixPath(normalized)
    if path.is_absolute() or ".." in path.parts:
        raise PathPolicyError("path must not be absolute or contain traversal")
    if any(part in {"", "."} for part in path.parts):
        raise PathPolicyError("path must not contain empty or current-directory segments")
    return path.parts


def normalize_repo_path(value: str) -> str:
    return PurePosixPath(*_normalized_parts(value)).as_posix()


def validate_glob(pattern: str) -> str:
    normalized = normalize_repo_path(pattern)
    if normalized == "**":
        raise PathPolicyError("glob must not match the entire repository")
    return normalized


def matches_glob(path: str, pattern: str) -> bool:
    normalized_path = normalize_repo_path(path)
    normalized_pattern = validate_glob(pattern)
    return fnmatchcase(normalized_path, normalized_pattern)


def matches_any_glob(path: str, patterns: tuple[str, ...] | list[str]) -> bool:
    return any(matches_glob(path, pattern) for pattern in patterns)
