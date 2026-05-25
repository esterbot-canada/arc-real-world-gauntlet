import { parseContractMarkdown } from '../contracts/parser.ts';
import {
  evaluateGitReadinessForSnapshot,
  loadGitReadiness,
  loadGitRepositorySnapshot,
  type GitRepositorySnapshot,
  type GitRepositorySnapshotError,
} from '../git/status.ts';
import { evaluateRisk } from '../risk/rules.ts';
import type { RelatedRiskContract, RiskSeverity } from '../risk/types.ts';
import { summarizeReviewerConcerns } from './concerns.ts';
import { normalizeReviewStatus, type ReviewStatus } from './status.ts';
import type { IngestMetadata, ReviewItem, ReviewValidationSnapshot } from './types.ts';
import { ContractsRepository, type StoredReviewRecord } from '../repositories/contracts-repo.ts';
import { ReviewsRepository } from '../repositories/reviews-repo.ts';

const RISK_WEIGHT: Record<RiskSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function validationSnapshot(parsed: Extract<ReturnType<typeof parseContractMarkdown>, { ok: true }>): ReviewValidationSnapshot {
  return {
    validationStatus: parsed.validationStatus,
    isComplete: parsed.isComplete,
    missingFields: parsed.missingFields,
    invalidFields: parsed.invalidFields,
    unknownFields: parsed.unknownFields,
  };
}

function relatedContractsFor(record: StoredReviewRecord, records: StoredReviewRecord[]): RelatedRiskContract[] {
  return records
    .filter((candidate) => candidate.id !== record.id)
    .map((candidate) => ({ runId: candidate.id, reviewStatus: candidate.reviewStatus, contract: candidate.contract }));
}

export function hydrateReviewItem(record: StoredReviewRecord, allRecords: StoredReviewRecord[]): ReviewItem {
  const risk = evaluateRisk({
    contract: record.contract,
    validation: record.validation,
    relatedContracts: relatedContractsFor(record, allRecords),
  });

  return {
    id: record.id,
    rawInput: record.rawInput,
    rawJson: record.rawJson,
    contract: record.contract,
    validation: record.validation,
    risk,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    reviewStatus: record.reviewStatus,
    ingestMetadata: record.ingestMetadata,
    approval: record.approval,
    completionEvidence: record.completionEvidence,
    reviewerConcerns: record.reviewerConcerns,
  };
}

export function sortReviewQueue(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((left, right) => {
    const riskDelta = RISK_WEIGHT[right.risk.severity] - RISK_WEIGHT[left.risk.severity];
    if (riskDelta !== 0) return riskDelta;

    const attentionDelta = Number(!right.validation.isComplete) - Number(!left.validation.isComplete);
    if (attentionDelta !== 0) return attentionDelta;

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export function listReviewItems(): ReviewItem[] {
  const repo = new ContractsRepository();
  const records = repo.list();
  return sortReviewQueue(records.map((record) => hydrateReviewItem(record, records)));
}

export function getReviewItem(id: string): ReviewItem | null {
  const repo = new ContractsRepository();
  const records = repo.list();
  const record = records.find((candidate) => candidate.id === id);
  return record ? hydrateReviewItem(record, records) : null;
}

export async function withGitReadiness(item: ReviewItem): Promise<ReviewItem> {
  return {
    ...item,
    git: await loadGitReadiness(item.contract.files_touched ?? [], process.cwd()),
  };
}

export function withGitReadinessSnapshot(
  item: ReviewItem,
  snapshot: GitRepositorySnapshot | GitRepositorySnapshotError,
): ReviewItem {
  return {
    ...item,
    git: evaluateGitReadinessForSnapshot(snapshot, item.contract.files_touched ?? []),
  };
}

export async function listReviewItemsWithGit(): Promise<ReviewItem[]> {
  const items = listReviewItems();
  const snapshot = await loadGitRepositorySnapshot(process.cwd());

  return items.map((item) => withGitReadinessSnapshot(item, snapshot));
}

export async function getReviewItemWithGit(id: string): Promise<ReviewItem | null> {
  const item = getReviewItem(id);
  return item ? withGitReadiness(item) : null;
}

export function createReviewItemFromRawInput(rawInput: string, ingestMetadata: IngestMetadata = {}): ReviewItem {
  const parsed = parseContractMarkdown(rawInput);
  if (!parsed.ok) {
    throw Object.assign(new Error(parsed.message), { status: 400, code: parsed.code, rawJson: parsed.rawJson });
  }

  const repo = new ContractsRepository();
  const created = repo.create({
    rawInput: parsed.rawInput,
    rawJson: parsed.rawJson,
    rawData: parsed.rawData,
    contract: parsed.contract,
    validation: validationSnapshot(parsed),
    ingestMetadata,
  });

  return getReviewItem(created.id) ?? hydrateReviewItem(created, [created]);
}

export function seedReviewItem(rawInput: string): ReviewItem {
  const parsed = parseContractMarkdown(rawInput);
  if (!parsed.ok) {
    throw Object.assign(new Error(parsed.message), { status: 400, code: parsed.code, rawJson: parsed.rawJson });
  }

  const repo = new ContractsRepository();
  const existing = repo.findByRawJson(parsed.rawJson);
  if (existing) return getReviewItem(existing.id) ?? hydrateReviewItem(existing, repo.list());

  return createReviewItemFromRawInput(rawInput);
}

export function updateReviewStatus(id: string, nextStatus: unknown): ReviewItem | null {
  const normalizedStatus = normalizeReviewStatus(nextStatus);
  if (!normalizedStatus) {
    throw Object.assign(new Error('Invalid review status.'), { status: 400 });
  }

  const repo = new ReviewsRepository();
  const updated = repo.updateStatus(id, normalizedStatus as ReviewStatus);
  if (!updated) return null;
  return getReviewItem(updated.id);
}


function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

export function approveReviewItem(id: string, input: { approvedBy?: unknown; approvalNote?: unknown }): ReviewItem | null {
  const approvedBy = typeof input.approvedBy === 'string' && input.approvedBy.trim() ? input.approvedBy.trim() : 'human';
  const approvalNote = typeof input.approvalNote === 'string' ? input.approvalNote.trim() : undefined;
  const repository = new ReviewsRepository();
  const record = repository.approve(id, {
    approvedAt: new Date().toISOString(),
    approvedBy,
    ...(approvalNote ? { approvalNote } : {}),
  });
  return record ? getReviewItem(record.id) : null;
}

export function updateCompletionEvidence(id: string, input: Record<string, unknown>): ReviewItem | null {
  const repository = new ReviewsRepository();
  const record = repository.updateCompletionEvidence(id, {
    submittedAt: new Date().toISOString(),
    summary: typeof input.summary === 'string' ? input.summary.trim() : undefined,
    filesChanged: stringList(input.filesChanged),
    testsRun: stringList(input.testsRun),
    testOutput: typeof input.testOutput === 'string' ? input.testOutput : undefined,
    openQuestions: stringList(input.openQuestions),
    rollbackNote: typeof input.rollbackNote === 'string' ? input.rollbackNote.trim() : undefined,
  });
  return record ? getReviewItem(record.id) : null;
}

export function updateReviewerConcerns(id: string, input: Record<string, unknown>): ReviewItem | null {
  const rawConcerns = Array.isArray(input.concerns) ? input.concerns : [];
  const repository = new ReviewsRepository();
  const record = repository.updateReviewerConcerns(id, summarizeReviewerConcerns(rawConcerns));
  return record ? getReviewItem(record.id) : null;
}

export function deleteReviewItem(id: string): boolean {
  const repo = new ContractsRepository();
  return repo.delete(id);
}
