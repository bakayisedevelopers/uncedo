# Parakleo Mobile Plan (React Native, Student App Only)

This document replaces the previous starter-only note and serves as the implementation plan for the **student-only** mobile application.

## What was in this file before

The previous `mobile/README.md` was a short Expo starter note:
- why Expo was chosen,
- how to run the starter app,
- and that there was no Firebase wiring or web feature port yet.

## Final build decision (locked on 2026-04-23)

- ✅ **Build framework: React Native with Expo only** (for Codespaces-friendly testing).
- ❌ **Do not build this app in Flutter.**
- ❌ **Do not build this app in FlutterFlow.**
- ✅ Scope is **student user only** (no tutor UI, no admin UI).
- ✅ Delivery model is phased so Codex Web can implement in the background and notify you at each phase completion.

---

## Current web stack and core features to preserve

### Web packages currently in use (from `web/package.json` + installed lock)

Keep the mobile migration aligned with both the declared web ranges and the currently installed resolved versions:

| Package | Declared in `web/package.json` | Installed in `web/node_modules` |
|---|---:|---:|
| `firebase` | `^11.10.0` | `11.10.0` |
| `lucide-react` | `^0.307.0` | `0.307.0` |
| `motion` | `^11.0.0` | `11.18.2` |
| `react` | `^18.2.0` | `18.3.1` |
| `react-dom` | `^18.2.0` | `18.3.1` |
| `react-router-dom` | `^6.20.0` | `6.30.3` |
| `tldraw` | `^4.5.9` | `4.5.9` |
| `@vitejs/plugin-react` | `^4.2.1` | `4.7.0` |
| `autoprefixer` | `^10.4.16` | `10.4.27` |
| `postcss` | `^8.4.32` | `8.5.8` |
| `tailwindcss` | `^3.4.1` | `3.4.19` |
| `vite` | `^5.0.8` | `5.4.21` |

Current mobile packages in `mobile/package.json` are `expo@~54.0.34`, `expo-status-bar@~3.0.9`, `firebase@^11.10.0`, `react@19.1.0`, `react-native@0.81.5`, and `react-native-webview@13.15.0`. The app was upgraded from SDK 53 to SDK 54 so it runs in the current Expo Go app on physical phones.

### Student-relevant feature set detected in the current app

- Authentication (signup/login/logout), protected routes, role-aware redirects, and live profile loading.
- Student-only app surfaces: dashboard, class request creation, request list, request details/status, sessions list, wallet/payment page, profile, onboarding, and session room entry.
- Student onboarding/profile management, including subject/academic profile constraints reused from web utilities.
- Current request flow starts on the student dashboard: quick request suggestions, typed topic/description, camera/file attachments, automatic subject detection, duration estimate, price quote, free-minute discount preview, selected saved card, and review-before-confirm.
- Attachment upload and extraction pipeline: image/PDF selection, Storage upload, OCR/extraction hooks, subject classification hooks, and whiteboard preparation source generation.
- Real-time request/session tracking through Firestore listeners, including request states such as pending, matching, offered, accepted, waiting student, in progress, in session, completed, canceled, and no tutor available.
- Sessions list/details with request-to-session linking, uploaded attachment visibility, tutor assignment status, quoted pricing snapshot, and "Join / Re-open class" entry.
- Session room architecture with:
  - `tldraw` SDK embed on web for tutor whiteboard
  - prepared whiteboard injection from parsed attachment/question data
  - WebRTC session controller/service hooks
  - ICE server fetch endpoint support
  - student remote screen-share viewing, mute/end/cancel controls, join window handling, selected-duration auto-end, 2-minute grace prompt, and post-session rating
- Wallet and payment method management: Paystack inline authorization on web, backend verification endpoint, saved cards, wallet top-up, outstanding debt display, failed-charge/debt handling parity, and policy links.
- Notifications and rating prompts, backed by Firestore-driven subscriptions and server-side email event queues.
- Shared backend contracts with Firebase Auth, Firestore, Storage, Functions endpoint rewrites, Paystack, Resend, OCR, subject classification, student growth/free-minute sync, and session billing.

### Web design and UX traits to preserve

