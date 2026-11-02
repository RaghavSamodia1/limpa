// Parallel head-to-head between two computer configurations (uses every core).
//   node test/bot-eval.js <games> <levelA> <levelB> [paramsA-json] [paramsB-json]
// Levels: easy, smart, expert. Sides swap every game, so seating luck cancels out. "decisive" ignores draws.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

/* ---- worker: plays its share of the games and writes the totals to a file ---- */
if (process.argv.includes('--worker')) {
  const E = require('../js/engine.js');
  const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
  const games = +arg('games'), [la, lb] = arg('levels').split(','), PA = arg('pa') ? JSON.parse(arg('pa')) : null, PB = arg('pb') ? JSON.parse(arg('pb')) : null;
  const res = { win: 0, loss: 0, draw: 0, pts: 0, out: 0, imp: 0, pur: 0 };
  for (let g = 0; g < games; g++) {
    const flip = g % 2, side = (i) => (i + flip) % 2 === 0;                    // which seats play configuration A
    const G = E.createGame({ seats: [0, 1, 2, 3].map((i) => ({ name: 'P' + i, bot: true, level: side(i) ? la : lb, params: side(i) ? PA : PB })) });
    for (let n = 0; G.phase !== 'over'; n++) {
      if (n > 5000) throw new Error('stuck game');
      const seat = G.turn; let r = E.apply(G, seat, E.botNextAction(G, seat));
      if (!r.ok) E.apply(G, seat, { type: G.phase === 'draw' ? 'timeout' : 'discard', cardId: G.seats[seat].hand[0] && G.seats[seat].hand[0].id });
    }
    const R = G.result, mine = flip ? 1 : 0;
    if (R.winner === null) res.draw++; else if (R.winner === mine) res.win++; else res.loss++;
    res.pts += R.scores[mine] - R.scores[1 - mine];
    if (R.reason === 'out') res.out++;
    G.teams.forEach((t) => t.melds.forEach((m) => { if (E.meldCards(m).length >= 7) { if (E.meldPure(m)) res.pur++; else res.imp++; } }));
  }
  fs.writeFileSync(arg('outfile'), JSON.stringify(res));
  process.exit(0);                                                              // a worker must never fall through into the code below
}

function evalPair(games, la, lb, pa, pb, workers) {
  workers = workers || Math.max(1, os.cpus().length);
  const per = Math.ceil(games / workers);
  return Promise.all(Array.from({ length: workers }, () => new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), 'ev-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.json');
    const args = [__filename, '--worker', '--games', per, '--levels', la + ',' + lb, '--outfile', out];
    if (pa) args.push('--pa', JSON.stringify(pa)); if (pb) args.push('--pb', JSON.stringify(pb));
    spawn(process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit'] }).on('close', (c) => {
      if (c) return reject(new Error('worker failed')); const o = JSON.parse(fs.readFileSync(out, 'utf8')); fs.unlinkSync(out); resolve(o);
    });
  }))).then((rs) => { const r = rs.reduce((a, b) => ({ win: a.win + b.win, loss: a.loss + b.loss, draw: a.draw + b.draw, pts: a.pts + b.pts, out: a.out + b.out, imp: a.imp + b.imp, pur: a.pur + b.pur })); r.n = r.win + r.loss + r.draw; r.rate = r.win / Math.max(1, r.win + r.loss); return r; });
}
module.exports = { evalPair };
if (require.main === module) {
  const [g, la, lb, pa, pb] = process.argv.slice(2), t0 = Date.now();
  evalPair(+g || 800, la || 'smart', lb || 'easy', pa && pa !== 'null' ? JSON.parse(pa) : null, pb && pb !== 'null' ? JSON.parse(pb) : null).then((r) => {
    console.log(`${r.n} games  ${la} vs ${lb}: wins ${(100 * r.win / r.n).toFixed(1)}%  losses ${(100 * r.loss / r.n).toFixed(1)}%  draws ${(100 * r.draw / r.n).toFixed(1)}%  decisive ${(100 * r.rate).toFixed(1)}%  avg margin ${(r.pts / r.n).toFixed(0)}  ended by going out ${(100 * r.out / r.n).toFixed(0)}%  big melds/game pure ${(r.pur / r.n).toFixed(1)} impure ${(r.imp / r.n).toFixed(1)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  });
}
