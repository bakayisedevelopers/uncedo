# WhatsApp template management

`functions/whatsapp/templateManagement.js` is a direct Meta Graph API client for listing WhatsApp templates, checking their approval state and sender compatibility, submitting explicitly approved missing templates, and generating a Firebase `.env` snippet containing only compatible `APPROVED` templates.

The safe default is preview-only. Preview reads no credentials and makes no network request:

```sh
cd functions
npm run whatsapp:templates -- --preview
```

The generated proposal is checked into `template-catalogue.preview.json`. It is a payload preview, not evidence that Meta has approved any template.

## Configuration required for live management

Keep these values in the ignored `functions/.env` file or the Codex Cloud workspace's secure environment injection. The utility auto-loads `functions/.env` under the configured Node.js 22 runtime and never prints credential values.

```dotenv
META_WABA_ID=...
WHATSAPP_ACCESS_TOKEN=...
GRAPH_API_VERSION=vNN.N
WHATSAPP_TEMPLATE_LANGUAGE=en_US
```

The access token must be allowed to manage templates for the specified WABA (`whatsapp_business_management`) and the WABA must be assigned to the Meta app/token. The utility does not introspect token permissions. A Phone Number ID is not needed to manage templates; it remains required by Uncedo's message sender. Actual sending also needs the appropriate WhatsApp messaging permission. The utility does not use `META_APP_SECRET`.

## Read-only Meta operations

```sh
npm run whatsapp:templates -- --list
npm run whatsapp:templates -- --check
```

`--list` shows safe template metadata and statuses. `--check` also prints the generated Firebase configuration. Copy that output into `functions/.env` only after reviewing it; the utility does not alter configuration automatically. The allowlist includes only catalogue entries that are both `APPROVED` and structurally compatible.

## Explicitly approved submission

Submitting is intentionally separate. Each exact template name must be approved on the command line, and the WABA ID must be re-entered to confirm the target:

```sh
npm run whatsapp:templates -- --submit \
  --approve-template uncedo_helper_offer \
  --confirm-waba '<exact META_WABA_ID>'
```

Do not run that command until the template payload has been reviewed and submission is explicitly authorized. The utility lists existing templates first, does not replace existing rejected/incompatible names, and never automatically retries a template-create POST after an uncertain response. Use `--check` later to retrieve approval status and regenerate the approved-only configuration.

## Proposed minimum catalogue

The catalogue has five distinct templates:

| Name | Meta category | Sender contract |
|---|---|---|
| `uncedo_auth_otp` | Authentication | One body parameter for the OTP and a COPY_CODE OTP button. The current backend sends the OTP as one body parameter. |
| `uncedo_helper_offer` | Utility | Two ordered body parameters and quick replies in the exact `Accept`, `Decline` order. Current send code supplies dynamic payloads for buttons 0 and 1. |
| `uncedo_support_reply` | Utility | One body parameter containing the human support reply. |
| `uncedo_service_update` | Utility | Two ordered body parameters, reusable by the eight booking/service/payment status configuration slots. |
| `uncedo_cash_confirmation` | Utility | Request reference then amount; body only, no buttons. Outside the service window, the current backend sends no button payload. The text instructs the helper to reply using the text command supported by the current backend. |

Utility template body parameters must not be the first or last body content. The generated support-reply and service-update copy includes fixed text after the parameter so Meta can review a complete template message.

The proposal defaults to `en_US`. The language is compared exactly with the Meta listing and copied to each existing Firebase language setting. Meta remains authoritative for approval and final category decisions.

The utility does not submit templates or contact Meta in preview mode. No live Meta validation is performed by the unit tests.
