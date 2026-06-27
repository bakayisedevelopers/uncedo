# Uncedo Student App

This folder contains the Expo React Native app for the student and customer experience.

## Purpose

- Student authentication and onboarding
- Class request creation and tracking
- Customer route-based helper tracking during active service requests
- Customer AI service-request chat with voice transcription, media references, and saved chat history
- Customer home discovery feed with Pinterest-style service tiles, search overlay, helper work photos, and category-based personalization
- Customer service selection details flow that can continue into AI chat or jump straight into helper matching for fixed-price requests
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

- `src/screens/student/`
- `src/screens/customer/`
- `src/components/student/`
- `src/components/customer/`
- `src/services/`
- `src/services/customerServiceMediaService.js`
- `src/services/customerServiceDiscoveryService.js`
- `src/navigation/`
- `scripts/`

## Agent Notes

- Read `../AGENTS.md` before editing this folder.
- Read `../docs/skills/agent-codebase-guide.md` for the repo map.
- Use `../docs/skills/agent-developer-workflow.md` when builds or release APKs are involved.
- Keep the mobile app aligned with the web student flows unless a native limitation forces a difference.
- Navigation is implemented in `src/navigation/RootNavigator.js`, including the custom route history used for Android hardware back behavior and mobile system-bar insets.
