'use strict';

function isTrustedAdminToken(token = {}) {
  return Boolean(
    token.role === 'admin'
    || (Array.isArray(token.roles) && token.roles.includes('admin'))
    // Preserve already-issued trusted custom claims while deployments roll out.
    || token.admin === true
    || token.isAdmin === true
  );
}

function applyTrustedAdminRole(existingClaims = {}, enabled = false) {
  const claims = { ...existingClaims };
  const roles = new Set(Array.isArray(claims.roles) ? claims.roles.filter((role) => typeof role === 'string') : []);
  if (enabled) {
    roles.add('admin');
    // Keep the legacy claim during rollout for already-deployed consumers.
    claims.admin = true;
  } else {
    roles.delete('admin');
    delete claims.admin;
    delete claims.isAdmin;
    if (claims.role === 'admin') delete claims.role;
  }
  if (roles.size > 0) claims.roles = [...roles];
  else delete claims.roles;
  return claims;
}

module.exports = { applyTrustedAdminRole, isTrustedAdminToken };
