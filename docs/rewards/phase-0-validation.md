# Phase 0 Validation Matrix

## Firestore Rules source of truth

`firebase.json` points Firestore deployments at the root `firestore.rules` and `firestore.indexes.json`. `.firebaserc` uses the default Firebase project `bakayise-uncedo-latest`. No alternative or generated Firestore Rules file was found in the repository. Validation covers the repository Rules source deployed to the new project.

## serviceRequests operation matrix

| Operation | Actor | Status before | Status after | Client fields written | Backend-only fields | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Create service request | Customer | none | `collecting_details` | customer identity snapshot, location, request payload, category/service IDs, empty helper-offer placeholders, transcript, timestamps | payment settlement, helper assignment, payout, rewards, ratings | `uncedo/src/services/customerServiceRequestService.js#createCustomerServiceRequest` |
| Intake/quote update | Customer | `collecting_details` | `collecting_details` | category/service IDs, structured answers, selected references, reference attachments, pricing preview, request payload, service address/location, timestamps | helper assignment/queue/offer, payment, payout, rewards, ratings | `saveCustomerServiceQuotePreview` |
| Submit to matching/scheduling | Customer | `collecting_details` | `matching` or `scheduled_pending` | category/service IDs, structured answers, pricing preview, request payload, matching status/detail, scheduling text/ms, timestamps | helper selection, payment settlement, payout, rewards, ratings | `finalizeCustomerServiceRequest` |
| Customer pre-assignment cancellation | Customer | `collecting_details`, `scheduled_pending`, `matching`, `helper_found`, `no_helper_available` | `canceled` | cancellation reason/by/time, status/detail, clear offer placeholders, null payment transaction, zero cancellation fee | paid settlement, payout, reward eligibility | `cancelServiceRequestByCustomer` |
| Customer post-assignment cancellation | Customer + backend billing endpoint | `accepted`, `driving`, `en_route`, `buying_resources`, `arrived`, `work_started` | `canceled` | client initiates cancellation; backend calculates/records charge where needed | billing results, payout split, platform fees | `cancelServiceRequestByCustomer`, `billCustomerServiceCancellation` |
| Helper offer accept | Offered helper | `helper_found` | `accepted` | helper assignment snapshot, clear current offer, queue cleanup, status/detail, timestamp | payment/payout/rewards | `helpers/src/services/serviceRequestService.js#acceptServiceRequestOffer` |
| Helper offer decline | Offered helper | `helper_found` | `matching` | queue removal, declined/excluded helper IDs, clear offer, status/detail, timestamp | payment/payout/rewards | `declineServiceRequestOffer` |
| Helper travel/status | Assigned helper | `accepted` onward | `driving`, `en_route`, `buying_resources`, `arrived`, `work_started` | status/detail, arrived/work-start timestamps | payment/payout/rewards | `updateHelperActiveRequestStatus` |
| Completion proof | Assigned helper | active job | unchanged | proof attachment list/count/captured timestamp | payment/payout/rewards | `ActiveJobScreen#uploadCompletionProofPhotos` |
| Completion initiation | Assigned helper | `work_started`/active | function call | no direct paid completion write | status completed, payment status, payout, totals | `finalizeServiceRequestBilling` |
| Backend matching/assignment | Cloud Functions Admin SDK | `matching`/scheduled | `helper_found`, `no_helper_available`, etc. | n/a | queue, current offer, tokens, offer revision, assignment state | `syncServiceRequestLifecycle` |
| Backend billing finalization | Cloud Functions Admin SDK | active | `completed` | n/a | payment status, transaction ID, final amount, waiting costs, payout breakdown, live tracking closure, rewards | `finalizeServiceRequestBilling` |
| Backend cancellation billing | Cloud Functions Admin SDK | active/canceled | `canceled` | n/a | cancellation charge, payment/debt outcome, helper payout/platform amounts | `billCustomerServiceCancellation` |
| Embedded rating snapshot | Cloud Functions Admin SDK | `completed` | unchanged | n/a | `ratings.customer` / `ratings.helper` compatibility snapshot | `submitServiceRequestRating` |
| Admin moderation/override | Admin client | any | any | admin-authorized fields | admin-only by Rules | Admin console / direct ops |

## users/{uid} field matrix

| Field/path | Customer writes? | Helper writes? | Backend writes? | Admin writes? | Protected? |
| --- | --- | --- | --- | --- | --- |
| `displayName`, `fullName`, `phoneNumber`, profile photo, customer profile/address/preferences | yes | yes where applicable | yes during auth sync | yes | no |
| `onlineStatus`, `lastKnownLocation`, `locationSharingEnabled` | no | yes | yes for dispatch sync | yes | no |
| `referralCode` | read/display only | read/display only | yes through `ensureReferralCode` | yes | owner write blocked indirectly when generated by backend; not in owner protected list to avoid profile breakage |
| `role`, `roles`, `activeRole`, `isAdmin` | no | no | yes during account provisioning | yes | yes |
| `ratings`, `metrics`, completion/cancellation/response counters | no | no | yes | yes | yes |
| `paymentMethods`, `verificationStatus`, `wallet`, `payout` | no direct owner writes after hardening | no direct owner writes after hardening | yes | yes | yes |
| `membership`, `mastery`, `rewards`, reward counters | no | no | yes under protected collections | yes | yes |
| `blocked`, `suspended`, fraud/admin fields | no | no | yes | yes | yes |

## Shared constants validation

The runtime source is `shared/rewards/index.js`. `shared/rewards/generated/constants.json` is a deterministic snapshot for client/admin consumers and release validation. `scripts/validate-reward-constants.js` fails if the snapshot diverges from the runtime module.
