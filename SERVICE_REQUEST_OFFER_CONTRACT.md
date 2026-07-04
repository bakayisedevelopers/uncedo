# Service Request Offer Contract

This contract defines how `serviceRequests` move from customer intake in `uncedo` into live helper offers in `helpers`.

## Status Lifecycle

1. `collecting_details`
2. `scheduled_pending`
3. `matching`
4. `helper_found`
5. `accepted`
6. `en_route`
7. `arrived`
8. `completed`

Supporting terminal and retry states:

- `no_helper_available`
- `canceled`
- `expired`

## Helper Offer Fields

These fields live on each `serviceRequests/{requestId}` document:

- `helperQueue: string[]`
  Ordered helper ids eligible for this request.
- `currentOfferHelperId: string | null`
  The helper currently allowed to respond.
- `offerExpiresAt: number | null`
  Epoch milliseconds for the current helper offer timeout.
- `offerToken: string | null`
  Unique token for the active helper offer revision.
- `offerRevision: number`
  Monotonic revision number for helper offer attempts.
- `lastOfferAt: number | null`
  Epoch milliseconds for the current helper offer dispatch.
- `helperAssignment: null | { helperId, helperName, helperEmail, helperPhone, acceptedAt, categoryId, serviceIds }`
  Set when a helper accepts.

## Status Semantics

- `matching`
  The request is eligible for helper queue generation.
- `helper_found`
  A single helper is being offered the request right now.
- `no_helper_available`
  No helper accepted yet or no eligible helper is currently online.
- `accepted`
  The helper accepted and is now assigned.
- `en_route`
  The helper is travelling.
- `arrived`
  The helper reached the customer.
- `completed`
  The job is complete.

## Matching Rules

Current helper-app support maps customer categories to helper profile services like this:

- `cleaning` -> `cleaning`, `laundry`
- `yard_maintenance` -> `yard_maintenance`, `gardening`
- `beauty` -> `beauty`
- `barber` -> `barber`, `beauty`
- `care` -> `care`
- `car_wash` -> `car_wash`

Helpers are dispatch-eligible when they are:

- `activeRole === "helper"`
- `onlineStatus === "online"`
- `verificationStatus === "verified"`
- `payout.verificationStatus === "verified"`
- on the current helper agreement version
- not already assigned to an active service request
- offering a mapped service with at least one skill that has a work photo

## Offer Trigger

The helper overlay should appear only when:

- `status === "helper_found"`
- `currentOfferHelperId === <logged in helper uid>`
- `offerExpiresAt > now`

The overlay closes only when:

- the helper accepts
- the helper declines
- the offer expires
- the backend reassigns or clears the offer
