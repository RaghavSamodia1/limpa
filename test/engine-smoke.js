// Headless smoke test for the rules engine: plays full computer-only games and checks
// that cards are conserved (108) and that every game ends. Run with: node test/engine-smoke.js
'use strict';
const E = require('../js/engine.js');

const GAMES = +process.argv[2] || 200;
let outs = 0, stacks = 0, draws = 0;

for (let g = 0; g < GAMES; g++) {
  const G = E.createGame({ seats: [0, 1, 2, 3].map((i) => ({ name: 'P' + i, bot: true })) });
  let steps = 0;
  while (G.phase !== 'over') {
    if (++steps > 4000) throw new Error('game ' + g + ' did not finish');
    const seat = G.turn;
    let r = E.apply(G, seat, E.botNextAction(G, seat));
    if (!r.ok) r = E.apply(G, seat, { type: G.phase === 'draw' ? 'timeout' : 'discard', cardId: G.seats[seat].hand[0] && G.seats[seat].hand[0].id });
    if (!r.ok) throw new Error('game ' + g + ' stuck: ' + r.error);
    const n = E.countCards(G);
    if (n !== 108) throw new Error('game ' + g + ': card count ' + n + ' (expected 108)');
  }
  const R = G.result;
  if (R.reason === 'out') outs++; else stacks++;
  if (R.winner === null) draws++;
}
console.log(GAMES + ' games OK · went out: ' + outs + ' · stack ran out: ' + stacks + ' · draws: ' + draws);
