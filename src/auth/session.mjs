export function createSession(userId) {
  if (!userId) {
    throw new Error('userId required');
  }

  return {
    userId,
    createdAt: new Date().toISOString(),
    expiresInMinutes: 60,
  };
}

export function isSessionExpired(session, now = new Date()) {
  const created = new Date(session.createdAt);
  return now.getTime() - created.getTime() > session.expiresInMinutes * 60_000;
}
