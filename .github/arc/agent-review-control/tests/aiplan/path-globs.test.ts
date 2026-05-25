import assert from 'node:assert/strict';
import test from 'node:test';

import { pathMatchesAnyGlob, pathMatchesGlob } from '../../lib/aiplan/path-globs.ts';

test('supports double star directory glob', () => {
  assert.equal(pathMatchesAnyGlob('src/signup/Form.tsx', ['src/signup/**']), true);
  assert.equal(pathMatchesAnyGlob('src/signup/components/Input.tsx', ['src/signup/**']), true);
  assert.equal(pathMatchesAnyGlob('src/auth/session.ts', ['src/signup/**']), false);
});

test('supports exact file match', () => {
  assert.equal(pathMatchesGlob('package-lock.json', 'package-lock.json'), true);
  assert.equal(pathMatchesGlob('./package-lock.json', 'package-lock.json'), true);
  assert.equal(pathMatchesGlob('src/package-lock.json', 'package-lock.json'), false);
});

test('supports single star within one path segment only', () => {
  assert.equal(pathMatchesGlob('src/signup/Form.test.tsx', 'src/signup/*.test.tsx'), true);
  assert.equal(pathMatchesGlob('src/signup/nested/Form.test.tsx', 'src/signup/*.test.tsx'), false);
});
