import json
from pathlib import Path

from agent_work_evidence.risk import assess_risk


def test_real_pr_expectation_fixtures():
    fixture_path = Path(__file__).parent / "fixtures" / "real_pr_expectations.json"
    cases = json.loads(fixture_path.read_text())
    for case in cases:
        signals = assess_risk(
            changed_files=case["changed_files"],
            additions=case["additions"],
            deletions=case["deletions"],
            checks_conclusion=case["checks_conclusion"],
            diff=case["diff"],
        )
        names = {signal.name for signal in signals}
        for expected in case["must_include"]:
            assert expected in names, f"{case['name']} missing {expected}: {names}"
        for forbidden in case["must_not_include"]:
            assert forbidden not in names, f"{case['name']} unexpectedly included {forbidden}: {names}"
