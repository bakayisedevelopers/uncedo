const SCHEMA_VERSION = 1;
const ACCOUNT_TYPES = Object.freeze({ CUSTOMER: 'customer', HELPER: 'helper' });
const MEMBERSHIP_LEVELS = Object.freeze(['neighbour', 'partner', 'friend', 'family']);
const MASTERY_LEVELS = Object.freeze(['beginner', 'specialist', 'master', 'legend']);
const RATING_DIRECTIONS = Object.freeze({ CUSTOMER_TO_HELPER: 'customer_to_helper', HELPER_TO_CUSTOMER: 'helper_to_customer' });
const RATING_ROLES = Object.freeze({ CUSTOMER: 'customer', HELPER: 'helper' });
const REWARD_TRANSACTION_DIRECTIONS = Object.freeze({ CREDIT: 'credit', DEBIT: 'debit', REVERSAL: 'reversal', EXPIRY: 'expiry' });
const REWARD_TRANSACTION_STATUSES = Object.freeze({ APPLIED: 'applied', REVERSED: 'reversed', EXPIRED: 'expired', VOID: 'void' });
const REWARD_REASON_CODES = Object.freeze({
  PROFILE_COMPLETED: 'profile_completed', PAYMENT_METHOD_VERIFIED: 'payment_method_verified', CUSTOMER_COMPLETED_PAID_BOOKING: 'customer_completed_paid_booking',
  CUSTOMER_FIRST_COMPLETED_PAID_BOOKING: 'customer_first_completed_paid_booking', HELPER_COMPLETED_PAID_JOB: 'helper_completed_paid_job', RATING_SUBMITTED: 'rating_submitted',
  RATING_RECEIVED_EFFECT: 'rating_received_effect', REFERRAL_STAGE_ONE: 'referral_stage_one', REFERRAL_STAGE_TWO: 'referral_stage_two', POINTS_EXPIRED: 'points_expired', REVERSAL: 'reversal'
});
const REFERRAL_STATUSES = Object.freeze({ ACTIVE: 'active', ATTRIBUTED: 'attributed', QUALIFIED: 'qualified', REWARDED: 'rewarded', INVALID: 'invalid' });
const SUPPORTED_EVENT_TYPES = Object.freeze(['profile_completed','payment_method_verified','request_completed_paid','rating_submitted','referral_stage_one','referral_stage_two','points_expired','reward_reversed']);
const REWARD_CONFIG_DOCS = Object.freeze({ GLOBAL: 'global', CUSTOMER: 'customer', HELPER: 'helper', MEMBERSHIP: 'membership', MASTERY: 'mastery' });
function assertOneOf(value, allowed, label) { if (!allowed.includes(value)) throw new Error(`${label} must be one of: ${allowed.join(', ')}`); return value; }
function assertIntegerPoints(points) { if (!Number.isInteger(points)) throw new Error('points must be an integer'); return points; }
function normalizeReferralCode(code='') { return String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); }
module.exports = { SCHEMA_VERSION, ACCOUNT_TYPES, MEMBERSHIP_LEVELS, MASTERY_LEVELS, RATING_DIRECTIONS, RATING_ROLES, REWARD_TRANSACTION_DIRECTIONS, REWARD_TRANSACTION_STATUSES, REWARD_REASON_CODES, REFERRAL_STATUSES, SUPPORTED_EVENT_TYPES, REWARD_CONFIG_DOCS, assertOneOf, assertIntegerPoints, normalizeReferralCode };
