from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import replace
from pathlib import Path

import yaml

from agent_work_evidence.boundary_evaluator import evaluate_boundaries
from agent_work_evidence.command_receipts import CommandReceipt, CommandResult
from agent_work_evidence.contract import (
    AssignmentContract,
    ExpectedEvidence,
    ScopePolicy,
)
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
SCENARIOS_ROOT = REPO_ROOT / ".arc" / "scenarios"
OUTPUT_ROOT = REPO_ROOT / ".arc" / "tmp" / "gauntlet"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_plan(path: Path) -> tuple[AssignmentContract, tuple[str, ...]]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    expected = data.get("expected_evidence", {})
    return (
        AssignmentContract(
            schema_version=1,
            status=data["status"],
            allowed_scope=ScopePolicy(tuple(data["allowed_scope"]["files"])),
            excluded_scope=ScopePolicy(tuple(data["excluded_scope"]["files"])),
            expected_evidence=ExpectedEvidence(
                tuple(expected.get("required_commands", []))
            ),
            approved_exceptions=(),
        ),
        tuple(expected.get("required_changed_files", [])),
    )


def _trusted_receipt(fixture: dict) -> CommandReceipt | None:
    trusted = [
        item
        for item in fixture.get("receipts", [])
        if item.get("provenance") == "trusted_ci"
    ]
    if not trusted:
        return None
    results = tuple(
        CommandResult(
            command=item["command"],
            exit_code=item.get("exitCode"),
            duration_ms=0,
            timed_out=False,
            output_sha256=hashlib.sha256(
                json.dumps(item, sort_keys=True).encode("utf-8")
            ).hexdigest(),
        )
        for item in trusted
    )
    return CommandReceipt(
        schema_version=1,
        repository="arc-real-world-gauntlet",
        commit_sha="gauntlet-fixture",
        generated_at="2026-06-11T00:00:00Z",
        results=results,
    )


def _extra_findings(
    contract: AssignmentContract,
    required_changed_files: tuple[str, ...],
    fixture: dict,
) -> list[BoundaryFinding]:
    findings: list[BoundaryFinding] = []
    if contract.allowed_scope.files == ("**",):
        findings.append(
            BoundaryFinding(
                rule_id="contract_quality",
                severity="blocked",
                message="Allowed scope glob is too broad for a frozen verifier contract",
                evidence=["allowed_scope.files contains only **"],
            )
        )

    changed_files = set(fixture["changedFiles"])
    missing = [
        path for path in required_changed_files if path not in changed_files
    ]
    if missing:
        findings.append(
            BoundaryFinding(
                rule_id="required_changed_files",
                severity="needs_review",
                message="Required changed-file evidence is missing",
                evidence=[f"Missing required changed file: {path}" for path in missing],
            )
        )

    changed_texts = fixture.get("changedFileTexts", {})
    boundary_refs = [
        f"{path} references excluded auth code"
        for path, text in changed_texts.items()
        if "../auth/" in text
    ]
    if boundary_refs:
        findings.append(
            BoundaryFinding(
                rule_id="import_boundary",
                severity="needs_review",
                message="A changed file reaches into excluded code",
                evidence=boundary_refs,
            )
        )
    return findings


def _merge_evaluation(
    base: ContractEvaluation, extras: list[BoundaryFinding]
) -> ContractEvaluation:
    findings = [*base.findings, *extras]
    verdict = (
        "blocked"
        if any(item.severity == "blocked" for item in findings)
        else "needs_review"
        if findings
        else "pass"
    )
    return replace(base, verdict=verdict, findings=findings)


def _render(
    scenario_id: str,
    changed_files: list[str],
    evaluation: ContractEvaluation,
) -> str:
    brief = EvidenceBrief(
        repo="esterbot-canada/arc-real-world-gauntlet",
        pr_number=0,
        title=scenario_id,
        scope=ScopeEvidence(status="clear"),
        confidence="high",
        changed_files=changed_files,
        contract_evaluation=evaluation,
    )
    return render_trust_brief_markdown(build_trust_brief_document(brief))


def run_scenario(scenario_id: str) -> tuple[bool, str, str]:
    scenario_dir = SCENARIOS_ROOT / scenario_id
    fixture = _load_json(scenario_dir / "fixture.json")
    expected = _load_json(scenario_dir / "expected.json")
    contract, required_changed_files = _load_plan(
        scenario_dir / "plan.aiplan"
    )
    if contract.allowed_scope.files == ("**",):
        evaluation = ContractEvaluation(verdict="pass")
    else:
        evaluation = evaluate_boundaries(
            contract,
            RepositoryRules(schema_version=1, rules=()),
            fixture["changedFiles"],
            command_receipt=_trusted_receipt(fixture),
        )
    evaluation = _merge_evaluation(
        evaluation,
        _extra_findings(contract, required_changed_files, fixture),
    )
    markdown = _render(scenario_id, fixture["changedFiles"], evaluation)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUTPUT_ROOT / f"{scenario_id}.md").write_text(markdown, encoding="utf-8")

    expected_verdict = expected["expectedVerdict"].lower().replace(" ", "_")
    required_text = [
        "ARC Trust Brief",
        "ARC checks assignment boundaries and required evidence",
    ]
    ok = evaluation.verdict == expected_verdict and all(
        text in markdown for text in required_text
    )
    return ok, expected_verdict, evaluation.verdict


def main() -> int:
    parser = argparse.ArgumentParser(description="Run ARC gauntlet fixtures")
    parser.add_argument("scenario_ids", nargs="*")
    args = parser.parse_args()

    scenario_ids = args.scenario_ids or sorted(
        path.name
        for path in SCENARIOS_ROOT.iterdir()
        if path.is_dir() and (path / "fixture.json").is_file()
    )
    failures = []
    for scenario_id in scenario_ids:
        ok, expected, actual = run_scenario(scenario_id)
        print(
            f"{'PASS' if ok else 'FAIL'} {scenario_id}: "
            f"expected {expected}, got {actual}"
        )
        if not ok:
            failures.append(scenario_id)

    if failures:
        print(f"\nFailed scenarios: {', '.join(failures)}")
        return 1
    print(f"\nARC gauntlet fixtures passed: {len(scenario_ids)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
