# Uncedo Student App

This folder contains the Expo React Native app for the student and customer experience.

## Purpose

- Student authentication and onboarding
- Class request creation and tracking
- Customer route-based helper tracking during active service requests
- Session room entry and live session flow
- Wallet, payment methods, and billing follow-up
- Student/customer profile and notifications

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

## Key Folders

- `src/screens/student/`
- `src/screens/customer/`
- `src/components/student/`
- `src/components/customer/`
- `src/services/`
- `src/navigation/`
- `scripts/`

## Agent Notes

- Read `../AGENTS.md` before editing this folder.
- Read `../docs/skills/agent-codebase-guide.md` for the repo map.
- Use `../docs/skills/agent-developer-workflow.md` when builds or release APKs are involved.
- Keep the mobile app aligned with the web student flows unless a native limitation forces a difference.
