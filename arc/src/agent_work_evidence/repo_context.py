from pathlib import Path

from agent_work_evidence.models import ContextExpansion

TEST_DIR_NAMES = {"test", "tests", "__tests__", "spec"}
CONFIG_NAMES = {
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "pyproject.toml",
    "requirements.txt",
    "Dockerfile",
    "docker-compose.yml",
    ".env.example",
}


def _rel(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def expand_context(repo_root: Path, changed_files: list[str]) -> ContextExpansion:
    related_tests: list[str] = []
    related_config: list[str] = []
    gaps: list[str] = []

    changed_stems = {Path(path).stem.lower().replace("test_", "").replace(".test", "") for path in changed_files}

    if not repo_root.exists():
        return ContextExpansion(gaps=[f"Repository root not found: {repo_root}"])

    for path in repo_root.rglob("*"):
        if not path.is_file():
            continue
        rel = _rel(path, repo_root)
        parts = set(path.parts)
        name = path.name

        if name in CONFIG_NAMES:
            related_config.append(rel)

        if TEST_DIR_NAMES.intersection(parts) or name.startswith("test_") or ".test." in name or ".spec." in name:
            lower = rel.lower()
            if any(stem and stem in lower for stem in changed_stems):
                related_tests.append(rel)

    if not related_tests:
        gaps.append("No nearby tests found for changed file names")

    return ContextExpansion(
        related_tests=sorted(set(related_tests)),
        related_config=sorted(set(related_config)),
        gaps=gaps,
    )
