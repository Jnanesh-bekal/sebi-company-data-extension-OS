# NISM SEBI Data Collector

Chrome extension (Manifest V3) + Google Apps Script backend for the NISM PGDM Placement Committee.
You open the SEBI Merchant Bankers directory, click **+ Capture to NISM Sheet** under ONE firm, and that
firm's record is appended to the `SEBI Merchant Bankers` tab of the placement Google Sheet.

**It never scrapes in bulk.** No auto-capture, no auto-pagination, no messaging. One click = one record.

- Setup (beginners): `docs/SETUP.md`
- Backend + security model: `apps-script/README.md`
- Design: `docs/ARCHITECTURE.md` · Tests: `docs/TEST_PLAN.md` · Problems: `docs/TROUBLESHOOTING.md`

## Layout
```
manifest.json
src/background/serviceWorker.js    transport: re-validate, POST to Apps Script, relay result
src/content/                       per-card button, states, MutationObserver (attach-only)
src/extractors/sebiMerchantBankers.js   ALL SEBI-specific DOM logic (source adapter)
src/common/                        constants, normalization, validation (no DOM, shared)
src/popup/  src/options/           UI
apps-script/Code.gs appsscript.json    backend (duplicate check + insert under a lock)
tests/                             node:test unit tests (npm install && npm test)
docs/
```

## Dev workflow (VS Code / Windsurf / Devin)
1. `npm install` (only needed for tests; jsdom is a dev dependency, the extension itself has none).
2. `npm test` before every commit.
3. After editing extension files: `chrome://extensions` -> reload the extension, then refresh the SEBI tab.
4. After editing `apps-script/Code.gs`: paste into the Apps Script editor, then **Deploy -> Manage deployments -> Edit -> New version** (the URL stays the same).
5. Never change `HEADERS` / column order without a written migration plan and approval.
6. New source = new file in `src/extractors/` registering an adapter + a new entry in `SOURCES` in `Code.gs` + new `intmId`/URL match + manifest `js` list. Do not touch popup, transport or duplicate logic.

Never commit credentials. `.gitignore` already excludes common secret files. There are no secrets in this project by design.
