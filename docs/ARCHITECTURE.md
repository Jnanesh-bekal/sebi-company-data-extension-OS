# Architecture

```
SEBI page --(click on ONE card's button)--> content script
   extractor adapter (src/extractors/*)  -> raw labelled fields of that card only
   normalization + validation (src/common) -> record
   chrome.runtime.sendMessage --> service worker
        re-normalize + re-validate (does not trust the page), read endpoint from chrome.storage.sync
        fetch POST (credentials: include, text/plain body) --> Apps Script /exec
             auth (Google identity) -> validate -> LockService -> schema check -> duplicate check -> append -> verify
        <-- {status, message, registrationNumber, firmName}
   <-- status shown on that card: Saved ✓ / Already captured — skipped / Failed — Retry
```

## Separation
- **Source adapter** (`sebiMerchantBankers.js`): the only place that knows the SEBI DOM. Interface: `id, matches(url), findCards(root), extract(cardEl)`. New sources register another adapter in `NISM.adapters`.
- **Shared model** (`FIELD_KEYS`, `HEADERS`, normalization, validation): no DOM access (enforced by a test).
- **Transport** (service worker): knows nothing about SEBI.
- **Backend** (`Code.gs`): `SOURCES` table holds per-source sheet tab, identity regex and allowed URL. Duplicate logic is source-agnostic.

## DOM strategy (assumption — live DOM not inspected)
Label-based: innermost elements whose text equals `Name`, `Registration No.`, etc.; values = next sibling; card = smallest ancestor holding exactly one Name + one Registration No. label, expanded upward while that stays true. Search-form rows are excluded because their value cell holds an `<input>`. Verified against three synthetic layouts (div rows, table rows, definition list) in jsdom, not against the live site. If a card cannot be identified, no button is attached and a warning badge appears.

## Decisions
- Unique key: normalized registration number. Name alone is never a key.
- `INM\d{9}` enforced for this source so a different SEBI register (other `intmId`) cannot pollute the merchant-banker tab.
- Retry safety: the server is idempotent per registration number; a timed-out request can be retried.
- Cells are stored as text; timestamp is ISO 8601 with +05:30 generated on the server.
- Future sources without a SEBI number: add a source-specific identity (e.g. CIN/LinkedIn URL) via a new `SOURCES` entry and a documented schema extension (e.g. new trailing columns) with approval.
- Permissions: `storage`; hosts `script.google.com`, `script.googleusercontent.com` (Apps Script response), `accounts.google.com` (to recognise a sign-in redirect). No tabs/history/all-sites access.
