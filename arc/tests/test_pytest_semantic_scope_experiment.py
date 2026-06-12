from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
EXPERIMENT_ROOT = (
    REPO_ROOT / "pilots" / "pytest-backport-14193" / "semantic-scope"
)
CONTRACT_PATH = EXPERIMENT_ROOT / "contracts" / "behavioral-contract.json"
SOURCE_MAP_PATH = EXPERIMENT_ROOT / "contracts" / "source-map.json"
SCENARIOS_ROOT = EXPERIMENT_ROOT / "scenarios"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


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
