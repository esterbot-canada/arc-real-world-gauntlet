import assert from 'node:assert/strict';
import test from 'node:test';

import { compareReviewItems } from '../../lib/review/compare.ts';
import type { ReviewItem } from '../../lib/review/types.ts';

function item(id: string, createdAt: string, files: string[], systems: string[], tests: string[] = []): ReviewItem {
  return {
    id,
    rawInput: '',
    rawJson: '{}',
    contract: {
      task_title: id,
      summary: `${id} summary with enough detail`,
      files_touched: files,
      systems_touched: systems,
      tests_run: tests,
      open_questions: [],
      risk_level: 'medium',
    },
    validation: {
      validationStatus: 'Complete',
      isComplete: true,
      missingFields: [],
      invalidFields: [],
      unknownFields: [],
    },
    risk: {
      label: 'Review signals detected',
      severity: 'medium',
      confidence: 'Medium confidence',
      reasons: [],
      highReasons: [],
      mediumReasons: [],
      lowReasons: [],
      source: 'deterministic-rules',
    },
    createdAt,
    updatedAt: createdAt,
    reviewStatus: 'Needs Review',
    ingestMetadata: {},
  };
}

test('compares older and newer runs with shared files and systems', () => {
  const comparison = compareReviewItems(
    item('newer', '2026-05-03T02:00:00.000Z', ['app/page.tsx'], ['ui']),
    item('older', '2026-05-03T01:00:00.000Z', ['app/page.tsx', 'app/layout.tsx'], ['ui'], ['npm test'])
  );

  assert.equal(comparison.older.id, 'older');
  assert.equal(comparison.newer.id, 'newer');
  assert.deepEqual(comparison.sharedFiles, ['app/page.tsx']);
  assert.deepEqual(comparison.sharedSystems, ['ui']);
  assert.match(comparison.summary.join(' '), /Both runs touch the same file/);
});
