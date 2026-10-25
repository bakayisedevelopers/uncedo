'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { adminRewardAdjustment } = require('./phase3Service');

test('reward adjustments reject profile-supplied administrator fields', async () => {
  await assert.rejects(
    adminRewardAdjustment({
      db: {},
      admin: {},
      adminUser: { uid: 'ordinary-user', isAdmin: true, role: 'admin', email: 'jabuobed1@gmail.com' },
      userId: 'customer-1',
      accountType: 'customer',
      direction: 'credit',
      points: 10,
      reason: 'test',
    }),
    { message: 'Admin access required.' },
  );
});
