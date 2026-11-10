/*!
 * Limpa's Breakfast — Rules Engine (2v2)
 * Pure, serialisable game logic. Runs in the browser today and can be moved
 * unchanged into a Firebase Cloud Function (server-authoritative) later.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LimpaEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CFG = {
    players: 4, handSize: 13, extraDeckSize: 11, completeAt: 7, maxLen: 13, maxSets: 3, maxWilds: 1,
    pts: { pure: 200, impure: 100, timpa: 500, goOut: 100, deckPenalty: -100 },
    drawSeconds: 60,
    // Computer players only build sets from edge ranks; middle ranks (5-10) are kept for sequences.
    botSetRanks: [1, 13, 12, 11, 3, 4],
    // Computer players: picking up the pile for a low-value use of the top card (adding it to a
    // completed impure meld, or a new impure meld built with a wildcard from hand) is only allowed
    // if another pile card also gets melded that turn, or the player goes out. false = old behaviour.
    botPilePayoff: true,
  };
  const WILD_ERR = 'Only one wildcard (Joker or 2) is allowed per meld.';
  const SUITS = ['S', 'H', 'D', 'C'];
  const SUIT_IX = { S: 0, H: 1, D: 2, C: 3 };
  const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣', J: '★' };
  const RANK_TXT = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

  const rankTxt = (r) => RANK_TXT[r] || String(r);
  const cardName = (c) => (c.s === 'J' ? 'Joker' : rankTxt(c.r) + SUIT_SYM[c.s]);
  const isWildType = (c) => c.s === 'J' || c.r === 2;
  const teamOf = (seat) => seat % 2;
  const jclone = (o) => JSON.parse(JSON.stringify(o));
  // Copy of a game state. Card objects and the card lists inside melds are never edited in place (they are replaced),
  // so they are shared; every container that does get edited in place is copied. Much faster than a JSON round trip.
  function clone(st) {
    if (!st || !st.seats || !st.teams) return jclone(st);
    const s = Object.assign({}, st);
    s.seats = st.seats.map((p) => Object.assign({}, p, { hand: p.hand.slice() }));
    s.teams = st.teams.map((t) => Object.assign({}, t, { deck: t.deck.slice(), penalties: t.penalties.slice(), melds: t.melds.map((m) => Object.assign({}, m)) }));
    s.stack = st.stack.slice(); s.discard = st.discard.slice();
    return s;                                         // state.minds and state.log are copy-on-write (see witness, log), so they are shared
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildCards() {
    const cards = []; let id = 0;
    for (let d = 0; d < 2; d++) {
      for (const s of SUITS) for (let r = 1; r <= 13; r++) cards.push({ id: 'c' + id++, s, r });
      cards.push({ id: 'c' + id++, s: 'J', r: 0 });
      cards.push({ id: 'c' + id++, s: 'J', r: 0 });
    }
    return cards; // 108
  }

  /* ---------------- Meld validation ---------------- */
  const isNaturalAt = (c, r, suit) => c.s === suit && (c.r === r || (c.r === 1 && r === 14));

  function validateSeq(slots, suit) {
    if (slots.length < 3) return { ok: false, error: 'A meld needs at least 3 cards.' };
    let wilds = 0, nat = 0;
    const has = new Set();
    for (let i = 0; i < slots.length; i++) {
      const { c, r } = slots[i];
      if (r < 1 || r > 14) return { ok: false, error: 'The sequence runs past the Ace.' };
      if (i > 0 && r !== slots[i - 1].r - 1) return { ok: false, error: 'That would leave a gap in the sequence.' };
      has.add(r);
      if (isNaturalAt(c, r, suit)) { nat++; continue; }
      if (isWildType(c)) { wilds++; continue; }
      return { ok: false, error: cardName(c) + " doesn't fit this " + SUIT_SYM[suit] + ' sequence.' };
    }
    if (has.has(14) && has.has(1)) return { ok: false, error: "Sequences can't wrap around (K-A-2)." };
    if (wilds > CFG.maxWilds) return { ok: false, error: WILD_ERR };
    if (nat < 1) return { ok: false, error: 'A meld needs natural cards.' };
    return { ok: true, pure: wilds === 0, wilds };
  }

  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((x, i) => {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permutations(rest)) out.push([x].concat(p));
    });
    return out;
  }

  // Best valid arrangement of `cards` as a sequence of `suit`. Existing cards keep
  // their place where possible; a displaced wildcard prefers the low end, then the high end.
  function arrangeSeq(cards, suit, prevSlots, accept, collect) {
    const L = cards.length;
    if (L < 3) return { ok: false, error: 'A meld needs at least 3 cards.' };
    if (L > CFG.maxLen) return { ok: false, error: 'A sequence can hold at most 13 cards.' };
    const fixed = cards.filter((c) => !isWildType(c));
    const flex = cards.filter(isWildType);
    for (const c of fixed) if (c.s !== suit) return { ok: false, error: cardName(c) + " isn't " + SUIT_SYM[suit] + '.' };
    if (flex.length > CFG.maxWilds + 1) return { ok: false, error: WILD_ERR };
    const prev = {};
    (prevSlots || []).forEach((s) => { prev[s.c.id] = s.r; });
    let best = null, lastErr = 'These cards do not form a valid sequence.';
    for (let T = 14; T - L + 1 >= 1; T--) {
      const lo = T - L + 1;
      if (T === 14 && lo === 1) continue;
      const pos = {};
      let fail = false;
      for (const c of fixed) {
        let r = c.r;
        if (c.r === 1) r = T === 14 ? 14 : 1;
        if (r < lo || r > T || pos[r]) { fail = true; break; }
        pos[r] = c;
      }
      if (fail) continue;
      const free = [];
      for (let r = T; r >= lo; r--) if (!pos[r]) free.push(r);
      for (const perm of permutations(flex)) {
        const slots = [];
        for (let r = T; r >= lo; r--) slots.push({ c: pos[r] || perm[free.indexOf(r)], r });
        const v = validateSeq(slots, suit);
        if (!v.ok) { lastErr = v.error; continue; }
        if (accept && !accept(slots)) { lastErr = 'The wildcard cannot go in that spot.'; continue; }
        if (collect) collect.push({ slots, pure: v.pure });
        let score = 0;
        for (const s of slots) {
          if (prev[s.c.id] !== undefined && prev[s.c.id] === s.r) score += 1000;
          if (s.c.r === 2 && s.c.s === suit && s.r === 2) score += 100;
        }
        score -= T;
        if (!best || score > best.score) best = { score, slots, pure: v.pure };
      }
    }
    if (!best) return { ok: false, error: lastErr };
    return { ok: true, slots: best.slots, pure: best.pure };
  }

  function validateSet(cards, rank) {
    if (cards.length < 3) return { ok: false, error: 'A meld needs at least 3 cards.' };
    if (cards.length > CFG.maxLen) return { ok: false, error: 'A meld can hold at most 13 cards.' };
    let wilds = 0;
    for (const c of cards) {
      if (c.s !== 'J' && c.r === rank) continue;
      if (isWildType(c)) { wilds++; continue; }
      return { ok: false, error: cardName(c) + " doesn't match this set of " + rankTxt(rank) + 's.' };
    }
    if (wilds > CFG.maxWilds) return { ok: false, error: WILD_ERR };
    return { ok: true, pure: wilds === 0 };
  }

  function setRankOf(cards) {
    const nat = new Set(cards.filter((c) => !isWildType(c)).map((c) => c.r));
    if (nat.size > 1) return null;
    if (nat.size === 1) return [...nat][0];
    return cards.some((c) => c.r === 2 && c.s !== 'J') ? 2 : null;
  }

  function wildSig(slots, ids) {
    return slots.filter((x) => ids.includes(x.c.id)).map((x) => x.c.id + '@' + x.r).sort().join('|');
  }

  function newMeldOptions(cards, setsOnTable) {
    const v = checkNewMeld(cards, setsOnTable);
    if (!v.ok || v.meld.type !== 'seq') return [];
    const ids = cards.filter(isWildType).map((c) => c.id);
    if (!ids.length) return [];
    const all = []; arrangeSeq(cards, v.meld.suit, null, null, all);
    const seen = {}; const out = [];
    for (const l of all) {
      const sig = wildSig(l.slots, ids);
      if (seen[sig]) continue; seen[sig] = 1;
      out.push({
        sig, pure: l.pure, suit: v.meld.suit,
        label: l.slots.filter((x) => ids.includes(x.c.id)).map((x) =>
          cardName(x.c) + (isNaturalAt(x.c, x.r, v.meld.suit) ? ' as itself' : ' as ' + rankTxt(x.r))).join(', '),
        cards: l.slots.map((x) => ({ c: x.c, r: x.r })),
      });
    }
    return out;
  }

  function checkNewMeld(cards, setsOnTable, choice) {
    if (cards.length < 3) return { ok: false, error: 'Select at least 3 cards to start a meld.' };
    let suits = [...new Set(cards.filter((c) => !isWildType(c)).map((c) => c.s))];
    if (!suits.length) suits = [...new Set(cards.filter((c) => c.s !== 'J').map((c) => c.s))];
    let seqErr = null;
    if (suits.length === 1) {
      const ids = cards.filter(isWildType).map((c) => c.id);
      const a = arrangeSeq(cards, suits[0], null, choice ? (sl) => wildSig(sl, ids) === choice : null);
      if (a.ok) return { ok: true, meld: { type: 'seq', suit: suits[0], slots: a.slots, pure: a.pure } };
      seqErr = a.error;
    }
    const rank = setRankOf(cards);
    if (rank !== null) {
      const v = validateSet(cards, rank);
      if (v.ok) {
        if ((setsOnTable || 0) >= CFG.maxSets) return { ok: false, error: 'Your team already has 3 sets on the table.' };
        return { ok: true, meld: { type: 'set', rank, cards: cards.slice(), pure: v.pure } };
      }
      if (!seqErr || v.error === WILD_ERR) seqErr = v.error;
    }
    return { ok: false, error: seqErr || 'These cards do not form a sequence or a set.' };
  }

  function meldCards(m) { return m.type === 'seq' ? m.slots.map((s) => s.c) : m.cards; }
  function meldPure(m) {
    return m.type === 'seq' ? validateSeq(m.slots, m.suit).pure : validateSet(m.cards, m.rank).pure;
  }
  function isTimpa(m) {
    return m.type === 'seq' && m.slots.length === 13 && m.slots.every((s) => isNaturalAt(s.c, s.r, m.suit));
  }
  function isClosed(m) { return meldCards(m).length >= CFG.maxLen; }
  function isComplete(m) { return meldCards(m).length >= CFG.completeAt; }
  function countsPure(m) { return m.scored === 'timpa' || (m.scored !== 'impure' && meldPure(m)); }

  function checkAdd(meld, cards, wildPos) {
    if (!cards.length) return { ok: false, error: 'No cards selected.' };
    if (isClosed(meld)) return { ok: false, error: isTimpa(meld) ? 'This Timpa is complete and locked.' : 'This meld has 13 cards and is closed.' };
    if (meld.type === 'seq') {
      const wild = cards.find(isWildType);
      const ranks = meld.slots.map((x) => x.r);
      const hi = Math.max(...ranks), lo = Math.min(...ranks);
      let accept = null;
      if (wild && wildPos) {
        accept = (sl) => {
          const r = sl.find((x) => x.c.id === wild.id).r;
          if (wildPos === 'high') return r > hi;
          if (wildPos === 'low') return r < lo;
          return r < wildPos.below && r > wildPos.above;
        };
      }
      const all = meldCards(meld).concat(cards);
      const a = arrangeSeq(all, meld.suit, meld.slots, accept);
      if (a.ok) return { ok: true, slots: a.slots, pure: a.pure };
      if (wild && wildPos && arrangeSeq(all, meld.suit, meld.slots).ok)
        return { ok: false, error: cardName(wild) + " can't go in that spot. Drop it at a valid end or gap." };
      const displaced = meld.slots.find((x) => !isNaturalAt(x.c, x.r, meld.suit) &&
        cards.some((c) => isNaturalAt(c, x.r, meld.suit)));
      if (displaced) return { ok: false, error: 'No valid spot for the displaced ' + cardName(displaced.c) + ', so this move is blocked.' };
      return a;
    }
    const all = meld.cards.concat(cards);
    const v = validateSet(all, meld.rank);
    return v.ok ? { ok: true, cards: all, pure: v.pure } : v;
  }

  // checkAdd for one card, for the computer players: rules out the plain misfits (wrong suit or rank) without the full check.
  function addOne(meld, c) {
    if (!isWildType(c)) {
      if (meld.type === 'set') { if (c.r !== meld.rank) return NO_ADD; }
      else {
        if (c.s !== meld.suit) return NO_ADD;
        let lo = 99, hi = 0, has = false, wild = false;               // with a wildcard or a 2 in it the run can shift, so leave that to checkAdd
        for (const x of meld.slots) { if (x.r < lo) lo = x.r; if (x.r > hi) hi = x.r; if (x.r === c.r || (c.r === 1 && x.r === 14)) has = true; if (isWildType(x.c)) wild = true; }
        if (!wild && !has && c.r !== lo - 1 && c.r !== hi + 1 && !(c.r === 1 && hi === 13)) return NO_ADD;
      }
    }
    return checkAdd(meld, [c]);
  }
  const NO_ADD = { ok: false, error: 'That card does not fit this meld.' };

  function breaksPure(meld, result) {
    return isComplete(meld) && countsPure(meld) && meld.scored !== 'timpa' && !result.pure;
  }

  /* ---------------- Game state ---------------- */
  function createGame(opts) {
    const o = opts || {};
    const deck = shuffle(buildCards());
    const seats = [0, 1, 2, 3].map((i) => ({
      name: (o.seats && o.seats[i] && o.seats[i].name) || 'Player ' + (i + 1),
      avatar: (o.seats && o.seats[i] && o.seats[i].avatar) || '🥞',
      bot: !!(o.seats && o.seats[i] && o.seats[i].bot),
      level: (o.seats && o.seats[i] && o.seats[i].level) || 'smart',
      params: (o.seats && o.seats[i] && o.seats[i].params) || null,
      team: teamOf(i), hand: [],
    }));
    for (let k = 0; k < CFG.handSize; k++) for (let i = 0; i < 4; i++) seats[i].hand.push(deck.pop());
    const teams = [0, 1].map((t) => ({
      name: (o.teamNames && o.teamNames[t]) || (t === 0 ? 'Bhujia' : 'Kachori'),
      deck: deck.splice(deck.length - CFG.extraDeckSize, CFG.extraDeckSize),
      deckStatus: 'unclaimed', deckUsed: false, melds: [], penalties: [], bonus: 0,
    }));
    const discard = [deck.pop()];
    const state = {
      v: 1, gameId: o.gameId || null, seats, teams, stack: deck, discard,
      turn: Math.floor(Math.random() * 4), phase: 'draw', turnNo: 0,
      mustUse: null, pileBackup: null, drewFrom: null, pileRefused: false,
      finalTurn: false, nextMeldId: 1, log: [], result: null,
    };
    mindsOf(state);
    startTurn(state, state.turn, []);
    return state;
  }

  /* A game's starting position as card ids (every card's id is fixed: 'c0'..'c107' in a set order), small enough to keep.
     With the list of moves it replays the game exactly (js/gamelog.js records games, tools/analyze-games.js replays them). */
  function dealOf(state) {
    const ids = (a) => a.map((c) => c.id);
    return { hands: state.seats.map((p) => ids(p.hand)), decks: state.teams.map((t) => ids(t.deck)), stack: ids(state.stack), discard: ids(state.discard), turn: state.turn };
  }
  function fromDeal(deal, opts) {
    const byId = new Map(buildCards().map((c) => [c.id, c]));
    const get = (id) => { const c = byId.get(id); if (!c) throw new Error('unknown card ' + id); return c; };
    const s = createGame(opts);
    s.seats.forEach((p, i) => { p.hand = deal.hands[i].map(get); });
    s.teams.forEach((t, i) => { t.deck = deal.decks[i].map(get); });
    s.stack = deal.stack.map(get); s.discard = deal.discard.map(get); s.turn = deal.turn;
    return s;
  }
  const cardById = (() => { let m = null; return (id) => { if (!m) m = new Map(buildCards().map((c) => [c.id, c])); return m.get(id); }; })();

  function teamScore(t) {
    return t.melds.reduce((a, m) => a + (m.points || 0), 0) + t.bonus + t.penalties.reduce((a, p) => a + p.pts, 0);
  }

  function completedInfo(t) {
    let count = 0, pure = 0;
    for (const m of t.melds) {
      if (!isComplete(m)) continue;
      count++;
      if (countsPure(m)) pure++;
    }
    return { count, pure };
  }

  function canGoOut(state, team) {
    const t = state.teams[team];
    if (t.deckStatus !== 'claimed' || !t.deckUsed) return false;
    const ci = completedInfo(t);
    return ci.count >= 2 && ci.pure >= 1;
  }

  function goOutBlockers(state, team) {
    const t = state.teams[team]; const out = [];
    if (t.deckStatus === 'forfeited') return ['your extra deck was forfeited, so your team cannot go out'];
    if (t.deckStatus === 'unclaimed') out.push('claim your extra deck');
    else if (!t.deckUsed) out.push('meld at least one extra-deck card');
    const ci = completedInfo(t);
    if (ci.count < 2) out.push('complete ' + (2 - ci.count) + ' more meld(s)');
    if (ci.pure < 1) out.push('complete a pure meld');
    return out;
  }

  function log(state, events, text, kind) {
    const e = { text, kind: kind || 'info', turnNo: state.turnNo };
    state.log = (state.log.length >= 60 ? state.log.slice(1) : state.log.slice()).concat([e]);   // replaced, never edited: copies share it
    events.push(e);
  }

  function startTurn(state, seat, events) {
    state.turn = seat; state.phase = 'draw'; state.turnNo++;
    state.mustUse = null; state.pileBackup = null; state.drewFrom = null; state.pileRefused = false;
    state.finalTurn = state.stack.length === 0;
    if (state.finalTurn) {
      log(state, events, 'The centre stack is empty. ' + state.seats[seat].name + ' takes the final turn.', 'warn');
      if (!state.discard.length) finish(state, events, 'stack');
    }
  }

  function scoreMelds(state, team, events) {
    const t = state.teams[team];
    for (const m of t.melds) {
      if (!isComplete(m)) continue;
      if (!m.scored) {
        if (isTimpa(m)) { m.scored = 'timpa'; m.points = CFG.pts.timpa; log(state, events, t.name + ' completed a TIMPA! +500', 'good'); }
        else if (meldPure(m)) { m.scored = 'pure'; m.points = CFG.pts.pure; log(state, events, t.name + ' completed a pure meld +200', 'good'); }
        else { m.scored = 'impure'; m.points = CFG.pts.impure; log(state, events, t.name + ' completed an impure meld +100', 'good'); }
      } else if (m.scored !== 'timpa' && isTimpa(m)) {
        const add = CFG.pts.timpa - m.points;
        m.points = CFG.pts.timpa; m.scored = 'timpa';
        log(state, events, t.name + ' upgraded a meld to a TIMPA! +' + add, 'good');
      } else if (m.scored === 'pure' && !meldPure(m)) {
        m.scored = 'impure'; m.points = CFG.pts.impure;
        log(state, events, t.name + "'s pure meld became impure: 200 → 100", 'bad');
      }
    }
  }

  function checkStackEmpty(state, events) {
    if (state.stack.length) return;
    const pending = [0, 1].filter((i) => state.teams[i].deckStatus === 'unclaimed');
    if (!pending.length) { log(state, events, 'The centre stack is empty and no extra decks remain.', 'warn'); return; }
    for (const i of pending) {
      const t = state.teams[i];
      t.penalties.push({ reason: 'Extra deck forfeited (centre ran out)', pts: CFG.pts.deckPenalty });
      t.deckStatus = 'forfeited';
      state.stack.push(...t.deck); t.deck = [];
      log(state, events, t.name + "'s unclaimed extra deck moved to the centre. −100", 'bad');
    }
    shuffle(state.stack);
  }

  function claimDeck(state, seat, events, sameTurn) {
    const team = teamOf(seat); const t = state.teams[team];
    const cards = t.deck.map((c) => Object.assign({}, c, { x: team }));
    state.seats[seat].hand.push(...cards);
    t.deck = []; t.deckStatus = 'claimed';
    log(state, events, state.seats[seat].name + ' claimed ' + t.name + "'s extra deck" +
      (sameTurn ? ' and keeps playing.' : ' (playable next turn).'), 'good');
  }

  function finish(state, events, reason, outSeat) {
    for (const t of state.teams) {
      if (t.deckStatus === 'unclaimed') { t.penalties.push({ reason: 'Extra deck never claimed', pts: CFG.pts.deckPenalty }); t.deckStatus = 'forfeited'; }
      else if (t.deckStatus === 'claimed' && !t.deckUsed) t.penalties.push({ reason: 'No extra-deck card melded', pts: CFG.pts.deckPenalty });
    }
    if (reason === 'out') {
      const t = state.teams[teamOf(outSeat)];
      t.bonus += CFG.pts.goOut;
      log(state, events, state.seats[outSeat].name + ' went out! ' + t.name + ' +100', 'good');
    } else {
      log(state, events, 'Game over: the centre stack ran out.', 'warn');
    }
    state.phase = 'over';
    const scores = state.teams.map(teamScore);
    state.result = {
      reason, outSeat: outSeat === undefined ? null : outSeat, scores,
      winner: scores[0] === scores[1] ? null : (scores[0] > scores[1] ? 0 : 1),
      breakdown: state.teams.map((t) => ({
        name: t.name,
        completed: t.melds.filter((m) => m.scored).length,
        pure: t.melds.filter((m) => m.scored === 'pure').length,
        impure: t.melds.filter((m) => m.scored === 'impure').length,
        timpas: t.melds.filter((m) => m.scored === 'timpa').length,
        meldPoints: t.melds.reduce((a, m) => a + (m.points || 0), 0),
        bonus: t.bonus, penalties: t.penalties.slice(), total: teamScore(t),
      })),
    };
  }

  function endTurn(state, events) {
    scoreMelds(state, teamOf(state.turn), events);
    if (state.phase === 'over') return;
    if (state.finalTurn) { finish(state, events, 'stack'); return; }
    startTurn(state, (state.turn + 1) % 4, events);
  }

  function takeFromHand(hand, ids) {
    if (new Set(ids).size !== ids.length) return null;
    const out = [];
    for (const id of ids) {
      const c = hand.find((x) => x.id === id);
      if (!c) return null;
      out.push(c);
    }
    return out;
  }

  // mustName: set when this move used a picked-up top card, so the advice can't say "discard" (not allowed yet)
  function afterMeld(state, seat, events, mustName) {
    const team = teamOf(seat); const t = state.teams[team];
    const n = state.seats[seat].hand.length;
    const why = () => goOutBlockers(state, team).join(', ');
    const pileTip = () => ' Keep at least 2 cards: add the ' + mustName + ' to one of your melds, or tap Return.';
    if (n === 0) {
      if (t.deckStatus === 'unclaimed') { claimDeck(state, seat, events, true); return { ok: true }; }
      if (canGoOut(state, team)) { scoreMelds(state, team, events); finish(state, events, 'out', seat); return { ok: true }; }
      return { ok: false, error: "You can't empty your hand yet (" + why() + ').' + (mustName ? pileTip() : ' Keep a card and discard instead.') };
    }
    if (n === 1 && t.deckStatus !== 'unclaimed' && !canGoOut(state, team) && !state.finalTurn) {
      return { ok: false, error: (mustName ? "Your team can't go out yet (" + why() + ').' + pileTip()
        : 'That would leave one card and then an empty hand, but your team cannot go out yet (' + why() + '). Discard instead.') };
    }
    return { ok: true };
  }

  function markDeckUse(state, seat, cards) {
    const team = teamOf(seat);
    if (cards.some((c) => c.x === team)) state.teams[team].deckUsed = true;
  }

  /* ---------------- Memories ----------------
     Every player has their own memory (state.minds[seat]) of what they saw happen at the table. A computer player reads
     only its own. Everyone sees the same table, so what they note down is the same public play:
     known    - for each player, cards seen going into their hand with the face-up pile (dropped when melded or thrown)
     passed   - top cards each player chose not to take (drew from the centre instead, or returned the pile)
     threw    - cards each player threw
     took     - how many times each player took the pile
     lastMeld - the turn each player last put cards on the table (a long gap with a big hand: sitting on something)
     lastPlay - the turn of each player's latest meld/throw step (to read "they would have added that by now")
     Memories are copy-on-write: an update replaces the lists it changes, so copies of a game can share them. */
  const ctype = (c) => (c.s === 'J' ? 'J' : c.s + c.r);
  const newMind = () => ({ known: [[], [], [], []], passed: [[], [], [], []], threw: [[], [], [], []], took: [0, 0, 0, 0], lastPlay: [-1, -1, -1, -1], lastMeld: [-1, -1, -1, -1] });
  function mindsOf(state) { if (!state.minds) state.minds = [0, 1, 2, 3].map(newMind); return state.minds; }
  const mindOf = (state, seat) => mindsOf(state)[seat];
  // Everyone at the table watches player p do something; each writes it into their own memory.
  function witness(state, p, changes) {
    state.minds = mindsOf(state).map((m) => {
      if (!m) return m;                               // a phone in an online game only holds its own player's memory
      const n = Object.assign({}, m);
      for (const f in changes) n[f] = (m[f] || [-1, -1, -1, -1]).map((x, i) => (i === p ? changes[f](x) : x));   // (a game saved before a field existed)
      return n;
    });
  }
  const noted = (c, t, max) => (list) => list.concat([{ k: ctype(c), s: c.s, r: c.r, t }]).slice(-max);
  const dropIds = (ids) => (list) => list.filter((x) => !ids.includes(x.id));

  /* ---------------- apply() ---------------- */
  function apply(state, seat, action) {
    const events = [];
    if (!action || !action.type) return { ok: false, error: 'Unknown action.', events };
    if (state.phase === 'over') return { ok: false, error: 'The game is over.', events };
    if (seat !== state.turn) return { ok: false, error: "It isn't your turn.", events };
    let snap = null;                                  // taken just before a change that may still be refused
    const save = () => { snap = clone(state); };
    const fail = (error, code) => {
      if (snap) { Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, snap); }
      return { ok: false, error, code, events: [] };
    };
    const me = state.seats[seat]; const team = teamOf(seat); const T = state.teams[team];

    switch (action.type) {
      case 'draw': {
        if (state.phase !== 'draw') return fail('You have already drawn this turn.');
        if (!state.stack.length) return fail('The centre stack is empty. Pick up the discard pile or end the game.');
        const t0 = state.turnNo;
        witness(state, seat, Object.assign({ lastPlay: () => t0 },
          state.discard.length && !state.pileRefused ? { passed: noted(state.discard[state.discard.length - 1], t0, 10) } : {}));
        const c = state.stack.pop(); me.hand.push(c);
        state.phase = 'play'; state.drewFrom = 'stack'; state.lastDrawn = c.id;
        log(state, events, me.name + ' drew from the centre.');
        checkStackEmpty(state, events);
        return { ok: true, events, drawn: c.id };
      }
      case 'pickup': {
        if (state.phase !== 'draw') return fail('You have already drawn this turn.');
        if (!state.discard.length) return fail('The discard pile is empty.');
        if (state.pileRefused) return fail('You already returned the pile this turn. Draw from the centre.');
        const top = state.discard[state.discard.length - 1];
        state.pileBackup = state.discard.map((c) => c.id);
        const seenPile = state.discard.map((c) => ({ id: c.id, k: ctype(c) })), t0 = state.turnNo;
        witness(state, seat, { known: (l) => l.concat(seenPile), took: (n) => n + 1, lastPlay: () => t0 });
        me.hand.push(...state.discard); state.discard = [];
        state.mustUse = top.id; state.phase = 'play'; state.drewFrom = 'pile';
        log(state, events, me.name + ' picked up the discard pile (' + state.pileBackup.length + ' cards).');
        return { ok: true, events };
      }
      case 'returnPile': {
        if (state.drewFrom !== 'pile' || !state.mustUse) return fail('Nothing to return.');
        const back = state.pileBackup.map((id) => me.hand.find((c) => c.id === id));
        me.hand = me.hand.filter((c) => !state.pileBackup.includes(c.id));
        witness(state, seat, { known: dropIds(state.pileBackup), took: (n) => n - 1, passed: noted(back[back.length - 1], state.turnNo, 10) });   // looked, and could not use it
        state.discard = back; state.mustUse = null; state.pileBackup = null;
        state.drewFrom = null; state.phase = 'draw'; state.pileRefused = true;
        log(state, events, me.name + " couldn't use the top card and returned the pile.", 'warn');
        if (state.finalTurn) finish(state, events, 'stack');
        return { ok: true, events };
      }
      case 'newMeld': {
        if (state.phase !== 'play') return fail('Draw or pick up first.');
        const ids = action.cardIds || [];
        const cards = takeFromHand(me.hand, ids);
        if (!cards) return fail('Those cards are not in your hand.');
        if (state.mustUse && !ids.includes(state.mustUse)) return fail('First use the top card from the discard pile.');
        const sets = T.melds.filter((m) => m.type === 'set').length;
        const v = checkNewMeld(cards, sets, action.choice);
        if (!v.ok) return fail(v.error);
        save();
        const vm = v.meld;                              // one fixed shape for every meld (a deleted key makes copies slow)
        const m = { id: 'm' + state.nextMeldId++, team, scored: null, points: 0, lt: state.turnNo, type: vm.type,
          suit: vm.suit, rank: vm.rank, slots: vm.slots, cards: vm.cards };
        T.melds.push(m);
        const mustName = state.mustUse ? cardName(cards.find((c) => c.id === state.mustUse)) : null;
        me.hand = me.hand.filter((c) => !ids.includes(c.id));
        witness(state, seat, { known: dropIds(ids), lastMeld: () => state.turnNo });
        markDeckUse(state, seat, cards);
        state.mustUse = null;
        const r = afterMeld(state, seat, events, mustName);
        if (!r.ok) return fail(r.error);
        log(state, events, me.name + ' started a new ' + (m.type === 'seq' ? SUIT_SYM[m.suit] + ' sequence' : 'set of ' + rankTxt(m.rank) + 's') + '.');
        return { ok: true, events, meldId: m.id };
      }
      case 'addToMeld': {
        if (state.phase !== 'play') return fail('Draw or pick up first.');
        const m = T.melds.find((x) => x.id === action.meldId);
        if (!m) return fail("You can only add to your own team's melds.");
        const ids = action.cardIds || [];
        const cards = takeFromHand(me.hand, ids);
        if (!cards) return fail('Those cards are not in your hand.');
        if (state.mustUse && !ids.includes(state.mustUse)) return fail('First use the top card from the discard pile.');
        const v = checkAdd(m, cards, action.wildPos);
        if (!v.ok) return fail(v.error);
        if (breaksPure(m, v) && !action.confirmImpure)
          return fail('This wildcard will make your pure meld impure (200 → 100 at the end of your turn).', 'confirmImpure');
        save();                                       // the snapshot holds its own copy of every meld
        if (m.type === 'seq') m.slots = v.slots; else m.cards = v.cards;
        m.lt = state.turnNo; witness(state, seat, { known: dropIds(ids), lastMeld: () => state.turnNo });
        const mustName = state.mustUse ? cardName(cards.find((c) => c.id === state.mustUse)) : null;
        me.hand = me.hand.filter((c) => !ids.includes(c.id));
        markDeckUse(state, seat, cards);
        state.mustUse = null;
        const r = afterMeld(state, seat, events, mustName);
        if (!r.ok) return fail(r.error);
        log(state, events, me.name + ' added ' + cards.map(cardName).join(' ') + ' to a meld.');
        if (isTimpa(m)) log(state, events, 'TIMPA! The ' + SUIT_SYM[m.suit] + ' sequence is complete and locked.', 'good');
        return { ok: true, events };
      }
      case 'moveWild':
        return fail('Wildcards only move when a natural card takes their spot.');
      case 'discard': {
        if (state.phase !== 'play') return fail('Draw or pick up first.');
        if (state.mustUse) return fail('First use the top card from the discard pile (or return the pile).');
        const i = me.hand.findIndex((c) => c.id === action.cardId);
        if (i < 0) return fail('That card is not in your hand.');
        if (me.hand.length === 1 && !state.finalTurn && T.deckStatus !== 'unclaimed' && !canGoOut(state, team))
          return fail("You can't empty your hand yet (" + goOutBlockers(state, team).join(', ') + ').');
        const c = me.hand.splice(i, 1)[0];
        state.discard.push(c);
        witness(state, seat, { known: dropIds([c.id]), threw: noted(c, state.turnNo, 14) });
        log(state, events, me.name + ' discarded ' + cardName(c) + '.');
        if (state.finalTurn) { scoreMelds(state, team, events); finish(state, events, 'stack'); return { ok: true, events }; }
        if (me.hand.length === 0) {
          if (T.deckStatus === 'unclaimed') claimDeck(state, seat, events, false);
          else if (canGoOut(state, team)) { scoreMelds(state, team, events); finish(state, events, 'out', seat); return { ok: true, events }; }
          else return fail("You can't empty your hand yet (" + goOutBlockers(state, team).join(', ') + ').');
        }
        endTurn(state, events);
        return { ok: true, events };
      }
      case 'endGame': {
        if (!state.finalTurn) return fail('You can only end the game on the final turn.');
        if (state.mustUse) return fail('First use the top card (or return the pile).');
        scoreMelds(state, team, events);
        finish(state, events, 'stack');
        return { ok: true, events };
      }
      case 'timeout': {
        if (state.phase !== 'draw') return fail('Timer only applies to the draw step.');
        log(state, events, me.name + ' ran out of time: auto draw & discard.', 'warn');
        if (state.finalTurn || !state.stack.length) { finish(state, events, 'stack'); return { ok: true, events }; }
        const c = state.stack.pop(); me.hand.push(c); state.phase = 'play'; state.drewFrom = 'stack';
        checkStackEmpty(state, events);
        me.hand = me.hand.filter((x) => x.id !== c.id); state.discard.push(c);
        witness(state, seat, { threw: noted(c, state.turnNo, 14) });
        endTurn(state, events);
        return { ok: true, events };
      }
      default: return fail('Unknown action.');
    }
  }

  /* ---------------- Utilities ---------------- */
  function redact(state, seat) {
    const s = clone(state);
    s.seats.forEach((p, i) => { if (i !== seat) { p.handCount = p.hand.length; p.hand = []; } });
    s.stackCount = s.stack.length; s.stack = [];
    s.teams.forEach((t) => { t.deckCount = t.deck.length; t.deck = []; });
    delete s.finishPlan;                                  // a computer player's private plan (card ids of its hand)
    if (s.minds) s.minds = s.minds.map((m, i) => (i === seat ? m : null));   // each phone gets only its own player's memory
    if (s.turn !== seat) delete s.lastDrawn;              // card ids name the card, so only the drawer may see this one
    return s;
  }

  function countCards(state) {
    let n = state.stack.length + state.discard.length;
    state.seats.forEach((p) => { n += p.hand.length; });
    state.teams.forEach((t) => { n += t.deck.length; t.melds.forEach((m) => { n += meldCards(m).length; }); });
    return n;
  }

  /* ---------------- Basic computer player ---------------- */
  const goodSetRank = (r) => CFG.botSetRanks.includes(r);
  function tryOn(state, seat, act) { return apply(clone(state), seat, act).ok; }

  function combos(arr, k, cap) {
    const out = [];
    (function rec(start, cur) {
      if (out.length >= cap) return;
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }

  const TIER = { addPureSeq: 0, newPureSeq: 1, addPureSet: 2, newPureSet: 3, addImpureSeq: 4, newImpureSeq: 5, impureEdgeSet: 6, middleSet: 7, breakPure: 8 };

  function rankAdd(m, v) {
    if (breaksPure(m, v) || (countsPure(m) && !v.pure)) return TIER.breakPure;
    if (m.type === 'set') {
      if (!goodSetRank(m.rank)) return TIER.middleSet;
      return v.pure ? TIER.addPureSet : TIER.impureEdgeSet;
    }
    return v.pure ? TIER.addPureSeq : TIER.addImpureSeq;
  }
  function rankNew(meld) {
    if (meld.type === 'set') {
      if (!goodSetRank(meld.rank)) return TIER.middleSet;
      return meld.pure ? TIER.newPureSet : TIER.impureEdgeSet;
    }
    return meld.pure ? TIER.newPureSeq : TIER.newImpureSeq;
  }

  function findUseFor(state, seat, cardId, maxTier) {
    const limit = maxTier === undefined ? TIER.breakPure : maxTier;
    const me = state.seats[seat]; const T = state.teams[teamOf(seat)];
    const card = me.hand.find((c) => c.id === cardId);
    const cands = [];
    for (const m of T.melds) {
      const v = addOne(m, card);
      if (!v.ok) continue;
      const act = { type: 'addToMeld', meldId: m.id, cardIds: [cardId] };
      const tier = rankAdd(m, v);
      if (tier === TIER.breakPure) act.confirmImpure = true;
      cands.push({ tier, act });
    }
    const others = me.hand.filter((c) => c.id !== cardId);
    const near = others.filter((c) => isWildType(c) || (!isWildType(card) && (c.r === card.r || (c.s === card.s && Math.abs(c.r - card.r) <= 2))));
    const sets = T.melds.filter((m) => m.type === 'set').length;
    for (const pair of combos(near, 2, 400)) {
      const cards = [card].concat(pair);
      const v = checkNewMeld(cards, sets);
      if (v.ok) cands.push({ tier: rankNew(v.meld), act: { type: 'newMeld', cardIds: cards.map((c) => c.id) } });
    }
    cands.sort((a, b) => a.tier - b.tier);
    for (const c of cands) if (c.tier <= limit && tryOn(state, seat, c.act)) return c.act;
    return null;
  }

  // Low-value use of the picked-up top card: adding it to a completed (7+) impure meld (scores
  // nothing more), or starting a new impure meld that spends a wildcard from the hand.
  function isLowValueUse(state, seat, act) {
    const T = state.teams[teamOf(seat)];
    if (act.type === 'addToMeld') {
      const m = T.melds.find((x) => x.id === act.meldId);
      return !!m && isComplete(m) && !countsPure(m);
    }
    if (act.type === 'newMeld') {
      const hand = state.seats[seat].hand;
      const cards = act.cardIds.map((id) => hand.find((c) => c.id === id));
      const v = checkNewMeld(cards, T.melds.filter((m) => m.type === 'set').length);
      if (!v.ok || v.meld.pure) return false;
      return cards.some((c) => c.id !== state.mustUse && isWildType(c));
    }
    return false;
  }

  // Plays out the rest of this turn on a copy after picking up the pile and reports
  // whether the low-value use pays off: another pile card gets melded, or the player goes out.
  function pilePaysOff(state, seat) {
    const s = clone(state);
    if (!apply(s, seat, { type: 'pickup' }).ok) return { ok: false };
    const pileIds = s.pileBackup.slice();
    const topId = s.mustUse;
    const first = findUseFor(s, seat, topId, TIER.impureEdgeSet);
    if (!first) return { ok: false };
    if (!isLowValueUse(s, seat, first)) return { ok: true, reason: 'good use' };
    if (!apply(s, seat, first).ok) return { ok: false };
    const turnNo = s.turnNo;
    for (let i = 0; i < 40 && s.phase === 'play' && s.turn === seat && s.turnNo === turnNo; i++) {
      const a = botNextAction(s, seat, true);
      if (!a || a.type === 'discard' || a.type === 'endGame') {
        if (a) apply(s, seat, a);
        break;
      }
      if (!apply(s, seat, a).ok) break;
    }
    if (s.phase === 'over' && s.result && s.result.reason === 'out' && s.result.outSeat === seat) return { ok: true, reason: 'goes out' };
    const melded = new Set();
    s.teams[teamOf(seat)].melds.forEach((m) => meldCards(m).forEach((c) => melded.add(c.id)));
    const others = pileIds.filter((id) => id !== topId && melded.has(id));
    return others.length ? { ok: true, reason: 'other pile cards melded' } : { ok: false };
  }

  function findNewMelds(hand, setsOnTable) {
    const seqs = [], sets = [];
    const nat = hand.filter((c) => !isWildType(c));
    for (const s of SUITS) {
      const byRank = {};
      nat.filter((c) => c.s === s).forEach((c) => { byRank[c.r] = byRank[c.r] || c; if (c.r === 1) byRank[14] = byRank[14] || c; });
      let run = [];
      for (let r = 14; r >= 0; r--) {
        if (byRank[r] && !run.some((c) => c.id === byRank[r].id)) run.push(byRank[r]);
        else { if (run.length >= 3) seqs.push(run.slice()); run = byRank[r] ? [byRank[r]] : []; }
      }
    }
    if (setsOnTable < CFG.maxSets) {
      const byR = {};
      nat.forEach((c) => { (byR[c.r] = byR[c.r] || []).push(c); });
      Object.keys(byR).forEach((r) => { if (byR[r].length >= 3 && goodSetRank(+r)) sets.push(byR[r]); });
    }
    seqs.sort((a, b) => b.length - a.length);
    sets.sort((a, b) => b.length - a.length);
    return seqs.concat(sets);
  }

  function hasSeqNeighbour(hand, c) {
    return hand.some((o) => o.id !== c.id && !isWildType(o) && o.s === c.s && Math.abs(o.r - c.r) <= 2);
  }

  function discardChoice(state, seat) {
    const me = state.seats[seat]; const T = state.teams[teamOf(seat)];
    let best = null;
    for (const c of me.hand) {
      let score = 0;
      if (isWildType(c)) score += 100;
      for (const o of me.hand) {
        if (o.id === c.id) continue;
        if (o.r === c.r && c.s !== 'J') score += goodSetRank(c.r) ? 2 : 1;
        if (o.s === c.s && c.s !== 'J' && Math.abs(o.r - c.r) <= 2) score += 3;
      }
      if (T.melds.some((m) => addOne(m, c).ok)) score += 40;
      if (c.x !== undefined) score += 5;
      if (!best || score < best.score) best = { score, id: c.id };
    }
    return best && best.id;
  }

  // 'easy' level: the original prototype computer player, unchanged.
  function botEasy(state, seat, simulating) {
    if (state.phase === 'over' || state.turn !== seat) return null;
    const me = state.seats[seat]; const T = state.teams[teamOf(seat)];
    if (state.phase === 'draw') {
      if (state.discard.length && !state.pileRefused) {
        const test = clone(state);
        if (apply(test, seat, { type: 'pickup' }).ok && findUseFor(test, seat, test.mustUse, TIER.impureEdgeSet)) {
          if (!CFG.botPilePayoff || simulating || pilePaysOff(state, seat).ok) return { type: 'pickup' };
        }
      }
      if (!state.stack.length) return { type: 'endGame' };
      return { type: 'draw' };
    }
    if (state.mustUse) return findUseFor(state, seat, state.mustUse) || { type: 'returnPile' };
    const melds = T.melds.filter((m) => m.type === 'seq').concat(T.melds.filter((m) => m.type === 'set'));
    for (const m of melds) {
      const len = meldCards(m).length;
      for (const c of me.hand) {
        if (isWildType(c) && (len < 5 || countsPure(m))) continue;
        if (m.type === 'set' && !goodSetRank(m.rank) && hasSeqNeighbour(me.hand, c)) continue;
        const v = addOne(m, c);
        if (!v.ok || breaksPure(m, v) || (countsPure(m) && !v.pure)) continue;
        const act = { type: 'addToMeld', meldId: m.id, cardIds: [c.id] };
        if (tryOn(state, seat, act)) return act;
      }
    }
    const sets = T.melds.filter((m) => m.type === 'set').length;
    for (const g of findNewMelds(me.hand, sets)) {
      const act = { type: 'newMeld', cardIds: g.map((c) => c.id) };
      if (checkNewMeld(g, sets).ok && tryOn(state, seat, act)) return act;
    }
    if (state.finalTurn) return { type: 'endGame' };
    const ordered = [discardChoice(state, seat)].concat(me.hand.map((c) => c.id));
    for (const id of ordered) {
      const act = { type: 'discard', cardId: id };
      if (tryOn(state, seat, act)) return act;
    }
    return { type: 'discard', cardId: me.hand[0].id };
  }

  /* ---------------- Smart computer player ----------------
     Same rules as everyone else; it just plays better. It uses wildcards instead of hoarding them,
     starts melds from any rank (and from two cards plus a wildcard), dumps junk it can no longer use,
     avoids throwing cards the opponents can build on, and won't go out if that would lose the game. */
  // Tunable weights (found by self-play in test/bot-tune.js). A seat can override any of them with seat.params.
  CFG.smart = {
    allSets: 0, wildNew: 1, wildAdd: 1, danger: 1, spendWild: 1, goOutCheck: 1,
    wildNewHand: 8, wildNewU: .3, wildAddLen: 4, wildAddU: .35, wildAddAny: .7,
    dangerW: 30, wildKeep: 70, wildBase: 15, sameRankW: 12, adjW: 26, gapW: 15, fitW: 60,
    addBase: 50, addLenW: 6, newBase: 60, newLenW: 12, wildNewBase: 28, completeW: 90, pureW: 80, pickTier: 6, pilePayoff: 1, wildStrict: 1, wildDead: .35, wildLateU: .88, wildSlim: 0, wildSlimU: .6,
    // expert play: sets only from edge ranks (A K Q J 3 4) until the game is nearly over, card counting for outs,
    // and keeping a wildcard back while the natural card that would finish a pure meld is still likely to come
    pureFirst: 1, pureU: .95, pureNewU: .6, pureLive: 1, finish: 1, outMaxHand: 9, outBudget: 400, outBranch: 7, outDepth: 5, team: 0, claim: 0, rollMarginW: .0004, dangerUse: 45, dangerPile: .4, dangerDone: 30, infMeld: .15, infPass: .75, infThrow: .55, infAge: 16, infHold: 1, infSit: 1, infSitHand: 9, infSitTurns: 12, rollouts: 0, rollMs: 0, rollCands: 4, expertMs: 300, plan: 0, planDrawMs: 0, planThrows: 4, planThrowsAlt: 2, planNoWild: 1, planLoose: 0, planStep: 4, planMinDeals: 2, planMaxDeals: 400, setMode: 1, midSetU: .85, midSetHand: 3, setKeepRuns: 1, outsW: 9, setOutsW: 4, dangerGapW: 10, waitLive: 2, waitU: .55,
  };
  // Settings for one seat. Asked for many times a move, so kept per seat settings, level and think time (never edited by callers).
  const PCACHE = new WeakMap(), NOPARAMS = {};
  const smartParams = (state, seat) => {
    const st = state.seats[seat], own = st.params || NOPARAMS, key = st.level + '|' + CFG.smart.expertMs;
    let byKey = PCACHE.get(own); if (!byKey) PCACHE.set(own, byKey = {});
    return byKey[key] || (byKey[key] = makeParams(state, seat));
  };
  const makeParams = (state, seat) => {
    const P = Object.assign({}, CFG.smart, state.seats[seat].params || null);
    if (state.seats[seat].level === 'expert') {                     // the Expert level adds lookahead, reads the table and plays for the team
      if (!P.rollouts && !P.rollMs) P.rollMs = P.expertMs;
      const own = state.seats[seat].params || {};
      if (own.team === undefined) P.team = 1;
      if (own.claim === undefined) P.claim = 1;
      if (own.plan === undefined) P.plan = 1;
      if (own.planDrawMs === undefined) P.planDrawMs = Math.round(P.rollMs * .6);   // take the pile or draw: searched too
    }
    return P;
  };
  const urgency = (state) => Math.max(0, Math.min(1, 1 - state.stack.length / 33));   // 0 at the start, 1 when the centre is empty

  // Card counting: two decks, so each suited card exists twice. What the player can see: its own hand, the
  // discard pile and every meld. The rest is unseen (in the stack, the extra decks or other players' hands).
  function seenCounts(state, seat) {
    const m = new Int8Array(53); const add = (c) => { m[c.s === 'J' ? 0 : SUIT_IX[c.s] * 13 + c.r]++; };   // typed array: much faster than string keys
    state.seats[seat].hand.forEach(add); state.discard.forEach(add);
    state.teams.forEach((t) => t.melds.forEach((mm) => meldCards(mm).forEach(add)));
    return m;
  }
  const unseen = (seen, s, r) => Math.max(0, 2 - seen[SUIT_IX[s] * 13 + r]);
  const nbrs = (r) => r === 1 ? [[2, 1], [3, 2], [13, 1], [12, 2]] : r === 2 ? [[1, 1], [3, 1], [4, 2]] : r === 13 ? [[12, 1], [1, 1], [11, 2]] : r === 12 ? [[11, 1], [13, 1], [10, 2], [1, 2]]
    : [[r - 1, 1], [r + 1, 1], [r - 2, 2], [r + 2, 2]].filter((x) => x[0] >= 1 && x[0] <= 13);
  const edgeRank = (r) => goodSetRank(r) || r === 2;

  /* Reading the other hands. For every other player: the cards everyone saw them pick up (certain), and for each card
     nobody has seen, how likely it is to sit in their hand rather than in the centre stack, an extra deck or another hand.
     Each player's share starts equal per hidden card and is lowered for cards their own play argues against:
       - they would have added it: a natural card that extends one of their team's melds, after they have had a turn since
       - they passed on a top card: cards that would have let them use it
       - they threw a card: its close neighbours (players keep connected cards) */
  const TYPES = (() => { const t = ['J']; for (const su of SUITS) for (let r = 1; r <= 13; r++) t.push(su + r); return t; })();
  const typeTotal = (k) => (k === 'J' ? 4 : 2);
  function beliefs(state, seat, P) {
    P = P || CFG.smart;
    const mem = mindOf(state, seat), turn = state.turnNo;          // this player's own memory, nobody else's
    const seen = {}; const see = (k) => { seen[k] = (seen[k] || 0) + 1; };
    state.seats[seat].hand.forEach((c) => see(ctype(c)));
    state.discard.forEach((c) => see(ctype(c)));
    state.teams.forEach((t) => t.melds.forEach((m) => meldCards(m).forEach((c) => see(ctype(c)))));
    const seats = [0, 1, 2, 3].map((p) => {
      if (p === seat) return null;
      const known = {}; mem.known[p].forEach((x) => { known[x.k] = (known[x.k] || 0) + 1; see(x.k); });
      const n = state.seats[p].hand.length;
      return { n, known, unk: Math.max(0, n - mem.known[p].length), w: {} };
    });
    const mul = (b, k, f) => { b.w[k] = (b.w[k] === undefined ? 1 : b.w[k]) * f; };
    for (let p = 0; p < 4; p++) {
      const b = seats[p]; if (!b || !b.unk) continue;
      // their team's melds: anything natural they held that fits would normally have been added already
      if (b.n > 2) for (const m of state.teams[teamOf(p)].melds) {
        if ((m.lt || 0) >= mem.lastPlay[p] || isClosed(m)) continue;
        const suits = m.type === 'seq' ? [m.suit] : SUITS;
        for (const su of suits) for (let r = 1; r <= 13; r++) {
          if (r === 2 || (m.type === 'set' && r !== m.rank)) continue;
          if (addOne(m, { id: '?', s: su, r }).ok) mul(b, su + r, P.infMeld);
        }
      }
      // hoarding: cards they took from the pile and still hold are being kept for something, so the cards that would
      // go with them (same suit next door, same rank) are more likely in that hand too
      if (P.infHold !== 1) for (const x of mem.known[p]) {
        const c = cardById(x.id); if (!c || isWildType(c)) continue;
        for (const [r2, d] of nbrs(c.r)) if (r2 !== 2) mul(b, c.s + r2, d === 1 ? P.infHold : (1 + P.infHold) / 2);
        for (const su of SUITS) if (su !== c.s) mul(b, su + c.r, (1 + P.infHold) / 2);
      }
      // a long hold: a big hand and no meld step for many turns suggests waiting on wildcards and near-finished melds
      if (P.infSit !== 1 && b.n >= P.infSitHand && turn - Math.max(0, (mem.lastMeld || [])[p] || 0) >= P.infSitTurns) for (const k of ['J', 'S2', 'H2', 'D2', 'C2']) mul(b, k, P.infSit);
      for (const e of mem.passed[p]) {
        if (e.s === 'J' || e.r === 2 || turn - e.t > P.infAge) continue;
        for (const [r2, d] of nbrs(e.r)) if (r2 !== 2) mul(b, e.s + r2, d === 1 ? P.infPass : (1 + P.infPass) / 2);
        for (const su of SUITS) if (su !== e.s) mul(b, su + e.r, (1 + P.infPass) / 2);
      }
      for (const e of mem.threw[p]) {
        if (e.s === 'J' || e.r === 2 || turn - e.t > P.infAge) continue;
        for (const [r2, d] of nbrs(e.r)) if (r2 !== 2) mul(b, e.s + r2, d === 1 ? P.infThrow : (1 + P.infThrow) / 2);
      }
    }
    const rest = state.stack.length + state.teams.reduce((a, t) => a + t.deck.length, 0);
    const cache = {};
    // share: chance that one particular unseen copy of k is in p's hand; u: unseen copies of k
    const info = (p, k) => {
      const key = p + k; if (cache[key]) return cache[key];
      let den = rest; for (const q of seats) if (q) den += q.unk * (q.w[k] === undefined ? 1 : q.w[k]);
      const b = seats[p], u = Math.max(0, typeTotal(k) - (seen[k] || 0));
      const share = den > 0 && b ? b.unk * (b.w[k] === undefined ? 1 : b.w[k]) / den : 0;
      return (cache[key] = { u, share });
    };
    return {
      seats,
      // probability that player p holds at least one card of type k ('J' or suit+rank, e.g. 'H7')
      has(p, k) { const b = seats[p]; if (!b) return 0; if (b.known[k]) return 1; const i = info(p, k); return 1 - Math.pow(1 - i.share, i.u); },
      // expected number of such cards in p's hand
      count(p, k) { const b = seats[p]; if (!b) return 0; const i = info(p, k); return (b.known[k] || 0) + i.u * i.share; },
      // probability p holds at least one wildcard (Joker or any 2)
      wild(p) { let none = 1; for (const k of ['J', 'S2', 'H2', 'D2', 'C2']) none *= 1 - this.has(p, k); return 1 - none; },
      // copies of k that can still help this player's team: not seen anywhere and not likely in an opponent's hand,
      // plus the ones the partner is known to hold (the partner can add them to the team's melds)
      free(k) {
        const o1 = (seat + 1) % 4, o2 = (seat + 3) % 4, pa = (seat + 2) % 4;
        const i1 = info(o1, k), i2 = info(o2, k);
        return Math.max(0, i1.u * (1 - i1.share - i2.share)) + ((seats[pa] && seats[pa].known[k]) || 0);
      },
    };
  }

  // How likely player q can use card c as the top of the pile (and so take the whole pile): it fits one of q's team
  // melds, or q holds cards that make a new meld with it.
  function useChance(state, B, q, c) {
    const T = state.teams[teamOf(q)];
    if (T.melds.some((m) => addOne(m, c).ok)) return 1;
    const has = (k) => B.has(q, k), pw = B.wild(q);
    const sets = T.melds.filter((m) => m.type === 'set').length;
    let none = 1;
    if (isWildType(c)) {                                   // a wildcard joins any two natural cards of a run (or a pair)
      for (const su of SUITS) for (let r = 1; r <= 13; r++) {
        if (r === 2) continue; const a = has(su + r); if (a < .01) continue;
        for (const d of [1, 2]) { let r2 = r + d; if (r2 === 14) r2 = 1; if (r2 > 13 || r2 === 2) continue; none *= 1 - a * has(su + r2); }
      }
      return 1 - none;
    }
    const s = c.s, nat = (x) => { if (x === 14) x = 1; return (x < 1 || x > 13 || x === 2) ? 0 : has(s + x); };
    for (const pos of (c.r === 1 ? [1, 14] : [c.r])) {
      for (const [a, b] of [[pos - 2, pos - 1], [pos - 1, pos + 1], [pos + 1, pos + 2]]) none *= 1 - nat(a) * nat(b);   // two naturals
      let noNb = 1; for (const x of [pos - 2, pos - 1, pos + 1, pos + 2]) noNb *= 1 - nat(x);
      none *= 1 - pw * (1 - noNb);                                                                        // one natural + a wildcard
    }
    if (sets < CFG.maxSets) {                                                                             // a set of this rank
      const ps = SUITS.map((su) => has(su + c.r));
      const p0 = ps.reduce((a, x) => a * (1 - x), 1);
      const p1 = ps.reduce((a, x, i) => a + x * ps.reduce((b, y, j) => (j === i ? b : b * (1 - y)), 1), 0);
      none *= 1 - Math.max(0, 1 - p0 - p1); none *= 1 - pw * (1 - p0);
    }
    return 1 - none;
  }

  // Would going out right now (scoring this team's melds first) win the game?
  function goOutWins(state, seat) {
    const s = clone(state); const team = teamOf(seat);
    scoreMelds(s, team, []);
    finish(s, [], 'out', seat);
    return s.result.winner === team;
  }
  function endsGameBadly(state, seat, act) {
    const s = clone(state);
    if (!apply(s, seat, act).ok) return true;
    return s.phase === 'over' && s.result && s.result.reason === 'out' && s.result.winner !== teamOf(seat);
  }

  function findNewMeldsAll(hand, setsOnTable, P, late) {
    const seqs = [], sets = [];
    const nat = hand.filter((c) => !isWildType(c));
    for (const s of SUITS) {
      const byRank = {};
      nat.filter((c) => c.s === s).forEach((c) => { byRank[c.r] = byRank[c.r] || c; if (c.r === 1) byRank[14] = byRank[14] || c; });
      let run = [];
      for (let r = 14; r >= 0; r--) {
        if (byRank[r] && !run.some((c) => c.id === byRank[r].id)) run.push(byRank[r]);
        else { if (run.length >= 3) seqs.push(run.slice()); run = byRank[r] ? [byRank[r]] : []; }
      }
    }
    if (setsOnTable < CFG.maxSets) {
      const byR = {};
      nat.forEach((c) => { (byR[c.r] = byR[c.r] || []).push(c); });
      Object.keys(byR).forEach((r) => {
        if (!(P.allSets || !P.setMode || late || edgeRank(+r))) return;                    // no 777 or 888 until the game is nearly over
        let g = byR[r];
        if (P.setKeepRuns && !late) g = g.filter((c) => !nat.some((o) => o.s === c.s && Math.abs(o.r - c.r) === 1));   // those cards are worth more in a run
        if (g.length >= 3) sets.push(g);
      });
    }
    seqs.sort((a, b) => b.length - a.length);
    sets.sort((a, b) => b.length - a.length);
    return seqs.concat(sets);
  }

  // New melds that spend one wildcard: two to four natural cards plus a Joker or 2.
  function findWildMelds(hand, setsOnTable, P, late) {
    const wild = hand.find(isWildType); if (!wild) return [];
    const nat = hand.filter((c) => !isWildType(c)); const out = [];
    for (const s of SUITS) {
      const cs = []; const seen = new Set();
      nat.filter((c) => c.s === s).forEach((c) => { if (!seen.has(c.r)) { seen.add(c.r); cs.push(c); } });
      for (let k = 2; k <= Math.min(4, cs.length); k++) {
        for (const g of combos(cs, k, 120)) {
          const lo = Math.min(...g.map((c) => c.r === 1 ? 1 : c.r)), hi = Math.max(...g.map((c) => c.r));
          if (hi - lo > k + 1 && !g.some((c) => c.r === 1)) continue;
          const v = checkNewMeld(g.concat([wild]), setsOnTable);
          if (v.ok && v.meld.type === 'seq') out.push(g.concat([wild]));
        }
      }
    }
    if (setsOnTable < CFG.maxSets) {
      const byR = {}; nat.forEach((c) => { (byR[c.r] = byR[c.r] || []).push(c); });
      Object.keys(byR).forEach((r) => { if (byR[r].length >= 2 && (P.allSets || !P.setMode || late || edgeRank(+r))) out.push(byR[r].concat([wild])); });
    }
    out.sort((a, b) => b.length - a.length);
    return out;
  }

  function smartMeldMoves(state, seat, P, B) {
    const me = state.seats[seat], T = state.teams[teamOf(seat)], u = urgency(state);
    const sets = T.melds.filter((m) => m.type === 'set').length, hand = me.hand, moves = [];
    const late = u > P.midSetU || hand.length <= P.midSetHand, seen = seenCounts(state, seat);
    const unseenB = (su, r) => (B ? B.free(su + r) : unseen(seen, su, r));
    for (const m of T.melds) {
      const len = meldCards(m).length, wasPure = meldPure(m);
      for (const c of hand) {
        const v = addOne(m, c); if (!v.ok) continue;
        const usesWild = wasPure && !v.pure;
        let score = P.addBase + len * P.addLenW + (m.type === 'set' ? 4 : 0);
        if (len + 1 === CFG.completeAt) score += P.completeW + (v.pure ? P.pureW : 0);
        const act = { type: 'addToMeld', meldId: m.id, cardIds: [c.id] };
        if (usesWild) {
          if (!P.wildAdd) continue;
          const finishing = len + 1 >= CFG.completeAt && !isComplete(m);
          if (isComplete(m)) continue;                            // would turn a scored pure meld impure for nothing
          if (P.wildStrict) {
            // A meld that is still pure is worth double, so a wildcard needs a solid reason to go in (Raghav, 10 Nov 2026):
            // the natural cards that could still fit are gone, or the game is nearly over. (Claiming the extra deck and
            // going out are planned separately by findGoOut and may still spend it.) With one pure meld already banked
            // the team can afford to finish a second one impure when only a slim chance of the natural card is left.
            let live;
            if (m.type === 'seq') {
              const rs1 = m.slots.map((x) => x.r), hi1 = Math.max(...rs1), lo1 = Math.min(...rs1);
              live = (hi1 < 14 ? unseenB(m.suit, hi1 === 13 ? 1 : hi1 + 1) : 0) + (lo1 > 1 ? unseenB(m.suit, lo1 - 1) : 0);
            } else live = SUITS.reduce((a, su) => a + unseenB(su, m.rank), 0);
            const dead = live < P.wildDead, banked = completedInfo(T).pure > 0;
            if (!(dead || u > P.wildLateU || (finishing && banked && live < P.wildSlim && u > P.wildSlimU))) continue;
          }
          if (!(finishing || (len >= P.wildAddLen && u > P.wildAddU) || u > P.wildAddAny)) continue;
          if (m.type === 'seq' && P.pureFirst && u < P.pureU && completedInfo(T).pure === 0) {     // the team needs one pure meld to go out: protect it
            const rs0 = m.slots.map((x) => x.r), hi0 = Math.max(...rs0), lo0 = Math.min(...rs0);
            const live0 = (hi0 < 14 ? unseenB(m.suit, hi0 === 13 ? 1 : hi0 + 1) : 0) + (lo0 > 1 ? unseenB(m.suit, lo0 - 1) : 0);
            if (live0 >= P.pureLive) continue;
          }
          if (m.type === 'seq' && u < P.waitU) {                  // a pure meld is worth double: wait while the natural card is still likely to come
            const rs = m.slots.map((x) => x.r), hi = Math.max(...rs), lo = Math.min(...rs);
            const live = (hi < 14 ? unseenB(m.suit, hi === 13 ? 1 : hi + 1) : 0) + (lo > 1 ? unseenB(m.suit, lo - 1) : 0);
            if (live >= P.waitLive) continue;
          }
          score -= 55; act.confirmImpure = true;
        }
        moves.push({ score, act });
      }
    }
    const handHasWild = hand.some(isWildType);
    for (const g of findNewMeldsAll(hand, sets, P, late)) {
      if (!checkNewMeld(g, sets).ok) continue;
      moves.push({ score: P.newBase + g.length * P.newLenW, act: { type: 'newMeld', cardIds: g.map((c) => c.id) } });
    }
    const needPure = P.pureFirst && completedInfo(T).pure === 0 && u < P.pureNewU;
    if (P.wildNew && !needPure && handHasWild && (hand.length >= P.wildNewHand || u > P.wildNewU || T.deckStatus === 'unclaimed' && hand.length <= 5)) {
      for (const g of findWildMelds(hand, sets, P, late)) moves.push({ score: P.wildNewBase + g.length * 10, act: { type: 'newMeld', cardIds: g.map((c) => c.id) } });
    }
    moves.sort((a, b) => b.score - a.score);
    return moves;
  }

  // How much the player wants to keep a card: part of a meld in the making, a wildcard, or something
  // the other team could use. The lowest value is thrown.
  function smartKeep(state, seat, P, c, ctx) {
    const me = state.seats[seat], team = teamOf(seat), T = state.teams[team], O = state.teams[1 - team];
    ctx = ctx || { u: urgency(state), seen: seenCounts(state, seat) };
    const u = ctx.u, seen = ctx.seen, B = ctx.B;
    const live = (su, r) => (B ? B.free(su + r) : unseen(seen, su, r));
    let keep = 0;
    if (B && P.danger) {                                     // the next player is an opponent: what this card would hand them
      const q = (seat + 1) % 4, pile = state.discard.length + 1;
      keep += P.dangerUse * useChance(state, B, q, c) * (1 + P.dangerPile * (pile - 1));
      if (!isWildType(c) && O.melds.some((m) => !isComplete(m) && meldCards(m).length === CFG.completeAt - 1 && addOne(m, c).ok)) keep += P.dangerDone;
    }
    if (isWildType(c)) keep += P.spendWild ? P.wildKeep * (1 - u) + P.wildBase : 100;
    else {
      for (const o of me.hand) {
        if (o.id === c.id || isWildType(o)) continue;
        if (o.r === c.r) keep += P.sameRankW;
        if (o.s === c.s) { const d = Math.abs(o.r - c.r); const dd = (o.r === 1 || c.r === 1) ? Math.min(d, 13 - d) : d; if (dd === 1) keep += P.adjW; else if (dd === 2) keep += P.gapW; }
      }
      if (T.melds.some((m) => addOne(m, c).ok)) keep += P.fitW;
      // live outs: neighbours of this card that can still turn up (not in sight yet) make it worth keeping
      const edge = edgeRank(c.r);
      nbrs(c.r).forEach(([r2, d]) => { keep += P.outsW * live(c.s, r2) * (d === 1 ? 1 : .55); });
      keep += P.setOutsW * (edge ? 1 : .3) * SUITS.reduce((a, su) => a + (su === c.s ? 0 : live(su, c.r)), 0) / 3;
      if (P.danger && !B) {
        if (O.melds.some((m) => addOne(m, c).ok)) keep += P.dangerW;                  // would feed the other team
        else if (P.dangerGapW) O.melds.forEach((m) => {                                  // or sit one gap away from the end of their run
          if (m.type !== 'seq' || m.suit !== c.s) return;
          const rs = m.slots.map((x) => x.r), hi = Math.max(...rs), lo = Math.min(...rs);
          if (c.r === hi + 2 || c.r === lo - 2 || (c.r === 1 && hi === 12)) keep += P.dangerGapW;
        });
      }
    }
    return keep;
  }
  function smartDiscard(state, seat, P, B) {
    const ctx = { u: urgency(state), seen: seenCounts(state, seat), B };
    let best = null;
    for (const c of state.seats[seat].hand) { const keep = smartKeep(state, seat, P, c, ctx); if (!best || keep < best.keep) best = { keep, id: c.id }; }
    return best && best.id;
  }

  /* Lookahead by simulation. Everything the player cannot see (the stack, the other hands, the extra decks) is shuffled
     and dealt out again, in many plausible ways; for each candidate throw the rest of the game is then played out with the
     fast Smart player, and the throw that wins most often is chosen. The same deals are used for every candidate. */
  function determinize(state, seat, B) {
    const s = clone(state), pool = s.stack.slice();
    s.seats.forEach((p, i) => { if (i !== seat) pool.push(...p.hand); });
    s.teams.forEach((t) => pool.push(...t.deck));
    shuffle(pool); let k = 0;
    if (B) {
      const mem = mindOf(state, seat), byId = new Map(pool.map((c) => [c.id, c])), used = new Set();
      const hands = [0, 1, 2, 3].map((i) => (i === seat ? null : mem.known[i].map((x) => byId.get(x.id)).filter(Boolean)));
      hands.forEach((h) => h && h.forEach((c) => used.add(c.id)));
      for (const i of shuffle([0, 1, 2, 3].filter((x) => x !== seat))) {
        const need = s.seats[i].hand.length - hands[i].length, w = B.seats[i] ? B.seats[i].w : {};
        const pick = pool.filter((c) => !used.has(c.id)).map((c) => ({ c, key: Math.pow(Math.random(), 1 / Math.max(.02, w[ctype(c)] === undefined ? 1 : w[ctype(c)])) }))
          .sort((a, b) => b.key - a.key).slice(0, need).map((x) => x.c);
        pick.forEach((c) => used.add(c.id)); s.seats[i].hand = hands[i].concat(pick);
      }
      const left = pool.filter((c) => !used.has(c.id));
      s.teams.forEach((t) => { const n = t.deck.length; t.deck = left.slice(k, k + n); k += n; });
      s.stack = left.slice(k);
      return s;
    }
    s.seats.forEach((p, i) => { if (i !== seat) { const n = p.hand.length; p.hand = pool.slice(k, k + n); k += n; } });
    s.teams.forEach((t) => { const n = t.deck.length; t.deck = pool.slice(k, k + n); k += n; });
    s.stack = pool.slice(k);
    return s;
  }
  function playOut(s) {
    for (let g = 0; s.phase !== 'over' && g < 500; g++) {
      const p = s.turn; let r = apply(s, p, botSmart(s, p, true));
      if (!r.ok) r = apply(s, p, { type: s.phase === 'draw' ? 'timeout' : 'discard', cardId: s.seats[p].hand[0] && s.seats[p].hand[0].id });
      if (!r.ok) break;
    }
    return s.result;
  }
  function rolloutDiscard(state, seat, P, fallback, B) {
    const me = state.seats[seat], team = teamOf(seat), ctx = { u: urgency(state), seen: seenCounts(state, seat), B };
    const seenKey = {}, cands = me.hand.map((c) => ({ c, k: smartKeep(state, seat, P, c, ctx) })).sort((a, b) => a.k - b.k)
      .filter((x) => { const key = x.c.s + x.c.r; if (seenKey[key]) return false; seenKey[key] = 1; return true; }).slice(0, P.rollCands).map((x) => x.c);
    if (cands.length < 2) return fallback;
    const tot = cands.map(() => 0), t0 = Date.now();
    let done = 0;
    const minDeals = P.rollouts || 2;
    for (let r = 0; r < minDeals || (P.rollMs && Date.now() - t0 < P.rollMs && r < 200); r++) {
      const base = determinize(state, seat, B);
      cands.forEach((c, i) => {
        const s2 = clone(base);
        if (!apply(s2, seat, { type: 'discard', cardId: c.id }).ok) return;
        const R = s2.phase === 'over' ? s2.result : playOut(s2);
        if (!R) return;
        tot[i] += outcome(R, team, P);
      });
      done++;
    }
    let bi = 0; tot.forEach((v, i) => { if (v > tot[bi]) bi = i; });
    return done ? cands[bi].id : fallback;
  }
  // value of a finished (simulated) game for a team: a win, plus a little for the margin
  const outcome = (R, team, P) => (R.winner === null ? .5 : R.winner === team ? 1 : 0) + P.rollMarginW * (R.scores[team] - R.scores[1 - team]);

  /* For studying recorded games: how good each of several moves is for the player's team, judged the way the Expert judges
     its throws. The cards that player cannot see are dealt out in plausible ways from their point of view (their own
     memory), and every option is played to the end on the same deals. Returns the average result per option (about the
     chance to win), or null for an option the rules refuse. */
  function compareMoves(state, seat, options, deals) {
    const team = teamOf(seat), P = smartParams(state, seat), B = beliefs(state, seat, P);
    const tot = options.map(() => 0), cnt = options.map(() => 0);
    for (let r = 0; r < (deals || 16); r++) {
      const base = determinize(state, seat, B);
      options.forEach((a, i) => {
        const s2 = clone(base);
        if (!apply(s2, seat, a).ok) return;
        const R = s2.phase === 'over' ? s2.result : playOut(s2);
        if (R) { tot[i] += outcome(R, team, P); cnt[i]++; }
      });
    }
    return tot.map((t, i) => (cnt[i] ? t / cnt[i] : null));
  }

  /* ---------------- Planning (Expert) ----------------
     Chess engines search ahead and judge where each line leads. Here the cards are hidden, so the Expert does what strong
     card-game programs do: it deals the unseen cards out in many plausible ways (weighted by what it has read of each
     hand) and plays every candidate plan to the end of the game on the same deals. A plan is a whole turn, not one move:
     which melds to lay down now, which to keep in hand for later, and which card to throw. Weak plans are dropped as the
     evidence comes in (successive halving), so the time goes to the close calls. Before that, at the start of the turn,
     it weighs taking the pile against drawing the same way. */

  // The next meld step the plain Smart player would make (null: none). skip(act) leaves a move out.
  function nextMeld(state, seat, P, B, skip) {
    const me = state.seats[seat], team = teamOf(seat);
    const mayWin = !P.goOutCheck || !canGoOut(state, team) || goOutWins(state, seat);
    for (const mv of smartMeldMoves(state, seat, P, B)) {
      if (skip && skip(mv.act)) continue;
      if (!mayWin && me.hand.length - mv.act.cardIds.length < 2) continue;
      if (!tryOn(state, seat, mv.act)) continue;
      if (P.goOutCheck && endsGameBadly(state, seat, mv.act)) continue;
      return mv.act;
    }
    return null;
  }
  // Throws worth considering from this position: the least useful cards (one per card type), legal and not game-losing.
  function throwCands(state, seat, P, B, n) {
    const me = state.seats[seat], ctx = { u: urgency(state), seen: seenCounts(state, seat), B }, seenKey = {}, out = [];
    const ranked = me.hand.map((c) => ({ c, k: smartKeep(state, seat, P, c, ctx) })).sort((a, b) => a.k - b.k);
    for (const x of ranked) {
      const key = x.c.s + x.c.r; if (seenKey[key]) continue; seenKey[key] = 1;
      const act = { type: 'discard', cardId: x.c.id };
      if (!tryOn(state, seat, act)) continue;
      if (P.goOutCheck && endsGameBadly(state, seat, act) && me.hand.length > 1) continue;
      out.push(act); if (out.length >= n) break;
    }
    return out;
  }
  // Candidate plans for the rest of this turn: the Smart line, the same line stopped early (keep melds in hand), the line
  // without wildcard melds, each followed by its best few throws.
  function turnPlans(state, seat, P, B) {
    const lines = [], keyOf = (acts) => acts.map((a) => a.type + (a.meldId || '') + (a.cardIds || [a.cardId]).join()).join('|');
    const walk = (skip, Q) => {
      const acts = []; let s = state;
      for (let i = 0; i < 12; i++) {
        const a = nextMeld(s, seat, Q || P, B, skip); if (!a) break;
        const s2 = clone(s); if (!apply(s2, seat, a).ok) break;
        acts.push(a); s = s2;
        if (s.phase === 'over' || s.turn !== seat) break;
      }
      return acts;
    };
    const full = walk(null);
    for (let k = full.length; k >= 0; k--) lines.push(full.slice(0, k));
    if (P.planNoWild) lines.push(walk((a) => a.confirmImpure || (a.type === 'newMeld' && a.cardIds.some((id) => isWildType(state.seats[seat].hand.find((c) => c.id === id) || {})))));
    // the bold line: spend wildcards on melds now, where the cautious rules would wait for natural cards
    if (P.planLoose) lines.push(walk(null, Object.assign({}, P, { pureFirst: 0, wildNewHand: 0, wildNewU: -1, wildAddAny: -1, wildAddU: -1, wildAddLen: 3, waitU: -1 })));
    const plans = [], seen = {};
    lines.forEach((acts, li) => {
      let s = clone(state);
      for (const a of acts) if (!apply(s, seat, a).ok) return;
      if (s.phase === 'over' || s.turn !== seat) { const k = keyOf(acts); if (!seen[k]) { seen[k] = 1; plans.push({ acts, base: li === 0 }); } return; }
      throwCands(s, seat, P, B, li === 0 ? P.planThrows : P.planThrowsAlt).forEach((t, ti) => {
        const all = acts.concat([t]), k = keyOf(all);
        if (!seen[k]) { seen[k] = 1; plans.push({ acts: all, base: li === 0 && ti === 0 }); }
      });
    });
    return plans;
  }
  // Plays every option to the end on shared deals and keeps the best half each round. run(base, option) -> finished game
  // result, or null when the option can't be played on that deal. Returns the index of the best option.
  function searchOptions(state, seat, P, B, n, run, ms, stats) {
    const team = teamOf(seat), tot = new Array(n).fill(0), cnt = new Array(n).fill(0), t0 = Date.now();
    if (stats) { stats.tot = tot; stats.cnt = cnt; }
    let alive = [...Array(n).keys()], step = P.planStep, deals = 0;
    const mean = (i) => (cnt[i] ? tot[i] / cnt[i] : -1);
    while (alive.length > 1 && deals < P.planMaxDeals && (deals < P.planMinDeals || Date.now() - t0 < ms)) {
      const base = determinize(state, seat, B);
      for (const i of alive) { const R = run(base, i); if (R) { tot[i] += outcome(R, team, P); cnt[i]++; } }
      deals++;
      if (deals >= step && alive.length > 2) { alive.sort((a, b) => mean(b) - mean(a)); alive = alive.slice(0, Math.ceil(alive.length / 2)); step *= 2; }
    }
    return alive.reduce((b, i) => (mean(i) > mean(b) ? i : b), alive[0]);
  }
  // Several threads can think about one decision: one lists the options (prepare), every thread plays them out on its own
  // deals (runLines), and the totals are pooled (pickLine). Inside a thread a search request is passed out by throwing.
  let COLLECT = false;
  const NEED = {};
  function searchLines(state, seat, P, B, lines, ms, kind) {
    if (COLLECT) { NEED.req = { kind, lines, ms }; throw NEED; }
    return searchOptions(state, seat, P, B, lines.length, (base, i) => playLine(base, seat, lines[i]), ms);
  }
  function prepare(state, seat) {
    COLLECT = true;
    try { const action = botNextAction(state, seat); return { action, plan: state.finishPlan || null }; }
    catch (e) { if (e === NEED) return { search: NEED.req }; throw e; }
    finally { COLLECT = false; NEED.req = null; }
  }
  function runLines(state, seat, lines, ms) {
    const P = smartParams(state, seat), B = P.team ? beliefs(state, seat, P) : null, stats = {};
    searchOptions(state, seat, Object.assign({}, P, { planMinDeals: 1 }), B, lines.length, (base, i) => playLine(base, seat, lines[i]), ms, stats);
    return stats;
  }
  // Pools the threads' totals; the winner is the best average among options that were played out often enough.
  function pickLine(all) {
    const n = all[0].tot.length, tot = new Array(n).fill(0), cnt = new Array(n).fill(0);
    all.forEach((st) => st.tot.forEach((v, i) => { tot[i] += v; cnt[i] += st.cnt[i]; }));
    const most = Math.max(...cnt); let best = 0, bv = -1;
    for (let i = 0; i < n; i++) if (cnt[i] >= most / 2 && tot[i] / cnt[i] > bv) { bv = tot[i] / cnt[i]; best = i; }
    return best;
  }
  const playLine = (base, seat, acts) => {
    const s2 = clone(base);
    for (const a of acts) { if (s2.phase === 'over' || s2.turn !== seat) break; if (!apply(s2, seat, a).ok) return null; }
    return s2.phase === 'over' ? s2.result : playOut(s2);
  };
  function planTurn(state, seat, P, B) {
    const plans = turnPlans(state, seat, P, B);
    if (!plans.length) return null;
    if (plans.length === 1) return plans[0].acts;
    return plans[searchLines(state, seat, P, B, plans.map((x) => x.acts), P.rollMs, 'plan')].acts;
  }
  // Take the pile or draw: both played out on the same deals (the turn after either is played by the fast Smart player).
  function searchDraw(state, seat, P, B, plain) {
    if (!state.discard.length || state.pileRefused || !state.stack.length) return plain;
    const test = clone(state); if (!apply(test, seat, { type: 'pickup' }).ok) return plain;
    if (!findUseFor(test, seat, test.mustUse, P.pickTier)) return plain;         // can't use the top card: taking the pile would only mean putting it back
    const opts = [{ type: 'pickup' }, { type: 'draw' }];
    return opts[searchLines(state, seat, P, B, opts.map((a) => [a]), P.planDrawMs, 'draw')];
  }

  function smartDraw(state, seat, simulating, P) {
    if (state.discard.length && !state.pileRefused) {
      const test = clone(state);
      if (apply(test, seat, { type: 'pickup' }).ok && findUseFor(test, seat, test.mustUse, P.pickTier)) {
        if (!CFG.botPilePayoff || !P.pilePayoff || simulating || pilePaysOff(state, seat).ok) return { type: 'pickup' };
      }
    }
    if (!state.stack.length) return { type: 'endGame' };
    return { type: 'draw' };
  }

  /* Finish drive: when the team is able to go out, look for a run of melds this turn that empties the hand
     (wildcards may be spent freely for it). Small depth-first search on copies of the game. */
  // goal 'claim': empty the hand while the team's extra deck is unclaimed (claims it), without spoiling a pure meld
  function findGoOut(state, seat, P, goal) {
    const team = teamOf(seat), me = state.seats[seat], claim = goal === 'claim';
    if (me.hand.length > P.outMaxHand) return null;
    const t = state.teams[team];
    if (t.deckStatus === 'forfeited' || (claim && t.deckStatus !== 'unclaimed')) return null;
    const done = (s2) => (claim ? s2.teams[team].deckStatus === 'claimed'
      : s2.phase === 'over' && s2.result && s2.result.reason === 'out' && s2.result.winner === team);
    let budget = P.outBudget;
    const cands = (st) => {
      const hand = st.seats[seat].hand, T = st.teams[team], sets = T.melds.filter((m) => m.type === 'set').length, out = [];
      for (const m of T.melds) for (const c of hand) {
        const v = addOne(m, c); if (v.ok && !(claim && breaksPure(m, v))) out.push({ type: 'addToMeld', meldId: m.id, cardIds: [c.id], confirmImpure: true });
      }
      for (const g of findNewMeldsAll(hand, sets, P, true)) if (checkNewMeld(g, sets).ok) out.push({ type: 'newMeld', cardIds: g.map((c) => c.id) });
      for (const g of findWildMelds(hand, sets, P, true)) out.push({ type: 'newMeld', cardIds: g.map((c) => c.id) });
      return out;
    };
    const rec = (st, depth) => {
      if (budget-- <= 0) return null;
      const hand = st.seats[seat].hand;
      if (hand.length === 1) {                                           // throwing the last card ends it too
        const s2 = clone(st);
        if (apply(s2, seat, { type: 'discard', cardId: hand[0].id }).ok && done(s2)) return [{ type: 'discard', cardId: hand[0].id }];
      }
      if (depth <= 0 || !hand.length) return null;
      const list = cands(st).sort((a, b) => b.cardIds.length - a.cardIds.length).slice(0, P.outBranch);
      for (const act of list) {
        const s2 = clone(st), r = apply(s2, seat, act);
        if (!r.ok) continue;
        if (done(s2)) return [act];
        if (s2.phase === 'over') continue;
        const rest = rec(s2, depth - 1);
        if (rest) return [act].concat(rest);
      }
      return null;
    };
    return rec(state, P.outDepth);
  }

  function botSmart(state, seat, simulating) {
    if (state.phase === 'over' || state.turn !== seat) return null;
    const me = state.seats[seat], team = teamOf(seat), P = smartParams(state, seat);
    if (state.phase === 'draw') {
      const plain = smartDraw(state, seat, simulating, P);
      return P.plan && P.planDrawMs && !simulating ? searchDraw(state, seat, P, P.team ? beliefs(state, seat, P) : null, plain) : plain;
    }
    if (state.mustUse) return findUseFor(state, seat, state.mustUse) || { type: 'returnPile' };
    const mayWin = !P.goOutCheck || !canGoOut(state, team) || goOutWins(state, seat);
    const B = P.team && !simulating ? beliefs(state, seat, P) : null;
    if (P.finish && !simulating) {
      const plan = (state.finishPlan && state.finishPlan.turn === state.turnNo && state.finishPlan.seat === seat) ? state.finishPlan : null;
      let steps = plan ? plan.steps : findGoOut(state, seat, P);
      if (!plan && !steps && P.claim) steps = findGoOut(state, seat, P, 'claim');
      if (!plan && !steps && P.plan && (P.rollouts || P.rollMs)) steps = planTurn(state, seat, P, B);     // the Expert plans its whole turn
      if (steps && steps.length && !tryOn(state, seat, steps[0])) steps = null;                            // the table changed: think again
      if (steps && steps.length) { const nxt = steps[0]; state.finishPlan = { turn: state.turnNo, seat, steps: steps.slice(1) }; return nxt; }
    }
    for (const mv of smartMeldMoves(state, seat, P, B)) {
      if (!mayWin && me.hand.length - mv.act.cardIds.length < 2) continue;        // keep a card rather than end a losing game
      if (!tryOn(state, seat, mv.act)) continue;
      if (P.goOutCheck && endsGameBadly(state, seat, mv.act)) continue;
      return mv.act;
    }
    if (state.finalTurn) return { type: 'endGame' };
    let first = smartDiscard(state, seat, P, B);
    if ((P.rollouts || P.rollMs) && !simulating) first = rolloutDiscard(state, seat, P, first, B);   // simulations themselves use the plain fast player
    const ordered = [first].concat(me.hand.map((c) => c.id));
    for (const id of ordered) {
      const act = { type: 'discard', cardId: id };
      if (!tryOn(state, seat, act)) continue;
      if (P.goOutCheck && endsGameBadly(state, seat, act) && me.hand.length > 1) continue;
      return act;
    }
    return { type: 'discard', cardId: me.hand[0].id };
  }


  function botNextAction(state, seat, simulating) {
    const lv = state.seats[seat] && state.seats[seat].level;
    return lv === 'easy' ? botEasy(state, seat, simulating) : botSmart(state, seat, simulating);
  }

  return {
    CFG, SUIT_SYM, rankTxt, cardName, isWildType, isNaturalAt, teamOf,
    createGame, apply, checkNewMeld, newMeldOptions, checkAdd, meldCards, meldPure, isTimpa, dealOf, fromDeal, cardById, compareMoves,
    beliefs, addOne, prepare, runLines, pickLine,
    isClosed, isComplete, countsPure, breaksPure,
    canGoOut, goOutBlockers, completedInfo, teamScore, redact, countCards,
    botNextAction, pilePaysOff, validateSeq, arrangeSeq, validateSet,
  };
});

