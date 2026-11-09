/* Limpa's Breakfast — 3D table UI.
   Game flow, bots, timer, drag & drop and modals are carried over from the 2D prototype;
   the rendering layer (3D table scene, card faces, hand fan, layout) is new.
   All rules live in js/engine.js, which this file never modifies. */
(function () {
'use strict';
const E = window.LimpaEngine;
const AVATARS = ['🥞','🍳','☕','🥐','🧇','🍩','🥟','🍪','🫖','🍯'];
const BOT_NAMES = ['Chunnu','Munnu','Tunnu','Pappu','Guddu','Bablu'];
const LEVELS = ['easy', 'smart', 'expert'], LEVEL_NAME = { easy: 'Easy', smart: 'Smart', expert: 'Expert' };
const SUIT_ORDER = { S:0, H:1, D:2, C:3, J:4 };
const app = document.getElementById('app');

/* Scene tuning: how far the table is tipped back and how strong the perspective is. */
const TILT0 = 14, TILT_MIN = 6, PERSP = 1800;    // a gentle tilt; the table flattens further as melds pile up

/* ---------------- saved settings (one look: see vault/Design System.md) ---------------- */
const store = {
  get(k) { try { return localStorage.getItem('limpa.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('limpa.' + k, v); } catch (e) {} },
};
// a small stroke icon from the set in index.html
const ic = (name, cls) => `<svg class="ic ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* ---------------- sound: tiny synthesised effects, no audio files ---------------- */
const Sound = (() => {
  let ctx = null, on = store.get('sound') !== 'off';
  const ac = () => {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const tone = (c, f, at, dur, type, vol, to) => {
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  const fx = {
    draw:  (c, v) => tone(c, 520, 0, .09, 'triangle', .12 * v, 760),
    throw: (c, v) => tone(c, 240, 0, .12, 'sine', .2 * v, 110),
    place: (c, v) => { tone(c, 660, 0, .12, 'triangle', .13 * v); tone(c, 880, .07, .16, 'triangle', .12 * v); },
    error: (c, v) => tone(c, 170, 0, .22, 'sawtooth', .09 * v, 120),
    buzz:  (c, v) => { for (let i = 0; i < 4; i++) tone(c, 880, i * .22, .16, 'square', .16 * v); },
    turn:  (c, v) => { tone(c, 784, 0, .14, 'sine', .15 * v); tone(c, 1046, .1, .2, 'sine', .13 * v); },
    win:   (c, v) => [523, 659, 784, 1046].forEach((f, i) => tone(c, f, i * .13, .28, 'triangle', .16 * v)),
    lose:  (c, v) => [392, 330, 262].forEach((f, i) => tone(c, f, i * .18, .3, 'sine', .14 * v)),
  };
  return {
    get on() { return on; },
    play(name, quiet) { if (!on) return; const c = ac(); if (c && fx[name]) { try { fx[name](c, quiet ? .5 : 1); } catch (e) {} } },
    toggle() { on = !on; store.set('sound', on ? 'on' : 'off'); if (on) this.play('turn'); },
  };
})();
// Game records (js/gamelog.js): a switch, the records on this phone to send, and what is recorded
// Settings as list rows with a real switch (label left, switch right)
const swRow = (act, key, on, icon, label, note) => `<button class="row" data-act="${act}"${key ? ` data-key="${key}"` : ''} aria-pressed="${on ? 'true' : 'false'}">${ic(icon)}<span class="rl">${label}${note ? `<small>${note}</small>` : ''}</span><span class="sw" aria-hidden="true"></span></button>`;
const settingsRows = () => `<div class="rows">
    ${swRow('setting', 'hints', setting.hints(), 'bulb', 'New player help', 'Suggests a move at every step')}
    ${UI.net ? '' : swRow('setting', 'timer', store.get('timer') !== 'off', 'timer', 'Draw timer', '60 seconds to draw a card')}
    ${swRow('setting', 'slow', setting.slow(), 'slow', 'Slower computer moves')}
    ${swRow('sound', '', Sound.on, 'sound', 'Sound')}</div>`;
// Game records (js/gamelog.js): a switch, the records on this phone to send, and what is recorded
const recordsRow = () => `<h3>Game records</h3><div class="rows">
    ${swRow('records', '', !!(window.LimpaLog && LimpaLog.enabled()), 'record', 'Record games', 'Moves and scores only, no names. It helps us teach the computer how people play.')}
    ${window.LimpaLog && LimpaLog.count ? `<button class="row" data-act="sendRecords">${ic('send')}<span class="rl">Send ${LimpaLog.count} recorded game${LimpaLog.count === 1 ? '' : 's'}</span>${ic('chev', 'go')}</button>` : ''}</div>`;
async function shareRecords() {
  const f = window.LimpaLog ? LimpaLog.file() : { count: 0, text: '' };
  if (!f.count) { toast('No games recorded yet.'); return; }
  const name = 'limpa-games-' + new Date().toISOString().slice(0, 10) + '.txt';
  try {
    const file = new File([f.text], name, { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Limpa's Breakfast games" }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(new Blob([f.text], { type: 'text/plain' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Saved ' + f.count + ' games to your downloads.', 'good');
}

/* Comfort settings (saved on this phone) */
const setting = {
  hints: () => store.get('hints') === 'on',                         // suggestions: off unless a new player turns them on
  timer: () => !!UI.net || store.get('timer') !== 'off',            // the 60-second draw timer (always on in online games)
  slow: () => store.get('speed') === 'slow',                        // slower computer players
};

const UI = {
  screen:'menu', lobby:null, G:null, viewer:null, cover:null, spinning:false,
  tilt:TILT0, deckSeen:[null, null], step:'meld', peek:null, peekStage:null, helpShown:false, hintKey:'', hint:null, sel:new Set(), order:{}, deadline:null, deadlineKey:null, botTimer:null,
  modal:null, shake:null, dealing:false, toasts:[], joinMsg:'', M:null,
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isRed = (c) => c.s === 'H' || c.s === 'D';

/* ---------------- card faces ----------------
   Clean, large-index faces: rank over suit in the left strip (the part that shows when cards overlap) and a big suit
   at the bottom right; aces show one large suit, court cards a framed serif letter, jokers a violet star. Cards used as
   overlapped strips on the table ('tc') show only the index and a corner suit. */
function cardHTML(c, cls, extra, inner) {
  cls = cls || '';
  const small = /\btc\b/.test(cls);
  const attrs = (extra || '') + ' data-cid="' + c.id + '"';
  if (c.s === 'J') {
    return `<div class="card joker ${small ? '' : 'pipped'} ${cls}" ${attrs}><span class="cr">★</span><span class="jl">JOKER</span>${small ? '' : '<span class="jk">★</span>'}${inner || ''}</div>`;
  }
  const sym = E.SUIT_SYM[c.s], kind = small ? '' : c.r === 1 ? 'has-ace' : c.r >= 11 ? 'court' : '';
  const body = small ? '' : c.r === 1 ? `<span class="ace">${sym}</span>` : c.r >= 11 ? `<span class="face"><b>${E.rankTxt(c.r)}</b><i>${sym}</i></span>` : '';
  return `<div class="card ${isRed(c) ? 'red' : ''} ${c.r === 10 ? 'ten' : ''} ${kind} ${cls}" ${attrs}><span class="cr">${E.rankTxt(c.r)}</span><span class="cs">${sym}</span>${body}<span class="cc">${sym}</span>${inner || ''}</div>`;
}

function genId() { let s=''; for (let i=0;i<6;i++) s+=Math.floor(Math.random()*10); return s; }
function humans() { return UI.G ? UI.G.seats.map((s,i)=>s.bot?null:i).filter((i)=>i!==null) : []; }
function toast(text, kind) {
  const id = Math.random();
  UI.toasts.push({ id, text, kind });
  if (UI.toasts.length > 2) UI.toasts.shift();
  drawToasts();
  setTimeout(() => { UI.toasts = UI.toasts.filter((t) => t.id !== id); drawToasts(); }, kind === 'err' ? 4000 : 2400);
}
function drawToasts() {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('aria-live','polite'); app.appendChild(el); }
  el.innerHTML = UI.toasts.map((t) => `<div class="${t.kind||''}">${esc(t.text)}</div>`).join('');
}

/* ---------------- lobby & game flow ---------------- */
function newLobby() {
  return {
    gameId: genId(), teamNames: ['Bhujia','Kachori'], level: (['easy', 'smart', 'expert'].includes(store.get('level')) ? store.get('level') : 'expert'),
    seats: [
      { name:'You', avatar:'🥞', bot:false },
      { name:BOT_NAMES[0], avatar:'🍳', bot:true },
      { name:BOT_NAMES[1], avatar:'☕', bot:true },
      { name:BOT_NAMES[2], avatar:'🥐', bot:true },
    ],
  };
}

function startGame() {
  const L = UI.lobby;
  stopBot();
  UI.G = E.createGame({ gameId:L.gameId, teamNames:L.teamNames, seats:L.seats.map((s)=>({...s, level:L.level})) });
  UI.screen = 'game'; UI.tilt = TILT0; UI.sel.clear(); UI.order = {}; UI.modal = null; UI.cover = null;
  UI.deadline = null; UI.deadlineKey = null; resetDeckSeen();
  const hs = humans(); UI.viewer = hs.length ? hs[0] : 0;
  Rec.start(UI.G, { mode: hs.length > 1 ? 'hotseat' : 'local' });
  UI.dealing = true; UI.spinning = true;
  render();
  setTimeout(() => { UI.dealing = false; }, 1600);
  setTimeout(runSpinner, 900);
}

function runSpinner() {
  const G = UI.G; let i = 0, ticks = 0;
  const total = 14 + G.turn;
  UI.modal = { type:'spin', seat:0 }; render();
  const iv = setInterval(() => {
    ticks++; i = (i + 1) % 4; UI.modal.seat = i;
    if (ticks >= total) { clearInterval(iv); UI.modal.seat = G.turn; UI.modal.done = true; render();
      setTimeout(() => { UI.modal = null; UI.spinning = false; onTurnChange(); render(); }, 1100);
      return; }
    render();
  }, 110);
}

function onTurnChange() {
  const G = UI.G; if (!G) return;
  UI.sel.clear(); UI.step = 'meld'; UI.helpShown = false; UI.hintKey = '';
  if (UI.net) {                                   // online: everyone keeps their own seat, nobody passes a phone
    if (G.phase === 'over') { UI.modal = { type:'results' }; UI.deadline = null; return; }
    if (G.turn === UI.viewer) { Sound.play('turn'); if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} } }
    armTimer();
    if (isHost()) scheduleBot();
    return;
  }
  if (G.phase === 'over') { UI.modal = { type:'results' }; UI.deadline = null; return; }
  const hs = humans(); const cur = G.turn;
  if (!G.seats[cur].bot) {
    if (hs.length > 1 && UI.viewer !== cur) UI.cover = cur;
    else UI.viewer = cur;
    if (UI.cover === null) { Sound.play('turn'); if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} } }
  }
  armTimer();
  scheduleBot();
}

function armTimer() {
  const G = UI.G;
  if (!G || G.phase !== 'draw' || G.seats[G.turn].bot || UI.cover !== null || UI.spinning) return;
  if (!setting.timer()) { UI.deadline = null; return; }     // relaxed mode: no timer
  if (UI.net && G.turn !== UI.viewer) return;       // online: only your own turn has your timer
  const key = G.turnNo + '-' + (G.pileRefused ? 1 : 0);
  if (UI.deadlineKey === key) return;
  UI.deadlineKey = key; UI.deadline = Date.now() + E.CFG.drawSeconds * 1000;
}

/* Computer players think in background threads (bot-worker.js) when the page comes from the web, so the Expert can
   take its time without freezing anything. With several processor cores it thinks on a few threads at once: one thread
   lists the plans worth comparing, all of them play those plans out on their own imagined deals, and the totals are
   pooled, so the same thinking time covers several times as many deals. Opened as a local file, or if the browser
   refuses the threads, they think here with the engine's shorter default. */
const BOT_THINK_MS = 1200;     // per whole-turn plan; the pile-or-draw choice gets 60% of this
const BOT_THREADS = Math.max(1, Math.min(4, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1));
const Brain = (() => {
  let pool = [], seq = 0; const waiting = new Map();
  const fail = () => { pool = []; const cbs = [...waiting.values()]; waiting.clear(); cbs.forEach((cb) => cb(null)); };
  try {
    if (typeof Worker === 'function' && /^https?:$/.test(location.protocol)) {
      for (let i = 0; i < BOT_THREADS; i++) {
        const w = new Worker('js/bot-worker.js');
        w.onmessage = (e) => { const cb = waiting.get(e.data.id); waiting.delete(e.data.id); if (cb) cb(e.data); };
        w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); fail(); };
        pool.push(w);
      }
    }
  } catch (e) { pool = []; }
  const ask = (w, msg, cb) => { const id = ++seq; waiting.set(id, cb); try { w.postMessage(Object.assign({ id, thinkMs: BOT_THINK_MS }, msg)); } catch (e) { waiting.delete(id); cb(null); } };
  const local = (G, seat, done) => { let action = null; try { action = E.botNextAction(G, seat); } catch (e) {} done({ action, plan: G.finishPlan }); };
  return {
    threads: () => pool.length,
    think(G, seat, done) {
      if (!pool.length) return local(G, seat, done);
      if (pool.length === 1) return ask(pool[0], { op: 'think', state: G, seat }, (r) => done(r && !r.failed ? r : null));
      ask(pool[0], { op: 'prepare', state: G, seat }, (r) => {
        if (!r || r.failed) return done(null);
        if (!r.search) return done({ action: r.action, plan: r.plan });
        const { kind, lines, ms } = r.search, stats = []; let left = pool.length;
        pool.forEach((w) => ask(w, { op: 'run', state: G, seat, lines, ms }, (x) => {
          if (x && x.stats) stats.push(x.stats);
          if (--left) return;
          if (!stats.length) return done(null);
          const best = lines[E.pickLine(stats)];
          done({ action: best[0], plan: kind === 'plan' ? { turn: G.turnNo, seat, steps: best.slice(1) } : undefined });
        }));
      });
    },
  };
})();
const Rec = window.LimpaLog || { start() {}, move() {}, close() {}, file: () => ({ count: 0, text: '' }), enabled: () => false, setEnabled() {}, count: 0, collecting: false };
function stopBot() { clearTimeout(UI.botTimer); UI.botTimer = null; UI.botJob = null; }   // cancels a pending computer move, thinking or not
function scheduleBot() {
  const G = UI.G;
  if (!G || G.phase === 'over' || UI.botTimer || UI.botJob || UI.spinning || isGuest()) return;   // only the host (or a local game) plays for computers
  if (!G.seats[G.turn].bot) return;
  const seat = G.turn, turnNo = G.turnNo, phase = G.phase, n = G.seats[seat].hand.length;
  const job = UI.botJob = { result: null, waited: false };
  // the move is played once the computer has finished thinking and the usual pause has passed, whichever is later
  const go = () => {
    if (UI.botJob !== job || !job.result || !job.waited) return;
    UI.botJob = null;
    if (UI.G !== G || G.phase === 'over' || G.turn !== seat || G.turnNo !== turnNo || G.phase !== phase || G.seats[seat].hand.length !== n || !G.seats[seat].bot) { scheduleBot(); return; }
    if (job.result.plan !== undefined) G.finishPlan = job.result.plan || undefined;
    let a = job.result.action;
    if (!a) { try { a = E.botNextAction(G, seat); } catch (e) { a = null; } }      // the background thread failed: think here
    let r = a ? E.apply(G, seat, a) : { ok: false };
    if (!r.ok) { a = { type: G.phase === 'draw' ? 'timeout' : 'discard', cardId: G.seats[seat].hand[0] && G.seats[seat].hand[0].id }; r = E.apply(G, seat, a); }
    Rec.move(G, seat, a, r, { human: false });
    after(r, seat, turnNo, a && a.type);
  };
  UI.botTimer = setTimeout(() => { UI.botTimer = null; job.waited = true; go(); }, UI.botDelay !== undefined ? UI.botDelay : setting.slow() ? 1400 : 560);
  Brain.think(G, seat, (res) => { job.result = res || { action: null }; go(); });
}

function act(action, quiet) {
  if (isGuest()) return guestAct(action, quiet);
  const G = UI.G; const seat = UI.net ? UI.viewer : G.turn;
  const prevTurn = G.turnNo;
  const r = E.apply(G, seat, action);
  Rec.move(G, seat, action, r, { human: true, hint: !!UI.viaHint });
  if (!r.ok) { Sound.play('error'); if (!quiet) toast(r.error, 'err'); return r; }
  if (action.type === 'draw' || action.type === 'pickup') { UI.deadline = null; UI.step = 'meld'; }
  if (action.type === 'pickup') UI.sel = new Set([G.mustUse]);
  else UI.sel.clear();
  UI.helpShown = false;
  after(r, seat, prevTurn, action.type);
  return r;
}

function addToMeld(meldId, cardIds, wildPos, confirmImpure) {
  const action = { type:'addToMeld', meldId, cardIds: withMust(cardIds), wildPos, confirmImpure };
  const r = act(action, true);
  if (r.ok) return r;
  if (r.code === 'confirmImpure') { UI.modal = { type:'confirmImpure', action }; render(); return r; }
  Sound.play('error'); toast(r.error, 'err'); UI.shake = '#meld-' + meldId; mustTip(); render();
  return r;
}
// While a picked-up top card still has to be used, it is part of every meld you make (it can't be left out by mistake).
function withMust(ids) {
  const G = UI.G, m = G && G.mustUse;
  if (!m || G.phase !== 'play' || G.turn !== UI.viewer || ids.includes(m) || !G.seats[UI.viewer].hand.some((c) => c.id === m)) return ids;
  return [m].concat(ids);
}
// After a refused move while the top card is waiting, light up a move that does work (or Return).
function mustTip() { const G = UI.G; if (G && G.mustUse && G.turn === UI.viewer) UI.helpShown = true; }

function after(r, seat, prevTurnNo, actType) {
  afterLocal(r, seat, prevTurnNo, actType);
  if (isHost()) publishState({ seat, type: actType }, r.events);
}
function afterLocal(r, seat, prevTurnNo, actType) {
  const G = UI.G;
  (r.events || []).forEach((e) => { if (e.kind === 'good' || e.kind === 'bad' || e.kind === 'warn') toast(e.text, e.kind === 'bad' ? 'err' : 'good'); });
  UI.actor = { seat, type: actType };
  const quiet = seat !== UI.viewer;
  Sound.play(actType === 'draw' || actType === 'pickup' || actType === 'timeout' ? 'draw' : actType === 'discard' ? 'throw' : actType === 'newMeld' || actType === 'addToMeld' ? 'place' : '', quiet);
  (r.events || []).forEach((e) => { if (quiet && e.kind === 'info' && /picked up|returned the pile/.test(e.text)) toast(e.text); });
  if (G.phase === 'over') { UI.modal = { type:'results' }; UI.deadline = null; Sound.play(G.result.winner === E.teamOf(UI.viewer) ? 'win' : G.result.winner === null ? 'turn' : 'lose'); render(); return; }
  checkDeckReminder(r.events);
  if (G.turn !== seat || G.turnNo !== (prevTurnNo || G.turnNo)) onTurnChange();
  else { armTimer(); scheduleBot(); }
  render();
}

// Draw-timer countdown: updates the chip and the ring around your avatar without re-rendering.
setInterval(() => {
  const G = UI.G;
  if (!G || UI.screen !== 'game' || !UI.deadline || G.phase !== 'draw' || UI.cover !== null) return;
  if (UI.net && G.turn !== UI.viewer) return;
  const ms = Math.max(0, UI.deadline - Date.now());
  const left = Math.ceil(ms / 1000);
  const el = document.getElementById('timer');
  if (el) { el.textContent = '⏱ ' + left + 's'; el.classList.toggle('low', left <= 10); }
  const ring = document.getElementById('myRing');
  if (ring) ring.style.setProperty('--ringbg', ringBg(ms / (E.CFG.drawSeconds * 1000), left <= 10));
  if (left <= 0) {
    UI.deadline = null;
    toast("Time's up: auto draw & discard.", 'err');
    if (isGuest()) { guestSend({ t:'act', action:{ type:'timeout' } }); return; }
    const seat = G.turn; const r = E.apply(G, seat, { type:'timeout' });
    Rec.move(G, seat, { type: 'timeout' }, r, { human: true });
    after(r, seat, -1, 'timeout');
  }
}, 250);
const ringBg = (p, low) => `conic-gradient(${low ? 'var(--bad)' : 'var(--accent)'} ${(p * 360).toFixed(1)}deg,var(--line-2) 0)`;

/* ---------------- online rooms ----------------
   Host: runs the rules and the computer players, checks every move, and sends each guest a copy of the game
   with only that guest's own hand in it. Guest: shows what it is sent and forwards moves to the host. */
const NETCFG = { awayMs: 180000, heartbeatMs: 8000, deadMs: 30000, rejoinTries: 60 };
const ROOM_RE = /^[0-9]{6}$/;
const isHost = () => !!UI.net && UI.net.role === 'host';
const isGuest = () => !!UI.net && UI.net.role === 'guest';
const newToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const profile = () => ({ name: (store.get('name') || 'Player').slice(0, 14), avatar: store.get('avatar') || '🥞' });
const roomLink = (code) => location.href.split('#')[0] + '#room=' + code;
const shareText = (code) => `Join my game of Limpa's Breakfast! Room code: ${code}\n${roomLink(code)}`;
const normCode = (v) => String(v || '').replace(/[^0-9]/g, '').slice(0, 6);
const readJSON = (k) => { try { return JSON.parse(store.get(k)); } catch (e) { return null; } };
const fresh = (x) => x && Date.now() - (x.at || 0) < 8 * 3600 * 1000;

let wakeLock = null;
async function keepAwake() { try { if (navigator.wakeLock && document.visibilityState === 'visible' && UI.net) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (UI.net) keepAwake(); });

function publicLobby() {
  const L = UI.lobby;
  return { code: UI.net.code, teamNames: L.teamNames, level: L.level, started: !!UI.G, seats: L.seats.map((s) => ({ name: s.name, avatar: s.avatar, bot: !!s.bot, joined: !!s.joined })) };
}
function broadcastLobby() {
  const N = UI.net; if (!isHost()) return;
  const lobby = publicLobby();
  Object.keys(N.peers).forEach((k) => N.tr.send(k, { t: 'lobby', lobby }));
  persistHost();
}
function persistHost() {
  const N = UI.net; if (!isHost()) return;
  store.set('host', JSON.stringify({ code: N.code, G: UI.G, lobby: UI.lobby, tokens: N.tokens, at: Date.now() }));
}

/* ----- host ----- */
function createRoom(resume) {
  if (!window.LimpaNet || !LimpaNet.available()) { toast('Online rooms could not load. Reload the page and try again.', 'err'); return; }
  const pf = profile();
  const L = resume ? resume.lobby : {
    gameId: genId(), teamNames: ['Bhujia', 'Kachori'], level: (['easy', 'smart', 'expert'].includes(store.get('level')) ? store.get('level') : 'expert'),
    seats: [
      { name: pf.name, avatar: pf.avatar, bot: false, joined: true },
      { name: BOT_NAMES[0], avatar: '🍳', bot: true },
      { name: 'Open seat', avatar: '🍽️', bot: false, joined: false },
      { name: BOT_NAMES[2], avatar: '🥐', bot: true },
    ],
  };
  UI.lobby = L;
  const N = UI.net = { role: 'host', code: L.gameId, status: 'connecting', error: '', peers: {}, last: {}, seq: 0, tokens: resume ? resume.tokens : [null, null, null, null] };
  if (resume && resume.G) {                       // picking a game back up after the page was closed or reloaded
    UI.G = resume.G; UI.viewer = 0; resetDeckSeen(); UI.screen = 'game'; UI.tilt = TILT0; UI.order = {}; UI.sel.clear(); UI.modal = null;
    Rec.start(UI.G, { mode: 'online' });
    UI.G.seats.forEach((st, i) => { if (i > 0 && !st.bot) st.away = Date.now(); });
    UI.deadline = null; UI.deadlineKey = null; UI.dealing = false; UI.spinning = false;
    onTurnChange();
  } else { UI.G = null; UI.screen = 'room'; }
  N.tr = LimpaNet.host(L.gameId, {
    onOpen() { N.status = 'ready'; N.error = ''; persistHost(); render(); },
    onMessage: hostMessage, onGone: hostGone,
    onError(kind) {
      N.status = 'error';
      N.error = kind === 'unavailable-id' ? 'That room code is already in use. Close this room and make a new one.' : "Can't reach the room server. Check your internet connection, then tap Try again.";
      render();
    },
    onLost() { N.status = 'error'; N.error = 'The connection to the room server was lost. Tap Try again.'; render(); },
  });
  N.timer = setInterval(hostWatch, 3000);
  keepAwake(); render();
}

function hostMessage(key, msg) {
  const N = UI.net; if (!isHost() || !msg || typeof msg !== 'object') return;
  N.last[key] = Date.now();
  if (msg.t === 'hello') return hostHello(key, msg);
  const seat = N.peers[key]; if (seat === undefined) return;          // say hello first
  if (msg.t === 'ping') { N.tr.send(key, { t: 'pong' }); return; }
  if (msg.t === 'profile') {
    const nm = String(msg.name || '').slice(0, 14) || 'Player', av = String(msg.avatar || '').slice(0, 4) || '🥞';
    Object.assign(UI.lobby.seats[seat], { name: nm, avatar: av });
    if (UI.G) { UI.G.seats[seat].name = nm; UI.G.seats[seat].avatar = av; publishState({ seat: -1, type: 'presence' }, []); } else broadcastLobby();
    render(); return;
  }
  if (msg.t === 'leave') { hostDropSeat(seat, key, true); return; }
  if (msg.t === 'buzz') { hostBuzz(seat, +msg.to); return; }
  if (msg.t === 'act') {
    const G = UI.G; if (!G || G.phase === 'over' || !msg.action || typeof msg.action.type !== 'string') { N.tr.send(key, { t: 'reject', error: 'The game is not running.' }); return; }
    const prev = G.turnNo, r = E.apply(G, seat, msg.action);
    Rec.move(G, seat, msg.action, r, { human: true });
    if (!r.ok) { N.tr.send(key, { t: 'reject', error: r.error, code: r.code }); return; }
    after(r, seat, prev, msg.action.type);
  }
}
function hostBuzz(from, to) {
  const N = UI.net, G = UI.G; if (!isHost() || !G || !(to >= 0 && to < 4) || to === from || G.seats[to].bot) return;
  const now = Date.now(); if (now - (N.lastBuzz || 0) < 4000) return; N.lastBuzz = now;
  const name = G.seats[from].name;
  if (to === 0) { ringBuzz(name); return; }
  const k = Object.keys(N.peers).find((x) => N.peers[x] === to); if (k) N.tr.send(k, { t: 'buzz', name });
}
function ringBuzz(name) {
  Sound.play('buzz'); if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200, 100, 300]); } catch (e) {} }
  toast('🔔 ' + name + ' is waiting for you!', 'good');
}
function hostHello(key, m) {
  const N = UI.net, L = UI.lobby, G = UI.G;
  const name = String(m.name || 'Player').slice(0, 14) || 'Player', avatar = String(m.avatar || '🥞').slice(0, 4);
  let seat = m.token ? N.tokens.indexOf(m.token) : -1;
  if (seat < 1) {
    seat = -1;
    if (G) { N.tr.send(key, { t: 'full', reason: 'started' }); return; }
    seat = L.seats.findIndex((s, i) => i > 0 && !s.bot && !s.joined);
    if (seat < 0) { N.tr.send(key, { t: 'full', reason: 'full' }); return; }
    N.tokens[seat] = newToken();
  }
  Object.keys(N.peers).forEach((k) => { if (N.peers[k] === seat && k !== key) { N.tr.drop(k); delete N.peers[k]; } });
  N.peers[key] = seat;
  Object.assign(L.seats[seat], { name, avatar, joined: true, bot: false });
  N.tr.send(key, { t: 'welcome', seat, token: N.tokens[seat], code: N.code, lobby: publicLobby() });
  if (G) {
    const st = G.seats[seat]; const was = st.away || st.takenOver;
    Object.assign(st, { name, avatar, bot: false, away: null, takenOver: false });
    if (was) toast(name + ' is back', 'good');
    publishState({ seat: -1, type: 'presence' }, []);
    if (G.turn !== UI.viewer) { stopBot(); }
  } else { toast(name + ' joined', 'good'); broadcastLobby(); }
  Sound.play('turn', true); render();
}
function hostGone(key) {
  const N = UI.net; if (!isHost()) return;
  const seat = N.peers[key]; delete N.peers[key]; if (seat === undefined) return;
  hostDropSeat(seat, key, false);
}
// A guest left on purpose (leave) or the connection died (not on purpose).
function hostDropSeat(seat, key, onPurpose) {
  const N = UI.net, L = UI.lobby, G = UI.G; N.tr.drop(key); delete N.peers[key];
  const name = L.seats[seat].name;
  if (!G) { Object.assign(L.seats[seat], { name: 'Open seat', avatar: '🍽️', joined: false }); N.tokens[seat] = null; toast(name + ' left', 'err'); broadcastLobby(); render(); return; }
  const st = G.seats[seat];
  if (onPurpose) { Object.assign(st, { bot: true, takenOver: true, away: null, level: 'smart' }); N.tokens[seat] = null; toast(name + ' left. The computer takes their seat.', 'err'); scheduleBot(); }
  else { st.away = Date.now(); toast(name + ' lost connection. Waiting for them…', 'err'); }
  publishState({ seat: -1, type: 'presence' }, []); render();
}
// Every few seconds: drop silent guests, and hand an away player's seat to the computer after three minutes.
function hostWatch() {
  const N = UI.net; if (!isHost()) return;
  Object.keys(N.peers).forEach((k) => { if (Date.now() - (N.last[k] || 0) > NETCFG.deadMs) { const seat = N.peers[k]; delete N.peers[k]; N.tr.drop(k); if (seat !== undefined) hostDropSeat(seat, k, false); } });
  const G = UI.G; if (!G || G.phase === 'over') return;
  let changed = false;
  G.seats.forEach((st) => {
    if (st.away && !st.bot && Date.now() - st.away > NETCFG.awayMs) {
      Object.assign(st, { bot: true, takenOver: true, away: null, level: 'smart' }); changed = true;
      toast(st.name + ' has been away for 3 minutes. The computer is playing for them until they return.', 'err');
    }
  });
  if (changed) { publishState({ seat: -1, type: 'presence' }, []); scheduleBot(); render(); }
}
function publishState(actor, events) {
  const N = UI.net, G = UI.G; if (!isHost() || !G) return;
  const evs = (events || []).map((e) => ({ text: e.text, kind: e.kind }));
  Object.keys(N.peers).forEach((k) => {
    const seat = N.peers[k];
    N.tr.send(k, { t: 'state', seat, state: E.redact(G, seat), actor, events: evs, n: ++N.seq });
  });
  persistHost();
}
function startOnlineGame() {
  const L = UI.lobby;
  if (L.seats.some((s) => !s.bot && !s.joined)) { toast('Still waiting for everyone to join.', 'err'); return; }
  stopBot();
  UI.G = E.createGame({ gameId: L.gameId, teamNames: L.teamNames, seats: L.seats.map((s) => ({ name: s.name, avatar: s.avatar, bot: !!s.bot, level: L.level })) });
  Rec.start(UI.G, { mode: 'online' });
  UI.screen = 'game'; UI.tilt = TILT0; UI.sel.clear(); UI.order = {}; UI.modal = null; UI.cover = null; UI.deadline = null; UI.deadlineKey = null;
  UI.viewer = 0; UI.spinning = false; UI.dealing = true; setTimeout(() => { UI.dealing = false; }, 1600); resetDeckSeen();
  onTurnChange(); toast(UI.G.seats[UI.G.turn].name + ' starts', 'good');
  render(); publishState({ seat: -1, type: 'start' }, []);
}

/* ----- guest ----- */
function joinRoom(code) {
  if (!window.LimpaNet || !LimpaNet.available()) { UI.joinMsg = 'Online rooms could not load. Reload the page and try again.'; render(); return; }
  const sess = readJSON('session');
  const N = UI.net = { role: 'guest', code, status: 'connecting', error: '', token: sess && sess.code === code ? sess.token : null, mySeat: sess && sess.code === code ? sess.seat : null, tries: 0, joined: false };
  UI.G = null; UI.screen = 'room'; UI.joinMsg = ''; UI.lobby = null; render();
  guestConnect(); keepAwake();
  N.beat = setInterval(() => {
    if (!isGuest() || N !== UI.net) return;
    guestSend({ t: 'ping' });
    if (N.status === 'connected' && Date.now() - (N.lastMsg || 0) > NETCFG.deadMs) guestLost();
  }, NETCFG.heartbeatMs);
}
function guestConnect() {
  const N = UI.net; if (!isGuest()) return;
  if (N.tr) { try { N.tr.close(); } catch (e) {} }
  N.tr = LimpaNet.join(N.code, {
    onStage(st) { if (N === UI.net && !N.joined) { N.stage = st; if (UI.screen === 'room') render(); } },
    onOpen() {
      const pf = profile(); N.lastMsg = Date.now(); N.stage = 'hello'; if (UI.screen === 'room' && !N.joined) render();
      const tr = N.tr, stamp = N.lastMsg;
      const hello = () => { if (N === UI.net && N.tr === tr && tr.open && N.lastMsg === stamp) { tr.send({ t: 'hello', name: pf.name, avatar: pf.avatar, token: N.token }); setTimeout(hello, 4000); } };
      hello();
    },
    onMessage: guestMessage,
    onClose() { if (N === UI.net) guestLost(); },
    onError(kind) {
      if (N !== UI.net) return;
      if (N.joined) { guestLost(); return; }
      if (kind === 'timeout' && (N.first = (N.first || 0) + 1) < 3) { N.stage = 'retry'; render(); setTimeout(() => { if (N === UI.net && !N.joined) guestConnect(); }, 300); return; }
      leaveRoom(kind === 'not-found' ? 'No room found with that code. Check the code, or ask the host to share it again.' : "Couldn't connect to the room. Check your internet connection and try again.", true);
    },
  });
}
function guestLost() {
  const N = UI.net; if (!isGuest() || N.retry) return;
  N.status = 'lost'; render();
  N.retry = setTimeout(() => {
    N.retry = null; if (N !== UI.net) return;
    if (++N.tries > NETCFG.rejoinTries) { leaveRoom('Could not get back into the room.', true); return; }
    guestConnect(); N.retry = setTimeout(() => { N.retry = null; if (N === UI.net && N.status === 'lost') guestLost(); }, 6000);
  }, 3000);
}
function guestSend(msg) { const N = UI.net; return !!(isGuest() && N.tr && N.tr.send(msg)); }
function guestMessage(m) {
  const N = UI.net; if (!isGuest() || !m || typeof m !== 'object') return;
  N.lastMsg = Date.now();
  if (m.t === 'buzz') { ringBuzz(String(m.name || 'Someone').slice(0, 14)); return; }
  if (m.t === 'welcome') {
    N.mySeat = m.seat; N.token = m.token; N.status = 'connected'; N.joined = true; N.tries = 0; UI.lobby = lobbyFrom(m.lobby);
    store.set('session', JSON.stringify({ code: N.code, token: N.token, seat: N.mySeat, at: Date.now() }));
    if (!UI.G) UI.screen = 'room'; render();
  } else if (m.t === 'lobby') { UI.lobby = lobbyFrom(m.lobby); if (UI.screen === 'room') render(); }
  else if (m.t === 'state') applyRemote(m);
  else if (m.t === 'reject') { Sound.play('error'); toast(m.error || 'That move was not allowed.', 'err'); }
  else if (m.t === 'full') leaveRoom(m.reason === 'started' ? 'That game has already started.' : 'That room is full.', true);
  else if (m.t === 'bye') leaveRoom('The host closed the room.', true);
}
const lobbyFrom = (pl) => ({ gameId: pl.code, teamNames: pl.teamNames, level: pl.level, seats: pl.seats });
function inflate(red, seat) {
  const dummy = (tag, n) => Array.from({ length: n }, (_, k) => ({ id: tag + k, s: '?', r: 0 }));
  const G = red;
  G.seats.forEach((p, i) => { if (i !== seat) p.hand = dummy('h' + i + '_', p.handCount || 0); });
  G.stack = dummy('s', G.stackCount || 0);
  G.teams.forEach((t, i) => { t.deck = dummy('d' + i + '_', t.deckCount || 0); });
  return G;
}
function applyRemote(m) {
  const N = UI.net, me = m.seat, first = !UI.G || UI.screen !== 'game';
  const prevTurn = UI.G ? UI.G.turnNo : -1, prevPhase = UI.G ? UI.G.phase : null;
  const G = inflate(m.state, me);
  UI.G = G; UI.viewer = me; N.mySeat = me; N.status = 'connected';
  if (first) { resetDeckSeen(); UI.screen = 'game'; UI.tilt = TILT0; UI.sel.clear(); UI.order = {}; UI.modal = null; UI.dealing = true; UI.deadline = null; UI.deadlineKey = null; setTimeout(() => { UI.dealing = false; }, 1600); }
  else if (prevPhase === 'over' && G.phase !== 'over') { resetDeckSeen(); UI.modal = null; UI.sel.clear(); UI.order = {}; UI.dealing = true; UI.tilt = TILT0; UI.deadlineKey = null; setTimeout(() => { UI.dealing = false; }, 1600); }
  const a = m.actor || null; UI.actor = a;
  (m.events || []).forEach((e) => { if (e.kind === 'good' || e.kind === 'bad' || e.kind === 'warn') toast(e.text, e.kind === 'bad' ? 'err' : 'good'); });
  if (a && a.seat >= 0) {
    const quiet = a.seat !== me;
    Sound.play(a.type === 'draw' || a.type === 'pickup' || a.type === 'timeout' ? 'draw' : a.type === 'discard' ? 'throw' : a.type === 'newMeld' || a.type === 'addToMeld' ? 'place' : '', quiet);
    (m.events || []).forEach((e) => { if (quiet && e.kind === 'info' && /picked up|returned the pile/.test(e.text)) toast(e.text); });
    if (a.seat === me) { UI.helpShown = false; if (a.type === 'draw' || a.type === 'pickup') { UI.deadline = null; UI.step = 'meld'; } if (a.type === 'pickup') UI.sel = new Set([G.mustUse]); else UI.sel.clear(); }
  }
  if (!first) checkDeckReminder(m.events);
  if (G.phase === 'over') {
    if (!UI.modal || UI.modal.type !== 'results') { UI.modal = { type: 'results' }; Sound.play(G.result.winner === E.teamOf(me) ? 'win' : G.result.winner === null ? 'turn' : 'lose'); }
    UI.deadline = null; render(); return;
  }
  if (first || G.turnNo !== prevTurn) onTurnChange(); else armTimer();
  render();
}
// Check the move here first (the guest's copy has its own hand, the table and the piles), then ask the host to play it.
function guestAct(action, quiet) {
  const probe = JSON.parse(JSON.stringify(UI.G));
  const r = E.apply(probe, UI.viewer, action);
  if (!r.ok) { Sound.play('error'); if (!quiet) toast(r.error, 'err'); return r; }
  if (!guestSend({ t: 'act', action })) { toast('Not connected to the room right now.', 'err'); return { ok: false, error: 'offline' }; }
  return { ok: true, remote: true, events: [] };
}
function leaveRoom(msg, silent) {
  const N = UI.net;
  if (N) {
    if (isHost()) { Object.keys(N.peers).forEach((k) => N.tr.send(k, { t: 'bye' })); store.set('host', ''); }
    else if (N.tr && N.joined && !silent) guestSend({ t: 'leave' });
    if (isGuest() && (!msg || !silent || !/connect|room found/i.test(msg))) store.set('session', '');
    clearInterval(N.timer); clearInterval(N.beat); clearTimeout(N.retry);
    const tr = N.tr; setTimeout(() => { try { tr && tr.close(); } catch (e) {} }, 400);
  }
  Rec.close('left');
  UI.net = null; UI.G = null; UI.modal = null; UI.cover = null; UI.screen = 'menu'; UI.lobby = null;
  stopBot();
  render(); if (msg) toast(msg, silent ? 'err' : 'good');
}
function shareRoom() {
  const code = UI.net.code, data = { title: "Limpa's Breakfast", text: shareText(code), url: roomLink(code) };
  if (navigator.share) { navigator.share({ title: data.title, text: shareText(code) }).catch(() => {}); return; }
  copyText(shareText(code), 'Invite copied. Paste it into a message.');
}
function copyText(txt, ok) {
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast(ok, 'good')).catch(() => toast(txt));
}

