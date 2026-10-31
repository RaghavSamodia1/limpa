// Two-phone test of online rooms against the real PeerJS broker (needs internet and Playwright):
// create a room, join by link, start, check privacy, play turns on both phones, disconnect, rejoin,
// computer takeover, host reload and resume. Run with: node test/online-rooms.js
const { chromium } = require('playwright');
const path = require('path');
const out = process.env.SHOTS ? process.env.SHOTS + '/' : require('os').tmpdir() + '/';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const mk = async (name) => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 }); const pg = await ctx.newPage(); pg.__name = name; pg.errs = [];
    pg.on('pageerror', (e) => { pg.errs.push(e.message); console.log('  [' + name + ' pageerror]', e.message); }); return { ctx, pg }; };
  const H = await mk('host'), G = await mk('guest'); let host = H.pg, guest = G.pg;
  const st = (p) => p.evaluate(() => { const L = window.__limpa, U = L.UI; return { screen: U.screen, net: U.net && { role: U.net.role, status: U.net.status, seat: U.net.mySeat, code: U.net.code }, turn: U.G && U.G.turn, turnNo: U.G && U.G.turnNo, phase: U.G && U.G.phase, over: U.G && U.G.phase === 'over' }; });
  const until = async (p, fn, arg, ms = 30000) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };

  // ---- create room
  await host.goto(URL); await host.evaluate(() => localStorage.setItem('limpa.name', 'Hosty'));
  await host.reload(); await host.click('[data-act=createRoom]');
  ok(await until(host, () => window.__limpa.UI.net && window.__limpa.UI.net.status === 'ready'), 'host: room opens on the broker');
  const code = (await st(host)).net.code; console.log('  room', code);
  await host.screenshot({ path: out + 'room_host0.png' });
  // ---- join by link
  await guest.goto(URL + '#room=' + code); await guest.evaluate(() => localStorage.setItem('limpa.name', 'Guesty')); await guest.evaluate(() => { document.getElementById('nameIn').value = 'Guesty'; });
  ok((await st(guest)).screen === 'join' && (await guest.inputValue('#gidIn')) === code, 'guest: invite link opens the join screen with the code filled in');
  await guest.click('[data-act=doJoin]');
  ok(await until(guest, () => window.__limpa.UI.net && window.__limpa.UI.net.status === 'connected' && window.__limpa.UI.lobby), 'guest: joins the room');
  ok(await until(host, () => window.__limpa.UI.lobby.seats[2].joined && window.__limpa.UI.lobby.seats[2].name === 'Guesty', null, 10000), 'host: sees the guest in seat 3 with their name');
  await sleep(300); await host.screenshot({ path: out + 'room_host1.png' }); await guest.screenshot({ path: out + 'room_guest1.png' });
  ok((await guest.textContent('.screen')).includes('Waiting for the host'), 'guest: sees the waiting screen');
  // ---- start
  await host.click('[data-act=startRoom]');
  ok(await until(guest, () => window.__limpa.UI.screen === 'game' && window.__limpa.UI.G), 'guest: game starts on the guest phone');
  const priv = await guest.evaluate(() => { const U = window.__limpa.UI; const o = U.G.seats.map((s, i) => ({ i, real: s.hand.filter((c) => c.s !== '?').length, n: s.hand.length })); return { o, stackReal: U.G.stack.filter((c) => c.s !== '?').length, deckReal: U.G.teams.reduce((a, t) => a + t.deck.filter((c) => c.s !== '?').length, 0) }; });
  console.log('  guest view:', JSON.stringify(priv));
  ok(priv.o[2].real === 13 && priv.o[0].real === 0 && priv.o[1].real === 0 && priv.o[3].real === 0 && priv.stackReal === 0 && priv.deckReal === 0, "privacy: guest holds only their own 13 cards (others' hands, the stack and the extra decks are blank)");
  const hostSees = await host.evaluate(() => window.__limpa.UI.G.seats.map((s) => s.hand.length));
  ok(JSON.stringify(hostSees.slice(0, 1)) === '[13]' || hostSees[0] >= 13, 'host: has the real game');

  // ---- play human turns on both sides
  const sync = async () => { await sleep(900); const a = await st(host), c = await st(guest); return a.turnNo === c.turnNo && a.phase === c.phase && a.turn === c.turn; };
  let hostTurns = 0, guestTurns = 0;
  for (let i = 0; i < 120 && (hostTurns < 3 || guestTurns < 3); i++) {
    const s = await st(host);
    if (s.over) break;
    const who = s.turn === 0 ? host : s.turn === 2 ? guest : null;
    if (!who) { await sleep(500); continue; }
    if (s.phase === 'draw') { await who.dispatchEvent('[data-act=draw]', 'click'); await sleep(700); continue; }
    // try to meld something obvious via the engine's own suggestion, else throw
    const id = await who.evaluate(() => { const U = window.__limpa.UI, E = window.__limpa.E; const g = U.G; return g.seats[g.turn === U.viewer ? U.viewer : 0].hand[0].id; });
    await who.dispatchEvent(`.hc[data-id="${id}"]`, 'click'); await who.dispatchEvent('[data-act=discard]', 'click');
    s.turn === 0 ? hostTurns++ : guestTurns++;
    await sleep(700);
  }
  ok(hostTurns >= 3 && guestTurns >= 3, `both humans played turns over the network (host ${hostTurns}, guest ${guestTurns})`);
  ok(await sync(), 'both phones agree on whose turn it is and the phase');
  await host.screenshot({ path: out + 'online_host_game.png' }); await guest.screenshot({ path: out + 'online_guest_game.png' });

  // ---- cheating: guest acts out of turn / as another seat over the wire
  await until(host, () => window.__limpa.UI.G.turn !== 2, null, 20000);
  
  await host.evaluate(() => { const U = window.__limpa.UI; clearTimeout(U.botTimer); U.botTimer = 1; });   // freeze the computers so the turn cannot move on
  await sleep(300);
  await guest.evaluate(() => { window.__limpa.UI.toasts = []; window.__limpa.UI.net.tr.send({ t: 'act', action: { type: 'discard', cardId: 'not-a-card' } }); });
  await sleep(800);
  const rej = await guest.evaluate(() => window.__limpa.UI.toasts.map((t) => t.text).join('|'));
  ok(rej.length > 0, 'host rejects an illegal move sent over the wire (' + rej + ')');

  await host.evaluate(() => { const U = window.__limpa.UI; U.botTimer = null; if (window.__limpa.UI.G.seats[window.__limpa.UI.G.turn].bot) window.__limpa.after({ ok: true, events: [] }, 3, -1, 'sync'); });
  // ---- disconnect and rejoin
  const before = await st(host);
  await guest.close();
  ok(await until(host, () => window.__limpa.UI.G.seats[2].away, null, 40000), 'host: notices the guest left and marks the seat away');
  const g2 = await G.ctx.newPage(); guest = g2; g2.errs = []; g2.on('pageerror', (e) => console.log('  [guest2 pageerror]', e.message));
  await g2.goto(URL);
  ok((await g2.textContent('.menu-col')).includes('Rejoin room ' + code), 'guest: menu offers "Rejoin room"');
  await g2.click('[data-act=rejoin]');
  ok(await until(g2, () => window.__limpa.UI.screen === 'game' && window.__limpa.UI.G && window.__limpa.UI.net.status === 'connected'), 'guest: rejoins the same seat with the game state');
  ok(await until(host, () => !window.__limpa.UI.G.seats[2].away, null, 10000), 'host: away flag cleared');
  ok((await g2.evaluate(() => window.__limpa.UI.G.seats[2].hand.filter((c) => c.s !== '?').length)) >= 13, 'guest: got their own hand back');

  // ---- takeover after away timeout
  await host.evaluate(() => { window.__limpa.NETCFG.awayMs = 4000; });
  await g2.close();
  ok(await until(host, () => window.__limpa.UI.G.seats[2].takenOver && window.__limpa.UI.G.seats[2].bot, null, 60000), 'host: computer takes over the away seat after the timeout');
  const g3 = await G.ctx.newPage(); guest = g3; g3.on('pageerror', (e) => console.log('  [guest3 pageerror]', e.message));
  await g3.goto(URL); await g3.click('[data-act=rejoin]');
  ok(await until(g3, () => window.__limpa.UI.screen === 'game' && window.__limpa.UI.net.status === 'connected'), 'guest: returns after the takeover');
  ok(await until(host, () => !window.__limpa.UI.G.seats[2].bot && !window.__limpa.UI.G.seats[2].takenOver, null, 10000), 'host: seat handed back to the human');

  // ---- host reloads mid-game and resumes
  const preNo = (await st(host)).turnNo;
  await host.reload();
  ok((await host.textContent('.menu-col')).includes('Resume your room ' + code), 'host: menu offers "Resume your room" after a reload');
  await host.click('[data-act=resumeHost]');
  ok(await until(host, () => window.__limpa.UI.net && window.__limpa.UI.net.status === 'ready' && window.__limpa.UI.G, null, 40000), 'host: room reopens with the saved game');
  ok((await st(host)).turnNo >= preNo, 'host: game state restored (turn ' + (await st(host)).turnNo + ')');
  ok(await until(g3, () => window.__limpa.UI.net.status === 'connected' && window.__limpa.UI.G, null, 60000), 'guest: reconnects automatically to the resumed room');
  ok(await until(host, () => !window.__limpa.UI.G.seats[2].away, null, 60000), 'host: guest is back after the resume');
  await sleep(1500);
  const fin = [await st(host), await st(g3)];
  ok(fin[0].turnNo === fin[1].turnNo, 'both phones in sync after the resume (turn ' + fin[0].turnNo + ')');
  await g3.screenshot({ path: out + 'online_guest_after.png' });

  // ---- leave on purpose
  await g3.evaluate(() => window.__limpa.UI.screen && document.querySelector('[data-act=menu]').click()); await g3.click('[data-act=quit]');
  ok(await until(host, () => window.__limpa.UI.G.seats[2].bot && window.__limpa.UI.G.seats[2].takenOver, null, 15000), 'host: guest leaving hands their seat to the computer');
  const errs = [host, g3].flatMap((p) => p.errs || []);
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  await b.close();
})().catch((e) => { console.error('TEST CRASH', e); process.exit(1); });
