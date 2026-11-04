# Game rules that matter for code
Full rules: `docs/RULES.md` (wins over any older PRD).
- 4 players, 2 teams. Hand 13. Centre stack 33. Each team has an **extra deck** to claim by emptying the hand.
- Meld = 3+ cards. Run (sequence of one suit) or set (same rank, max 3 sets per team). 7+ cards = completed.
- Wildcards: Jokers and 2s. A meld with a wildcard is **impure**.
- Scoring at end of each turn: pure completed meld 200, impure 100, Timpa (13 natural cards) 500, going out +100, unclaimed deck -100.
- **Going out** needs: deck claimed, an extra-deck card melded, 2+ completed melds, **at least one pure**, then empty the hand. This is why bots that spam impure melds could not finish, see [[Computer Players]].
- Game ends on going out, or after the final turn once the stack is empty.
- After taking the pile, the glowing top card **cannot be deselected** and is added to any meld you make (New meld, tapping a meld, dragging). Refusals while it is pending say what works (e.g. add it to a meld, or Return) and light up a legal move. The green Place tick shows only for melds the rules will accept (the empty-hand rule included).
- Wildcard placement is automatic in the UI (the old "where does the Joker go" picker was removed). Making a completed pure meld impure still asks for confirmation.
