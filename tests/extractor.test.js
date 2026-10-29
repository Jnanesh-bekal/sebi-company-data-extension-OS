const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
require('../src/common/constants.js');
require('../src/common/normalization.js');
require('../src/common/validation.js');
const adapter = require('../src/extractors/sebiMerchantBankers.js');

const FIRMS = {
  A: { name: 'AFCO CAPITAL INDIA PVT LTD', reg: 'INM000012555', email: 'capital@afcogroup.in', tel: '912226378100',
       addr: '604 / 605, Cosmos Plaza, J. P. Road,, Next to D. N. Nagar Metro Station, Andheri (West),, MUMBAI, MAHARASHTRA, 400053',
       person: 'Snehal Vishwakarma', corrAddr: '604 / 605, Cosmos Plaza, J. P. Road, Next to D. N. Nagar Metro Station, Andheri (West), MUMBAI, MAHARASHTRA, 400053',
       validity: 'Aug 09, 2018 - Perpetual' },
  B: { name: 'A.K. CAPITAL SERVICES LTD', reg: 'INM000010411', email: 'chaitali.desai@akgroup.co.in', tel: '912267544776', fax: '912267544776',
       addr: '603, 6TH FLOOR, WINDSOR, OFF CST ROAD,, KALINA, SANTACRUZ (EAST), MUMBAI, MAHARASHTRA, 400098', person: 'Chaitali Desai',
       corrAddr: '603, 6TH FLOOR', corrEmail: 'chaitali.desai@akgroup.co.in', corrTel: '912267544776', corrFax: '912267544776',
       validity: 'Apr 01, 1998 - Perpetual' }
};

const ROWS = [['Name', 'name', true], ['Registration No.', 'reg'], ['E-mail', 'email'], ['Telephone', 'tel'], ['Fax No.', 'fax'], ['Address', 'addr'],
  ['Contact Person', 'person'], ['Correspondence Address', 'corrAddr'], ['Correspondence E-mail', 'corrEmail'],
  ['Correspondence Telephone', 'corrTel'], ['Correspondence Fax', 'corrFax'], ['Validity', 'validity']];

// Three plausible layouts, since the live DOM could not be inspected.
const LAYOUTS = {
  divRows: (f) => '<div class="card">' + ROWS.filter(([, k]) => f[k] !== undefined).map(([l, k, link]) =>
    `<div class="row"><span class="lbl">${l}</span><span class="val">${link ? '<a href="#">' + f[k] + '</a>' : f[k]}</span></div>`).join('') + '</div>',
  tableRows: (f) => '<table class="card"><tbody>' + ROWS.filter(([, k]) => f[k] !== undefined).map(([l, k, link]) =>
    `<tr><td><b>${l}</b></td><td>${link ? '<a href="#">' + f[k] + '</a>' : f[k]}</td></tr>`).join('') + '</tbody></table>',
  dl: (f) => '<dl class="card">' + ROWS.filter(([, k]) => f[k] !== undefined).map(([l, k, link]) =>
    `<dt>${l}</dt><dd>${link ? '<a href="#">' + f[k] + '</a>' : f[k]}</dd>`).join('') + '</dl>'
};

const SEARCH_FORM = '<form><table><tr><td>Name / Trade Name</td><td>:</td><td><input></td><td>Registration No.</td><td>:</td><td><input></td></tr></table></form>';

function page(layout, ...firms) {
  const dom = new JSDOM('<body>' + SEARCH_FORM + '<div id="list">' + firms.map(LAYOUTS[layout]).join('') + '</div></body>');
  global.document = dom.window.document;
  return dom.window.document;
}

