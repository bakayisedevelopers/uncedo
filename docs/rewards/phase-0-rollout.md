# Phase 0 Rewards, Referrals, Ratings, Membership Rollout

Phase 0 adds protected Firestore collections, Cloud Functions modules, client read services, and migration tooling for Uncedo Points. Existing users are initialized lazily by backend reward events or by the referral-code endpoint. Do not run broad historical backfills during deployment.

## Deployment order

1. Deploy Firestore Rules and indexes from `firestore.rules` and `firestore.indexes.json`.
2. Deploy Functions. New exports are `seedRewardConfig`, `ensureReferralCode`, `captureReferral`, `submitServiceRequestRating`, and `expireRewardPoints`.
3. Run `seedRewardConfig` as an admin to create public `rewardConfig/*` defaults.
4. Release the customer and helper apps after the Functions endpoint is live, because rating submission now calls the trusted backend.

## Migration policy

Use `scripts/migrate-rewards-phase0.js` only in dry-run mode first. The script is bounded, resumable with a cursor, and creates deterministic normalized rating IDs. It does not award historical spendable points unless a future explicit business decision enables that separately.

## Service-request rules mismatch

The repository `firestore.rules` still has no explicit `serviceRequests` match even though both mobile apps directly create and update `serviceRequests`. That means the deployed project likely uses rules not represented by this repo, or service-request writes are currently relying on a deployment mismatch. Phase 0 did not blindly rewrite those rules because doing so could break booking, dispatch, tracking, cancellation, and billing flows. Before deploying rules, compare the live rules with this file and add a dedicated `serviceRequests` rule that preserves current client-authorized lifecycle writes while making billing, payment status, ratings aggregates, reward eligibility, and financial fields backend-only.

## Deferred work

The full rewards dashboards, public referral landing page, service-credit redemption, annual helper rewards, and admin rewards dashboard are intentionally not included in Phase 0.
