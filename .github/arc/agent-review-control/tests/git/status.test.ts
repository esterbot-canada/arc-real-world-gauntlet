import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGitReadiness, evaluateGitReadinessForSnapshot, parsePorcelainStatus } from '../../lib/git/status.ts';

test('parsePorcelainStatus handles modified, deleted, and untracked files from null-delimited porcelain v1 status', () => {
  const raw = [
    ' M ./src/modified.ts',
    'D  src/deleted.ts',
    '?? src/new-file.ts',
    ' M ./src/trailing-space.ts ',
    '',
  ].join('\0');

  assert.deepEqual(parsePorcelainStatus(raw), [
    { path: 'src/modified.ts', indexStatus: ' ', workingTreeStatus: 'M', kind: 'modified' },
    { path: 'src/deleted.ts', indexStatus: 'D', workingTreeStatus: ' ', kind: 'deleted' },
    { path: 'src/new-file.ts', indexStatus: '?', workingTreeStatus: '?', kind: 'untracked' },
    { path: 'src/trailing-space.ts ', indexStatus: ' ', workingTreeStatus: 'M', kind: 'modified' },
  ]);
});

test('parsePorcelainStatus skips old paths for copied files from null-delimited porcelain v1 status', () => {
  const raw = ['C  src/copied.ts', 'src/original.ts', ' M src/modified.ts', ''].join('\0');

  assert.deepEqual(parsePorcelainStatus(raw), [
    { path: 'src/copied.ts', indexStatus: 'C', workingTreeStatus: ' ', kind: 'copied' },
    { path: 'src/modified.ts', indexStatus: ' ', workingTreeStatus: 'M', kind: 'modified' },
  ]);
});

test('evaluateGitReadiness marks clean contract diff as review_ready', () => {
  const snapshot = evaluateGitReadiness({
    contractFiles: ['src/modified.ts', './src/new-file.ts'],
    changes: [
      { path: 'src/modified.ts', indexStatus: ' ', workingTreeStatus: 'M', kind: 'modified' },
      { path: 'src/new-file.ts', indexStatus: '?', workingTreeStatus: '?', kind: 'untracked' },
    ],
    headSha: 'abcdef123456',
  });

  assert.equal(snapshot.state, 'review_ready');
  assert.equal(snapshot.summary, 'Git changes match this contract.');
  assert.equal(snapshot.headSha, 'abcdef123456');
  assert.equal(snapshot.isDirty, true);
  assert.deepEqual(snapshot.matchingFiles, ['src/modified.ts', 'src/new-file.ts']);
  assert.deepEqual(snapshot.unrelatedDirtyFiles, []);
  assert.deepEqual(snapshot.missingContractFiles, []);
  assert.ok(Array.isArray(snapshot.guidance));
  assert.ok(snapshot.inspectedAt.length > 0);
});

test('evaluateGitReadiness blocks review as blocked_dirty_repo when unrelated dirty files exist', () => {
  const snapshot = evaluateGitReadiness({
    contractFiles: ['src/expected.ts'],
    changes: [
      { path: 'src/expected.ts', indexStatus: ' ', workingTreeStatus: 'M', kind: 'modified' },
      { path: 'src/unrelated.ts', indexStatus: ' ', workingTreeStatus: 'M', kind: 'modified' },
    ],
  });

  assert.equal(snapshot.state, 'blocked_dirty_repo');
  assert.deepEqual(snapshot.matchingFiles, ['src/expected.ts']);
  assert.deepEqual(snapshot.unrelatedDirtyFiles, ['src/unrelated.ts']);
  assert.deepEqual(snapshot.missingContractFiles, []);
});

test('evaluateGitReadiness detects stale contract as no_matching_diff when no matching diff exists', () => {
  const snapshot = evaluateGitReadiness({
    contractFiles: ['src/expected.ts'],
    changes: [
      { path: 'src/actual.ts', indexStatus: ' ', workingTreeStatus: 'M', kind: 'modified' },
    ],
  });

  assert.equal(snapshot.state, 'no_matching_diff');
  assert.deepEqual(snapshot.matchingFiles, []);
  assert.deepEqual(snapshot.unrelatedDirtyFiles, ['src/actual.ts']);
  assert.deepEqual(snapshot.missingContractFiles, ['src/expected.ts']);
});

test('evaluateGitReadinessForSnapshot reuses one repository snapshot for different contracts', () => {
  const repositorySnapshot = {
    branch: 'feature/reuse-git-status',
    repoRoot: '/repo',
    headSha: 'abcdef123456',
    changes: [
      { path: 'src/first.ts', indexStatus: ' ', workingTreeStatus: 'M', kind: 'modified' as const },
      { path: 'src/second.ts', indexStatus: '?', workingTreeStatus: '?', kind: 'untracked' as const },
    ],
  };

  const first = evaluateGitReadinessForSnapshot(repositorySnapshot, ['./src/first.ts']);
  const second = evaluateGitReadinessForSnapshot(repositorySnapshot, ['src/second.ts']);

  assert.equal(first.branch, 'feature/reuse-git-status');
  assert.equal(first.headSha, 'abcdef123456');
  assert.deepEqual(first.matchingFiles, ['src/first.ts']);
  assert.deepEqual(first.unrelatedDirtyFiles, ['src/second.ts']);
  assert.deepEqual(second.matchingFiles, ['src/second.ts']);
  assert.deepEqual(second.unrelatedDirtyFiles, ['src/first.ts']);
});

test('evaluateGitReadinessForSnapshot preserves fail-open unknown guidance on git inspection errors', () => {
  const snapshot = evaluateGitReadinessForSnapshot({ error: 'not a git repository' }, ['./src/expected.ts']);

  assert.equal(snapshot.state, 'unknown');
  assert.equal(snapshot.summary, 'Unable to inspect git state.');
  assert.equal(snapshot.error, 'not a git repository');
  assert.equal(snapshot.isDirty, false);
  assert.deepEqual(snapshot.contractFiles, ['src/expected.ts']);
  assert.ok(snapshot.guidance.some((message) => message.includes('run git status manually')));
});
