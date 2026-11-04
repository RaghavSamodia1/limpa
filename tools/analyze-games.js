#!/usr/bin/env node
/* Studies recorded games (see js/gamelog.js and vault/Game Records.md).
   Every record is replayed exactly. At each move a person made, the Expert works out what it would have done in the same
   spot, from that person's point of view (their hand and their own memory of the table, never the hidden cards). Where
   the two differ, both choices are played out on the same imagined deals to see which does better for that player's team.
   The result is a report: where people play differently, who comes out ahead, which refusals confuse people, and what the
   computer could learn.

     node tools/analyze-games.js <records...>     .txt files sent from the game menu (one game per line) and/or the
                                                   .csv downloaded from the collection sheet
       --deals N       imagined deals per comparison (default 24; more is slower and steadier)
       --think N       imagined deals per throw for the Expert's own choice (default 6)
       --report FILE   where to write the report (default "vault/Human Play Insights.md"; "-" prints it)
       --simulate N OUT.txt   write N practice records in which Easy computers stand in for people (to try the tool)
*/
'use strict';
const fs = require('fs'), path = require('path');
const E = require('../js/engine.js');

/* ---------- reading records ---------- */
function csvCells(text) {                       // a small RFC 4180 reader: yields every cell
  const out = []; let cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\n' || ch === '\r') { out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out;
}
function readRecords(files) {
  const objs = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const pieces = /\.csv$/i.test(f) ? csvCells(text) : text.split(/\r?\n/);
    for (const p of pieces) { const t = p.trim(); if (t.startsWith('{')) { try { objs.push(JSON.parse(t)); } catch (e) { /* not a record */ } } }
  }
  // long records arrive in parts: put them back together
  const parts = {}, recs = [];
  for (const o of objs) {
    if (o.part && o.of && o.text !== undefined) (parts[o.id] = parts[o.id] || []).push(o);
    else if (o.f) recs.push(o);
  }
  for (const id in parts) {
    const ps = parts[id].sort((a, b) => a.part - b.part);
    if (ps.length === ps[0].of) { try { recs.push(JSON.parse(ps.map((p) => p.text).join(''))); } catch (e) {} }
  }
  const seen = new Set();
  return recs.filter((r) => r.id && !seen.has(r.id) && seen.add(r.id));
}

/* ---------- moves ---------- */
function decode(x) {
  switch (x[0]) {
    case 'd': return { type: 'draw' }; case 'p': return { type: 'pickup' }; case 'r': return { type: 'returnPile' };
    case 'e': return { type: 'endGame' }; case 't': return { type: 'timeout' }; case 'x': return { type: 'discard', cardId: x[1] };
    case 'n': return x.length > 2 ? { type: 'newMeld', cardIds: x[1], choice: x[2] } : { type: 'newMeld', cardIds: x[1] };
    case 'a': return { type: 'addToMeld', meldId: x[1], cardIds: x[2], wildPos: x[3] === null ? undefined : x[3], confirmImpure: !!x[4] };
    default: return { type: '?' };
  }
}
function encode(a) {                            // the same short form js/gamelog.js writes
  switch (a.type) {
    case 'draw': return ['d']; case 'pickup': return ['p']; case 'returnPile': return ['r']; case 'endGame': return ['e']; case 'timeout': return ['t'];
    case 'newMeld': return a.choice !== undefined ? ['n', a.cardIds, a.choice] : ['n', a.cardIds];
    case 'addToMeld': { const o = ['a', a.meldId, a.cardIds]; if (a.wildPos !== undefined || a.confirmImpure) o.push(a.wildPos === undefined ? null : a.wildPos); if (a.confirmImpure) o.push(1); return o; }
    case 'discard': return ['x', a.cardId];
  }
  return ['?'];
}
const card = (id) => E.cardById(id);
const name = (id) => E.cardName(card(id));
const isWild = (id) => E.isWildType(card(id));
function describe(a) {
  switch (a.type) {
    case 'draw': return 'draw from the centre'; case 'pickup': return 'take the pile'; case 'returnPile': return 'return the pile';
    case 'endGame': return 'end the game'; case 'timeout': return 'time ran out';
    case 'discard': return 'throw ' + name(a.cardId);
    case 'newMeld': return 'new meld ' + a.cardIds.map(name).join(' ');
    case 'addToMeld': return 'add ' + a.cardIds.map(name).join(' ') + ' to a meld';
  }
  return a.type;
}
const ctype = (id) => { const c = card(id); return c.s === 'J' ? 'J' : c.s + c.r; };

