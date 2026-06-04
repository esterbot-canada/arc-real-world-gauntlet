export function validateEmail(email) {
  if (typeof email !== 'string') return false;

  const value = email.trim();
  if (value.length === 0 || /\s/.test(value)) return false;

  const [localPart, domainPart, ...extraParts] = value.split('@');
  if (extraParts.length > 0) return false;
  if (!localPart || !domainPart) return false;
  if (!domainPart.includes('.')) return false;

  return true;
}
