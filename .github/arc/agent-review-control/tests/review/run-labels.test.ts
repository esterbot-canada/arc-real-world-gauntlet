import assert from 'node:assert/strict';
import test from 'node:test';

import { runLabelFor, runSequenceMap } from '../../lib/review/run-labels.ts';

test('assigns run sequence by oldest createdAt first', () => {
  const sequences = runSequenceMap([
    { id: 'newer', createdAt: '2026-05-03T02:00:00.000Z' },
    { id: 'older', createdAt: '2026-05-03T01:00:00.000Z' },
  ]);

  assert.equal(sequences.get('older'), 1);
  assert.equal(sequences.get('newer'), 2);
});

test('formats stable ARC run code from created date and sequence', () => {
  const label = runLabelFor(
    { id: 'run', createdAt: '2026-05-03T01:00:00.000Z', updatedAt: '2026-05-03T01:05:00.000Z' },
    7
  );

  assert.equal(label.shortLabel, 'Run #007');
  assert.equal(label.code, 'ARC-20260503-007');
});
