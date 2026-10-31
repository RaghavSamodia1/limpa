// Self-play tuning of the smart computer player's weights (coordinate descent).
// A challenger (one weight changed) must beat the current champion over N games to replace it.
// usage: node test/bot-tune.js [games-per-trial] [passes] [out.json]
'use strict';
const fs = require('fs');
const E = require('../js/engine.js');
const { arena } = require('./bot-arena.js');
const N = +process.argv[2] || 500, PASSES = +process.argv[3] || 2, OUT = process.argv[4] || 'champion.json';

let champ = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const base = () => Object.assign({}, E.CFG.smart, champ);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const variants = {
  allSets: () => [0], wildNew: () => [0], wildAdd: () => [0], danger: () => [0], spendWild: () => [0], goOutCheck: () => [0],
  wildNewHand: (v) => [v - 3, v + 3], wildNewU: (v) => [clamp(v - .3, 0, 1), clamp(v + .3, 0, 2)],
  wildAddLen: (v) => [v - 1, v + 1], wildAddU: (v) => [clamp(v - .25, 0, 1), clamp(v + .25, 0, 1)], wildAddAny: (v) => [clamp(v - .3, 0, 1), clamp(v + .25, 0, 2)],
  dangerW: (v) => [v * .5, v * 1.7], wildKeep: (v) => [v * .5, v * 1.5], wildBase: (v) => [v * .4, v * 2], sameRankW: (v) => [v * .5, v * 1.6],
  adjW: (v) => [v * .5, v * 1.6], gapW: (v) => [v * .4, v * 1.8], fitW: (v) => [v * .5, v * 1.6],
  addBase: (v) => [v * .6, v * 1.5], addLenW: (v) => [v * .4, v * 1.8], newBase: (v) => [v * .6, v * 1.5], newLenW: (v) => [v * .5, v * 1.7],
  wildNewBase: (v) => [v * .5, v * 1.8], completeW: (v) => [v * .5, v * 1.6], pureW: (v) => [v * .4, v * 1.8], pickTier: () => [5, 6, 8],
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
for (let pass = 1; pass <= PASSES; pass++) {
  for (const key of Object.keys(variants)) {
    const cur = base()[key];
    for (const val of variants[key](cur)) {
      if (val === cur) continue;
      const chal = Object.assign({}, champ, { [key]: val });
      const st = arena(N, 'smart', 'smart', chal, champ);       // A = challenger, B = champion
      const w = st.A.win, l = st.B.win, rate = w / Math.max(1, w + l);
      log(`pass ${pass}  ${key}: ${cur} -> ${val}   ${w}-${l} (${(100 * rate).toFixed(1)}%)${rate >= .55 ? '  ACCEPT' : ''}`);
      if (rate >= .55) { champ = chal; fs.writeFileSync(OUT, JSON.stringify(champ, null, 1)); break; }
    }
  }
}
log('champion', JSON.stringify(champ));
