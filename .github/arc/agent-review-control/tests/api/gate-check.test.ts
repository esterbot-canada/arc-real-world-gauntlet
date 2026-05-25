import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { evaluatePushGate } from '../../lib/gate/policy.ts';
import { validContractMarkdown } from '../../lib/contracts/sample-contracts.ts';
import { closeDbForTests } from '../../lib/db.ts';
import { createReviewItemFromRawInput, getReviewItem } from '../../lib/review/server-store.ts';

function withTempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'arc-gate-api-test-'));
  process.env.AGENT_REVIEW_CONTROL_DB_PATH = join(dir, 'arc.sqlite');
  closeDbForTests();

  return () => {
    closeDbForTests();
    delete process.env.AGENT_REVIEW_CONTROL_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  };
}

test('gate check API reports blockers for an unapproved review', () => {
  const cleanup = withTempDb();

  try {
    const created = createReviewItemFromRawInput(validContractMarkdown);
    const item = getReviewItem(created.id);
    assert.ok(item);

    const result = evaluatePushGate(item);

    assert.equal(result.allowed, false);
    assert.equal(result.reviewId, created.id);
    assert.match(result.blockers.join('\n'), /Human Approved/);
    assert.equal(result.summary, 'ARC gate blocked push.');
  } finally {
    cleanup();
  }
});