/* ---------------- extra-deck reminder ----------------
   When your team's extra deck is claimed, explain what it means once, at that moment. */
function resetDeckSeen() { const G = UI.G; UI.deckSeen = G ? [G.teams[0].deckStatus, G.teams[1].deckStatus] : [null, null]; }
function checkDeckReminder(events) {
  const G = UI.G; if (!G || UI.viewer === null || UI.viewer === undefined) return;
  const t = E.teamOf(UI.viewer), st = G.teams[t].deckStatus, was = UI.deckSeen[t];
  UI.deckSeen[t] = st;
  if (was === 'unclaimed' && st === 'claimed' && G.phase !== 'over' && (!UI.modal || UI.modal.type === 'spin'))
    UI.modal = { type: 'deckTip', now: (events || []).some((e) => /keeps playing/.test(e.text)) };
}

/* ---------------- assistance: what to do next, in plain words ----------------
   The suggestion comes from the same Smart player the computer uses, asked what it would do in your seat. */
function stageOf(G, myTurn) {
  if (!G || G.phase === 'over' || !myTurn) return 'watch';
  if (G.phase === 'draw') return 'draw';
  return 'play';
}
function computeHint(stage) {
  const G = UI.G, seat = UI.viewer;
  if (!G || G.turn !== seat || G.phase === 'over') return null;
  const probe = JSON.parse(JSON.stringify(G));
  probe.seats[seat].level = 'smart'; probe.seats[seat].params = null;
  let a = null; try { a = E.botNextAction(probe, seat); } catch (e) { return null; }
  if (!a) return null;
  const hand = G.seats[seat].hand, nm = (id) => { const c = hand.find((x) => x.id === id); return c ? E.cardName(c) : 'card'; };
  switch (a.type) {
    case 'draw': return { action: a, target: 'stack', text: 'Draw a card from the deck.' };
    case 'pickup': { const top = G.discard[G.discard.length - 1]; return { action: a, target: 'pile', text: 'Take the pile. The ' + (top ? E.cardName(top) : 'top card') + ' can be used.' }; }
    case 'returnPile': return { action: a, text: "That card can't be used. Return the pile and draw instead." };
    case 'newMeld': return { action: a, cards: a.cardIds, text: 'Make a new meld with the ' + a.cardIds.length + ' glowing cards.' };
    case 'addToMeld': {
      const m = G.teams[E.teamOf(seat)].melds.find((x) => x.id === a.meldId);
      return { action: a, cards: a.cardIds, meldId: a.meldId, text: 'Add the ' + nm(a.cardIds[0]) + ' to the glowing ' + (m && m.type === 'set' ? 'set' : 'run') + '.' };
    }
    case 'discard': return { action: a, cards: [a.cardId], text: 'Throw the ' + nm(a.cardId) + '.' };
    case 'endGame': return { action: a, text: 'End the game.' };
  }
  return null;
}
// The suggestion for this exact position, worked out once and kept until something changes.
function currentHint(stage) {
  const G = UI.G, key = [G.turnNo, G.phase, UI.viewer, G.seats[UI.viewer].hand.length, G.teams[0].melds.length + '/' + G.teams[1].melds.length, G.discard.length].join('-');
  if (UI.hintKey !== key) { UI.hintKey = key; UI.hint = stage === 'watch' ? null : computeHint(stage); UI.helpShown = false; }
  return UI.hint;
}
function useHint(h) {
  if (!h) return;
  const a = h.action;
  UI.hintKey = ''; UI.helpShown = false;
  UI.viaHint = true;                                     // recorded as a move made with the help button
  try { if (a.type === 'addToMeld') addToMeld(a.meldId, a.cardIds, undefined, a.confirmImpure); else act(a); } finally { UI.viaHint = false; }
}

