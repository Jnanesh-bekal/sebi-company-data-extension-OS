(function () {
  'use strict';
  const C = self.NISM.constants;
  const $ = (id) => document.getElementById(id);

  chrome.storage.sync.get(C.STORAGE_KEYS.ENDPOINT).then((s) => { $('endpoint').value = s[C.STORAGE_KEYS.ENDPOINT] || ''; });

  $('save').addEventListener('click', async () => {
    const url = $('endpoint').value.trim();
    const err = self.NISM.validation.endpointUrlError(url);
    $('error').textContent = err;
    if (err) { $('status').textContent = ''; return; }
    await chrome.storage.sync.set({ [C.STORAGE_KEYS.ENDPOINT]: url });
    $('status').textContent = 'Saved.';
  });

  $('test').addEventListener('click', async () => {
    $('error').textContent = '';
    $('status').textContent = 'Testing…';
    const res = await chrome.runtime.sendMessage({ type: C.MESSAGES.TEST_CONNECTION });
    $('status').textContent = res.status === 'ok'
      ? 'Backend reachable' + (res.user ? ' as ' + res.user : '') + '.'
      : 'Not OK (' + res.status + '): ' + (res.message || '');
  });
})();
