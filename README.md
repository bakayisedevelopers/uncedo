# Parakleo Monorepo Structure

This repository is organized with top-level folders for web, mobile, shared code, and Firebase functions:

- `web/` — React + Vite web app (current production app)
- `mobile/` — Expo-based React Native starter app
- `shared/` — shared code placeholder for cross-platform modules
- `functions/` — Firebase Cloud Functions (kept at root intentionally)

## Directory Layout

```txt
.
├── web/
├── mobile/
├── shared/
├── functions/
├── firebase.json
└── docs/
```

## Quick Start

### Web app
```bash
cd web
npm install
npm run dev
```

### Firebase Functions
```bash
cd functions
npm install
npm test
```

### Mobile starter (Expo)
```bash
cd mobile
npm install
npm run start
```

## Firebase deployment note

`firebase.json` stays at the repo root and keeps `functions/` as the functions source. Hosting now serves from `web/dist`.
