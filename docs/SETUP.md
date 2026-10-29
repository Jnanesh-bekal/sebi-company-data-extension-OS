# Setup guide (beginner friendly)

Legend: **[ONCE]** one-time · **[REPEAT]** after code changes · **[GOOGLE AUTH]** needs your Google consent · **[NEW DEPLOY]** needs a new Apps Script version

## A. Project files [ONCE]
1. Install VS Code and Node.js (Node only for tests). Unzip `nism-sebi-data-collector.zip` to e.g. `Documents/nism-sebi-data-collector`.
2. In VS Code: File -> Open Folder -> that folder. (Everything is already created; to recreate by hand, copy each file listed in README.md.)
3. Optional: terminal -> `npm install` then `npm test` (all tests should pass).

## B. Backend (Google Apps Script) [ONCE]
4. Make sure the Google account you use in Chrome is an **Editor** of the placement spreadsheet (Share button in Sheets).
5. Open the spreadsheet -> **Extensions -> Apps Script** (this opens the editor).
6. Delete the sample code, paste all of `apps-script/Code.gs`. In *Project Settings* tick **Show "appsscript.json" manifest file**, open `appsscript.json` and paste the contents of `apps-script/appsscript.json`. Save.
7. Check `CONFIG.SPREADSHEET_ID` at the top of `Code.gs` matches your sheet (`1WQLu1zEHj5uJny8Vpmp86VFnhwB9Y9iWmqIvmWYgQbU`) — the destination tab name is set in `SOURCES`.
8. **[NEW DEPLOY][GOOGLE AUTH]** Click **Deploy -> New deployment -> gear icon -> Web app**. Set: *Execute as* **User accessing the web app**, *Who has access* **Anyone with Google account** (or your Workspace domain). Click Deploy, then **Authorize access**, choose your account, *Advanced -> Go to project (unsafe)* (it is your own script) -> Allow.
9. Copy the **Web app URL** (ends in `/exec`). Do not share it publicly. Open it once in a browser tab: you should see `{"status":"ok",...}`.
10. Optional extra lock: Project Settings -> Script properties -> add `ALLOWED_EMAILS` = `you@x.com, teammate@y.com`.
11. Each other committee member must open the same `/exec` URL once in their Chrome and authorize **[GOOGLE AUTH]**.

## C. Extension [ONCE]
12. Open `chrome://extensions`. 13. Turn on **Developer mode** (top right). 14. Click **Load unpacked** and select the project folder (the one containing `manifest.json`). Pin the extension (puzzle icon).
15. Click the extension -> **Settings**, paste the `/exec` URL, **Save**, then **Test connection** — it should say "Backend reachable as <your email>".

## D. First capture [ONCE]
16. Click **Open SEBI directory** in the popup. After the page loads you should see a navy **+ Capture to NISM Sheet** button under each firm. (Popup -> **Check this page** shows how many records were recognised.)
17. Click the button under ONE firm. It shows *Saving…* then *Saved ✓*. Open the sheet: tab `SEBI Merchant Bankers` now exists with 14 headers and one row.
18. Click the same firm's button again after refreshing the page: *Already captured — skipped*; the sheet still has one row.

## E. Logs and errors
19. Page-side: DevTools on the SEBI tab. Extension worker: `chrome://extensions` -> your extension -> **service worker** link. Backend: Apps Script editor -> **Executions**. See TROUBLESHOOTING.md.

## F. Updating [REPEAT]
20. Extension code changed: `chrome://extensions` -> **reload** icon, then refresh the SEBI tab.
21. `Code.gs` changed: paste it, Save, then **[NEW DEPLOY]** Deploy -> Manage deployments -> pencil -> Version: **New version** -> Deploy. The URL stays the same. (A *new deployment* creates a different URL; then update Settings.)

## G. Revoking / removing
22. Google: https://myaccount.google.com/permissions -> the script -> Remove access. Apps Script: Deploy -> Manage deployments -> Archive. Chrome: `chrome://extensions` -> Remove. Remove people's Editor access on the sheet to stop their writes.
