from __future__ import annotations

import importlib.util
import hashlib
import json
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "arc" / "scripts" / "run_pytest_pilot.py"
PILOT_ROOT = REPO_ROOT / "pilots" / "pytest-backport-14193"


def _load_runner():
    spec = importlib.util.spec_from_file_location("run_pytest_pilot", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_all_pytest_pilot_scenarios_match_expected_verdicts() -> None:
    runner = _load_runner()
    results = [runner.run_scenario(path, write=False) for path in runner.scenario_paths()]
    assert results == [
        (True, "needs_review", "needs_review"),
        (True, "needs_review", "needs_review"),
        (True, "needs_review", "needs_review"),
        (True, "blocked", "blocked"),
    ]


def test_post_cutoff_outcome_is_not_a_scenario_input() -> None:
    manifest = json.loads(
        (PILOT_ROOT / "scenarios" / "manifest.json").read_text(encoding="utf-8")
    )
    serialized = json.dumps(manifest, sort_keys=True)
    assert "14366" not in serialized
    assert "post-cutoff" not in serialized


def test_historical_brief_discloses_reconstructed_contract() -> None:
    runner = _load_runner()
    scenario = json.loads(
        (PILOT_ROOT / "scenarios" / "historical-backport.json").read_text(
            encoding="utf-8"
        )
    )
    evaluation = runner.evaluate_scenario(scenario)
    markdown = runner._render(scenario, evaluation)
    assert "pytest did not create or approve this ARC contract" in markdown
    assert "Patch-release suitability has no frozen approval evidence" in markdown


def test_published_contract_hash_matches_canonical_contract_fields() -> None:
    contract = yaml.safe_load(
        (
            PILOT_ROOT / "contracts" / "pytest-backport-14193.aiplan"
        ).read_text(encoding="utf-8")
    )
    canonical = {
        key: contract[key]
        for key in (
            "status",
            "allowed_scope",
            "excluded_scope",
            "expected_evidence",
        )
    }
    digest = hashlib.sha256(
        json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    assert contract["freeze"]["contract_hash"] == f"sha256:{digest}"


def test_historical_patch_hash_matches_manifest() -> None:
    manifest = json.loads(
        (PILOT_ROOT / "scenarios" / "manifest.json").read_text(encoding="utf-8")
    )
    patch = (
        PILOT_ROOT / "evidence" / "patches" / "historical-backport.patch"
    ).read_bytes()
    assert hashlib.sha256(patch).hexdigest() == manifest["patch_sha256"]
