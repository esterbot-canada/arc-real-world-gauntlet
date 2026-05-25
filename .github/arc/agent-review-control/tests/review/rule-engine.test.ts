import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiplanV1 } from '../../lib/aiplan/types.ts';
import { createEvidenceSnapshot, type ArcChangedFile, type ArcEvidenceRef } from '../../lib/review/evidence.ts';
import { aggregateVerdict, runArcReviewRules, type ArcFinding } from '../../lib/review/rule-engine.ts';

const collectedAt = '2026-05-21T20:41:12.000Z';

function basePlan(overrides: Partial<AiplanV1> = {}): Partial<AiplanV1> {
  return {
    id: 'p1',
    status: 'frozen',
    scope: {
      allowed: { areas: [], likely_files: [], allowed_change_types: ['feature'], additional_files_policy: 'allowed_if_directly_required_and_reported' },
      disallowed: { files: [], areas: [], change_types: [] },
    },
    required_evidence: [{ id: 'validation-output', type: 'command_output', description: 'test output', required: true }],
    permissions: {
      dependency_changes_allowed: false,
      migration_allowed: false,
      network_access_required: false,
      secrets_required: false,
      browser_required: false,
      external_api_changes_allowed: false,
      destructive_actions_allowed: false,
    },
    freeze: {
      frozen_at: collectedAt,
      frozen_by: 'DarkN0ir',
      content_hash: 'planhash',
      hash_algorithm: 'sha256',
      freeze_reason: 'test',
      immutable_after_frozen: true,
    },
    ...overrides,
  };
}

function evidenceRef(overrides: Partial<ArcEvidenceRef> = {}): ArcEvidenceRef {
  return {
    id: 'cmd:test',
    kind: 'command_output',
    source: 'agent',
    trustLevel: 'agent_reported',
    freshness: 'current',
    label: 'Focused test output',
    satisfies: ['validation-output'],
    collectedAt,
    redacted: false,
    contentHash: 'abc123',
    ...overrides,
  };
}

function snapshot(options: {
  planStatus?: 'draft' | 'frozen' | 'superseded' | 'missing';
  planHash?: string | null;
  changedFiles?: ArcChangedFile[];
  refs?: ArcEvidenceRef[];
  freshness?: 'current' | 'stale' | 'unknown';
  staleReason?: string;
} = {}) {
  return createEvidenceSnapshot({
    plan: {
      id: 'p1',
      path: '.arc/plans/p1.aiplan',
      status: options.planStatus ?? 'frozen',
      contentHash: options.planHash ?? 'planhash',
    },
    subject: {
      provider: 'github',
      repo: 'darkn0ir/arc',
      prNumber: 1,
      headSha: 'head',
      baseSha: 'base',
      branch: 'agent/issue-1',
    },
    changedFiles: options.changedFiles ?? [],
    refs: options.refs ?? [evidenceRef()],
    requiredEvidence: [{ id: 'validation-output', type: 'command_output', description: 'test output', required: true }],
    freshness: options.freshness,
    staleReason: options.staleReason,
    collectedAt,
  });
}

test('missing plan blocks', () => {
  const run = runArcReviewRules({ plan: null, snapshot: snapshot({ planStatus: 'missing' }), createdAt: collectedAt });

  assert.equal(run.verdict.status, 'blocked');
  assert.ok(run.findings.some((finding) => finding.ruleId === 'contract.plan_missing_or_not_frozen' && finding.blockingEligible));
});

test('non-frozen plan blocks', () => {
  const run = runArcReviewRules({
    plan: basePlan({ status: 'draft' }),
    snapshot: snapshot({ planStatus: 'draft' }),
    createdAt: collectedAt,
  });

  assert.equal(run.verdict.status, 'blocked');
  assert.ok(run.findings.some((finding) => finding.ruleId === 'contract.plan_missing_or_not_frozen'));
});

test('plan hash mismatch blocks', () => {
  const run = runArcReviewRules({
    plan: basePlan(),
    snapshot: snapshot({ planHash: 'different' }),
    createdAt: collectedAt,
  });

  assert.equal(run.verdict.status, 'blocked');
  assert.ok(run.findings.some((finding) => finding.ruleId === 'contract.plan_hash_mismatch' && finding.blockingEligible));
});

test('stale snapshot defaults to needs_review instead of over-blocking', () => {
  const run = runArcReviewRules({
    plan: basePlan(),
    snapshot: snapshot({ freshness: 'stale', staleReason: 'head_sha_changed' }),
    createdAt: collectedAt,
  });

  assert.equal(run.verdict.status, 'needs_review');
  assert.ok(run.findings.some((finding) => finding.ruleId === 'evidence.snapshot_stale' && !finding.blockingEligible));
});

test('missing required evidence creates needs_review', () => {
  const run = runArcReviewRules({
    plan: basePlan(),
    snapshot: snapshot({ refs: [] }),
    createdAt: collectedAt,
  });

  assert.equal(run.verdict.status, 'needs_review');
  assert.ok(run.findings.some((finding) => finding.ruleId === 'evidence.required_missing'));
});