/* ---------------- hand order & layout ---------------- */
function sortIds(hand) {
  return hand.slice().sort((a,b) => (SUIT_ORDER[a.s]-SUIT_ORDER[b.s]) || ((b.r===1?14:b.r)-(a.r===1?14:a.r))).map((c)=>c.id);
}
function handOf(seat) {
  const hand = UI.G.seats[seat].hand;
  let ord = UI.order[seat];
  if (!ord) ord = UI.order[seat] = sortIds(hand);
  const ids = new Set(hand.map((c)=>c.id));
  ord = ord.filter((id)=>ids.has(id));
  if (hand.some((c)=>!ord.includes(c.id))) ord = sortIds(hand);       // a new card arrived: tidy the whole hand
  UI.order[seat] = ord;
  const byId = {}; hand.forEach((c)=>{ byId[c.id]=c; });
  return ord.map((id)=>byId[id]);
}

let probe = null;
function inset(side) {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  return parseFloat(side === 'top' ? cs.paddingTop : cs.paddingBottom) || 0;
}

// One pass of layout maths: hand rows and fan, dock height, and how deep the table plane
// must be so that its far edge lands just under the avatars after perspective is applied.
function metrics(n, showHand) {
  const W = Math.min(app.clientWidth || window.innerWidth, 480), H = app.clientHeight || window.innerHeight;
  const hw = Math.max(58, Math.min(104, W * .215)), hh = hw * 1.42;
  const avail = W - 20 - hw;
  const minStep = hw * .36, maxStep = hw * .6;
  const per1 = Math.max(2, Math.floor(avail / minStep) + 1);
  const rows = showHand ? Math.min(4, Math.max(1, Math.ceil(n / per1))) : 1;
  const per = Math.ceil(Math.max(1, n) / rows);
  const step = per > 1 ? Math.min(maxStep, avail / (per - 1)) : 0;
  const rowStep = hh * .5, R = hh * 4.5;
  const actH = 50, guideH = 46, safeB = inset('bottom'), safeT = inset('top');
  const handH = (showHand ? hh * .95 + (rows - 1) * rowStep : hh * .62) + safeB * .35;
  const dockH = guideH + actH + handH;
  const c = Math.cos(UI.tilt * Math.PI / 180), s = Math.sin(UI.tilt * Math.PI / 180);
  const yb = H - (dockH - 30);                 // near edge of the table top, just under the dock edge
  const yf = Math.max(70, safeT + 78);         // far edge of the table on screen
  const yo = Math.max(10, safeT + 30);         // vanishing point of the perspective
  const ph = Math.max(300, PERSP * (yb - yf) / ((yf - yo) * s + PERSP * c));
  return { W, H, hw, hh, rows, per, step, rowStep, R, actH, guideH, handH, dockH, safeT, safeB, ph, yo };
}
function setVars(M) {
  const st = app.style;
  st.setProperty('--dock-h', M.dockH + 'px'); st.setProperty('--act-h', M.actH + 'px'); st.setProperty('--guide-h', M.guideH + 'px'); st.setProperty('--hand-h', M.handH + 'px');
  st.setProperty('--ph', M.ph.toFixed(1) + 'px'); st.setProperty('--po', M.yo + 'px');
  st.setProperty('--sat', M.safeT + 'px');
  st.setProperty('--tilt', UI.tilt + 'deg'); st.setProperty('--persp', PERSP + 'px');
}

