// Browser test (needs Playwright): every card on screen keeps a real card's shape (height = 1.4 x width, measured before
// the table's tilt), in every view of the table and in the meld detail. Run with: node test/layout.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })).newPage();
  await pg.goto('file://' + require('path').resolve(__dirname, '..', 'index.html')); await pg.waitForTimeout(300);
  await pg.evaluate(() => {
    const L = window.__limpa, UI = L.UI, E = L.E;
    UI.lobby = { gameId: '1', teamNames: ['Bhujia', 'Kachori'], seats: [{ name: 'You', avatar: '🥞', bot: false }, { name: 'A', avatar: '🍳', bot: true }, { name: 'B', avatar: '☕', bot: true }, { name: 'C', avatar: '🥐', bot: true }] };
    const G = UI.G = E.createGame({ gameId: '1', teamNames: ['Bhujia', 'Kachori'], seats: UI.lobby.seats });
    Object.assign(UI, { screen: 'game', viewer: 0, spinning: false, dealing: false, modal: null, cover: null, order: {}, peek: null });
    G.seats.forEach((s) => (s.bot = true));
    for (let i = 0; i < 70 && G.phase !== 'over'; i++) { const s = G.turn; let r = E.apply(G, s, E.botNextAction(G, s)); if (!r.ok) E.apply(G, s, { type: G.phase === 'draw' ? 'timeout' : 'discard', cardId: G.seats[s].hand[0].id }); if (G.turn === 0 && G.phase === 'draw' && i > 30) break; }
    G.seats[0].bot = false; if (G.turn === 0 && G.phase === 'draw') E.apply(G, 0, { type: 'draw' });
  });
  const views = [['Your melds', 'mine'], ['Their melds', 'opp'], ['Pile', 'piles'], ['All', 'all']];
  const report = [];
  const measure = (label) => pg.evaluate((label) => {
    const out = [];
    document.querySelectorAll('.card, .back').forEach((el) => {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
      if (el.closest('.fly,.dragghost')) return;
      const w = el.offsetWidth, h = el.offsetHeight; if (!w || !h) return;
      const kind = el.classList.contains('hc') ? 'hand card' : el.classList.contains('stackcard') ? 'centre stack' : el.classList.contains('topdis') ? 'top of pile' : el.classList.contains('dstack') ? 'extra deck' : el.closest('.history') ? 'pile history' : el.closest('.bigmeld') ? 'meld detail' : el.closest('.fan') ? 'opponent fan' : el.classList.contains('tc') ? 'meld card' : 'other';
      out.push({ label, kind, w, h, ratio: +(h / w).toFixed(3) });
    });
    return out;
  }, label);
  for (const [label, v] of views) { await pg.evaluate((v) => { const L = window.__limpa; L.UI.peek = v; L.render(); }, v); await pg.waitForTimeout(150); report.push(...await measure(label)); }
  await pg.evaluate(() => { const L = window.__limpa, G = L.UI.G; const m = [...G.teams[0].melds, ...G.teams[1].melds][0]; L.UI.modal = { type: 'meld', meldId: m.id }; L.render(); }); await pg.waitForTimeout(150);
  report.push(...(await measure('meld detail pop-up')).filter((r) => r.kind === 'meld detail'));
  const groups = {};
  for (const r of report) { const k = r.label + ' / ' + r.kind; (groups[k] = groups[k] || []).push(r.ratio); }
  let fails = 0;
  for (const [k, l] of Object.entries(groups)) { const mn = Math.min(...l), mx = Math.max(...l); const bad = mn < 1.36 || mx > 1.46; if (bad) fails++; console.log((bad ? 'FAIL ' : 'PASS ') + k.padEnd(36) + ' height/width ' + (mn === mx ? mn : mn + '..' + mx) + '  (n=' + l.length + ')'); }
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exitCode = fails ? 1 : 0;
  await b.close();
})();
