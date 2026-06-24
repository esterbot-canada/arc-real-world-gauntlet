export function normalizeDisplayName(name) {
  return String(name ?? '').trim();
}

export function canShowProfile(profile) {
  return normalizeDisplayName(profile?.displayName).length > 0;
}
