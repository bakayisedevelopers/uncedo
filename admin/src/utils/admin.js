export const ADMIN_EMAILS = ['jabuobed1@gmail.com'];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isEmailAllowlistedAdmin(email, emailVerified = false) {
  const normalized = normalizeEmail(email);
  return emailVerified === true && Boolean(normalized) && ADMIN_EMAILS.includes(normalized);
}

export function isUserAdmin(user, claims = {}) {
  if (!user) return false;
  return isEmailAllowlistedAdmin(user.email, user.emailVerified)
    || claims.admin === true
    || claims.isAdmin === true;
}
