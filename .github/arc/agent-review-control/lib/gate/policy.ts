import type { ReviewItem } from '../review/types.ts';

export type PushGateResult = {
  allowed: boolean;
  reviewId: string;
  blockers: string[];
  warnings: string[];
  summary: string;
};

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function evaluatePushGate(item: ReviewItem): PushGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (item.reviewStatus !== 'Human Approved') {
    blockers.push('Review must be Human Approved before push.');
  }

  if (!hasText(item.approval?.approvedAt) || !hasText(item.approval?.approvedBy)) {
    blockers.push('Human approval metadata is missing.');
  }

  if (!hasText(item.completionEvidence?.submittedAt) || !hasText(item.completionEvidence?.summary)) {
    blockers.push('Completion evidence is missing.');
  }

  if (list(item.completionEvidence?.testsRun).length === 0) {
    blockers.push('Completion evidence must include tests run, or an explicit no-test rationale in the summary.');
  }

  if (!item.git) {
    blockers.push('Git readiness has not been inspected.');
  } else if (item.git.state === 'blocked_dirty_repo') {
    blockers.push('Git readiness is blocked by unrelated dirty files.');
  } else if (item.git.state === 'unknown') {
    blockers.push('Git readiness is unknown; inspect git manually before push.');
  } else if (item.git.state !== 'review_ready' && item.git.state !== 'clean_repo') {
    blockers.push(`Git readiness is ${item.git.state}, not push-ready.`);
  }

  if (item.risk?.severity === 'high') warnings.push('High-risk review: verify rollback and test evidence manually.');

  return {
    allowed: blockers.length === 0,
    reviewId: item.id,
    blockers,
    warnings,
    summary: blockers.length === 0 ? 'ARC gate passed; push is allowed.' : 'ARC gate blocked push.',
  };
}
