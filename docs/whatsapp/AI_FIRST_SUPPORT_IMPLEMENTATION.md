# WhatsApp AI First Support Implementation

## Scope and rollout state

This branch extends the existing Meta webhook, Firestore event pipeline, booking state machine, payment operations, helper wallet, identity linking, and support-ticket implementation. It does not create a second booking, pricing, payment, matching, or wallet engine.

The implementation is local to `codex/ai-first-whatsapp-support`. No production deployment, feature-flag change, Meta request, Paystack transaction, or paid AI request was performed. WhatsApp customer-facing features remain disabled unless their server-side flags are explicitly enabled. The Node.js 22 dependency/runtime changes were preserved as the branch baseline; they remain separately identifiable in commit `71bbe0fd`.

## Security foundation

- Firestore and Storage admin checks use Firebase custom claims or the existing allowlisted email only when Firebase marks it verified. They no longer derive administrator authority from `/users/{uid}` profile fields.
- Self-created profiles accept only ordinary customer/helper roles and pending verification states. Self-updates cannot alter role, helper verification, payout verification, staff, admin, suspension, dispatch, wallet, payment-method, or other protected fields.
- `setTrustedAdminRole` is callable only by an already trusted administrator. It modifies Firebase custom claims and records an audit entry; a client profile write cannot invoke that authority.
- Reward adjustment authorization now requires the server-derived `adminAuthorized` marker from a verified token path.
- WhatsApp account tools resolve the sender identity, confirm its verified link record, and re-read the corresponding Firebase profile. Helper financial reads additionally require the helper profile to be verified. Tool arguments never contain a trusted UID or Firestore path.
- WhatsApp private collections and `whatsapp-private/` media remain server-only. Existing broader `/users` list access remains for compatibility with the current helper discovery client and needs a separate projection/migration before it can be narrowed safely.

## AI and approved tools

The existing OpenAI primary / optional Gemini fallback router remains in place. The router receives bounded context and only receives tools permitted for the resolved role. Model input, message history, extracted document text, image text, summaries, and support article content are treated as untrusted data.

`functions/whatsapp/toolRegistry.js` currently exposes exactly two model-callable tools, and only to verified, linked customer and helper accounts: `getMyProfile` reads the sender’s own saved name, email, contact number, WhatsApp number, role, and helper verification status; `proposeProfileChange` can propose a first-name or surname change. The latter creates a short-lived proposal and still requires an explicit interactive confirmation. Phone, email, role, and verification changes are not available through this tool.

Greetings and ordinary conversation are generated directly as WhatsApp replies and do not call a backend tool. The model sees the active service catalogue as bounded context; the backend continues to load the selected service questionnaire and validate booking answers and quotes. Onboarding and the webhook/event pipeline remain separate from the callable tool list. Request history, cancellation preview, payment, wallet, payout, offer, support-knowledge, support-handoff, and helper-relay tools have been removed from the model’s available commands for this phase. Existing deterministic WhatsApp commands and confirmation handlers remain in place; the model cannot invoke those removed operations through its tool loop.

The registry rejects extra input keys and undeclared output fields, including accidental gateway authorization fields. Tool execution is allow-listed, independently authorized, limited to 4 executions per identity per minute and 40 per day, and bounded by a 12-second timeout. The iterative model/tool loop allows up to 3 tool executions in one inbound turn, returning each result to the model before it decides whether to call another tool or answer. Execution audit records store a hash of arguments rather than raw content. The model never writes Firestore directly or approves a financial or role-changing operation.

## Conversation history and memory

