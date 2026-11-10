# Computer players (`js/engine.js`)
Levels: **easy** (original), **smart** (heuristic, params in `CFG.smart`, per-seat override `seat.params`), **expert** = smart + search: whole-turn plans and pile-or-draw played to the end of the game on imagined deals (`planTurn`, `searchDraw`, `determinize`, `playOut`; see Planning Expert below).

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
- **Own memory per player** (`state.minds[seat]`, updated in `apply` via `witness`, copy-on-write so state copies share it; Raghav asked that each computer have its own memory). A computer reads only its own mind; phones in online games receive only their own. Contents: `known` = cards seen going into a hand with the face-up pile (dropped when melded/thrown), `passed` = top cards a player declined, `threw`, `took`, `lastPlay` (turn of each player's latest meld step). Melds carry `lt` (turn last changed). Only public information; `test/bot-memory.js` proves memory is exact and that hand reading never depends on hidden cards.
- **Hand reading** `beliefs(state, seat)`: for each other player, P(holds a card type). Known pickups are certain; hidden cards share out by hand size, lowered for cards their play argues against: would have added it to their team's meld after a turn (x0.15), passed top card's neighbours (x0.75), thrown card's neighbours (x0.55), signals older than 16 turns ignored. Weights fitted on self-play: Brier 0.0694 (no memory) -> 0.054.
- **Throws** (`useChance`): chance the next player (always an opponent) can use the card to take the whole pile (fits their melds, or two of their likely cards make a meld with it), weighted by pile size, plus a penalty for finishing one of their 6-card melds. Weights `dangerUse 45, dangerPile .4, dangerDone 30`.
- **Partner**: outs = copies not likely in an opponent's hand, plus cards the partner is known to hold (they can add them to team melds). Same for "wait for the natural card" decisions.
- **Deck claim drive** (`findGoOut(...,'claim')`): while the extra deck is unclaimed, search for melds that empty the hand (never spoiling a pure meld).
- Enabled for Expert by default (`team`, `claim` flags); Smart and Easy unchanged.
- Results, smart heuristic with the flags vs without (2400 games): team+claim 55.1% decisive, +51 a game; team alone 52.8%; claim alone 52.5%. Throw caution tuned on 3200-game runs (flat optimum; less caution, `dangerUse 15`, loses 45%).
- **New Expert vs today's Expert** (stand-in: same engine, no memory/team play, 2 imagined deals per throw), 480 games: **59.3% decisive, +79 a game.** New Expert vs Smart-with-team-play (160 games): 54%.
- The old lookahead got only 1-2 imagined deals per throw in 300 ms (noise). Engine copies are now 4x faster, so 300 ms buys about 6-7 deals per throw on a fast machine.
- **Thinking time** (Raghav: "computer need not be this fast"): 20 imagined deals per throw vs 6 won 58.1% of decisive games (240 games, +53 a game). The Expert now thinks about 1.5 s per throw in a Web Worker (`js/bot-worker.js`, `BOT_THINK_MS` in app.js), so the screen never freezes; opened as a local file it falls back to 0.3 s on the page thread.
- **Counting** (Raghav: track the stack and hand sizes, gauge the effect): already used. Hand sizes set each player's share in the hand estimates, the stack sets urgency, the pile size sets throw caution, and lookahead deals use the exact counts (simulated games end when the real stack would). Four extra count rules were tested vs team+claim on 3200 games and dropped: take the pile when stuck with <=3 cards (50.4%), keep 3 cards while the team can't go out (50.5%), value pure-run cards more (51.1%), rush to claim the deck before the stack runs out (47.8%, and 43.6% when aggressive).
- Measured stuck problem: in about 17% of turns a player sits on <=2 cards unable to go out, 74% of those for lack of a pure meld; 15 in 100 team-games lose the deck when the stack runs out.
- Tried and dropped (no measurable gain): pickup-vs-draw lookahead (changes how often it takes the pile, same win rate), only overruling the plain choice on clear evidence, more weight on score margin in the lookahead, a "race" mode when opponents are about to go out (49-50%).

## Planning Expert (Nov 2026, Raghav: "still dumb... plan strategies like chess bots, not turn by turn")
How chess engines work: search ahead + judge positions, as many positions per second as possible. Cards are hidden, so the Expert uses the card-game version (determinized search, as in strong bridge/skat programs): deal the unseen cards out many plausible ways (weighted by hand reading), play every option to the **end of the game** on the same deals, keep the best.
- **Whole-turn plans** (`turnPlans`, `planTurn`): the Smart line of melds, the same line stopped early (keep melds in hand), the line without wildcard melds, each with its best few throws (`planThrows 4`, `planThrowsAlt 2`). The chosen plan is kept in `state.finishPlan` and played step by step (re-thought if the table changed).
- **Take the pile or draw** (`searchDraw`): both played out (`planDrawMs` = 60% of the plan time).
- **Successive halving** (`searchOptions`): after 4 deals the worse half of the options is dropped, then after 8, 16... so the time goes to close calls.
- **3x faster simulations** (61 -> about 180 games a second on one core): melds keep one object shape (a `delete` had pushed them into V8's slow mode, copies took 31% of the time), card counts in a typed array, `addOne` quick fit check (equal to `checkAdd` on 5.8M cases), cached seat settings, the game log shared between copies.
- **Several cores** (`js/bot-worker.js`, `Brain` in app.js): one thread `prepare`s the options, all threads `runLines` on their own deals, `pickLine` pools the totals (best average among options played at least half as often as the most-played). Up to 4 threads (cores - 1). Think time 1.2 s per plan + 0.7 s for pile-or-draw.
- **Results** (240 games each, same think time per decision, old = previous Expert with the new speed-ups):
  - plans only vs old: 55.8% decisive, +40 a game.
  - plans + pile-or-draw search vs old: 68.7%, +120.
  - shipped settings vs old: **74.2% decisive, +133 a game**. Takes 41 pile cards a game vs 24: the search finds the pickups that pay off (the earlier test of a pickup lookahead had too few deals to see it).
- **Found in Raghav's first recorded games (10 Nov):** the Expert took the pile and put it straight back in 41 of 75 pickups (the pile-or-draw search compared two identical outcomes and noise picked). Fixed: the search only runs when the top card can be used. Re-measured vs the pre-planning Expert: 64.4% decisive, +98 a game (240 games); the three runs so far (68.7, 74.2, 64.4) are within noise of each other, so call it about two in three.
- Smart's simple pile rule was re-tuned and is flat (`pilePayoff 0`: 50.3%, `pickTier 7`: 50.4%, `pickTier 5`: 48.7%, 2400 games each): the gain comes from searching, not from a better rule.
- Tried and left off (`planLoose`): a bold plan line that spends wildcards on melds where the cautious rules wait. 49.5% decisive, -7 a game (320 games): no gain, so the cautious rules already cover it.
- Tried and left off (Raghav, 10 Nov: "gauge what they must be hoarding"), both in `beliefs` behind params:
  - **Hoarding read** (`infHold`): cards that go with what a player took from the pile and still holds (same suit next door, same rank) made more likely. Hand-guess error (Brier) 0.06103 -> 0.06093 on self-play, 0.07241 -> 0.07228 on the people in the 5 recorded games: next to nothing. In play 49.0% (1.5) and 48.7% (2.2) over 3200 games.
  - **Long hold** (`infSit`, uses the new `lastMeld` memory): a big hand and no meld for many turns means wildcards are more likely. No change in accuracy, 49.9% in play.
  - Why: the certain part (the exact cards taken and kept) is already used, and what is left over is weak. Reading one person's habits needs many more recorded games.
  - Measure with the Brier script idea: replay `records/*.txt`, compare `beliefs().has()` with the real hands of the human seats.
- Ideas not done yet: thinking during the human's turn; a learned position value so simulations can stop early (AlphaZero-style); more plan shapes (e.g. holding a wildcard for a later pure meld).

## Wildcards and pure melds (Raghav, 10 Nov 2026)
Raghav: "it places a joker whenever we are making a pure... with six aces down it adds the joker without checking whether the aces are all used. There has to be a very solid reason. And on 5-4-3 of spades plus the 2 of spades it adds another joker: never do that."
- Old rule: a wildcard could always *finish* a 6-card pure meld (and join a long one after the early game).
- New rule (`wildStrict`, in `smartMeldMoves`, so Smart, Expert, the Expert's plans and its simulations all follow it): a wildcard goes into a meld that is still pure only when
  1. the natural cards that could still fit are gone (`wildDead`: fewer than 0.35 expected copies left, counting what is seen and, for the Expert, what opponents likely hold), or
  2. the game is nearly over (`wildLateU .88`, about 4 cards left in the centre), or
  3. it is part of a plan that claims the extra deck or goes out (`findGoOut`, unchanged).
- Also: the pile-or-draw search no longer takes the pile when the only use for the top card would break a pure meld (`pickTier`).
- Results, Smart with team play, 3200 games each: new rule vs old **56.7% decisive, +39 a game** (pure melds 1.3 a game vs 1.2... and more games won by going out). Later cutoff (`.95`): 50.2% vs the new rule (no better). Without the "one pure already banked, slim chance left" exception: 51.8%, so the exception was dropped (`wildSlim 0`).
- `test/wild-rule.js` (runs before every deploy): six aces with aces still unseen: Joker stays in hand; aces dead or stack nearly out: Smart finishes the meld; 5-4-3-2 of spades: no second wildcard.

## How to evaluate
`node test/bot-eval.js 1600 smart smart '<newParamsJson>' '<oldParamsJson>'` (about 90 s). Expert games are slow (about 4 s per decision budget), use few games.