/* ---------------- card flights ----------------
   The DOM is rebuilt on every render, so moves are animated by diffing card positions: a flat clone
   flies from where the card was (the stack, the player who played it, or its old zone) to where it
   landed, while the real card stays hidden until the clone arrives. */
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const FLY = new Map();   // card id -> flights in progress
// Eases in from rest and settles softly. The old curve (.22,.9,.28,1, 340 ms) covered 38% of the path in the first two
// frames, so on a phone the card looked like it jumped to the pile and then crept (tester video, 6 Nov 2026).
const FLY_MS = 400, FLY_EASE = 'cubic-bezier(.3,.2,.2,1)';
const zoneOf = (el) => el.closest('.hand') ? 'hand' : el.closest('.topwrap') ? 'top' : el.closest('.history') ? 'hist' : el.closest('.meld') ? 'meld' : 'other';
function geom(el, flat) {
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, pw: flat ? el.offsetWidth : r.width, tilt: flat ? 0 : UI.tilt,
    rot: flat ? (parseFloat(el.style.getPropertyValue('--rot')) || 0) : 0, nw: el.offsetWidth, nh: el.offsetHeight };
}
function snapshot() {
  if (REDUCED || UI.dealing || UI.screen !== 'game' || !app.querySelector('.game')) return null;
  const cards = {};
  app.querySelectorAll('[data-cid]').forEach((el) => {
    const z = zoneOf(el); if (z === 'other') return;
    cards[el.dataset.cid] = Object.assign(geom(el, z === 'hand'), { zone: z, html: z === 'top' || z === 'hist' ? el.outerHTML : null });
  });
  const stack = app.querySelector('.stackcard'), deck = app.querySelector('.zonewrap.own .dstack');
  return { viewer: UI.drawnViewer, cards, stack: stack && geom(stack, false), deck: deck && geom(deck, false) };
}
function launch(node, from, to, delay, fade, done) {
  const w = document.createElement('div'); w.className = 'fly';
  w.style.cssText = `width:${to.nw}px;height:${to.nh}px;left:${to.cx - to.nw / 2}px;top:${to.cy - to.nh / 2}px`;
  const tf = (g, d) => `translate(${d ? g.cx - to.cx : 0}px,${d ? g.cy - to.cy : 0}px) rotate(${g.rot}deg) scale(${(g.pw / to.nw).toFixed(3)}) rotateX(${g.tilt}deg)`;
  w.style.transform = tf(from, true);                          // parked where it starts until the new layout is on screen
  w.appendChild(node); document.body.appendChild(w);
  // Start on the next frame, not now: the render that called us has just rebuilt and measured the page, and on a phone
  // that first frame can come late. An animation started now would spend its first frames before anything is drawn and
  // the card would seem to jump most of the way. (A timer backs up the frame callback, which a hidden tab never runs.)
  let started = false;
  const start = () => {
    if (started) return; started = true;
    const a = w.animate([{ transform: tf(from, true), opacity: 1 }, { transform: tf(to, false), opacity: fade ? 0 : 1 }],
      { duration: FLY_MS, delay, easing: FLY_EASE, fill: 'both' });
    const end = () => { w.remove(); if (done) done(); };
    a.finished.then(end, end);
  };
  requestAnimationFrame(start); setTimeout(start, 100);
}
function flyCard(el, from, delay) {
  if (!el.offsetParent) return;                               // its mat is hidden in this step
  const cid = el.dataset.cid, to = geom(el, !!el.closest('.hand'));
  const node = el.cloneNode(true);
  ['data-cid', 'data-id', 'data-act', 'data-drag', 'data-drop', 'role', 'aria-label', 'aria-pressed'].forEach((a) => node.removeAttribute(a));
  node.classList.remove('sel', 'must', 'fresh', 'deal', 'can');
  FLY.set(cid, (FLY.get(cid) || 0) + 1); el.style.visibility = 'hidden';
  launch(node, from, to, delay, false, () => {
    const k = (FLY.get(cid) || 1) - 1;
    if (k) { FLY.set(cid, k); return; }
    FLY.delete(cid); app.querySelectorAll(`[data-cid="${cid}"]`).forEach((e) => { e.style.visibility = ''; });
  });
}
function playFlights(before) {
  const actor = UI.actor; UI.actor = null;
  if (before.viewer !== UI.viewer) return;     // the phone was passed: a different hand is on screen, nothing moved
  let src = null;
  if (actor && actor.seat !== UI.viewer) {
    const k = (actor.seat - UI.viewer + 4) % 4;
    const fan = app.querySelector('.fan-' + (k === 1 ? 'l' : k === 2 ? 't' : 'r'));
    if (fan) { const r = fan.getBoundingClientRect(); src = { cx: r.left, cy: r.top, pw: UI.M ? UI.M.W * .1 : 40, tilt: UI.tilt, rot: 0 }; }
  }
  const pile = (zz) => zz === 'top' || zz === 'hist';
  let n = 0;
  app.querySelectorAll('[data-cid]').forEach((el) => {
    const z = zoneOf(el); if (z === 'other') return;
    const prev = before.cards[el.dataset.cid];
    let from = null;
    if (prev) { if (!prev.pw) from = null; else if (prev.zone !== z && !(pile(prev.zone) && pile(z))) from = prev; }   // a discard just slides down the pile
    else if (z === 'hand') from = el.querySelector('.xd') ? before.deck : before.stack;
    else if (src) from = src;
    if (from) flyCard(el, from, Math.min(n++, 14) * 28);
    else if (prev && prev.pw && z === 'hand' && prev.zone === 'hand' && !REDUCED) {          // a card that stayed in the hand glides to its new place (or lifts / drops) instead of snapping
      const g = geom(el, true), dx = prev.cx - g.cx, dy = prev.cy - g.cy;
      if (Math.abs(dx) + Math.abs(dy) > 1.5) el.animate([{ translate: dx + 'px ' + dy + 'px' }, { translate: '0px 0px' }], { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)' });
    }
  });
  if (!src) return;
  if (actor.type === 'draw' && before.stack) {            // a computer player draws: a card back goes to their hand
    const back = document.createElement('div'); back.className = 'card back'; back.style.fontSize = (before.stack.nw * .36) + 'px';
    launch(back, before.stack, Object.assign({}, src, { nw: before.stack.nw, nh: before.stack.nh }), 0, true);
  }
  if (actor.type === 'pickup') {                           // a computer player takes the discard pile
    let i = 0;
    Object.keys(before.cards).forEach((cid) => {
      const p = before.cards[cid];
      if ((p.zone !== 'top' && p.zone !== 'hist') || app.querySelector(`[data-cid="${cid}"]`) || i > 14) return;
      const t = document.createElement('template'); t.innerHTML = p.html;
      const node = t.content.firstElementChild; ['data-cid', 'data-act'].forEach((a) => node.removeAttribute(a)); node.classList.remove('can');
      launch(node, p, Object.assign({}, src, { nw: p.nw, nh: p.nh }), i++ * 30, true);
    });
  }
}
const hideFlying = () => FLY.forEach((_, cid) => app.querySelectorAll(`[data-cid="${cid}"]`).forEach((e) => { e.style.visibility = 'hidden'; }));

// Sizes each team's meld cards to fill its mat: shrinks them until all melds fit without scrolling, or grows them
// (up to 1.45x) into spare room. A binary search, so it measures the layout about 9 times instead of up to 50.
// Fixed limits so meld cards never balloon on an empty mat or shrink to crumbs on a full one.
const MELD_MAX = 80, MELD_MIN = 32, MELD_MIN_ALL = 28;
function fitMelds() {
  let worst = 1;
  const all = !!app.querySelector('.game.show-own.show-opp');
  app.querySelectorAll('.zone').forEach((zone) => {
    const melds = zone.querySelector('.melds'), first = melds && melds.querySelector('.tc');
    if (!first || !zone.offsetParent) return;                 // nothing to fit while a mat is hidden
    const mw0 = Math.min(first.offsetWidth, MELD_MAX), lo0 = all ? MELD_MIN_ALL : MELD_MIN;
    const fits = (mw) => { melds.style.setProperty('--mw', mw.toFixed(1) + 'px'); return zone.scrollHeight <= zone.clientHeight + 1; };
    let lo, hi;
    if (fits(mw0)) {                                           // room to spare: grow into it, up to the cap
      const top = Math.min(MELD_MAX, mw0 * 1.3);
      if (fits(top)) return;
      lo = mw0; hi = top;
    } else {
      if (!fits(lo0)) { melds.style.setProperty('--mw', lo0 + 'px'); worst = Math.min(worst, lo0 / mw0); return; }   // still too many: the mat scrolls
      lo = lo0; hi = mw0;
    }
    for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    melds.style.setProperty('--mw', lo.toFixed(1) + 'px');
    worst = Math.min(worst, lo / mw0);
  });
  return worst;
}

/* ---------------- render ---------------- */
function render(carry) {
  const before = carry ? carry.before : snapshot();
  const keep = {};
  ['oppArea','ownArea','history'].forEach((id)=>{ const el=document.getElementById(id); if (el) keep[id]=[el.scrollLeft, el.scrollTop]; });
  let html = '';
  if (UI.screen === 'menu') html = renderMenu();
  else if (UI.screen === 'join') html = renderJoin();
  else if (UI.screen === 'lobby') html = renderLobby();
  else if (UI.screen === 'room') html = renderRoom();
  else if (UI.screen === 'game') html = renderGame();
  if (UI.modal) html += renderModal();
  if (UI.cover !== null && UI.screen === 'game') html += renderCover();
  if (UI.net && UI.net.status === 'lost' && UI.screen === 'game') html += '<div class="netbar">Connection lost. Reconnecting…</div>';
  app.classList.toggle('ingame', UI.screen === 'game');
  app.innerHTML = html + '<div id="toast" aria-live="polite"></div>';
  drawToasts();
  Object.keys(keep).forEach((id)=>{ const el=document.getElementById(id); if (el) { el.scrollLeft=keep[id][0]; el.scrollTop=keep[id][1]; } });
  if (UI.shake) { const el = document.querySelector(UI.shake); if (el) el.classList.add('shake'); UI.shake = null; }
  // Too many melds for the mat: tip the table flatter (more depth per row) and lay it out again.
  if (UI.screen === 'game' && fitMelds() < .85 && UI.tilt > TILT_MIN) { UI.tilt = Math.max(TILT_MIN, UI.tilt - 6); render({ before }); return; }
  if (before) playFlights(before);
  UI.drawnViewer = UI.viewer;
  hideFlying();
}
window.addEventListener('resize', () => { if (UI.screen === 'game') render(); });

const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); UI.installEvt = e; });
window.addEventListener('appinstalled', () => { UI.installEvt = null; render(); });
function renderMenu() {
  const fan = [['S', 1], ['H', 13], ['D', 12]].map(([su, r], i) =>
    cardHTML({ id: 'm' + i, s: su, r }, '', `style="transform:translateX(${(i - 1) * 46}%) rotate(${(i - 1) * 9}deg)"`)).join('');
  return `<div class="screen menu"><div class="room"></div>
    <header class="brand">
      <div class="fan3" aria-hidden="true">${fan}</div>
      <h1 class="wordmark">Limpa's<br><em>Breakfast</em></h1>
      <p class="sub">A team card game for four. Play on this phone, against the computer, or online with friends.</p>
    </header>
    <div class="menu-col">
      ${resumeButtons()}
      <button class="btn big" data-act="new">${ic('play', 'fill')}Play on this phone</button>
      <button class="btn ghost big" data-act="createRoom">${ic('users')}Play online with friends</button>
      <button class="btn ghost" data-act="join">Join with a room code</button>
      <div class="links"><button class="link" data-act="rules">How to play</button>${isStandalone() ? '' : '<button class="link" data-act="install">Add to home screen</button>'}</div>
    </div></div>`;
}

