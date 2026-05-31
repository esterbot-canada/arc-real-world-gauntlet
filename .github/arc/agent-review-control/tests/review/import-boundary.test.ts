import assert from 'node:assert/strict';
import test from 'node:test';

import { checkImportBoundary, extractLocalImportSpecifiers } from '../../lib/review/import-boundary.ts';

test('extracts static import export and require local specifiers', () => {
  assert.deepEqual(extractLocalImportSpecifiers(`
import x from './x';
import type { Y } from "../y";
export { z } from './z';
const c = require('./c');
import pkg from 'react';
`), ['./x', '../y', './z', './c']);
});

test('flags direct import into excluded scope from changed file', () => {
  const result = checkImportBoundary({
    entryFiles: ['test/signup.test.ts'],
    fileTexts: {
      'test/signup.test.ts': `import { createSession } from '../src/auth/session';`,
    },
    excludedFiles: ['src/auth/**'],
  });

  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].resolvedPath, 'src/auth/session');
  assert.deepEqual(result.violations[0].chain, ['test/signup.test.ts', 'src/auth/session']);
});

test('follows one-hop barrel re-export into excluded scope', () => {
  const result = checkImportBoundary({
    entryFiles: ['test/signup.test.ts'],
    fileTexts: {
      'test/signup.test.ts': `import { createSession } from '../src/signup/testing';`,
      'src/signup/testing.ts': `export { createSession } from '../auth/session';`,
    },
    excludedFiles: ['src/auth/**'],
  });

  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].resolvedPath, 'src/auth/session');
  assert.deepEqual(result.violations[0].chain, ['test/signup.test.ts', 'src/signup/testing.ts', 'src/auth/session']);
});

test('does not flag local imports that stay outside excluded scope', () => {
  const result = checkImportBoundary({
    entryFiles: ['test/signup.test.ts'],
    fileTexts: {
      'test/signup.test.ts': `import { renderSignup } from '../src/signup/Form';`,
      'src/signup/Form.tsx': `export function renderSignup() {}`,
    },
    excludedFiles: ['src/auth/**'],
  });

  assert.deepEqual(result.violations, []);
});
