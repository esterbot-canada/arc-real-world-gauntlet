from agent_work_evidence.scope import extract_scope_evidence


def test_scope_is_unclear_when_body_and_issue_missing():
    scope = extract_scope_evidence(title="Update code", body="", branch="agent/update", commits=[])
    assert scope.status == "unclear"
    assert "No PR body" in scope.gaps
    assert "No linked issue or task reference" in scope.gaps


def test_scope_is_partial_with_linked_issue():
    scope = extract_scope_evidence(
        title="Fix login redirect",
        body="Closes #42",
        branch="agent/fix-login-redirect",
        commits=[],
    )
    assert scope.status == "partial"
    assert any("linked issue" in signal.lower() for signal in scope.signals)
