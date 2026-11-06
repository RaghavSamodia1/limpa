# UX decisions and why
| Decision | Why |
|---|---|
| 3D tilted table (now gentle, 14°), one light theme | Started from Raghav's reference screenshot; redesigned 5 Nov 2026 to be modern and less casino, one theme only ([[Design System]]) |
| Player avatars removed from the table, names only | Tester: logos in the way, and a 3-player version is planned |
| Staged 3-step turns were **dropped** | Testers: too many steps, and Throw jumped to the pile then needed a second tap. Now one play step |
| Default view per stage (Pile / Your melds / All) | The whole table at once shrank everything ("worse, everything smaller") |
| Centre stack count visible | Tester asked for it, despite the earlier "remove all numbers" request |
| No instruction panel | Raghav: remove it, reduce text |
| Suggestions off unless "New player help" | Tester: remove suggestions unless someone is new |
| Wildcards auto-placed | Raghav: stop asking where to put the Joker |
| Extra-deck reminder shown until an extra-deck card is melded | Players forgot to use it |
| Idle button row shows "X is thinking…" | Wasted space complaint |
| Hand cards glide (FLIP), no whole-table fade | "Animation not smooth, cards snapping" |
| Card flights start on the next frame and ease in from rest (.3,.2,.2,1, 400 ms) | "Card played to the middle is very choppy" (jump then creep) |
| Install button + PWA | Raghav wants it on the home screen |

## Principles from Raghav
Big, simple, older-player friendly. Minimal text. Use the space. Don't regress size: check screenshots at 390x844 and 393x852 before claiming a layout is better.

## Open design questions
Portrait vs landscape; screen-reader description of the 3D table; 3-player mode (see [[Open Items]]).
| Wildcards always auto-place, even when dragged (drop spot ignored) | Raghav: "cards should auto place, I shouldn't tell where in the meld it goes"; a drag to a slightly wrong spot was refused (2♥ onto 5♥4♥3♥★A♥) |
| Meld cards between 32 and 80 px (28 px in All) | Raghav: cards started too big (one meld ballooned to ~150 px and overflowed) then got too small |
