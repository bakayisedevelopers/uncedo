'use strict';

const TRUSTED_ADMIN_EMAILS = new Set(['jabuobed1@gmail.com']);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isTrustedAdminToken(token = {}) {
  return Boolean(
    token.admin === true
    || token.isAdmin === true
    || (token.email_verified === true && TRUSTED_ADMIN_EMAILS.has(normalizeEmail(token.email))),
  );
}

module.exports = { TRUSTED_ADMIN_EMAILS, isTrustedAdminToken, normalizeEmail };
