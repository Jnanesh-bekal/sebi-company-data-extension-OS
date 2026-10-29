# Apps Script backend

## Authentication model (the important part)
A secret token inside a Chrome extension is NOT secret (anyone can open the extension's files), and a web app
deployed as "Execute as me / Anyone, even anonymous" would let anybody on the internet write to the sheet.
So this backend uses **Google identity instead of a shared secret**:

| Setting | Value | Why |
|---|---|---|
| Execute as | **User accessing the web app** | Each request runs as the caller's own Google account |
| Who has access | **Anyone with Google account** (use *Anyone within <your domain>* if NISM uses Google Workspace) | A Google login is required; anonymous callers are refused |
| Real authorization | The **sheet's Share settings** | A caller without Editor access to the spreadsheet gets `spreadsheet_error` and nothing is written |
| Optional allow-list | Script property `ALLOWED_EMAILS` (comma-separated) | Extra guard even for people who have sheet access |

Consequences:
- Every committee member who captures must be an **Editor** of the sheet, sign in to Chrome with that Google
  account (as the default account), and authorize the script once.
- Permissions requested: view/edit your spreadsheets (`spreadsheets` — Apps Script cannot offer a narrower scope for `openById`) and your email address (for the allow-list). The code only touches the one hard-coded spreadsheet ID.
- Revoke: https://myaccount.google.com/permissions -> remove the script; or Deploy -> Manage deployments -> archive; or remove someone's Editor access on the sheet.
- To prevent unauthorized writes: keep the sheet's sharing tight, set `ALLOWED_EMAILS`, never switch the deployment to "Anyone, even anonymous".
- Anyone who reads `Code.gs` learns only the spreadsheet ID, which is useless without edit access.

**Not verified here:** the extension sends the request with your Chrome Google cookies (`credentials: 'include'`).
This is the standard way a signed-in extension calls a restricted web app, but it was not run end-to-end in the
build environment. Multi-account Chrome profiles can break it (see docs/TROUBLESHOOTING.md). If it fails for your
setup, the fallback is Google OAuth via `chrome.identity` + the Sheets API, which loses the shared script lock.

## Behaviour
- POST `{action:'capture', source:'sebi_merchant_bankers', record:{...}}` (text/plain body, JSON content).
- `saved` -> one row appended. `duplicate` -> nothing written. `validation_error` / `invalid_payload` -> nothing written.
- Registration number (normalized: no spaces, uppercase) is the unique key; checked inside `LockService.getScriptLock()` so concurrent requests cannot both insert.
- Server timestamp, Asia/Kolkata, e.g. `2026-10-29T14:03:11+05:30`.
- Creates the tab + headers if missing. If the tab exists with different headers -> `schema_error`, nothing written. Never clears/renames/deletes anything.
- Row cells are written as plain text so registration numbers and phone numbers are never converted and `=...` text is never executed.
