/* Client-side validation. The backend re-validates everything; this just gives fast feedback. */
(function (root) {
  'use strict';
  const NISM = (root.NISM = root.NISM || {});

  function isValidRegistrationNumber(value, sourceId) {
    const pattern = NISM.constants.REGISTRATION_PATTERNS[sourceId];
    return !!pattern && pattern.test(String(value || ''));
  }

  /** @returns {{ok:boolean, errors:Array<{field:string, code:string, message:string}>}} */
  function validateRecord(record, sourceId) {
    const C = NISM.constants;
    const errors = [];
    if (!record || typeof record !== 'object') {
      return { ok: false, errors: [{ field: 'record', code: 'invalid_payload', message: 'Record is missing.' }] };
    }
    if (!C.REGISTRATION_PATTERNS[sourceId]) {
      errors.push({ field: 'source', code: 'unknown_source', message: 'Unknown source: ' + sourceId });
    }
    if (!record.registrationNumber) {
      errors.push({ field: 'registrationNumber', code: 'missing_registration',
        message: 'Registration number is missing, so this record cannot be saved.' });
    } else if (!isValidRegistrationNumber(record.registrationNumber, sourceId)) {
      errors.push({ field: 'registrationNumber', code: 'bad_registration',
        message: 'Registration number "' + record.registrationNumber + '" is not in the expected format.' });
    }
    if (!C.SOURCE_URL_PATTERN.test(String(record.sourceUrl || ''))) {
      errors.push({ field: 'sourceUrl', code: 'bad_source_url', message: 'Source URL must be a sebi.gov.in page.' });
    }
    C.FIELD_KEYS.forEach((key) => {
      if (typeof record[key] === 'string' && record[key].length > C.MAX_FIELD_LENGTH) {
        errors.push({ field: key, code: 'too_long', message: key + ' is unexpectedly long.' });
      }
    });
    return { ok: errors.length === 0, errors };
  }

  function endpointUrlError(url) {
    const value = String(url || '').trim();
    if (!value) return 'Enter the Apps Script web app URL.';
    if (!/^https:\/\//i.test(value)) return 'The URL must start with https://';
    if (!NISM.constants.ENDPOINT_URL_PATTERN.test(value)) {
      return 'This does not look like an Apps Script web app URL. It should look like https://script.google.com/macros/s/…/exec (ending in /exec, not /dev).';
    }
    return '';
  }

  NISM.validation = Object.freeze({ isValidRegistrationNumber, validateRecord, endpointUrlError });
  if (typeof module !== 'undefined' && module.exports) module.exports = NISM.validation;
})(typeof self !== 'undefined' ? self : globalThis);
