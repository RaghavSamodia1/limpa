// Browser test for game records (needs Playwright): a whole game played in the page (the person's moves made by a
// script, the computers by the app) is recorded on the phone, with a refused move noted and no names stored, and the
// record replays exactly to the same final scores. Run with: node test/records.js
const { chromium } = require('playwright');
const path = require('path');
const E = require('../js/engine.js');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };

// rebuild a game from its record and play the recorded moves again
function replay(rec) {
  const dec = (x) => {
    switch (x[0]) {
      case 'd': return { type: 'draw' }; case 'p': return { type: 'pickup' }; case 'r': return { type: 'returnPile' };
      case 'e': return { type: 'endGame' }; case 't': return { type: 'timeout' }; case 'x': return { type: 'discard', cardId: x[1] };
      case 'n': return x.length > 2 ? { type: 'newMeld', cardIds: x[1], choice: x[2] } : { type: 'newMeld', cardIds: x[1] };
      case 'a': return { type: 'addToMeld', meldId: x[1], cardIds: x[2], wildPos: x[3] === null ? undefined : x[3], confirmImpure: !!x[4] };
    }
  };
  const G = E.fromDeal(rec.deal, { seats: rec.seats.map((s, i) => ({ name: 'P' + i, bot: !s.h, level: s.lv || 'smart' })) });
  for (let i = 0; i < rec.acts.length; i++) {
    const [seat, , , ...a] = rec.acts[i];
    const r = E.apply(G, seat, dec(a));
    if (!r.ok) return { G, error: 'move ' + i + ' refused on replay: ' + r.error };
    if (rec.rs[i]) G.stack = rec.rs[i].map((id) => E.cardById(id));
  }
  return { G };
}

(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })).newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await pg.evaluate(() => { localStorage.clear(); localStorage.setItem('limpa.name', 'Mummy Secret'); });
  await pg.reload(); await pg.waitForTimeout(300);
  await pg.click('[data-act=new]'); await pg.click('[data-act=level][data-level=smart]');
  await pg.evaluate(() => { window.__limpa.UI.botDelay = 1; });
  await pg.click('[data-act=play]');
  let refusedTried = false, human = 0;
  for (let step = 0; step < 4000; step++) {
    const st = await pg.evaluate(() => { const U = window.__limpa.UI, G = U.G; return G ? { over: G.phase === 'over', mine: G.turn === U.viewer && !G.seats[G.turn].bot && !U.spinning, phase: G.phase } : { over: true }; });
    if (st.over) break;
    if (!st.mine) { await pg.waitForTimeout(15); continue; }
    // the "person": plays like the Easy computer, and once tries to throw before drawing (refused)
    await pg.evaluate((tryBad) => {
      const L = window.__limpa, U = L.UI, G = U.G, E = L.E;
      if (tryBad && G.phase === 'draw') { L.act({ type: 'discard', cardId: G.seats[U.viewer].hand[0].id }, true); return; }
      const probe = JSON.parse(JSON.stringify(G)); probe.seats[U.viewer].level = 'easy';
      let a = E.botNextAction(probe, U.viewer);
      if (!a) return;
      if (a.type === 'addToMeld') L.addToMeld(a.meldId, a.cardIds, a.wildPos, a.confirmImpure); else L.act(a, true);
    }, !refusedTried && st.phase === 'draw');
    if (!refusedTried && st.phase === 'draw') refusedTried = true; else human++;
    await pg.waitForTimeout(5);
  }
  const recs = await pg.evaluate(() => JSON.parse(localStorage.getItem('limpa.games') || '[]'));
  const final = await pg.evaluate(() => window.__limpa.UI.G && window.__limpa.UI.G.result);
  ok(recs.length === 1, 'the finished game was recorded on the phone (' + recs.length + ')');
  const rec = recs[0] || {};
  ok(rec.end === 'over' && rec.result && final && JSON.stringify(rec.result.scores) === JSON.stringify(final.scores), 'the record holds the result');
  ok(rec.seats && rec.seats[0].h === 1 && rec.seats.slice(1).every((s) => s.h === 0 && s.lv === 'smart'), 'the record knows which seats were people and which were computers');
  ok(rec.acts && rec.acts.some((a) => a[1] === 1) && rec.acts.some((a) => a[1] === 0), 'moves are marked as a person\'s or a computer\'s');
  ok(rec.bad && rec.bad.length >= 1 && /draw|pick up/i.test(rec.bad[0][rec.bad[0].length - 1]), 'the refused throw was noted with its reason');
  ok(!JSON.stringify(rec).includes('Mummy') && !JSON.stringify(rec).includes('Secret'), 'no names in the record');
  const rp = rec.deal ? replay(rec) : { error: 'no deal' };
  ok(!rp.error && rp.G.phase === 'over' && JSON.stringify(rp.G.result.scores) === JSON.stringify(rec.result.scores), 'the record replays exactly to the same scores' + (rp.error ? ': ' + rp.error : ''));
  const size = JSON.stringify(rec).length;
  ok(size < 20000, 'a game record is small (' + size + ' characters, ' + rec.acts.length + ' moves)');
  ok(!errs.length, 'no page errors ' + (errs.length ? errs.join(' | ') : ''));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
})();
