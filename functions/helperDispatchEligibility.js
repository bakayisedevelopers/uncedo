'use strict';

function getHelperPayoutVerificationStatus(helper = {}) {
  return String(helper?.payout?.verificationStatus || helper?.payoutVerificationStatus || '').trim().toLowerCase();
}

function hasVerifiedHelperPayout(helper = {}) {
  return getHelperPayoutVerificationStatus(helper) === 'verified';
}

module.exports = { getHelperPayoutVerificationStatus, hasVerifiedHelperPayout };
