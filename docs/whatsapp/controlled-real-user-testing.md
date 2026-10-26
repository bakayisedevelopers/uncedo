# Controlled WhatsApp real-user test plan

This is a preparation checklist only. No deployment or feature activation is authorized by this document.

## Safety boundary

- Keep `WHATSAPP_TEST_MODE_ENABLED=true` during any limited trial. The server defaults this gate to enabled if the variable is absent.
- Put only explicitly approved tester phone numbers in `functions/.env` as `WHATSAPP_TEST_PHONE_ALLOWLIST`, comma-separated. The values are normalized to digits. An empty or invalid allowlist blocks every recipient.
- Keep credentials in `functions/.env`; do not copy that file to a client app or commit it. The template script reads this same server-side environment file.
- Keep payment, saved-card, cancellation, media, transcription, image interpretation and any nonessential notification/relay flags disabled for the initial greeting and public-information test.
- Turn on only the minimum flags needed for the specific test, after a separate approval. The recipient allowlist remains enforced on inbound processing and every Meta send.
- Never use the WhatsApp test cohort as a substitute for Firebase identity, request ownership, helper verification, payment confirmation or admin authorization.

## Before enabling a tester

1. Deploy and verify the approved source/rules/index changes using the reviewed manifest. Confirm the deployed Node runtime and regions first.
2. Confirm the Meta webhook callback URL, `messages` subscription, Phone Number ID and current template approval/configuration in Meta. A configured callback URL alone does not prove the WABA subscription.
3. Confirm all required template names are approved and component-compatible. The sender is allowlist-protected, enforces the 24-hour window, and does not substitute a free-form message when a template is missing.
4. Set `WHATSAPP_TEST_MODE_ENABLED=true` and add only the tester phone numbers to `WHATSAPP_TEST_PHONE_ALLOWLIST` in `functions/.env`. Restart/deploy the relevant Functions to apply environment changes. Do not put this list in client configuration.
5. Verify `WHATSAPP_MESSAGING_ENABLED=true` is needed to accept POST events. Enable AI separately only when the configured AI provider is validated. Keep the other flags off until their individual tests are approved.
6. Record tester consent and provide the applicable privacy notice before sending or processing messages.

## Minimal controlled test sequence

1. Send `Hi` from one allowlisted tester; verify one durable inbound message, one assistant job, and at most one response.
2. Repeat the same webhook fixture locally to verify deduplication. Do not replay real customer messages in production.
3. Ask for public services and verify the response uses the live active catalogue.
4. Ask an unallowlisted number to send `Hi`; verify it receives no Uncedo processing or outbound message and its message is not persisted.
5. Test a linked customer read-only booking/payment query using an authorized test account. Confirm cross-account requests are rejected.
6. Test a linked, verified helper's read-only offers, wallet and payout queries. Confirm another helper's records are inaccessible.
7. If an approved offer template is configured, test Accept and Decline and verify the canonical current-offer operation rejects stale, expired, duplicate or wrong-helper actions.
8. Test a support request, administrator inbox visibility, reply, delivery status, and return-to-AI handoff.
9. Test an outside-window message only with the matching approved template configured. Confirm no free-form fallback is sent.
10. Keep payment tests in mocked or Paystack test mode, never a real charge. Real-user testing of a payment requires a separate payment-specific approval.
11. Review message/job failure diagnostics and delivery callbacks, then remove the tester allowlist and return all flags to disabled when the test ends.

## Scoped Functions command for later approval

The exact changed Functions are recorded in `deployment-manifest.json`. After deployment approval and a fresh inventory/runtime check, deploy only the listed targets:

```sh
firebase deploy --only functions:whatsappWebhook,functions:persistWhatsAppConversationEvent,functions:processWhatsAppAssistantJobOnCreate,functions:notifyWhatsAppHelperOfferOnServiceRequestWrite,functions:startWhatsAppAuthChallenge,functions:replyToWhatsAppSupportTicket,functions:notifyWhatsAppServiceRequestLifecycle,functions:reportCashServicePayment --project bakayise-uncedo-latest
```

Do not use this command until a separate deployment instruction is given. Deploy Firestore rules/indexes or Hosting separately only if the final reviewed diff requires them and those resources are separately authorized.
