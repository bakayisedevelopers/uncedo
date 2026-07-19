#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const shared = require('../shared/rewards');
const snapshotPath = path.join(__dirname, '..', 'shared', 'rewards', 'generated', 'constants.json');
const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const actual = {
  SCHEMA_VERSION: shared.SCHEMA_VERSION,
  ACCOUNT_TYPES: shared.ACCOUNT_TYPES,
  MEMBERSHIP_LEVELS: shared.MEMBERSHIP_LEVELS,
  MASTERY_LEVELS: shared.MASTERY_LEVELS,
  RATING_DIRECTIONS: shared.RATING_DIRECTIONS,
  RATING_ROLES: shared.RATING_ROLES,
  REWARD_TRANSACTION_DIRECTIONS: shared.REWARD_TRANSACTION_DIRECTIONS,
  REWARD_TRANSACTION_STATUSES: shared.REWARD_TRANSACTION_STATUSES,
  REWARD_REASON_CODES: shared.REWARD_REASON_CODES,
  REFERRAL_STATUSES: shared.REFERRAL_STATUSES,
  SUPPORTED_EVENT_TYPES: shared.SUPPORTED_EVENT_TYPES,
  REWARD_CONFIG_DOCS: shared.REWARD_CONFIG_DOCS,
};
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error('Reward constants diverged from generated snapshot. Regenerate shared/rewards/generated/constants.json intentionally.');
  process.exit(1);
}
for (const consumer of ['functions', 'uncedo', 'helpers', 'admin']) {
  const pkg = path.join(__dirname, '..', consumer, 'package.json');
  if (fs.existsSync(pkg)) console.log(`reward constants validation: ${consumer} can consume generated constants snapshot`);
}