function startState(rec) {
  if (rec.deal) return E.fromDeal(rec.deal, { seats: rec.seats.map((s, i) => ({ name: 'P' + i, bot: !s.h, level: s.lv || 'smart' })) });
  return JSON.parse(JSON.stringify(rec.snap));
}

// The Expert's own choice for this seat in this exact position (a copy, playing as the Expert, with a fixed think)
function expertChoice(G, seat, think) {
  const s = JSON.parse(JSON.stringify(G));
  s.seats[seat].level = 'expert'; s.seats[seat].bot = true; s.seats[seat].params = { rollouts: think };
  return E.botNextAction(s, seat);
}
function sameMove(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === 'discard') return ctype(a.cardId) === ctype(b.cardId);           // either copy of the same card
  if (a.type === 'newMeld' || a.type === 'addToMeld') {
    const k = (x) => x.cardIds.map(ctype).sort().join(',') + (x.meldId || '');
    return k(a) === k(b);
  }
  return true;
}
function kindOf(G, a) {
  if (G.phase === 'draw') return 'draw';
  if (G.mustUse) return 'use the top card';
  if (a.type === 'discard') return 'throw';
  if (a.type === 'newMeld' || a.type === 'addToMeld') return 'meld';
  return 'other';
}

// What the move says about the player's thinking, to group similar choices together
function tags(G, seat, a, ex) {
  const t = [], team = seat % 2, opp = 1 - team, next = (seat + 1) % 4;
  if (G.phase === 'draw' && !G.mustUse) {
    if (a.type === 'pickup' && ex && ex.type === 'draw') t.push(G.discard.length <= 2 ? 'took a small pile the Expert would leave' : 'took a big pile the Expert would leave');
    if (a.type === 'draw' && ex && ex.type === 'pickup') t.push('left a pile the Expert would take');
    return t;
  }
  if (a.type === 'discard') {
    const c = card(a.cardId);
    if (E.isWildType(c)) t.push('threw a wildcard');
    if (G.teams[opp].melds.some((m) => E.checkAdd(m, [c]).ok)) t.push('threw a card that fits the other team\'s melds');
    if (G.teams[team].melds.some((m) => E.checkAdd(m, [c]).ok)) t.push('threw a card that fits their own team\'s melds');
    const hand = G.seats[seat].hand.filter((x) => x.id !== c.id && !E.isWildType(x));
    if (!E.isWildType(c) && hand.some((x) => x.s === c.s && Math.abs(x.r - c.r) === 1)) t.push('broke up a run in their hand');
    if (ex && ex.type !== 'discard') t.push('threw while the Expert would still meld');
    if (G.discard.length >= 4) t.push('threw onto a big pile (next player is an opponent)');
    void next;
  }
  if (a.type === 'newMeld' || a.type === 'addToMeld') {
    const ids = a.cardIds;
    if (ids.some(isWild)) t.push('used a wildcard in a meld');
    if (a.type === 'newMeld') {
      const v = E.checkNewMeld(ids.map(card), G.teams[team].melds.filter((m) => m.type === 'set').length);
      if (v.ok && v.meld.type === 'set' && v.meld.rank >= 5 && v.meld.rank <= 10) t.push('made a set of middle cards (5 to 10)');
    }
    if (ex && ex.type === 'discard') t.push('melded where the Expert would hold the cards');
  }
  return t;
}

