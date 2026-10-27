export function isUserAdmin(user, claims = {}) {
  if (!user) return false;
  return claims.role === 'admin'
    || (Array.isArray(claims.roles) && claims.roles.includes('admin'))
    || claims.admin === true
    || claims.isAdmin === true;
}
