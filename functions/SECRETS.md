# Functions environment configuration

Functions now read backend configuration from `process.env`. Put local/development values in `functions/.env`; the file is ignored by Git. `functions/.env.example` contains the variable names and safe placeholders. Existing payment and email values populated from Secret Manager are local-only in `functions/.env`.

Firebase CLI loads `functions/.env` for local emulators and uploads configured values as server-side Functions environment configuration during deployment. These values are not bundled into the customer/helper apps or website, but they are less protected than Firebase Secret Manager. Move sensitive production credentials back to Secret Manager before production rollout, as planned.

## Variables

| Variable | Used by |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | Existing mobile billing and helper payouts, plus request-linked hosted checkout and explicitly authorised saved-card payments. |
| `REQUEST_PAYMENTS_ENABLED` | Feature flag for post-completion cash confirmation, hosted checkout and saved-card request payments; defaults to `false`. |
| `EXPLICIT_PAYMENT_SELECTION_ENABLED` | New requests confirmed while enabled are completed without an automatic saved-card charge; the customer chooses a payment method afterward. Existing requests and in-flight legacy financial operations retain their established behavior. Defaults to `false`. |
| `HELPER_WALLET_ENABLED` | New requests confirmed while enabled use the server-only helper wallet. Cash commissions are assessed at helper confirmation, and new eligible non-cash earnings enter the wallet weekly payout path. Defaults to `false`; existing unpaid weekly payout records are never imported. |
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
| `WHATSAPP_ONBOARDING_ENABLED` | Enables deterministic WhatsApp guest/account onboarding and helper agreement-link creation. Keep `false` until the onboarding routes and linked-account flow are deployed and reviewed. |
| `WHATSAPP_CUSTOMER_SIGNUP_URL` | HTTPS customer email-signup route used for short-lived WhatsApp account-link challenges. |
| `WHATSAPP_HELPER_SIGNUP_URL` | HTTPS Helpers email-signup route used for short-lived WhatsApp account-link challenges. |
| `WHATSAPP_HELPER_AGREEMENT_URL` | HTTPS Helpers route for reviewing and signing the current agreement through a WhatsApp-bound challenge. |
| `WHATSAPP_AI_ENABLED` | Feature flag for the WhatsApp AI turn processor. It defaults to `false`. |
| `WHATSAPP_MEDIA_ENABLED` | Feature flag for private WhatsApp media download/storage. It is effective only while messaging is enabled and defaults to `false`. |
| `WHATSAPP_IMAGE_INTERPRETATION_ENABLED` | Optional image input to the configured structured AI router; requires AI, messaging, media and retention controls, and defaults to `false`. |
| `WHATSAPP_MEDIA_RETENTION_ENFORCED` | Must be `true` only after a Cloud Storage lifecycle rule enforces media deletion; without it the backend refuses to download or store media. |
| `WHATSAPP_TRANSCRIPTION_ENABLED` | Feature flag for voice transcription; requires messaging and media flags to be enabled and defaults to `false`. |
| `WHATSAPP_CANCELLATION_ENABLED` | Feature flag for customer cancellation through WhatsApp; requires messaging to be enabled and defaults to `false`. It uses the existing cancellation billing operation. |
| `WHATSAPP_TRANSCRIPTION_MODEL` | Explicitly reviewed OpenAI audio transcription model identifier; no implicit model default is used. |
| `OPENAI_API_KEY` | Server-only OpenAI API credential for primary structured intent and answer extraction. |
| `OPENAI_MODEL` | Primary model identifier; defaults to `gpt-6-luna`. |
| `GEMINI_MODEL` | Vertex AI/Agent Platform fallback model identifier; defaults to `gemini-3.5-flash-lite`. It is called only when the primary OpenAI call fails. |
| `GEMINI_LOCATION` | Vertex AI/Agent Platform model location; defaults to `global`. |

The Gemini fallback uses the Cloud Functions runtime identity (Application Default Credentials) and the Firebase project's Google Cloud billing. It does not read `GEMINI_API_KEY` and does not use Secret Manager. The runtime project is resolved from `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, or the initialized Firebase Admin app. The project must have the Agent Platform API enabled, billing active, and the runtime identity authorized to invoke models. |

The WhatsApp values are placeholders only until Meta credentials and templates are available. Keep WhatsApp automation disabled operationally until the webhook is configured and tested. Request payment options also remain unavailable unless `REQUEST_PAYMENTS_ENABLED=true` is deliberately configured after staging validation.

Helper wallets are stored under `helperWallets/{helperId}` with integer minor-unit balances, immutable transaction subcollections, and request-scoped commission obligations. Client Security Rules deny direct reads and writes; helper read access is through authenticated Functions only. Weekly wallet payouts use a versioned payout record and preserve legacy payout processing separately.

See [`WHATSAPP_MEDIA_RETENTION.md`](./WHATSAPP_MEDIA_RETENTION.md) for the required Cloud Storage bucket lifecycle policy before enabling media storage.

Do not paste these values into Expo, web, or admin environment files. Do not commit `functions/.env`, copy credentials into source code, or include them in logs. Do not deploy while required values are blank or still contain `PASTE_*` placeholders.

## Provider-offer expiry permissions

The `scheduleServiceRequestOfferExpiryOnServiceRequestWrite` Firestore trigger enqueues a Cloud Task for each new provider offer. The deployed Cloud Functions runtime service account needs `cloudtasks.tasks.create` for the `expireServiceRequestOffer` queue. The task handler is authenticated by Firebase's task-queue integration. This permission must be configured and verified before rollout; no production permission or deployment is changed by this repository update.
