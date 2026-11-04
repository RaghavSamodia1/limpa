// The computer's table memory and hand reading use public information only.
// 1. Every card the memory says is in a hand (picked up with the face-up pile) really is there.
// 2. No peeking: shuffling every card a player cannot see (centre stack, extra decks, other players' unseen
//    cards) must not change what that player believes about anyone's hand.
// Run with: node test/bot-memory.js
'use strict';
const E = require('../js/engine.js');
const TYPES = ['J']; for (const s of ['S', 'H', 'D', 'C']) for (let r = 1; r <= 13; r++) TYPES.push(s + r);
const ct = (c) => (c.s === 'J' ? 'J' : c.s + c.r);
let fails = 0, memChecks = 0, peekChecks = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } };
function shuffleHidden(G, seat) {
  const S = JSON.parse(JSON.stringify(G)), known = new Set();
  S.mem.known.forEach((l, p) => { if (p !== seat) l.forEach((x) => known.add(x.id)); });
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
    for (let p = 0; p < 4; p++) for (const x of G.mem.known[p]) { memChecks++; ok(G.seats[p].hand.some((c) => c.id === x.id && ct(c) === x.k), 'memory says ' + x.k + ' is in hand ' + p); }
    if (n % 25 === 0 && G.phase !== 'over') {
      const me = G.turn, B1 = E.beliefs(G, me), B2 = E.beliefs(shuffleHidden(G, me), me);
      for (let p = 0; p < 4; p++) if (p !== me) for (const k of TYPES) { peekChecks++; ok(Math.abs(B1.has(p, k) - B2.has(p, k)) < 1e-12, 'belief about ' + k + ' in hand ' + p + ' depends on hidden cards'); }
    }
  }
}
console.log(`memory checks ${memChecks}, no-peeking checks ${peekChecks}: ` + (fails ? fails + ' FAILED' : 'ALL PASSED'));
process.exitCode = fails ? 1 : 0;