for (const layout of Object.keys(LAYOUTS)) {
  test(`[${layout}] finds exactly one card per firm and ignores the search form`, () => {
    const doc = page(layout, FIRMS.A, FIRMS.B);
    const { cards, unresolved } = adapter.findCards(doc.body);
    assert.strictEqual(cards.length, 2);
    assert.strictEqual(unresolved, 0);
    assert.deepStrictEqual(cards.map((c) => c.registrationNumber), ['INM000012555', 'INM000010411']);
  });

  test(`[${layout}] Tests A/B: extraction is scoped to the selected card only`, () => {
    const doc = page(layout, FIRMS.A, FIRMS.B);
    const { cards } = adapter.findCards(doc.body);
    const a = adapter.extract(cards[0].el).record;
    assert.strictEqual(a.firmName, FIRMS.A.name);
    assert.strictEqual(a.registrationNumber, 'INM000012555');
    assert.strictEqual(a.registeredAddress, FIRMS.A.addr);
    assert.strictEqual(a.registrationValidity, FIRMS.A.validity);
    assert.ok(!JSON.stringify(a).includes('A.K. CAPITAL'));
    assert.ok(!JSON.stringify(a).includes('INM000010411'));
    const b = adapter.extract(cards[1].el).record;
    assert.strictEqual(b.firmName, FIRMS.B.name);
    assert.strictEqual(b.correspondenceFax, '912267544776');
  });

  test(`[${layout}] Test D: missing optional fields become empty strings, others kept`, () => {
    const doc = page(layout, FIRMS.A);
    const { cards } = adapter.findCards(doc.body);
    const a = adapter.extract(cards[0].el).record;
    assert.strictEqual(a.faxNumber, '');
    assert.strictEqual(a.correspondenceEmail, '');
    assert.strictEqual(a.contactPerson, 'Snehal Vishwakarma');
    assert.strictEqual(a.correspondenceAddress, FIRMS.A.corrAddr);
  });

  test(`[${layout}] Test E: a card with empty registration is found but extracts an empty registration`, () => {
    const doc = page(layout, Object.assign({}, FIRMS.A, { reg: '' }), FIRMS.B);
    const { cards } = adapter.findCards(doc.body);
    assert.strictEqual(cards.length, 2);
    assert.strictEqual(adapter.extract(cards[0].el).record.registrationNumber, '');
  });
}

test('<br> line breaks inside an address become single spaces', () => {
  const dom = new JSDOM('<body><div><div><span>Name</span><span>X LTD</span></div><div><span>Registration No.</span><span>INM000000001</span></div><div><span>Address</span><span>Line 1,<br>Line 2</span></div></div></body>');
  global.document = dom.window.document;
  const { cards } = adapter.findCards(dom.window.document.body);
  assert.strictEqual(adapter.extract(cards[0].el).record.registeredAddress, 'Line 1, Line 2');
});

test('Test I: our own injected UI does not create duplicate cards or alter extraction', () => {
  const doc = page('divRows', FIRMS.A, FIRMS.B);
  let { cards } = adapter.findCards(doc.body);
  cards.forEach((c) => { const ui = doc.createElement('div'); ui.setAttribute('data-nism-ui', '1'); ui.innerHTML = '<button>+ Capture to NISM Sheet</button><span>Name</span>'; c.el.appendChild(ui); });
  const again = adapter.findCards(doc.body);
  assert.strictEqual(again.cards.length, 2);
  assert.strictEqual(adapter.extract(again.cards[0].el).record.firmName, FIRMS.A.name);
});

test('ambiguous structure (two firms inside one container with no separation) is reported, not guessed', () => {
  const dom = new JSDOM('<body><div id="flat">' +
    '<span>Name</span><span>A</span><span>Registration No.</span><span>INM000000001</span>' +
    '<span>Name</span><span>B</span><span>Registration No.</span><span>INM000000002</span></div></body>');
  global.document = dom.window.document;
  const { cards, unresolved } = adapter.findCards(dom.window.document.body);
  // Flat siblings cannot be separated confidently: no card may be returned that mixes both firms.
  cards.forEach((c) => assert.ok(!(c.el.textContent.includes('INM000000001') && c.el.textContent.includes('INM000000002'))));
  assert.ok(cards.length + unresolved === 2);
});

test('URL matching: merchant bankers only', () => {
  assert.ok(adapter.matches('https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=9&utm_source=chatgpt.com'));
  assert.ok(!adapter.matches('https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13'));
  assert.ok(!adapter.matches('https://example.com/sebiweb/other/OtherAction.do?intmId=9'));
});
