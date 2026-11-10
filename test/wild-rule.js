// Wildcards and pure melds: a computer player puts a Joker or a 2 into a meld that is still pure only for a solid
// reason (the natural cards are gone, or the game is nearly over). Run with: node test/wild-rule.js
'use strict';
const E = require('../js/engine.js');
E.CFG.smart.expertMs = 40;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
function setup(meldCards, hand, opts) {
  const G = E.createGame({ seats: [0, 1, 2, 3].map(() => ({ bot: true, level: opts.level || 'smart' })) });
  const all = []; G.seats.forEach((s) => { all.push(...s.hand); s.hand = []; }); all.push(...G.stack, ...G.discard); G.teams.forEach((t) => { all.push(...t.deck); t.deck = []; });
  const take = (s, r) => all.splice(all.findIndex((c) => c.s === s && c.r === r), 1)[0];
  const v = E.checkNewMeld(meldCards.map(([s, r]) => take(s, r)), 0);
  G.teams[0].melds.push({ id: 'mx', team: 0, scored: null, points: 0, lt: 0, type: v.meld.type, suit: v.meld.suit, rank: v.meld.rank, slots: v.meld.slots, cards: v.meld.cards });
  G.seats[0].hand = hand.map(([s, r]) => take(s, r));
  if (opts.bury) G.discard = opts.bury.map(([s, r]) => take(s, r)); else G.discard = [all.pop()];
  [1, 2, 3].forEach((i) => { G.seats[i].hand = all.splice(0, 9); });
  G.teams.forEach((t) => { t.deck = all.splice(0, 11); });
  G.stack = all.splice(0, opts.stack || 25);
  Object.assign(G, { turn: 0, phase: 'play', mustUse: null });
  const acts = []; for (let i = 0; i < 6 && G.turn === 0 && G.phase === 'play'; i++) { const a = E.botNextAction(G, 0, !!opts.sim); acts.push(a.type + (a.confirmImpure ? '(wild into pure)' : '')); if (!E.apply(G, 0, a).ok) break; }
  return acts.join(', ');
}
const A6 = [['S', 1], ['S', 1], ['H', 1], ['H', 1], ['D', 1], ['C', 1]], junk = [['S', 9], ['H', 6], ['D', 4], ['C', 11], ['C', 8]];
const run = [['S', 5], ['S', 4], ['S', 3], ['S', 2]];
const spoils = (s) => /wild into pure/.test(s);
for (const level of ['smart', 'expert']) {
  ok(!spoils(setup(A6, [['J', 0], ...junk], { level })), level + ': six aces down, two aces still unseen: the Joker stays in hand');
  // (the Expert may still prefer to hold the Joker here: its planner weighs that against the imagined rest of the game)
  if (level === 'smart') ok(spoils(setup(A6, [['J', 0], ...junk], { level, bury: [['D', 1], ['C', 1], ['H', 13]] })), level + ': the other aces are in the pile (dead): the Joker finishes the meld');
  if (level === 'smart') ok(spoils(setup(A6, [['J', 0], ...junk], { level, stack: 2 })), level + ': the centre stack is nearly out: the Joker finishes the meld');
  ok(!spoils(setup(run, [['J', 0], ...junk], { level })), level + ': 5-4-3-2 of spades (pure, natural 2): no second wildcard added');
}
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
