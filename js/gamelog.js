/* Limpa's Breakfast: game records.
   Every game played on this device, or hosted from it in an online room, is recorded so we can learn how people play:
   the starting deal (card ids only), every move with the seat, whether a person or the computer made it and how long it
   took, moves the game refused, and the result. No names or other personal details are recorded.
   Records are kept on this device (the latest KEEP games), sent to the collection point when one is set (ENDPOINT),
   and can be shared from the menu. tools/analyze-games.js replays them exactly and compares people's play with the
   computer's. A phone that joined someone else's room does not record: only the host sees every hand. */
(function () {
'use strict';
const E = window.LimpaEngine;

// Collection point: a Google Form with one paragraph question (see vault/Game Records.md). null = keep records on the device only.
const ENDPOINT = null;          // e.g. { url: 'https://docs.google.com/forms/d/e/FORM_ID/formResponse', field: 'entry.123456789' }
const FORMAT = 1, KEEP = 150, CHUNK = 30000, MIN_MOVES = 6;

const store = {
  get(k) { try { return localStorage.getItem('limpa.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('limpa.' + k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem('limpa.' + k); } catch (e) {} },
};
const readList = (k) => { try { const v = JSON.parse(store.get(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const enabled = () => store.get('records') !== 'off';
const device = () => { let d = store.get('device'); if (!d) { d = Math.random().toString(36).slice(2, 10); store.set('device', d); } return d; };
// which version of the computer players made the computer moves (a short fingerprint of their settings)
const botVersion = () => { const s = JSON.stringify(E.CFG.smart); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

// moves in a few characters: d draw, p pickup, r return pile, e end game, t timeout, n new meld, a add to meld, x throw
function enc(a) {
  switch (a && a.type) {
    case 'draw': return ['d'];
    case 'pickup': return ['p'];
    case 'returnPile': return ['r'];
    case 'endGame': return ['e'];
    case 'timeout': return ['t'];
    case 'newMeld': return a.choice !== undefined ? ['n', a.cardIds, a.choice] : ['n', a.cardIds];
    case 'addToMeld': { const o = ['a', a.meldId, a.cardIds]; if (a.wildPos !== undefined || a.confirmImpure) o.push(a.wildPos === undefined ? null : a.wildPos); if (a.confirmImpure) o.push(1); return o; }
    case 'discard': return ['x', a.cardId];
    default: return ['?', a && a.type];
  }
}

let cur = null;                  // the record being written
const now = () => Date.now();
const secs = (ms) => Math.round(ms / 100) / 10;

// keep the open record on the device too, so a reload or a closed tab doesn't lose it
function saveOpen() { if (cur) store.set('recording', JSON.stringify(cur)); }

function start(G, meta) {
  close('replaced');
  if (!enabled() || !G) return;
  const fresh = G.turnNo <= 1 && G.phase === 'draw' && !G.teams.some((t) => t.melds.length);
  cur = {
    f: FORMAT, id: now().toString(36) + Math.random().toString(36).slice(2, 7), dev: device(), bot: botVersion(),
    mode: (meta && meta.mode) || 'local', at: now(),
    seats: G.seats.map((s) => (s.bot ? { h: 0, lv: s.level } : { h: 1 })),
    // a fresh game is stored as its deal; a game picked up part way (a host reopening a room) as the whole position
    deal: fresh ? E.dealOf(G) : null, snap: fresh ? null : JSON.parse(JSON.stringify(Object.assign({}, G, { log: [], finishPlan: undefined }))),
    acts: [], bad: [], rs: {}, last: now(), stack: G.stack.length,
  };
  saveOpen();
}

// meta: { human: was it a person, hint: did they use the help button }
function move(G, seat, action, r, meta) {
  if (!cur || !G) return;
  const t = now(), human = !!(meta && meta.human), dt = secs(t - cur.last);
  if (!r || !r.ok) {                                             // a person's move the game refused: where the rules or the screen confuse
    if (human && cur.bad.length < 200) cur.bad.push([cur.acts.length, seat, dt].concat(enc(action), [String((r && r.error) || '').slice(0, 90)]));
    saveOpen(); return;
  }
  cur.last = t;
  cur.acts.push([seat, human ? (meta.hint ? 2 : 1) : 0, dt].concat(enc(action)));
  if (G.stack.length > cur.stack) cur.rs[cur.acts.length - 1] = G.stack.map((c) => c.id);   // an unclaimed deck was shuffled into the centre
  cur.stack = G.stack.length;
  if (G.phase === 'over') close('over', G); else saveOpen();
}

function close(why, G) {
  if (!cur) return;
  const rec = cur; cur = null; store.del('recording');
  if (rec.acts.length < MIN_MOVES) return;                       // nothing worth keeping
  rec.end = why; rec.ms = now() - rec.at;
  if (G && G.result) rec.result = { reason: G.result.reason, scores: G.result.scores, winner: G.result.winner, out: G.result.outSeat };
  delete rec.last; delete rec.stack;
  const all = readList('games'); all.push(rec);
  while (all.length > KEEP || (JSON.stringify(all).length > 1500000 && all.length > 1)) all.shift();
  store.set('games', JSON.stringify(all));
  if (ENDPOINT) { const q = readList('gamesToSend'); q.push(rec.id); store.set('gamesToSend', JSON.stringify(q.slice(-KEEP))); send(); }
}

// sends waiting records to the collection point; a record stays queued until the network accepts it
let sending = false;
async function send() {
  if (!ENDPOINT || sending || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  sending = true;
  try {
    const all = readList('games');
    for (const id of readList('gamesToSend')) {
      const rec = all.find((g) => g.id === id);
      if (rec) {
        const text = JSON.stringify(rec), parts = Math.ceil(text.length / CHUNK);
        for (let i = 0; i < parts; i++) {
          const body = new URLSearchParams({ [ENDPOINT.field]: parts > 1 ? JSON.stringify({ id: rec.id, part: i + 1, of: parts, text: text.slice(i * CHUNK, (i + 1) * CHUNK) }) : text });
          await fetch(ENDPOINT.url, { method: 'POST', mode: 'no-cors', body });
        }
      }
      store.set('gamesToSend', JSON.stringify(readList('gamesToSend').filter((x) => x !== id)));
    }
  } catch (e) { /* offline or blocked: try again later */ }
  sending = false;
}

// all records on this device as one file (one game per line), for sharing from the menu
function file() {
  const all = readList('games');
  return { count: all.length, text: all.map((g) => JSON.stringify(g)).join('\n') + (all.length ? '\n' : '') };
}

// a record left open by a reload or a closed tab is kept as interrupted
(function recover() {
  try { const open = JSON.parse(store.get('recording') || 'null'); if (open && open.f) { cur = open; close('interrupted'); } } catch (e) { store.del('recording'); }
})();
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', saveOpen);
  window.addEventListener('online', send);
  setTimeout(send, 4000);
}

window.LimpaLog = {
  start, move, close, send, file, enabled,
  setEnabled(on) { store.set('records', on ? 'on' : 'off'); if (!on) { cur = null; store.del('recording'); } },   // off: the game in progress is not kept
  get count() { return readList('games').length; },
  get collecting() { return !!ENDPOINT; },
};
})();
