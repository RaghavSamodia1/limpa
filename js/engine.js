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
  const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣', J: '★' };
  const RANK_TXT = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

  const rankTxt = (r) => RANK_TXT[r] || String(r);
  const cardName = (c) => (c.s === 'J' ? 'Joker' : rankTxt(c.r) + SUIT_SYM[c.s]);
  const isWildType = (c) => c.s === 'J' || c.r === 2;
  const teamOf = (seat) => seat % 2;
  const clone = (o) => JSON.parse(JSON.stringify(o));

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
    startTurn(state, state.turn, []);
    return state;
  }

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
    state.log.push(e); if (state.log.length > 60) state.log.shift();
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
    const cards = t.deck.map((c) => Object.assign(c, { x: team }));
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

  function afterMeld(state, seat, events) {
    const team = teamOf(seat); const t = state.teams[team];
    const n = state.seats[seat].hand.length;
    if (n === 0) {
      if (t.deckStatus === 'unclaimed') { claimDeck(state, seat, events, true); return { ok: true }; }
      if (canGoOut(state, team)) { scoreMelds(state, team, events); finish(state, events, 'out', seat); return { ok: true }; }
      return { ok: false, error: "You can't empty your hand yet (" + goOutBlockers(state, team).join(', ') + '). Keep a card and discard instead.' };
    }
    if (n === 1 && t.deckStatus !== 'unclaimed' && !canGoOut(state, team) && !state.finalTurn) {
      return { ok: false, error: 'That would leave one card and then an empty hand, but your team cannot go out yet (' +
        goOutBlockers(state, team).join(', ') + '). Discard instead.' };
    }
    return { ok: true };
  }

  function markDeckUse(state, seat, cards) {
    const team = teamOf(seat);
    if (cards.some((c) => c.x === team)) state.teams[team].deckUsed = true;
  }

  /* ---------------- apply() ---------------- */
  function apply(state, seat, action) {
    const events = [];
    if (!action || !action.type) return { ok: false, error: 'Unknown action.', events };
    if (state.phase === 'over') return { ok: false, error: 'The game is over.', events };
    if (seat !== state.turn) return { ok: false, error: "It isn't your turn.", events };
    const snap = JSON.stringify(state);
    const fail = (error, code) => {
      const restored = JSON.parse(snap);
      Object.keys(state).forEach((k) => delete state[k]);
      Object.assign(state, restored);
      return { ok: false, error, code, events: [] };
    };
    const me = state.seats[seat]; const team = teamOf(seat); const T = state.teams[team];

    switch (action.type) {
      case 'draw': {
        if (state.phase !== 'draw') return fail('You have already drawn this turn.');
        if (!state.stack.length) return fail('The centre stack is empty. Pick up the discard pile or end the game.');
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
        me.hand.push(...state.discard); state.discard = [];
        state.mustUse = top.id; state.phase = 'play'; state.drewFrom = 'pile';
        log(state, events, me.name + ' picked up the discard pile (' + state.pileBackup.length + ' cards).');
        return { ok: true, events };
      }
      case 'returnPile': {
        if (state.drewFrom !== 'pile' || !state.mustUse) return fail('Nothing to return.');
        const back = state.pileBackup.map((id) => me.hand.find((c) => c.id === id));
        me.hand = me.hand.filter((c) => !state.pileBackup.includes(c.id));
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
        const m = Object.assign({ id: 'm' + state.nextMeldId++, team, scored: null, points: 0 }, v.meld);
        delete m.pure;
        T.melds.push(m);
        me.hand = me.hand.filter((c) => !ids.includes(c.id));
        markDeckUse(state, seat, cards);
        state.mustUse = null;
        const r = afterMeld(state, seat, events);
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
        if (m.type === 'seq') m.slots = v.slots; else m.cards = v.cards;
        me.hand = me.hand.filter((c) => !ids.includes(c.id));
        markDeckUse(state, seat, cards);
        state.mustUse = null;
        const r = afterMeld(state, seat, events);
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
        const c = me.hand.splice(i, 1)[0];
        state.discard.push(c);
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
      const v = checkAdd(m, [card]);
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
      if (T.melds.some((m) => checkAdd(m, [c]).ok)) score += 40;
      if (c.x !== undefined) score += 5;
      if (!best || score < best.score) best = { score, id: c.id };
    }
    return best && best.id;
  }

  function botNextAction(state, seat, simulating) {
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
        const v = checkAdd(m, [c]);
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

  return {
    CFG, SUIT_SYM, rankTxt, cardName, isWildType, isNaturalAt, teamOf,
    createGame, apply, checkNewMeld, newMeldOptions, checkAdd, meldCards, meldPure, isTimpa,
    isClosed, isComplete, countsPure, breaksPure,
    canGoOut, goOutBlockers, completedInfo, teamScore, redact, countCards,
    botNextAction, pilePaysOff, validateSeq, arrangeSeq, validateSet,
  };
});

