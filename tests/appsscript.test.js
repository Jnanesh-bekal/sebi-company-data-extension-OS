/* Runs apps-script/Code.gs in a Node vm with an in-memory fake of SpreadsheetApp/LockService/etc. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODE = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');
const HEADERS = ['Firm Name', 'SEBI Registration Number', 'Registered Email', 'Telephone', 'Fax Number', 'Registered Address', 'Contact Person',
  'Correspondence Address', 'Correspondence Email', 'Correspondence Telephone', 'Correspondence Fax', 'Registration Validity', 'Source URL', 'Captured Timestamp'];

function fakeSheet(rows) {
  const s = { rows: rows || [], writes: 0, frozen: 0 };
  s.getLastRow = () => s.rows.length;
  s.setFrozenRows = (n) => { s.frozen = n; };
  s.getRange = (r, c, nr = 1, nc = 1) => ({
    getDisplayValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => String((s.rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    getDisplayValue: () => String((s.rows[r - 1] || [])[c - 1] ?? ''),
    setValues: (v) => { s.writes++; v.forEach((row, i) => { s.rows[r - 1 + i] = row.slice(); }); },
    setNumberFormat() {}, setFontWeight() {}
  });
  return s;
}

function env(opts = {}) {
  const sheets = opts.sheets || {};
  const state = { locked: false, tryLockResult: opts.tryLock !== false, logs: [] };
  const sandbox = {
    console: { error: (...a) => state.logs.push(a.join(' ')), log() {} },
    JSON, Date, String, Array,
    SpreadsheetApp: {
      openById: (id) => {
        if (opts.openFails) throw new Error('No access');
        assert.strictEqual(id, '1WQLu1zEHj5uJny8Vpmp86VFnhwB9Y9iWmqIvmWYgQbU');
        return { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = fakeSheet()) };
      },
      flush() {}
    },
    LockService: { getScriptLock: () => ({ tryLock: () => state.tryLockResult, releaseLock: () => { state.released = true; } }) },
    Utilities: { formatDate: () => '2026-10-29T12:00:00+05:30' },
    Session: { getActiveUser: () => ({ getEmail: () => opts.email || 'me@example.com' }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'ALLOWED_EMAILS' ? opts.allowed || null : null) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) }
  };
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox);
  const post = (body) => JSON.parse(sandbox.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  return { sandbox, sheets, state, post, get: () => JSON.parse(sandbox.doGet({}).text) };
}

const rec = (o = {}) => Object.assign({ firmName: 'AFCO CAPITAL INDIA PVT LTD', registrationNumber: 'INM000012555', registeredEmail: 'capital@afcogroup.in',
  telephone: '912226378100', registeredAddress: '604 / 605, Cosmos Plaza', contactPerson: 'Snehal Vishwakarma', registrationValidity: 'Aug 09, 2018 - Perpetual',
  sourceUrl: 'https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=9' }, o);
const req = (r) => ({ action: 'capture', source: 'sebi_merchant_bankers', record: r });

test('creates the tab with exact headers, inserts one row, server timestamp, text-preserved values', () => {
  const e = env();
  const res = e.post(req(rec()));
  assert.strictEqual(res.status, 'saved');
  const sheet = e.sheets['SEBI Merchant Bankers'];
  assert.strictEqual(JSON.stringify(sheet.rows[0]), JSON.stringify(HEADERS));
  assert.strictEqual(sheet.rows.length, 2);
  assert.strictEqual(sheet.rows[1][1], 'INM000012555');
  assert.strictEqual(sheet.rows[1][2], 'capital@afcogroup.in');
  assert.strictEqual(sheet.rows[1][7], '');          // absent correspondence stays empty
  assert.strictEqual(sheet.rows[1][13], '2026-10-29T12:00:00+05:30');
  assert.ok(e.state.released);
});

test('Test C: duplicate (even with whitespace/case differences) inserts nothing', () => {
  const e = env();
  assert.strictEqual(e.post(req(rec())).status, 'saved');
  assert.strictEqual(e.post(req(rec())).status, 'duplicate');
  assert.strictEqual(e.post(req(rec({ registrationNumber: ' inm 000012555 ' }))).status, 'duplicate');
  assert.strictEqual(e.sheets['SEBI Merchant Bankers'].rows.length, 2);
});

test('same name, different registration number is NOT a duplicate', () => {
  const e = env();
  e.post(req(rec()));
  assert.strictEqual(e.post(req(rec({ registrationNumber: 'INM000099999' }))).status, 'saved');
  assert.strictEqual(e.sheets['SEBI Merchant Bankers'].rows.length, 3);
});

test('Test E: missing/invalid registration inserts nothing', () => {
  const e = env();
  assert.strictEqual(e.post(req(rec({ registrationNumber: '' }))).status, 'validation_error');
  assert.strictEqual(e.post(req(rec({ registrationNumber: 'INP000000001' }))).status, 'validation_error');
  assert.strictEqual(e.sheets['SEBI Merchant Bankers'], undefined);
});

test('invalid payloads are rejected without touching the sheet', () => {
  const e = env();
  assert.strictEqual(e.post('not json').status, 'invalid_payload');
  assert.strictEqual(e.post({ action: 'delete' }).status, 'invalid_payload');
  assert.strictEqual(e.post({ action: 'capture', source: 'nope', record: rec() }).status, 'invalid_payload');
  assert.strictEqual(e.post(req(rec({ firmName: 5 }))).status, 'invalid_payload');
  assert.strictEqual(e.post(req(rec({ sourceUrl: 'https://evil.example/' }))).status, 'validation_error');
  assert.strictEqual(e.post(req(rec({ registeredAddress: 'x'.repeat(2001) }))).status, 'invalid_payload');
  assert.strictEqual(e.sheets['SEBI Merchant Bankers'], undefined);
  assert.strictEqual(e.sandbox.doPost({}).text.includes('invalid_payload'), true);
});

test('spreadsheet access failure returns a useful error and releases the lock', () => {
  const e = env({ openFails: true });
  const res = e.post(req(rec()));
  assert.strictEqual(res.status, 'spreadsheet_error');
  assert.ok(e.state.released);
});

test('Test K (logic): lock not acquired -> busy, nothing written; retry after is safe', () => {
  const sheets = {};
  const busy = env({ sheets, tryLock: false });
  assert.strictEqual(busy.post(req(rec())).status, 'busy');
  assert.strictEqual(sheets['SEBI Merchant Bankers'], undefined);
  const ok = env({ sheets });
  assert.strictEqual(ok.post(req(rec())).status, 'saved');
  assert.strictEqual(ok.post(req(rec())).status, 'duplicate');
});

test('Test G: existing tabs are untouched; existing correct tab is appended to, never cleared', () => {
  const other = fakeSheet([['keep', 'me']]);
  const mine = fakeSheet([HEADERS.slice(), ['Old Firm', 'INM000000001']]);
  const e = env({ sheets: { 'Sheet1': other, 'SEBI Merchant Bankers': mine } });
  assert.strictEqual(e.post(req(rec())).status, 'saved');
  assert.deepStrictEqual(other.rows, [['keep', 'me']]);
  assert.strictEqual(other.writes, 0);
  assert.deepStrictEqual(mine.rows[1], ['Old Firm', 'INM000000001']);
  assert.strictEqual(mine.rows.length, 3);
  assert.strictEqual(e.post(req(rec({ registrationNumber: 'INM000000001' }))).status, 'duplicate');
});

test('existing tab with wrong headers -> schema_error, nothing written', () => {
  const bad = fakeSheet([['Wrong', 'Headers'], ['x', 'y']]);
  const e = env({ sheets: { 'SEBI Merchant Bankers': bad } });
  assert.strictEqual(e.post(req(rec())).status, 'schema_error');
  assert.strictEqual(bad.rows.length, 2);
  assert.strictEqual(bad.writes, 0);
});

test('allow-list: unlisted account is rejected; listed account works; unset = no extra restriction', () => {
  assert.strictEqual(env({ allowed: 'a@x.com', email: 'z@x.com' }).post(req(rec())).status, 'unauthorized');
  assert.strictEqual(env({ allowed: 'A@x.com, b@x.com', email: 'a@X.com' }).post(req(rec())).status, 'saved');
  assert.strictEqual(env({ allowed: 'a@x.com', email: 'z@x.com' }).get().status, 'unauthorized');
  assert.strictEqual(env().get().status, 'ok');
});

test('formula-like text is stored verbatim (plain-text format), not trimmed of meaning', () => {
  const e = env();
  e.post(req(rec({ contactPerson: '=HYPERLINK("http://x")' })));
  assert.strictEqual(e.sheets['SEBI Merchant Bankers'].rows[1][6], '=HYPERLINK("http://x")');
});

test('Test L: SEBI-specific DOM code is isolated from shared/transport modules', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  for (const f of ['src/common/constants.js', 'src/common/normalization.js', 'src/common/validation.js', 'src/background/serviceWorker.js']) {
    assert.ok(!/querySelector|document\./.test(read(f)), f + ' must not touch the DOM');
  }
  assert.ok(!/Registration No\.|merchant/i.test(read('src/background/serviceWorker.js')));
});

test('manifest is MV3 with minimal permissions', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  assert.strictEqual(m.manifest_version, 3);
  assert.deepStrictEqual(m.permissions, ['storage']);
  assert.ok(m.host_permissions.every((h) => /google\.com|googleusercontent\.com/.test(h)));
  assert.ok(m.content_scripts[0].matches.every((x) => x.includes('sebi.gov.in')));
  for (const f of [...m.content_scripts[0].js, ...m.content_scripts[0].css, m.background.service_worker, m.action.default_popup, m.options_ui.page]) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', f)), 'missing ' + f);
  }
});
