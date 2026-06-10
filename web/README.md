# Parakleo Web App

Parakleo is an online-first tutoring marketplace where students request classes and tutors accept/manage them in real time.

## Stack
- React + Vite + Tailwind + React Router
- Firebase Auth + Firestore (modular SDK usage)
- Firebase Hosting + Functions-ready project config
- Resend email delivery through Firebase Functions (server-side only)

## Environment Variables
Create a `.env` file in this `web/` directory:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_DATABASE_ID=claxi
```

Set Firebase Functions environment variables/secrets separately:

```bash
RESEND_API_KEY=
EMAIL_FROM=noreply@yourdomain.com
PAYSTACK_SECRET_KEY=
```

This project is configured to use Hosting/Vite route mapping for backend payment endpoints (`/verify-paystack`, `/finalize-session-billing`).

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Firestore Collections
- `users`
- `classRequests`
- `sessions`
- `notifications`
- `emailEvents` (queue consumed by Cloud Function)

## Firebase Functions
Functions source is in `../functions/index.js` (repo root `functions/`).

Deploy flow example from repo root:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,hosting
```

> Do not expose `RESEND_API_KEY` in frontend code.