function resumeButtons() {
  const h = readJSON('host'), g = readJSON('session');
  let out = '';
  if (h && h.code && h.G && h.G.phase !== 'over' && fresh(h)) out += `<button class="btn green big" data-act="resumeHost">Resume your room ${esc(h.code)}</button>`;
  else if (h && h.code && !h.G && fresh(h)) out += `<button class="btn green big" data-act="resumeHost">Re-open your room ${esc(h.code)}</button>`;
  if (g && g.code && fresh(g)) out += `<button class="btn green big" data-act="rejoin">Rejoin room ${esc(g.code)}</button>`;
  return out;
}
function renderJoin() {
  const pf = profile();
  return `<div class="screen join"><div class="room"></div>
    <h1 class="logo" style="font-size:36px;margin:0">Join a game</h1>
    <div class="menu-col" style="align-items:stretch">
      <label for="nameIn" class="muted jl">Your name</label>
      <div class="namerow"><button class="ava" data-act="myAva" aria-label="Change your picture">${pf.avatar}</button><input id="nameIn" class="textin" value="${esc(pf.name)}" maxlength="14" autocomplete="off" /></div>
      <label for="gidIn" class="muted jl">Room code (from your friend's invite)</label>
      <input id="gidIn" class="textin code" placeholder="123456" maxlength="6" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${esc(UI.joinCode || '')}" />
      <button class="btn big" data-act="doJoin">Join</button>
      <div class="joinmsg">${esc(UI.joinMsg)}</div>
      <button class="btn ghost sm" data-act="home" style="align-self:center">${ic('back')}Back</button>
    </div></div>`;
}

function renderRoom() {
  const N = UI.net, L = UI.lobby, host = isHost();
  const stText = N.status === 'ready' || N.status === 'connected' ? 'Room open' : N.status === 'lost' ? 'Reconnecting…' : N.status === 'error' ? 'Not connected' : 'Connecting…';
  const stCls = N.status === 'ready' || N.status === 'connected' ? 'ok' : N.status === 'error' || N.status === 'lost' ? 'bad' : '';
  const head = `<div class="codebox"><small>ROOM CODE</small><b>${esc(N.code)}</b><span class="st ${stCls}">${stText}</span></div>`;
  if (!L) return `<div class="screen room-screen"><div class="room"></div>${head}<div class="muted" style="font-size:15px">${esc({ broker: 'Reaching the matchmaking server…', dialing: 'Finding the host…', hello: 'Found the host, joining…', retry: 'Slow connection, trying again…' }[N.stage] || 'Joining…')}</div><button class="btn ghost sm" data-act="leaveRoom">${ic('back')}Cancel</button></div>`;
  const seatRow = (i) => {
    const sp = L.seats[i], mine = i === (host ? 0 : N.mySeat);
    let right = '', left = `<span class="ava">${esc(sp.avatar)}</span><span class="rname">${esc(sp.name)}${mine ? ' <i class="you">you</i>' : ''}</span>`;
    if (host && i === 0) left = `<button class="ava" data-act="myAva" aria-label="Change your picture">${esc(sp.avatar)}</button><input class="textin sm" data-seatname="0" value="${esc(sp.name)}" maxlength="14" aria-label="Your name" />`;
    if (sp.bot) right = host ? `<button class="toggle on" data-act="roomSeat" data-seat="${i}" data-mode="open">Computer</button>` : `<span class="tag">Computer</span>`;
    else if (i === 0) right = `<span class="tag">Host</span>`;
    else if (sp.joined) right = host ? `<button class="toggle" data-act="roomSeat" data-seat="${i}" data-mode="kick">Remove</button>` : `<span class="tag ok">Here ✓</span>`;
    else right = host ? `<button class="toggle" data-act="roomSeat" data-seat="${i}" data-mode="cpu">Use computer</button>` : `<span class="tag">Waiting…</span>`;
    const wait = !sp.bot && !sp.joined && i > 0 ? '<span class="rname wait">Waiting for a friend…</span>' : '';
    return `<div class="seat-row ${!sp.bot && !sp.joined && i > 0 ? 'open' : ''}">${wait ? `<span class="ava dim">${ic('user')}</span>${wait}` : left}${right}</div>`;
  };
  const team = (t) => `<div class="team panel t${t}"><div class="tname">${host ? `<input class="team-name" data-team="${t}" value="${esc(L.teamNames[t])}" maxlength="16" aria-label="Team ${t + 1} name" />` : `<b>${esc(L.teamNames[t])}</b>`}</div>${seatRow(t)}${seatRow(t + 2)}</div>`;
  const waiting = L.seats.filter((s) => !s.bot && !s.joined).length;
  const share = `<div class="sharerow">
      <button class="btn sm" data-act="share">${ic('share')}Share invite</button>
      <a class="btn sm green" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(shareText(N.code))}">WhatsApp</a>
      <button class="btn sm ghost" data-act="copyLink">${ic('copy')}Copy link</button></div>`;
  let foot;
  if (host) foot = `${N.status === 'error' ? `<div class="joinmsg">${esc(N.error)}</div><button class="btn red" data-act="roomRetry">Try again</button>` : ''}
      <div class="level" role="group" aria-label="Computer skill"><span>Computer players</span>${LEVELS.map((v) => `<button class="seg ${L.level === v ? 'on' : ''}" data-act="level" data-level="${v}" aria-pressed="${L.level === v}">${LEVEL_NAME[v]}</button>`).join('')}</div>
      <button class="btn big" data-act="startRoom" style="width:min(340px,100%)" ${waiting || N.status === 'error' ? 'disabled' : ''}>${waiting ? 'Waiting for ' + waiting + ' more' : ic('play', 'fill') + 'Start game'}</button>
      <button class="btn ghost sm" data-act="leaveRoom">Close room</button>`;
  else foot = `<div class="muted" style="font-size:16px;font-weight:700;text-align:center">Waiting for the host to start…</div><button class="btn ghost sm" data-act="leaveRoom">Leave room</button>`;
  return `<div class="screen room-screen"><div class="room"></div>${head}${host ? share : ''}${team(0)}${team(1)}${foot}</div>`;
}

function renderLobby() {
  const L = UI.lobby;
  const team = (t) => `<div class="team panel t${t}">
      <input class="team-name" data-team="${t}" value="${esc(L.teamNames[t])}" maxlength="16" aria-label="Team ${t+1} name" />
      ${[t, t+2].map((i)=>`<div class="seat-row">
        <button class="ava" data-act="ava" data-seat="${i}" aria-label="Change avatar">${L.seats[i].avatar}</button>
        <input data-seatname="${i}" value="${esc(L.seats[i].name)}" maxlength="14" aria-label="Seat ${i+1} name" />
        <button class="toggle ${L.seats[i].bot?'on':''}" data-act="botToggle" data-seat="${i}" aria-pressed="${L.seats[i].bot}">${L.seats[i].bot?'Computer':'Person'}</button>
      </div>`).join('')}
    </div>`;
  const ready = L.seats.every((s)=>s.name.trim());
  return `<div class="screen lobby"><div class="room"></div>
    <h1 class="logo" style="font-size:32px;margin:0">New game</h1>
    ${team(0)}${team(1)}
    <div class="level" role="group" aria-label="Computer skill"><span>Computer players</span>
      ${LEVELS.map((v) => `<button class="seg ${L.level === v ? 'on' : ''}" data-act="level" data-level="${v}" aria-pressed="${L.level === v}">${LEVEL_NAME[v]}</button>`).join('')}</div>
    <p class="note" style="text-align:center;max-width:340px">Teammates sit opposite each other. With more than one person on this phone, you pass it between turns.</p>
    <button class="btn big" data-act="play" ${ready?'':'disabled'} style="width:min(340px,100%)">${ic('play', 'fill')}Play</button>
    <button class="btn ghost sm" data-act="home">${ic('back')}Back</button>
  </div>`;
}

const stackEdge = (n) => {
  const k = Math.max(1, Math.min(6, Math.ceil(n / 6))); const s = [];
  for (let i = 1; i <= k; i++) s.push(`${i}px ${i}px 0 ${i % 2 ? 'var(--back-2)' : 'var(--paper)'}`);
  return s.join(',');
};

function deckHTML(t) {
  const T = UI.G.teams[t];
  return T.deckStatus === 'unclaimed' ? `<div class="deck" title="Extra deck: claim it by emptying your hand"><div class="back dstack"><b>${esc(T.name)}</b></div></div>` : '';
}

