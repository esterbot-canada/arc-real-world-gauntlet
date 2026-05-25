import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchUser } from '../src/api/userService.mjs';

test('fetchUser returns parsed user JSON from the service endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);

    return {
      ok: true,
      async json() {
        return { id: 'user-123', email: 'person@example.com' };
      },
    };
  };

  const user = await fetchUser(fetchImpl, 'user-123');

  assert.deepEqual(calls, ['/api/users/user-123']);
  assert.deepEqual(user, { id: 'user-123', email: 'person@example.com' });
});

test('fetchUser throws when the service endpoint fails', async () => {
  const fetchImpl = async () => ({ ok: false });

  await assert.rejects(() => fetchUser(fetchImpl, 'user-123'), /failed to fetch user/);
});
