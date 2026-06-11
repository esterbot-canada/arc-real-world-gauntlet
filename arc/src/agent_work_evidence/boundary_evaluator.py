from pathlib import Path

from agent_work_evidence.command_receipts import CommandReceipt
from agent_work_evidence.contract import AssignmentContract
from agent_work_evidence.models import BoundaryFinding, ContractEvaluation
from agent_work_evidence.path_policy import (
    PathPolicyError,
    matches_any_glob,
    matches_glob,
    normalize_repo_path,
)
from agent_work_evidence.repository_rules import (
    ImportBoundaryRule,
    ProtectedPathRule,
    RepositoryRules,
)
from agent_work_evidence.ts_import_graph import resolve_import_origins


def _finding_key(finding: BoundaryFinding) -> tuple[str, str, str, tuple[str, ...]]:
    return (
        finding.rule_id,
        finding.severity,
        finding.message,
        tuple(finding.evidence),
    )


def _verdict(findings: list[BoundaryFinding]) -> str:
    if any(finding.severity == "blocked" for finding in findings):
        return "blocked"
    if findings:
        return "needs_review"
    return "pass"


def _matching_exception(
    contract: AssignmentContract,
    rule_id: str,
    path: str,
):
    for exception in contract.approved_exceptions:
        if exception.rule_id == rule_id and path in exception.files:
            return exception
    return None


def evaluate_boundaries(
    contract: AssignmentContract,
    repository_rules: RepositoryRules,
    changed_files: list[str],
    repo_root: Path | None = None,
    command_receipt: CommandReceipt | None = None,
    command_verification_gap: str | None = None,
) -> ContractEvaluation:
    findings: list[BoundaryFinding] = []
    verified_evidence: list[str] = []
    normalized_files: list[str] = []
    for raw_path in changed_files:
        try:
            normalized_files.append(normalize_repo_path(raw_path))
        except PathPolicyError as error:
            findings.append(
                BoundaryFinding(
                    rule_id="contract-path",
                    severity="blocked",
                    message=f"Changed file path is invalid: {raw_path}",
                    evidence=[str(error)],
                )
            )

    protected_rules = [
        rule for rule in repository_rules.rules if isinstance(rule, ProtectedPathRule)
    ]
    import_rules = [
        rule for rule in repository_rules.rules if isinstance(rule, ImportBoundaryRule)
    ]

    for path in normalized_files:
        if matches_any_glob(path, contract.excluded_scope.files):
            findings.append(
                BoundaryFinding(
                    rule_id="excluded_scope",
                    severity="blocked",
                    message=f"{path} is inside frozen excluded scope",
                    evidence=[path],
                )
            )

        for rule in protected_rules:
            if not matches_any_glob(path, rule.files):
                continue
            exception = _matching_exception(contract, rule.id, path)
            if exception:
                findings.append(
                    BoundaryFinding(
                        rule_id=rule.id,
                        severity="needs_review",
                        message=f"{path} uses a frozen protected-path exception",
                        evidence=[path, f"Exception reason: {exception.reason}"],
                    )
                )
            else:
                findings.append(
                    BoundaryFinding(
                        rule_id=rule.id,
                        severity="blocked",
                        message=f"{path} violates protected path rule {rule.id}",
                        evidence=[path, *[f"Rule denies {pattern}" for pattern in rule.files]],
                    )
                )

        if not matches_any_glob(path, contract.allowed_scope.files):
            findings.append(
                BoundaryFinding(
                    rule_id="allowed_scope",
                    severity="needs_review",
                    message=f"{path} is outside frozen allowed scope",
                    evidence=[path],
                )
            )

    required_commands = contract.expected_evidence.required_commands
    if required_commands:
        if command_receipt is None:
            evidence = [
                f"Unverified required command: {command}"
                for command in required_commands
            ]
            if command_verification_gap:
                evidence.insert(0, command_verification_gap)
            findings.append(
                BoundaryFinding(
                    rule_id="required_commands",
                    severity="needs_review",
                    message="Required commands do not have same-run ARC verification",
                    evidence=evidence,
                )
            )
        else:
            results_by_command = {
                result.command: result for result in command_receipt.results
            }
            missing_commands = [
                command for command in required_commands if command not in results_by_command
            ]
            if missing_commands:
                findings.append(
                    BoundaryFinding(
                        rule_id="required_commands",
                        severity="needs_review",
                        message="ARC command verification is incomplete",
                        evidence=[
                            f"Missing command result: {command}"
                            for command in missing_commands
                        ],
                    )
                )
            for command in required_commands:
                result = results_by_command.get(command)
                if result is None:
                    continue
                result_evidence = [
                    f"Command: {command}",
                    f"Commit: {command_receipt.commit_sha}",
                    f"Duration: {result.duration_ms}ms",
                    f"Output SHA-256: {result.output_sha256}",
                ]
                if result.passed:
                    verified_evidence.append(
                        f"Required command passed on {command_receipt.commit_sha}: {command} "
                        f"({result.duration_ms}ms, output {result.output_sha256})"
                    )
                    continue
                status = "timed out" if result.timed_out else f"exited {result.exit_code}"
                findings.append(
                    BoundaryFinding(
                        rule_id="required_commands",
                        severity="blocked",
                        message=f"Required command failed: {command}",
                        evidence=[f"Status: {status}", *result_evidence[1:]],
                    )
                )

    for rule in import_rules:
        candidates = [
            path
            for path in normalized_files
            if path.endswith((".ts", ".tsx"))
            and matches_any_glob(path, rule.from_patterns)
        ]
        if not candidates:
            continue
        if repo_root is None:
            findings.append(
                BoundaryFinding(
                    rule_id=rule.id,
                    severity="needs_review",
                    message=f"Import boundary {rule.id} could not be analyzed without a local checkout",
                    evidence=[f"Changed TypeScript file: {path}" for path in candidates],
                )
            )
            continue

        for path in candidates:
            importer = repo_root / path
            if not importer.is_file():
                findings.append(
                    BoundaryFinding(
                        rule_id=rule.id,
                        severity="needs_review",
                        message=f"Import boundary {rule.id} could not read changed file {path}",
                        evidence=[f"Missing local file: {importer}"],
                    )
                )
                continue
            resolution = resolve_import_origins(importer, repo_root)
            for gap in resolution.gaps:
                findings.append(
                    BoundaryFinding(
                        rule_id=rule.id,
                        severity="needs_review",
                        message=f"Import boundary {rule.id} has unresolved analysis for {path}",
                        evidence=[gap],
                    )
                )
            for local_name, origin in resolution.resolved.items():
                denied_pattern = next(
                    (pattern for pattern in rule.deny if matches_glob(origin, pattern)),
                    None,
                )
                if denied_pattern is None:
                    continue
                findings.append(
                    BoundaryFinding(
                        rule_id=rule.id,
                        severity="blocked",
                        message=f"{path} imports {local_name} from denied origin {origin}",
                        evidence=[
                            *resolution.evidence.get(local_name, ()),
                            f"rule {rule.id} denies {denied_pattern}",
                        ],
                    )
                )

    deduped = list({_finding_key(finding): finding for finding in findings}.values())
    return ContractEvaluation(
        verdict=_verdict(deduped),
        findings=deduped,
        verified_evidence=verified_evidence,
    )
