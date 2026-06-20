# Helpers Provider App

This folder contains the Expo React Native app for helpers and service providers.

## Purpose

- Helper signup, login, and profile completion
- Service and skill setup
- Availability management and active job handling
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
