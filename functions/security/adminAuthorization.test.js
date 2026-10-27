'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTrustedAdminRole, isTrustedAdminToken } = require('./adminAuthorization');

test('admin authorization accepts trusted custom admin-role claims', () => {
  assert.equal(isTrustedAdminToken({ role: 'admin' }), true);
  assert.equal(isTrustedAdminToken({ roles: ['customer', 'admin'] }), true);
  assert.equal(isTrustedAdminToken({ admin: true }), true);
  assert.equal(isTrustedAdminToken({ isAdmin: true }), true);
});

test('email and editable profile data do not grant backend admin authorization', () => {
  assert.equal(isTrustedAdminToken({ email: 'bakayise.developers@gmail.com', email_verified: true }), false);
  assert.equal(isTrustedAdminToken({ email: 'jabuobed1@gmail.com', email_verified: true }), false);
  assert.equal(isTrustedAdminToken({ profile: { role: 'admin', isAdmin: true } }), false);
});

test('trusted admin role updates preserve unrelated custom claims', () => {
  assert.deepEqual(
    applyTrustedAdminRole({ roles: ['helper'], locale: 'en', isAdmin: true }, true),
    { roles: ['helper', 'admin'], locale: 'en', isAdmin: true, admin: true },
  );
  assert.deepEqual(
    applyTrustedAdminRole({ roles: ['helper', 'admin'], admin: true, isAdmin: true, locale: 'en' }, false),
    { roles: ['helper'], locale: 'en' },
  );
});
