import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePushGate } from '../../lib/gate/policy.ts';

const baseItem = {
  id: 'review-1',
  reviewStatus: 'Human Approved',
  approval: { approvedAt: '2026-05-10T00:00:00.000Z', approvedBy: 'DarkN0ir' },
  completionEvidence: { submittedAt: '2026-05-10T00:01:00.000Z', testsRun: ['npm test'], summary: 'Done' },
  contract: { files_touched: ['apps/example/page.tsx'] },
  git: { state: 'review_ready', unrelatedDirtyFiles: [], matchingFiles: ['apps/example/page.tsx'] },
  risk: { severity: 'low' },
} as any;

test('allows push for approved review with matching git readiness and evidence', () => {
  const result = evaluatePushGate(baseItem);
  assert.equal(result.allowed, true);
  assert.deepEqual(result.blockers, []);
});

test('blocks push without human approval', () => {
  const result = evaluatePushGate({ ...baseItem, reviewStatus: 'Needs Review', approval: {} });
  assert.equal(result.allowed, false);
  assert.match(result.blockers.join('\n'), /Human Approved/);
});

test('blocks push when git readiness has unrelated dirty files', () => {
  const result = evaluatePushGate({ ...baseItem, git: { state: 'blocked_dirty_repo', unrelatedDirtyFiles: ['other.ts'], matchingFiles: [] } });
  assert.equal(result.allowed, false);
  assert.match(result.blockers.join('\n'), /unrelated dirty/i);
});

test('blocks push when completion evidence is missing', () => {
  const result = evaluatePushGate({ ...baseItem, completionEvidence: {} });
  assert.equal(result.allowed, false);
  assert.match(result.blockers.join('\n'), /completion evidence/i);
});
