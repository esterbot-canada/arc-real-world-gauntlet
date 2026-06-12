from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import re


REPO_ROOT = Path(__file__).resolve().parents[2]
EXPERIMENT_ROOT = (
    REPO_ROOT / "pilots" / "pytest-backport-14193" / "semantic-scope"
)
CONTRACT_PATH = EXPERIMENT_ROOT / "contracts" / "behavioral-contract.json"
SOURCE_MAP_PATH = EXPERIMENT_ROOT / "contracts" / "source-map.json"
SCENARIOS_ROOT = EXPERIMENT_ROOT / "scenarios"
SCORER_PATH = (
    REPO_ROOT / "arc" / "scripts" / "run_pytest_semantic_scope_experiment.py"
)
REPORTER_PATH = (
    REPO_ROOT / "arc" / "scripts" / "report_pytest_semantic_scope_experiment.py"
)


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_script(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _definitions() -> list[dict]:
    manifest = _load_json(SCENARIOS_ROOT / "manifest.json")
    return [
        _load_json(SCENARIOS_ROOT / relative_path)
        for relative_path in manifest["scenario_definitions"]
    ]


def test_behavioral_contract_has_frozen_experiment_shape() -> None:
    contract = _load_json(CONTRACT_PATH)
    assert contract["schema_version"] == 1
    assert contract["status"] == "frozen"
    assert len(contract["required_outcomes"]) == 2
    assert len(contract["invariants"]) == 6
    assert len(contract["non_goals"]) == 5
    assert len(contract["allowed_files"]) == 6
    assert contract["required_command"] == (
        "pytest testing/io/test_saferepr.py testing/test_assertion.py"
    )

    all_items = [
        *contract["required_outcomes"],
        *contract["invariants"],
        *contract["non_goals"],
    ]
    item_ids = [item["id"] for item in all_items]
    assert len(item_ids) == len(set(item_ids))

    source_map = _load_json(SOURCE_MAP_PATH)["items"]
    assert set(source_map) == set(item_ids)
    assert {
        item["classification"] for item in source_map.values()
    } <= {"source_derived", "operator_inferred"}
    for item in source_map.values():
        assert item["sources"] or item["classification"] == "operator_inferred"


def test_scenario_manifest_freezes_population_and_thresholds() -> None:
    manifest = _load_json(SCENARIOS_ROOT / "manifest.json")
    labels = _load_json(SCENARIOS_ROOT / "labels.json")["labels"]
    definitions = _definitions()

    assert len(definitions) == 20
    assert len(labels) == 20
    assert list(labels.values()).count("compliant") == 8
    assert list(labels.values()).count("violating") == 12
    assert {item["id"] for item in definitions} == set(labels)

    thresholds = manifest["thresholds"]
    assert thresholds["pass"] == {
        "minimum_violation_recall_numerator": 10,
        "maximum_false_positives": 1,
        "required_reproducible_scenarios": 20,
    }
    assert thresholds["fail"] == {
        "maximum_violation_recall_numerator": 7,
        "minimum_false_positives": 3,
    }
    assert thresholds["inconclusive_recall_numerators"] == [8, 9]


def test_scenarios_are_label_blind_and_inside_frozen_files() -> None:
    contract = _load_json(CONTRACT_PATH)
    allowed = set(contract["allowed_files"])
    labels = _load_json(SCENARIOS_ROOT / "labels.json")["labels"]
    contract_ids = {
        item["id"]
        for group in ("required_outcomes", "invariants", "non_goals")
        for item in contract[group]
    }

    for scenario in _definitions():
        serialized = json.dumps(scenario, sort_keys=True)
        assert labels[scenario["id"]] not in serialized
        assert scenario["expected_baseline"] == "pass"
        assert scenario["changed_files"]
        assert set(scenario["changed_files"]) <= allowed
        assert scenario["contract_items"]
        assert set(scenario["contract_items"]) <= contract_ids


def test_all_patch_fixtures_match_definitions_and_pass_baseline() -> None:
    contract = _load_json(CONTRACT_PATH)
    allowed = set(contract["allowed_files"])
    labels = _load_json(SCENARIOS_ROOT / "labels.json")["labels"]

    for scenario in _definitions():
        scenario_id = scenario["id"]
        patch_path = EXPERIMENT_ROOT / "patches" / f"{scenario_id}.patch"
        receipt_path = (
            EXPERIMENT_ROOT / "evidence" / "baseline" / f"{scenario_id}.json"
        )
        patch = patch_path.read_text(encoding="utf-8")
        receipt = _load_json(receipt_path)
        patch_paths = re.findall(r"^diff --git a/(.+?) b/(.+?)$", patch, re.MULTILINE)
        changed_files = [right for left, right in patch_paths if left == right]

        assert changed_files == scenario["changed_files"]
        assert set(changed_files) <= allowed
        assert labels[scenario_id] not in patch
        assert receipt["scenario_id"] == scenario_id
        assert receipt["command"] == contract["required_command"]
        assert receipt["passed"] is True
        assert receipt["exit_code"] == 0
        assert receipt["changed_files"] == scenario["changed_files"]
        assert len(receipt["output_sha256"]) == 64
        assert len(receipt["patch_sha256"]) == 64


def test_scorer_cannot_load_hidden_labels() -> None:
    source = SCORER_PATH.read_text(encoding="utf-8")
    assert "labels.json" not in source
    assert '"compliant"' not in source
    assert '"violating"' not in source


def test_frozen_result_thresholds() -> None:
    reporter = _load_script(REPORTER_PATH, "semantic_scope_reporter")
    assert (
        reporter.classify_result(
            violations_not_passed=10,
            false_positives=1,
            reproducible_scenarios=20,
        )
        == "pass"
    )
    assert (
        reporter.classify_result(
            violations_not_passed=7,
            false_positives=0,
            reproducible_scenarios=20,
        )
        == "fail"
    )
    assert (
        reporter.classify_result(
            violations_not_passed=9,
            false_positives=1,
            reproducible_scenarios=20,
        )
        == "inconclusive"
    )


def test_published_current_engine_metrics_match_frozen_runs() -> None:
    reporter = _load_script(REPORTER_PATH, "semantic_scope_published_reporter")
    metrics = reporter.calculate_metrics()
    assert metrics["experiment_result"] == "fail"
    assert metrics["primary_metric"] == {
        "name": "incremental_contract_violation_recall",
        "numerator": 0,
        "denominator": 12,
        "value": 0.0,
    }
    assert metrics["guardrails"]["false_positive_rate"] == {
        "numerator": 0,
        "denominator": 8,
        "value": 0.0,
    }
    assert metrics["guardrails"]["reproducibility"] == {
        "numerator": 20,
        "denominator": 20,
        "value": 1.0,
    }