- Incoming Meta events retain deterministic IDs and are transactionally deduplicated before creating the inbound `whatsappMessages` record and assistant job.
- Inbound messages update a bounded conversation memory (up to 20 recent turns and 6 compact older snippets). Structured mode, intent, active request/draft, and support-ticket references are stored separately. Summaries are context only; live request/payment/identity values are fetched from authoritative backend records.
- Outgoing assistant replies are claimed and persisted before Meta send. Their message status, Meta message ID, and delivery callbacks are reconciled afterward. Helper relay, media relay, provider offers, lifecycle notifications, and administrator replies use deterministic outbound records. OTP values are not copied into history; authentication delivery state is stored on the short-lived challenge record.
- `getWhatsAppConversationHistory` returns bounded chronological pages for the verified linked owner, or for an administrator with trusted authorization. It strips WhatsApp phone IDs, gateway fields, raw Storage paths, and undeclared data.
- Admin support tickets retain their own participant-aware message subcollection for the inbox.

## Human support and admin interface

The existing Support Tickets page remains the inbox entry point. It now exposes unread count, participant and safe booking context, AI escalation summary, assignment to the current administrator, chronological WhatsApp history, secure attachment URLs, reply delivery status, and explicit `Return to AI` resolution. Closing/resolving a ticket clears the handoff state; ordinary inbound messages remain stored while AI is paused.

The new Support Knowledge page manages administrator-approved published/draft articles using backend callables. No policy or FAQ content is pre-seeded or invented. Public support answers use only current published articles and the active service catalogue. The current admin UI uses the live Firestore ticket listener for new inbox state; no separate push-notification service was introduced.

## Retention

Defaults are configurable and bounded: conversation messages 180 days, webhook events/jobs/status/tool records 30 days, media 30 days, closed support records 365 days after closure, and authentication challenge records 1 day. The scheduled cleanup processes bounded batches and preserves messages/media attached to open support tickets. It clears idle compact memory only where no active draft, request, or handoff exists.

Media download/storage/relay requires the media feature flags, cleanup enablement, and `WHATSAPP_STORAGE_RETENTION_POLICY_VERIFIED=true`. The code includes scheduled object cleanup for `whatsapp-private/`; the deployed bucket lifecycle policy and operational retention configuration were not inspected or changed here. Keep media features disabled until an operator verifies the bucket lifecycle configuration and privacy/retention schedule. POPIA retention, access, deletion, and data-subject procedures still require operational/legal review; code changes alone do not establish compliance.

## Relevant data

Existing collections reused: `whatsappWebhookEvents`, `whatsappIdentities`, `whatsappUserLinks`, `whatsappConversations`, `whatsappMessages`, `whatsappAssistantJobs`, `whatsappMessageStatuses`, `supportTickets`, `whatsappMediaAssets`, `serviceRequests`, `serviceRequestDrafts`, `helperWallets`, and `helperWeeklyPayouts`.

Additional server-only records: `whatsappToolExecutions`, `whatsappToolRateLimits`, `whatsappProfileChangeRequests`, `adminAuditLogs`, and `auditEvents`. `supportArticles` contains admin-authored knowledge. Message, identity, tool, authentication, and private media collections are not exposed to ordinary client reads.

The index added is `whatsappMessages(identityId ASC, createdAt DESC)` for history pagination.

## Deployment controls and manifest

See [`deployment-manifest.json`](./deployment-manifest.json). Deployment is intentionally marked `not-authorized`; this task requires review/approval before deploying Functions, Firestore/Storage rules, indexes, or Admin Hosting. Do not use a broad `--only functions` deployment. Preserve the deployed-only `scheduleServiceRequestOfferExpiryOnWrite` function and the concurrent Node.js 22 rollout; this branch does not delete, rename, or recreate it.

## Validation performed

- Functions unit suite: 152 tests passed after the final tool authorization and schema checks.
- Admin Vite build passed. Vite reported the existing bundle-size advisory.
- Firebase Firestore and Storage emulator suite: 57 tests passed under demo project `demo-uncedo-ai-first`. The first run exposed a fixture that simulated a signed `isAdmin` custom claim while expecting a denial; it was corrected to test an editable forged profile, and the full emulator suite then passed.
- No live Firebase project was accessed for tests, and no production write was made.
