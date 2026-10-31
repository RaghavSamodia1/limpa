// Bot arena: plays full games with different computer levels / weights on each team.
// usage: node test/bot-arena.js [games] [levelA] [levelB] [paramsA-json] [paramsB-json]
//   A = seats 0,2 and B = seats 1,3, and the sides swap every game so seating luck cancels out.
'use strict';
const E = require('../js/engine.js');

function play(levels, params) {
  const G = E.createGame({ seats: [0, 1, 2, 3].map((i) => ({ name: 'P' + i, bot: true, level: levels[i], params: params[i] })) });
  let steps = 0;
  while (G.phase !== 'over') {
    if (++steps > 5000) throw new Error('game did not finish');
    const seat = G.turn;
    let r = E.apply(G, seat, E.botNextAction(G, seat));
    if (!r.ok) r = E.apply(G, seat, { type: G.phase === 'draw' ? 'timeout' : 'discard', cardId: G.seats[seat].hand[0] && G.seats[seat].hand[0].id });
    if (!r.ok) throw new Error('stuck: ' + r.error);
  }
  return G;
}
function arena(games, LA, LB, PA, PB) {
  const blank = () => ({ win: 0, pts: 0, melds: 0, pure: 0, out: 0, deckPen: 0, timpa: 0 });
  const st = { A: blank(), B: blank(), draw: 0, turns: 0, games };
  for (let g = 0; g < games; g++) {
    const aTeam = g % 2;
    const levels = [0, 1, 2, 3].map((i) => (i % 2 === aTeam ? LA : LB));
    const params = [0, 1, 2, 3].map((i) => (i % 2 === aTeam ? PA : PB));
    const G = play(levels, params), R = G.result;
    st.turns += G.turnNo;
    if (R.winner === null) st.draw++;
    [['A', aTeam], ['B', 1 - aTeam]].forEach(([k, t]) => {
      const b = R.breakdown[t], s = st[k];
      if (R.winner === t) s.win++;
      s.pts += b.total; s.melds += b.completed; s.pure += b.pure + b.timpas; s.timpa += b.timpas;
      if (R.reason === 'out' && E.teamOf(R.outSeat) === t) s.out++;
      s.deckPen += b.penalties.length;
    });
  }
  return st;
}
module.exports = { arena };

if (require.main === module) {
  const GAMES = +process.argv[2] || 200, LA = process.argv[3] || 'smart', LB = process.argv[4] || 'easy';
  const PA = process.argv[5] ? JSON.parse(process.argv[5]) : null, PB = process.argv[6] ? JSON.parse(process.argv[6]) : null;
  const t0 = Date.now(), st = arena(GAMES, LA, LB, PA, PB), f = (x) => (x / GAMES).toFixed(2);
  console.log(`${GAMES} games  A=${LA} vs B=${LB}   (${((Date.now() - t0) / 1000).toFixed(1)}s, avg ${(st.turns / GAMES).toFixed(0)} turns)`);
  for (const k of ['A', 'B']) { const s = st[k]; console.log(`${k}: wins ${s.win} (${(100 * s.win / GAMES).toFixed(0)}%)  avg pts ${f(s.pts)}  melds ${f(s.melds)}  pure ${f(s.pure)}  timpa ${f(s.timpa)}  went out ${s.out}  deck penalties/game ${f(s.deckPen)}`); }
  console.log('draws', st.draw);
}
