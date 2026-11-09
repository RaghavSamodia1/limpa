// Browser test (needs Playwright): served over HTTP, computer players think in a background thread, so the page never
// freezes while an Expert thinks, and the game still plays out normally. Run with: node test/bot-thread.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
server.listen(0, '127.0.0.1', async () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' })).newPage();
  const errs = [], reqs = [];
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('request', (r) => reqs.push(r.url()));
  await pg.goto(url); await pg.waitForTimeout(400);
  // the longest stretch the page's own thread was busy, from the browser's long-task timing
  await pg.evaluate(() => { window.__long = 0; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__long = Math.max(window.__long, e.duration); })).observe({ type: 'longtask', buffered: true }); } catch (e) { window.__long = -1; } });
  await pg.evaluate(() => {
    const L = window.__limpa, UI = L.UI, E = L.E;
    UI.lobby = { gameId: '1', teamNames: ['Bhujia', 'Kachori'], seats: [0, 1, 2, 3].map((i) => ({ name: ['Chunnu', 'Munnu', 'Tunnu', 'Pappu'][i], avatar: '🍳', bot: true, level: 'expert' })) };
    UI.G = E.createGame({ gameId: '1', teamNames: UI.lobby.teamNames, seats: UI.lobby.seats });
    Object.assign(UI, { screen: 'game', viewer: 0, spinning: false, dealing: false, modal: null, order: {} });
    L.render(); L.scheduleBot();
  });
  const t0 = Date.now();
  await pg.waitForFunction(() => { const G = window.__limpa.UI.G; return G && (G.turnNo >= 14 || G.phase === 'over'); }, null, { timeout: 120000 }).catch(() => {});
  const st = await pg.evaluate(() => ({ turn: window.__limpa.UI.G.turnNo, phase: window.__limpa.UI.G.phase, long: window.__long }));
  ok(reqs.some((u) => /bot-worker\.js/.test(u)), 'the background thinking thread was loaded');
  const threads = await pg.evaluate(() => window.__limpa.Brain.threads());
  ok(threads >= 1, `computer players think on ${threads} background thread(s)`);
  ok(st.turn >= 14 || st.phase === 'over', `four Expert computers played on (${st.turn} turns in ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  ok(st.long >= 0 && st.long < 250, `the page never froze while they thought (longest busy stretch ${Math.round(st.long)} ms)`);
  ok(!errs.length, 'no page errors ' + (errs.length ? errs.join(' | ') : ''));
  await b.close(); server.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
});
