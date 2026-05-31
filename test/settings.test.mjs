import assert from 'node:assert/strict';
import test from 'node:test';

import { canShowProfile, normalizeDisplayName, shouldShowProfileTips } from '../src/settings/profile.mjs';

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


test('shouldShowProfileTips hides tips after the user has seen them', () => {
  assert.equal(shouldShowProfileTips({ hasSeenProfileTips: true }), false);
  assert.equal(shouldShowProfileTips({ hasSeenProfileTips: false }), true);
  assert.equal(shouldShowProfileTips(null), true);
});
