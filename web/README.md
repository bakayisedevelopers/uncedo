# Uncedo Web App

This folder contains the React + Vite customer website for Uncedo.

## Purpose

- Public WhatsApp-focused landing page explaining that Uncedo bookings happen directly in WhatsApp without requiring an account, with a top-right `Book` button linking to `+27 60 523 9926`
- Customer email/password sign-in and optional account linking (`/sign-in`, `/sign-up`, `/whatsapp-link`)
- Required international WhatsApp contact number during account creation; an existing account with a matching number is linked from WhatsApp only after its one-time, 24-hour link is opened
- Google sign-in and sign-up
- Authenticated customer profile completion using the shared `users/{uid}` profile
- Privacy policy & POPIA notice page
- Terms of service, payment & pricing policy, refund & cancellation policy, and data/location policy pages

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
- The standalone admin console lives in `/admin` and uses a separate Firebase Hosting site.

## Agent Notes

- Read `../AGENTS.md` before editing this folder.
- Read `../docs/skills/agent-codebase-guide.md` for the repo map.
- Use `../docs/skills/agent-developer-workflow.md` when changes affect deployment or release flow.
- Keep this README in sync with major route, service, or shell changes.
- Customer profile details are saved in Firestore at `users/{uid}`. Payment-card saving is also available on `/payment` (checked by default) for both signed-in and guest customers via Paystack reusable authorisations.
- Routes: `/` for the full-screen Instagram Reels-style service options home page (`?service=<id>` deep-link support), `/about` for the WhatsApp-first Uncedo overview, `/policies` for the legal policies directory, `/services` (and `/browse` redirect) for the visual Pinterest-style masonry grid, `/sign-in`, `/sign-up`, `/whatsapp-link`, `/account`, `/payment`, `/privacy-policy`, `/terms`, `/payment-pricing-policy`, `/refund-policy`, and `/data-voice-policy`. `/whatsapp-link` consumes a one-time link delivered to the same WhatsApp chat and returns the user to Uncedo without requiring an email sign-in.
