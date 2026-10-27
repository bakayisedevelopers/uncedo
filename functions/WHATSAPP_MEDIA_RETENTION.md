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

Police-clearance files are handled by a separate WhatsApp onboarding path. The backend accepts only PDF, JPEG, or PNG files while the verified linked helper is explicitly at the clearance-upload step. It validates the Meta file metadata, size, MIME type, signature, and hash, then stores the file under `helper-police-clearance-private/`. The file bytes are in private Cloud Storage; review status and audit metadata are in Firestore. The contents and source media metadata are not sent to AI.

Clearance files and their submission records are retained. New objects are created with the Cloud Storage `temporaryHold` flag, so lifecycle rules and ordinary delete calls cannot remove them while the hold remains. There is no scheduled or error-path deletion for these files. Direct client Storage and Firestore access remains denied; an authenticated helper can request a short-lived viewing link for their own submission, and trusted administrators can review any submission through audited backend callables. Do not release a clearance object's hold or apply a lifecycle exception that removes it. The general WhatsApp media lifecycle policy must not include `helper-police-clearance-private/`.

`WHATSAPP_HELPER_CLEARANCE_REVIEW_VALIDITY_DAYS=90` is the maximum time an unreviewed submission remains eligible for initial approval. A daily backend task marks a still-pending submission expired after that deadline, but leaves the file and audit record in place. An approved clearance remains approved after 90 days; this deadline does not force an already-approved helper to upload another document. An administrator may separately suspend a helper through the existing controls. Review expiry only takes effect for helper dispatch when clearance is required and the current submission was never approved.

Uploads require `WHATSAPP_HELPER_POLICE_CLEARANCE_ENABLED=true`, `WHATSAPP_MESSAGING_ENABLED=true`, `WHATSAPP_ONBOARDING_ENABLED=true`, and a valid review interval. General WhatsApp media cleanup flags are independent and do not govern police-clearance files. Confirm the first staged upload has `temporaryHold=true` in Cloud Storage metadata before accepting real helper documents.