/* ---------- the study ---------- */
function analyze(recs, opts) {
  const S = { games: 0, replayErrors: [], decisions: 0, byKind: {}, groups: {}, bad: {}, times: {}, hints: 0, results: { peopleWon: 0, peopleLost: 0, draws: 0, mixed: 0 }, examples: {} };
  const kindRow = (k) => (S.byKind[k] = S.byKind[k] || { n: 0, same: 0, diff: 0, judged: 0, sumDiff: 0, peopleBetter: 0, expertBetter: 0 });
  for (const rec of recs) {
    let G;
    try { G = startState(rec); } catch (e) { S.replayErrors.push(rec.id + ': ' + e.message); continue; }
    S.games++;
    let broken = false;
    for (let i = 0; i < rec.acts.length && !broken; i++) {
      const [seat, h, dt, ...enc] = rec.acts[i];
      const a = decode(enc);
      if (h) {
        const kind = kindOf(G, a), row = kindRow(kind);
        row.n++; S.decisions++; if (h === 2) S.hints++;
        (S.times[kind] = S.times[kind] || []).push(dt);
        const ex = a.type === 'timeout' ? null : expertChoice(G, seat, opts.think);
        if (ex && sameMove(a, ex)) row.same++;
        else if (ex) {
          row.diff++;
          let d = null;
          if (opts.deals > 0) {
            const v = E.compareMoves(G, seat, [a, ex], opts.deals);
            if (v[0] !== null && v[1] !== null) {
              d = v[0] - v[1]; row.judged++; row.sumDiff += d;
              if (d > opts.margin) row.peopleBetter++; else if (d < -opts.margin) row.expertBetter++;
            }
          }
          for (const tg of tags(G, seat, a, ex)) {
            const g = (S.groups[tg] = S.groups[tg] || { n: 0, judged: 0, sum: 0, sq: 0 });
            g.n++; if (d !== null) { g.judged++; g.sum += d; g.sq += d * d; }
            const exs = (S.examples[tg] = S.examples[tg] || []);
            if (exs.length < 3) exs.push({ game: rec.id, move: i, person: describe(a), expert: describe(ex), diff: d });
          }
        }
      }
      const r = E.apply(G, seat, a);
      if (!r.ok) { S.replayErrors.push(rec.id + ' move ' + i + ': ' + r.error); broken = true; break; }
      if (rec.rs && rec.rs[i]) G.stack = rec.rs[i].map(card);
    }
    for (const b of rec.bad || []) { const msg = String(b[b.length - 1]).replace(/\(.*?\)/g, '(…)'); S.bad[msg] = (S.bad[msg] || 0) + 1; }
    if (!broken && G.phase === 'over' && G.result) {
      const people = [0, 1].map((t) => rec.seats.some((s, i) => i % 2 === t && s.h));
      if (people[0] && people[1]) S.results.mixed++;
      else if (people[0] || people[1]) {
        const pt = people[0] ? 0 : 1;
        if (G.result.winner === null) S.results.draws++; else if (G.result.winner === pt) S.results.peopleWon++; else S.results.peopleLost++;
      }
    }
  }
  return S;
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-');
const pts = (x) => (x === null || x === undefined || Number.isNaN(x) ? '-' : (x >= 0 ? '+' : '') + (100 * x).toFixed(1));
const median = (l) => { if (!l || !l.length) return '-'; const s = l.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)] + ' s'; };

function report(S, opts, src) {
  const L = [];
  L.push('# Human Play Insights', '');
  L.push(`Generated ${new Date().toISOString().slice(0, 10)} by \`node tools/analyze-games.js\` from ${S.games} recorded game(s) (${src}). ${S.decisions} decisions by people were compared with the Expert's choice in the same spot (from the person's point of view; the Expert thought with ${opts.think} imagined deals per throw). Each difference was judged by playing both choices out on ${opts.deals} imagined deals. "Win chance points" = how much better (+) or worse (−) the person's choice did than the Expert's, per 100 games.`, '');
  if (S.replayErrors.length) L.push(`**Records that could not be replayed: ${S.replayErrors.length}** (first: ${S.replayErrors[0]}). These usually mean a record from an older version of the rules.`, '');
  L.push('## Decisions', '', '| Decision | People\'s moves | Same as the Expert | Different | Judged | Person better | Expert better | Average (win chance points) |', '|---|---|---|---|---|---|---|---|');
  for (const [k, r] of Object.entries(S.byKind).sort((a, b) => b[1].n - a[1].n)) {
    L.push(`| ${k} | ${r.n} | ${pct(r.same, r.same + r.diff)} | ${r.diff} | ${r.judged} | ${r.peopleBetter} | ${r.expertBetter} | ${r.judged ? pts(r.sumDiff / r.judged) : '-'} |`);
  }
  L.push('');
  const groups = Object.entries(S.groups).map(([k, g]) => {
    const mean = g.judged ? g.sum / g.judged : null;
    const sd = g.judged > 1 ? Math.sqrt(Math.max(0, g.sq / g.judged - mean * mean)) : null;
    const t = sd && g.judged > 1 ? mean / (sd / Math.sqrt(g.judged)) : 0;
    return { k, n: g.n, judged: g.judged, mean, t };
  }).sort((a, b) => b.n - a.n);
  L.push('## How people play differently', '', '| Pattern (where the person and the Expert differed) | Times | Average (win chance points) | Clear? |', '|---|---|---|---|');
  for (const g of groups) L.push(`| ${g.k} | ${g.n} | ${pts(g.mean)} | ${Math.abs(g.t) >= 2 && g.judged >= 20 ? (g.mean > 0 ? 'people better' : 'Expert better') : 'not yet'} |`);
  L.push('');
  const learn = groups.filter((g) => g.judged >= 20 && g.t >= 2 && g.mean > 0);
  const teach = groups.filter((g) => g.judged >= 20 && g.t <= -2 && g.mean < 0).sort((a, b) => a.mean - b.mean);
  L.push('## What the computer could learn from people', '');
  if (learn.length) learn.forEach((g) => L.push(`- **${g.k}**: people did better than the Expert by ${pts(g.mean)} win chance points on average (${g.judged} cases). Worth testing as a rule change for the computer.`));
  else L.push('- Nothing clear yet: no pattern where people consistently beat the Expert (needs at least 20 judged cases and a clear average).');
  L.push('', '## Where people lose the most (ideas for New player help)', '');
  if (teach.length) teach.slice(0, 6).forEach((g) => L.push(`- **${g.k}**: ${pts(g.mean)} win chance points on average (${g.judged} cases).`));
  else L.push('- Nothing clear yet.');
  L.push('', '## Examples', '');
  for (const g of groups.slice(0, 8)) for (const x of S.examples[g.k] || []) L.push(`- ${g.k}: person chose *${x.person}*, the Expert *${x.expert}* (${x.diff === null ? 'not judged' : pts(x.diff) + ' points'}; game ${x.game}, move ${x.move})`);
  L.push('', '## Refused moves (where the rules or the screen confuse people)', '');
  const bad = Object.entries(S.bad).sort((a, b) => b[1] - a[1]);
  if (bad.length) { L.push('| Message | Times |', '|---|---|'); bad.slice(0, 15).forEach(([m, n]) => L.push(`| ${m} | ${n} |`)); } else L.push('- None recorded.');
  L.push('', '## Time to decide (median)', '');
  Object.entries(S.times).forEach(([k, l]) => L.push(`- ${k}: ${median(l)} (${l.length} moves)`));
  L.push(`- Moves made with the help button: ${S.hints} of ${S.decisions}`);
  const R = S.results;
  L.push('', '## Results', '', `- Games with people on one team only: people's team won ${R.peopleWon}, lost ${R.peopleLost}, drew ${R.draws}.`, `- Games with people on both teams: ${R.mixed}.`, '');
  return L.join('\n');
}