test('dependency change without permission creates needs_review finding', () => {
  const run = runArcReviewRules({
    plan: basePlan(),
    snapshot: snapshot({ changedFiles: [{ path: 'package-lock.json', status: 'modified' }] }),
    createdAt: collectedAt,
  });

  assert.equal(run.verdict.status, 'needs_review');
  const finding = run.findings.find((item) => item.ruleId === 'dependency.change_without_permission');
  assert.ok(finding);
  assert.equal(finding.blockingEligible, false);
  assert.equal(finding.suggestedOutcome, 'review');
});

test('migration change without permission creates needs_review finding', () => {
  const run = runArcReviewRules({
    plan: basePlan(),
    snapshot: snapshot({ changedFiles: [{ path: 'db/migrations/001_add_users.sql', status: 'added' }] }),
    createdAt: collectedAt,
  });

  assert.equal(run.verdict.status, 'needs_review');
  assert.ok(run.findings.some((finding) => finding.ruleId === 'migration.change_without_permission'));
});

test('disallowed area touched blocks when explicit and high confidence', () => {
  const run = runArcReviewRules({
    plan: basePlan({
      scope: {
        allowed: { areas: [], likely_files: [], allowed_change_types: ['feature'], additional_files_policy: 'allowed_if_directly_required_and_reported' },
        disallowed: { files: [], areas: ['auth'], change_types: [] },
      },
    }),
    snapshot: snapshot({ changedFiles: [{ path: 'app/api/auth/route.ts', status: 'modified' }] }),
    createdAt: collectedAt,
  });

  assert.equal(run.verdict.status, 'blocked');
  assert.ok(run.findings.some((finding) => finding.ruleId === 'scope.disallowed_area_touched' && finding.relatedFiles.includes('app/api/auth/route.ts')));
});

test('disallowed area does not block substring-only path matches', () => {
  const run = runArcReviewRules({
    plan: basePlan({
      scope: {
        allowed: { areas: [], likely_files: [], allowed_change_types: ['feature'], additional_files_policy: 'allowed_if_directly_required_and_reported' },
        disallowed: { files: [], areas: ['auth'], change_types: [] },
      },
    }),
    snapshot: snapshot({ changedFiles: [{ path: 'app/author-profile.ts', status: 'modified' }] }),
    createdAt: collectedAt,
  });

  assert.notEqual(run.verdict.status, 'blocked');
  assert.equal(run.findings.some((finding) => finding.ruleId === 'scope.disallowed_area_touched'), false);
});

test('disallowed file touched blocks when exact file changed', () => {
  const run = runArcReviewRules({
    plan: basePlan({
      scope: {
        allowed: { areas: [], likely_files: [], allowed_change_types: ['feature'], additional_files_policy: 'allowed_if_directly_required_and_reported' },
        disallowed: { files: ['secret.ts'], areas: [], change_types: [] },
      },
    }),
    snapshot: snapshot({ changedFiles: [{ path: 'secret.ts', status: 'modified' }] }),
    createdAt: collectedAt,
  });

  assert.equal(run.verdict.status, 'blocked');
  assert.ok(run.findings.some((finding) => finding.ruleId === 'scope.disallowed_file_touched'));
});

test('clean current snapshot with satisfied evidence is trusted', () => {
  const run = runArcReviewRules({ plan: basePlan(), snapshot: snapshot(), createdAt: collectedAt });

  assert.equal(run.verdict.status, 'trusted');
  assert.deepEqual(run.findings, []);
  assert.equal(run.trustBrief.reviewerAction, 'safe_to_skim');
});

test('note-only findings aggregate to trusted_with_notes', () => {
  const noteFinding: ArcFinding = {
    id: 'note:1',
    fingerprint: 'note',
    ruleId: 'note.only',
    ruleVersion: '1.0',
    severity: 'info',
    category: 'risk',
    status: 'open',
    confidence: 'medium',
    falsePositiveRisk: 'medium',
    blockingEligible: false,
    suggestedOutcome: 'note',
    humanTitle: 'Note',
    humanSummary: 'FYI only.',
    ownerAction: 'No action required.',
    agentExplanation: 'Note-only finding.',
    evidenceRefs: [],
    relatedAiplanFields: [],
    relatedFiles: [],
    createdAt: collectedAt,
  };

  assert.equal(aggregateVerdict([noteFinding]).status, 'trusted_with_notes');
});

test('findings include human and agent fields', () => {
  const run = runArcReviewRules({
    plan: basePlan(),
    snapshot: snapshot({ changedFiles: [{ path: 'package-lock.json', status: 'modified' }] }),
    createdAt: collectedAt,
  });
  const finding = run.findings[0];

  assert.ok(finding.humanTitle.length > 0);
  assert.ok(finding.humanSummary.length > 0);
  assert.ok(finding.ownerAction.length > 0);
  assert.ok(finding.agentExplanation.length > 0);
  assert.ok(finding.agentActionHint && finding.agentActionHint.length > 0);
});
