# Uncedo Web App

This folder contains the React + Vite web application for the main portal, admin surfaces, and marketing pages.

## Purpose

- Student request, session, wallet, profile, and onboarding flows
- Tutor and admin dashboards
- Session room and whiteboard entry points
- Legal, pricing, privacy, and policy pages

## Stack

- React
- Vite
- React Router
- Firebase client SDK
- Tailwind CSS
- Motion-based UI transitions

## Scripts

```powershell
npm install
npm run dev
npm run build
npm run preview
```

## Environment

The web app uses Firebase client config from `web/src/firebase/config.js` and the usual `VITE_FIREBASE_*` environment variables.

## Agent Notes

- Read `../AGENTS.md` before editing this folder.
- Read `../docs/skills/agent-codebase-guide.md` for the repo map.
- Use `../docs/skills/agent-developer-workflow.md` when changes affect deployment or release flow.
- Keep this README in sync with major route, service, or shell changes.
