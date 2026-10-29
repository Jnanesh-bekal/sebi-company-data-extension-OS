/*
 * Source adapter: SEBI "Merchant Bankers" directory (OtherAction.do?...intmId=9).
 *
 * DOM STRATEGY (label-based, because the live HTML could not be inspected from the build environment):
 *  1. Find "label elements": innermost elements whose entire text is one of the known labels
 *     ("Name", "Registration No.", "E-mail", ...). Class names / ids are never relied on.
 *  2. The value of a label is its next sibling element (skipping a ":" separator cell; climbing out of
 *     single-child wrappers such as <td><b>Name</b></td>).
 *  3. A record "card" is the smallest ancestor that contains exactly one "Name" label and exactly one
 *     "Registration No." label, expanded upwards while that remains true (so Validity etc. are included).
 *  4. If a card cannot be identified with confidence, NO button is attached (a warning badge is shown).
 *  5. Extraction is always scoped to the clicked card; it never reads the rest of the document.
 *
 * To add another source later, create a new file in src/extractors/ that pushes another adapter object
 * with the same interface (id, matches, findCards, extract) and list it in manifest.json.
 */
(function (root) {
  'use strict';
  const NISM = (root.NISM = root.NISM || {});
  const SOURCE_ID = 'sebi_merchant_bankers';

  const LABEL_TO_FIELD = {
    'name': 'firmName',
    'registration no.': 'registrationNumber',
    'registration no': 'registrationNumber',
    'e-mail': 'registeredEmail',
    'email': 'registeredEmail',
    'telephone': 'telephone',
    'fax no.': 'faxNumber',
    'fax no': 'faxNumber',
    'address': 'registeredAddress',
    'contact person': 'contactPerson',
    'correspondence address': 'correspondenceAddress',
    'correspondence e-mail': 'correspondenceEmail',
    'correspondence email': 'correspondenceEmail',
    'correspondence telephone': 'correspondenceTelephone',
    'correspondence fax': 'correspondenceFax',
    'validity': 'registrationValidity'
  };
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'BUTTON']);

  function labelKey(text) {
    return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().replace(/:$/, '').trim().toLowerCase();
  }
  function isOwnUi(el) { return !!(el.closest && el.closest('[data-nism-ui]')); }

  /** Value element for a label: next sibling (skipping ':' cells), climbing out of single-child wrappers. */
  function valueElementFor(labelEl) {
    let el = labelEl;
    while (el) {
      let next = el.nextElementSibling;
      while (next && next.hasAttribute('data-nism-ui')) next = next.nextElementSibling;
      if (next && next.textContent.trim() === ':') next = next.nextElementSibling;
      if (next) {
        // Never treat another label as this label's value (happens when the value cell is missing).
        return LABEL_TO_FIELD[labelKey(next.textContent)] ? null : next;
      }
      const parent = el.parentElement;
      if (!parent || parent.children.length !== 1) return null;
      el = parent;
    }
    return null;
  }

  /** Text of an element, keeping <br> as line breaks and ignoring our own injected UI. */
  function readText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    clone.querySelectorAll('[data-nism-ui]').forEach((n) => n.remove());
    return clone.textContent || '';
  }

  /** All label elements under root. Excludes search-form rows (value cell holds an input/select). */
  function findLabelElements(root_) {
    const out = [];
    root_.querySelectorAll('*').forEach((el) => {
      if (el.childElementCount > 1 || SKIP_TAGS.has(el.tagName)) return;
      const text = el.textContent;
      if (!text || text.length > 40) return;
      const key = LABEL_TO_FIELD[labelKey(text)];
      if (!key) return;
      // innermost only
      if (el.childElementCount === 1 && labelKey(el.firstElementChild.textContent) === labelKey(text)) return;
      if (isOwnUi(el)) return;
      const valueEl = valueElementFor(el);
      const isFormControl = !!(valueEl && (valueEl.matches('input,select,textarea') ||
        valueEl.querySelector('input,select,textarea')));
      if (isFormControl) return;
      out.push({ el, key, valueEl });
    });
    return out;
  }

  /** @returns {{cards: Array<{el:Element, registrationNumber:string}>, unresolved: number}} */
  function findCards(scope) {
    const labels = findLabelElements(scope);
    const names = labels.filter((l) => l.key === 'firmName');
    const regs = labels.filter((l) => l.key === 'registrationNumber');
    const count = (list, container) => list.filter((l) => container.contains(l.el)).length;
    const cards = [];
    let unresolved = 0;

    regs.forEach((reg) => {
      let anc = reg.el.parentElement;
      while (anc && count(names, anc) === 0) anc = anc.parentElement;
      if (!anc || !scope.contains(anc) || count(names, anc) !== 1 || count(regs, anc) !== 1) {
        unresolved += 1;
        return;
      }
      let card = anc;
      while (card.parentElement && card.parentElement !== scope && scope.contains(card.parentElement) &&
             card.parentElement !== document.documentElement &&
             count(names, card.parentElement) === 1 && count(regs, card.parentElement) === 1 &&
             !card.parentElement.querySelector('form')) {
        card = card.parentElement;
      }
      const regText = reg.valueEl ? NISM.normalization.normalizeRegistrationNumber(readText(reg.valueEl)) : '';
      cards.push({ el: card, registrationNumber: regText });
    });
    return { cards, unresolved };
  }

  /** Extract ONLY the given card. Returns {ok, record} or {ok:false, error}. */
  function extract(cardEl) {
    const labels = findLabelElements(cardEl);
    const raw = {};
    const duplicates = [];
    labels.forEach((l) => {
      if (Object.prototype.hasOwnProperty.call(raw, l.key)) { duplicates.push(l.key); return; }
      raw[l.key] = l.valueEl ? readText(l.valueEl) : '';
    });
    if (duplicates.length) {
      return { ok: false, error: 'Record is ambiguous (repeated labels: ' + duplicates.join(', ') + '). Nothing was captured.' };
    }
    return { ok: true, record: NISM.normalization.normalizeRecord(raw) };
  }

  function matches(url) {
    try {
      const u = new URL(url);
      if (!/(^|\.)sebi\.gov\.in$/.test(u.hostname)) return false;
      if (!u.pathname.includes('/sebiweb/other/OtherAction.do')) return false;
      const id = u.searchParams.get('intmId');
      return id === null || id === '9'; // other registers use other intmId values
    } catch (e) { return false; }
  }

  const adapter = { id: SOURCE_ID, label: 'SEBI Merchant Bankers', matches, findCards, extract, _internals: { labelKey, findLabelElements } };
  NISM.adapters = NISM.adapters || [];
  NISM.adapters.push(adapter);
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})(typeof self !== 'undefined' ? self : globalThis);
