# Helpers Web Portal (`/helpers-web`)

Dedicated Vite + React + Tailwind web application for Uncedo Helper onboarding and verification, deployed to `https://helpers.bakayise.com` (`bakayise-uncedo-latest-helpers`, output directory `../helpers/dist`).

## Purpose

- Separate web UI independent from the Expo React Native mobile app in `/helpers`.
- Step-by-step guided onboarding with a persistent process rail showing overall completion percentage and current step:
  1. **Profile Basics**: Full name, individual or business details, home address, and WhatsApp phone linking.
  2. **Profile Selfie**: Camera capture or headshot upload.
  3. **Services & Portfolio**: Live Firestore `serviceCatalog` browser, option selection, and work photo uploads (`helperServices`).
  4. **Helper Agreement**: Active legal agreement viewer and electronic signature (`acceptHelperAgreement` / `acceptWhatsAppHelperAgreement`).
  5. **Police Clearance**: Private clearance certificate upload (`submitWebHelperPoliceClearance`), status tracking, and owner-checked signed viewing (`getMyHelperPoliceClearanceViewUrl`).
  6. **Bank Payouts**: South African bank selection and Paystack verification (`getHelperPayoutBanks`, `verifyHelperPayout`).
  7. **Verification Status**: Live readiness checklist and WhatsApp go-online instructions once verified.

## Commands

```bash
npm install
npm run dev
npm run build
```

`npm run build` outputs directly to `../helpers/dist` and copies `index.html` to `app.html` plus `/helpers/assets/bakayise-helpers-icon.jpg` to `/helpers/dist/helpers-mark.jpg`.
