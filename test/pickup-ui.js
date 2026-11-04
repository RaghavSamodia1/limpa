// Browser test for taking the discard pile (needs Playwright): the picked-up top card stays selected and is always
// part of the meld, refusals explain what to do, and the green "Place" tick only shows for melds the rules accept.
// Run with: node test/pickup-ui.js
const { chromium } = require('playwright');
const path = require('path');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })).newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await pg.waitForTimeout(300);
  // Hand 7♠ 6♠ 4♠, the pile is a single Joker, and the team can't go out yet (no pure meld): the position from a tester's screenshot.
  const setup = () => pg.evaluate(() => {
    const L = window.__limpa, UI = L.UI, E = L.E;
    UI.lobby = { gameId: '1', teamNames: ['Bhujia', 'Kachori'], seats: [{ name: 'You', avatar: '🥞', bot: false }, { name: 'Chunnu', avatar: '🍳', bot: true }, { name: 'Munnu', avatar: '☕', bot: true }, { name: 'Tunnu', avatar: '🥐', bot: true }] };
    const G = UI.G = E.createGame({ gameId: '1', teamNames: ['Bhujia', 'Kachori'], seats: UI.lobby.seats });
    Object.assign(UI, { screen: 'game', viewer: 0, spinning: false, dealing: false, modal: null, order: {}, toasts: [] }); UI.sel.clear();
    const all = []; G.seats.forEach((s) => { all.push(...s.hand); s.hand = []; }); all.push(...G.stack, ...G.discard); G.teams.forEach((t) => { all.push(...t.deck); t.deck = []; });
    const take = (s, r) => all.splice(all.findIndex((c) => c.s === s && c.r === r), 1)[0];
    G.seats[0].hand = [take('S', 7), take('S', 6), take('S', 4)];
    G.discard = [take('J', 0)];
    G.teams[0].deckStatus = 'claimed'; G.teams[0].deckUsed = true; G.teams[1].deckStatus = 'claimed';
    [[['H', 1], ['H', 13], ['H', 12], ['H', 11], ['H', 2], ['H', 9], ['H', 8]], [['D', 13], ['D', 12], ['D', 11], ['D', 10], ['D', 9], ['D', 8], ['S', 2]], [['C', 9], ['C', 8], ['C', 7]]]
      .forEach((cs, i) => { const v = E.checkNewMeld(cs.map(([s, r]) => take(s, r)), 0); const m = Object.assign({ id: 'mx' + i, team: 0, scored: null, points: 0 }, v.meld); delete m.pure; G.teams[0].melds.push(m); });
    G.seats.forEach((s, i) => { if (i) s.hand = all.splice(0, 5); });
    G.stack = all.splice(0, 3);
    Object.assign(G, { turn: 0, phase: 'draw', mustUse: null, pileRefused: false, finalTurn: false });
    L.render();
  });
  const tap = (name) => pg.evaluate((name) => { const { UI, E } = window.__limpa; const c = UI.G.seats[0].hand.find((x) => E.cardName(x) === name); document.querySelector(`.hc[data-id="${c.id}"]`).click(); }, name);
  const sel = () => pg.evaluate(() => { const { UI, E } = window.__limpa; return [...UI.sel].map((id) => E.cardName(UI.G.seats[0].hand.find((c) => c.id === id))).sort().join(' '); });
  const lastToast = () => pg.evaluate(() => { const t = document.querySelectorAll('#toast .toast, #toast > *'); return t.length ? t[t.length - 1].textContent : ''; });
  const pickup = async () => { await pg.click('[data-act=pickup]'); await pg.waitForTimeout(400); };

  await setup(); await pickup();
  ok(await sel() === 'Joker', 'after taking the pile, the top card (Joker) is selected');
  await tap('Joker');
  ok(await sel() === 'Joker', 'tapping the glowing card does not deselect it');
  await tap('7♠'); await tap('6♠'); await tap('4♠');
  ok(await pg.evaluate(() => document.getElementById('newBtn').textContent.trim()) === 'New meld', 'no green "Place" tick for a meld the rules refuse (it would empty the hand)');
  await pg.evaluate(() => document.getElementById('newBtn').click()); await pg.waitForTimeout(250);
  const t1 = await lastToast();
  ok(!/First use the top card/.test(t1), 'the refusal is not the wrong "First use the top card" message');
  ok(/add the Joker to one of your melds, or tap Return/.test(t1), 'the refusal says what works instead: ' + JSON.stringify(t1));
  ok(await pg.evaluate(() => !!document.querySelector('.meld.hintm')), 'a meld the Joker can go on lights up');

  await setup(); await pickup();
  await tap('7♠');                                               // Joker stays in: tap the clubs run with 7♠ selected
  await pg.evaluate(() => document.querySelector('[data-meld="mx2"]').click()); await pg.waitForTimeout(250);
  ok(!/First use the top card/.test(await lastToast()), 'tapping a meld with another card selected still includes the Joker');

  await setup(); await pickup();
  await pg.evaluate(() => document.querySelector('[data-meld="mx2"]').click()); await pg.waitForTimeout(250);
  ok(await pg.evaluate(() => window.__limpa.UI.G.mustUse === null && window.__limpa.UI.G.teams[0].melds[2].slots.length === 4), 'the Joker goes onto the clubs run with one tap');

  ok(!errs.length, 'no page errors ' + (errs.length ? errs.join(' | ') : ''));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
})();
