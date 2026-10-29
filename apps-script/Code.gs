/**
 * NISM SEBI Data Collector — Google Apps Script backend.
 *
 * Deployment model (see README.md): web app, "Execute as: User accessing the web app",
 * "Who has access: Anyone with Google account". Every request therefore runs with the CALLER'S Google
 * identity, so the spreadsheet's own sharing settings decide who can write. A caller without edit access
 * to the sheet cannot write anything. Optionally restrict further with the ALLOWED_EMAILS script property.
 * No shared secret/token exists anywhere.
 *
 * Contract: POST body = JSON {action:'capture', source:'sebi_merchant_bankers', record:{...}}
 * Response: JSON {status, message, registrationNumber, firmName, [row], [timestamp]}
 * status: saved | duplicate | validation_error | invalid_payload | unauthorized | spreadsheet_error |
 *         schema_error | busy | error
 */

var CONFIG = {
  SPREADSHEET_ID: '1WQLu1zEHj5uJny8Vpmp86VFnhwB9Y9iWmqIvmWYgQbU',
  TIMEZONE: 'Asia/Kolkata',
  LOCK_WAIT_MS: 30000,
  MAX_FIELD_LENGTH: 2000
};

// Column order. Do NOT change without a documented schema migration.
var HEADERS = [
  'Firm Name', 'SEBI Registration Number', 'Registered Email', 'Telephone', 'Fax Number',
  'Registered Address', 'Contact Person', 'Correspondence Address', 'Correspondence Email',
  'Correspondence Telephone', 'Correspondence Fax', 'Registration Validity', 'Source URL',
  'Captured Timestamp'
];
var FIELD_KEYS = [
  'firmName', 'registrationNumber', 'registeredEmail', 'telephone', 'faxNumber',
  'registeredAddress', 'contactPerson', 'correspondenceAddress', 'correspondenceEmail',
  'correspondenceTelephone', 'correspondenceFax', 'registrationValidity'
];

// One entry per supported source. Add future sources here (with their own identity rule / tab).
var SOURCES = {
  sebi_merchant_bankers: {
    sheetName: 'SEBI Merchant Bankers',
    registrationPattern: /^INM\d{9}$/,
    sourceUrlPattern: /^https:\/\/(www\.)?sebi\.gov\.in\//
  }
};

// ---------- Web app entry points ----------

/** Health check used by the extension's "Test connection". Writes nothing. */
function doGet(e) {
  try {
    var denied = authorize_();
    if (denied) return json_(denied);
    return json_({ status: 'ok', message: 'NISM SEBI collector backend is reachable.', user: activeEmail_() });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ status: 'error', message: 'Unexpected server error. See the Apps Script Executions log.' });
  }
}

function doPost(e) {
  try {
    return json_(handleCapture_(e));
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ status: 'error', message: 'Unexpected server error. Nothing was confirmed as saved. See the Apps Script Executions log.' });
  }
}

// ---------- Core logic ----------

function handleCapture_(e) {
  var denied = authorize_();
  if (denied) return denied;

  var payload = parsePayload_(e);
  if (payload.error) return payload.error;

  var rules = SOURCES[payload.source];
  if (!rules) return result_('invalid_payload', 'Unknown source.', {});

  var clean = sanitizeRecord_(payload.record);
  if (clean.error) return clean.error;
  var rec = clean.record;

  if (!rec.registrationNumber) {
    return result_('validation_error', 'Registration number is missing. Record not saved.', rec);
  }
  if (!rules.registrationPattern.test(rec.registrationNumber)) {
    return result_('validation_error', 'Registration number is not in the expected format. Record not saved.', rec);
  }
  if (!rules.sourceUrlPattern.test(rec.sourceUrl)) {
    return result_('validation_error', 'Source URL is not an allowed page. Record not saved.', rec);
  }

  // Serialize "check duplicate, then insert" across ALL users/requests of this script.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_WAIT_MS)) {
    return result_('busy', 'The sheet is busy with another save. Please retry in a moment.', rec);
  }
  try {
    var ss;
    try {
      ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    } catch (err) {
      console.error('openById failed: ' + err);
      return result_('spreadsheet_error', 'Cannot open the spreadsheet. Make sure the signed-in Google account has edit access to it.', rec);
    }

    var ensured = ensureSheet_(ss, rules.sheetName);
    if (ensured.error) return result_(ensured.error.status, ensured.error.message, rec);
    var sheet = ensured.sheet;

    if (findRegistrationRow_(sheet, rec.registrationNumber) > 0) {
      return result_('duplicate', 'Already in the sheet — nothing was added.', rec);
    }

    var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
    var row = FIELD_KEYS.map(function (k) { return rec[k]; }).concat([rec.sourceUrl, timestamp]);
    var rowIndex = sheet.getLastRow() + 1;
    var range = sheet.getRange(rowIndex, 1, 1, HEADERS.length);
    range.setNumberFormat('@');            // keep IDs/phones/formula-like text as plain text
    range.setValues([row]);
    SpreadsheetApp.flush();

    // Confirm the write landed before telling the client it was saved.
    var written = normalizeReg_(sheet.getRange(rowIndex, 2).getDisplayValue());
    if (written !== rec.registrationNumber) {
      console.error('Write verification failed at row ' + rowIndex);
      return result_('error', 'The write could not be verified. Check the sheet before retrying.', rec);
    }
    var out = result_('saved', 'Saved to the NISM sheet.', rec);
    out.row = rowIndex;
    out.timestamp = timestamp;
    return out;
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return result_('error', 'The record could not be written. Nothing was confirmed as saved.', rec);
  } finally {
    lock.releaseLock();
  }
}

