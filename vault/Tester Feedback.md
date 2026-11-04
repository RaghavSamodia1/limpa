# Tester feedback (Bholi Kumari, WhatsApp, 1-2 Nov 2026)
| # | Feedback | Status |
|---|---|---|
| 3 | Remove the logo cards (3-player version coming) | Done: avatars replaced by name labels. **Interpretation unconfirmed.** |
| 4 | Buzzer to ring a slow player | Done (PR 8) |
| 5 | Centre stack count | Done |
| 6 | See both parties when throwing | Done: "All" chip. Default in play is Your melds (bigger) |
| - | "Too many steps", liked the previous layout | Done: single play step |
| 7 | Room code just numbers | Done: 6 digits |
| 8 | Options: your melds / theirs / pile, team names, see entire field | Done: chips Your melds / Their melds / Pile / All |
| - | Remove suggestions unless new player | Done |
| - | Funny default names (Chunnu, Munnu, Tunnu) | Done |
| 9 | Throw jumps to pile and needs reselecting | Done |
| - | 3-player version | **Not started** |
Raghav, 4 Nov 2026: "I should be able to use the top card from the pile with a card in my hand, this error is wrong" (screenshot: hand 7♠ 6♠ 4♠ + Joker from the pile, toast "First use the top card from the discard pile"). Cause: tapping the glowing card deselected it, so the meld went in without it. Fixed: it stays selected and is always included; refusals explain the empty-hand rule and light up a legal move. Note that in that exact position melding all four, or three (leaving one card), is still refused by the rules: Bhujia had no pure meld, so the hand can't be emptied. The Joker could go onto an existing meld.
Raghav, 4 Nov 2026: Expert should play as a team, remember pile pickups and passes, read likely hands, and stop opponents completing melds. See [[Computer Players]].
Other reports: "joining a room takes too much time" (fixed by progress and retries, root cause unknown), "expert computer stalls for impure melds" (PR 11), "everything smaller" (reverted to per-stage views).
