# Computer players (`js/engine.js`)
Levels: **easy** (original), **smart** (heuristic, params in `CFG.smart`, per-seat override `seat.params`), **expert** = smart + simulation lookahead (`rollMs`, `determinize`, `playOut`, `rolloutDiscard`).

## History and lessons
- Early tuning was invalid because `createGame` ignored seat `params`; fixed, experiments redone.
- A learned value function played worse than heuristics and was removed.
- No 777/888 sets (except edge ranks or late game): `setMode`.
- Worker scripts must end with `process.exit(0)` after writing results, or they fall into the master code (fork bomb once).

## The "plays for impure and waits for the stack to end" problem (Nov 2026)
Measured: smart/expert completed about 4 impure vs 1 pure meld per game; in stack-ended games 51 of 106 team-ends lacked a pure meld, 30 had an unclaimed or forfeited deck; hands were nearly empty (about 2 cards). Fix (PR 11):
- `pureFirst`: until the team has a completed pure meld, no wildcard into pure runs, no new wildcard melds (until the game is nearly over).
- `findGoOut`: depth-first search for a meld sequence that empties a small hand.
- Heavier run-building keep weights (`adjW 26, gapW 15, outsW 9`).
- Result: 54% decisive win rate vs old smart (2000 games), going-out share about 51% to about 65% for the new side. Expert level with old Expert (160 games).
- Still open: teams that never claim their extra deck (see [[Open Items]]).

## Team-aware Expert (Nov 2026, Raghav: "team player, remembers who picked what, gauges likely hands")
- **Public memory** (`state.mem`, updated in `apply`): `known` = cards seen going into a hand with the face-up pile (dropped when melded/thrown), `passed` = top cards a player declined, `threw`, `took`, `lastPlay` (turn of each player's latest meld step). Melds carry `lt` (turn last changed). Only public information; `test/bot-memory.js` proves memory is exact and that hand reading never depends on hidden cards.
- **Hand reading** `beliefs(state, seat)`: for each other player, P(holds a card type). Known pickups are certain; hidden cards share out by hand size, lowered for cards their play argues against: would have added it to their team's meld after a turn (x0.15), passed top card's neighbours (x0.75), thrown card's neighbours (x0.55), signals older than 16 turns ignored. Weights fitted on self-play: Brier 0.0694 (no memory) -> 0.054.
- **Throws** (`useChance`): chance the next player (always an opponent) can use the card to take the whole pile (fits their melds, or two of their likely cards make a meld with it), weighted by pile size, plus a penalty for finishing one of their 6-card melds. Weights `dangerUse 45, dangerPile .4, dangerDone 30`.
- **Partner**: outs = copies not likely in an opponent's hand, plus cards the partner is known to hold (they can add them to team melds). Same for "wait for the natural card" decisions.
- **Deck claim drive** (`findGoOut(...,'claim')`): while the extra deck is unclaimed, search for melds that empty the hand (never spoiling a pure meld).
- Enabled for Expert by default (`team`, `claim` flags); Smart and Easy unchanged.
- Results, smart heuristic with the flags vs without (2400 games): team+claim 55.1% decisive, +51 a game; team alone 52.8%; claim alone 52.5%. Throw caution tuned on 3200-game runs (flat optimum; less caution, `dangerUse 15`, loses 45%).
- **New Expert vs today's Expert** (stand-in: same engine, no memory/team play, 2 imagined deals per throw), 480 games: **59.3% decisive, +79 a game.** New Expert vs Smart-with-team-play (160 games): 54%.
- The old lookahead got only 1-2 imagined deals per throw in 300 ms (noise). Engine copies are now 4x faster, so 300 ms buys about 6-7 deals per throw on a fast machine.
- Tried and dropped (no measurable gain): pickup-vs-draw lookahead (changes how often it takes the pile, same win rate), only overruling the plain choice on clear evidence, more weight on score margin in the lookahead, a "race" mode when opponents are about to go out (49-50%).

## How to evaluate
`node test/bot-eval.js 1600 smart smart '<newParamsJson>' '<oldParamsJson>'` (about 90 s). Expert games are slow (about 4 s per decision budget), use few games.
