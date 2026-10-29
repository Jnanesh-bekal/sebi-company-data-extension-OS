/* Shared constants. Loaded by the content script, service worker, popup, options page and Node tests. */
(function (root) {
  'use strict';
  const NISM = (root.NISM = root.NISM || {});

  // Not a secret: the spreadsheet ID is only used here to build the "Open Sheet" link.
  // The backend (apps-script/Code.gs) holds the authoritative copy and does all writing.
  const SPREADSHEET_ID = '1WQLu1zEHj5uJny8Vpmp86VFnhwB9Y9iWmqIvmWYgQbU';

  NISM.constants = Object.freeze({
    EXTENSION_NAME: 'NISM SEBI Data Collector',
    SPREADSHEET_ID,
    SHEET_NAME: 'SEBI Merchant Bankers',
    SHEET_URL: 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit',
    SEBI_DIRECTORY_URL: 'https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=9',

    SOURCE_IDS: Object.freeze({ SEBI_MERCHANT_BANKERS: 'sebi_merchant_bankers' }),

    // Spreadsheet column order. Do NOT change without a documented schema migration.
    HEADERS: Object.freeze([
      'Firm Name', 'SEBI Registration Number', 'Registered Email', 'Telephone', 'Fax Number',
      'Registered Address', 'Contact Person', 'Correspondence Address', 'Correspondence Email',
      'Correspondence Telephone', 'Correspondence Fax', 'Registration Validity', 'Source URL',
      'Captured Timestamp'
    ]),
    // Record keys for columns 1-12, in header order. Column 13 = sourceUrl, 14 = server timestamp.
    FIELD_KEYS: Object.freeze([
      'firmName', 'registrationNumber', 'registeredEmail', 'telephone', 'faxNumber',
      'registeredAddress', 'contactPerson', 'correspondenceAddress', 'correspondenceEmail',
      'correspondenceTelephone', 'correspondenceFax', 'registrationValidity'
    ]),
    MAX_FIELD_LENGTH: 2000,

    // Per-source registration number rules (mirrored in apps-script/Code.gs).
    REGISTRATION_PATTERNS: Object.freeze({ sebi_merchant_bankers: /^INM\d{9}$/ }),
    SOURCE_URL_PATTERN: /^https:\/\/(www\.)?sebi\.gov\.in\//,

    // https://script.google.com/macros/s/<id>/exec  or  .../a/macros/<domain>/s/<id>/exec
    ENDPOINT_URL_PATTERN: /^https:\/\/script\.google\.com\/(macros\/s\/|a\/macros\/[^/]+\/s\/)[A-Za-z0-9_-]+\/exec$/,

    STORAGE_KEYS: Object.freeze({ ENDPOINT: 'endpointUrl', LAST_CAPTURE: 'lastCapture' }),
    MESSAGES: Object.freeze({
      CAPTURE: 'NISM_CAPTURE',
      TEST_CONNECTION: 'NISM_TEST_CONNECTION',
      DIAGNOSTIC: 'NISM_DIAGNOSTIC'
    })
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = NISM.constants;
})(typeof self !== 'undefined' ? self : globalThis);
