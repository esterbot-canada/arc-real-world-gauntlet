import type { AgentReviewContract, ContractValidationStatus, InvalidContractField } from '../contracts/schema.ts';
import type { GitReadinessSnapshot } from '../git/status.ts';
import type { RiskEvaluation } from '../risk/types.ts';
import type { ReviewStatus } from './status.ts';

export type ReviewValidationSnapshot = {
  validationStatus: ContractValidationStatus;
  isComplete: boolean;
  missingFields: string[];
  invalidFields: InvalidContractField[];
  unknownFields: string[];
};

export type IngestMetadata = {
  source?: string;
  runId?: string;
  receivedAt?: string;
};

export type ApprovalSnapshot = {
  approvedAt?: string;
  approvedBy?: string;
  approvalNote?: string;
  approvalToken?: string;
};

export type CompletionEvidence = {
  submittedAt?: string;
  summary?: string;
  filesChanged?: string[];
  testsRun?: string[];
  testOutput?: string;
  openQuestions?: string[];
  rollbackNote?: string;
};

export type ReviewerConcernSource = 'human_review' | 'bot_review' | 'check_annotation' | 'unknown';

export type ReviewerConcernSeverity = 'high' | 'medium' | 'low';

export type ReviewerConcern = {
  id: string;
  source: ReviewerConcernSource;
  author?: string;
  body: string;
  path?: string;
  line?: number;
  url?: string;
  state?: string;
  severity: ReviewerConcernSeverity;
  keywords: string[];
};

export type ReviewerConcernSummary = {
  ingestedAt?: string;
  openCount: number;
  humanCount: number;
  botCount: number;
  checkCount: number;
  topConcerns: ReviewerConcern[];
};

export type ReviewItem = {
  id: string;
  rawInput: string;
  rawJson: string;
  contract: AgentReviewContract;
  validation: ReviewValidationSnapshot;
  risk: RiskEvaluation;
  createdAt: string;
  updatedAt: string;
  reviewStatus: ReviewStatus;
  ingestMetadata: IngestMetadata;
  approval: ApprovalSnapshot;
  completionEvidence: CompletionEvidence;
  reviewerConcerns: ReviewerConcernSummary;
  git?: GitReadinessSnapshot;
};
