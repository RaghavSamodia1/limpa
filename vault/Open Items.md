# Open items
0. **Game records collection point**: Raghav to create the Google Form (steps in [[Game Records]]) and send the pre-filled link; then set `ENDPOINT` in `js/gamelog.js`. Until then records stay on each phone (menu > Send games).
1. **3-player mode** (tester request). Needs rules decisions (teams? solo scoring?), engine changes and UI. Not started. Ask Raghav for the rules first.
2. Confirm what "logo ke cards" meant (avatars vs court-card art).
3. Computers: teams that never claim the extra deck. Partly addressed by the Expert's deck-claim drive (+2.5% on its own); Smart/Easy still lack it.
4. Online join slowness on a real phone: unverified TURN server; consider a configurable/verified relay.
5. Meld cards still re-place instantly when a meld is added (only the hand glides).
6. Under-hand empty strip on Raghav's phone: reduced, not reproduced; verify on device.
7. Portrait vs landscape; screen-reader support for the table.
8. Refresh the Claude artifact preview (very old build).
9. Done: Expert thinks in a Web Worker (1.5 s). A longer think (or using it for pickup decisions) could be tested again.
10. Hidden-information hygiene for online play: card ids name the card (fixed at deal time). Redaction now drops a bot's plan and other players' last drawn card id; a full audit of what guests receive is still worth doing.