function renderGame() {
  const G = UI.G;
  const viewer = UI.viewer;
  const myTeam = E.teamOf(viewer), oppTeam = 1 - myTeam;
  const myTurn = !G.seats[G.turn].bot && G.turn === viewer && UI.cover === null && G.phase !== 'over' && !UI.spinning;
  const showHand = !!UI.net || humans().length <= 1 || G.turn === viewer || G.phase === 'over';
  const playPhase = myTurn && G.phase === 'play';
  const cards = handOf(viewer);
  const M = UI.M = metrics(cards.length, showHand);
  setVars(M);

  const scoreChip = (t) => `<span class="score t${t} ${t === myTeam ? 'mine' : ''}"><span class="tn">${esc(G.teams[t].name)}</span><span class="n">${E.teamScore(G.teams[t])}</span></span>`;
  const seatAt = (k) => (viewer + k) % 4;
  const seatChip = (seat, pos) => {
    const s = G.seats[seat];
    const on = G.turn === seat && G.phase !== 'over' && !UI.spinning;
    return `<div class="seat ${pos} ${on ? 'turn' : ''}" data-seat="${seat}" style="--tcrgb:var(--t${s.team}rgb)">
      <div class="nm">${esc(s.name)}${s.away ? ' ⚠' : ''}</div></div>`;
  };
  // Face-down hand with the player's real card count.
  const fan = (pos, seat) => {
    let h = ''; const N = Math.max(1, G.seats[seat].hand.length), st = Math.min(6, 50 / Math.max(1, N - 1));
    for (let i = 0; i < N; i++) h += `<i class="back" style="--a:${((i - (N - 1) / 2) * st).toFixed(1)}deg"></i>`;
    return `<div class="fan fan-${pos}">${h}</div>`;
  };

  const zone = (t, own) => {
    const T = G.teams[t];
    const melds = T.melds.length
      ? T.melds.map((m) => meldHTML(m, own && playPhase, own && hintOn && H.meldId === m.id)).join('')
      : `<div class="empty">${own ? 'No melds yet. Select 3+ cards and tap New.' : 'No melds yet.'}</div>`;
    return `<div class="zonewrap ${own ? 'own' : 'opp'}" style="--tcrgb:var(--t${t}rgb)">
      <span class="zlabel">${esc(T.name)}</span>
      <div class="zone" id="${own ? 'ownArea' : 'oppArea'}">${deckHTML(t)}<div class="melds">${melds}</div></div></div>`;
  };

  const canDraw = myTurn && G.phase === 'draw' && G.stack.length;
  const canPick = myTurn && G.phase === 'draw' && G.discard.length && !G.pileRefused;
  const top = G.discard[G.discard.length - 1];
  const hist = G.discard.slice(0, -1).reverse();

  const stage = stageOf(G, myTurn);
  if (UI.peekStage !== stage) { UI.peek = null; UI.peekStage = stage; }
  const H = stage !== 'watch' ? currentHint(stage) : null;           // the suggestion for this step
  const hintOn = !!H && (setting.hints() || UI.helpShown);            // shown automatically (setting) or after tapping Help
  const hl = hintOn && H.cards ? new Set(H.cards) : new Set();
  const returnBtn = myTurn && G.mustUse, endBtn = myTurn && G.finalTurn && !G.mustUse;
  // plain-language instruction for this step
  const who = G.seats[G.turn];
  // no instruction panel: the buttons say what to do. Only exceptions are spelled out.
  let g1 = '', g2 = '';
  if (UI.spinning || G.phase === 'over') g1 = '';
  else if (stage === 'watch') { if (who.away) g1 = who.name + ' lost connection'; }
  else if (hintOn) g1 = '💡 ' + H.text;
  else if (G.mustUse && stage === 'play') g1 = 'Use the glowing card, or Return.';
  else if (G.finalTurn && stage === 'draw') g1 = 'Last turn: take the pile or end.';
  const deckNote = stage === 'play' && G.teams[myTeam].deckStatus === 'claimed' && !G.teams[myTeam].deckUsed;
  const viewNow = UI.peek || (stage === 'draw' ? 'piles' : stage === 'play' ? 'mine' : 'all');   // big and simple by default; All is one tap away
  const entering = UI.lastStage !== stage || UI.lastView !== viewNow;
  UI.lastStage = stage; UI.lastView = viewNow;
  const showOwn = viewNow === 'all' || viewNow === 'mine';          // by default the whole table is shown
  const showOpp = viewNow === 'all' || viewNow === 'opp';
  const pilesBig = viewNow === 'piles';
  const views = `<div class="views" role="group" aria-label="What to look at">${[['mine', 'Your melds'], ['opp', 'Their melds'], ['piles', 'Pile'], ['all', 'All']].map(([v, t]) =>
    `<button class="vchip ${viewNow === v ? 'on' : ''}" data-act="peek" data-v="${v}" aria-pressed="${viewNow === v}">${t}</button>`).join('')}</div>`;

  const mid = `<div class="mid" id="piles" data-drop="discard">
      <svg class="dir" viewBox="0 0 64 38" aria-hidden="true"><path d="M7 34C12 10 50 4 57 26" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/><path d="M63 24 55 37 47 25z" fill="currentColor"/></svg>
      <div class="stackwrap">${G.stack.length
        ? `<div class="back stackcard ${canDraw ? 'can' : ''} ${hintOn && H.target === 'stack' ? 'hintg' : ''}" style="--th:${stackEdge(G.stack.length)}" ${canDraw ? 'data-act="draw" role="button" aria-label="Draw from centre"' : ''}></div>`
        : '<div class="slot">Empty</div>'}${G.stack.length ? `<span class="count" aria-label="${G.stack.length} cards left">${G.stack.length}</span>` : ''}</div>
      <div class="topwrap">${top
        ? cardHTML(top, 'topdis ' + (canPick ? 'can' : '') + (hintOn && H.target === 'pile' ? ' hintg' : ''), canPick ? 'data-act="pickup" role="button" aria-label="Pick up the discard pile"' : '')
        : '<div class="slot">Drop to throw</div>'}</div>
      <div class="history" id="history">${hist.map((c) => cardHTML(c, 'tc')).join('')}</div>
    </div>`;

  const selIds = [...UI.sel];
  const selCards = selIds.map((id)=>G.seats[viewer].hand.find((c)=>c.id===id)).filter(Boolean);
  let newValid = false;
  if (playPhase && selCards.length >= 3) {
    const sets = G.teams[myTeam].melds.filter((m)=>m.type==='set').length;
    newValid = E.checkNewMeld(selCards, sets).ok
      && E.apply(JSON.parse(JSON.stringify(G)), viewer, { type: 'newMeld', cardIds: withMust(selIds) }).ok;   // green only if the rules will accept it
  }
  const on = playPhase;
  const thrower = selCards.length === 1 ? E.cardName(selCards[0]) : '';
  const helpBtn = `<button class="btn ghost help ${hintOn ? 'on' : ''}" data-act="help" ${H ? '' : 'disabled'} aria-label="${hintOn ? 'Do the suggested move for me' : 'Show me what to do'}">${hintOn ? 'Do it ✓' : '💡 Help'}</button>`;
  let ctl = '';
  const helpSlot = setting.hints() ? helpBtn : '';
  if (stage === 'draw') ctl = `<span class="ctl">${helpSlot}
      <button class="btn ghost" data-act="pickup" ${canPick ? '' : 'disabled'}>Take pile</button>
      ${G.finalTurn && !G.stack.length ? `<button class="btn red" data-act="endGame">End game</button>` : `<button class="btn" data-act="draw" ${canDraw ? '' : 'disabled'}>Draw card</button>`}</span>`;
  else if (stage === 'play') ctl = `<span class="ctl">${helpSlot}
      ${returnBtn ? `<button class="btn" data-act="returnPile" aria-label="Return the pile and draw instead">↩ Return</button>` : ''}
      <button class="btn ${newValid ? 'green place' : ''}" data-act="newMeld" id="newBtn" ${on && selCards.length >= 3 ? '' : 'disabled'}>${newValid ? 'Place ✓' : 'New meld'}</button>
      ${returnBtn ? '' : endBtn ? `<button class="btn red" data-act="endGame">End game</button>` : `<button class="btn red" data-act="discard" id="throwBtn" ${selCards.length === 1 && !G.finalTurn ? '' : 'disabled'}>${thrower ? 'Throw ' + esc(thrower) : 'Throw'}</button>`}</span>`;
  else if (stage === 'watch' && UI.net && G.phase !== 'over' && !who.bot && !who.away && G.turn !== viewer) ctl = `<span class="ctl"><button class="btn" data-act="buzz" aria-label="Ring ${esc(who.name)}">🔔 Ring ${esc(who.name)}</button></span>`;
  else if (stage === 'watch' && G.phase !== 'over' && !UI.spinning) ctl = `<span class="ctl"><span class="status">${esc(who.away ? who.name + ' lost connection' : who.name === 'You' ? 'Your turn' : who.name + (who.bot ? ' is thinking…' : ' is playing…'))}</span></span>`;
  else ctl = '<span class="ctl"></span>';

  const showTimer = myTurn && G.phase === 'draw' && UI.deadline;
  const msLeft = showTimer ? Math.max(0, UI.deadline - Date.now()) : 0;
  const ringStyle = showTimer ? `--ringbg:${ringBg(msLeft / (E.CFG.drawSeconds * 1000), msLeft <= 10000)}` : '';
  const me = G.seats[viewer];
  const meBlock = `<div class="me ${myTurn ? 'turn' : ''}" style="--tcrgb:var(--t${myTeam}rgb)">
      <div class="ring" id="myRing" style="${ringStyle}"><div class="ava">${me.avatar}</div>${showTimer ? `<span class="chip ${msLeft <= 10000 ? 'low' : ''}" id="timer">⏱ ${Math.ceil(msLeft / 1000)}s</span>` : ''}</div>
      <div class="nm you">${esc(me.name)}</div></div>`;

  let handHTML;
  if (showHand) {
    handHTML = `<div class="hand" id="hand">` + cards.map((c, i) => {
      const row = Math.floor(i / M.per), col = i % M.per;
      const inRow = Math.min(M.per, cards.length - row * M.per);
      const x = (col - (inRow - 1) / 2) * M.step;
      const rot = Math.asin(Math.max(-.95, Math.min(.95, x / M.R))) * 180 / Math.PI;
      const cls = ['hc'];
      if (UI.sel.has(c.id)) cls.push('sel');
      if (G.mustUse === c.id) cls.push('must');
      if (hl.has(c.id)) cls.push('hintc');
      if (G.lastDrawn === c.id && G.turn === viewer && G.phase === 'play' && G.drewFrom === 'stack') cls.push('fresh');
      if (UI.dealing) cls.push('deal');
      const style = `style="--rot:${rot.toFixed(2)}deg;--org:50% ${(M.hh / 2 + M.R).toFixed(1)}px;top:${(row * M.rowStep).toFixed(1)}px;z-index:${i + 1};${UI.dealing ? `animation-delay:${i * 45}ms` : ''}"`;
      return cardHTML(c, cls.join(' '), `data-act="sel" data-drag="hand" data-id="${c.id}" data-drop="hand:${c.id}" ${style} role="button" aria-pressed="${UI.sel.has(c.id)}" aria-label="${E.cardName(c)}"`,
        c.x !== undefined ? '<i class="xd" title="Extra-deck card"></i>' : '');
    }).join('') + '</div>';
  } else {
    handHTML = `<div class="hand"><div class="hidden"><div class="back"></div><span>Hand hidden while others play</span></div></div>`;
  }

  return `<div class="game stage-${stage} ${entering ? 'enter' : ''} ${showOwn ? 'show-own' : ''} ${showOpp ? 'show-opp' : ''} ${pilesBig ? 'piles-big' : 'piles-small'}">
    <div class="room"></div>
    <div class="stage"><div class="plane" id="plane">
      <div class="tablefill"></div>
      ${fan('l', seatAt(1))}${fan('t', seatAt(2))}${fan('r', seatAt(3))}
      ${zone(oppTeam, false)}
      ${mid}
      ${zone(myTeam, true)}
    </div></div>
    <div class="hud">
      <button class="iconbtn" data-act="menu" aria-label="Menu"><i></i><i></i><i></i></button>
      <div class="scorebar">${scoreChip(myTeam)}${scoreChip(oppTeam)}</div>
      <button class="iconbtn" data-act="rules" aria-label="How to play">?</button>
    </div>
    <div class="seats">${seatChip(seatAt(1), 'l')}${seatChip(seatAt(2), 't')}${seatChip(seatAt(3), 'r')}</div>
    <div class="dock">
      <div class="cta">${views}${g1 || deckNote ? `<div class="guide">${g1 ? `<div class="g1">${esc(g1)}</div>` : ''}${deckNote ? '<div class="g3">🟠 Meld an orange-dot card (extra deck).</div>' : ''}</div>` : ''}</div>
      <div class="actions">${meBlock}${ctl}</div>
      <div class="handwrap">${handHTML}</div>
    </div>
  </div>`;
}

function meldStatus(m) {
  const n = E.meldCards(m).length;
  const pureNow = E.meldPure(m);
  if (m.scored === 'timpa') return { cls:'timpa locked', text:'🔒 TIMPA' };
  if (E.isClosed(m) && E.isTimpa(m)) return { cls:'timpa locked', text:'🔒 TIMPA · end of turn' };
  const lock = E.isClosed(m) ? '🔒 ' : '';
  if (m.scored === 'pure' && !pureNow) return { cls:'impure', text: lock + '→ impure' };
  if (m.scored) return { cls: m.scored, text: lock + '✓ ' + n };
  if (n >= E.CFG.completeAt) return { cls: pureNow ? 'pure' : 'impure', text: lock + n + ' · end of turn' };
  return { cls:'', text: n + '/7' };
}

// The meld detail's one-line status, in words
function meldSummary(m) {
  const n = E.meldCards(m).length, pure = E.meldPure(m);
  if (m.scored === 'timpa' || (E.isClosed(m) && E.isTimpa(m))) return 'Timpa: 13 natural cards, locked' + (m.points ? ', ' + m.points + ' points' : '');
  if (m.scored) return 'Completed, ' + (m.scored === 'pure' && !pure ? 'turning impure at the end of the turn' : m.scored + ', ' + m.points + ' points');
  if (n >= E.CFG.completeAt) return 'Completed: scores ' + (pure ? 'as pure (200)' : 'as impure (100)') + ' at the end of the turn';
  const left = E.CFG.completeAt - n;
  return left + ' more card' + (left === 1 ? '' : 's') + ' to complete it (' + E.CFG.completeAt + ' cards scores)';
}

