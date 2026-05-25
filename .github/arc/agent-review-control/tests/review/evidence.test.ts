import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEvidenceSnapshot,
  deriveChangedFileSignals,
  stableHash,
  type ArcEvidenceRef,
  type ArcEvidenceRequirement,
} from '../../lib/review/evidence.ts';

test('hashes objects stably independent of key order', () => {
  assert.equal(stableHash({ b: 2, a: 1 }), stableHash({ a: 1, b: 2 }));
});

test('hashes arrays in order', () => {
  assert.notEqual(stableHash(['a', 'b']), stableHash(['b', 'a']));
});

test('hash canonicalization omits object undefined, preserves null, and serializes dates', () => {
  assert.equal(stableHash({ a: 1, b: undefined }), stableHash({ a: 1 }));
  assert.notEqual(stableHash({ a: null }), stableHash({}));
  assert.equal(
    stableHash({ at: new Date('2026-05-21T20:41:12.000Z') }),
    stableHash({ at: '2026-05-21T20:41:12.000Z' }),
  );
  assert.equal(stableHash([undefined]), stableHash([null]));
});

test('derives dependency, migration, generated, vendor, binary, and sensitive file signals', () => {
  const signals = deriveChangedFileSignals([
    { path: 'package-lock.json', status: 'modified' },
    { path: 'lib/migrations/002_add_users.sql', status: 'added' },
    { path: 'app/api/auth/route.ts', status: 'modified' },
    { path: 'security/policies/rbac.ts', status: 'modified' },
    { path: 'generated/client.ts', status: 'modified' },
    { path: 'vendor/sdk/index.ts', status: 'modified' },
    { path: 'public/logo.png', status: 'modified' },
  ]);

  assert.equal(signals.dependencyChanged, true);
  assert.equal(signals.migrationChanged, true);
  assert.equal(signals.generatedFilesTouched, true);
  assert.equal(signals.vendorFilesTouched, true);
  assert.equal(signals.binaryFilesTouched, true);
  assert.deepEqual(signals.sensitiveAreasTouched, ['auth', 'database', 'security']);
  assert.deepEqual(signals.dependencyFiles, ['package-lock.json']);
  assert.deepEqual(signals.migrationFiles, ['lib/migrations/002_add_users.sql']);
});

test('creates snapshot bound to plan hash and PR shas', () => {
  const snapshot = createEvidenceSnapshot({
    plan: {
      id: 'github-darkn0ir-arc-issue-42',
      path: '.arc/plans/github-darkn0ir-arc-issue-42.aiplan',
      status: 'frozen',
      contentHash: 'planhash',
    },
    subject: {
      provider: 'github',
      repo: 'darkn0ir/arc',
      prNumber: 42,
      headSha: 'head',
      baseSha: 'base',
      branch: 'agent/issue-42',
    },
    changedFiles: [{ path: 'lib/review/evidence.ts', status: 'added' }],
    collectedAt: '2026-05-21T20:41:12.000Z',
  });

  assert.equal(snapshot.planHash, 'planhash');
  assert.equal(snapshot.headSha, 'head');
  assert.equal(snapshot.baseSha, 'base');
  assert.equal(snapshot.freshness, 'current');
  assert.ok(snapshot.diffHash.length > 0);
  assert.ok(snapshot.evidenceSnapshotId.length > 0);
});

test('marks required evidence missing when no current evidence ref satisfies it', () => {
  const requiredEvidence: ArcEvidenceRequirement[] = [
    { id: 'validation-output', type: 'command_output', description: 'test output', required: true },
  ];

  const snapshot = createEvidenceSnapshot({
    plan: { id: 'p1', path: '.arc/plans/p1.aiplan', status: 'frozen', contentHash: 'planhash' },
    subject: { provider: 'github', repo: 'r', prNumber: 1, headSha: 'h', baseSha: 'b', branch: 'x' },
    changedFiles: [],
    requiredEvidence,
    collectedAt: '2026-05-21T20:41:12.000Z',
  });

  assert.deepEqual(snapshot.missingRequiredEvidence, ['validation-output']);
});

test('treats current evidence refs as satisfying required evidence', () => {
  const requiredEvidence: ArcEvidenceRequirement[] = [
    { id: 'validation-output', type: 'command_output', description: 'test output', required: true },
  ];
  const refs: ArcEvidenceRef[] = [
    {
      id: 'cmd:test',
      kind: 'command_output',
      source: 'agent',
      trustLevel: 'agent_reported',
      freshness: 'current',
      label: 'Focused test output',
      satisfies: ['validation-output'],
      collectedAt: '2026-05-21T20:41:12.000Z',
      redacted: false,
      contentHash: 'abc123',
    },
  ];

  const snapshot = createEvidenceSnapshot({
    plan: { id: 'p1', path: '.arc/plans/p1.aiplan', status: 'frozen', contentHash: 'planhash' },
    subject: { provider: 'github', repo: 'r', prNumber: 1, headSha: 'h', baseSha: 'b', branch: 'x' },
    changedFiles: [],
    refs,
    requiredEvidence,
    collectedAt: '2026-05-21T20:41:12.000Z',
  });

  assert.deepEqual(snapshot.missingRequiredEvidence, []);
});

test('does not allow stale evidence refs to satisfy required evidence', () => {
  const requiredEvidence: ArcEvidenceRequirement[] = [
    { id: 'validation-output', type: 'command_output', description: 'test output', required: true },
  ];
  const refs: ArcEvidenceRef[] = [
    {
      id: 'cmd:test',
      kind: 'command_output',
      source: 'agent',
      trustLevel: 'agent_reported',
      freshness: 'stale',
      label: 'Old test output',
      satisfies: ['validation-output'],
      collectedAt: '2026-05-21T20:41:12.000Z',
      redacted: false,
      contentHash: 'abc123',
    },
  ];

  const snapshot = createEvidenceSnapshot({
    plan: { id: 'p1', path: '.arc/plans/p1.aiplan', status: 'frozen', contentHash: 'planhash' },
    subject: { provider: 'github', repo: 'r', prNumber: 1, headSha: 'h', baseSha: 'b', branch: 'x' },
    changedFiles: [],
    refs,
    requiredEvidence,
    collectedAt: '2026-05-21T20:41:12.000Z',
  });

  assert.deepEqual(snapshot.missingRequiredEvidence, ['validation-output']);
});
