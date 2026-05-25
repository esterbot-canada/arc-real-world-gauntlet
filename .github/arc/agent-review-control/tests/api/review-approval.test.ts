import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validContractMarkdown } from '../../lib/contracts/sample-contracts.ts';
import { closeDbForTests } from '../../lib/db.ts';
import { approveReviewItem, createReviewItemFromRawInput } from '../../lib/review/server-store.ts';

function withTempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'arc-approval-test-'));
  process.env.AGENT_REVIEW_CONTROL_DB_PATH = join(dir, 'arc.sqlite');
  closeDbForTests();

  return () => {
    closeDbForTests();
    delete process.env.AGENT_REVIEW_CONTROL_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  };
}

test('approval API marks a review Human Approved and stores approver metadata', async () => {
  const cleanup = withTempDb();

  try {
    const item = createReviewItemFromRawInput(validContractMarkdown);
    const approved = approveReviewItem(item.id, { approvedBy: 'DarkN0ir', approvalNote: 'Looks safe.' });

    assert.equal(approved?.reviewStatus, 'Human Approved');
    assert.equal(approved?.approval.approvedBy, 'DarkN0ir');
    assert.equal(approved?.approval.approvalNote, 'Looks safe.');
    assert.ok(approved?.approval.approvedAt);
  } finally {
    cleanup();
  }
});
