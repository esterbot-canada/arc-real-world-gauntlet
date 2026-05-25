import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validContractMarkdown } from '../../lib/contracts/sample-contracts.ts';
import { closeDbForTests } from '../../lib/db.ts';
import {
  createReviewItemFromRawInput,
  getReviewItemWithGit,
  listReviewItemsWithGit,
  withGitReadinessSnapshot,
} from '../../lib/review/server-store.ts';
import type { GitReadinessState } from '../../lib/git/status.ts';

const VALID_GIT_STATES: GitReadinessState[] = [
  'clean_repo',
  'review_ready',
  'blocked_dirty_repo',
  'partial_match',
  'no_matching_diff',
  'unknown',
];

function withTempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'arc-git-readiness-test-'));
  process.env.AGENT_REVIEW_CONTROL_DB_PATH = join(dir, 'arc.sqlite');
  closeDbForTests();

  return () => {
    closeDbForTests();
    delete process.env.AGENT_REVIEW_CONTROL_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  };
}

function assertGitShape(item: { git?: { inspectedAt: string; state: string } }) {
  assert.ok(item.git);
  assert.match(item.git.inspectedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(VALID_GIT_STATES.includes(item.git.state as GitReadinessState));
}

test('review store wrappers attach git readiness snapshots', async () => {
  const cleanup = withTempDb();

  try {
    const created = createReviewItemFromRawInput(validContractMarkdown);

    const listed = await listReviewItemsWithGit();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, created.id);
    assertGitShape(listed[0]);

    const fetched = await getReviewItemWithGit(created.id);
    assert.ok(fetched);
    assertGitShape(fetched);
  } finally {
    cleanup();
  }
});

test('withGitReadinessSnapshot enriches review items from a supplied repository snapshot', () => {
  const cleanup = withTempDb();

  try {
    const created = createReviewItemFromRawInput(validContractMarkdown);
    const enriched = withGitReadinessSnapshot(created, {
      branch: 'feature/reuse-git-status',
      repoRoot: '/repo',
      headSha: 'abcdef123456',
      changes: [
        {
          path: 'apps/agent-review-control/lib/contracts/parser.ts',
          indexStatus: ' ',
          workingTreeStatus: 'M',
          kind: 'modified',
        },
        {
          path: 'apps/agent-review-control/lib/contracts/schema.ts',
          indexStatus: ' ',
          workingTreeStatus: 'M',
          kind: 'modified',
        },
      ],
    });

    assert.equal(enriched.id, created.id);
    assert.equal(enriched.git?.state, 'review_ready');
    assert.equal(enriched.git?.branch, 'feature/reuse-git-status');
    assert.deepEqual(enriched.git?.matchingFiles, created.contract.files_touched);
  } finally {
    cleanup();
  }
});
