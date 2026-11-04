// Every player has their own memory, and computer players use public information only.
// 1. In every player's memory, every card noted as being in a hand (picked up with the face-up pile) really is there.
// 2. No peeking: shuffling every card a player cannot see (centre stack, extra decks, other players' unseen
//    cards) must not change what that player believes about anyone's hand.
// 3. Own memory: wiping the other players' memories must not change what a player believes.
// Run with: node test/bot-memory.js
'use strict';
const E = require('../js/engine.js');
const TYPES = ['J']; for (const s of ['S', 'H', 'D', 'C']) for (let r = 1; r <= 13; r++) TYPES.push(s + r);
const ct = (c) => (c.s === 'J' ? 'J' : c.s + c.r);
let fails = 0, memChecks = 0, peekChecks = 0, ownChecks = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } };
function shuffleHidden(G, seat) {
  const S = JSON.parse(JSON.stringify(G)), known = new Set();
  S.minds[seat].known.forEach((l, p) => { if (p !== seat) l.forEach((x) => known.add(x.id)); });
  const pool = S.stack.slice(); S.teams.forEach((t) => pool.push(...t.deck));
  S.seats.forEach((p, i) => { if (i !== seat) pool.push(...p.hand.filter((c) => !known.has(c.id))); });
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  let k = 0; const take = (n) => { const out = pool.slice(k, k + n); k += n; return out; };
  S.seats.forEach((p, i) => { if (i !== seat) { const kept = p.hand.filter((c) => known.has(c.id)); p.hand = kept.concat(take(p.hand.length - kept.length)); } });
  S.teams.forEach((t) => { t.deck = take(t.deck.length); });
  S.stack = take(S.stack.length);
  return S;
}
for (let g = 0; g < 40; g++) {
  const G = E.createGame({ seats: [0, 1, 2, 3].map((i) => ({ name: 'P' + i, bot: true, level: i % 2 ? 'smart' : 'easy', params: { team: 1, claim: 1 } })) });
  for (let n = 0; G.phase !== 'over' && n < 5000; n++) {
    const s = G.turn;
    let r = E.apply(G, s, E.botNextAction(G, s));
    if (!r.ok) r = E.apply(G, s, { type: G.phase === 'draw' ? 'timeout' : 'discard', cardId: G.seats[s].hand[0] && G.seats[s].hand[0].id });
    for (let v = 0; v < 4; v++) for (let p = 0; p < 4; p++) for (const x of G.minds[v].known[p]) { memChecks++; ok(G.seats[p].hand.some((c) => c.id === x.id && ct(c) === x.k), 'player ' + v + ' remembers ' + x.k + ' in hand ' + p); }
    if (n % 25 === 0 && G.phase !== 'over') {
      const me = G.turn, B1 = E.beliefs(G, me), B2 = E.beliefs(shuffleHidden(G, me), me);
      for (let p = 0; p < 4; p++) if (p !== me) for (const k of TYPES) { peekChecks++; ok(Math.abs(B1.has(p, k) - B2.has(p, k)) < 1e-12, 'belief about ' + k + ' in hand ' + p + ' depends on hidden cards'); }
      const W = JSON.parse(JSON.stringify(G)); W.minds = W.minds.map((m, i) => (i === me ? m : { known: [[], [], [], []], passed: [[], [], [], []], threw: [[], [], [], []], took: [0, 0, 0, 0], lastPlay: [-1, -1, -1, -1] }));
      const B3 = E.beliefs(W, me);
      for (let p = 0; p < 4; p++) if (p !== me) for (const k of TYPES) { ownChecks++; ok(Math.abs(B1.has(p, k) - B3.has(p, k)) < 1e-12, 'player ' + me + ' belief depends on another memory'); }
    }
  }
}
console.log(`memory checks ${memChecks}, no-peeking checks ${peekChecks}, own-memory checks ${ownChecks}: ` + (fails ? fails + ' FAILED' : 'ALL PASSED'));
process.exitCode = fails ? 1 : 0;
