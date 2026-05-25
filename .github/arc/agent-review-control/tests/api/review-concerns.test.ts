import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validContractMarkdown } from '../../lib/contracts/sample-contracts.ts';
import { closeDbForTests } from '../../lib/db.ts';
import { createReviewItemFromRawInput, updateReviewerConcerns } from '../../lib/review/server-store.ts';

function withTempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'arc-concerns-test-'));
  process.env.AGENT_REVIEW_CONTROL_DB_PATH = join(dir, 'arc.sqlite');
  closeDbForTests();

  return () => {
    closeDbForTests();
    delete process.env.AGENT_REVIEW_CONTROL_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  };
}

test('review concerns ingestion stores open reviewer and bot concerns', () => {
  const cleanup = withTempDb();

  try {
    const item = createReviewItemFromRawInput(validContractMarkdown);
    const updated = updateReviewerConcerns(item.id, {
      concerns: [
        {
          id: 'comment-1',
          source: 'human_review',
          author: 'reviewer',
          body: 'Please double-check auth scope before merge.',
          path: 'app/api/auth/route.ts',
        },
        {
          id: 'bot-1',
          source: 'bot_review',
          author: 'CodeRabbit',
          body: 'Nit: naming could be clearer.',
        },
      ],
    });

    assert.ok(updated?.reviewerConcerns.ingestedAt);
    assert.equal(updated?.reviewerConcerns.openCount, 2);
    assert.equal(updated?.reviewerConcerns.humanCount, 1);
    assert.equal(updated?.reviewerConcerns.botCount, 1);
    assert.equal(updated?.reviewerConcerns.topConcerns[0].severity, 'high');
    assert.equal(updated?.reviewerConcerns.topConcerns[0].path, 'app/api/auth/route.ts');
  } finally {
    cleanup();
  }
});
