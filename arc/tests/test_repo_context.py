from pathlib import Path

from agent_work_evidence.repo_context import expand_context


def test_expand_context_finds_related_tests(tmp_path: Path):
    repo = tmp_path
    (repo / "src").mkdir()
    (repo / "tests").mkdir()
    (repo / "src" / "auth.py").write_text("def validate_user():\n    return True\n", encoding="utf-8")
    (repo / "tests" / "test_auth.py").write_text("from src.auth import validate_user\n", encoding="utf-8")

    context = expand_context(repo, changed_files=["src/auth.py"])
    assert "tests/test_auth.py" in context.related_tests
