import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validContractMarkdown } from '../../lib/contracts/sample-contracts.ts';
import { closeDbForTests } from '../../lib/db.ts';
import { createReviewItemFromRawInput, updateCompletionEvidence } from '../../lib/review/server-store.ts';

function withTempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'arc-evidence-test-'));
  process.env.AGENT_REVIEW_CONTROL_DB_PATH = join(dir, 'arc.sqlite');
  closeDbForTests();

  return () => {
    closeDbForTests();
    delete process.env.AGENT_REVIEW_CONTROL_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  };
}

test('completion evidence API stores submitted summary files tests and rollback note', () => {
  const cleanup = withTempDb();

  try {
    const item = createReviewItemFromRawInput(validContractMarkdown);
    const updated = updateCompletionEvidence(item.id, {
      summary: 'Implemented the gate.',
      filesChanged: ['apps/agent-review-control/lib/gate/policy.ts'],
      testsRun: ['npm test -- tests/gate/policy.test.ts'],
      testOutput: 'PASS',
      rollbackNote: 'Remove gate scripts and API routes.',
    });

    assert.ok(updated?.completionEvidence.submittedAt);
    assert.equal(updated?.completionEvidence.summary, 'Implemented the gate.');
    assert.deepEqual(updated?.completionEvidence.filesChanged, ['apps/agent-review-control/lib/gate/policy.ts']);
    assert.deepEqual(updated?.completionEvidence.testsRun, ['npm test -- tests/gate/policy.test.ts']);
    assert.equal(updated?.completionEvidence.testOutput, 'PASS');
    assert.equal(updated?.completionEvidence.rollbackNote, 'Remove gate scripts and API routes.');
  } finally {
    cleanup();
  }
});
