# Parakleo Firebase Functions Secrets

Use grouped JSON secrets for Firebase Functions to reduce active Secret Manager version count while keeping related credentials together.

## PARAKLEO_PAYMENTS_SECRETS

```json
{
  "PAYSTACK_SECRET_KEY": "REPLACE_ME"
}
```

## PARAKLEO_EMAIL_SECRETS

```json
{
  "RESEND_API_KEY": "REPLACE_ME",
  "EMAIL_FROM": "REPLACE_ME"
}
```

## PARAKLEO_REALTIME_SECRETS

```json
{
  "CLOUDFLARE_TURN_KEY_ID": "REPLACE_ME",
  "CLOUDFLARE_TURN_API_TOKEN": "REPLACE_ME",
  "CLOUDFLARE_TURN_TTL_SECONDS": "600"
}
```

## PARAKLEO_AI_KEYS

```json
{
  "FIREBASE_API_KEY": "...",
  "FIREBASE_AUTH_DOMAIN": "...",
  "FIREBASE_PROJECT_ID": "...",
  "FIREBASE_STORAGE_BUCKET": "...",
  "FIREBASE_MESSAGING_SENDER_ID": "...",
  "FIREBASE_APP_ID": "...",
  "GEMINI_MODEL": "...",
  "GEMINI_VISION_MODEL": "...",
  "GEMINI_VISION_FALLBACK_MODEL": "gemini-2.5-pro",
  "GEMINI_CLASSIFICATION_MODEL": "...",
  "GEMINI_CLASSIFICATION_TIMEOUT_MS": "...",
  "MAX_PDF_PAGES": "...",
  "PADDLE_OCR_SERVICE_URL": "...",
  "PADDLE_OCR_SERVICE_API_KEY": "...",
  "PADDLE_OCR_TIMEOUT_MS": "...",
  "PADDLE_OCR_MIN_CONFIDENCE": "...",
  "PADDLE_OCR_VL_PIPELINE_VERSION": "...",
  "PADDLE_OCR_VL_DEVICE": "...",
  "PADDLE_OCR_VL_USE_LAYOUT_DETECTION": "...",
  "PADDLE_OCR_VL_USE_DOC_ORIENTATION_CLASSIFY": "...",
  "PADDLE_OCR_VL_USE_DOC_UNWARPING": "...",
  "OCR_PROVIDER_MODE": "..."
}
```

This grouped secret is used by the Gemini-based student attachment extraction path and the tutor results extraction path.

During migration, the functions code still supports the old individual secrets as fallback values. Remove those fallback bindings only after the grouped secrets are deployed and verified in production.
