import hashlib
import json
import subprocess
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Sequence


class CommandVerificationError(ValueError):
    pass


@dataclass(frozen=True)
class CommandResult:
    command: str
    exit_code: int | None
    duration_ms: int
    timed_out: bool
    output_sha256: str

    @property
    def passed(self) -> bool:
        return not self.timed_out and self.exit_code == 0


@dataclass(frozen=True)
class CommandReceipt:
    schema_version: int
    repository: str
    commit_sha: str
    generated_at: str
    results: tuple[CommandResult, ...]


def local_head_sha(repo_root: Path) -> str:
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or "git rev-parse HEAD failed"
        raise CommandVerificationError(f"could not resolve local checkout SHA: {detail}")
    sha = completed.stdout.strip()
    if not sha:
        raise CommandVerificationError("local checkout SHA is empty")
    return sha


def ensure_clean_checkout(repo_root: Path) -> None:
    completed = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        cwd=repo_root,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or "git status failed"
        raise CommandVerificationError(
            f"could not inspect local checkout state: {detail}"
        )
    if completed.stdout.strip():
        raise CommandVerificationError(
            "local checkout has uncommitted or untracked changes"
        )


def _output_hash(stdout: str | bytes | None, stderr: str | bytes | None) -> str:
    def _bytes(value: str | bytes | None) -> bytes:
        if value is None:
            return b""
        if isinstance(value, bytes):
            return value
        return value.encode("utf-8", errors="replace")

    return hashlib.sha256(_bytes(stdout) + b"\0" + _bytes(stderr)).hexdigest()


def execute_required_commands(
    *,
    repository: str,
    repo_root: Path,
    reviewed_sha: str,
    commands: Sequence[str],
    timeout_seconds: int,
    now: Callable[[], datetime] | None = None,
) -> CommandReceipt:
    if timeout_seconds < 1:
        raise CommandVerificationError("command timeout must be at least 1 second")
    local_sha = local_head_sha(repo_root)
    if local_sha != reviewed_sha:
        raise CommandVerificationError(
            f"local checkout SHA {local_sha} does not match reviewed PR SHA {reviewed_sha}"
        )
    ensure_clean_checkout(repo_root)

    results: list[CommandResult] = []
    for command in commands:
        started = time.monotonic()
        try:
            completed = subprocess.run(
                command,
                cwd=repo_root,
                shell=True,
                executable="/bin/bash",
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout_seconds,
            )
            duration_ms = max(0, round((time.monotonic() - started) * 1000))
            results.append(
                CommandResult(
                    command=command,
                    exit_code=completed.returncode,
                    duration_ms=duration_ms,
                    timed_out=False,
                    output_sha256=_output_hash(completed.stdout, completed.stderr),
                )
            )
        except subprocess.TimeoutExpired as error:
            duration_ms = max(0, round((time.monotonic() - started) * 1000))
            results.append(
                CommandResult(
                    command=command,
                    exit_code=None,
                    duration_ms=duration_ms,
                    timed_out=True,
                    output_sha256=_output_hash(error.stdout, error.stderr),
                )
            )

    clock = now or (lambda: datetime.now(timezone.utc))
    return CommandReceipt(
        schema_version=1,
        repository=repository,
        commit_sha=reviewed_sha,
        generated_at=clock().astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        results=tuple(results),
    )


def receipt_json(receipt: CommandReceipt) -> str:
    return json.dumps(asdict(receipt), indent=2, sort_keys=True) + "\n"


def write_receipt(receipt: CommandReceipt, path: Path) -> None:
    path.write_text(receipt_json(receipt), encoding="utf-8")
