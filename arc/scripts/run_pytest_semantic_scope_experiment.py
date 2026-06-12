from __future__ import annotations

import hashlib
import json
from pathlib import Path

from agent_work_evidence.boundary_evaluator import evaluate_boundaries
from agent_work_evidence.command_receipts import CommandReceipt, CommandResult
from agent_work_evidence.contract import AssignmentContract, ExpectedEvidence, ScopePolicy
from agent_work_evidence.repository_rules import RepositoryRules


REPO_ROOT = Path(__file__).resolve().parents[2]
EXPERIMENT_ROOT = (
    REPO_ROOT / "pilots" / "pytest-backport-14193" / "semantic-scope"
)
CONTRACT_PATH = EXPERIMENT_ROOT / "contracts" / "behavioral-contract.json"
SCENARIOS_ROOT = EXPERIMENT_ROOT / "scenarios"
BASELINE_ROOT = EXPERIMENT_ROOT / "evidence" / "baseline"
OUTPUT_ROOT = EXPERIMENT_ROOT / "evidence" / "current-engine"
ENGINE_ROOT = REPO_ROOT / "arc" / "src" / "agent_work_evidence"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _sha256_bytes(*values: bytes) -> str:
    digest = hashlib.sha256()
    for value in values:
        digest.update(len(value).to_bytes(8, "big"))
        digest.update(value)
    return digest.hexdigest()


def _engine_hash() -> str:
    values: list[bytes] = []
    for path in sorted(ENGINE_ROOT.glob("*.py")):
        values.extend(
            [
                path.name.encode(),
                path.read_bytes(),
            ]
        )
    return _sha256_bytes(*values)


def _contract() -> tuple[AssignmentContract, str]:
    raw = CONTRACT_PATH.read_bytes()
    data = json.loads(raw)
    return (
        AssignmentContract(
            schema_version=1,
            status="frozen",
            allowed_scope=ScopePolicy(tuple(data["allowed_files"])),
            excluded_scope=ScopePolicy(()),
            expected_evidence=ExpectedEvidence((data["required_command"],)),
            approved_exceptions=(),
        ),
        hashlib.sha256(raw).hexdigest(),
    )


def _definitions() -> list[tuple[dict, Path]]:
    manifest = _load_json(SCENARIOS_ROOT / "manifest.json")
    return [
        (
            _load_json(SCENARIOS_ROOT / relative_path),
            SCENARIOS_ROOT / relative_path,
        )
        for relative_path in manifest["scenario_definitions"]
    ]


def _receipt(raw: dict) -> CommandReceipt:
    return CommandReceipt(
        schema_version=1,
        repository="pytest-dev/pytest",
        commit_sha=raw["head_sha"],
        generated_at="2026-06-12T00:00:00Z",
        results=(
            CommandResult(
                command=raw["command"],
                exit_code=raw["exit_code"],
                duration_ms=raw["duration_ms"],
                timed_out=False,
                output_sha256=raw["output_sha256"],
            ),
        ),
    )


def _input_hash(definition_path: Path, receipt_path: Path, patch_path: Path) -> str:
    return _sha256_bytes(
        definition_path.read_bytes(),
        receipt_path.read_bytes(),
        patch_path.read_bytes(),
    )


def score_run(run_number: int) -> list[dict]:
    contract, contract_hash = _contract()
    engine_hash = _engine_hash()
    run_root = OUTPUT_ROOT / f"run-{run_number}"
    run_root.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []

    for definition, definition_path in _definitions():
        scenario_id = definition["id"]
        receipt_path = BASELINE_ROOT / f"{scenario_id}.json"
        patch_path = EXPERIMENT_ROOT / "patches" / f"{scenario_id}.patch"
        baseline = _load_json(receipt_path)
        if baseline["passed"] is not True:
            raise RuntimeError(f"Baseline did not pass for {scenario_id}")

        evaluation = evaluate_boundaries(
            contract,
            RepositoryRules(schema_version=1, rules=()),
            definition["changed_files"],
            command_receipt=_receipt(baseline),
        )
        record = {
            "schema_version": 1,
            "scenario_id": scenario_id,
            "arc_verdict": evaluation.verdict,
            "finding_rule_ids": [finding.rule_id for finding in evaluation.findings],
            "engine_hash": engine_hash,
            "contract_hash": contract_hash,
            "input_hash": _input_hash(definition_path, receipt_path, patch_path),
        }
        (run_root / f"{scenario_id}.json").write_text(
            json.dumps(record, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        records.append(record)

    return records


def main() -> int:
    for run_number in range(1, 4):
        records = score_run(run_number)
        counts: dict[str, int] = {}
        for record in records:
            verdict = record["arc_verdict"]
            counts[verdict] = counts.get(verdict, 0) + 1
        print(f"run-{run_number}: {json.dumps(counts, sort_keys=True)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
