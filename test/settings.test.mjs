import assert from 'node:assert/strict';
import test from 'node:test';

import { canShowProfile, normalizeDisplayName } from '../src/settings/profile.mjs';

test('normalizeDisplayName trims user-entered names', () => {
  assert.equal(normalizeDisplayName('  Sam  '), 'Sam');
});

test('normalizeDisplayName converts missing values to empty strings', () => {
  assert.equal(normalizeDisplayName(null), '');
});

test('canShowProfile requires a display name', () => {
  assert.equal(canShowProfile({ displayName: 'Sam' }), true);
  assert.equal(canShowProfile({ displayName: '' }), false);
});
