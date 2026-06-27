# Helpers Provider App

This folder contains the Expo React Native app for helpers and service providers.

## Purpose

- Helper signup, login, and profile completion
- Versioned helper agreement review, signing, and profile-completion gating
- Service and skill setup
- Availability management and active job handling
- Helper home map with a dedicated native map, persistent live location marker, and 50 km service radius
- Route-based active job tracking with in-app travel status updates
- Earnings, payouts, and completed jobs
- Map-driven job and route views

## Stack

- Expo
- React Native
- Firebase client SDK
- React Native Maps
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
- Navigation is implemented in `src/navigation/RootNavigator.js`, including the custom route history used for Android hardware back behavior and mobile system-bar insets.
- The helper agreement flow now loads the live contract text from Cloud Functions and blocks profile completion until the latest published version is signed.
