import assert from 'node:assert/strict';
import test from 'node:test';

import { validateMinimalAiplan } from '../../lib/aiplan/minimal-schema.ts';
import { parseMinimalAiplanText } from '../../lib/aiplan/minimal-parser.ts';

const validPlanText = `
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
  contract_hash: "sha256:abc"
`;

test('accepts smallest frozen verifier contract', () => {
  const result = validateMinimalAiplan({
    version: '1',
    kind: 'aiplan',
    status: 'frozen',
    allowed_scope: { files: ['src/signup/**'] },
    excluded_scope: { files: ['src/auth/**'] },
    expected_evidence: { required_commands: ['npm test -- SignupForm'] },
    freeze: { created_by: 'planner', frozen_at: '2026-05-24T00:00:00Z', contract_hash: 'sha256:abc' },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.plan.allowed_scope.files, ['src/signup/**']);
    assert.deepEqual(result.plan.excluded_scope.files, ['src/auth/**']);
    assert.deepEqual(result.plan.expected_evidence.required_commands, ['npm test -- SignupForm']);
    assert.deepEqual(result.plan.expected_evidence.required_changed_files, []);
    assert.deepEqual(result.plan.expected_evidence.required_test_patterns, []);
  }
});

test('accepts optional acceptance evidence fields', () => {
  const result = validateMinimalAiplan({
    version: '1',
    kind: 'aiplan',
    status: 'frozen',
    allowed_scope: { files: ['src/signup/**'] },
    excluded_scope: { files: [] },
    expected_evidence: {
      required_commands: ['npm test -- SignupForm'],
      required_changed_files: ['src/signup/Form.tsx', 'tests/signup.test.ts'],
      required_test_patterns: ['SignupForm renders', 'creates an account'],
    },
    freeze: { created_by: 'planner', frozen_at: '2026-05-24T00:00:00Z', contract_hash: 'sha256:abc' },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.plan.expected_evidence.required_changed_files, ['src/signup/Form.tsx', 'tests/signup.test.ts']);
    assert.deepEqual(result.plan.expected_evidence.required_test_patterns, ['SignupForm renders', 'creates an account']);
  }
});

test('rejects non-frozen plan', () => {
  const result = validateMinimalAiplan({
    version: '1',
    kind: 'aiplan',
    status: 'draft',
    allowed_scope: { files: ['src/**'] },
    excluded_scope: { files: [] },
    expected_evidence: { required_commands: [] },
    freeze: { created_by: 'planner', frozen_at: '2026-05-24T00:00:00Z', contract_hash: 'sha256:abc' },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((error) => error.field === 'status'));
});

test('rejects missing allowed file globs', () => {
  const result = validateMinimalAiplan({
    version: '1',
    kind: 'aiplan',
    status: 'frozen',
    allowed_scope: { files: [] },
    excluded_scope: { files: [] },
    expected_evidence: { required_commands: [] },
    freeze: { created_by: 'planner', frozen_at: '2026-05-24T00:00:00Z', contract_hash: 'sha256:abc' },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((error) => error.field === 'allowed_scope.files'));
});

test('parses yaml minimal aiplan text', () => {
  const result = parseMinimalAiplanText(`
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
  contract_hash: "sha256:abc"
`);

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.plan.allowed_scope.files, ['src/signup/**']);
});

test('returns validation errors for invalid yaml plan', () => {
  const result = parseMinimalAiplanText(`
version: "1"
kind: "aiplan"
status: "draft"
allowed_scope:
  files:
    - "src/signup/**"
excluded_scope:
  files: []
expected_evidence:
  required_commands: []
freeze:
  created_by: "planner"
  frozen_at: "2026-05-24T00:00:00Z"
  contract_hash: "sha256:abc"
`);

  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((error) => error.field === 'status'));
});

test('rejects broad wildcard-only allowed scope that would make every file look in scope', () => {
  const result = parseMinimalAiplanText(validPlanText.replace('- "src/signup/**"', '- "**"'));

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.map((error) => error.reason).join('\n'), /too broad/i);
});

test('rejects traversal globs and unknown nested fields', () => {
  const withTraversal = validPlanText.replace('- "src/signup/**"', '- "../src/signup/**"');
  const traversalResult = parseMinimalAiplanText(withTraversal);
  assert.equal(traversalResult.ok, false);

  const withUnknownNested = validPlanText.replace('allowed_scope:\n  files:', 'allowed_scope:\n  mode: "all"\n  files:');
  const nestedResult = parseMinimalAiplanText(withUnknownNested);
  assert.equal(nestedResult.ok, false);
  if (!nestedResult.ok) assert.match(nestedResult.errors.map((error) => error.field).join('\n'), /allowed_scope\.mode/);
});

test('rejects duplicate required commands after trimming', () => {
  const result = parseMinimalAiplanText(validPlanText.replace('- "npm test -- SignupForm"', '- "npm test -- SignupForm"\n    - " npm test -- SignupForm "'));

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.map((error) => error.reason).join('\n'), /Duplicate/i);
});


test('rejects absolute and traversal-heavy dangerous plan globs', () => {
  for (const glob of ['../**', '/etc/**', 'src/**/../auth/**']) {
    const result = parseMinimalAiplanText(validPlanText.replace('- "src/signup/**"', `- "${glob}"`));
    assert.equal(result.ok, false);
  }
});

test('rejects unsafe required changed files and invalid test patterns', () => {
  for (const path of ['src/signup/**', '/tmp/file.ts', '../file.ts', 'src//file.ts']) {
    const result = parseMinimalAiplanText(validPlanText.replace(
      'required_commands:\n    - "npm test -- SignupForm"',
      `required_commands:\n    - "npm test -- SignupForm"\n  required_changed_files:\n    - "${path}"`,
    ));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.map((error) => `${error.field}: ${error.reason}`).join('\n'), /required_changed_files/);
  }

  const backslashPath = validateMinimalAiplan({
    version: '1',
    kind: 'aiplan',
    status: 'frozen',
    allowed_scope: { files: ['src/signup/**'] },
    excluded_scope: { files: [] },
    expected_evidence: { required_commands: [], required_changed_files: ['src\\file.ts'] },
    freeze: { created_by: 'planner', frozen_at: '2026-05-24T00:00:00Z', contract_hash: 'sha256:abc' },
  });
  assert.equal(backslashPath.ok, false);
  if (!backslashPath.ok) assert.match(backslashPath.errors.map((error) => `${error.field}: ${error.reason}`).join('\n'), /required_changed_files/);

  const invalidPattern = parseMinimalAiplanText(validPlanText.replace(
    'required_commands:\n    - "npm test -- SignupForm"',
    'required_commands:\n    - "npm test -- SignupForm"\n  required_test_patterns:\n    - ""',
  ));
  assert.equal(invalidPattern.ok, false);
  if (!invalidPattern.ok) assert.match(invalidPattern.errors.map((error) => error.field).join('\n'), /required_test_patterns/);
});

test('rejects unknown expected evidence fields', () => {
  const result = parseMinimalAiplanText(validPlanText.replace(
    'required_commands:\n    - "npm test -- SignupForm"',
    'required_commands:\n    - "npm test -- SignupForm"\n  screenshots:\n    - "screenshot.png"',
  ));

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.map((error) => error.field).join('\n'), /expected_evidence\.screenshots/);
});
