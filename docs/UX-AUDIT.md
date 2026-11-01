# Usability audit

A walk-through of the game as a first-time, older player on a phone, scored against the usual usability heuristics.
Status: **fixed** in this release, **kept** on purpose, or **open** for later.

| # | Heuristic | Finding | Status |
|---|---|---|---|
| 1 | Minimalist design | Everything was on screen at once (both teams' melds, piles, deck labels, counts, hint bars). | **Fixed.** A turn is three steps and each shows only what matters; *Your melds / Their melds / Piles* look at the rest. Counts, meld progress badges and extra labels are gone. |
| 2 | Minimalist design | Chunky controls: thick 3D buttons, bordered guide card, big top bar. | **Fixed.** Slimmer, flatter buttons of equal width; the guide is a quiet two-line caption; smaller top bar, avatars and chips. |
| 3 | Consistency | The two teams' mats were different widths and the piles jumped around between views. | **Fixed.** Both mats share one shape and position; a lone mat always takes the lower slot. |
| 4 | Consistency | Button positions changed between steps (Help moved around). | **Fixed.** Help is always on the left and the main action on the right, on every step. |
| 5 | Error prevention | The game asked "where should the Joker go?" whenever a placement was ambiguous. | **Fixed.** Wildcards are placed automatically (the same spot the rules would move them to). Dragging a wildcard to an exact spot still works for anyone who wants control. |
| 6 | Error prevention | Invalid actions were possible and then refused. | **Kept/improved.** Buttons are disabled until the action is valid; the pile's top card is pre-selected after a pickup; invalid drops shake with a reason. |
| 7 | Visibility of status | Unclear what to do next. | **Fixed.** "Step 2 of 3" with one plain instruction, a 💡 suggestion with the cards highlighted, a timer ring, whose turn it is, and connection status online. |
| 8 | Flexibility and efficiency | Dragging was the only way to add cards to a meld. | **Fixed.** Tap cards then *Place*; select cards and tap a meld; tap a card and *Throw*. Dragging still works. |
| 9 | Recognition over recall | Rules had to be remembered. | **Fixed.** The guide, suggestions and the *?* page; the hand sorts itself. |
| 10 | Aesthetic and smooth | Steps snapped abruptly. | **Fixed.** Mats and piles cross-fade between steps; cards fly between places. |
| 11 | User control | No undo. | **Kept.** The rules forbid undo (teammates read each other's play). A throw needs an explicit *Throw* tap on a named card. |
| 12 | Accessibility | Small text, tiny targets, zoom blocked, timer pressure. | **Fixed.** Larger type and targets, pinch-zoom allowed, optional no-timer mode (solo), slow computer players, high-contrast themes. |
| 13 | Help and documentation | No in-game explanation. | **Kept.** *How to play* in the menu; the guide covers each step. |
| 14 | Wildcard impurity confirmation | Adding a wildcard to a completed pure meld asks for confirmation. | **Kept.** The rules require it because it costs 100 points. |
| 15 | Orientation | Rules say landscape; the UI is portrait. | **Open.** Needs a decision. |
| 16 | Screen readers | Cards have labels, but the 3D table is not described. | **Open.** |
