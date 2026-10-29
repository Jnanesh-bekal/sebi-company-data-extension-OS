/*
 * Content script. Adds one "+ Capture to NISM Sheet" button per identifiable firm card.
 * Extraction happens ONLY inside the click handler of a specific card's button.
 * The MutationObserver only re-attaches buttons; it never captures, navigates or paginates.
 */
(function () {
  'use strict';
  const NISM = self.NISM;
  const { MESSAGES } = NISM.constants;
  const adapter = (NISM.adapters || []).find((a) => a.matches(location.href));
  if (!adapter) return;

  const UI_ATTR = 'data-nism-ui';
  const TEXT = {
    idle: '+ Capture to NISM Sheet', saving: 'Saving…', saved: 'Saved ✓',
    duplicate: 'Already captured — skipped', failed: 'Failed — Retry'
  };
  const uiByCard = new WeakMap();
  let scanTimer = null;
  let lastScan = { cards: 0, unresolved: 0 };

  // Remove leftovers from a previous (stale) instance of this script, e.g. after reloading the extension.
  document.querySelectorAll('[' + UI_ATTR + ']').forEach((n) => n.remove());

  function setState(ui, state, message) {
    ui.state = state;
    ui.btn.textContent = TEXT[state];
    ui.btn.dataset.state = state;
    ui.btn.disabled = state === 'saving' || state === 'saved' || state === 'duplicate';
    ui.msg.textContent = message || '';
    ui.msg.dataset.state = state;
  }

  function createUi(card) {
    const wrap = document.createElement('div');
    wrap.setAttribute(UI_ATTR, '1');
    wrap.className = 'nism-capture-ui';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nism-capture-btn';
    const msg = document.createElement('span');
    msg.className = 'nism-capture-msg';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    wrap.append(btn, msg);

    const ui = { root: wrap, wrap, btn, msg, state: 'idle', reg: card.registrationNumber, cardEl: card.el };
    setState(ui, 'idle');
    // Never let clicks reach the SEBI card / firm links underneath.
    ['click', 'mousedown', 'mouseup', 'dblclick'].forEach((t) => wrap.addEventListener(t, (e) => e.stopPropagation()));
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onCapture(ui); });
    return ui;
  }

  function place(ui) {
    const el = ui.cardEl;
    const tag = el.tagName;
    if (tag === 'TABLE') {
      el.insertAdjacentElement('afterend', ui.wrap);
    } else if (tag === 'TBODY' || tag === 'THEAD' || tag === 'TR') {
      const tr = document.createElement('tr');
      tr.setAttribute(UI_ATTR, '1');
      const td = document.createElement('td');
      td.colSpan = 50;
      td.appendChild(ui.wrap);
      tr.appendChild(td);
      (tag === 'TR' ? el : el).insertAdjacentElement(tag === 'TR' ? 'afterend' : 'beforeend', tr);
      ui.root = tr;
    } else {
      el.appendChild(ui.wrap);
    }
  }

  async function onCapture(ui) {
    if (ui.state === 'saving') return;
    setState(ui, 'saving');
    try {
      const extraction = adapter.extract(ui.cardEl);
      if (!extraction.ok) { setState(ui, 'failed', extraction.error); return; }
      const record = Object.assign({}, extraction.record, { sourceUrl: location.href });
      const check = NISM.validation.validateRecord(record, adapter.id);
      if (!check.ok) { setState(ui, 'failed', check.errors.map((e) => e.message).join(' ')); return; }

      const res = await chrome.runtime.sendMessage({ type: MESSAGES.CAPTURE, source: adapter.id, record });
      if (!res || typeof res.status !== 'string') {
        setState(ui, 'failed', 'No response from the extension. Reload the page and try again.');
      } else if (res.status === 'saved') {
        setState(ui, 'saved', res.message || '');
      } else if (res.status === 'duplicate') {
        setState(ui, 'duplicate', res.message || '');
      } else {
        setState(ui, 'failed', res.message || 'Could not save this record.');
      }
    } catch (err) {
      const stale = /context invalidated|Receiving end/i.test(String(err && err.message));
      setState(ui, 'failed', stale ? 'Extension was reloaded. Refresh this page and retry.' : 'Error: ' + (err && err.message));
    }
  }

  function updateBadge(unresolved) {
    let badge = document.querySelector('.nism-capture-badge');
    if (!unresolved) { if (badge) badge.remove(); return; }
    if (!badge) {
      badge = document.createElement('div');
      badge.setAttribute(UI_ATTR, '1');
      badge.className = 'nism-capture-badge';
      document.body.appendChild(badge);
    }
    badge.textContent = 'NISM: ' + unresolved + ' record(s) could not be identified confidently — Capture disabled for them.';
  }

  function scan() {
    const { cards, unresolved } = adapter.findCards(document.body);
    lastScan = { cards: cards.length, unresolved };
    cards.forEach((card) => {
      let ui = uiByCard.get(card.el);
      if (ui && ui.root.isConnected) {
        // Site re-rendered this card in place with a different firm: reset state.
        if (ui.reg !== card.registrationNumber) { ui.reg = card.registrationNumber; setState(ui, 'idle'); }
        return;
      }
      ui = createUi(card);
      uiByCard.set(card.el, ui);
      place(ui);
    });
    updateBadge(unresolved);
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 300);
  }

  function isOwn(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !!(el && el.closest && el.closest('[' + UI_ATTR + ']'));
  }

  new MutationObserver((mutations) => {
    const relevant = mutations.some((m) => {
      const nodes = Array.from(m.addedNodes).concat(Array.from(m.removedNodes));
      return nodes.length === 0 ? !isOwn(m.target) : nodes.some((n) => !isOwn(n));
    });
    if (relevant) scheduleScan();
  }).observe(document.body, { childList: true, subtree: true });

  // Popup diagnostic: counts and field NAMES only. No values, nothing is sent or saved.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== MESSAGES.DIAGNOSTIC || sender.id !== chrome.runtime.id) return;
    const { cards, unresolved } = adapter.findCards(document.body);
    let fieldsFound = [];
    if (cards[0]) {
      const ex = adapter.extract(cards[0].el);
      if (ex.ok) fieldsFound = Object.keys(ex.record).filter((k) => ex.record[k]);
    }
    sendResponse({ adapter: adapter.id, cards: cards.length, unresolved, fieldsFound, injectedButtons: document.querySelectorAll('.nism-capture-btn').length });
  });

  scan();
})();
