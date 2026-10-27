# Uncedo Web App

This folder contains the React + Vite customer website for Uncedo.

## Purpose

- Public landing page
- Customer email/password sign-in and sign-up
- Required international WhatsApp contact number during account creation; an existing account with a matching number is linked from WhatsApp only after its one-time, 24-hour link is opened
- Google sign-in and sign-up
- WhatsApp authentication entry point, enabled only after the backend OTP flow and Meta configuration are active
- Authenticated customer profile completion using the shared `users/{uid}` profile
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

- Firebase client values are read from `VITE_FIREBASE_*` settings in `.env`.
- `VITE_WHATSAPP_AUTH_ENABLED` defaults to `false`; enable it only after the WhatsApp OTP Cloud Functions and Meta authentication template have been configured and deployed.
- The standalone admin console lives in `/admin` and uses a separate Firebase Hosting site.

## Agent Notes

- Read `../AGENTS.md` before editing this folder.
- Read `../docs/skills/agent-codebase-guide.md` for the repo map.
- Use `../docs/skills/agent-developer-workflow.md` when changes affect deployment or release flow.
- Keep this README in sync with major route, service, or shell changes.
- Customer profile details are saved in Firestore at `users/{uid}`. Payment-card setup stays in the existing customer app flow.
- Routes: `/sign-in`, `/sign-up`, `/whatsapp-link`, and `/account`, in addition to `/`, `/privacy-policy`, and `/terms`. `/whatsapp-link` consumes a one-time link delivered to the same WhatsApp chat and returns the user to Uncedo without requiring an email sign-in.
