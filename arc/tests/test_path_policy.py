import pytest

from agent_work_evidence.path_policy import (
    PathPolicyError,
    matches_glob,
    normalize_repo_path,
    validate_glob,
)


def test_normalize_repo_path_rejects_absolute_and_traversal():
    with pytest.raises(PathPolicyError):
        normalize_repo_path("/etc/passwd")
    with pytest.raises(PathPolicyError):
        normalize_repo_path("../src/auth/session.ts")
    with pytest.raises(PathPolicyError):
        normalize_repo_path("src/feature/../auth/session.ts")
    with pytest.raises(PathPolicyError):
        normalize_repo_path(r"C:\Windows\system.ini")


def test_normalize_repo_path_converts_backslashes():
    assert normalize_repo_path(r"src\feature\index.ts") == "src/feature/index.ts"


def test_validate_glob_rejects_match_everything():
    with pytest.raises(PathPolicyError):
        validate_glob("**")


def test_matches_glob_respects_path_segment_boundaries():
    assert matches_glob("src/auth/session.ts", "src/auth/**")
    assert not matches_glob("src/authentication/ui.ts", "src/auth/**")
