const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/common/constants.js');
const N = require('../src/common/normalization.js');
const V = require('../src/common/validation.js');

test('schema has 14 headers and 12 field keys in the required order', () => {
  assert.strictEqual(C.HEADERS.length, 14);
  assert.strictEqual(C.HEADERS[0], 'Firm Name');
  assert.strictEqual(C.HEADERS[1], 'SEBI Registration Number');
  assert.strictEqual(C.HEADERS[13], 'Captured Timestamp');
  assert.strictEqual(C.FIELD_KEYS.length, 12);
});

test('normalizeText trims, collapses whitespace/newlines, keeps punctuation', () => {
  assert.strictEqual(N.normalizeText('  604 / 605,  Cosmos Plaza,,\n  Andheri (West) \r\n MUMBAI  '),
    '604 / 605, Cosmos Plaza,, Andheri (West) MUMBAI');
  assert.strictEqual(N.normalizeText(null), '');
  assert.strictEqual(N.normalizeText('a\u00a0b'), 'a b');
});

test('registration number: whitespace removed, uppercased, kept as string', () => {
  assert.strictEqual(N.normalizeRegistrationNumber(' inm 000012555 \n'), 'INM000012555');
  assert.strictEqual(typeof N.normalizeRegistrationNumber('INM000012555'), 'string');
  assert.strictEqual(N.normalizeRegistrationNumber(undefined), '');
});

test('normalizeRecord fills every key, never invents values', () => {
  const r = N.normalizeRecord({ firmName: ' AFCO ', registrationNumber: 'inm000012555' });
  assert.strictEqual(r.firmName, 'AFCO');
  assert.strictEqual(r.registrationNumber, 'INM000012555');
  assert.strictEqual(r.correspondenceEmail, '');
  assert.strictEqual(r.contactPerson, '');
  assert.deepStrictEqual(Object.keys(r), [...C.FIELD_KEYS]);
});

test('validateRecord: missing / malformed registration and bad source URL', () => {
  const ok = { registrationNumber: 'INM000012555', sourceUrl: 'https://www.sebi.gov.in/x' };
  assert.ok(V.validateRecord(ok, 'sebi_merchant_bankers').ok);
  const missing = V.validateRecord({ registrationNumber: '', sourceUrl: ok.sourceUrl }, 'sebi_merchant_bankers');
  assert.ok(!missing.ok);
  assert.strictEqual(missing.errors[0].code, 'missing_registration');
  assert.ok(!V.validateRecord({ registrationNumber: 'INP000001234', sourceUrl: ok.sourceUrl }, 'sebi_merchant_bankers').ok);
  assert.ok(!V.validateRecord({ registrationNumber: 'INM000012555', sourceUrl: 'https://evil.example/' }, 'sebi_merchant_bankers').ok);
  assert.ok(!V.validateRecord(ok, 'unknown_source').ok);
});

test('endpointUrlError', () => {
  assert.ok(V.endpointUrlError(''));
  assert.ok(V.endpointUrlError('http://script.google.com/macros/s/abc/exec'));
  assert.ok(V.endpointUrlError('https://example.com/macros/s/abc/exec'));
  assert.ok(V.endpointUrlError('https://script.google.com/macros/s/abc/dev'));
  assert.strictEqual(V.endpointUrlError('https://script.google.com/macros/s/AKfy_cb-12/exec'), '');
  assert.strictEqual(V.endpointUrlError('https://script.google.com/a/macros/nism.ac.in/s/AKfy_cb-12/exec'), '');
});