/** Optional allow-list: Script Property ALLOWED_EMAILS = "a@x.com, b@y.com". Unset = rely on sheet permissions. */
function authorize_() {
  var allowed = PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS');
  if (!allowed) return null;
  var email = activeEmail_().toLowerCase();
  var list = allowed.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (!email || list.indexOf(email) === -1) {
    return { status: 'unauthorized', message: 'This Google account is not allowed to use this backend.' };
  }
  return null;
}

function activeEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (err) { return ''; }
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return { error: result_('invalid_payload', 'Empty request body.', {}) };
  }
  var data;
  try { data = JSON.parse(e.postData.contents); }
  catch (err) { return { error: result_('invalid_payload', 'Request body is not valid JSON.', {}) }; }
  if (!data || data.action !== 'capture' || typeof data.source !== 'string' ||
      !data.record || typeof data.record !== 'object' || Array.isArray(data.record)) {
    return { error: result_('invalid_payload', 'Request must be {action:"capture", source, record}.', {}) };
  }
  return { source: data.source, record: data.record };
}

/** Whitelist + normalize + length-limit. Unknown keys are ignored; non-string values are rejected. */
function sanitizeRecord_(raw) {
  var rec = {};
  for (var i = 0; i < FIELD_KEYS.length; i++) {
    var key = FIELD_KEYS[i];
    var v = raw[key];
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') return { error: result_('invalid_payload', 'Field ' + key + ' must be text.', {}) };
    rec[key] = key === 'registrationNumber' ? normalizeReg_(v) : normalizeText_(v);
    if (rec[key].length > CONFIG.MAX_FIELD_LENGTH) {
      return { error: result_('invalid_payload', 'Field ' + key + ' is too long.', {}) };
    }
  }
  var url = raw.sourceUrl;
  rec.sourceUrl = typeof url === 'string' ? url.trim() : '';
  if (rec.sourceUrl.length > CONFIG.MAX_FIELD_LENGTH) {
    return { error: result_('invalid_payload', 'sourceUrl is too long.', {}) };
  }
  return { record: rec };
}

function normalizeText_(s) {
  return String(s).replace(/\u00a0/g, ' ').replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .split(/\r\n|\r|\n/)
    .map(function (l) { return l.replace(/[ \t\f\v]+/g, ' ').trim(); })
    .filter(function (l) { return l.length > 0; })
    .join(' ');
}
function normalizeReg_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[\s\u200b\u200c\u200d\ufeff]+/g, '').toUpperCase();
}

/** Returns {sheet} or {error:{status,message}}. Creates the tab/headers only when needed; never clears anything. */
function ensureSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    writeHeaders_(sheet);
    return { sheet: sheet };
  }
  if (sheet.getLastRow() === 0) {
    writeHeaders_(sheet);
    return { sheet: sheet };
  }
  var existing = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
  for (var i = 0; i < HEADERS.length; i++) {
    if (String(existing[i]).trim() !== HEADERS[i]) {
      return { error: { status: 'schema_error',
        message: 'Tab "' + name + '" has an unexpected header in column ' + (i + 1) + ' (expected "' + HEADERS[i] + '"). Nothing was written.' } };
    }
  }
  return { sheet: sheet };
}

function writeHeaders_(sheet) {
  var range = sheet.getRange(1, 1, 1, HEADERS.length);
  range.setNumberFormat('@');
  range.setValues([HEADERS]);
  range.setFontWeight('bold');
  sheet.setFrozenRows(1);
}

/** 1-based row number of the registration number in column B (data rows only), or 0. */
function findRegistrationRow_(sheet, registrationNumber) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var values = sheet.getRange(2, 2, last - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    if (normalizeReg_(values[i][0]) === registrationNumber) return i + 2;
  }
  return 0;
}

function result_(status, message, rec) {
  return { status: status, message: message,
    registrationNumber: (rec && rec.registrationNumber) || '', firmName: (rec && rec.firmName) || '' };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