- Light app shell with white/zinc surfaces, emerald brand color (`#10b981`), cyan/indigo accents, rounded panels, soft shadows, and the web topbar plus sidebar/drawer navigation behavior.
- Student dashboard is the primary first screen after login, not a marketing page.
- Camera/file upload and typed request entry are prominent, with clear processing overlays for extraction/classification before review.
- Form controls use compact cards, icon-led actions, loading/empty/error states, and status badges.
- Session room is full-screen and task-focused: landscape guidance on mobile, screen/board stage fills the viewport, controls float over the live surface, and post-session rating is modal/full-screen.

---

## React Native package counterparts (web -> mobile)

> These are target packages for migration planning. Final lock-in should happen during Phase 0 spike/prototyping.

| Current web package/capability | React Native counterpart(s) | Notes |
|---|---|---|
| `react@18.3.1`, `react-dom@18.3.1`, Vite app shell | `react@19.1.0`, `react-native@0.81.5`, `expo@~54.0.34` | Current mobile app uses the Expo SDK 54-compatible React Native baseline from `mobile/package.json`; keep Expo Go compatibility first. |
| `react-router-dom@6.30.3` | `@react-navigation/native`, `@react-navigation/native-stack`, drawer/sidebar navigation | Navigation/route guards for auth + student app areas. Mirror `/app/student`, `/app/student/requests`, `/app/student/payment`, `/app/profile`, `/app/onboarding`, and `/app/session/:id` with the web topbar/sidebar pattern. |
| `firebase@11.10.0` (auth/firestore/storage/functions) | `firebase@11.10.0` JS SDK (modular) in RN + `@react-native-async-storage/async-storage` | Keep shared backend, Firestore schema, Storage paths, and auth persistence aligned with web. |
| `lucide-react@0.307.0` icons | `lucide-react-native@0.307.0` | Pin to the matching icon set version where Expo compatibility allows. |
| `motion@11.18.2` animations | `react-native-reanimated` (+ optional `moti`) | Better-native motion performance/gestures; preserve processing overlays, page transitions, and control affordances. |
| `tldraw@4.5.9` whiteboard | `tldraw@4.5.9` in `react-native-webview`, OR native canvas via `react-native-skia` | There is no 1:1 mature native `tldraw` drop-in today. Evaluate keeping the exact web SDK in a WebView before replacing it. |
| Browser WebRTC usage | `react-native-webrtc` | Required for in-app RTC media; integrate with existing signaling model. |
| Screen-share viewing and media controls | `react-native-webrtc`, `expo-av` (or `react-native-incall-manager` if needed) | Student app must receive tutor screen share, support mute/end/cancel, and enforce duration/grace flow. |
| Tailwind CSS UI system (`tailwindcss@3.4.19`) | `nativewind` | Tailwind-style utility workflow on RN. Preserve the emerald/zinc/cyan/indigo design language. |
| File/image picking uploads | `expo-image-picker`, `expo-camera`, `expo-document-picker`, `expo-file-system` | Replaces browser file input/upload behavior and supports the dashboard "Take Picture" first workflow. |
| Push/notifications UI | `expo-notifications` | For local + remote notification handling. |
| Secure token/session storage | `expo-secure-store` | Store auth/session-sensitive values securely. |
| Payments (Paystack web flow) | `react-native-webview` hosting Paystack inline script | Mirror web `PaystackPop.setup` as closely as React Native allows, then call the same `verifyPaystack` backend endpoint. |
| Email events (server-side) | no mobile package (keep Firebase Functions + Resend backend) | Mobile only triggers backend workflows. |

---

## Phased implementation plan (student app only, React Native/Expo only)

Each phase is intended to be implemented in Codex Web as a standalone milestone and reviewed before continuing.

> Hard constraint for every phase: use React Native + Expo libraries and workflows only.

## Important Migration Rules

