# Helpers App

This folder contains the Expo React Native app for helpers.

## Purpose

- Helper signup, login, and profile completion
- Required international WhatsApp contact number during account creation; an existing account with a matching number is linked from WhatsApp only after its one-time, 24-hour link is opened
- Versioned helper agreement review, signing, and profile-completion gating
- Police-clearance review status and profile-completion gating. Helpers submit the document in their linked WhatsApp onboarding chat and can view their own retained submissions through short-lived owner-checked links; the app never stores the clearance file itself. A pending review expires after 90 days, while an approved helper stays approved unless an administrator changes that status.
- Firestore-backed service browsing, skill setup, bundle-service enrollment, and service approval flow
- Multi-image uploads for helper service submissions
- Availability management and active job handling
- Helper home map with an interactive live map, persistent live location marker, and 50 km service radius
- Route-based active job tracking with in-app travel status updates
- Android active-job guidance now uses the Google Navigation SDK through the official React Native package, while the helper dashboard uses a stable static map preview and the existing live-tracking pipeline still keeps customer/helper tracking in sync.
- Accepted jobs seed `liveTracking/serviceRequests/{requestId}` in Realtime Database immediately, then update helper movement, destination, route geometry, and closure status through the same tracking node.
- Provider offer acceptance and decline use the authenticated `respondToServiceRequestOffer` Cloud Function. Responses include the current offer token and revision so the backend can reject stale and expired actions; Cloud Tasks expires pending offers after the existing 30-second window.
- Earnings history grouped by week, plus an authenticated server-read helper wallet displaying a single signed wallet balance (synced onto the helper profile), cash commission deductions, and immutable wallet ledger transactions
- Automatic Monday helper payout batching backed by Firestore payout records (transfers only run when `balanceMinor > 0`)
- New wallet-accounted earnings are settled directly to the single wallet balance (reset to zero upon Paystack confirmation; kept unchanged if a transfer fails or is rejected) and excluded from the legacy request-based earnings summary so the same amount is not counted twice.
- Map-driven job and route views
- Browser onboarding and account routes (`/`, `/sign-in`, `/sign-up`, `/onboarding`, `/sign-agreement`, `/service-photos`, `/profile-photo`, `/payout-details`, `/whatsapp-link`) are served from Firebase Hosting `helpers/dist`, built by the dedicated React + Vite web portal in `../helpers-web`. It shares the same Firebase project, Firestore schemas, Cloud Functions, and verification rules while providing a dedicated 7-step web onboarding UI separate from the mobile app.

## Stack

- Expo
- React Native
- Firebase client SDK
- React Native Maps
- Google Navigation SDK for React Native (Android active-job navigation)
- Image picking and location helpers

## Scripts

```powershell
npm install
npm run start
npm run android
npm run ios
npm run web
```

`npm run start`, `npm run android`, `npm run ios`, and `npm run web` now auto-run the Google Maps key preparation script before Expo starts so local map builds do not keep the native placeholder key.

The deployed website in `helpers/dist` is built from `../helpers-web` (`npm --prefix ../helpers-web run build`), which outputs `helpers/dist/index.html` and copies it to `helpers/dist/app.html` for Firebase Hosting rewrites. Native mobile builds continue to run directly from `/helpers`.

The helper Android app now requires React Native new architecture and Android core-library desugaring because the Google Navigation SDK depends on them.

## Android Device Testing For Native Navigation SDK

Use this flow when testing the helper Android app on a real device because the Google Navigation SDK does not run inside Expo Go.

1. Build and install the helper Android development build:
   ```powershell
   cd helpers
   npm install
   npm run android
   ```
2. With the phone connected over USB and USB debugging enabled, switch `adb` to TCP/IP mode:
   ```powershell
   C:\Users\Jabu Babb\AppData\Local\Android\Sdk\platform-tools\adb.exe devices
   C:\Users\Jabu Babb\AppData\Local\Android\Sdk\platform-tools\adb.exe tcpip 5555
   ```
3. Read the phone Wi-Fi address and connect to it over the same network:
   ```powershell
   C:\Users\Jabu Babb\AppData\Local\Android\Sdk\platform-tools\adb.exe shell "ip addr show wlan0"
   C:\Users\Jabu Babb\AppData\Local\Android\Sdk\platform-tools\adb.exe connect <phone-ip>:5555
   ```
4. Start Metro for the helper app:
   ```powershell
   cd helpers
   npm run start
   ```
5. Open the installed Helpers app on the phone to pick up live JavaScript changes while keeping the native Google Navigation SDK available.

Current local example from this machine:

```powershell
C:\Users\Jabu Babb\AppData\Local\Android\Sdk\platform-tools\adb.exe -s 10AD8E12G40026G tcpip 5555
C:\Users\Jabu Babb\AppData\Local\Android\Sdk\platform-tools\adb.exe -s 10AD8E12G40026G shell "ip addr show wlan0"
C:\Users\Jabu Babb\AppData\Local\Android\Sdk\platform-tools\adb.exe connect 192.168.0.68:5555
```

## Key Folders

- `src/screens/provider/`
- `src/screens/auth/`
- `src/components/provider/`
- `src/components/auth/`
- `src/services/`
- `src/navigation/`
- `scripts/`

## Agent Notes

- Read `../AGENTS.md` before editing this folder.
- Read `../docs/skills/agent-codebase-guide.md` for the repo map.
- Use `../docs/skills/agent-developer-workflow.md` when builds or release APKs are involved.
- Keep this README in sync with helper workflow, screen, or service changes.
- The helper service catalog is loaded from the shared `serviceCatalog` collection, including admin-created bundle services, and helper submissions stay pending until the admin approves them.
- Navigation is implemented in `src/navigation/RootNavigator.js`, including the custom route history used for Android hardware back behavior and mobile system-bar insets.
- The helper agreement UI reads published contract information and requires explicit checkbox plus typed-name acceptance. Acceptance is recorded through a callable backend operation shared by the app and WhatsApp agreement page; the backend writes the signed acceptance and PDF and blocks profile completion until the latest published version is signed.

## Helper rewards experience

The helper app submits service-request ratings through the trusted `submitServiceRequestRating` Cloud Function instead of updating customer aggregates from the client. The Helpers Rewards experience is read-only against the shared Phase 0 rewards foundation: it displays Uncedo Points, paginated ledger history, overall membership, per-service-option mastery (`helperMastery/{uid}/serviceOptions/{masteryKey}` with optionless fallback to `services/{serviceId}`), customer-safe ratings, referrals, performance, and recognition without mixing points with cash earnings or payouts.

`src/services/rewards/rewardClientService.js` is the focused data client for reward accounts, transactions, reward configuration, rating summaries, mastery, and referral endpoints. Reward-sensitive writes remain server-authoritative. Helper reward screens are registered in `src/navigation/RootNavigator.js`; profile, home, earnings, service offerings, completion, rating, and server-authored notification flows link into them.

Points cannot be withdrawn as cash. Helper referral sharing is available, while helper-to-helper qualification remains clearly marked as planned unless trusted backend configuration enables it. Annual recognition is shown only when the backend provides authoritative annual tier data.
