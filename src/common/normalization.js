/* Source-independent text/record normalization. No DOM access here. */
(function (root) {
  'use strict';
  const NISM = (root.NISM = root.NISM || {});

  /** Trim, drop zero-width chars, turn line breaks/runs of spaces into single spaces. Keeps punctuation as-is. */
  function normalizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
      .split(/\r\n|\r|\n/)
      .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
      .filter(Boolean)
      .join(' ');
  }

  /** Registration numbers are identifiers: remove ALL whitespace, uppercase, always a string. */
  function normalizeRegistrationNumber(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\s\u200b\u200c\u200d\ufeff]+/g, '').toUpperCase();
  }

  /** Build a complete record (all FIELD_KEYS present, '' when absent) from loosely-shaped input. */
  function normalizeRecord(raw) {
    const input = raw || {};
    const out = {};
    NISM.constants.FIELD_KEYS.forEach((key) => {
      out[key] = key === 'registrationNumber'
        ? normalizeRegistrationNumber(input[key])
        : normalizeText(input[key]);
    });
    return out;
  }

  NISM.normalization = Object.freeze({ normalizeText, normalizeRegistrationNumber, normalizeRecord });
  if (typeof module !== 'undefined' && module.exports) module.exports = NISM.normalization;
})(typeof self !== 'undefined' ? self : globalThis);
