export const ADMIN_EMAILS = ['jabuobed1@gmail.com'];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isEmailAllowlistedAdmin(email) {
  const normalized = normalizeEmail(email);
  return Boolean(normalized) && ADMIN_EMAILS.includes(normalized);
}

export function isUserAdmin(user) {
  if (!user) return false;

  if (isEmailAllowlistedAdmin(user.email)) {
    return true;
  }

  if (user.isAdmin === true) {
    return true;
  }

  const roles = Array.isArray(user.roles) ? user.roles.map((role) => String(role || '').toLowerCase()) : [];
  return roles.includes('admin') || String(user.role || '').toLowerCase() === 'admin';
}
