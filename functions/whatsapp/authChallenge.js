'use strict';

const { createHmac, randomInt, timingSafeEqual } = require('crypto');

const AUTH_ROLES = new Set(['customer', 'helper']);
const AUTH_MODES = new Set(['login', 'signup']);

function normalizeWhatsAppAuthInput(input = {}) {
  const phoneNumber = String(input.phoneNumber || '').replace(/[\s().-]/g, '');
  const role = String(input.role || '').trim().toLowerCase();
  const mode = String(input.mode || '').trim().toLowerCase();
  const name = String(input.name || '').trim().slice(0, 120);
  const email = String(input.email || '').trim().toLowerCase().slice(0, 254);
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    const error = new Error('Enter a valid international WhatsApp number, including the country code.');
    error.code = 'invalid-phone';
    throw error;
  }
  if (!AUTH_ROLES.has(role)) {
    const error = new Error('A supported account role is required.');
    error.code = 'invalid-role';
    throw error;
  }
  if (!AUTH_MODES.has(mode)) {
    const error = new Error('A supported authentication mode is required.');
    error.code = 'invalid-mode';
    throw error;
  }
  if (mode === 'signup' && (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    const error = new Error('A full name and real email address are required for registration.');
    error.code = 'invalid-registration';
    throw error;
  }
  return { phoneNumber, role, mode, name, email };
}

function generateWhatsAppOtp(randomIntImpl = randomInt) {
  return String(randomIntImpl(0, 1000000)).padStart(6, '0');
}

function hashWhatsAppOtp({ challengeId, code, secret }) {
  return createHmac('sha256', String(secret || '')).update(`${challengeId}:${code}`).digest('hex');
}

function constantTimeHashMatch(expectedHash, candidateHash) {
  const expected = Buffer.from(String(expectedHash || ''), 'hex');
  const candidate = Buffer.from(String(candidateHash || ''), 'hex');
  return expected.length === candidate.length && expected.length > 0 && timingSafeEqual(expected, candidate);
}

function normalizeRoleValues(profile = {}) {
  return [profile.role, profile.activeRole, ...(Array.isArray(profile.roles) ? profile.roles : [])]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function profileAllowsRole(profile, expectedRole) {
  const roles = normalizeRoleValues(profile);
  if (expectedRole === 'customer') return roles.some((role) => ['customer', 'student', 'client'].includes(role));
  if (expectedRole === 'helper') return roles.some((role) => ['helper', 'provider', 'tutor'].includes(role));
  return false;
}

module.exports = {
  constantTimeHashMatch,
  generateWhatsAppOtp,
  hashWhatsAppOtp,
  normalizeRoleValues,
  normalizeWhatsAppAuthInput,
  profileAllowsRole,
};
