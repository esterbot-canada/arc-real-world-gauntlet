import assert from 'node:assert/strict';
import test from 'node:test';

import { computeMinimalAiplanContractHash } from '../../lib/aiplan/contract-hash.ts';
import { parseMinimalAiplanText } from '../../lib/aiplan/minimal-parser.ts';
import { createArcPrCheck } from '../../lib/review/pr-check.ts';

const validPlan = `
version: "1"
kind: "aiplan"
status: "frozen"
allowed_scope:
  files:
    - "src/signup/**"
excluded_scope:
  files:
    - "src/auth/**"
expected_evidence:
  required_commands:
    - "npm test -- SignupForm"
freeze:
  created_by: "planner"
  frozen_at: "2026-05-24T00:00:00Z"
  contract_hash: "sha256:34d6cc4e383cac5fb3d6b2a3efb74aa0d35d146674407f6efb40399d62b217ed"
`;

function freezePlanHash(planText: string): string {
  const withPlaceholder = planText.replace(/contract_hash: ".*"/, 'contract_hash: "sha256:placeholder"');
  const parsed = parseMinimalAiplanText(withPlaceholder);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return withPlaceholder;
  return withPlaceholder.replace('contract_hash: "sha256:placeholder"', `contract_hash: "${computeMinimalAiplanContractHash(parsed.plan)}"`);
}

test('passes when files stay in scope and required command succeeds', () => {
  const result = createArcPrCheck({
    planText: validPlan,
    changedFiles: ['src/signup/Form.tsx'],
    receipts: [{ command: 'npm test -- SignupForm', exitCode: 0, logPath: 'logs/signup.log', provenance: 'trusted_ci' }],
    diffSource: { range: 'base...head', trust: 'provider_verified', description: 'provider-derived base/head: base...head' },
  });

  assert.equal(result.status, 'Pass');
  assert.deepEqual(result.focusQuestions, []);
  assert.match(result.markdown, /ARC Trust Brief: Pass/);
  assert.match(result.markdown, /Allowed scope: src\/signup\/\*\*/);
  assert.match(result.markdown, /Excluded scope: src\/auth\/\*\*/);
  assert.match(result.markdown, /Changed files: src\/signup\/Form.tsx/);
  assert.match(result.markdown, /Frozen contract hash verified: sha256:/);
  assert.match(result.markdown, /Required command passed: npm test -- SignupForm/);
  assert.doesNotMatch(result.markdown, /Diff source:/);
  assert.doesNotMatch(result.markdown, /trusted_ci/);
  assert.doesNotMatch(result.markdown, /provider_verified/);
});

test('needs review for outside allowed scope and missing command receipts', () => {
  const result = createArcPrCheck({
    planText: validPlan,
    changedFiles: ['src/signup/Form.tsx', 'src/session/cache.ts'],
    receipts: [],
    diffSource: { range: 'base...head', trust: 'provider_verified', description: 'provider-derived base/head: base...head' },
  });

  assert.equal(result.status, 'Needs Review');
  assert.match(result.markdown, /src\/session\/cache.ts/);
  assert.match(result.markdown, /npm test -- SignupForm/);
});

test('blocks excluded scope touches', () => {
  const result = createArcPrCheck({
    planText: validPlan,
    changedFiles: ['src/auth/session.ts'],
    receipts: [{ command: 'npm test -- SignupForm', exitCode: 0, provenance: 'trusted_ci' }],
    diffSource: { range: 'base...head', trust: 'provider_verified', description: 'provider-derived base/head: base...head' },
  });

  assert.equal(result.status, 'Blocked');
  assert.match(result.markdown, /excluded scope/);
});

test('blocks invalid plan before trusting diff evidence', () => {
  const result = createArcPrCheck({
    planText: validPlan.replace('status: "frozen"', 'status: "draft"'),
    changedFiles: ['src/signup/Form.tsx'],
    receipts: [{ command: 'npm test -- SignupForm', exitCode: 0, provenance: 'trusted_ci' }],
    diffSource: { range: 'base...head', trust: 'provider_verified', description: 'provider-derived base/head: base...head' },
  });

  assert.equal(result.status, 'Blocked');
  assert.match(result.markdown, /Invalid or non-frozen/);
});

test('blocks plan hash mismatch before trusting diff evidence', () => {
  const result = createArcPrCheck({
    planText: validPlan.replace('- "src/signup/**"', '- "src/profile/**"'),
    changedFiles: ['src/profile/Form.tsx'],
    receipts: [{ command: 'npm test -- SignupForm', exitCode: 0, provenance: 'trusted_ci' }],
    diffSource: { range: 'base...head', trust: 'provider_verified', description: 'provider-derived base/head: base...head' },
  });

  assert.equal(result.status, 'Blocked');
  assert.match(result.markdown, /hash mismatch/i);
  assert.match(result.markdown, /Actual hash from current plan content/);
});

test('needs review when no changed files are detected so empty PRs cannot look trusted', () => {
  const result = createArcPrCheck({
    planText: validPlan,
    changedFiles: [],
    receipts: [{ command: 'npm test -- SignupForm', exitCode: 0, provenance: 'trusted_ci' }],
    diffSource: { range: 'base...head', trust: 'provider_verified', description: 'provider-derived base/head: base...head' },
  });

  assert.equal(result.status, 'Needs Review');
  assert.match(result.markdown, /No changed files/);
});

test('does not repeat outside-allowed focus question for files already blocked by excluded scope', () => {
  const result = createArcPrCheck({
    planText: validPlan,
    changedFiles: ['src/auth/session.ts'],
    receipts: [],
    diffSource: { range: 'base...head', trust: 'provider_verified', description: 'provider-derived base/head: base...head' },
  });

  assert.equal(result.status, 'Blocked');
  assert.equal(result.focusQuestions.filter((question) => question.includes('src/auth/session.ts')).length, 1);
  assert.match(result.markdown, /Excluded file touched: src\/auth\/session.ts/);
});

test('needs review when changed-file evidence comes from caller-provided diff range', () => {
  const result = createArcPrCheck({
    planText: validPlan,
    changedFiles: ['src/signup/Form.tsx'],
    receipts: [{ command: 'npm test -- SignupForm', exitCode: 0, provenance: 'trusted_ci' }],
    diffSource: { range: 'HEAD...HEAD', trust: 'caller_provided', description: 'caller-provided manual range: HEAD...HEAD' },
  });

  assert.equal(result.status, 'Needs Review');
  assert.match(result.markdown, /caller-provided ranges can hide commits/);
});

test('needs review when command receipt is agent-reported instead of trusted CI', () => {
  const result = createArcPrCheck({
    planText: validPlan,
    changedFiles: ['src/signup/Form.tsx'],
    receipts: [{ command: 'npm test -- SignupForm', exitCode: 0, provenance: 'agent_reported' }],
    diffSource: { range: 'base...head', trust: 'provider_verified', description: 'provider-derived base/head: base...head' },
  });

  assert.equal(result.status, 'Needs Review');
  assert.match(result.markdown, /agent-reported command receipts can be forged/i);
});

test('needs review when frozen plan defines no required command evidence', () => {
  const noCommandsPlan = freezePlanHash(validPlan.replace('required_commands:\n    - "npm test -- SignupForm"', 'required_commands: []'));
  const result = createArcPrCheck({
    planText: noCommandsPlan,
    changedFiles: ['src/signup/Form.tsx'],
    receipts: [],
    diffSource: { range: 'base...head', trust: 'provider_verified', description: 'provider-derived base/head: base...head' },
  });

  assert.equal(result.status, 'Needs Review');
  assert.match(result.markdown, /No required command evidence/);
});
