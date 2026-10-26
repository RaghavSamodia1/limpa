/* Limpa's Breakfast — 3D table UI.
   Game flow, bots, timer, drag & drop and modals are carried over from the 2D prototype;
   the rendering layer (3D table scene, card faces, hand fan, layout) is new.
   All rules live in js/engine.js, which this file never modifies. */
(function () {
'use strict';
const E = window.LimpaEngine;
const AVATARS = ['🥞','🍳','☕','🥐','🧇','🍩','🥟','🍪','🫖','🍯'];
const BOT_NAMES = ['Arjun','Meera','Kabir','Zoya','Ishaan','Tara'];
const SUIT_ORDER = { S:0, H:1, D:2, C:3, J:4 };
const app = document.getElementById('app');

/* Scene tuning: how far the table is tipped back and how strong the perspective is. */
const TILT = 40, PERSP = 1500;

const UI = {
  screen:'menu', lobby:null, G:null, viewer:null, cover:null, spinning:false,
  sel:new Set(), order:{}, deadline:null, deadlineKey:null, botTimer:null,
  modal:null, shake:null, dealing:false, toasts:[], joinMsg:'', M:null,
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isRed = (c) => c.s === 'H' || c.s === 'D';

/* ---------------- card faces ---------------- */
const PIPS = {
  2:[[50,0],[50,100]],
  3:[[50,0],[50,50],[50,100]],
  4:[[0,0],[100,0],[0,100],[100,100]],
  5:[[0,0],[100,0],[50,50],[0,100],[100,100]],
  6:[[0,0],[100,0],[0,50],[100,50],[0,100],[100,100]],
  7:[[0,0],[100,0],[50,25],[0,50],[100,50],[0,100],[100,100]],
  8:[[0,0],[100,0],[50,25],[0,50],[100,50],[50,75],[0,100],[100,100]],
  9:[[0,0],[100,0],[0,33],[100,33],[50,50],[0,67],[100,67],[0,100],[100,100]],
  10:[[0,0],[100,0],[50,17],[0,33],[100,33],[0,67],[100,67],[50,83],[0,100],[100,100]],
};
const COURT = { 11:'capJ', 12:'crownQ', 13:'crownK' };
function pipsHTML(r, sym) {
  return '<span class="pips">' + PIPS[r].map(([x, y]) =>
    `<i${y > 50 ? ' class="f"' : ''} style="left:${x}%;top:${y}%">${sym}</i>`).join('') + '</span>';
}
function faceHTML(c, sym) {
  return `<span class="face"><svg viewBox="0 0 32 22"><use href="#${COURT[c.r]}"/></svg><b>${E.rankTxt(c.r)}</b><i>${sym}</i></span>`;
}
// Cards used as overlapped strips ('tc') only show the index and a corner suit; everything else gets a full face.
function cardHTML(c, cls, extra, inner) {
  cls = cls || '';
  const small = /\btc\b/.test(cls);
  const attrs = (extra || '') + ' data-cid="' + c.id + '"';
  if (c.s === 'J') {
    return `<div class="card joker ${small ? '' : 'pipped'} ${cls}" ${attrs}><span class="cr">JOKER</span>${small ? '' : '<span class="jk">★</span>'}<span class="cc">★</span>${inner || ''}</div>`;
  }
  const sym = E.SUIT_SYM[c.s];
  let body = '';
  if (!small) body = c.r === 1 ? `<span class="pips"><i class="a" style="left:50%;top:50%">${sym}</i></span>` : c.r >= 11 ? faceHTML(c, sym) : pipsHTML(c.r, sym);
  return `<div class="card ${isRed(c) ? 'red' : ''} ${small ? '' : 'pipped'} ${cls}" ${attrs}><span class="cr">${E.rankTxt(c.r)}</span><span class="cs">${sym}</span>${body}<span class="cc">${sym}</span>${inner || ''}</div>`;
}

function genId() { const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for (let i=0;i<5;i++) s+=a[Math.floor(Math.random()*a.length)]; return 'LB-'+s; }
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
    gameId: genId(), teamNames: ['Bhujia','Kachori'],
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
  clearTimeout(UI.botTimer); UI.botTimer = null;
  UI.G = E.createGame({ gameId:L.gameId, teamNames:L.teamNames, seats:L.seats.map((s)=>({...s})) });
  UI.screen = 'game'; UI.sel.clear(); UI.order = {}; UI.modal = null; UI.cover = null;
  UI.deadline = null; UI.deadlineKey = null;
  const hs = humans(); UI.viewer = hs.length ? hs[0] : 0;
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
  UI.sel.clear();
  if (G.phase === 'over') { UI.modal = { type:'results' }; UI.deadline = null; return; }
  const hs = humans(); const cur = G.turn;
  if (!G.seats[cur].bot) {
    if (hs.length > 1 && UI.viewer !== cur) UI.cover = cur;
    else UI.viewer = cur;
    if (navigator.vibrate && UI.cover === null) { try { navigator.vibrate(40); } catch (e) {} }
  }
  armTimer();
  scheduleBot();
}

function armTimer() {
  const G = UI.G;
  if (!G || G.phase !== 'draw' || G.seats[G.turn].bot || UI.cover !== null || UI.spinning) return;
  const key = G.turnNo + '-' + (G.pileRefused ? 1 : 0);
  if (UI.deadlineKey === key) return;
  UI.deadlineKey = key; UI.deadline = Date.now() + E.CFG.drawSeconds * 1000;
}

function scheduleBot() {
  const G = UI.G;
  if (!G || G.phase === 'over' || UI.botTimer || UI.spinning) return;
  if (!G.seats[G.turn].bot) return;
  UI.botTimer = setTimeout(() => {
    UI.botTimer = null;
    if (!UI.G || UI.G !== G || G.phase === 'over' || !G.seats[G.turn].bot) return;
    const seat = G.turn;
    const prevTurn = G.turnNo;
    const act = E.botNextAction(G, seat);
    let r = E.apply(G, seat, act);
    if (!r.ok) r = E.apply(G, seat, { type: G.phase === 'draw' ? 'timeout' : 'discard', cardId: G.seats[seat].hand[0] && G.seats[seat].hand[0].id });
    after(r, seat, prevTurn, act && act.type);
  }, 620);
}

function act(action, quiet) {
  const G = UI.G; const seat = G.turn;
  const prevTurn = G.turnNo;
  const r = E.apply(G, seat, action);
  if (!r.ok) { if (!quiet) toast(r.error, 'err'); return r; }
  if (action.type === 'draw' || action.type === 'pickup') UI.deadline = null;
  if (action.type === 'pickup') UI.sel = new Set([G.mustUse]);
  else UI.sel.clear();
  after(r, seat, prevTurn, action.type);
  return r;
}

function addToMeld(meldId, cardIds, wildPos) {
  const action = { type:'addToMeld', meldId, cardIds, wildPos };
  const r = act(action, true);
  if (r.ok) return r;
  if (r.code === 'confirmImpure') { UI.modal = { type:'confirmImpure', action }; render(); return r; }
  toast(r.error, 'err'); UI.shake = '#meld-' + meldId; render();
  return r;
}

function after(r, seat, prevTurnNo, actType) {
  const G = UI.G;
  (r.events || []).forEach((e) => { if (e.kind === 'good' || e.kind === 'bad' || e.kind === 'warn') toast(e.text, e.kind === 'bad' ? 'err' : 'good'); });
  UI.actor = { seat, type: actType };
  if (G.phase === 'over') { UI.modal = { type:'results' }; UI.deadline = null; render(); return; }
  if (G.turn !== seat || G.turnNo !== (prevTurnNo || G.turnNo)) onTurnChange();
  else { armTimer(); scheduleBot(); }
  render();
}

// Draw-timer countdown: updates the chip and the ring around your avatar without re-rendering.
setInterval(() => {
  const G = UI.G;
  if (!G || UI.screen !== 'game' || !UI.deadline || G.phase !== 'draw' || UI.cover !== null) return;
  const ms = Math.max(0, UI.deadline - Date.now());
  const left = Math.ceil(ms / 1000);
  const el = document.getElementById('timer');
  if (el) { el.textContent = '⏱ ' + left + 's'; el.classList.toggle('low', left <= 10); }
  const ring = document.getElementById('myRing');
  if (ring) ring.style.setProperty('--ringbg', ringBg(ms / (E.CFG.drawSeconds * 1000), left <= 10));
  if (left <= 0) {
    UI.deadline = null;
    toast("Time's up: auto draw & discard.", 'err');
    const seat = G.turn; const r = E.apply(G, seat, { type:'timeout' });
    after(r, seat, -1, 'timeout');
  }
}, 250);
const ringBg = (p, low) => `conic-gradient(${low ? 'var(--bad)' : 'var(--yellow)'} ${(p * 360).toFixed(1)}deg,rgba(0,0,0,.45) 0)`;

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
  hand.forEach((c)=>{ if (!ord.includes(c.id)) ord.push(c.id); });
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
  const hw = Math.max(56, Math.min(92, W * .19)), hh = hw * 1.42;
  const avail = W - 20 - hw;
  const minStep = hw * .36, maxStep = hw * .6;
  const per1 = Math.max(2, Math.floor(avail / minStep) + 1);
  const rows = showHand ? Math.min(4, Math.max(1, Math.ceil(n / per1))) : 1;
  const per = Math.ceil(Math.max(1, n) / rows);
  const step = per > 1 ? Math.min(maxStep, avail / (per - 1)) : 0;
  const rowStep = hh * .5, R = hh * 4.5;
  const actH = 66, safeB = inset('bottom'), safeT = inset('top');
  const handH = (showHand ? hh * .95 + (rows - 1) * rowStep : hh * .62) + safeB;
  const dockH = actH + handH;
  const c = Math.cos(TILT * Math.PI / 180), s = Math.sin(TILT * Math.PI / 180);
  const yb = H - (dockH - 30);                 // near edge of the table top, just under the dock edge
  const yf = Math.max(92, safeT + 96);         // far edge of the table on screen
  const yo = Math.max(10, safeT + 30);         // vanishing point of the perspective
  const ph = Math.max(300, PERSP * (yb - yf) / ((yf - yo) * s + PERSP * c));
  return { W, H, hw, hh, rows, per, step, rowStep, R, actH, handH, dockH, safeT, safeB, ph, yo };
}
function setVars(M) {
  const st = app.style;
  st.setProperty('--dock-h', M.dockH + 'px'); st.setProperty('--act-h', M.actH + 'px'); st.setProperty('--hand-h', M.handH + 'px');
  st.setProperty('--ph', M.ph.toFixed(1) + 'px'); st.setProperty('--po', M.yo + 'px');
  st.setProperty('--sat', M.safeT + 'px');
  st.setProperty('--tilt', TILT + 'deg'); st.setProperty('--persp', PERSP + 'px');
}

/* ---------------- card flights ----------------
   The DOM is rebuilt on every render, so moves are animated by diffing card positions: a flat clone
   flies from where the card was (the stack, the player who played it, or its old zone) to where it
   landed, while the real card stays hidden until the clone arrives. */
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const FLY = new Map();   // card id -> flights in progress
const zoneOf = (el) => el.closest('.hand') ? 'hand' : el.closest('.topwrap') ? 'top' : el.closest('.history') ? 'hist' : el.closest('.meld') ? 'meld' : 'other';
function geom(el, flat) {
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, pw: flat ? el.offsetWidth : r.width, tilt: flat ? 0 : TILT,
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
  return { cards, stack: stack && geom(stack, false), deck: deck && geom(deck, false) };
}
function launch(node, from, to, delay, fade, done) {
  const w = document.createElement('div'); w.className = 'fly';
  w.style.cssText = `width:${to.nw}px;height:${to.nh}px;left:${to.cx - to.nw / 2}px;top:${to.cy - to.nh / 2}px`;
  w.appendChild(node); document.body.appendChild(w);
  const tf = (g, d) => `translate(${d ? g.cx - to.cx : 0}px,${d ? g.cy - to.cy : 0}px) rotate(${g.rot}deg) scale(${(g.pw / to.nw).toFixed(3)}) rotateX(${g.tilt}deg)`;
  const a = w.animate([{ transform: tf(from, true), opacity: 1 }, { transform: tf(to, false), opacity: fade ? 0 : 1 }],
    { duration: 380, delay, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'both' });
  const end = () => { w.remove(); if (done) done(); };
  a.finished.then(end, end);
}
function flyCard(el, from, delay) {
  const cid = el.dataset.cid, to = geom(el, !!el.closest('.hand'));
  const node = el.cloneNode(true);
  ['data-cid', 'data-act', 'data-drag', 'data-drop'].forEach((a) => node.removeAttribute(a));
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
  let src = null;
  if (actor && actor.seat !== UI.viewer) {
    const k = (actor.seat - UI.viewer + 4) % 4;
    const fan = app.querySelector('.fan-' + (k === 1 ? 'l' : k === 2 ? 't' : 'r'));
    if (fan) { const r = fan.getBoundingClientRect(); src = { cx: r.left, cy: r.top, pw: UI.M ? UI.M.W * .1 : 40, tilt: TILT, rot: 0 }; }
  }
  const pile = (zz) => zz === 'top' || zz === 'hist';
  let n = 0;
  app.querySelectorAll('[data-cid]').forEach((el) => {
    const z = zoneOf(el); if (z === 'other') return;
    const prev = before.cards[el.dataset.cid];
    let from = null;
    if (prev) { if (prev.zone !== z && !(pile(prev.zone) && pile(z))) from = prev; }   // a discard just slides down the pile
    else if (z === 'hand') from = el.querySelector('.xd') ? before.deck : before.stack;
    else if (src) from = src;
    if (from) flyCard(el, from, Math.min(n++, 14) * 30);
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

// Shrinks a team's meld cards until all of its melds fit on the mat without scrolling.
function fitMelds() {
  app.querySelectorAll('.zone').forEach((zone) => {
    const melds = zone.querySelector('.melds'), first = melds && melds.querySelector('.tc');
    if (!first) return;
    let mw = first.offsetWidth;
    for (let i = 0; i < 24 && zone.scrollHeight > zone.clientHeight + 1 && mw > 24; i++) {
      mw *= .94; melds.style.setProperty('--mw', mw.toFixed(1) + 'px');
    }
  });
}

/* ---------------- render ---------------- */
function render() {
  const before = snapshot();
  const keep = {};
  ['oppArea','ownArea','history'].forEach((id)=>{ const el=document.getElementById(id); if (el) keep[id]=[el.scrollLeft, el.scrollTop]; });
  let html = '';
  if (UI.screen === 'menu') html = renderMenu();
  else if (UI.screen === 'join') html = renderJoin();
  else if (UI.screen === 'lobby') html = renderLobby();
  else if (UI.screen === 'game') html = renderGame();
  if (UI.modal) html += renderModal();
  if (UI.cover !== null && UI.screen === 'game') html += renderCover();
  app.innerHTML = html + '<div id="toast" aria-live="polite"></div>';
  drawToasts();
  Object.keys(keep).forEach((id)=>{ const el=document.getElementById(id); if (el) { el.scrollLeft=keep[id][0]; el.scrollTop=keep[id][1]; } });
  if (UI.shake) { const el = document.querySelector(UI.shake); if (el) el.classList.add('shake'); UI.shake = null; }
  fitMelds();
  if (before) playFlights(before);
  hideFlying();
}
window.addEventListener('resize', () => { if (UI.screen === 'game') render(); });

function renderMenu() {
  const fan = [['S',1],['H',13],['D',12],['C',11],['S',10]].map(([s, r], i) =>
    cardHTML({ id:'m' + i, s, r }, '', `style="--sw:calc(var(--hw)*.4);width:var(--hw);height:var(--hh);font-size:calc(var(--hw)*.36);left:calc(50% - var(--hw)/2 + ${(i - 2) * 41}px);transform:rotate(${(i - 2) * 11}deg)"`)).join('');
  return `<div class="screen menu"><div class="room"></div><div class="menu-table"></div>
    <div class="logo" style="font-size:min(54px,12.5vw)"><div class="suits">♠ ♥ ♦ ♣</div>Limpa's<br>Breakfast<small>🥞 🍳 ☕ TEAM CARD GAME</small></div>
    <div class="menu-fan">${fan}</div>
    <div class="menu-col">
      <button class="btn" data-act="new">Start a new game</button>
      <button class="btn ghost" data-act="join">Join a game</button>
      <button class="btn ghost" data-act="rules">How to play</button>
      <div class="muted" style="font-size:11px;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.6)">Prototype · 2v2 · pass-and-play &amp; computer seats</div>
    </div></div>`;
}

function renderJoin() {
  return `<div class="screen join"><div class="room"></div>
    <div class="logo" style="font-size:36px">Join a game</div>
    <div class="menu-col" style="align-items:center">
      <label for="gidIn" class="muted" style="font-size:13px">Enter the Game ID shared with you</label>
      <input id="gidIn" placeholder="LB-XXXXX" maxlength="8" autocomplete="off" />
      <button class="btn" data-act="doJoin" style="width:100%">Join</button>
      <div class="muted" style="font-size:12px;text-align:center">${esc(UI.joinMsg)}</div>
      <button class="btn ghost sm" data-act="home">← Back</button>
    </div></div>`;
}

function renderLobby() {
  const L = UI.lobby;
  const team = (t) => `<div class="team panel t${t}">
      <input class="team-name" data-team="${t}" value="${esc(L.teamNames[t])}" maxlength="16" aria-label="Team ${t+1} name" />
      ${[t, t+2].map((i)=>`<div class="seat-row">
        <button class="ava" data-act="ava" data-seat="${i}" aria-label="Change avatar">${L.seats[i].avatar}</button>
        <input data-seatname="${i}" value="${esc(L.seats[i].name)}" maxlength="14" aria-label="Seat ${i+1} name" />
        <button class="toggle ${L.seats[i].bot?'on':''}" data-act="botToggle" data-seat="${i}">${L.seats[i].bot?'🤖 Computer':'🙂 Human'}</button>
      </div>`).join('')}
    </div>`;
  const ready = L.seats.every((s)=>s.name.trim());
  return `<div class="screen lobby"><div class="room"></div>
    <div class="gidrow"><span class="muted" style="font-size:12px">GAME ID</span><span class="gid">${esc(L.gameId)}</span>
      <button class="btn ghost sm" data-act="copy">📋 Copy</button></div>
    ${team(0)}${team(1)}
    <div class="muted" style="font-size:11px;text-align:center">Seats alternate ${esc(L.teamNames[0])} → ${esc(L.teamNames[1])}. Online rooms switch on with Firebase; for now human seats share this phone.</div>
    <button class="btn" data-act="play" ${ready?'':'disabled'} style="font-size:20px;padding:12px 40px">▶ Play</button>
    <button class="btn ghost sm" data-act="home">← Back</button>
  </div>`;
}

const stackEdge = (n) => {
  const k = Math.max(1, Math.min(6, Math.ceil(n / 6))); const s = [];
  for (let i = 1; i <= k; i++) s.push(`${i}px ${i}px 0 ${i % 2 ? '#8e1424' : '#fff'}`);
  return s.join(',');
};

function deckHTML(t) {
  const T = UI.G.teams[t];
  if (T.deckStatus === 'unclaimed') return `<div class="deck" title="Extra deck: claim it by emptying your hand"><div class="back dstack"><b>${esc(T.name)}</b></div><span class="dl">Extra<br>deck</span></div>`;
  if (T.deckStatus === 'claimed') return `<div class="deck done"><span class="pill ${T.deckUsed ? 'ok' : ''}">${T.deckUsed ? 'Deck used ✓' : 'Deck claimed'}</span></div>`;
  return `<div class="deck done"><span class="pill bad">Deck −100</span></div>`;
}

function renderGame() {
  const G = UI.G;
  const viewer = UI.viewer;
  const myTeam = E.teamOf(viewer), oppTeam = 1 - myTeam;
  const myTurn = !G.seats[G.turn].bot && G.turn === viewer && UI.cover === null && G.phase !== 'over' && !UI.spinning;
  const showHand = humans().length <= 1 || G.turn === viewer || G.phase === 'over';
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
      <div class="ring"><div class="ava">${s.avatar}${s.bot ? '<span class="bot">🤖</span>' : ''}</div><span class="hc2" title="Cards in hand">${s.hand.length}</span></div>
      <div class="nm">${esc(s.name)}</div></div>`;
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
      ? T.melds.map((m) => meldHTML(m, own && playPhase)).join('')
      : `<div class="empty">${own ? 'No melds yet. Select 3+ cards and tap New.' : 'No melds yet.'}</div>`;
    return `<div class="zonewrap ${own ? 'own' : 'opp'}" style="--tcrgb:var(--t${t}rgb)">
      <span class="zlabel">${esc(T.name)} · ${own ? 'your team' : 'opponents'}</span>
      <div class="zone" id="${own ? 'ownArea' : 'oppArea'}">${deckHTML(t)}<div class="melds">${melds}</div></div></div>`;
  };

  const canDraw = myTurn && G.phase === 'draw' && G.stack.length;
  const canPick = myTurn && G.phase === 'draw' && G.discard.length && !G.pileRefused;
  const top = G.discard[G.discard.length - 1];
  const hist = G.discard.slice(0, -1).reverse();

  let hint = '';
  if (UI.spinning) hint = 'Dealing…';
  else if (G.phase === 'over') hint = 'Game over';
  else if (!myTurn) hint = G.seats[G.turn].name + (G.seats[G.turn].bot ? ' is playing…' : "'s turn");
  else if (G.phase === 'draw') hint = G.finalTurn ? 'Final turn: use the pile or end' : 'Tap the stack or the top discard';
  else if (G.mustUse) hint = 'Meld the glowing card first';
  else hint = 'Drag to a meld or the pile';
  let ctaBtns = '';
  if (myTurn && G.mustUse) ctaBtns += `<button class="btn ghost sm" data-act="returnPile">↩ Return pile</button>`;
  if (myTurn && G.finalTurn && !G.mustUse) ctaBtns += `<button class="btn red sm" data-act="endGame">End game</button>`;

  const mid = `<div class="mid" id="piles" data-drop="discard">
      <svg class="dir" viewBox="0 0 64 38" aria-hidden="true"><path d="M7 34C12 10 50 4 57 26" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/><path d="M63 24 55 37 47 25z" fill="currentColor"/></svg>
      <div class="stackwrap">${G.stack.length
        ? `<div class="back stackcard ${canDraw ? 'can' : ''}" style="--th:${stackEdge(G.stack.length)}" ${canDraw ? 'data-act="draw" role="button" aria-label="Draw from centre"' : ''}></div><span class="cnt">${G.stack.length}</span>`
        : '<div class="slot">Empty</div>'}</div>
      <div class="topwrap">${top
        ? cardHTML(top, 'topdis ' + (canPick ? 'can' : ''), canPick ? 'data-act="pickup" role="button" aria-label="Pick up the discard pile"' : '')
        : '<div class="slot">Drop to throw</div>'}<span class="pilelbl">DISCARD · ${G.discard.length}</span></div>
      <div class="history" id="history">${hist.map((c) => cardHTML(c, 'tc')).join('')}</div>
    </div>`;

  const selIds = [...UI.sel];
  const selCards = selIds.map((id)=>G.seats[viewer].hand.find((c)=>c.id===id)).filter(Boolean);
  let newValid = false;
  if (playPhase && selCards.length >= 3) {
    const sets = G.teams[myTeam].melds.filter((m)=>m.type==='set').length;
    newValid = E.checkNewMeld(selCards, sets).ok;
  }
  const on = playPhase;
  const ctl = `<span class="ctl">
      <button class="btn ghost" data-act="sort" ${showHand ? '' : 'disabled'} aria-label="Sort hand">⇅ Sort</button>
      <button class="btn ${newValid ? 'green place' : ''}" data-act="newMeld" id="newBtn" ${on && selCards.length >= 3 ? '' : 'disabled'}>${newValid ? 'Place ✓' : 'New'}</button>
      <button class="btn red" data-act="discard" ${on && !G.finalTurn && selCards.length === 1 && !G.mustUse ? '' : 'disabled'}>Throw</button>
    </span>`;

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
      if (G.lastDrawn === c.id && G.turn === viewer && G.phase === 'play' && G.drewFrom === 'stack') cls.push('fresh');
      if (UI.dealing) cls.push('deal');
      const style = `style="--rot:${rot.toFixed(2)}deg;--org:50% ${(M.hh / 2 + M.R).toFixed(1)}px;top:${(row * M.rowStep).toFixed(1)}px;z-index:${i + 1};${UI.dealing ? `animation-delay:${i * 45}ms` : ''}"`;
      return cardHTML(c, cls.join(' '), `data-act="sel" data-drag="hand" data-id="${c.id}" data-drop="hand:${c.id}" ${style} role="button" aria-pressed="${UI.sel.has(c.id)}" aria-label="${E.cardName(c)}"`,
        c.x !== undefined ? '<i class="xd" title="Extra-deck card"></i>' : '');
    }).join('') + '</div>';
  } else {
    handHTML = `<div class="hand"><div class="hidden"><div class="back"></div><span>Hand hidden while others play</span></div></div>`;
  }

  return `<div class="game">
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
      <div class="cta"><span class="hint">${esc(hint)}</span>${ctaBtns}</div>
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

function meldHTML(m, droppable) {
  const cards = m.type === 'seq' ? m.slots : m.cards.map((c)=>({ c, r:m.rank }));
  const st = meldStatus(m);
  const canDrop = droppable && !E.isClosed(m);
  const items = cards.map((s)=>{
    const wild = m.type === 'seq' ? !E.isNaturalAt(s.c, s.r, m.suit) : (s.c.s === 'J' || s.c.r !== m.rank);
    const tag = wild && m.type === 'seq' ? `<span class="rep">=${E.rankTxt(s.r)}</span>` : '';
    return cardHTML(s.c, 'tc' + (wild?' wild':''), m.type==='seq' ? `data-r="${s.r}"` : '', tag);
  }).join('');
  return `<div class="meld ${st.cls} ${canDrop?'dropok':''}" data-act="openMeld" data-meld="${m.id}" ${canDrop?`data-drop="meld:${m.id}"`:''} id="meld-${m.id}">
    <span class="badge">${st.text}</span>${items}</div>`;
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
  if (M.type === 'rules') return `<div class="ov"><div class="modal">${rulesHTML()}<div style="text-align:right;margin-top:10px"><button class="btn" data-act="close">Got it</button></div></div></div>`;
  if (M.type === 'confirmImpure') {
    return `<div class="ov"><div class="modal" style="text-align:center">
      <h2>Make this meld impure?</h2>
      <p>Adding a wildcard turns this completed <b>pure</b> meld <b>impure</b>. It will drop from <b>200 to 100</b> at the end of your turn, and it won't count as your team's pure meld for going out.</p>
      <div class="bigrow"><button class="btn ghost" data-act="close">Cancel</button><button class="btn red" data-act="confirmImpure">Continue</button></div>
    </div></div>`;
  }
  if (M.type === 'menu') {
    return `<div class="ov"><div class="modal">
      <h2>Menu · ${esc(G.gameId)}</h2>
      <h3>Seats (simulate a player dropping for 3+ min)</h3>
      ${G.seats.map((s,i)=>`<div class="seat-row" style="margin-bottom:6px"><div class="ava" style="width:32px;height:32px;font-size:17px;border-width:2px">${s.avatar}</div>
        <div style="flex:1;font-weight:700">${esc(s.name)} <span class="muted" style="font-size:11px">· ${esc(G.teams[s.team].name)}</span></div>
        <button class="toggle ${s.bot?'on':''}" data-act="seatBot" data-seat="${i}">${s.bot?'🤖 Computer':'🙂 Human'}</button></div>`).join('')}
      <div class="bigrow" style="justify-content:flex-start">
        <button class="btn ghost sm" data-act="rules">How to play</button>
        <button class="btn ghost sm" data-act="redeal">New deal</button>
        <button class="btn red sm" data-act="quit">Quit</button>
        <button class="btn sm" data-act="close">Resume</button>
      </div></div></div>`;
  }
  if (M.type === 'wildpick') {
    return `<div class="ov"><div class="modal">
      <h2>Where should the wildcard go?</h2>
      <p class="muted">These cards can form the sequence more than one way. Pick the layout you want.</p>
      <div class="optrow">${M.opts.map((o,i)=>`<button type="button" class="opt" data-act="pickWild" data-i="${i}">
        <span class="cards">${o.cards.map((x)=>{ const w = !E.isNaturalAt(x.c,x.r,o.suit); return cardHTML(x.c,'tc'+(w?' wild':''),'', w?`<span class="rep">=${E.rankTxt(x.r)}</span>`:''); }).join('')}</span>
        <span><b>${esc(o.label)}</b><br><span class="muted" style="font-size:12px">${o.pure?'Pure':'Impure'}</span></span></button>`).join('')}</div>
      <div style="text-align:right;margin-top:10px"><button class="btn ghost" data-act="close">Cancel</button></div>
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
      <div class="muted" style="font-size:12px">${esc(st.text)}${m.points?' · '+m.points+' pts':''}</div>
      <div class="bigmeld">${items}</div>
      <p class="muted">${note}</p>
      <div style="text-align:right"><button class="btn" data-act="close">Close</button></div>
    </div></div>`;
  }
  if (M.type === 'results') {
    const R = G.result; const b = R.breakdown;
    const win = R.winner === null ? "It's a draw!" : '🏆 Team ' + esc(b[R.winner].name) + ' wins!';
    const pen = (x) => x.penalties.length ? x.penalties.map((p)=>`${p.pts} <span class="muted" style="font-size:10px">(${esc(p.reason)})</span>`).join('<br>') : '0';
    return `<div class="ov"><div class="modal">
      <div class="winner">${win}</div>
      <div class="muted" style="text-align:center;font-size:12px">${R.reason==='out'?esc(G.seats[R.outSeat].name)+' went out':'The centre stack ran out'}</div>
      <table class="res">
        <tr><th></th><th>${esc(b[0].name)}</th><th>${esc(b[1].name)}</th></tr>
        <tr><td>Completed (pure / impure)</td><td>${b[0].completed} (${b[0].pure+b[0].timpas} / ${b[0].impure})</td><td>${b[1].completed} (${b[1].pure+b[1].timpas} / ${b[1].impure})</td></tr>
        <tr><td>Timpas</td><td>${b[0].timpas}</td><td>${b[1].timpas}</td></tr>
        <tr><td>Meld points</td><td>${b[0].meldPoints}</td><td>${b[1].meldPoints}</td></tr>
        <tr><td>Going-out bonus</td><td>${b[0].bonus}</td><td>${b[1].bonus}</td></tr>
        <tr><td>Penalties</td><td>${pen(b[0])}</td><td>${pen(b[1])}</td></tr>
        <tr class="tot"><td>Total</td><td>${b[0].total}</td><td>${b[1].total}</td></tr>
      </table>
      <div class="bigrow"><button class="btn" data-act="again">Play again</button><button class="btn ghost" data-act="quit">Main menu</button><button class="btn ghost" data-act="close">View table</button></div>
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
    case 'join': UI.screen = 'join'; UI.joinMsg = ''; render(); break;
    case 'doJoin': {
      const v = (document.getElementById('gidIn').value || '').trim().toUpperCase();
      UI.joinMsg = !/^LB-[A-Z0-9]{5}$/.test(v) ? 'That ID looks wrong. It should look like LB-7KQ2M.'
        : 'Room lookup goes live once Firebase is connected. For now, start a new game and play pass-and-play on one device.';
      render(); break;
    }
    case 'home': UI.screen = 'menu'; render(); break;
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
    case 'play': startGame(); break;
    case 'menu': UI.modal = { type:'menu' }; render(); break;
    case 'seatBot': {
      const i = +el.dataset.seat; G.seats[i].bot = !G.seats[i].bot; UI.lobby.seats[i].bot = G.seats[i].bot;
      const hs = humans(); if (!hs.includes(UI.viewer) && hs.length) UI.viewer = hs[0];
      if (UI.cover !== null && G.seats[UI.cover].bot) UI.cover = null;
      toast(G.seats[i].bot ? G.seats[i].name + ' handed to the computer' : G.seats[i].name + ' is back', 'good');
      render(); onTurnChange(); render(); break;
    }
    case 'redeal': case 'again': UI.modal = null; startGame(); break;
    case 'quit': clearTimeout(UI.botTimer); UI.botTimer = null; UI.G = null; UI.modal = null; UI.cover = null; UI.screen = 'menu'; render(); break;
    case 'reveal': UI.viewer = UI.cover; UI.cover = null; armTimer(); render(); break;
    case 'sel': {
      if (G && G.turn !== UI.viewer) toast("It isn't your turn yet.");
      const id = el.dataset.id;
      if (UI.sel.has(id)) UI.sel.delete(id); else UI.sel.add(id);
      render(); break;
    }
    case 'sort': UI.order[UI.viewer] = sortIds(G.seats[UI.viewer].hand); render(); break;
    case 'draw': act({ type:'draw' }); break;
    case 'pickup': act({ type:'pickup' }); break;
    case 'returnPile': act({ type:'returnPile' }); break;
    case 'endGame': act({ type:'endGame' }); break;
    case 'newMeld': {
      const ids = [...UI.sel];
      const cards = ids.map((id)=>G.seats[UI.viewer].hand.find((c)=>c.id===id)).filter(Boolean);
      const sets = G.teams[E.teamOf(UI.viewer)].melds.filter((m)=>m.type==='set').length;
      const opts = E.newMeldOptions(cards, sets);
      if (opts.length > 1) { UI.modal = { type:'wildpick', ids, opts }; render(); break; }
      const r = act({ type:'newMeld', cardIds: ids, choice: opts[0] && opts[0].sig });
      if (!r.ok) { UI.shake = '#newBtn'; render(); }
      break;
    }
    case 'pickWild': {
      const M = UI.modal; const o = M.opts[+el.dataset.i]; UI.modal = null;
      const r = act({ type:'newMeld', cardIds: M.ids, choice: o.sig });
      if (!r.ok) { UI.shake = '#newBtn'; render(); }
      break;
    }
    case 'discard': act({ type:'discard', cardId:[...UI.sel][0] }); break;
    case 'openMeld': UI.modal = { type:'meld', meldId: el.dataset.meld }; render(); break;
  }
});
app.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.team !== undefined) UI.lobby.teamNames[+t.dataset.team] = t.value || (t.dataset.team==='0'?'Bhujia':'Kachori');
  if (t.dataset.seatname !== undefined) {
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
  if (!el || e.button > 0) return;
  drag = { el, id: el.dataset.id, x: e.clientX, y: e.clientY, active:false };
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
  showInsBar(tgt, e.clientX);
}, { passive:false });

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
    const sp = hasWild(d.ids) ? wildSpot(tgt, e.clientX) : null;
    addToMeld(val, d.ids, sp ? sp.pos : undefined);
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

window.__limpa = { UI, E, render, after, addToMeld, act };
render();
})();
