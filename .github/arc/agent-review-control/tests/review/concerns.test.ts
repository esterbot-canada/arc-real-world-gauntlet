import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeReviewerConcerns } from '../../lib/review/concerns.ts';

test('summarizes open reviewer and bot concerns by severity before resolved noise', () => {
  const summary = summarizeReviewerConcerns([
    {
      id: 'resolved-1',
      source: 'human_review',
      author: 'reviewer',
      body: 'Resolved nit.',
      state: 'resolved',
    },
    {
      id: 'bot-1',
      source: 'bot_review',
      author: 'CodeRabbit',
      body: 'Possible null edge case in billing path.',
      path: 'lib/billing.ts',
      line: 42,
    },
    {
      id: 'human-1',
      source: 'human_review',
      author: 'alice',
      body: 'Auth permission scope looks breaking; please prove migration rollback.',
      path: 'app/api/auth/route.ts',
    },
    {
      id: 'check-1',
      source: 'check_annotation',
      body: 'Static analysis warning.',
    },
  ]);

  assert.equal(summary.openCount, 3);
  assert.equal(summary.humanCount, 1);
  assert.equal(summary.botCount, 1);
  assert.equal(summary.checkCount, 1);
  assert.equal(summary.topConcerns[0].id, 'human-1');
  assert.equal(summary.topConcerns[0].severity, 'high');
  assert.deepEqual(summary.topConcerns[0].keywords, ['auth', 'permission', 'migration', 'breaking', 'rollback']);
  assert.equal(summary.topConcerns[1].severity, 'medium');
});
