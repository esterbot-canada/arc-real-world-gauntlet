export function normalizeDisplayName(name) {
  return String(name ?? '').trim();
}

export function canShowProfile(profile) {
  return Boolean(profile?.displayName);
}

export function profileDisplayMode(user) {
  return canShowProfile(user) ? 'public' : 'private';
}
