# Saved card authorization migration

Saved Paystack authorization codes are stored under server-only
`paymentAuthorizations/{uid}/methods/{methodId}` documents. Customer profiles
retain only masked card descriptors. Firestore rules deny client access to the
authorization collection.

Older profiles may still contain authorization codes in `users/{uid}.paymentMethods`.
The payment backend migrates a profile when it is processed, and this script
provides a paginated one-time migration for remaining profiles. Run it only
after reviewing the dry-run counts and confirming the target project.

Dry run (no writes):

```sh
FIREBASE_PROJECT_ID=bakayise-uncedo-latest node functions/scripts/migrate-legacy-payment-methods.js
```

Execute the migration after explicit operational approval:

```sh
FIREBASE_PROJECT_ID=bakayise-uncedo-latest \
CONFIRM_LEGACY_CARD_MIGRATION=YES \
node functions/scripts/migrate-legacy-payment-methods.js
```

The script uses Application Default Credentials and never logs authorization
codes, signatures, card numbers, or customer data. It must not be run against a
production project without first recording the dry-run count and reviewing the
deployment/rollback plan. No production migration was run as part of this
implementation.
