# Architecture
Static site, no build step. `index.html`, `css/style.css`, `js/engine.js` (rules + bots), `js/app.js` (UI), `js/net.js` (PeerJS transport), `js/vendor/peerjs.min.js`, `sw.js` (service worker), `manifest.webmanifest`, `icons/`.

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
`engine-smoke.js` (cards conserved, games end), `bot-eval.js` (parallel head-to-head, reports win rate, how games end, pure vs impure meld counts), `bot-tune.js`, `online-rooms.js` (two real browsers over the PeerJS broker, 28 checks).
