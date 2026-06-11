from dataclasses import dataclass, field
from typing import Literal

Confidence = Literal["low", "medium", "high"]
RiskLevel = Literal["low", "medium", "high"]
ClaimStatus = Literal["supported", "contradicted", "unverified"]
ScopeStatus = Literal["clear", "partial", "unclear"]
ReviewerConcernSource = Literal["human_review", "bot_review", "check_annotation", "unknown"]
ReviewerConcernSeverity = Literal["high", "medium", "low"]
Verdict = Literal["pass", "needs_review", "blocked"]
FindingSeverity = Literal["needs_review", "blocked"]


@dataclass(frozen=True)
class ScopeEvidence:
    status: ScopeStatus
    signals: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Claim:
    text: str
    status: ClaimStatus
    evidence: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class RiskSignal:
    name: str
    level: RiskLevel
    evidence: list[str] = field(default_factory=list)
    human_question: str = ""


@dataclass(frozen=True)
class ReviewerConcern:
    source: ReviewerConcernSource
    severity: ReviewerConcernSeverity
    body: str
    author: str = ""
    path: str = ""
    url: str = ""


@dataclass(frozen=True)
class ReviewerConcernSummary:
    total: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    items: list[ReviewerConcern] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ContextExpansion:
    changed_symbols: list[str] = field(default_factory=list)
    imports: list[str] = field(default_factory=list)
    call_sites: list[str] = field(default_factory=list)
    related_tests: list[str] = field(default_factory=list)
    related_config: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class BoundaryFinding:
    rule_id: str
    severity: FindingSeverity
    message: str
    evidence: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ContractEvaluation:
    verdict: Verdict
    findings: list[BoundaryFinding] = field(default_factory=list)
    verified_evidence: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class EvidenceBrief:
    repo: str
    pr_number: int
    title: str
    scope: ScopeEvidence
    confidence: Confidence
    risk: RiskLevel = "low"
    claims: list[Claim] = field(default_factory=list)
    changed_files: list[str] = field(default_factory=list)
    checks_summary: list[str] = field(default_factory=list)
    reported_validation: list[str] = field(default_factory=list)
    risk_signals: list[RiskSignal] = field(default_factory=list)
    reviewer_concerns: ReviewerConcernSummary = field(default_factory=ReviewerConcernSummary)
    context: ContextExpansion = field(default_factory=ContextExpansion)
    evidence_gaps: list[str] = field(default_factory=list)
    contract_evaluation: ContractEvaluation | None = None