/* ---------- practice records (Easy computers stand in for people) ---------- */
function simulate(n, out) {
  const lines = [];
  for (let g = 0; g < n; g++) {
    const seats = [0, 1, 2, 3].map((i) => (i % 2 === 0 ? { name: 'P' + i, bot: true, level: 'easy' } : { name: 'P' + i, bot: true, level: 'smart' }));
    const G = E.createGame({ seats });
    const rec = { f: 1, id: 'sim' + g + '-' + Date.now().toString(36), dev: 'simulated', bot: 'sim', mode: 'local', at: Date.now(), seats: seats.map((s, i) => (i % 2 === 0 ? { h: 1 } : { h: 0, lv: 'smart' })), deal: E.dealOf(G), snap: null, acts: [], bad: [], rs: {} };
    for (let k = 0; G.phase !== 'over' && k < 5000; k++) {
      const seat = G.turn; let a = E.botNextAction(G, seat); const before = G.stack.length;
      let r = E.apply(G, seat, a);
      if (!r.ok) { a = { type: G.phase === 'draw' ? 'timeout' : 'discard', cardId: G.seats[seat].hand[0] && G.seats[seat].hand[0].id }; r = E.apply(G, seat, a); }
      rec.acts.push([seat, seat % 2 === 0 ? 1 : 0, 0].concat(encode(a)));
      if (G.stack.length > before) rec.rs[rec.acts.length - 1] = G.stack.map((c) => c.id);
    }
    rec.end = 'over'; rec.result = { reason: G.result.reason, scores: G.result.scores, winner: G.result.winner };
    lines.push(JSON.stringify(rec));
  }
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log('wrote ' + n + ' practice records to ' + out);
}

module.exports = { readRecords, decode, encode, startState, analyze, report };

if (require.main === module) {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
  const sim = args.indexOf('--simulate');
  if (sim >= 0) { simulate(+args[sim + 1] || 10, args[sim + 2] || 'practice-games.txt'); process.exit(0); }
  const opts = { deals: +opt('deals', 24), think: +opt('think', 6), margin: .1 };
  const out = opt('report', path.join(__dirname, '..', 'vault', 'Human Play Insights.md'));
  const files = args.filter((a) => !a.startsWith('--'));
  if (!files.length) { console.log('usage: node tools/analyze-games.js <records.txt|sheet.csv>... [--deals N] [--think N] [--report FILE|-]'); process.exit(1); }
  const recs = readRecords(files);
  console.log('records read: ' + recs.length);
  const t0 = Date.now(), S = analyze(recs, opts), md = report(S, opts, files.map((f) => path.basename(f)).join(', '));
  if (out === '-') console.log(md); else { fs.writeFileSync(out, md + '\n'); console.log('report written to ' + out); }
  console.log(`${S.games} games, ${S.decisions} decisions by people, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
