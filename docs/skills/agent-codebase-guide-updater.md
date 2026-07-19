# Uncedo Codebase Guide Updater

AI agents (including Codex and Gemini) must run these steps to ensure the codebase guide remains fully accurate and up-to-date.

## Update Triggers

You MUST update the [agent-codebase-guide.md](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/docs/skills/agent-codebase-guide.md) in the following scenarios:
1. **New File Created**: When adding a new file under `uncedo/`, `helpers/`, `functions/`, `web/`, or `services/`.
2. **Logic Refactored / Relocated**: When existing business logic (such as billing formulas, OCR routing, or mapping tracking) is moved to a different file or component.
3. **New API / Cloud Function Added**: When registering a new rewrite target or endpoint in `firebase.json` or `functions/index.js`.
4. **Significant Client Screen Added**: When a new view or flow (e.g. new customer dashboard or helper job detail screen) is introduced.

---

## Action Steps for the Agent

1. **Locate the Codebase Guide**:
   Target file path: `docs/skills/agent-codebase-guide.md`
2. **Review your changes**:
   Identify which folder/section the changed or new files belong to.
3. **Format the Addition**:
   Use standard bullet points under the respective section. Include:
   * **File Path Link**: Clickable link in `[filename](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/...)` format.
   * **Purpose / Logic**: A concise explanation of the file's primary logic, API functions, or screens.
   * **Common Names**: Explain how the user refers to this file or screen in conversations.
4. **Save Changes**:
   Write/replace the contents in `docs/skills/agent-codebase-guide.md` using the proper file editing tools.
