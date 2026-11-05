# Design system: "Morning" (one theme)

Raghav, 5 Nov 2026: "redesign the UI, more modern, less casino; only one theme; hold yourself in the highest regard."

## Direction
A calm, warm, modern tabletop for a breakfast-named family game. **Removed casino cues:** green felt, wooden rim and planks, spotlight gradients, gold/yellow glows and pulsing rings, glossy candy buttons with thick bottom edges, 3D extruded logo, emoji everywhere, red patterned card backs with a coin logo, three colour themes.
**Kept:** the table metaphor (now a flat, light surface with a gentle tilt), big readable cards, one action row, the hand fan.

## Audience rules (older players)
- Body text at least 16 px; key text (scores, buttons, card indices) 15 to 22 px bold.
- Contrast: main text 15:1, secondary text about 7:1 (`--ink-2` on paper 6.9). White text never sits on the orange accent (3.3:1). Cards get a hairline border and a soft shadow, because white on the table is only 1.3:1.
- Touch targets: main buttons at least 48 px tall; icon buttons 44 px.
- State is never colour alone: selected cards lift **and** get a ring; switches move **and** change colour; the current player's name pill turns dark.
- Motion is short (120 to 340 ms), ease-out, and off with reduced motion.

## Tokens (`css/style.css :root`)
| Token | Value | Use |
|---|---|---|
| `--paper` | #F6F2EA | app background, dock sheet |
| `--table` / `--table-2` | #EAE2D3 / #E3D9C7 | table surface |
| `--surface` | #FFFFFF | cards, chips, sheets |
| `--ink` / `--ink-2` / `--ink-3` | #211A15 / #5B5148 / #857A6F | text; ink-3 only for non-essential hints |
| `--line` / `--line-2` | #E0D7C8 / #CFC3B1 | hairlines, outlines |
| `--accent` | #D9731C | selection rings, the glowing top card, focus, timer |
| `--good` / `--bad` / `--wild` | #2B7448 / #B3261E / #6447BF | valid meld, errors, wildcards |
| `--t0` / `--t1` | #B4570F / #1C6B66 | teams (Bhujia saffron, Kachori teal); soft tints for mats and chips |
| `--back` | #2C231C | card backs (espresso), cream monogram |
| radii | 8 / 12 / 16 / 24 | chips / buttons / panels / sheets |
| elevation | `--e1` `--e2` `--e3` | hairline lift / floating / sheets |

## Type
- **Figtree** for everything (400 / 500 / 700 / 800): large x-height, open shapes, plain numerals. Atkinson Hyperlegible was tried first and dropped: its slashed zero made scores read "Bhujia Ø" and tens "1Ø".
- **Fraunces** (soft serif) for the wordmark, headings like "New game" / the winner line, the court-card letters and the "L" on card backs.

## Components
- **Buttons:** primary = ink with white text (Draw card, Throw, Play); secondary = white with outline (Take pile, New meld, Return, Help); positive = green (Place ✓ when the meld is valid, resume a room); danger = solid red for End game, outlined red text for Quit / Leave / Close room. Disabled = paper with readable grey text (#6F655B), no shadow.
- **Cards:** white, hairline border, soft shadow. Corner index (rank over suit) in the left strip, big suit bottom right. Aces show one large suit. Courts show a framed serif letter. Jokers are violet with a star. Wildcards in melds carry a violet `=7` tag; extra-deck cards an orange dot.
- **Card back:** espresso with fine diagonal lines, an inner cream frame and an italic serif "L".
- **Table:** flat warm surface with a gentle tilt (14°, flattening to 6° when crowded). Team mats are softly tinted with a solid team label.
- **Top bar:** round icon buttons, white score chips with a team dot (your team tinted).
- **Seat names:** white pills with a team dot; dark pill for whoever's turn it is.
- **Dock:** paper sheet with a hairline top; view switcher as a segmented control.
- **Settings:** list rows with real switches (label left, switch right). Toasts: dark snackbars (red for errors, green for good news).
- **App icon:** saffron square, the espresso card back behind a white ace of spades (`icons/`, rendered from an HTML source with Playwright).
- **Layout details:** the three name pills sit in one row under the top bar; the other players' face-down fans are kept in place but not drawn (cards still fly from that side); score chips are two lines (team name over score) so 3-digit scores never truncate; the All view tightens mats, piles and extra decks so an iPhone SE fits every meld.
- **Card shape:** every card is 1 : 1.4 (hand cards 1 : 1.42). `--mh` is computed once on `:root`, so any rule that changes `--mw` must also set `--mh:calc(var(--mw)*1.4)`; forgetting it stretched the piles to 1 : 2.1 in the single-mat views (fixed, guarded by `test/layout.js`).
- **Icons:** one hand-drawn stroke set in `index.html` (`#i-…` symbols), used through `<svg class="ic"><use href="#i-…"/></svg>`.
