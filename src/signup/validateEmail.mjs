export function validateEmail(email) {
  return typeof email === 'string' && email.includes('@') && !email.includes('..');
}
