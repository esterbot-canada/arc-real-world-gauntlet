import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEmail } from '../src/signup/validateEmail.mjs';

test('validateEmail accepts strings containing @', () => {
  assert.equal(validateEmail('person@example.com'), true);
});

test('validateEmail rejects non-email strings', () => {
  assert.equal(validateEmail('not-an-email'), false);
});

test('validateEmail rejects non-strings', () => {
  assert.equal(validateEmail(null), false);
});


test('validateEmail rejects emails with double dots', () => {
  assert.equal(validateEmail('person..name@example.com'), false);
});
