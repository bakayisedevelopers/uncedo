# Phase 0 Rewards, Referrals, Ratings, Membership Rollout

Phase 0 adds protected Firestore collections, trusted Cloud Functions for reward-sensitive operations, read-only mobile reward clients, deterministic normalized ratings, and emulator-backed validation for Uncedo Points. Existing users are initialized lazily by backend reward events or by the referral-code endpoint. Do not run broad historical backfills during deployment.

## Repository source of truth

- Firestore Rules deploy from the repository root `firestore.rules` referenced by `firebase.json`.
- Firestore indexes deploy from the repository root `firestore.indexes.json`.
- The rewards shared constants source of truth is `shared/rewards/index.js`, consumed by Functions plus the customer, helper, and admin apps through local shared wrappers and bundler configuration.
- `validate:rewards:shared` must pass before shipping any rewards-related change.

## Emulator validation commands

Run these before deploying:

```powershell
npm run validate:rewards:shared
npm run test:rules
npm run test:rewards:integration
npm run test:phase0
npm test --prefix functions
git diff --check
```

These commands are wired to the Firebase Emulator only and must not connect to production.

## Required config seeding

1. Deploy Functions first in a staging or preview environment if available.
2. Run `seedRewardConfig` as an admin after Functions are live so `rewardConfig/*` exists before the mobile apps try to read public reward settings.
3. Confirm `rewardConfig/global`, `rewardConfig/referrals`, `rewardConfig/customerMembership`, `rewardConfig/helperMembership`, and `rewardConfig/helperMastery` exist.

## Deployment order

Use this order to avoid blocking older app builds unexpectedly:

1. Deploy Firestore indexes from `firestore.indexes.json`.
2. Deploy Cloud Functions, including `seedRewardConfig`, `ensureReferralCode`, `captureReferral`, `evaluateCustomerReferralStageOne`, `updatePaymentMethod`, `submitServiceRequestRating`, `expireRewardPoints`, `verifyPaystack`, `finalizeServiceRequestBilling`, and `billCustomerServiceCancellation`.
3. Seed `rewardConfig/*` with `seedRewardConfig`.
4. Deploy Firestore Rules from `firestore.rules` only after the new Functions are live.
5. Smoke-test the emulator-backed and staging booking, cancellation, payment-method, referral, and rating flows.
6. Release the customer app.
7. Release the helper app.

This keeps the trusted endpoints available before the stricter Rules are enforced. The mobile releases should ship after the backend because customer payment-method updates, trusted referral evaluation, helper verification handling, helper completion flow, and rating submission now rely on backend-managed writes.

## Firestore Rules prerequisites

- `serviceRequests/{requestId}` Rules now exist in the repository and are the intended deployment source.
- Do not deploy Rules until `billCustomerServiceCancellation`, `submitServiceRequestRating`, and the updated payment-method endpoint are live.
- Verify admin role documents remain correct before Rules deployment because admin-client access stays role-gated.

## Index prerequisites

- Deploy `firestore.indexes.json` before enabling scheduled expiry or heavy transaction-history queries.
- Confirm the collection-group transaction index required by `expireRewardPoints` is built before scheduling or invoking expiry in production.

## Migration policy

Use `scripts/migrate-rewards-phase0.js` only in dry-run mode first. The script is bounded, resumable with a cursor, and creates deterministic normalized rating IDs. It does not award historical spendable points unless a future explicit business decision enables that separately.

Dry-run only example:

```powershell
node scripts/migrate-rewards-phase0.js --dry-run --limit=100
```

Do not run the historical migration with `--write` automatically during rollout.

## Monitoring checklist

- Cloud Function error rate for `verifyPaystack`, `updatePaymentMethod`, `billCustomerServiceCancellation`, `finalizeServiceRequestBilling`, `submitServiceRequestRating`, and `expireRewardPoints`
- Firestore permission-denied spikes on `users`, `serviceRequests`, `rewardAccounts`, `ratings`, and `referrals`
- Reward transaction duplicate-rate anomalies for idempotency keys
- Rating aggregate consistency for `ratingAccounts/{userId}` and `ratingAccounts/{userId}/services/{serviceId}`
- Referral milestone creation and single-award behavior
- Membership and mastery recalculation logs after paid bookings/jobs

## Rollback steps

1. Stop new mobile rollout if permission-denied, rating, referral, or billing regressions appear.
2. Roll back Functions first if the regression is endpoint behavior rather than Rule enforcement.
3. Roll back Firestore Rules only if required to restore a critical customer or helper flow, and only with a known-good prior Rules file.
4. Do not run historical reward migrations during incident response.
5. If needed, disable or pause the expiry scheduler before investigating transaction-ledger issues.

## Deferred work

The customer rewards dashboard, helper rewards dashboard, public referral landing page, service-credit redemption, annual helper rewards, and admin rewards dashboard are intentionally not included in Phase 0.

## Phase 3 controlled-pilot rollout

Phase 3 adds a ledger-backed service-credit reservation endpoint, billing-time application/release, an audited rewards-operations route, and server-only operational collections. Keep `rewardConfig/global.featureFlags.redemptionEnabled`, `campaignsEnabled`, and `helperBenefitsEnabled` disabled until the preceding release has been observed in staging.

1. Deploy the Functions and Rules together to a staging project; confirm `reserveServiceCredit`, `releaseServiceCredit`, `adminAdjustReward`, `adminUpdateRewardConfig`, and `adminRewardOperations` authenticate correctly.
2. Build the transaction collection-group index and populate only bounded `rewardOperationalSummaries/current` documents. Do not make a browser scan of reward accounts or requests.
3. Release the admin route first in read-only mode. Verify config version records and audit records for a non-financial configuration change.
4. Enable redemption for internal accounts only. Create a booking, reserve exactly the configured increment, complete payment, then verify one debit and an `applied` redemption. Repeat a failed-payment path and verify one compensating credit and a `released` redemption.
5. Expand the customer pilot only after payout reconciliation confirms the helper payout did not change when platform-funded credit was applied. Disable `redemptionEnabled` to stop new reservations immediately; existing reservations must be released through the trusted endpoint or controlled recovery job.
6. Keep campaigns and helper benefits disabled until their qualification/fulfilment workers and operational reviews are separately enabled. Never enable a campaign without an end date and finite point budget.

Rollback: disable the relevant feature flag first, then roll back Functions only if endpoint behavior regresses. Do not alter account totals or redemption status manually; use an audited ledger adjustment/release path. Retain all redemption and audit documents for incident review.
