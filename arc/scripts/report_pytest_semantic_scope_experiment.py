from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
EXPERIMENT_ROOT = (
    REPO_ROOT / "pilots" / "pytest-backport-14193" / "semantic-scope"
)
SCENARIOS_ROOT = EXPERIMENT_ROOT / "scenarios"
RUNS_ROOT = EXPERIMENT_ROOT / "evidence" / "current-engine"
METRICS_PATH = EXPERIMENT_ROOT / "evidence" / "metrics.json"
RESULTS_PATH = EXPERIMENT_ROOT / "RESULTS.md"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def classify_result(
    *,
    violations_not_passed: int,
    false_positives: int,
    reproducible_scenarios: int,
) -> str:
    manifest = _load_json(SCENARIOS_ROOT / "manifest.json")
    thresholds = manifest["thresholds"]
    pass_threshold = thresholds["pass"]
    fail_threshold = thresholds["fail"]

    if (
        violations_not_passed <= fail_threshold["maximum_violation_recall_numerator"]
        or false_positives >= fail_threshold["minimum_false_positives"]
    ):
        return "fail"
    if (
        violations_not_passed
        >= pass_threshold["minimum_violation_recall_numerator"]
        and false_positives <= pass_threshold["maximum_false_positives"]
        and reproducible_scenarios
        == pass_threshold["required_reproducible_scenarios"]
    ):
        return "pass"
    return "inconclusive"


def _run_records(run_number: int) -> dict[str, dict]:
    return {
        path.stem: _load_json(path)
        for path in sorted((RUNS_ROOT / f"run-{run_number}").glob("semantic-*.json"))
    }


def calculate_metrics() -> dict:
    runs = [_run_records(number) for number in range(1, 4)]
    labels = _load_json(SCENARIOS_ROOT / "labels.json")["labels"]
    if any(set(run) != set(labels) for run in runs):
        raise RuntimeError("Run records and labels do not contain the same scenarios")

    scenario_results = []
    violations_not_passed = 0
    false_positives = 0
    reproducible_scenarios = 0

    for scenario_id, label in labels.items():
        verdicts = [run[scenario_id]["arc_verdict"] for run in runs]
        reproducible = len(set(verdicts)) == 1
        if reproducible:
            reproducible_scenarios += 1
        verdict = verdicts[0]
        if label == "violating" and verdict != "pass":
            violations_not_passed += 1
        if label == "compliant" and verdict != "pass":
            false_positives += 1
        scenario_results.append(
            {
                "scenario_id": scenario_id,
                "label": label,
                "verdicts": verdicts,
                "reproducible": reproducible,
            }
        )

    result = classify_result(
        violations_not_passed=violations_not_passed,
        false_positives=false_positives,
        reproducible_scenarios=reproducible_scenarios,
    )
    return {
        "schema_version": 1,
        "experiment_result": result,
        "primary_metric": {
            "name": "incremental_contract_violation_recall",
            "numerator": violations_not_passed,
            "denominator": 12,
            "value": violations_not_passed / 12,
        },
        "guardrails": {
            "false_positive_rate": {
                "numerator": false_positives,
                "denominator": 8,
                "value": false_positives / 8,
            },
            "reproducibility": {
                "numerator": reproducible_scenarios,
                "denominator": 20,
                "value": reproducible_scenarios / 20,
            },
        },
        "scenario_results": scenario_results,
    }


def _render(metrics: dict) -> str:
    primary = metrics["primary_metric"]
    false_positive = metrics["guardrails"]["false_positive_rate"]
    reproducibility = metrics["guardrails"]["reproducibility"]
    misses = [
        item["scenario_id"]
        for item in metrics["scenario_results"]
        if item["label"] == "violating" and item["verdicts"][0] == "pass"
    ]
    false_positives = [
        item["scenario_id"]
        for item in metrics["scenario_results"]
        if item["label"] == "compliant" and item["verdicts"][0] != "pass"
    ]
    return f"""# Pytest Semantic Scope Experiment Results

## Decision

Decide whether current ARC demonstrates semantic-scope value beyond path
allowlists and passing command receipts.

## Result: {metrics["experiment_result"].upper()}

The unchanged ARC engine prevented {primary["numerator"]} of
{primary["denominator"]} known behavioral contract violations from receiving
`Pass`.

## Metrics

- Incremental contract-violation recall: {primary["numerator"]}/{primary["denominator"]} ({primary["value"]:.1%})
- False-positive rate: {false_positive["numerator"]}/{false_positive["denominator"]} ({false_positive["value"]:.1%})
- Reproducibility: {reproducibility["numerator"]}/{reproducibility["denominator"]} ({reproducibility["value"]:.1%})

## Misses

{chr(10).join(f"- `{scenario_id}`" for scenario_id in misses) or "- None"}

## False Positives

{chr(10).join(f"- `{scenario_id}`" for scenario_id in false_positives) or "- None"}

## Interpretation

All 20 patches stayed inside the frozen file allowlist and passed the same
focused pytest command. The current ARC contract engine evaluates paths and
command evidence, so content-level contract violations received the same
verdict as compliant patches.

## Supported Claim

This controlled benchmark measures current ARC's incremental semantic-scope
recall for one pytest assignment.

## Unsupported Claims

This experiment does not measure reviewer time, production prevention,
cross-repository generality, adoption, or willingness to pay.

## Predetermined Next Action

Because the current engine failed the frozen recall threshold, do not market
the path pilot as semantic-scope enforcement. Use the miss categories to
design the smallest reusable behavioral-contract primitive in a separate
experiment.
"""


def main() -> int:
    metrics = calculate_metrics()
    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    METRICS_PATH.write_text(
        json.dumps(metrics, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    RESULTS_PATH.write_text(_render(metrics), encoding="utf-8")
    print(
        f"experiment={metrics['experiment_result']} "
        f"recall={metrics['primary_metric']['numerator']}/12 "
        f"false_positives={metrics['guardrails']['false_positive_rate']['numerator']}/8 "
        f"reproducibility={metrics['guardrails']['reproducibility']['numerator']}/20"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
