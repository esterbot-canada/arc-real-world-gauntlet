import type { ParsedContractResult } from '../contracts/parser.ts';
import type { RiskEvaluation, RiskSeverity } from '../risk/types.ts';
import { emptyReviewerConcernSummary } from './concerns.ts';
import { transitionReviewStatus, type ReviewStatus } from './status.ts';
import type { ReviewItem } from './types.ts';

export const REVIEW_QUEUE_STORAGE_KEY = 'agent-review-control.review-queue.v1';

const RISK_WEIGHT: Record<RiskSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `review-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readRawQueue(): unknown[] {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(REVIEW_QUEUE_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRawQueue(items: ReviewItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REVIEW_QUEUE_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('agent-review-queue-updated'));
}

function isReviewItem(value: unknown): value is ReviewItem {
  if (!value || typeof value !== 'object') return false;

  const item = value as Partial<ReviewItem>;
  return (
    typeof item.id === 'string' &&
    typeof item.rawInput === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string' &&
    typeof item.reviewStatus === 'string' &&
    typeof item.contract === 'object' &&
    typeof item.validation === 'object' &&
    typeof item.risk === 'object'
  );
}

export function getReviewQueue(): ReviewItem[] {
  return readRawQueue().filter(isReviewItem);
}

export function saveReviewQueue(items: ReviewItem[]): void {
  writeRawQueue(items);
}

export function createReviewItem(
  parsed: Extract<ParsedContractResult, { ok: true }>,
  risk: RiskEvaluation
): ReviewItem {
  const timestamp = nowIso();

  return {
    id: createId(),
    rawInput: parsed.rawInput,
    rawJson: parsed.rawJson,
    contract: parsed.contract,
    validation: {
      validationStatus: parsed.validationStatus,
      isComplete: parsed.isComplete,
      missingFields: parsed.missingFields,
      invalidFields: parsed.invalidFields,
      unknownFields: parsed.unknownFields,
    },
    risk,
    createdAt: timestamp,
    updatedAt: timestamp,
    reviewStatus: 'Needs Review',
    ingestMetadata: {},
    approval: {},
    completionEvidence: {},
    reviewerConcerns: emptyReviewerConcernSummary(),
  };
}

export function addReviewItem(item: ReviewItem): ReviewItem[] {
  const queue = getReviewQueue();
  const next = [item, ...queue.filter((existing) => existing.id !== item.id)];
  saveReviewQueue(next);
  return next;
}

export function getReviewItem(id: string): ReviewItem | undefined {
  return getReviewQueue().find((item) => item.id === id);
}

export function updateReviewStatus(id: string, nextStatus: ReviewStatus): ReviewItem | undefined {
  const queue = getReviewQueue();
  let updated: ReviewItem | undefined;

  const nextQueue = queue.map((item) => {
    if (item.id !== id) return item;

    updated = {
      ...item,
      reviewStatus: transitionReviewStatus(item.reviewStatus, nextStatus),
      updatedAt: nowIso(),
    };

    return updated;
  });

  if (updated) saveReviewQueue(nextQueue);
  return updated;
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
