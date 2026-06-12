from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import replace
from pathlib import Path

import yaml

from agent_work_evidence.boundary_evaluator import evaluate_boundaries
from agent_work_evidence.command_receipts import CommandReceipt, CommandResult
from agent_work_evidence.contract import AssignmentContract, ExpectedEvidence, ScopePolicy
from agent_work_evidence.models import (
    BoundaryFinding,
    ContractEvaluation,
    EvidenceBrief,
    ScopeEvidence,
)
from agent_work_evidence.repository_rules import RepositoryRules
from agent_work_evidence.trust_brief import (
    build_trust_brief_document,
    render_trust_brief_markdown,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
PILOT_ROOT = REPO_ROOT / "pilots" / "pytest-backport-14193"
SCENARIOS_ROOT = PILOT_ROOT / "scenarios"
OUTPUT_ROOT = PILOT_ROOT / "evidence" / "trust-briefs"
RAW_LOG_ROOT = PILOT_ROOT / "evidence" / "raw-logs"
CONTRACT_PATH = PILOT_ROOT / "contracts" / "pytest-backport-14193.aiplan"
REVIEWED_SHA = "1a81ee64323647045ab86af6096ace284f49d779"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_contract() -> AssignmentContract:
    data = yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))
    return AssignmentContract(
        schema_version=1,
        status=data["status"],
        allowed_scope=ScopePolicy(tuple(data["allowed_scope"]["files"])),
        excluded_scope=ScopePolicy(tuple(data["excluded_scope"]["files"])),
        expected_evidence=ExpectedEvidence(
            tuple(data["expected_evidence"]["required_commands"])
        ),
        approved_exceptions=(),
    )


def _load_receipt(scenario: dict) -> CommandReceipt | None:
    raw = scenario.get("receipt")
    if raw is None:
        return None
    result = CommandResult(
        command=raw["command"],
        exit_code=raw["exit_code"],
        duration_ms=1,
        timed_out=False,
        output_sha256=raw["output_sha256"],
    )
    return CommandReceipt(
        schema_version=1,
        repository="pytest-dev/pytest",
        commit_sha=REVIEWED_SHA,
        generated_at="2026-06-12T01:30:00Z",
        results=(result,),
    )


def _with_operator_findings(
    evaluation: ContractEvaluation, scenario: dict
) -> ContractEvaluation:
    extras = [
        BoundaryFinding(
            rule_id=item["rule_id"],
            severity=item["severity"],
            message=item["message"],
            evidence=item["evidence"],
        )
        for item in scenario.get("operator_findings", [])
    ]
    findings = [*evaluation.findings, *extras]
    verdict = (
        "blocked"
        if any(item.severity == "blocked" for item in findings)
        else "needs_review"
        if findings
        else "pass"
    )
    return replace(evaluation, verdict=verdict, findings=findings)


def evaluate_scenario(scenario: dict) -> ContractEvaluation:
    evaluation = evaluate_boundaries(
        _load_contract(),
        RepositoryRules(schema_version=1, rules=()),
        scenario["changed_files"],
        command_receipt=_load_receipt(scenario),
        command_verification_gap=(
            "Public GitHub CI is not a same-run ARC receipt for the exact command"
            if scenario["id"] == "historical-backport"
            else None
        ),
    )
    return _with_operator_findings(evaluation, scenario)


def _render(scenario: dict, evaluation: ContractEvaluation) -> str:
    brief = EvidenceBrief(
        repo="pytest-dev/pytest",
        pr_number=14193,
        title=scenario["id"],
        scope=ScopeEvidence(status="clear"),
        confidence="medium",
        changed_files=scenario["changed_files"],
        contract_evaluation=evaluation,
    )
    warning = (
        "> Retrospective warning: pytest did not create or approve this ARC "
        "contract. It was reconstructed from public pre-cutoff artifacts.\n\n"
    )
    return warning + render_trust_brief_markdown(build_trust_brief_document(brief))


def run_scenario(scenario_path: Path, *, write: bool = True) -> tuple[bool, str, str]:
    scenario = _load_json(scenario_path)
    evaluation = evaluate_scenario(scenario)
    markdown = _render(scenario, evaluation)
    if write:
        OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
        (OUTPUT_ROOT / f"{scenario['id']}.md").write_text(
            markdown, encoding="utf-8"
        )
        RAW_LOG_ROOT.mkdir(parents=True, exist_ok=True)
        log_lines = [
            f"scenario={scenario['id']}",
            "repository=pytest-dev/pytest",
            "pull_request=14193",
            "base_sha=1cb94d2832254c1d412ab69c9947eb303199d5b9",
            f"head_sha={REVIEWED_SHA}",
            f"expected_verdict={scenario['expected_verdict']}",
            f"actual_verdict={evaluation.verdict}",
            "changed_files=" + ",".join(scenario["changed_files"]),
            "findings=" + ",".join(item.rule_id for item in evaluation.findings),
        ]
        (RAW_LOG_ROOT / f"{scenario['id']}.log").write_text(
            "\n".join(log_lines) + "\n", encoding="utf-8"
        )
    expected = scenario["expected_verdict"]
    return evaluation.verdict == expected, expected, evaluation.verdict


def scenario_paths() -> list[Path]:
    manifest = _load_json(SCENARIOS_ROOT / "manifest.json")
    return [SCENARIOS_ROOT / name for name in manifest["scenarios"]]


def write_checksums() -> None:
    checksum_path = PILOT_ROOT / "SHA256SUMS"
    files = sorted(
        path
        for path in PILOT_ROOT.rglob("*")
        if path.is_file() and path != checksum_path
    )
    lines = []
    for path in files:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        lines.append(f"{digest}  {path.relative_to(PILOT_ROOT).as_posix()}")
    checksum_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run pytest PR #14193 ARC pilot")
    parser.add_argument("scenario_ids", nargs="*")
    parser.add_argument("--write-checksums", action="store_true")
    args = parser.parse_args()

    selected = set(args.scenario_ids)
    paths = [
        path
        for path in scenario_paths()
        if not selected or path.stem in selected
    ]
    failures = []
    for path in paths:
        ok, expected, actual = run_scenario(path)
        print(
            f"{'PASS' if ok else 'FAIL'} {path.stem}: "
            f"expected {expected}, got {actual}"
        )
        if not ok:
            failures.append(path.stem)

    if failures:
        print(f"\nFailed scenarios: {', '.join(failures)}")
        return 1
    if args.write_checksums:
        write_checksums()
    print(f"\nPytest retrospective scenarios passed: {len(paths)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
