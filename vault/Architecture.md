# Architecture
Static site, no build step. `index.html`, `css/style.css`, `js/engine.js` (rules + bots), `js/gamelog.js` (game records), `js/bot-worker.js` (computer thinking thread), `js/app.js` (UI), `tools/analyze-games.js` (studies records), `js/net.js` (PeerJS transport), `js/vendor/peerjs.min.js`, `sw.js` (service worker), `manifest.webmanifest`, `icons/`.

## UI (`js/app.js`)
- DOM is rebuilt on every `render()`. Card motion is done by diffing positions: `snapshot()` before, `playFlights()` after (clones fly; hand cards glide via Web Animations `translate`).
- Table is CSS 3D: `.stage` (perspective) and `.plane` (rotateX tilt, adaptive). `metrics()` sizes the hand and dock; `fitMelds()` shrinks melds to fit a mat or grows them into spare room.
- Turn stages: `draw` / `play` / `watch` (`stageOf`). One play step: New meld and Throw are both on screen.
- Views (chips): Your melds / Their melds / Pile / All. Defaults: draw = Pile, play = Your melds, watch = All. `UI.peek` holds an explicit choice and resets when the stage changes.
- No instruction panel. Only exceptions show a line: suggestion (if New player help is on), must-use card, last turn, lost connection, extra-deck reminder.
- Settings live in localStorage `limpa.*`. Hints are off by default (setting "New player help").
- Install: menu button "Add to home screen" (`beforeinstallprompt` or iOS steps).

## Service worker
Network-first. **Bump the `CACHE` name in `sw.js` on every release** (now `limpa-v11`); `index.html` reloads once on update. Stale caches caused "it's still the same" reports before.

## Tests (`test/`)
`engine-smoke.js` (cards conserved, games end), `bot-eval.js` (parallel head-to-head, reports win rate, how games end, pure vs impure meld counts, pile cards taken per side), `bot-tune.js`, `bot-memory.js` (table memory is exact; hand reading never peeks), `pickup-ui.js` (browser: taking the pile, the glowing card, refusals), `bot-thread.js` (browser over http: computers think off the page thread), `records.js` (browser: a whole game is recorded, no names, and replays exactly), `online-rooms.js` (two real browsers over the PeerJS broker, 28 checks).

## Computer thinking
`scheduleBot()` asks `Brain.think()`: over http(s) a Web Worker (`js/bot-worker.js`, imports engine.js) computes the move with `expertMs = BOT_THINK_MS` (1500); the move is played after the usual pause or the think, whichever is later. `UI.botJob` tracks a pending move; `stopBot()` cancels it (quit, seat changes). From `file://` (tests) or if the worker fails, it thinks on the page thread with the engine default (300 ms). `fitMelds()` sizes meld cards with a binary search (about 9 layout passes, was up to 50). `test/bot-thread.js` serves the site over http and checks the page never blocks more than 250 ms while four Experts play.

## Engine performance
`clone()` is a structural copy that shares card objects and meld card lists (never edited in place; `claimDeck` makes new card objects). `apply()` snapshots only right before a meld (the only moves that can be refused after changing the state). Checked move-for-move identical to the old JSON copy on 84 seeded games; about 4x faster. **Never edit a card object or a meld's `slots`/`cards` array in place**, replace them.
