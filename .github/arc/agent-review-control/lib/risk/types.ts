import type { AgentReviewContract, InvalidContractField, RiskLevel } from '../contracts/schema.ts';
import type { ReviewStatus } from '../review/status.ts';

export type RiskSeverity = 'low' | 'medium' | 'high';
export type RiskLabel = 'No obvious risk detected' | 'Review signals detected' | 'High-priority review';
export type RiskConfidence = 'Low confidence' | 'Medium confidence' | 'High confidence';
export type ReviewPriority = 'low' | 'medium' | 'high' | 'blocked';
export type SuggestedReviewAction = 'approve' | 'request_changes' | 'keep_active' | 'supersede' | 'archive' | 'reject';
export type RiskReasonCategory =
  | 'blocking_uncertainty'
  | 'missing_evidence'
  | 'product_overlap'
  | 'runtime_security'
  | 'contract_quality'
  | 'positive_evidence';

export type RiskReasonCode =
  | 'same-file-overlap'
  | 'shared-boundary'
  | 'missing-tests'
  | 'runtime-sensitive-change'
  | 'env-secret-change'
  | 'config-change'
  | 'deployment-change'
  | 'migration-change'
  | 'external-effect'
  | 'explicit-high-risk'
  | 'missing-rollback-note'
  | 'incomplete-sensitive-contract'
  | 'missing-files'
  | 'missing-systems'
  | 'open-questions-unresolved'
  | 'shared-system'
  | 'assumptions-present'
  | 'large-change-set'
  | 'unclear-rationale'
  | 'isolated-files'
  | 'tests-present'
  | 'clear-rationale'
  | 'rollback-note-present'
  | 'no-overlap';

export type RelatedRunEvidence = {
  runId: string;
  taskTitle?: string;
  agentName?: string;
  files?: string[];
  boundaries?: string[];
  systems?: string[];
};

export type RiskReasonEvidence = {
  relatedRuns?: RelatedRunEvidence[];
  technicalDetail?: string;
  plainEnglish?: string;
};

export type RiskReason = {
  code: RiskReasonCode;
  severity: RiskSeverity;
  category: RiskReasonCategory;
  message: string;
  blocking?: boolean;
  weight?: number;
  evidence?: RiskReasonEvidence;
};

export type RiskReasonGroup = {
  category: RiskReasonCategory;
  label: string;
  reasons: RiskReason[];
  blocking: boolean;
  highestSeverity: RiskSeverity;
};

export type RiskValidationContext = {
  isComplete?: boolean;
  missingFields?: string[];
  invalidFields?: InvalidContractField[];
  unknownFields?: string[];
};

export type RelatedRiskContract = {
  runId?: string;
  reviewStatus?: ReviewStatus;
  contract: AgentReviewContract;
};

export type RiskInput = {
  contract: AgentReviewContract;
  validation?: RiskValidationContext;
  relatedContracts?: RelatedRiskContract[];
  largeChangeSetThreshold?: number;
  sensitiveSystems?: string[];
};

export type RiskEvaluation = {
  label: RiskLabel;
  severity: RiskSeverity;
  reviewPriority: ReviewPriority;
  suggestedAction: SuggestedReviewAction;
  confidence: RiskConfidence;
  reasons: RiskReason[];
  highReasons: RiskReason[];
  mediumReasons: RiskReason[];
  lowReasons: RiskReason[];
  reasonGroups: RiskReasonGroup[];
  source: 'deterministic-rules';
};

export const RISK_SEVERITY_BY_CONTRACT_LEVEL: Record<RiskLevel, RiskSeverity> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'high',
};
