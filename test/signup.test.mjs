import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEmail } from '../src/signup/validateEmail.mjs';

test('validateEmail accepts normal email addresses', () => {
  assert.equal(validateEmail('person@example.com'), true);
});

test('validateEmail rejects strings without an at sign', () => {
  assert.equal(validateEmail('not-an-email'), false);
});

test('validateEmail rejects non-strings', () => {
  assert.equal(validateEmail(null), false);
});

test('validateEmail rejects missing local part', () => {
  assert.equal(validateEmail('@example.com'), false);
});

test('validateEmail rejects missing domain', () => {
  assert.equal(validateEmail('person@'), false);
});

test('validateEmail rejects whitespace-only input', () => {
  assert.equal(validateEmail('   '), false);
});

test('validateEmail rejects emails containing whitespace', () => {
  assert.equal(validateEmail('person @example.com'), false);
});
