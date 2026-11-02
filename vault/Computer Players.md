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

## How to evaluate
`node test/bot-eval.js 1600 smart smart '<newParamsJson>' '<oldParamsJson>'` (about 90 s). Expert games are slow (about 4 s per decision budget), use few games.
