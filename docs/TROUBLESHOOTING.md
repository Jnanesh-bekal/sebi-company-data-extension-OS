# Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| No buttons on SEBI page | Not on the Merchant Bankers URL (`intmId=9`); extension not reloaded; refresh. Click popup -> **Check this page**. If "0 records", the live DOM differs from the assumptions: open DevTools on a card, note the HTML around `Name` / `Registration No.`, and adjust `src/extractors/sebiMerchantBankers.js` (and add a test). The site may also put the list inside an iframe (then add `"all_frames": true` and the iframe URL to `matches`). |
| Badge "N record(s) could not be identified" | Duplicate/hidden copies of cards or flat markup with no card boundary. Capture is disabled for them by design. |
| "Backend URL is not set" | Settings -> paste URL ending `/exec`. |
| "Google returned a sign-in/authorization page" (auth_required) | Open the `/exec` URL in Chrome, sign in with the account that edits the sheet and authorize. Make that account Chrome's default Google account (profile with multiple accounts can send the wrong one). |
| `spreadsheet_error` | Signed-in account lacks Editor access to the sheet, or wrong spreadsheet ID. |
| `unauthorized` | Account not in `ALLOWED_EMAILS`. |
| `schema_error` | The tab already exists with different headers. Fix the header row or rename the old tab yourself (the extension will never do it). |
| `busy` | Another save holds the lock; retry. |
| "Could not reach the backend" | Offline, URL typo, deployment archived, or Google sign-in redirect blocked. Nothing was saved. |
| "Timed out … may or may not have been saved" | Check the sheet; retrying is safe (duplicates blocked). |
| Changes to Code.gs not taking effect | You must deploy a **new version** of the existing deployment (`/exec` runs the deployed version, `/dev` the latest code). |
| "Extension was reloaded" | Refresh the SEBI tab. |
| Logs | SEBI tab DevTools (content), `chrome://extensions` -> service worker (transport), Apps Script -> Executions (backend). |
