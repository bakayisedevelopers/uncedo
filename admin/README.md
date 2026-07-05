# Uncedo Admin App

This folder contains the standalone React + Vite admin application for Uncedo.

## Purpose

- Review and approve helper services
- Manage the live Firestore service catalog, custom bundle-style services, backend pricing inputs, intake questions, per-service image galleries, and bulk admin-uploaded service images
- Publish and update the latest helper agreement version
- Inspect service photos and helper profiles
- Suspend, restore, or remove service access
- View customer profiles and location data that is stored in Firestore
- Sign in with Firebase Authentication

## Stack

- React
- Vite
- React Router
- Firebase client SDK
- Tailwind CSS

## Scripts

```powershell
npm install
npm run dev
npm run build
npm run preview
```

## Environment

The app expects the usual `VITE_FIREBASE_*` environment variables that point at the shared Uncedo Firebase project.
AI-assisted service creation also expects the backend Firebase Functions runtime to expose `GEMINI_API_KEY` and optional `GEMINI_MODEL` env vars.

## Notes

- `admin/` is deployed as a separate Firebase Hosting site.
- The app reads helper and customer records from the shared `users` collection.
- Service catalog data is stored in the shared `serviceCatalog` collection, with service images uploaded to Firebase Storage.
- The create-service flow can request an AI-generated draft from Firebase Functions before the admin reviews pricing and questionnaire details.
- The services area includes both per-service image uploads and a bulk uploader that stages multiple pictures locally, then assigns each uploaded image to one or more services before saving.
- Helper agreement publishing is handled through the dedicated helper agreement management screen with direct Firestore version publishing and helper re-acceptance invalidation.
- Admin helper-approval and service-catalog saves now trigger client-side reconciliation nudges for active `serviceRequests`, replacing the removed scheduled backend reconciliation pass.
