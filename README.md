# Uncedo Monorepo

Uncedo is a monorepo for a tutoring and service platform with three active client apps, a public website, a Firebase backend, and supporting services.

## Top-Level Layout

```txt
.
|-- AGENTS.md
|-- docs/skills/
|-- functions/
|-- admin/
|-- helpers/
|-- releases/
|-- services/
|-- uncedo/
\-- web/
```

## What Each Folder Contains

- `web/`: React + Vite public website containing the landing page plus privacy and terms pages.
- `admin/`: React + Vite admin console for provider moderation, service approvals, and customer review.
- `uncedo/`: Expo React Native app for the student/customer experience.
- `helpers/`: Expo React Native app for the helper/provider experience.
- `functions/`: Firebase Cloud Functions for secure billing, payouts, agreements, matching orchestration, and backend endpoints that must stay server-side.
- `services/`: Supporting local services. AI-specific proxy services have been removed.
- `docs/skills/`: Repo-level agent guidance and workflow docs.
- `releases/`: Generated Android release builds for distribution.

## Agent Bootstrap

If you are an automated agent, read these files in order before making changes:

1. `AGENTS.md`
2. The `README.md` in the folder you are editing
3. `docs/skills/agent-codebase-guide.md`
4. `docs/skills/agent-developer-workflow.md` when deployment or release steps are involved

## Common Commands

### Web app

```powershell
cd web
npm install
npm run dev
```

### Admin app

```powershell
cd admin
npm install
npm run dev
```

### Student app

```powershell
cd uncedo
npm install
npm run start
```
cd helpers\android .\gradlew installDebug
npm start

Switch to same-Wi‑Fi / wireless ADB
With the phone still connected once by USB:

adb devices
adb tcpip 5555
adb shell ip addr show wlan0
### Helper app

```powershell
cd helpers
npm install
npm run start
```

### Firebase functions

```powershell
cd functions
npm install
firebase deploy --only functions
```

## Notes

- The repository still contains some legacy `Parakleo` strings in code and UI copy. Those are historical product labels, not a separate repo.
- Keep folder-level README files and agent instructions aligned when app structure or responsibilities change.
