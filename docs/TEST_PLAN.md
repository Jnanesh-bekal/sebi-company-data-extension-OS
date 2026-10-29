# Test plan

## Automated (run with `npm install && npm test`) — executed during the build: 35/35 passed
| Test | Covered by | Status |
|---|---|---|
| A single record only | extractor tests (3 synthetic layouts) | **Run (synthetic DOM)** |
| B adjacent records | extractor tests | **Run (synthetic DOM)** |
| C duplicate (+ whitespace/case) | appsscript.test.js with fake Sheets | **Run (simulated Sheets)** |
| D missing optional fields | extractor + backend | **Run** |
| E missing registration | extractor, validation, backend | **Run** |
| G existing tabs untouched | fake Sheets | **Run (simulated)** |
| I repeated injection (own UI ignored) | extractor test of UI exclusion | **Partly run**; full MutationObserver loop needs a browser |
| K concurrent requests | lock-busy path + sequential retries | **Logic only**; true concurrency needs manual run |
| L source isolation | static test (no DOM in shared/transport) | **Run** |
| Manifest MV3/permissions/file refs | manifest test | **Run** |

## Manual browser checklist (NOT yet run — do these)
- [ ] F Backend unavailable: set a wrong `/exec` URL or go offline -> button shows *Failed — Retry*, never Saved; sheet unchanged.
- [ ] A/B on the live SEBI page: click firm A only; confirm exactly one new row, firm A's values.
- [ ] C: capture same firm twice (also after page refresh) -> *Already captured — skipped*, one row.
- [ ] D: capture a firm with no correspondence fields -> other fields present, blanks empty.
- [ ] E: (hard to force live) verify using the popup "Check this page" that all records have registration numbers.
- [ ] G: before testing, note other tabs; afterwards confirm they are unchanged.
- [ ] H: go to page 2 manually; buttons appear; nothing is captured automatically (sheet row count unchanged).
- [ ] I: use the A-Z letter filter / search; exactly one button per card.
- [ ] J: search the extension folder for tokens/keys (none); open the `/exec` URL in a private window -> must require Google sign-in, not return data; try with an account lacking sheet access -> `spreadsheet_error`.
- [ ] K: open two SEBI tabs, click the same firm in both within a second -> one row.
- [ ] Clicking a firm name link or the card does not trigger capture; clicking the button does not open the firm link.
- [ ] Phone numbers / registration numbers appear as text (no scientific notation).
