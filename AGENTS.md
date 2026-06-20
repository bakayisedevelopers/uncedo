# Repository Agent Instructions

Read this file first when working anywhere in the repository.

## Required Reading Order

1. Read this file.
2. Read the `README.md` in the folder you are editing.
3. Read the repo-wide skill docs in `docs/skills/`.
4. Read the app-specific `AGENTS.md` file if you are inside `web/`, `uncedo/`, or `helpers/`.

## Repo Map

- `web/`: React + Vite web application.
- `uncedo/`: Expo React Native student/customer app.
- `helpers/`: Expo React Native helper/provider app.
- `functions/`: Firebase Cloud Functions backend.
- `services/`: Supporting local services and proxies.
- `docs/skills/`: Agent workflow and codebase guidance.
- `releases/`: Generated Android release artifacts.

## Skill Docs

- `docs/skills/agent-codebase-guide.md`: Repo map and file-to-feature reference.
- `docs/skills/agent-developer-workflow.md`: Deployment, release, and commit-pruning workflow.
- `docs/skills/agent-codebase-guide-updater.md`: Rules for keeping the codebase guide current.

## Change Rules

- If you change app scope, folder structure, deployment steps, or release flow, update the matching README and the relevant skill doc.
- Keep edits scoped to the app or package you are working on unless the request explicitly spans the whole repo.
- Preserve the current product structure. Do not assume `Parakleo` references are errors unless the change request says to replace them.
