# Helpers Web Application (`/helpers-web`)

Dedicated Vite + React + Tailwind Progressive Web App (PWA) for Uncedo Helpers, deployed to `https://helpers.bakayise.com` (`bakayise-uncedo-latest-helpers`, output directory `../helpers/dist`).

## App Architecture & Features

- **Headerless App Shell & 5-Slot Bottom Navigation**: Fixed bottom navigation across all viewports (`Home` far left, `Jobs` left of center, a central **Press-and-Hold Go Online/Go Offline** animated orb working from any page, `Payments` right of center, `Profile` far right) without a global top header bar, keeping live high-accuracy GPS tracking and Firestore listeners active across tab switches.
- **Live GPS Tracking & Reverse Geocoding**: Uses high-accuracy `watchPosition` movement + accuracy-refinement tracking while online, prevents stale background GPS pings from reverting an offline shift back to online, and reverse-geocodes live coordinates into the real street address and city (falling back to coordinates only when no street address is resolved).
- **Global Incoming Offer Overlay & Browser Notifications (`HelperOfferOverlay` + `sw-notifications.js`)**: Mirrors the mobile Helpers offer sheet on any page with live countdown color fill (green → amber → red), animated diagonal shimmer, timing indicator (`Now` / `Later`), active-job/verification guard, and instant `Accept` / `Decline`. Also fires a detailed browser notification via the PWA Service Worker (`ServiceWorkerRegistration.showNotification`) showing customer, area, payout, payment method, and request details, with inline **Accept** (accepts immediately and opens the app) and **Decline** (declines without navigating) action buttons on supported browsers plus click-to-open navigation.
- **Home (`/home`, `/workspace`, `/` when signed in)**: Clean shift greeting with real live city/street address, active job banner (when on a job), Quick Actions (`Add or Remove Services`, `Jobs & Activity`, `Payments & Earnings`), and conditional onboarding reminder when verification is incomplete.
- **Services (`/services`)**: Accessible from Profile Settings and Home Quick Actions to browse the live Firestore `serviceCatalog`, add/remove services, upload work portfolio photos, check approval statuses, and track per-option mastery badges (`Beginner`, `Verified`, `Specialist`, `Master`, `Legend`) and next-tier progress.
- **Jobs (`/jobs`, `/requests/:id`)**: Pending offers, active request workspace (trip status progression, directions, live WhatsApp bridge chat, in-app cancel dialog), and completed/historical job records.
- **Payments (`/payments`, `/profile/payouts`)**: Helper wallet balance, pending offers, incoming incomes & transaction activity, jobs & earnings history, and Paystack verified South African bank payout management.
- **Profile (`/profile`, `/profile/details`, `/profile/security`, `/profile/legal`, `/profile/badges`)**: Mobile-aligned helper identity & wallet/performance summary card, real reverse-geocoded live street address with manual refresh, conditional onboarding prompt (hidden once onboarding is complete), overall helper membership & top per-option mastery badges, Personal details, Service offerings, Security & police clearance, Agreement & legal, a plain-language **Badges & level guide** right before WhatsApp support, home-screen PWA install trigger, WhatsApp support link, and sign out.
- **Preserved 7-Step Onboarding Flow (`/onboarding` and step routes)** (accessible directly via URL and shown via missing-items banner only when incomplete):
  1. **Profile Basics**: Full name, individual or business details, home address, and WhatsApp phone linking.
  2. **Profile Selfie**: Camera capture or headshot upload.
  3. **Services & Portfolio**: Live catalog selection, work photo uploads, and per-option mastery badges for approved offerings.
  4. **Helper Agreement**: Active legal agreement viewer and electronic signature.
  5. **Police Clearance**: Private clearance certificate upload, status tracking, and signed viewing.
  6. **Bank Payouts**: South African bank selection and Paystack verification.
  7. **Verification Status**: Live readiness checklist and account activation status.
- **PWA Home-Screen Installation & Offline Support**: `vite-plugin-pwa` manifest and service worker, 192/512/maskable/Apple touch icons, offline banner, and an in-app install popup (`beforeinstallprompt` + iOS Add to Home Screen instructions).
- **Public Policies & POPIA Notices (`/privacy-policy`, `/terms`, `/payment-pricing-policy`, `/refund-policy`, `/data-voice-policy`)**: Accessible signed-out (from landing/auth) and signed-in (from `/profile/legal`).

## Commands

```bash
npm install
npm run dev
npm run build
```

`npm run build` outputs directly to `../helpers/dist` (including `manifest.webmanifest`, `sw.js`, and PWA icons) and copies `index.html` to `app.html` plus `/helpers/assets/bakayise-helpers-icon.jpg` to `/helpers/dist/helpers-mark.jpg`.
