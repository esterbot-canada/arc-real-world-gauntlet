import assert from 'node:assert/strict';
import test from 'node:test';

import { createSession, isSessionExpired } from '../src/auth/session.mjs';

test('createSession creates a one-hour session for a user', () => {
  const session = createSession('user-123');

  assert.equal(session.userId, 'user-123');
  assert.equal(session.expiresInMinutes, 60);
  assert.match(session.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('createSession requires a user id', () => {
  assert.throws(() => createSession(''), /userId required/);
});

test('isSessionExpired checks expiration from createdAt', () => {
  const session = {
    userId: 'user-123',
    createdAt: '2026-05-25T10:00:00.000Z',
    expiresInMinutes: 60,
  };

  assert.equal(isSessionExpired(session, new Date('2026-05-25T10:30:00.000Z')), false);
  assert.equal(isSessionExpired(session, new Date('2026-05-25T11:01:00.000Z')), true);
});
