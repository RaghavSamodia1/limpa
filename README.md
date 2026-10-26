# Limpa's Breakfast

A team card game for four players (2v2) — Bhujia vs Kachori. This repo is the playable prototype, now with a
**3D table UI**: a tilted wooden table in real perspective, the other players' hands fanned face-down on it,
your own hand fanned at the bottom, and cards that fly between the piles, hands and melds.

![Table](docs/screenshots/table.png)

## Play it

Open `index.html` in a browser (it is built for a portrait phone; on a desktop it shows as a phone-width column).
For a phone on the same network: `python3 -m http.server 8000` and open `http://<your-computer>:8000`.

Pass-and-play on one phone plus computer players, exactly as in the 2D prototype. Online rooms are not wired up yet.

## What is in here

| Path | What it is |
|---|---|
| `index.html` | Page shell (and the SVG art for the court cards) |
| `css/style.css` | The 3D scene, card faces, hand fan, buttons and screens |
| `js/app.js` | UI: rendering, drag and drop, timers, computer-player turns, card-flight animations |
| `js/engine.js` | The rules engine. **Unchanged** from the 2D prototype, byte for byte |
| `docs/RULES.md` | The rules the engine enforces (v2.0, 2v2) |
| `legacy/limpa-2d-prototype.html` | The original single-file 2D prototype, for reference |
| `test/engine-smoke.js` | `node test/engine-smoke.js` plays 200 computer-only games and checks cards are conserved |

## How the 3D works

It is CSS 3D, not WebGL, so it stays one small static page that runs on any phone and keeps the prototype's
drag-and-drop and accessibility.

- `.stage` sets the perspective. `.plane` is the table top, tipped back with `rotateX`. Everything lying on the
  table — the piles, both teams' melds, the extra decks, the other players' hands — is a child of the plane, so it
  foreshortens with the table.
- Your hand, the avatars and the buttons are flat layers on top. The hand is a fan whose angles come from a common pivot.
- `metrics()` in `js/app.js` works out the hand rows and how deep the plane must be so its far edge lands under the avatars
  after perspective. **`TILT` and `PERSP`** at the top of that file control how dramatic the table looks.
- The DOM is rebuilt on every render, so card moves are animated by diffing card positions (`playFlights()`): a flat clone
  flies from where the card was, from the stack, or from the player who played it.
- The other players' hands are a fixed-size decorative fan, so hand counts stay hidden as the rules require.

## Open questions

- **Orientation.** `docs/RULES.md` says the game is played with the phone held sideways, but the prototype and the
  reference image are portrait, so this UI is portrait (landscape shows the "turn upright" screen, as before).
- **Court cards** use a simple crowned-letter face, not illustrated figures.
- Rules section 13 ("Not yet decided") is untouched.
