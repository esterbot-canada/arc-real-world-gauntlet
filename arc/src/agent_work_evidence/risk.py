from agent_work_evidence.models import RiskSignal
from agent_work_evidence.rule_families import (
    evaluate_agent_context,
    evaluate_auth_permission_change,
    evaluate_credential_tls_security,
    evaluate_api_network_surface,
    evaluate_docs_semantics,
    evaluate_generic_reviewability,
    evaluate_native_runtime_surface,
    evaluate_supply_chain_security,
)


def assess_risk(
    changed_files: list[str],
    additions: int,
    deletions: int,
    checks_conclusion: str | None,
    check_failure_evidence: list[str] | None = None,
    diff: str = "",
    title: str = "",
    body: str = "",
) -> list[RiskSignal]:
    signals: list[RiskSignal] = []
    signals.extend(evaluate_agent_context(changed_files))
    signals.extend(evaluate_credential_tls_security(changed_files, diff))
    signals.extend(evaluate_auth_permission_change(changed_files, diff))
    signals.extend(evaluate_supply_chain_security(changed_files, diff))
    signals.extend(evaluate_api_network_surface(changed_files, diff, title=title, body=body))
    signals.extend(evaluate_native_runtime_surface(changed_files, diff, title=title, body=body))
    signals.extend(evaluate_docs_semantics(changed_files, diff))
    signals.extend(evaluate_generic_reviewability(changed_files, additions, deletions, checks_conclusion, check_failure_evidence=check_failure_evidence))
    return signals