- This mobile application is a direct migration and duplicate of the existing web student application. It is not a new app, redesign, or from-scratch product.
- Every phase must copy the web application's UI, UX, navigation style, logic flow, data contracts, validation rules, status labels, and backend behavior as exactly as React Native allows.
- Navigation must mirror the web app shell: topbar plus sidebar/drawer navigation. Do not introduce a bottom menu bar unless React Native cannot support the web pattern for that specific surface.
- Payment method addition must mirror the web Paystack flow: tap "Add a Card", open Paystack authorization, charge R1, receive the Paystack callback reference, call `verifyPaystack`, save the returned card, and show the same success/cancel/error messaging pattern.
- Any difference from the web application must be documented in the relevant phase tracker with the exact React Native limitation that forced the difference.
- Web services remain the source of truth for Firestore schema, Functions endpoints, pricing, request lifecycle, onboarding requirements, payment behavior, session lifecycle, and status mapping.
- Students should feel they are using the same Parakleo app across web and mobile. Visual language, screen order, copy, and interaction flow must stay consistent unless a native platform constraint prevents it.

> 2026-04-27 parity update: keep the existing phased plan, but execute it against the current web app shape: dashboard-first student request flow, `firebase@11.10.0`, React 18.3.1 parity, Paystack verification endpoints, OCR/classification/growth endpoints, sidebar/drawer app navigation, and the full-screen WebRTC/screen-share session room.

### Phase 0 — Discovery, package spike, and architecture freeze

Status: Completed

Results:
- Confirmed the student-only route inventory and preserved the mobile scope guardrail: auth, protected student shell, dashboard, requests, sessions/classes, wallet, profile, with onboarding/request details/session room reserved for later phases.
- Added `mobile/docs/phase-0-architecture.md` with accepted stack, rejected alternatives, endpoint strategy, and carry-forward decisions.
- Froze the current mobile runtime baseline around Expo SDK 54, React 19.1.0, React Native 0.81.5, and Firebase 11.10.0 as currently present in `mobile/package.json`.
- Selected WebView-hosted `tldraw@4.5.9` as the first whiteboard candidate for Phase 5 and kept native canvas as a rejected alternative for now.
- Selected Paystack mobile authorization plus existing backend verification as the payment direction.
- Migration rule for this phase: architecture decisions must preserve web parity first; alternatives are accepted only when exact web behavior is impossible in React Native.

**Goal:** remove technical uncertainty before UI migration.

- Confirm the student-only route inventory from web app: login, signup, protected app shell, profile, onboarding, dashboard/request creation, requests list, request status/details, sessions list, wallet/payment, and session room.
- Build short spikes for:
  - Firebase Auth + Firestore listener in RN using `firebase@11.10.0`
  - Firebase Storage upload from Expo-picked image/PDF files
  - WebRTC proof of connection (`react-native-webrtc`)
  - student receipt of tutor screen share through the existing signaling model
  - whiteboard approach candidate (`tldraw@4.5.9` in WebView vs native canvas)
  - Paystack mobile payment authorization/verification flow
  - callable/HTTP endpoint strategy for `/ice-config`, `/verify-paystack`, `/finalize-session-billing`, `/image-ocr`, `/classify-subject`, and `/sync-student-growth`
- Freeze package list + app architecture decisions, including exact versions where parity matters.
- Output: `mobile/docs/phase-0-architecture.md` with accepted package stack and rejected alternatives.

**Exit criteria:**
- Auth, Firestore, Storage upload, RTC, screen-share receive, whiteboard candidate, endpoint calls, and payment flow all have at least one working proof.

---

### Phase 1 — Foundation and shared infrastructure

Status: Completed

Results:
- Replaced the Expo starter screen with a protected student app shell in `mobile/App.js`.
- Added Firebase-backed auth context, sign in, signup, sign out, and session restoration service boundaries.
- Added student screens for dashboard, requests, sessions/classes, wallet, and profile.
- Added a lightweight internal auth/sidebar navigator so the app shell mirrors the web topbar plus sidebar/drawer pattern; React Navigation remains the intended replacement once dependency installation completes.
- Added reusable native UI primitives for buttons, compact cards, form fields, status badges, loading, empty, error, and global error boundary states.
- Added Parakleo design tokens for white/zinc surfaces, emerald brand, cyan/indigo accents, rounded panels, and soft shadows.
- Added shared mobile service boundaries mirroring web names/contracts where practical: `authService`, `userService`, `classRequestService`, `sessionService`, `walletService`, and `paymentMethodService`.
- Added Firestore listener boundaries for student profile, requests, sessions, and wallet data.
- Migration rule for this phase: navigation and app shell must mirror the web topbar/sidebar structure, not introduce mobile-only bottom-tab behavior.

