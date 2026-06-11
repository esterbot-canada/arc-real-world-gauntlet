import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from agent_work_evidence.boundary_evaluator import evaluate_boundaries
from agent_work_evidence.command_receipts import execute_required_commands
from agent_work_evidence.contract import load_contract
from agent_work_evidence.models import EvidenceBrief, ScopeEvidence
from agent_work_evidence.repository_rules import (
    load_repository_rules,
)
from agent_work_evidence.trust_brief import (
    TrustReceipt,
    build_trust_brief_document,
    render_trust_brief_json,
    render_trust_brief_markdown,
)

OUTPUT_DIR = Path(__file__).resolve().parent
REPOSITORY = "tkarcheski/robotframework-chat"
VERIFICATION_SCRIPT = """#!/bin/bash
echo "error: pmxbot/logging.py: No such file or directory" >&2
exit 1
"""


def _run(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> str:
    completed = subprocess.run(
        command,
        cwd=cwd,
        env=env,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return completed.stdout.strip()


def _evaluate_fixture():
    contract = load_contract(OUTPUT_DIR / "contract.json")
    rules = load_repository_rules(OUTPUT_DIR / "rules.json")
    with tempfile.TemporaryDirectory(prefix="arc-dogfood-") as raw_dir:
        repo_root = Path(raw_dir)
        (repo_root / "verification.sh").write_text(
            VERIFICATION_SCRIPT,
            encoding="utf-8",
        )
        _run(["git", "init", "-q"], repo_root)
        _run(["git", "add", "verification.sh"], repo_root)
        commit_env = {
            **os.environ,
            "GIT_AUTHOR_DATE": "2026-06-11T00:00:00Z",
            "GIT_COMMITTER_DATE": "2026-06-11T00:00:00Z",
        }
        _run(
            [
                "git",
                "-c",
                "user.name=ARC Dogfood",
                "-c",
                "user.email=arc@example.invalid",
                "commit",
                "-qm",
                "test: reproduce failed pilot verification",
            ],
            repo_root,
            env=commit_env,
        )
        reviewed_sha = _run(["git", "rev-parse", "HEAD"], repo_root)
        with patch(
            "agent_work_evidence.command_receipts.time.monotonic",
            side_effect=[0.0, 0.001],
        ):
            receipt = execute_required_commands(
                repository=REPOSITORY,
                repo_root=repo_root,
                reviewed_sha=reviewed_sha,
                commands=contract.expected_evidence.required_commands,
                timeout_seconds=30,
                now=lambda: datetime(2026, 6, 11, tzinfo=timezone.utc),
            )
        return evaluate_boundaries(
            contract,
            rules,
            ["pmxbot/logging.py"],
            command_receipt=receipt,
        )


def build_document():
    evaluation = _evaluate_fixture()
    brief = EvidenceBrief(
        repo=REPOSITORY,
        pr_number=407,
        title="SWE-bench pilot pytest-dev__pytest-11148",
        scope=ScopeEvidence(status="clear"),
        confidence="high",
        changed_files=[],
        contract_evaluation=evaluation,
    )
    return build_trust_brief_document(
        brief,
        agent_receipts=[
            TrustReceipt(
                provenance="agent_reported",
                label="Supplied result",
                value="passed: false, exit code: 1",
            ),
            TrustReceipt(
                provenance="agent_reported",
                label="Model identity",
                value="Ollama llama3:latest",
            ),
            TrustReceipt(
                provenance="agent_reported",
                label="Model digest",
                value=(
                    "365c0bd3c000a25d28ddbf732fe1c6add414de7275464c4e4d1c3b5fcb5d8ad1"
                ),
            ),
        ],
        operator_receipts=[
            TrustReceipt(
                provenance="operator_supplied",
                label="Contract provenance",
                value=(
                    "The scope contract was reconstructed after generation from "
                    "the gold patch; it was not frozen before the model ran"
                ),
            ),
            TrustReceipt(
                provenance="operator_supplied",
                label="Dogfood mode",
                value=(
                    "ARC reran a deterministic local reproduction of the pilot "
                    "failure; this is not the original Docker run receipt"
                ),
            ),
            TrustReceipt(
                provenance="operator_supplied",
                label="Published harness commit",
                value="9ae631d1ec350a8b9a0667c841fb4450c0e2964d",
            ),
        ],
    )


def main() -> None:
    document = build_document()
    (OUTPUT_DIR / "trust-brief.json").write_text(
        render_trust_brief_json(document),
        encoding="utf-8",
    )
    (OUTPUT_DIR / "trust-brief.md").write_text(
        render_trust_brief_markdown(document),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
