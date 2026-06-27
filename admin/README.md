# Uncedo Admin App

This folder contains the standalone React + Vite admin application for Uncedo.

## Purpose

- Review and approve helper/provider services
- Publish and update the latest helper agreement version
- Inspect service photos and provider profiles
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

## Notes

- `admin/` is deployed as a separate Firebase Hosting site.
- The app reads provider and customer records from the shared `users` collection.
- Helper agreement publishing is handled through the dedicated helper agreement management screen and Cloud Function endpoints.
