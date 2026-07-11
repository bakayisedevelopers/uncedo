# Helpers App

This folder contains the Expo React Native app for helpers.

## Purpose

- Helper signup, login, and profile completion
- Versioned helper agreement review, signing, and profile-completion gating
- Firestore-backed service browsing, skill setup, bundle-service enrollment, and service approval flow
- Multi-image uploads for helper service submissions
- Availability management and active job handling
- Helper home map with an interactive live map, persistent live location marker, and 50 km service radius
- Route-based active job tracking with in-app travel status updates
- Android active-job guidance now uses the Google Navigation SDK through the official React Native package, while the helper dashboard uses a stable static map preview and the existing live-tracking pipeline still keeps customer/helper tracking in sync.
- Accepted jobs seed `liveTracking/serviceRequests/{requestId}` in Realtime Database immediately, then update helper movement, destination, route geometry, and closure status through the same tracking node.
- Earnings, wallet balance, cancellation-aware payouts, and completed jobs grouped by week
- Automatic Monday helper payout batching backed by Firestore payout records
- Map-driven job and route views

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
- The helper agreement flow now reads and writes the live contract records directly in Firebase client-side, including signed acceptance records and the stored acceptance PDF, and blocks profile completion until the latest published version is signed.

## Phase 0 rewards foundation

The helper app now submits service-request ratings through the trusted `submitServiceRequestRating` Cloud Function instead of updating customer aggregates from the client. Read-only reward helpers live in `src/services/rewards/rewardClientService.js` for reward accounts, transactions, reward configuration, rating summaries, membership, helper mastery, and referral-code operations. Full rewards dashboards are intentionally deferred.
