import assert from 'node:assert/strict';
import test from 'node:test';

import { canTransitionReviewStatus, normalizeReviewStatus, transitionReviewStatus } from '../../lib/review/status.ts';
import { sortReviewQueue } from '../../lib/review/local-store.ts';
import type { ReviewItem } from '../../lib/review/types.ts';
import type { RiskSeverity } from '../../lib/risk/types.ts';

function item(overrides: Partial<ReviewItem> & { id: string; severity: RiskSeverity; complete: boolean; createdAt: string }): ReviewItem {
  return {
    id: overrides.id,
    rawInput: 'raw markdown',
    rawJson: '{}',
    contract: {
      task_title: overrides.id,
      files_touched: [],
      systems_touched: [],
      tests_run: [],
      open_questions: [],
    },
    validation: {
      validationStatus: overrides.complete ? 'Complete' : 'Incomplete / Needs Attention',
      isComplete: overrides.complete,
      missingFields: overrides.complete ? [] : ['summary'],
      invalidFields: [],
      unknownFields: [],
    },
    risk: {
      label: overrides.severity === 'high' ? 'High-priority review' : overrides.severity === 'medium' ? 'Review signals detected' : 'No obvious risk detected',
      severity: overrides.severity,
      confidence: 'Medium confidence',
      reasons: [],
      highReasons: [],
      mediumReasons: [],
      lowReasons: [],
      source: 'deterministic-rules',
    },
    createdAt: overrides.createdAt,
    updatedAt: overrides.createdAt,
    reviewStatus: overrides.reviewStatus ?? 'Needs Review',
    ingestMetadata: {},
  };
}

test('supports the MVP review lifecycle statuses', () => {
  assert.equal(transitionReviewStatus('Needs Review', 'In Review'), 'In Review');
  assert.equal(transitionReviewStatus('In Review', 'Changes Requested'), 'Changes Requested');
  assert.equal(transitionReviewStatus('Changes Requested', 'In Review'), 'In Review');
  assert.equal(transitionReviewStatus('In Review', 'Human Approved'), 'Human Approved');
  assert.equal(transitionReviewStatus('In Review', 'Rejected'), 'Rejected');
  assert.equal(transitionReviewStatus('Human Approved', 'In Review'), 'In Review');
  assert.equal(normalizeReviewStatus('Approved'), 'Human Approved');
  assert.equal(transitionReviewStatus('Approved', 'Archived'), 'Archived');
  assert.equal(transitionReviewStatus('Needs Review', 'Superseded'), 'Superseded');
  assert.equal(transitionReviewStatus('Needs Review', 'Archived'), 'Archived');
  assert.equal(transitionReviewStatus('Superseded', 'Archived'), 'Archived');
  assert.equal(transitionReviewStatus('Archived', 'Needs Review'), 'Needs Review');
});

test('guards unknown lifecycle transitions', () => {
  assert.equal(canTransitionReviewStatus('Needs Review', 'Human Approved'), true);
  assert.throws(
    () => transitionReviewStatus('Needs Review', 'Bogus' as never),
    /Cannot move review status/
  );
});

test('sorts review queue by high risk, incomplete attention, then newest', () => {
  const sorted = sortReviewQueue([
    item({ id: 'older-low', severity: 'low', complete: false, createdAt: '2026-05-02T01:00:00.000Z' }),
    item({ id: 'newer-low', severity: 'low', complete: true, createdAt: '2026-05-02T03:00:00.000Z' }),
    item({ id: 'medium', severity: 'medium', complete: true, createdAt: '2026-05-02T02:00:00.000Z' }),
    item({ id: 'high', severity: 'high', complete: true, createdAt: '2026-05-02T00:00:00.000Z' }),
  ]);

  assert.deepEqual(sorted.map((entry) => entry.id), ['high', 'medium', 'older-low', 'newer-low']);
});