**Goal:** create production-ready student app skeleton.

- Set up navigation structure (auth stack + student tab/stack) matching web's student route map.
- Configure environment management and Firebase client initialization.
- Implement auth session persistence and protected routes.
- Add design system primitives (buttons, compact cards, form fields, select fields, status badges, loading/empty/error states).
- Recreate web visual direction in native primitives: white/zinc surfaces, emerald brand, cyan/indigo accents, soft shadows, rounded panels, topbar, and sidebar/drawer ergonomics.
- Add telemetry/logging hooks and global error boundary.
- Add shared service boundaries that mirror web service names/contracts where practical (`authService`, `userService`, `classRequestService`, `sessionService`, `walletService`, `paymentMethodService`).

**Primary package focus:**
`expo`, `react-native`, `@react-navigation/*`, `firebase@11.10.0`, `@react-native-async-storage/async-storage`, `nativewind`.

**Exit criteria:**
- User can sign in/out and remain logged in after app restart.
- App shell, sidebar/drawer navigation, protected screens, and shared service wiring are ready for feature screens.

---

### Phase 2 — Student onboarding/profile + payment methods

Status: Completed

Results:
- Added student setup screen to the protected mobile shell for grade, curriculum, discovery source, and subject selection.
- Ported student onboarding status logic to mobile so setup can report academic-profile and payment-method completion.
- Added South African subject constants and native subject chip selection compatible with the web `subjects` array.
- Added Firestore profile update support through `updateUserProfile` and wired setup saves to the existing `studentProfile` contract.
- Added `syncStudentGrowth` mobile service boundary using the Firebase Functions endpoint strategy from Phase 0.
- Added saved-card management UI in setup and wallet surfaces: verified-card display, primary-card selection, removal, nickname support, and empty states.
- Added the web-equivalent Paystack card authorization flow through `react-native-webview`: open Paystack inline authorization, charge R1, receive the callback reference, call `verifyPaystack` with Firebase ID token, save the returned card, and show success/cancel/error messaging.
- Updated dashboard/profile states to guide students into setup until academic and payment requirements are complete.
- Migration rule for this phase: onboarding/profile/payment method UI and logic must stay aligned with the web `OnboardingPage`, `PaymentMethodsManager`, `paystackService`, and `paymentMethodService` flow.

**Goal:** unlock request eligibility paths.

- Build student onboarding/profile screens (subjects, academic context, profile fields, onboarding completion banner).
- Add payment method management UI and backend wiring.
- Implement saved-card display, default card selection, nickname handling, and Paystack verification endpoint call.
- Port validation logic from web onboarding constraints.
- Ensure data contracts stay compatible with existing Firestore schema.

**Primary package focus:**
`firebase@11.10.0`, `expo-secure-store`, payment package selected in Phase 0.

**Exit criteria:**
- Student can complete onboarding, update profile data, add/manage saved cards, and keep Firestore user records compatible with web.

---

### Phase 3 — Class request creation + attachments + pricing

Status: Completed

Results:
- Replaced the dashboard placeholder with a live dashboard-first request composer in `mobile/src/components/student/StudentRequestComposer.js` and `mobile/src/screens/student/DashboardScreen.js`.
- Added camera/upload entry for image and PDF attachments through a `react-native-webview` picker bridge so the mobile flow preserves the web request entry pattern without changing the web application.
- Added production mobile service boundaries for pricing quote, attachment OCR, subject classification, Storage upload, and request persistence in `mobile/src/services/`.
- Added review-before-confirm flow with quick suggestions, typed request text, extracted attachment state, detected/manual subject handling, estimated/selectable duration, free-minute preview, selected saved card, and pricing snapshot lock.
- Extended the mobile request write path to persist the web-compatible request fields: `pricingSnapshot`, `pricingQuoteId`, `attachments`, `selectedCardId`, and `boardPreparationSource`.
- Updated the student request list surface to show lifecycle labels, duration, quote summary, and attachment counts from live requests.
- Added additive backend PDF OCR support to the existing `extractImageOcr` endpoint so mobile attachments can stay on the production OCR path while web image behavior remains unchanged.
- Migration rule for this phase: React Native uses a WebView-backed chooser plus server-side PDF OCR because the web `input[type=file]` plus `pdfjs` client path is browser-specific.

