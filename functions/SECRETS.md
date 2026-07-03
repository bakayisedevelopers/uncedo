# Parakleo Firebase Functions Secrets

Use grouped JSON secrets for Firebase Functions to reduce active Secret Manager version count while keeping related credentials together.

## UNCEDO_PAYMENTS_SECRETS

```json
{
  "PAYSTACK_SECRET_KEY": "REPLACE_ME"
}
```

## UNCEDO_EMAIL_SECRETS

```json
{
  "RESEND_API_KEY": "REPLACE_ME",
  "EMAIL_FROM": "REPLACE_ME"
}
```

## UNCEDO_REALTIME_SECRETS

```json
{
  "CLOUDFLARE_TURN_KEY_ID": "REPLACE_ME",
  "CLOUDFLARE_TURN_API_TOKEN": "REPLACE_ME",
  "CLOUDFLARE_TURN_TTL_SECONDS": "600"
}
```

