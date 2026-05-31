export function normalizeDisplayName(name) {
  return String(name ?? '').trim();
}

export function canShowProfile(profile) {
  return Boolean(profile?.displayName);
}

export function shouldShowProfileTips(profile) {
  return !profile || profile.hasSeenProfileTips !== true;
}
