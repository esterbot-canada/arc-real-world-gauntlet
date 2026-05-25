export const REVIEW_STATUSES = ['Needs Review', 'In Review', 'Changes Requested', 'Human Approved', 'Rejected', 'Superseded', 'Archived'] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type LegacyReviewStatus = 'Approved';

export const ACTIVE_REVIEW_STATUSES = ['Needs Review', 'In Review', 'Changes Requested'] as const satisfies readonly ReviewStatus[];
export const CLOSED_REVIEW_STATUSES = ['Human Approved', 'Rejected', 'Superseded', 'Archived'] as const satisfies readonly ReviewStatus[];

const ALLOWED_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  'Needs Review': ['Needs Review', 'In Review', 'Changes Requested', 'Human Approved', 'Rejected', 'Superseded', 'Archived'],
  'In Review': ['In Review', 'Changes Requested', 'Human Approved', 'Rejected', 'Needs Review', 'Superseded', 'Archived'],
  'Changes Requested': ['Changes Requested', 'In Review', 'Human Approved', 'Rejected', 'Needs Review', 'Superseded', 'Archived'],
  'Human Approved': ['Human Approved', 'In Review', 'Changes Requested', 'Rejected', 'Superseded', 'Archived'],
  Rejected: ['Rejected', 'In Review', 'Changes Requested', 'Human Approved', 'Superseded', 'Archived'],
  Superseded: ['Superseded', 'Needs Review', 'In Review', 'Changes Requested', 'Archived'],
  Archived: ['Archived', 'Needs Review', 'In Review', 'Changes Requested', 'Superseded'],
};

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && REVIEW_STATUSES.includes(value as ReviewStatus);
}

export function normalizeReviewStatus(value: unknown): ReviewStatus | null {
  if (value === 'Approved') return 'Human Approved';
  return isReviewStatus(value) ? value : null;
}

export function isActiveReviewStatus(value: unknown): value is (typeof ACTIVE_REVIEW_STATUSES)[number] {
  return typeof value === 'string' && ACTIVE_REVIEW_STATUSES.includes(value as (typeof ACTIVE_REVIEW_STATUSES)[number]);
}

export function isClosedReviewStatus(value: unknown): value is (typeof CLOSED_REVIEW_STATUSES)[number] {
  return typeof value === 'string' && CLOSED_REVIEW_STATUSES.includes(value as (typeof CLOSED_REVIEW_STATUSES)[number]);
}

export function canTransitionReviewStatus(from: ReviewStatus | LegacyReviewStatus, to: ReviewStatus | LegacyReviewStatus): boolean {
  const normalizedFrom = normalizeReviewStatus(from);
  const normalizedTo = normalizeReviewStatus(to);
  if (!normalizedFrom || !normalizedTo) return false;
  return ALLOWED_TRANSITIONS[normalizedFrom].includes(normalizedTo);
}

export function transitionReviewStatus(from: ReviewStatus | LegacyReviewStatus, to: ReviewStatus | LegacyReviewStatus): ReviewStatus {
  const normalizedTo = normalizeReviewStatus(to);

  if (!normalizedTo || !canTransitionReviewStatus(from, to)) {
    throw new Error(`Cannot move review status from ${from} to ${to}.`);
  }

  return normalizedTo;
}
