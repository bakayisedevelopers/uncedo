# Gemini Live Proxy (Cloud Run)

## Required env vars
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION` (optional, defaults to `us-central1`)
- `PORT` (Cloud Run injects this)

## Local dev
1. `cd services/gemini-live-proxy`
2. `npm install`
3. Authenticate Google Cloud locally (ADC) and set Firebase admin credentials if needed.
4. `npm run dev`

WebSocket endpoint:
- `ws://localhost:8080/live?sessionId=<id>&token=<firebase-id-token>`

## Notes
- Client never receives Gemini credentials.
- The proxy verifies Firebase ID token and session ownership.
- Only `sessionType: "ai"` sessions are accepted.
- Transcript and board actions are written to Firestore with throttling.
