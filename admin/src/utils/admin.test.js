import test from 'node:test';
import assert from 'node:assert/strict';
import { isUserAdmin } from './admin.js';

test('admin access requires a server-issued admin claim', () => {
  assert.equal(isUserAdmin({ uid: 'admin' }, { role: 'admin' }), true);
  assert.equal(isUserAdmin({ uid: 'admin' }, { roles: ['helper', 'admin'] }), true);
  assert.equal(isUserAdmin({ uid: 'admin' }, { admin: true }), true);
  assert.equal(isUserAdmin({ uid: 'admin' }, { isAdmin: true }), true);
});

test('email and editable user profile fields do not grant admin access', () => {
  assert.equal(isUserAdmin({ uid: 'email-only', email: 'bakayise.developers@gmail.com', emailVerified: true }, {}), false);
  assert.equal(isUserAdmin({ uid: 'old-email', email: 'jabuobed1@gmail.com', emailVerified: true }, {}), false);
  assert.equal(isUserAdmin({ uid: 'forged', role: 'admin', isAdmin: true }, {}), false);
  assert.equal(isUserAdmin(null, { role: 'admin' }), false);
});
