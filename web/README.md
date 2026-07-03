# Uncedo Web App

This folder contains the reduced React + Vite public website for Uncedo.

## Purpose

- Public landing page
- Privacy policy page
- Terms of service page

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

- No Firebase client configuration is required for the current public-only site.
- The standalone admin console lives in `/admin` and uses a separate Firebase Hosting site.

## Agent Notes

- Read `../AGENTS.md` before editing this folder.
- Read `../docs/skills/agent-codebase-guide.md` for the repo map.
- Use `../docs/skills/agent-developer-workflow.md` when changes affect deployment or release flow.
- Keep this README in sync with major route, service, or shell changes.
- The old login, signup, tutor, student, admin-in-web, session, payment, and onboarding flows were removed from `web/`.