Migration rule for this phase: copy the web dashboard-first request creation flow exactly, including quick suggestions, typed request fields, attachment processing states, OCR/classification behavior, pricing quote, free-minute preview, selected card, and review-before-confirm.

**Goal:** ship core “request a class” workflow.

- Implement dashboard-first request flow, not a separate blank form.
- Support quick suggestions, typed topic/description, camera capture, image/PDF picker, attachment removal, and processing status rows.
- Integrate attachment upload to Storage and OCR/extraction trigger path consistent with backend services.
- Integrate subject detection/classification fallback, manual subject selection, estimated duration, selectable duration, free-minute discount preview, price quote, and selected payment card.
- Build the review-before-confirm step and persist the same request shape used by web, including `pricingSnapshot`, `attachments`, `selectedCardId`, and `boardPreparationSource`.

**Primary package focus:**
`expo-image-picker`, `expo-camera`, `expo-document-picker`, `expo-file-system`, `firebase@11.10.0`.

**Exit criteria:**
- Student can submit a request with/without attachments, see extraction/classification status, review pricing, and see the request persisted live.

---

### Phase 4 — Request tracking + notifications + sessions list

Status: Completed

Results:
- Replaced the placeholder mobile request/session lists with parity-driven "My Classes" and session-entry surfaces in `mobile/src/screens/student/RequestsScreen.js` and `mobile/src/screens/student/SessionsScreen.js`.
- Added a live request tracker screen and full request details screen so students can follow lifecycle state, review pricing/attachments, cancel a request, and jump into the linked session entry from mobile.
- Added an in-app notification center with unread indicator, Firestore-backed notification subscriptions, and request/session routing from topbar alerts.
- Added a mobile session-room entry shell and deep-link support for `claxi://request/:id`, `claxi://request-details/:id`, and `claxi://session/:id` so request/session detail routes are stable before Phase 5 live RTC work.
- Added session rating prompt handling for completed/canceled sessions, including request/session rating status writes and tutor/student rating summary updates.
- Migration rule for this phase: request status, request detail, notification routing, session card data, and join/re-open entry must stay aligned with the web student flow; the live RTC/whiteboard surface itself remains Phase 5.

Migration rule for this phase: copy the web request list, request detail/status timeline, notification behavior, session card data, lifecycle labels, and join/re-open class logic exactly.

**Goal:** keep student informed in real-time.

- Build request status timeline/tracker using the same lifecycle labels and status mapping as web.
- Build "My Classes" request list, request detail screen, and student sessions list/detail cards.
- Show tutor assignment, session linkage, request attachments, quoted total/free-minute discount, selected duration, and "Join / Re-open class" entry when a session exists.
- Wire notification feed and in-app notification indicators.
- Port rating prompt flow for completed sessions.
- Add deep links for request details and session room entry.

**Primary package focus:**
`firebase@11.10.0`, `expo-notifications`, navigation deep-links.

**Exit criteria:**
- Student can monitor requests, request details, notifications, and session lifecycle entirely on mobile.

---

### Phase 5 — Session room (WebRTC + whiteboard)

Status: Completed

