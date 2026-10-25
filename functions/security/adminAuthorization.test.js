'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedAdminToken } = require('./adminAuthorization');

test('admin authorization accepts a trusted custom claim or allowlisted verified email', () => {
  assert.equal(isTrustedAdminToken({ admin: true }), true);
  assert.equal(isTrustedAdminToken({ email: 'JABUOBED1@gmail.com', email_verified: true }), true);
  assert.equal(isTrustedAdminToken({ email: 'jabuobed1@gmail.com', email_verified: false }), false);
});

test('editable profile role fields never grant backend admin authorization', () => {
  assert.equal(isTrustedAdminToken({ role: 'admin', isAdmin: false, email: 'ordinary@example.com' }), false);
  assert.equal(isTrustedAdminToken({ roles: ['admin'], email: 'ordinary@example.com' }), false);
  assert.equal(isTrustedAdminToken({ isAdmin: true, email: 'ordinary@example.com' }), true);
});
