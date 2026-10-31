# Service Request Auto-Expiration on "No Helper Available" (WhatsApp Workflow)

Schedules an automated Cloud Task strictly when a service request transitions to `no_helper_available`. If the request remains in this state for 5 minutes without a helper coming online or accepting, it automatically transitions to `expired` and delivers an alert directly to the customer's WhatsApp chat.

---

## User Review & Confirmed Decisions

> [!IMPORTANT]
> **Summary of User-Confirmed Direction**:
> - **Only Trigger on "No Helper Available"**: Do NOT schedule any expiration when the request enters `matching`. The request can stay in matching or cycle as needed without an artificial timer cutting off a potential helper.
> - **5-Minute Timeout**: The Cloud Task is scheduled to execute exactly **5 minutes (300 seconds)** after the status changes to `no_helper_available`.
> - **Self-Canceling Guard**: If a helper goes online and is assigned before the 5 minutes elapse (status transitions to `matching`, `helper_found`, or `accepted`), the scheduled task safely detects the status change and aborts without expiring the request.
> - **WhatsApp-First Customer Notification**: As soon as the request expires, the backend resolves the customer's WhatsApp contact and sends a WhatsApp message informing them that no helper was found and their request has expired.
> - **Targeted Deployment Only**: Deploy only the affected / newly added Cloud Functions (`firebase deploy --only functions:<functionName>`) so no unrelated backend services are disturbed.

---

## 1. Overview & Core Concept

- **What It Does**: Provides an automated 5-minute safety valve for unfillable service requests. When no providers are available to take a job, the system waits 5 minutes for availability to open up. If the state remains `no_helper_available` after 5 minutes, it gracefully expires the request and notifies the customer via WhatsApp.
- **Why It Matters**: Keeps WhatsApp customers informed without forcing them to manually poll the chat or wait indefinitely for an unavailable provider.

---

## 2. WhatsApp Customer Experience & Lifecycle Flow

```
[Customer Books Service on WhatsApp]
                  │
                  ▼
          status: 'matching' (No timer scheduled; matching proceeds normally)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 [Helper Found]    [No Helper Available]
        │                   │
        │                   ▼
        │        ┌────────────────────────────────────────────────────────┐
        │        │ Enqueue Cloud Task: run in 5 mins (300s)               │
        │        └────────────────────────────────────────────────────────┘
        │                   │
        │             (5 minutes pass)
        │                   │
        │         ┌─────────┴─────────┐
        │         ▼                   ▼
  (Helper goes online /       (Still 'no_helper_available')
   status changes)                    │
        │                             ▼
        ▼                      status: 'expired'
  [Task Aborts (No-op)]               │
  (Matching resumes)                  ▼
                               [Send WhatsApp Message to Customer]
                               "Sorry, we could not find an available
                                helper for your request. Your service
                                request has expired. Please try again later."
```

---

## 3. Key Technical Decisions & Safety Guardrails

### Decision 1: Trigger Exclusively on `no_helper_available`
- **Behavior**: A Firestore document trigger (`onDocumentWritten`) monitors `serviceRequests/{requestId}`.
- **Condition**: It enqueues an expiration task **only if** `after.status === 'no_helper_available'` and `before.status !== 'no_helper_available'`. All other transitions (including `matching`, `collecting_details`, `helper_found`) do nothing.

### Decision 2: Race Condition Protection via Firestore Transaction
- When the 5-minute Cloud Task executes, it runs an atomic transaction:
  1. Reads `serviceRequests/{requestId}`.
  2. Evaluates `request.status`.
  3. If `request.status !== 'no_helper_available'`, it logs `service_request_expiry_bypassed_status_changed` and exits with zero modifications.
  4. Only if `request.status === 'no_helper_available'`, it updates `status: 'expired'`, sets `statusDetail`, records `expiredAtMs`, and clears active queue tokens.

### Decision 3: Resolving Customer WhatsApp Contact
- Customer phone resolution order:
  1. `request.whatsappPhoneNumber` or `request.customerPhone`.
  2. If missing, look up `whatsappIdentities` where `linkedFirebaseUid == request.customerId` or `guestPrincipalId == request.customerId`.
  3. Format recipient into E.164 numeric format (e.g., `2760...`).
  4. Dispatch via Meta WhatsApp client (`metaClient.sendText`) within the active 24-hour service window.

---

## 4. Technical Architecture

### Component & Sequence Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        serviceRequests/{requestId}                     │
│                                                                        │
│   Status changes: 'matching' ──► 'no_helper_available'                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                       onDocumentWritten Trigger
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             scheduleServiceRequestExpiryOnNoHelperWrite                │
│                                                                        │
│   1. Verifies after.status === 'no_helper_available'                   │
│   2. Enqueues task to 'expireServiceRequestOnNoHelperAvailable'        │
│      with scheduleDelaySeconds: 300 (5 minutes)                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                           Cloud Tasks Queue
                                    │ (5 min delay)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             expireServiceRequestOnNoHelperAvailable (Task)             │
│                                                                        │
│   Transaction:                                                         │
│   - Check if status is STILL 'no_helper_available'                     │
│   - If NOT: abort (helper was found / status changed)                  │
│   - If YES:                                                            │
│       update status -> 'expired'                                       │
│       statusDetail -> 'No helper available within 5 minutes.'          │
│                                                                        │
│   After Transaction:                                                   │
│   - Resolves customer's WhatsApp number                                │
│   - Sends WhatsApp notification:                                       │
│     "Sorry, we could not find an available helper for your request     │
│      right now. Your service request has expired. Please try again     │
│      later."                                                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Deployment & Execution Plan

### Files to Modify in `functions/`:
1. **`functions/index.js`**:
   - Add trigger: `exports.scheduleServiceRequestExpiryOnNoHelperWrite` (or integrate into the existing lifecycle trigger).
   - Add Cloud Task handler: `exports.expireServiceRequestOnNoHelperAvailable = onTaskDispatched(...)`.
   - Add helper function: `notifyCustomerWhatsAppRequestExpired({ requestId, request })`.

### Verification Steps:
1. Run local test suite: `npm test --prefix functions` to verify zero regression in existing functions.
2. Verify task queue syntax and error handling.

### Targeted Firebase Deployment Command:
Deploy **only** the two specific functions created/updated:
```bash
firebase deploy --only functions:scheduleServiceRequestExpiryOnNoHelperWrite,functions:expireServiceRequestOnNoHelperAvailable
```
*(No broad `--only functions` command will be run).*
