import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tempDir = await mkdtemp(join(tmpdir(), 'agent-review-control-db-'));
process.env.AGENT_REVIEW_CONTROL_DB_PATH = join(tempDir, 'smoke.sqlite');

try {
  const { sampleContracts } = await import('../lib/contracts/sample-contracts.ts');
  const { closeDbForTests } = await import('../lib/db.ts');
  const { createReviewItemFromRawInput, listReviewItems, getReviewItem, updateReviewStatus } = await import('../lib/review/server-store.ts');

  const first = createReviewItemFromRawInput(sampleContracts[0]);
  const second = createReviewItemFromRawInput(sampleContracts[1]);

  assert.equal(first.reviewStatus, 'Needs Review');
  assert.equal(second.reviewStatus, 'Needs Review');

  const items = listReviewItems();
  assert.equal(items.length, 2);
  assert.ok(
    items.every((item) => item.risk.reasons.some((reason) => reason.code === 'same-file-overlap')),
    'saved contracts touching the same file should get globally recomputed same-file overlap risk'
  );

  const detail = getReviewItem(first.id);
  assert.ok(detail);
  assert.ok(
    detail.risk.reasons.some((reason) => reason.code === 'same-file-overlap'),
    'detail fetch should also recompute against all other saved contracts'
  );

  const updated = updateReviewStatus(first.id, 'In Review');
  assert.equal(updated?.reviewStatus, 'In Review');

  closeDbForTests();
  console.log('Agent Review Control SQLite/API service smoke check passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