Results:
- Replaced the Phase 4 placeholder with a full-screen student session room in `mobile/src/screens/student/SessionRoomScreen.js` and removed the standard app-shell chrome for that route so the live classroom can take over the viewport.
- Added live production session actions in `mobile/src/services/sessionService.js` for join, billing-clock sync, cancellation with reason, and `finalizeSessionBilling` closure through the existing backend endpoint.
- Added `mobile/src/components/student/StudentRtcSessionView.js`, a WebView-hosted RTC receiver that uses the signed-in Firebase ID token, live Firestore signaling documents, tutor candidate polling, `getIceConfig`, remote audio, and tutor screen-share rendering without changing the web application.
- Added `mobile/src/services/iceServerService.js` and switched the Expo app orientation to `default` in `mobile/app.json` so landscape session use is possible while preserving the rest of the student app flow.
- Kept the existing post-session rating flow intact, so completed/canceled sessions still trigger the student rating prompt from the shared mobile session listener.
- Migration rule for this phase: React Native uses a WebView-hosted browser WebRTC receiver plus Firestore REST signaling because the current mobile baseline already ships `react-native-webview` while native `react-native-webrtc` installation could not be completed inside this restricted environment.

Migration rule for this phase: copy the web session room control flow, full-screen treatment, WebRTC lifecycle, screen-share viewing, duration/grace handling, whiteboard preparation behavior, and rating prompt as exactly as React Native allows.

**Goal:** deliver live classroom experience.

- Implement RTC media connect/disconnect flow with ICE config support and network error messaging.
- Implement student screen-share receive stage so the tutor's shared screen/board fills the viewport.
- Implement mute, cancel with reason, end session, auto-join, join grace window, selected-duration auto-end, and 2-minute grace prompt.
- Implement whiteboard experience per selected Phase 0 approach, preserving `tldraw@4.5.9` compatibility if WebView is selected.
- Integrate question parsing / whiteboard preparation hooks where applicable so uploaded work can seed the tutor board.
- Add session state handling (waiting student, in progress, completed, canceled, canceled during, failed/no access) and post-session rating.
- Include landscape guidance and full-screen layout treatment matching the web session room.

**Primary package focus:**
`react-native-webrtc`, `react-native-webview` or whiteboard package selected in Phase 0.

**Exit criteria:**
- Student can join a session, receive live tutor media/screen-share/board workflow, manage controls, complete the timed billing flow, and submit/dismiss rating.

---

### Phase 6 — Wallet, billing, and hardening

Migration rule for this phase: copy the web wallet, billing, debt handling, policy links, retry/error states, and production hardening behavior exactly.

**Goal:** complete payment lifecycle and production readiness.

- Implement wallet balance/debt views and top-up flow.
- Finalize billing edge cases (failed charge -> debt handling parity), session finalization endpoint behavior, and outstanding amount display.
- Port payment policy links/content strategy for mobile surfaces.
- Improve offline/poor-network behavior, retries, and error UX.
- Add smoke/regression test checklist for all student critical paths.
- Confirm mobile does not introduce tutor/admin UI, but preserves backend compatibility with tutor/admin web flows.

**Primary package focus:**
payment package, `firebase@11.10.0`, analytics/crash reporting choice.

**Exit criteria:**
- Student billing and wallet lifecycle match current web behavior.
- App is ready for production pilot.

---

## Codex Web execution + email review loop

To support “build in background and notify by email when phase is complete”:

1. Keep one tracker file per phase under `mobile/docs/phases/` with:
   - checklist,
   - implementation notes,
   - QA outcomes,
   - pending decisions.
2. At phase completion, trigger backend email notification by writing a `phase_complete` event into Firestore (existing event queue pattern used by functions + Resend can be reused).
3. Include phase artifact links/screenshots in the completion note for quick review.
4. Do not start next phase until review sign-off is captured in the tracker file.

Suggested completion event shape:

```json
{
  "type": "phase_complete",
  "target": "student_mobile",
  "phase": "Phase 3",
  "summary": "Request creation + attachment uploads complete",
  "reviewer": "product_owner_email",
  "createdAt": "serverTimestamp"
}
```

---

## Scope guardrails (non-negotiable)

- Build **student experience only**.
- Exclude tutor dashboards, tutor workflows, and admin tooling from mobile scope.
- Any shared backend updates must not break existing web tutor/admin behavior.

## Definition of done for migration

- Student can complete the end-to-end lifecycle on mobile:
  1) authenticate,
  2) onboard,
  3) add payment method,
  4) request class with optional attachment,
  5) track request,
  6) join session room,
  7) complete billing/wallet follow-up,
  8) submit session rating.
