/* Transport layer: validates again, POSTs ONE record to the configured Apps Script endpoint, relays the result. */
importScripts('../common/constants.js', '../common/normalization.js', '../common/validation.js');

const { MESSAGES, STORAGE_KEYS, SOURCE_IDS } = self.NISM.constants;
const REQUEST_TIMEOUT_MS = 45000; // backend waits up to 30 s for its lock
const KNOWN_SOURCES = new Set(Object.values(SOURCE_IDS));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error('[NISM] unexpected error', err);
      sendResponse({ status: 'error', message: 'Unexpected extension error: ' + err.message });
    });
  return true; // async response
});

async function handleMessage(msg, sender) {
  if (!msg || sender.id !== chrome.runtime.id) return { status: 'error', message: 'Rejected message.' };
  if (msg.type === MESSAGES.CAPTURE) {
    // Only accept captures that come from a content script running on sebi.gov.in.
    if (!sender.tab || !self.NISM.constants.SOURCE_URL_PATTERN.test(String(sender.url || ''))) {
      return { status: 'error', message: 'Captures are only accepted from the SEBI website.' };
    }
    return capture(msg);
  }
  if (msg.type === MESSAGES.TEST_CONNECTION) {
    if (!String(sender.url || '').startsWith(chrome.runtime.getURL(''))) return { status: 'error', message: 'Rejected.' };
    return testConnection();
  }
  return { status: 'error', message: 'Unknown message type.' };
}

async function getEndpoint() {
  const stored = await chrome.storage.sync.get(STORAGE_KEYS.ENDPOINT);
  const url = String(stored[STORAGE_KEYS.ENDPOINT] || '').trim();
  return url && !self.NISM.validation.endpointUrlError(url) ? url : '';
}

async function capture(msg) {
  const sourceId = msg.source;
  if (!KNOWN_SOURCES.has(sourceId)) return remember({ status: 'invalid_payload', message: 'Unknown source.' });

  // Re-normalize and re-validate: never trust the content script blindly.
  const record = self.NISM.normalization.normalizeRecord(msg.record);
  record.sourceUrl = String((msg.record && msg.record.sourceUrl) || '').trim();
  const check = self.NISM.validation.validateRecord(record, sourceId);
  if (!check.ok) {
    return remember({ status: 'validation_error', message: check.errors.map((e) => e.message).join(' '),
      registrationNumber: record.registrationNumber, firmName: record.firmName });
  }

  const endpoint = await getEndpoint();
  if (!endpoint) {
    return remember({ status: 'not_configured', message: 'Backend URL is not set. Open the extension options and paste the Apps Script URL.',
      registrationNumber: record.registrationNumber, firmName: record.firmName });
  }

  const result = await request(endpoint, {
    method: 'POST',
    body: JSON.stringify({ action: 'capture', source: sourceId, record })
  });
  if (!result.registrationNumber) result.registrationNumber = record.registrationNumber;
  if (!result.firmName) result.firmName = record.firmName;
  return remember(result);
}

async function testConnection() {
  const endpoint = await getEndpoint();
  if (!endpoint) return { status: 'not_configured', message: 'Save a valid backend URL first.' };
  return request(endpoint, { method: 'GET' });
}

/** One fetch with timeout. Always resolves to {status, message, ...}; never fakes success. */
async function request(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const options = { method: init.method, credentials: 'include', redirect: 'follow', signal: controller.signal };
    if (init.body) {
      options.body = init.body;
      options.headers = { 'Content-Type': 'text/plain;charset=utf-8' }; // simple request: no CORS preflight
    }
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
    if (!data || typeof data.status !== 'string') {
      if (/accounts\.google\.com|<html|<!doctype/i.test(text)) {
        return { status: 'auth_required', message: 'Google returned a sign-in/authorization page. Sign in to the correct Google account in Chrome and authorize the backend (see docs/SETUP.md, step 8).' };
      }
      return { status: 'bad_response', message: 'Unexpected response from backend (HTTP ' + response.status + ').' };
    }
    return data;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return { status: 'network_error', message: 'Timed out. The record may or may not have been saved; retrying is safe because duplicates are blocked on the server.' };
    }
    return { status: 'network_error', message: 'Could not reach the backend. Check internet, Google sign-in and the URL. Nothing was saved.' };
  } finally {
    clearTimeout(timer);
  }
}

async function remember(result) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.LAST_CAPTURE]: {
      status: result.status, message: result.message || '', firmName: result.firmName || '',
      registrationNumber: result.registrationNumber || '', at: new Date().toISOString()
    } });
  } catch (e) { /* non-critical */ }
  return result;
}
