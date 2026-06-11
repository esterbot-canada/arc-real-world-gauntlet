import json
from dataclasses import asdict, dataclass
from typing import Literal, Sequence

from agent_work_evidence.models import (
    BoundaryFinding,
    ContractEvaluation,
    EvidenceBrief,
)

EvidenceProvenance = Literal[
    "arc_verified",
    "agent_reported",
    "operator_supplied",
]

MAX_FOCUS_QUESTIONS = 3


@dataclass(frozen=True)
class TrustReceipt:
    provenance: EvidenceProvenance
    label: str
    value: str


@dataclass(frozen=True)
class TrustBriefDocument:
    schema_version: int
    repository: str
    pull_request: int
    verdict: Literal["pass", "needs_review", "blocked"]
    summary: str
    focus_questions: tuple[str, ...]
    receipts: tuple[TrustReceipt, ...]
    disclaimer: str


def _effective_evaluation(brief: EvidenceBrief) -> ContractEvaluation:
    if brief.contract_evaluation is not None:
        return brief.contract_evaluation
    return ContractEvaluation(
        verdict="needs_review",
        findings=[
            BoundaryFinding(
                rule_id="missing_contract",
                severity="needs_review",
                message="No frozen ARC contract evaluation was provided",
                evidence=[],
            )
        ],
    )


def _summary(evaluation: ContractEvaluation) -> str:
    return {
        "blocked": "ARC found a deterministic assignment-boundary violation.",
        "needs_review": "ARC could not verify every required assignment boundary.",
        "pass": "ARC found no deterministic contract or required-evidence violation.",
    }[evaluation.verdict]


def _focus_question(finding: BoundaryFinding) -> str:
    message = finding.message.rstrip(".?")
    if finding.severity == "blocked":
        return f"What caused `{finding.rule_id}`? ARC found: {message}."
    return (
        f"Was `{finding.rule_id}` explicitly approved? "
        f"ARC found: {message}."
    )


def _receipts(
    brief: EvidenceBrief,
    evaluation: ContractEvaluation,
    agent_receipts: Sequence[TrustReceipt],
    operator_receipts: Sequence[TrustReceipt],
) -> tuple[TrustReceipt, ...]:
    receipts: list[TrustReceipt] = []

    if brief.changed_files:
        receipts.append(
            TrustReceipt(
                provenance="arc_verified",
                label="Changed files",
                value=", ".join(brief.changed_files),
            )
        )

    for finding in evaluation.findings:
        for evidence in finding.evidence:
            receipts.append(
                TrustReceipt(
                    provenance="arc_verified",
                    label=f"Finding `{finding.rule_id}`",
                    value=evidence,
                )
            )

    for evidence in evaluation.verified_evidence:
        receipts.append(
            TrustReceipt(
                provenance="arc_verified",
                label="Required evidence",
                value=evidence,
            )
        )

    for validation in brief.reported_validation:
        receipts.append(
            TrustReceipt(
                provenance="agent_reported",
                label="Reported validation",
                value=validation,
            )
        )

    for signal in brief.scope.signals:
        receipts.append(
            TrustReceipt(
                provenance="agent_reported",
                label="Reported scope context",
                value=signal,
            )
        )

    for receipt in agent_receipts:
        if receipt.provenance != "agent_reported":
            raise ValueError("agent_receipts must use agent_reported provenance")
        receipts.append(receipt)

    for receipt in operator_receipts:
        if receipt.provenance != "operator_supplied":
            raise ValueError("operator_receipts must use operator_supplied provenance")
        receipts.append(receipt)

    return tuple(receipts)


def build_trust_brief_document(
    brief: EvidenceBrief,
    *,
    agent_receipts: Sequence[TrustReceipt] = (),
    operator_receipts: Sequence[TrustReceipt] = (),
) -> TrustBriefDocument:
    evaluation = _effective_evaluation(brief)
    questions = tuple(
        _focus_question(finding)
        for finding in evaluation.findings[:MAX_FOCUS_QUESTIONS]
    )
    if not questions:
        questions = (
            "Does the implementation still match the frozen assignment and its non-goals?",
        )

    return TrustBriefDocument(
        schema_version=1,
        repository=brief.repo,
        pull_request=brief.pr_number,
        verdict=evaluation.verdict,
        summary=_summary(evaluation),
        focus_questions=questions,
        receipts=_receipts(
            brief,
            evaluation,
            agent_receipts,
            operator_receipts,
        ),
        disclaimer=(
            "ARC checks assignment boundaries and required evidence; "
            "it does not prove code correctness or merge safety."
        ),
    )


def trust_brief_to_dict(document: TrustBriefDocument) -> dict:
    return asdict(document)


def render_trust_brief_json(document: TrustBriefDocument) -> str:
    return json.dumps(
        trust_brief_to_dict(document),
        indent=2,
        sort_keys=True,
    ) + "\n"


def _heading(verdict: str) -> str:
    return {
        "blocked": "Blocked",
        "needs_review": "Needs Review",
        "pass": "Pass",
    }[verdict]


def _provenance_heading(provenance: EvidenceProvenance) -> str:
    return {
        "arc_verified": "ARC Verified",
        "agent_reported": "Agent Reported",
        "operator_supplied": "Operator Supplied",
    }[provenance]


def render_trust_brief_markdown(document: TrustBriefDocument) -> str:
    lines = [
        f"## ARC Trust Brief: {_heading(document.verdict)}",
        "",
        document.summary,
        "",
        "### Focus Questions",
    ]
    lines.extend(
        f"{index}. {question}"
        for index, question in enumerate(document.focus_questions, start=1)
    )
    lines.extend(["", "<details>", "<summary>Receipts</summary>", ""])

    for provenance in (
        "arc_verified",
        "agent_reported",
        "operator_supplied",
    ):
        matching = [
            receipt
            for receipt in document.receipts
            if receipt.provenance == provenance
        ]
        if not matching:
            continue
        lines.append(f"### {_provenance_heading(provenance)}")
        lines.extend(
            f"- **{receipt.label}:** {receipt.value}"
            for receipt in matching
        )
        lines.append("")

    lines.extend(["</details>", "", document.disclaimer])
    return "\n".join(lines).rstrip() + "\n"
