export function normalizeDisplayName(name) {
  if (typeof name !== 'string') return '';
  return name.trim();
}

export function canShowProfile(profile) {
  return normalizeDisplayName(profile.displayName).length > 0;
}

export function validateDisplayName(name) {
  const normalized = normalizeDisplayName(name);
  return normalized.length >= 2 && normalized.length <= 40;
}