function meldHTML(m, droppable, hinted) {
  const cards = m.type === 'seq' ? m.slots : m.cards.map((c)=>({ c, r:m.rank }));
  const st = meldStatus(m);
  const canDrop = droppable && !E.isClosed(m);
  const items = cards.map((s)=>{
    const wild = m.type === 'seq' ? !E.isNaturalAt(s.c, s.r, m.suit) : (s.c.s === 'J' || s.c.r !== m.rank);
    const tag = wild && m.type === 'seq' ? `<span class="rep">=${E.rankTxt(s.r)}</span>` : '';
    return cardHTML(s.c, 'tc' + (wild?' wild':''), m.type==='seq' ? `data-r="${s.r}"` : '', tag);
  }).join('');
  return `<div class="meld ${st.cls} ${canDrop?'dropok':''} ${hinted ? 'hintm' : ''}" data-act="openMeld" data-meld="${m.id}" ${canDrop?`data-drop="meld:${m.id}"`:''} id="meld-${m.id}">
    ${st.cls ? `<span class="badge">${st.cls.includes('timpa') ? 'TIMPA' : '✓'}</span>` : ''}${items}</div>`;
}

function renderCover() {
  const s = UI.G.seats[UI.cover]; const T = UI.G.teams[s.team];
  return `<div class="ov"><div class="modal passbox">
    <div class="muted">Pass the phone to</div>
    <div class="ava">${s.avatar}</div>
    <h2>${esc(s.name)}</h2><div class="muted" style="margin-bottom:14px">Team ${esc(T.name)}</div>
    <button class="btn" data-act="reveal">I'm ${esc(s.name)}, show my cards</button>
  </div></div>`;
}

function renderModal() {
  const M = UI.modal; const G = UI.G;
  if (M.type === 'spin') {
    const s = G.seats[M.seat];
    return `<div class="ov"><div class="modal passbox spinner">
      <div class="muted">${M.done?'First to play':'Choosing who starts…'}</div>
      <div class="ava">${s.avatar}</div><h2>${esc(s.name)}</h2>
      <div class="muted">Team ${esc(G.teams[s.team].name)}</div></div></div>`;
  }
  if (M.type === 'install') {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return `<div class="ov"><div class="modal"><h2>Add to home screen</h2>
      <ol class="how">${ios
        ? '<li>Tap the <b>Share</b> button (square with an arrow) at the bottom of Safari.</li><li>Scroll and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. Open it from the new icon: it runs full screen.</li>'
        : '<li>Tap the <b>⋮ menu</b> in your browser.</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Open it from the new icon: it runs full screen.</li>'}</ol>
      ${ios ? '<p class="muted" style="font-size:14px">On iPhone this only works in Safari.</p>' : ''}
      <div style="text-align:right;margin-top:10px"><button class="btn" data-act="close">Got it</button></div></div></div>`;
  }
  if (M.type === 'rules') return `<div class="ov"><div class="modal">${rulesHTML()}<div style="text-align:right;margin-top:10px"><button class="btn" data-act="close">Got it</button></div></div></div>`;
  if (M.type === 'confirmImpure') {
    return `<div class="ov"><div class="modal" style="text-align:center">
      <h2>Make this meld impure?</h2>
      <p>Adding a wildcard turns this completed <b>pure</b> meld <b>impure</b>. It will drop from <b>200 to 100</b> at the end of your turn, and it won't count as your team's pure meld for going out.</p>
      <div class="bigrow"><button class="btn ghost" data-act="close">Cancel</button><button class="btn red" data-act="confirmImpure">Continue</button></div>
    </div></div>`;
  }
  if (M.type === 'menu' && UI.net) {
    return `<div class="ov"><div class="modal">
      <h2>Room ${esc(UI.net.code)}</h2>
      <p class="muted" style="margin:0 0 12px">${isHost() ? 'You are the host. Friends play on their own phones and the game runs on yours, so keep this page open.' : 'You are playing on your own phone. The host runs the game.'}</p>
      ${isHost() ? `<div class="sharerow" style="justify-content:flex-start"><button class="btn sm" data-act="share">${ic('share')}Share invite</button><button class="btn sm ghost" data-act="copyLink">${ic('copy')}Copy link</button></div>` : ''}
      <h3>Settings</h3>${settingsRows()}
      ${isHost() ? recordsRow() : ''}
      <div class="bigrow">
        <button class="btn" data-act="close" style="flex-basis:100%">Resume</button>
        <button class="btn ghost" data-act="rules">How to play</button>
        <button class="btn ghost danger" data-act="quit">${isHost() ? 'Close room' : 'Leave'}</button>
      </div></div></div>`;
  }
  if (M.type === 'menu') {
    return `<div class="ov"><div class="modal">
      <h2>Menu</h2>
      <h3>Players</h3>
      <div class="rows">${G.seats.map((s, i) => `<div class="row" style="cursor:default"><span class="ava" style="width:34px;height:34px;font-size:18px">${s.avatar}</span>
        <span class="rl">${esc(s.name)}<small>${esc(G.teams[s.team].name)}</small></span>
        <button class="toggle ${s.bot ? 'on' : ''}" data-act="seatBot" data-seat="${i}" aria-pressed="${s.bot}">${s.bot ? 'Computer' : 'Person'}</button></div>`).join('')}</div>
      <p class="note">Switch any seat between a person and the computer, even mid-game.</p>
      <h3>Settings</h3>${settingsRows()}
      ${recordsRow()}
      <div class="bigrow">
        <button class="btn" data-act="close" style="flex-basis:100%">Resume</button>
        <button class="btn ghost" data-act="rules">How to play</button>
        <button class="btn ghost" data-act="redeal">New deal</button>
        <button class="btn ghost danger" data-act="quit">Quit</button>
      </div></div></div>`;
  }
  if (M.type === 'deckTip') {
    return `<div class="ov"><div class="modal" style="text-align:center">
      <h2>Extra deck claimed</h2>
      <p>${M.now ? 'Your team\'s 11 extra cards are now in your hand, marked with an <b style="color:var(--orange)">orange dot</b>. Keep playing this turn.' : 'Your team\'s 11 extra cards are in your hand, marked with an <b style="color:var(--orange)">orange dot</b>. You can play them from your next turn.'}</p>
      <p style="text-align:left;margin:6px 0 0">Remember:<br>• Meld <b>at least one</b> orange-dot card, or your team loses <b>100 points</b>.<br>• To go out you need that, plus <b>2 finished melds</b>, one of them pure.</p>
      <div class="bigrow"><button class="btn" data-act="close">Got it</button></div>
    </div></div>`;
  }
  if (M.type === 'meld') {
    const m = [...G.teams[0].melds, ...G.teams[1].melds].find((x)=>x.id===M.meldId);
    if (!m) return '';
    const own = m.team === E.teamOf(UI.viewer);
    const cards = m.type === 'seq' ? m.slots : m.cards.map((c)=>({ c, r:m.rank }));
    const items = cards.map((s)=>{
      const wild = m.type === 'seq' ? !E.isNaturalAt(s.c, s.r, m.suit) : (s.c.s==='J'||s.c.r!==m.rank);
      return cardHTML(s.c, 'tc'+(wild?' wild':''), '', wild ? `<span class="rep">${m.type==='seq'?'='+E.rankTxt(s.r):'wild'}</span>` : '');
    }).join('');
    const st = meldStatus(m);
    let note;
    if (E.isClosed(m)) note = E.isTimpa(m) ? 'Timpa: 13 natural cards of one suit. It is locked and no cards can be added.' : 'This 13-card meld has a wildcard, so it scores as impure (100) and is closed. It can never become a Timpa.';
    else if (own) note = 'To add a wildcard, drag it from your hand to the exact spot on this meld. A wildcard only moves when a natural card takes its spot. Adding a wildcard to a completed pure meld makes it impure (200 → 100).';
    else note = 'Opponent meld (view only).';
    return `<div class="ov"><div class="modal">
      <h2>${m.type==='seq'?E.SUIT_SYM[m.suit]+' sequence':'Set of '+E.rankTxt(m.rank)+'s'} · ${cards.length} cards</h2>
      <div class="muted" style="font-size:15px">${esc(meldSummary(m))}</div>
      <div class="bigmeld">${items}</div>
      <p class="muted">${note}</p>
      <div style="text-align:right"><button class="btn" data-act="close">Close</button></div>
    </div></div>`;
  }
  if (M.type === 'results') {
    const R = G.result; const b = R.breakdown;
    const win = R.winner === null ? "It's a draw" : esc(b[R.winner].name) + ' wins';
    const pen = (x) => x.penalties.length ? x.penalties.map((p)=>`${p.pts} <span class="muted" style="font-size:10px">(${esc(p.reason)})</span>`).join('<br>') : '0';
    return `<div class="ov"><div class="modal">
      <div class="winner">${win}</div>
      <div class="muted" style="text-align:center;font-size:12px">${R.reason==='out'?esc(G.seats[R.outSeat].name)+' went out':'The centre stack ran out'}</div>
      <table class="res">
        <tr><th></th><th>${esc(b[0].name)}</th><th>${esc(b[1].name)}</th></tr>
        <tr><td>Pure melds</td><td>${b[0].pure + b[0].timpas}</td><td>${b[1].pure + b[1].timpas}</td></tr>
        <tr><td>Impure melds</td><td>${b[0].impure}</td><td>${b[1].impure}</td></tr>
        <tr><td>Timpas</td><td>${b[0].timpas}</td><td>${b[1].timpas}</td></tr>
        <tr><td>Meld points</td><td>${b[0].meldPoints}</td><td>${b[1].meldPoints}</td></tr>
        <tr><td>Going-out bonus</td><td>${b[0].bonus}</td><td>${b[1].bonus}</td></tr>
        <tr><td>Penalties</td><td>${pen(b[0])}</td><td>${pen(b[1])}</td></tr>
        <tr class="tot"><td>Total</td><td>${b[0].total}</td><td>${b[1].total}</td></tr>
      </table>
      <div class="bigrow">${isGuest() ? '<div class="muted" style="width:100%;text-align:center">Waiting for the host to start another game…</div>' : '<button class="btn" data-act="again">Play again</button>'}<button class="btn ghost" data-act="quit">${UI.net ? 'Leave room' : 'Main menu'}</button><button class="btn ghost" data-act="close">View table</button></div>
    </div></div>`;
  }
  return '';
}

function rulesHTML() {
  return `<h2>How to play · Limpa's Breakfast (2v2)</h2>
  <h3>Setup</h3><ul><li>2 decks + 4 Jokers (108 cards). 13 cards each, two face-down extra decks of 11 (one per team), 1 card face-up to start the discard pile, 33 in the centre.</li>
  <li>Teams sit alternately. A random player starts; play goes clockwise.</li></ul>
  <h3>Your turn</h3><ul><li><b>Draw</b> (60s): tap the centre stack, <i>or</i> tap the top discard to take the whole pile. If you take the pile, your first move must meld that top card. If you can't, tap <b>Return pile</b> and draw instead.</li>
  <li><b>Meld</b>: select 3+ cards, and <b>New</b> turns into <b>Place ✓</b> when valid. Drag cards onto a team meld to add them (invalid moves shake).</li>
  <li><b>Throw</b> one card (or drag it onto the discard pile) to end your turn.</li></ul>
  <h3>Melds</h3><ul><li><b>Sequence</b>: same suit, in order (A high or low, no wrap). <b>Set</b>: same rank, max 3 sets per team.</li>
  <li>Tip: sets of A, K, Q, J, 3 or 4 are safest. Middle cards (5 to 10) are usually needed to finish sequences.</li>
  <li>Wildcards: Jokers and 2s. <b>Only one wildcard per meld.</b> A 2 in its own place in its own suit (e.g. 3♥ 2♥ A♥) is a natural card.</li>
  <li>Drag a wildcard to the exact spot on a meld (a yellow bar shows where it lands). When a natural card takes a wildcard's spot, the wildcard shifts to the low end, or the high end if needed; if neither works, the move is blocked. Wildcards can't otherwise be moved, swapped back, or moved between melds.</li>
  <li>7+ cards = complete, scored at end of turn: pure 200, impure 100 (an impure meld stays impure).</li>
  <li><b>Adding a wildcard to a completed pure meld</b> makes it impure. You'll be asked to confirm; it drops to 100 at the end of the turn and no longer counts as your pure meld.</li>
  <li><b>Timpa</b>: all 13 cards of one suit with no wildcard = 500. A Timpa is locked. A 13-card sequence with a wildcard is impure (100) and closed.</li></ul>
  <h3>Extra deck &amp; going out</h3><ul><li>Empty your hand by melding: claim your team's extra deck and keep playing. Empty it by discarding: you get it next turn.</li>
  <li>Go out (+100, game ends) only after your team has claimed its deck, melded one of its cards, and has 2 completed melds incl. 1 pure.</li>
  <li>Unused claimed deck at the end: −100. If the centre runs out, any unclaimed deck is shuffled into the centre and that team gets −100 (and can no longer go out).</li>
  <li>When the centre is empty and no decks remain, the next player takes a final turn: use the discard pile or end the game.</li></ul>`;
}

