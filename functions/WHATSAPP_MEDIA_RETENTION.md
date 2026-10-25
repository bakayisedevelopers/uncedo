# WhatsApp media retention prerequisite

WhatsApp media storage is disabled unless both `WHATSAPP_MEDIA_ENABLED=true` and `WHATSAPP_MEDIA_RETENTION_ENFORCED=true` are set. The second flag is an operator assertion; the Function cannot prove that the Cloud Storage bucket has the lifecycle rule. Do not enable either flag until the rule has been applied to the correct Firebase Storage bucket and verified.

The current code records a 30-day `retentionExpiresAtMs` value in object metadata and Firestore. Cloud Storage lifecycle rules do not evaluate that custom metadata timestamp. The bucket must enforce deletion by object age and prefix. A minimal lifecycle configuration is:

```json
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": {
        "age": 30,
        "matchesPrefix": ["whatsapp-private/"]
      }
    }
  ]
}
```

Before activation, verify the target bucket name, review existing bucket lifecycle rules, and merge this rule with them rather than replacing unrelated rules. Cloud Storage lifecycle execution is asynchronous; deletion may occur after the 30-day threshold, not at an exact minute. Do not rely on lifecycle timing as the only legal retention/deletion control.

After applying it, inspect the bucket lifecycle configuration and run a controlled non-production expiry test. The Storage rules deny direct client access to `whatsapp-private/`; backend code uses the Admin SDK and only the support admin callable can issue a five-minute signed URL after checking ticket, identity and asset ownership.

Media downloads and relay additionally require WhatsApp messaging and media flags. Image interpretation requires AI consent, the AI flag, and `WHATSAPP_IMAGE_INTERPRETATION_ENABLED=true`; voice transcription requires its own flag and an explicitly configured model. All flags remain false by default. No bucket configuration is changed by this repository change.
