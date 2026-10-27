# Controlled WhatsApp real-user test plan

This is a preparation checklist only. No deployment or feature activation is authorized by this document.

## Safety boundary

- The owner has chosen to test without a tester-number allowlist. This checklist does not enable or add one. Do not change the existing messaging/AI feature flags as part of the onboarding work.
- Keep credentials in `functions/.env`; do not copy that file to a client app or commit it. The template script reads this same server-side environment file.
- Keep payment, saved-card, cancellation, media, transcription, image interpretation and any nonessential notification/relay flags disabled for the initial greeting and public-information test.
- Preserve the current feature-flag configuration during onboarding tests. Keep future optional features separately controlled and do not infer that a successful test enables production use.
- Never use the WhatsApp test cohort as a substitute for Firebase identity, request ownership, helper verification, payment confirmation or admin authorization.

## Before enabling a tester

1. Deploy and verify the approved source/rules/index changes using the reviewed manifest. Confirm the deployed Node runtime and regions first.
2. Confirm the Meta webhook callback URL, `messages` subscription, Phone Number ID and current template approval/configuration in Meta. A configured callback URL alone does not prove the WABA subscription.
3. Confirm all required template names are approved and component-compatible. The sender is allowlist-protected, enforces the 24-hour window, and does not substitute a free-form message when a template is missing.
4. Confirm the intended WhatsApp testing flags are present in `functions/.env`; do not change them as part of this checklist or place credentials in client configuration.
5. Keep unrelated features such as payments, media processing, transcription, and image interpretation under their existing separate controls.
6. Record tester consent and provide the applicable privacy notice before sending or processing messages.

## Minimal controlled test sequence

1. Send `Hi` from one allowlisted tester; verify one durable inbound message, one assistant job, and at most one response.
2. Repeat the same webhook fixture locally to verify deduplication. Do not replay real customer messages in production.
3. Ask for public services and verify the response uses the live active catalogue.
4. Ask an unallowlisted number to send `Hi`; verify it receives no Uncedo processing or outbound message and its message is not persisted.
5. Test a linked customer read-only booking/payment query using an authorized test account. Confirm cross-account requests are rejected.
6. Test a linked, verified helper's read-only offers, wallet and payout queries. Confirm another helper's records are inaccessible.
7. If an approved offer template is configured, test Accept and Decline and verify the canonical current-offer operation rejects stale, expired, duplicate or wrong-helper actions.
8. For a linked, eligible helper, send `online`, share a current WhatsApp location pin, and confirm availability changes only after the pin is received. Confirm the reply says this is a static point, not continuous tracking. Send a second pin while online and confirm the saved point refreshes; send `offline` and confirm the helper is no longer offered for dispatch. Pins older than 60 minutes must not qualify for matching. Test an assigned-job pin separately and confirm it updates only that job's tracking record and is relayed only to its assigned customer.
9. Test account onboarding for both roles: “I have an account” must open the role’s `/sign-in` page, while “Create account” opens `/sign-up`. Confirm that sign-in screens do not offer account creation during an existing-account link.
10. Upload a helper police-clearance document and confirm the WhatsApp acknowledgement says access is limited to relevant, authorised reviewers. In Admin → Helpers, refresh the directory, confirm the pending-clearance badge/count appears, open the helper record, and confirm the private file can be reviewed there.
11. Test a support request, administrator inbox visibility, reply, delivery status, and return-to-AI handoff.
12. Test an outside-window message only with the matching approved template configured. Confirm no free-form fallback is sent.
13. Keep payment tests in mocked or Paystack test mode, never a real charge. Real-user testing of a payment requires a separate payment-specific approval.
14. Review message/job failure diagnostics and delivery callbacks. If a future phase introduces a tester allowlist, remove it when that phase ends; otherwise restore the agreed testing configuration without changing unrelated feature flags.

The helper mobile app was not changed. Its existing location watcher starts when a signed-in helper observes `onlineStatus=online`; if that app is open for the same helper while WhatsApp turns availability on, its existing GPS updates can replace the manual WhatsApp pin. Isolate WhatsApp pin testing with the helper app closed if you want to validate only the manual-pin path.

## Scoped deployment targets

The current WhatsApp onboarding/location implementation has a scoped target list in `deployment-manifest.json`. Deploy only those listed Functions and Hosting sites after explicit authorization and a fresh Firebase inventory/runtime check. The deployed-only `scheduleServiceRequestOfferExpiryOnWrite` trigger is excluded and must remain untouched. Do not use these commands to deploy Firestore rules, indexes, or other Functions.

```sh
./node_modules/.bin/firebase deploy --only functions:whatsappWebhook,functions:processWhatsAppAssistantJobOnCreate,functions:syncServiceRequestLifecycle,functions:syncHelperDispatchIndexOnServiceOfferingWrite,functions:syncHelperDispatchIndex,functions:rebuildHelperDispatchIndex,functions:syncHelperQueueOnHelperOnline --project bakayise-uncedo-latest --non-interactive
./node_modules/.bin/firebase deploy --only hosting:bakayise-uncedo-latest,hosting:bakayise-uncedo-latest-admin,hosting:bakayise-uncedo-latest-helpers --project bakayise-uncedo-latest --non-interactive
```

The manifest records the deployment status and the feature flags changed by the active task.