/* ---------------- events ---------------- */
let suppressClick = 0;
app.addEventListener('click', (e) => {
  if (Date.now() < suppressClick) return;
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act; const G = UI.G;
  switch (a) {
    case 'new': UI.lobby = newLobby(); UI.screen = 'lobby'; render(); break;
    case 'join': UI.screen = 'join'; UI.joinMsg = ''; UI.joinCode = ''; render(); break;
    case 'doJoin': {
      const nm = (document.getElementById('nameIn').value || '').trim().slice(0, 14) || 'Player';
      store.set('name', nm);
      const code = normCode(document.getElementById('gidIn').value);
      UI.joinCode = code;
      if (!ROOM_RE.test(code)) { UI.joinMsg = 'That code looks wrong. It is 6 numbers, like 482913.'; render(); break; }
      joinRoom(code); break;
    }
    case 'home': UI.screen = 'menu'; UI.joinMsg = ''; render(); break;
    case 'install': {
      if (UI.installEvt) { const ev = UI.installEvt; UI.installEvt = null; try { ev.prompt(); } catch (e) {} break; }
      UI.modal = { type:'install' }; render(); break;
    }
    case 'rules': UI.modal = { type:'rules', prev:UI.modal }; render(); break;
    case 'close': UI.modal = (UI.modal && UI.modal.prev) || null; render(); break;
    case 'confirmImpure': {
      const action = Object.assign({}, UI.modal.action, { confirmImpure:true });
      UI.modal = null;
      const r = act(action);
      if (!r.ok) { UI.shake = '#meld-' + action.meldId; render(); }
      break;
    }
    case 'ava': { const s = UI.lobby.seats[+el.dataset.seat]; s.avatar = AVATARS[(AVATARS.indexOf(s.avatar)+1)%AVATARS.length]; render(); break; }
    case 'botToggle': { const s = UI.lobby.seats[+el.dataset.seat]; s.bot = !s.bot; if (!s.bot && BOT_NAMES.includes(s.name)) s.name = 'Player ' + (+el.dataset.seat+1); render(); break; }
    case 'copy': {
      const txt = `Join my Limpa's Breakfast game! Game ID: ${UI.lobby.gameId}`;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(()=>toast('Invite copied','good')).catch(()=>toast('Game ID: '+UI.lobby.gameId));
      break;
    }
    case 'sound': Sound.toggle(); render(); break;
    case 'level': UI.lobby.level = el.dataset.level; store.set('level', UI.lobby.level); if (isHost()) broadcastLobby(); render(); break;
    case 'play': startGame(); break;
    case 'createRoom': createRoom(); break;
    case 'resumeHost': { const h = readJSON('host'); if (h) createRoom(h); break; }
    case 'rejoin': { const g = readJSON('session'); if (g) joinRoom(g.code); break; }
    case 'startRoom': startOnlineGame(); break;
    case 'leaveRoom': leaveRoom(); break;
    case 'share': shareRoom(); break;
    case 'copyLink': copyText(roomLink(UI.net.code), 'Link copied.'); break;
    case 'roomRetry': { const L = UI.lobby, t = isHost() ? UI.net.tokens : null; const keep = { lobby: L, tokens: t, G: UI.G }; const tr = UI.net.tr; try { tr.close(); } catch (e) {} clearInterval(UI.net.timer); createRoom(keep.lobby ? keep : null); break; }
    case 'myAva': { const pf = profile(); const nx = AVATARS[(AVATARS.indexOf(pf.avatar) + 1) % AVATARS.length]; store.set('avatar', nx); if (isHost()) { UI.lobby.seats[0].avatar = nx; broadcastLobby(); } else if (isGuest()) guestSend({ t: 'profile', name: pf.name, avatar: nx }); render(); break; }
    case 'roomSeat': {
      const i = +el.dataset.seat, sp = UI.lobby.seats[i], N = UI.net, mode = el.dataset.mode;
      if (mode === 'cpu') Object.assign(sp, { bot: true, joined: false, name: BOT_NAMES[i - 1] || 'Computer', avatar: AVATARS[i] });
      else if (mode === 'open') Object.assign(sp, { bot: false, joined: false, name: 'Open seat', avatar: '🍽️' });
      else if (mode === 'kick') { const k = Object.keys(N.peers).find((x) => N.peers[x] === i); if (k) { N.tr.send(k, { t: 'bye' }); hostDropSeat(i, k, false); } break; }
      broadcastLobby(); render(); break;
    }
    case 'menu': UI.modal = { type:'menu' }; render(); break;
    case 'records': if (window.LimpaLog) { LimpaLog.setEnabled(!LimpaLog.enabled()); if (LimpaLog.enabled() && UI.G && !UI.net && UI.G.phase !== 'over') LimpaLog.start(UI.G, { mode: humans().length > 1 ? 'hotseat' : 'local' }); } render(); break;
    case 'sendRecords': shareRecords(); break;
    case 'seatBot': {
      const i = +el.dataset.seat; G.seats[i].bot = !G.seats[i].bot; UI.lobby.seats[i].bot = G.seats[i].bot;
      const hs = humans(); if (!hs.includes(UI.viewer) && hs.length) UI.viewer = hs[0];
      if (UI.cover !== null && G.seats[UI.cover].bot) UI.cover = null;
      toast(G.seats[i].bot ? G.seats[i].name + ' handed to the computer' : G.seats[i].name + ' is back', 'good');
      render(); onTurnChange(); render(); break;
    }
    case 'redeal': case 'again': UI.modal = null; if (isHost()) startOnlineGame(); else startGame(); break;
    case 'quit': if (UI.net) { leaveRoom(); break; } stopBot(); Rec.close('left'); UI.G = null; UI.modal = null; UI.cover = null; UI.screen = 'menu'; render(); break;
    case 'reveal': UI.viewer = UI.cover; UI.cover = null; armTimer(); render(); break;
    case 'sel': {
      if (G && G.turn !== UI.viewer) toast("It isn't your turn yet.");
      const id = el.dataset.id;
      if (G && G.mustUse === id && G.turn === UI.viewer && UI.sel.has(id)) { toast('The glowing card stays selected: it has to be used first.'); render(); break; }
      if (UI.sel.has(id)) UI.sel.delete(id); else UI.sel.add(id);
      UI.helpShown = UI.helpShown && false;
      render(); break;
    }
    case 'sort': UI.order[UI.viewer] = sortIds(G.seats[UI.viewer].hand); render(); break;
    case 'draw': act({ type:'draw' }); break;
    case 'pickup': act({ type:'pickup' }); break;
    case 'returnPile': act({ type:'returnPile' }); break;
    case 'endGame': act({ type:'endGame' }); break;
    case 'newMeld': {                       // wildcards are placed automatically (no question asked)
      const r = act({ type:'newMeld', cardIds: withMust([...UI.sel]) });
      if (!r.ok) { UI.shake = '#newBtn'; mustTip(); render(); }
      break;
    }
    case 'discard': act({ type:'discard', cardId:[...UI.sel][0] }); break;
    case 'openMeld': {
      // with cards selected, tapping one of your own melds adds them (no dragging needed)
      const mine = G && el.dataset.drop && UI.sel.size && stageOf(G, G.turn === UI.viewer && !G.seats[G.turn].bot && G.phase !== 'over') === 'play';
      if (mine) { const ids = [...UI.sel]; const r = addToMeld(el.dataset.meld, ids, hasWild(ids) ? defaultWildPos(el.dataset.meld) : undefined); break; }
      UI.modal = { type:'meld', meldId: el.dataset.meld }; render(); break;
    }
    case 'buzz': {
      const to = G.turn; if (!UI.net || to === UI.viewer || G.seats[to].bot) break;
      if (Date.now() - (UI.lastRing || 0) < 4000) { toast('Just rang. Give them a moment.'); break; }
      UI.lastRing = Date.now();
      if (isHost()) { if (UI.net.tr) { const k = Object.keys(UI.net.peers).find((x) => UI.net.peers[x] === to); if (k) UI.net.tr.send(k, { t: 'buzz', name: G.seats[UI.viewer].name }); } }
      else guestSend({ t: 'buzz', to });
      toast('🔔 Rang ' + G.seats[to].name, 'good'); break;
    }
    case 'peek': UI.peek = el.dataset.v; render(); break;
    case 'help': {
      const stage = stageOf(G, G.turn === UI.viewer && !G.seats[G.turn].bot && G.phase !== 'over'), H = currentHint(stage);
      if (!H) break;
      if (setting.hints() || UI.helpShown) { useHint(H); break; }          // second tap: do it
      UI.helpShown = true;
      if (H.cards && H.action && H.action.type === 'newMeld') UI.sel = new Set(H.cards);      // select the cards for the player
      if (H.cards && H.action && H.action.type === 'addToMeld') UI.sel = new Set(H.cards);
      if (H.cards && H.action && H.action.type === 'discard') UI.sel = new Set(H.cards);
      render(); break;
    }
    case 'setting': {
      const k = el.dataset.key; const cur = k === 'hints' ? setting.hints() : k === 'timer' ? store.get('timer') !== 'off' : setting.slow();
      store.set(k === 'slow' ? 'speed' : k, k === 'hints' ? (cur ? 'off' : 'on') : k === 'timer' ? (cur ? 'off' : 'on') : (cur ? 'normal' : 'slow'));
      UI.hintKey = ''; render(); break;
    }
  }
});
app.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.team !== undefined) UI.lobby.teamNames[+t.dataset.team] = t.value || (t.dataset.team==='0'?'Bhujia':'Kachori');
  if (t.id === 'nameIn') store.set('name', t.value.trim().slice(0, 14) || 'Player');
  if (isHost() && (t.dataset.team !== undefined || t.dataset.seatname !== undefined)) {
    if (t.dataset.seatname !== undefined) { UI.lobby.seats[0].name = t.value.slice(0, 14) || 'Player'; store.set('name', UI.lobby.seats[0].name); }
    clearTimeout(UI.lobbyT); UI.lobbyT = setTimeout(broadcastLobby, 250);
  }
  if (t.dataset.seatname !== undefined && !UI.net) {
    UI.lobby.seats[+t.dataset.seatname].name = t.value;
    const btn = app.querySelector('[data-act="play"]');
    if (btn) btn.disabled = !UI.lobby.seats.every((s)=>s.name.trim());
  }
});
app.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'gidIn') app.querySelector('[data-act="doJoin"]').click(); });

/* ---------------- drag & drop ---------------- */
let drag = null;
app.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-drag]');
  if (!el || e.button > 0 || drag) return;           // a second finger never starts or steals a drag
  drag = { el, id: el.dataset.id, x: e.clientX, y: e.clientY, active:false };
  try { el.setPointerCapture(e.pointerId); } catch (err) {}
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 9) return;
    const G = UI.G;
    if (!G || G.turn !== UI.viewer || G.seats[G.turn].bot || UI.cover !== null) { drag = null; return; }
    drag.active = true;
    drag.ids = UI.sel.has(drag.id) ? [...UI.sel] : [drag.id];
    const g = document.createElement('div'); g.className = 'dragghost';
    const c = drag.el.cloneNode(true); c.classList.remove('sel','must','deal','fresh');
    g.appendChild(c);
    if (drag.ids.length > 1) { const n = document.createElement('span'); n.className = 'n'; n.textContent = drag.ids.length; g.appendChild(n); }
    document.body.appendChild(g); drag.ghost = g;
    drag.el.style.opacity = '.35';
  }
  e.preventDefault();
  drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
  const tgt = dropTarget(e.clientX, e.clientY);
  document.querySelectorAll('.hover').forEach((n)=>{ if (n !== tgt) n.classList.remove('hover'); });
  if (tgt && !tgt.dataset.drop.startsWith('hand:')) tgt.classList.add('hover');
}, { passive:false });

function defaultWildPos() { return undefined; }
function hasWild(ids) {
  const hand = UI.G.seats[UI.viewer].hand;
  return ids.some((id)=>{ const c = hand.find((x)=>x.id===id); return c && E.isWildType(c); });
}
// Where a dragged wildcard would land on a meld. Card edges are read from the screen (the meld is
// tilted with the table); `rel` is converted back into the meld's own, untilted units for the marker.
function wildSpot(meldEl, x) {
  const cs = [...meldEl.querySelectorAll('.card[data-r]')];
  if (!cs.length) return null;
  const xs = cs.map((c)=>c.getBoundingClientRect().left);
  xs.push(cs[cs.length-1].getBoundingClientRect().right);
  let k = 0; xs.forEach((b,i)=>{ if (Math.abs(b-x) < Math.abs(xs[k]-x)) k = i; });
  const mr = meldEl.getBoundingClientRect();
  const k2 = mr.width ? meldEl.offsetWidth / mr.width : 1;
  const rel = (xs[k] - mr.left) * k2;
  if (k === 0) return { pos:'high', rel, label:'high end' };
  if (k === cs.length) return { pos:'low', rel, label:'low end' };
  return { pos:{ below:+cs[k-1].dataset.r, above:+cs[k].dataset.r }, rel, label:'here' };
}
function showInsBar(tgt, x) {
  document.querySelectorAll('.insbar').forEach((n)=>n.remove());
  if (!tgt || !tgt.dataset.drop.startsWith('meld:') || !drag || !hasWild(drag.ids)) return;
  const sp = wildSpot(tgt, x); if (!sp) return;
  const bar = document.createElement('div'); bar.className = 'insbar'; bar.style.left = sp.rel + 'px';
  bar.innerHTML = '<span>' + sp.label + '</span>'; tgt.appendChild(bar);
}
window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.active) return;
  suppressClick = Date.now() + 350;
  d.ghost.remove(); d.el.style.opacity = '';
  document.querySelectorAll('.insbar').forEach((n)=>n.remove());
  document.querySelectorAll('.hover').forEach((n)=>n.classList.remove('hover'));
  const tgt = dropTarget(e.clientX, e.clientY);
  if (!tgt) return;
  const [kind, val] = tgt.dataset.drop.split(':');
  if (kind === 'meld') {
    addToMeld(val, d.ids, undefined);                    // wildcards always find their own spot: where it was dropped doesn't matter
  } else if (kind === 'discard') {
    if (d.ids.length !== 1) { toast('Drop a single card to throw it.', 'err'); return; }
    act({ type:'discard', cardId: d.ids[0] });
  } else if (kind === 'hand' && !d.ids.includes(val)) {
    const ord = UI.order[UI.viewer].filter((id)=>!d.ids.includes(id));
    const rect = tgt.getBoundingClientRect();
    let idx = ord.indexOf(val); if (e.clientX > rect.left + rect.width * 0.3) idx++;
    ord.splice(idx, 0, ...d.ids); UI.order[UI.viewer] = ord; render();
  }
});
window.addEventListener('pointercancel', () => { if (drag && drag.ghost) { drag.ghost.remove(); drag.el.style.opacity=''; } drag = null; });
function dropTarget(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) { const t = el.closest && el.closest('[data-drop]'); if (t) return t; }
  return null;
}

window.__limpa = { UI, E, render, after, addToMeld, act, NETCFG, ROOM_RE, scheduleBot, Brain };
{ const m = /[#&]room=([0-9A-Za-z-]+)/.exec(location.hash || '');
  if (m) { UI.joinCode = normCode(m[1]); UI.screen = 'join'; try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) {} } }
render();
})();
