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

## Helper police-clearance documents

Police-clearance files are handled by a separate WhatsApp onboarding path. The backend accepts only PDF, JPEG, or PNG files while a verified linked helper is explicitly at the clearance-upload step. It validates the Meta file metadata, size, MIME type, signature, and hash, then stores the file under `helper-police-clearance-private/`. The document bytes, Meta media ID, caption, and source filename are not sent to AI or exposed to clients. Firestore stores the review status separately from the file. Only trusted admin callables can retrieve metadata, issue a five-minute signed viewing URL, and record an approval or replacement request.

Uploading remains off until all of the following are configured:

- `WHATSAPP_HELPER_POLICE_CLEARANCE_ENABLED=true`.
- `WHATSAPP_HELPER_CLEARANCE_RETENTION_DAYS` is set to the approved policy period (1–365 days).
- `WHATSAPP_MEDIA_RETENTION_ENFORCED=true` and `WHATSAPP_RETENTION_CLEANUP_ENABLED=true`.
- `WHATSAPP_STORAGE_RETENTION_POLICY_VERIFIED=true` only after the correct bucket's lifecycle policy has been reviewed and verified.

The scheduled cleanup deletes the private object and its submission metadata after the configured retention deadline. Configure a Cloud Storage lifecycle delete rule for the `helper-police-clearance-private/` prefix using the approved maximum retention period as a second safeguard, and confirm that the policy is present on the production bucket before enabling uploads. The retention period was not selected by this code change; set it after the business owner approves the policy. An admin approval does not change `users/{uid}.verificationStatus` or any helper-service approval.
