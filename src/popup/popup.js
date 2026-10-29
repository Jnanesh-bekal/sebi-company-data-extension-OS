(function () {
  'use strict';
  const C = self.NISM.constants;
  const $ = (id) => document.getElementById(id);

  function setText(el, text, cls) { el.textContent = text; el.className = cls || ''; }

  async function render() {
    $('dest').textContent = 'Sheet tab “' + C.SHEET_NAME + '”';
    const sync = await chrome.storage.sync.get(C.STORAGE_KEYS.ENDPOINT);
    const url = sync[C.STORAGE_KEYS.ENDPOINT];
    if (url && !self.NISM.validation.endpointUrlError(url)) setText($('endpoint'), 'Configured ✓', 'ok');
    else setText($('endpoint'), 'Not configured — open Settings', 'warn');

    const local = await chrome.storage.local.get(C.STORAGE_KEYS.LAST_CAPTURE);
    const last = local[C.STORAGE_KEYS.LAST_CAPTURE];
    if (last) {
      const label = { saved: 'Saved', duplicate: 'Duplicate (skipped)' }[last.status] || 'Failed (' + last.status + ')';
      const who = [last.firmName, last.registrationNumber].filter(Boolean).join(' — ');
      setText($('last'), label + (who ? ': ' + who : '') + ' · ' + new Date(last.at).toLocaleString(),
        last.status === 'saved' ? 'ok' : (last.status === 'duplicate' ? '' : 'warn'));
    }
  }

  $('openSheet').addEventListener('click', () => chrome.tabs.create({ url: C.SHEET_URL }));
  $('openSebi').addEventListener('click', () => chrome.tabs.create({ url: C.SEBI_DIRECTORY_URL }));
  $('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

  // Read-only page check: asks the content script how many cards it recognised. Collects nothing.
  $('diagnose').addEventListener('click', async () => {
    const out = $('diag');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const res = await chrome.tabs.sendMessage(tab.id, { type: C.MESSAGES.DIAGNOSTIC });
      out.textContent = 'Recognised ' + res.cards + ' firm record(s); ' + res.unresolved + ' unidentified; ' +
        res.injectedButtons + ' button(s). First record fields found: ' + (res.fieldsFound.join(', ') || 'none') + '.';
    } catch (e) {
      out.textContent = 'This tab is not the SEBI Merchant Bankers page (or needs a refresh).';
    }
  });

  render();
})();
