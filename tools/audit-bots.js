#!/usr/bin/env node
// Plays computer-only games and counts moves that would look wrong to a human partner (see vault/Computer Players.md).
//   node tools/audit-bots.js [games=300] [smart|expert] [paramsJson] [ex]     "ex" prints examples of each pattern
const E = require('../js/engine.js');
const N = +process.argv[2] || 300, level = process.argv[3] || 'smart', params = process.argv[4] ? JSON.parse(process.argv[4]) : { team: 1, claim: 1 };
if (level === 'expert') E.CFG.smart.expertMs = 60;
const C = {}, EX = {}; const hit = (k, ex) => { C[k] = (C[k] || 0) + 1; if (ex && (EX[k] = EX[k] || []).length < 4) EX[k].push(ex); };
const nm = (c) => E.cardName(c), wild = E.isWildType;
const fits = (m, c) => E.checkAdd(m, [c]).ok;
const show = (m) => E.meldCards(m).map(nm).join(' ');
let turns = 0;
for (let g = 0; g < N; g++) {
  const G = E.createGame({ seats: [0, 1, 2, 3].map(() => ({ bot: true, level, params })) });
  while (G.phase !== 'over') {
    const seat = G.turn, team = seat % 2, T = G.teams[team], O = G.teams[1 - team], hand = G.seats[seat].hand, u = 1 - G.stack.length / 33;
    const a = E.botNextAction(G, seat);
    if (a.type === 'discard') {
      turns++;
      const c = hand.find((x) => x.id === a.cardId), rest = hand.filter((x) => x.id !== a.cardId);
      const open = T.melds.filter((m) => !E.isComplete(m));
      // 1 threw a card that fits its own team's unfinished meld
      if (!wild(c) && open.some((m) => fits(m, c) && E.meldPure(m))) hit('threw a card that fits own unfinished pure meld', nm(c) + ' | ' + open.filter((m) => fits(m, c)).map(show).join(' / ') + ' | hand ' + rest.map(nm).join(' '));
      // 2 ended the turn holding a natural card that fits an unfinished team meld
      const held = rest.filter((x) => !wild(x) && open.some((m) => fits(m, x)));
      if (held.length && rest.length >= 3) hit('kept a card in hand that fits own unfinished meld (3+ cards left)', held.map(nm).join(' ') + ' | fits ' + open.filter((m) => held.some((x) => fits(m, x))).map(show).join(' / ') + ' | hand ' + rest.map(nm).join(' ') + ' | threw ' + nm(c) + ' | stack ' + G.stack.length + ' deck ' + T.deckStatus + ' canOut ' + E.canGoOut(G, team));
      else if (held.length) hit('kept a card that fits own unfinished meld (1-2 cards left, often forced)', null);
      // 3 threw a wildcard
      if (wild(c) && rest.length > 0) hit(u < .6 ? 'threw a wildcard (early/mid game)' : 'threw a wildcard (late game)', nm(c) + ' | hand ' + rest.map(nm).join(' ') + ' | stack ' + G.stack.length);
      // 4 threw a card the other team can add to a meld right away
      if (!wild(c) && O.melds.some((m) => !E.isClosed(m) && fits(m, c))) {
        const safe = rest.filter((x) => !wild(x) && !O.melds.some((m) => !E.isClosed(m) && fits(m, x)) && !open.some((m) => fits(m, x)));
        const lonely = safe.filter((x) => !rest.some((y) => y.id !== x.id && !wild(y) && (y.r === x.r || (y.s === x.s && Math.abs(y.r - x.r) <= 2))));
        hit('threw a card that fits an opponent meld', null);
        if (lonely.length) hit('threw a card that fits an opponent meld while holding a lonely safe card', nm(c) + ' -> ' + O.melds.filter((m) => fits(m, c)).map(show).join(' / ') + ' | lonely safe: ' + lonely.map(nm).join(' ') + ' | hand ' + rest.map(nm).join(' '));
        if (O.melds.some((m) => !E.isComplete(m) && E.meldCards(m).length === 6 && fits(m, c))) hit('threw the card that completes an opponent 6-card meld', nm(c) + ' | hand ' + rest.map(nm).join(' '));
      }
      // 5 broke a pair / neighbour while holding a lonely card
      if (!wild(c)) {
        const tied = rest.some((y) => !wild(y) && (y.s === c.s && Math.abs(y.r - c.r) === 1));
        const lonely = rest.filter((x) => !wild(x) && !rest.some((y) => y.id !== x.id && !wild(y) && (y.r === x.r || (y.s === x.s && Math.abs(y.r - x.r) <= 2))) && !open.some((m) => fits(m, x)) && !O.melds.some((m) => fits(m, x)));
        if (tied && lonely.length) hit('threw a card next to another in hand while holding a lonely safe card', nm(c) + ' | lonely: ' + lonely.map(nm).join(' ') + ' | hand ' + rest.map(nm).join(' '));
      }
      // 6 a new meld was possible from the hand and was not laid
      const three = (() => { const hs = rest.filter((x) => !wild(x)); for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) for (let k = j + 1; k < hs.length; k++) { const v = E.checkNewMeld([hs[i], hs[j], hs[k]], T.melds.filter((m) => m.type === 'set').length); if (v.ok && v.meld.type === 'seq') return [hs[i], hs[j], hs[k]]; } return null; })();
      if (three) hit('kept a ready pure run of 3 in hand', three.map(nm).join(' ') + ' | hand ' + rest.map(nm).join(' ') + ' | stack ' + G.stack.length + ' | melds ' + T.melds.map(show).join(' / '));
    }
    if (a.type === 'newMeld') {
      const cards = a.cardIds.map((id) => hand.find((x) => x.id === id)), w = cards.filter(wild), nat = cards.filter((x) => !wild(x));
      const v = E.checkNewMeld(cards, T.melds.filter((m) => m.type === 'set').length);
      if (v.ok && v.meld.type === 'seq') {
        const same = T.melds.filter((m) => m.type === 'seq' && m.suit === v.meld.suit && !E.isComplete(m));
        if (same.length) hit('opened a second run in a suit the team is already building', cards.map(nm).join(' ') + ' | ' + same.map(show).join(' / '));
        // wildcard standing in for a card that is in the same hand
        const sl = v.meld.slots.find((x) => !(x.c.s === v.meld.suit && (x.c.r === x.r || (x.c.r === 1 && x.r === 14))));
        if (sl && hand.some((x) => !a.cardIds.includes(x.id) && x.s === v.meld.suit && (x.r === sl.r || (x.r === 1 && sl.r === 14)))) hit('used a wildcard for a card it holds', cards.map(nm).join(' ') + ' | hand ' + hand.map(nm).join(' '));
      } else if (v.ok) {
        if (T.melds.some((m) => m.type === 'set' && m.rank === v.meld.rank)) hit('opened a second set of the same rank', cards.map(nm).join(' '));
        if (v.meld.rank >= 5 && v.meld.rank <= 10 && u < .6) hit('opened a middle-rank set (5-10) before the late game', cards.map(nm).join(' '));
      }
      if (w.length && u < .5 && E.completedInfo(T).pure === 0) hit('spent a wildcard on a new meld early with no pure meld yet', cards.map(nm).join(' ') + ' | hand ' + hand.length + ' | stack ' + G.stack.length);
    }
    if (a.type === 'addToMeld') {
      const m = T.melds.find((x) => x.id === a.meldId), c = hand.find((x) => x.id === a.cardIds[0]);
      if (E.isComplete(m) && !wild(c) && T.melds.some((x) => x.id !== m.id && !E.isComplete(x) && fits(x, c))) hit('added to a finished meld a card an unfinished meld needed', nm(c) + ' onto ' + show(m) + ' | needed by ' + T.melds.filter((x) => x.id !== m.id && !E.isComplete(x) && fits(x, c)).map(show).join(' / '));
      if (wild(c) && E.meldPure(m) && !E.checkAdd(m, [c]).pure) hit('wildcard into a pure meld (rule cases only)', null);
    }
    if (a.type === 'endGame' || (a.type === 'discard' && hand.length === 1)) {}
    const r = E.apply(G, seat, a);
    if (!r.ok) { hit('ILLEGAL MOVE ' + a.type, r.error); E.apply(G, seat, { type: G.phase === 'draw' ? 'timeout' : 'discard', cardId: G.seats[seat].hand[0] && G.seats[seat].hand[0].id }); }
  }
  // end of game
  G.teams.forEach((t, ti) => {
    if (t.deckStatus !== 'claimed') hit('team never claimed its extra deck', null);
    else if (!t.deckUsed) hit('claimed the extra deck but melded none of it', null);
    if (E.completedInfo(t).pure === 0) hit('team finished with no pure meld', null);
    const runs = t.melds.filter((m) => m.type === 'seq');
    for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) if (runs[i].suit === runs[j].suit) {
      const A = runs[i].slots.map((x) => x.r), B = runs[j].slots.map((x) => x.r), gap = Math.max(Math.min(...A) - Math.max(...B), Math.min(...B) - Math.max(...A));
      if (gap <= 2 && gap >= -1 && A.length + B.length <= 13) hit('two runs of one suit that touch or nearly touch (could have been one)', show(runs[i]) + ' / ' + show(runs[j]));
    }
    [0, 2].map((k) => G.seats[ti + k].hand).forEach((h) => { const n = h.filter((c) => !wild(c) && t.melds.some((m) => !E.isClosed(m) && fits(m, c))).length; if (n) hit('game ended with meldable cards still in hand', null); });
  });
}
console.log(N + ' games, ' + level + ', ' + turns + ' turns');
Object.keys(C).sort((a, b) => C[b] - C[a]).forEach((k) => { console.log((C[k] / N).toFixed(2).padStart(6) + ' per game  ' + (100 * C[k] / turns).toFixed(1).padStart(5) + '% of turns  ' + k); });
if (process.argv[5]) for (const k of Object.keys(EX)) { console.log('\n# ' + k); EX[k].forEach((e) => console.log('   ' + e)); }
