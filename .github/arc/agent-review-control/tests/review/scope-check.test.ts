import assert from 'node:assert/strict';
import test from 'node:test';

import { checkScopeAgainstPlan } from '../../lib/review/scope-check.ts';

test('flags changed file outside allowed globs', () => {
  const result = checkScopeAgainstPlan({
    allowedFiles: ['src/signup/**'],
    excludedFiles: [],
    changedFiles: ['src/signup/Form.tsx', 'src/auth/session.ts'],
  });

  assert.deepEqual(result.allowedChanged, ['src/signup/Form.tsx']);
  assert.deepEqual(result.outsideAllowed, ['src/auth/session.ts']);
  assert.deepEqual(result.excludedTouched, []);
});

test('flags changed file inside excluded globs', () => {
  const result = checkScopeAgainstPlan({
    allowedFiles: ['src/**'],
    excludedFiles: ['src/auth/**'],
    changedFiles: ['src/auth/session.ts'],
  });

  assert.deepEqual(result.allowedChanged, ['src/auth/session.ts']);
  assert.deepEqual(result.outsideAllowed, []);
  assert.deepEqual(result.excludedTouched, ['src/auth/session.ts']);
});

test('deduplicates and normalizes changed files', () => {
  const result = checkScopeAgainstPlan({
    allowedFiles: ['src/signup/**'],
    excludedFiles: [],
    changedFiles: ['./src/signup/Form.tsx', 'src/signup/Form.tsx'],
  });

  assert.deepEqual(result.allowedChanged, ['src/signup/Form.tsx']);
});

test('blocks traversal-looking changed paths instead of letting them match allowed globs', () => {
  const result = checkScopeAgainstPlan({
    allowedFiles: ['src/signup/**'],
    excludedFiles: ['src/auth/**'],
    changedFiles: ['src/signup/../auth/session.ts'],
  });

  assert.deepEqual(result.invalidChangedFiles, ['src/signup/../auth/session.ts']);
  assert.deepEqual(result.allowedChanged, []);
});
