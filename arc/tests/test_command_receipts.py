import json
import subprocess
from datetime import datetime, timezone

import pytest

from agent_work_evidence import command_receipts
from agent_work_evidence.command_receipts import (
    CommandVerificationError,
    execute_required_commands,
    receipt_json,
)


def test_execute_required_commands_records_pass_and_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(command_receipts, "local_head_sha", lambda repo_root: "abc123")
    monkeypatch.setattr(command_receipts, "ensure_clean_checkout", lambda repo_root: None)
    completed = [
        subprocess.CompletedProcess("pytest -q", 0, "passed", ""),
        subprocess.CompletedProcess("ruff check .", 1, "", "lint failed"),
    ]
    monkeypatch.setattr(command_receipts.subprocess, "run", lambda *args, **kwargs: completed.pop(0))

    receipt = execute_required_commands(
        repository="owner/repo",
        repo_root=tmp_path,
        reviewed_sha="abc123",
        commands=["pytest -q", "ruff check ."],
        timeout_seconds=30,
        now=lambda: datetime(2026, 6, 6, tzinfo=timezone.utc),
    )

    assert receipt.commit_sha == "abc123"
    assert receipt.generated_at == "2026-06-06T00:00:00Z"
    assert receipt.results[0].passed
    assert not receipt.results[1].passed
    assert len(receipt.results[0].output_sha256) == 64


def test_execute_required_commands_records_timeout(tmp_path, monkeypatch):
    monkeypatch.setattr(command_receipts, "local_head_sha", lambda repo_root: "abc123")
    monkeypatch.setattr(command_receipts, "ensure_clean_checkout", lambda repo_root: None)

    def time_out(*args, **kwargs):
        raise subprocess.TimeoutExpired("slow-test", 1, output="partial", stderr="waiting")

    monkeypatch.setattr(command_receipts.subprocess, "run", time_out)

    receipt = execute_required_commands(
        repository="owner/repo",
        repo_root=tmp_path,
        reviewed_sha="abc123",
        commands=["slow-test"],
        timeout_seconds=1,
    )

    assert receipt.results[0].timed_out
    assert receipt.results[0].exit_code is None
    assert not receipt.results[0].passed


def test_execute_required_commands_rejects_sha_mismatch(tmp_path, monkeypatch):
    monkeypatch.setattr(command_receipts, "local_head_sha", lambda repo_root: "different")

    with pytest.raises(CommandVerificationError, match="does not match"):
        execute_required_commands(
            repository="owner/repo",
            repo_root=tmp_path,
            reviewed_sha="abc123",
            commands=["pytest -q"],
            timeout_seconds=30,
        )


def test_receipt_json_is_versioned_and_does_not_include_raw_output(tmp_path, monkeypatch):
    monkeypatch.setattr(command_receipts, "local_head_sha", lambda repo_root: "abc123")
    monkeypatch.setattr(command_receipts, "ensure_clean_checkout", lambda repo_root: None)
    monkeypatch.setattr(
        command_receipts.subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(
            "pytest -q", 0, "secret output", ""
        ),
    )
    receipt = execute_required_commands(
        repository="owner/repo",
        repo_root=tmp_path,
        reviewed_sha="abc123",
        commands=["pytest -q"],
        timeout_seconds=30,
        now=lambda: datetime(2026, 6, 6, tzinfo=timezone.utc),
    )

    serialized = receipt_json(receipt)
    parsed = json.loads(serialized)

    assert parsed["schema_version"] == 1
    assert parsed["results"][0]["command"] == "pytest -q"
    assert "secret output" not in serialized


def test_ensure_clean_checkout_rejects_local_changes(tmp_path, monkeypatch):
    monkeypatch.setattr(
        command_receipts.subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(
            "git status", 0, " M src/feature.py\n?? generated.py\n", ""
        ),
    )

    with pytest.raises(CommandVerificationError, match="uncommitted or untracked"):
        command_receipts.ensure_clean_checkout(tmp_path)
