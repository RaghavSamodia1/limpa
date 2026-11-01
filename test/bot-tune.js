// Tunes the Smart/Expert computer player's weights by self-play (parallel random search).
// Each trial changes several weights at once; the challenger must beat the current champion over N games to replace it.
//   node test/bot-tune.js [games-per-trial=4000] [trials=60] [champion.json]
'use strict';
const fs = require('fs');
const E = require('../js/engine.js');
const { evalPair } = require('./bot-eval.js');
const N = +process.argv[2] || 4000, TRIALS = +process.argv[3] || 60, OUT = process.argv[4] || 'champion.json';
let champ = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const cur = () => Object.assign({}, E.CFG.smart, champ);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const NUM = {   // name: [min, max]
  wildNewHand: [4, 13], wildNewU: [0, 1], wildAddLen: [2, 6], wildAddU: [.1, .9], wildAddAny: [.4, 1],
  dangerW: [0, 70], wildKeep: [20, 140], wildBase: [0, 50], sameRankW: [0, 30], adjW: [0, 35], gapW: [0, 25], fitW: [10, 120],
  addBase: [20, 90], addLenW: [0, 15], newBase: [30, 100], newLenW: [0, 25], wildNewBase: [0, 70], completeW: [20, 160], pureW: [0, 160],
  midSetU: [.5, 1], midSetHand: [0, 8], outsW: [0, 14], setOutsW: [0, 12], dangerGapW: [0, 30], waitLive: [1, 4], waitU: [.2, 1],
};
const INT = new Set(['wildNewHand', 'wildAddLen', 'midSetHand', 'waitLive']);
const names = Object.keys(NUM);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  for (let t = 1; t <= TRIALS; t++) {
    const chal = Object.assign({}, champ), c0 = cur(), changed = [];
    const k = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < k; i++) {
      const n = names[Math.floor(Math.random() * names.length)], [lo, hi] = NUM[n];
      let v = c0[n] * (Math.random() < .5 ? 1 / (1 + Math.random() * .6) : 1 + Math.random() * .6);
      if (!c0[n]) v = lo + Math.random() * (hi - lo) * .3;
      v = clamp(v, lo, hi); if (INT.has(n)) v = Math.round(v);
      chal[n] = +v.toFixed(3); changed.push(`${n} ${c0[n]}→${chal[n]}`);
    }
    const r = await evalPair(N, 'smart', 'smart', chal, champ);
    const ok = r.rate >= .525;
    log(`trial ${t}/${TRIALS}  ${(100 * r.rate).toFixed(1)}%  ${ok ? 'ACCEPT ' : ''}${changed.join(', ')}`);
    if (ok) { champ = chal; fs.writeFileSync(OUT, JSON.stringify(champ, null, 1)); }
  }
  log('champion', JSON.stringify(champ));
})();
