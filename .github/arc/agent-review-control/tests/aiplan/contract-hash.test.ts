import assert from 'node:assert/strict';
import test from 'node:test';

import { computeMinimalAiplanContractHash, verifyMinimalAiplanContractHash } from '../../lib/aiplan/contract-hash.ts';
import { parseMinimalAiplanText } from '../../lib/aiplan/minimal-parser.ts';

const planText = `
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

test('computes stable hash with contract_hash treated as null', () => {
  const parsed = parseMinimalAiplanText(planText);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(computeMinimalAiplanContractHash(parsed.plan), 'sha256:34d6cc4e383cac5fb3d6b2a3efb74aa0d35d146674407f6efb40399d62b217ed');
});

test('verifies unchanged frozen plan hash', () => {
  const parsed = parseMinimalAiplanText(planText);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(verifyMinimalAiplanContractHash(parsed.plan).ok, true);
});

test('rejects tampered plan content after freeze', () => {
  const parsed = parseMinimalAiplanText(planText.replace('- "src/signup/**"', '- "src/auth/**"'));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const result = verifyMinimalAiplanContractHash(parsed.plan);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /does not match/i);
});


test('preserves legacy frozen hash when optional acceptance evidence fields are omitted', () => {
  const parsed = parseMinimalAiplanText(planText);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const result = verifyMinimalAiplanContractHash(parsed.plan);
  assert.equal(result.ok, true);
  assert.equal(result.actualHash, 'sha256:34d6cc4e383cac5fb3d6b2a3efb74aa0d35d146674407f6efb40399d62b217ed');
});

test('explicit empty optional acceptance evidence fields preserve legacy hash', () => {
  const planTextWithExplicitEmptyOptionalEvidence = planText.replace(
    '  required_commands:\n    - "npm test -- SignupForm"',
    '  required_commands:\n    - "npm test -- SignupForm"\n  required_changed_files: []\n  required_test_patterns: []',
  );
  const parsed = parseMinimalAiplanText(planTextWithExplicitEmptyOptionalEvidence);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(computeMinimalAiplanContractHash(parsed.plan), 'sha256:34d6cc4e383cac5fb3d6b2a3efb74aa0d35d146674407f6efb40399d62b217ed');
  assert.equal(verifyMinimalAiplanContractHash(parsed.plan).ok, true);
});

test('hash changes when optional acceptance evidence fields change', () => {
  const parsed = parseMinimalAiplanText(planText);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const baseline = computeMinimalAiplanContractHash(parsed.plan);
  assert.notEqual(
    computeMinimalAiplanContractHash({
      ...parsed.plan,
      expected_evidence: {
        ...parsed.plan.expected_evidence,
        required_changed_files: ['src/signup/Form.tsx'],
      },
    }),
    baseline,
  );
  assert.notEqual(
    computeMinimalAiplanContractHash({
      ...parsed.plan,
      expected_evidence: {
        ...parsed.plan.expected_evidence,
        required_test_patterns: ['SignupForm renders'],
      },
    }),
    baseline,
  );
});
