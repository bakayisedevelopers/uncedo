# Uncedo Customer App

This folder contains the Expo React Native app for the customer experience, with legacy student screens kept where the academic flow still exists.

## Purpose

- Student authentication and onboarding
- Class request creation and tracking
- Customer route-based helper tracking during active service requests
- Customer AI service-request chat with voice transcription, media references, and saved chat history
- Customer home discovery feed with ranked service tiles, full-catalog search overlay, helper work photos, and optional category personalization
- Customer home discovery feed with recommendation ranking from recorded activity, full-catalog search overlay, helper work photos, and optional category personalization
- Customer service selection details flow that can continue into AI chat or jump straight into helper matching for fixed-price requests, with automatic category backfill when a customer selects a service from a new category and live Firestore-backed custom services or bundles
- Session room entry and live session flow
- Wallet, payment methods, and billing follow-up
- Student/customer profile, service-category preferences, and notifications

## Stack

- Expo
- React Native
- Firebase client SDK
- React Native WebView
- Maps and location services
- Speech and media helpers

## Scripts

```powershell
npm install
npm run start
npm run android
npm run ios
npm run web
```

`npm run start`, `npm run android`, `npm run ios`, and `npm run web` now auto-run the Google Maps key preparation script before Expo starts so local map builds do not keep the native placeholder key.

## Key Folders

- `src/screens/student/` and `src/screens/customer/`
- `src/components/student/` and `src/components/customer/`
- `src/services/`
- `src/services/customerServiceMediaService.js`
- `src/services/customerServiceDiscoveryService.js`
- `src/services/customerRecommendationService.js`
- `src/navigation/`
- `scripts/`

## Agent Notes

- Read `../AGENTS.md` before editing this folder.
- Read `../docs/skills/agent-codebase-guide.md` for the repo map.
- Use `../docs/skills/agent-developer-workflow.md` when builds or release APKs are involved.
- Keep the customer marketplace flows aligned across mobile surfaces unless a native limitation forces a difference.
- The customer discovery feed, service selection, and intake question flow read the shared `serviceCatalog` collection so customers can request admin-approved services, including admin-created bundle services with backend-priced quotes.
- Customer recommendation signals are stored in `customerServiceEvents` and `customerRecommendationProfiles`, with Firestore-triggered aggregation in `functions/index.js`.
- Navigation is implemented in `src/navigation/RootNavigator.js`, including the custom route history used for Android hardware back behavior and mobile system-bar insets.
