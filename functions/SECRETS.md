# Functions environment configuration

Functions now read backend configuration from `process.env`. Put local/development values in `functions/.env`; the file is ignored by Git. `functions/.env.example` contains the variable names and safe placeholders. Existing payment and email values populated from Secret Manager are local-only in `functions/.env`.

Firebase CLI loads `functions/.env` for local emulators and uploads configured values as server-side Functions environment configuration during deployment. These values are not bundled into the customer/helper apps or website, but they are less protected than Firebase Secret Manager. Move sensitive production credentials back to Secret Manager before production rollout, as planned.

## Variables

| Variable | Used by |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | Existing mobile billing and helper payouts, plus request-linked hosted checkout and explicitly authorised saved-card payments. |
| `REQUEST_PAYMENTS_ENABLED` | Feature flag for post-completion cash confirmation, hosted checkout and saved-card request payments; defaults to `false`. |
| `CUSTOMER_PAYMENT_URL` | Public customer website payment route used for secure request-bound checkout and WhatsApp links. |
| `RESEND_API_KEY` | Existing queued email sender. |
| `EMAIL_FROM` | Existing queued email sender. |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp outbound Cloud API calls. |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Cloud API sender and webhook metadata. |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook GET verification challenge. |
| `META_APP_SECRET` | `X-Hub-Signature-256` validation for webhook POST requests. |
| `GRAPH_API_VERSION` | Explicit Meta Graph API version. |
| `APPROVED_TEMPLATE_NAMES` | Comma-separated allowlist of Meta-approved WhatsApp template names. |
| `WHATSAPP_AUTH_ENABLED` | Feature flag for WhatsApp OTP login; defaults to `false`. |
| `WHATSAPP_AUTH_TEMPLATE_NAME` | Approved Meta authentication template name; it must also be in `APPROVED_TEMPLATE_NAMES` and accept one body text code parameter. |
| `WHATSAPP_AUTH_TEMPLATE_LANGUAGE` | Locale code configured for the approved authentication template. |
| `WHATSAPP_AI_ENABLED` | Feature flag for the WhatsApp AI turn processor. It defaults to `false`. |
| `WHATSAPP_MEDIA_ENABLED` | Feature flag for private WhatsApp media download/storage. It is effective only while messaging is enabled and defaults to `false`. |
| `WHATSAPP_IMAGE_INTERPRETATION_ENABLED` | Optional image input to the configured structured AI router; requires AI, messaging, media and retention controls, and defaults to `false`. |
| `WHATSAPP_MEDIA_RETENTION_ENFORCED` | Must be `true` only after a Cloud Storage lifecycle rule enforces media deletion; without it the backend refuses to download or store media. |
| `WHATSAPP_TRANSCRIPTION_ENABLED` | Feature flag for voice transcription; requires messaging and media flags to be enabled and defaults to `false`. |
| `WHATSAPP_CANCELLATION_ENABLED` | Feature flag for customer cancellation through WhatsApp; requires messaging to be enabled and defaults to `false`. It uses the existing cancellation billing operation. |
| `WHATSAPP_TRANSCRIPTION_MODEL` | Explicitly reviewed OpenAI audio transcription model identifier; no implicit model default is used. |
| `OPENAI_API_KEY` | Server-only OpenAI API credential for primary structured intent and answer extraction. |
| `OPENAI_MODEL` | Primary model identifier; defaults to `gpt-6-luna`. |
| `GEMINI_API_KEY` | Server-only Gemini credential used only when the primary OpenAI call fails. Both provider keys are required for the configured fallback chain. |
| `GEMINI_MODEL` | Fallback model identifier; defaults to `gemini-3.5-flash-lite`. |

The WhatsApp values are placeholders only until Meta credentials and templates are available. Keep WhatsApp automation disabled operationally until the webhook is configured and tested. Request payment options also remain unavailable unless `REQUEST_PAYMENTS_ENABLED=true` is deliberately configured after staging validation.

See [`WHATSAPP_MEDIA_RETENTION.md`](./WHATSAPP_MEDIA_RETENTION.md) for the required Cloud Storage bucket lifecycle policy before enabling media storage.

Do not paste these values into Expo, web, or admin environment files. Do not commit `functions/.env`, copy credentials into source code, or include them in logs. Do not deploy while required values are blank or still contain `PASTE_*` placeholders.

## Provider-offer expiry permissions

The `scheduleServiceRequestOfferExpiryOnServiceRequestWrite` Firestore trigger enqueues a Cloud Task for each new provider offer. The deployed Cloud Functions runtime service account needs `cloudtasks.tasks.create` for the `expireServiceRequestOffer` queue. The task handler is authenticated by Firebase's task-queue integration. This permission must be configured and verified before rollout; no production permission or deployment is changed by this repository update.
