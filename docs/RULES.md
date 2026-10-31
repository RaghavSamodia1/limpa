# Limpa's Breakfast: Rules (v2.0, 2v2)

These are the rules the game engine enforces. Where they differ from the July 2024 PRD, this file wins.

- **Blocked** means the engine refuses the move and shows a message.
- **Shakes** means the meld or button visibly shakes to show the move was refused.

---

## 1. Overview

- Team card game for 4 players: **two teams of two (2v2)**. Scores are kept per team, and the higher total wins.
- Default team names are **Bhujia** and **Kachori**, editable in the lobby.
- Seats alternate Bhujia → Kachori → Bhujia → Kachori. Play goes **clockwise**.
- Played on a phone held sideways (landscape). Players see only their own hand. Hand counts are not shown.

## 2. Cards and setup

| Item | Count | Detail |
|---|---|---|
| Card pool | 108 | 2 standard decks (2 × 52) + 4 Jokers |
| Player hands | 4 × 13 = 52 | Dealt one card at a time around the table |
| Extra decks | 2 × 11 = 22 | One per team, face down, labelled with the team name |
| Discard pile | 1 | One card turned face up. If it's a wildcard, it stays and can be picked up like any top card. |
| Centre stack | 33 | Face down. The number of cards left is always shown. |

- All team scores start at 0.
- The first player is chosen at random.
- **Hand:** one row that the player can rearrange by dragging. **Sort** orders by suit (♠ ♥ ♦ ♣, then Jokers), highest first, Ace high. Cards from the team's extra deck show an orange dot.

## 3. A turn

### 3.1 Draw (60-second limit)

The player does one of these:
- **Draw** one card from the centre stack. It's marked NEW.
- **Pick up the whole discard pile** by tapping its top card.

The timer covers only this step. Melding and throwing have no time limit.

**Timeout:** the game draws from the centre and immediately throws that same card, ending the turn. If the centre is empty at timeout, the game ends.

### 3.2 Picking up the discard pile

1. All discard cards go into the player's hand. The former top card glows and is pre-selected.
2. Your **first move must use that top card**: start a new meld with it, or add it to one of your team's melds. Nothing else is allowed first, not even throwing.
3. If you can't use it, tap **Return pile**:
   - Every pile card goes back, in its original order.
   - The 60-second draw timer restarts.
   - You must draw from the centre instead, and can't pick the pile up again this turn.
4. Invalid meld attempts are refused (the meld or button shakes), so a half-built meld is never left on the table.
5. A wildcard on top of the pile doesn't block pickup. That wildcard must be melded first.
6. There's no minimum first meld needed to pick up the pile.

### 3.3 Meld (optional, any number of moves)

- **New meld:** select 3 or more cards. The **New** button changes to a glowing **Place ✓** once the selection is valid. Tapping New on an invalid selection shakes the button and explains why.
- **Add to a meld:** drag one or more selected cards onto one of your **team's** melds. Invalid drops make the meld shake, with a message. You can't add to the opponents' melds.
- Every move appears live to all players. There is **no undo**, so teammates can read each other's play.

### 3.4 Throw (ends the turn)

- Select one card and tap **Throw**, or drag it onto the discard pile. Wildcards may be thrown.
- At the end of the turn, the team's completed melds are scored (section 6), and play passes clockwise.
- If the throw empties your hand, see sections 7 and 8.

## 4. Melds

| Rule | Sequence | Set |
|---|---|---|
| Definition | 3+ consecutive cards of the same suit | 3+ cards of the same rank, any suits (duplicates allowed) |
| Display | Highest first, e.g. K Q J 10 | Grouped |
| Ace | High (Q K A) or low (A 2 3), never both. No wrap-around: K A 2 is invalid. | Normal rank |
| Max size | 13 cards | Limited only by the cards available |
| Team limit | None | **Max 3 sets per team** on the table, finished or not. A 4th set is blocked. |
| Completed at | 7+ cards | 7+ cards |
| Wildcards | 1 per meld | 1 per meld |

- A meld needs at least 3 cards. A team's first meld has no minimum size or points.
- Melds belong to the team, and either teammate can add to any of them.
- A set of 2s (e.g. 2♠ 2♥ 2♦) is allowed and counts as **pure**.
- A 13-card sequence is **closed**, so nothing more can be added (see Timpa, 6.3).

## 5. Wildcards

### 5.1 What counts as a wildcard

- **Jokers** and **all 2s** can act as wildcards.
- **Natural 2:** a 2 of the sequence's own suit sitting in the 2 position (e.g. 3♥ 2♥ A♥) is a normal card, not a wildcard. The meld stays pure.
- A same-suit 2 standing in for another rank **is** a wildcard. For example, in 5♥ 2♥ 3♥ the 2♥ acts as the 4, so the meld is impure.
- In a set of 2s, the 2s are the meld's own rank, so they count as normal cards.

### 5.2 Limits

- **One wildcard per meld**, for both sequences and sets. So a 3-card meld always has at least 2 normal cards.
- Valid examples:
  - `4♥ 3♥ 2♥ Joker`: the 2♥ is natural and the Joker is the A.
  - `3♥ 2♥ 2♠`: the 2♥ is natural and the 2♠ is the A or the 4.
  - `3♥ 2♥ 2♥`: one 2♥ is natural and the other is a wildcard.
- Invalid examples:
  - `6♥ Joker 2♥ 3♥`: two wildcards, with the Joker as the 5 and the 2♥ as the 4.
  - `5♥ 2♠ Joker`: two wildcards.

### 5.3 Placing a wildcard

- **New meld:** if the cards can form the sequence more than one way (e.g. 8♥ 7♥ Joker), a picker asks where the wildcard goes, such as *Joker as 9* or *Joker as 6*. Each option shows whether the meld would be pure or impure.
- **Existing meld:** drag the wildcard to the exact spot you want. A yellow bar shows where it will land: *high end*, *low end* or *here* (between two cards). The engine checks the spot, and a wrong spot is refused with a message.
- Melds never have gaps, so dropping between two cards (*here*) only works if the same drop also adds the normal card that makes room for it.
  - Example: on 8♥ 7♥ 6♥, adding 10♥ and a Joker at the high end gives 10♥ Joker(=9) 8♥ 7♥ 6♥.
- A wildcard in a meld shows a small tag for the card it replaces, e.g. **=7**.

### 5.4 When a wildcard moves

1. A wildcard moves **only** when a normal card is played into the spot it's filling.
2. It moves to the **low end** of the sequence.
3. If the low end isn't valid (e.g. it would run below Ace), it moves to the **high end**.
4. If neither end is valid, the move is **blocked**.

Example: `5♥ 2♠(=4) 3♥`. Adding 4♥ gives `5♥ 4♥ 3♥ 2♠(=2)`.

Wildcards can **never** be:
- moved by choice
- moved to another meld
- taken back into a hand.

Wildcards may be thrown, including as the final throw when going out. Wildcards left in a hand at the end carry **no penalty**.

## 6. Pure, impure, Timpa and scoring

| Result | Condition | Points |
|---|---|---|
| Pure meld | Completed (7+), no wildcard (a natural 2 is fine) | 200 |
| Impure meld | Completed (7+), contains its one wildcard | 100 |
| Timpa | 13 normal cards of one suit, no wildcard | 500 |
| Going out | Section 8 | +100 |
| Extra deck penalty | Deck never claimed, or claimed but none of its cards melded | −100 |
| Unclaimed deck when the centre runs out | Section 9 | −100 |
| Cards left in hand | Any card, including wildcards | 0 |

### 6.1 When scoring happens

- At the **end of each turn**, every completed meld of the current team that hasn't been scored yet is scored as Timpa, pure or impure, based on how it looks at that moment.
- A meld can become pure before it's scored, e.g. when a same-suit 2 ends up in its own place.
- Once scored **impure**, a meld **stays impure**.
- Each meld shows a badge with its state:
  - progress (e.g. 4/7)
  - "scores end of turn"
  - ✓ (scored)
  - "→ impure end of turn"
  - 🔒 TIMPA

### 6.2 Adding a wildcard to a pure meld

- **Completed (7+) pure meld, sequence or set:** the player is asked *"Make this meld impure?"* and must confirm. If they confirm:
  - The meld **immediately** stops counting as the team's pure meld for going out.
  - At the end of the turn it drops from **200 to 100**.
- **Pure meld under 7 cards:** no prompt. The meld simply becomes impure.

### 6.3 Timpa

- All 13 ranks of one suit, every card normal. A same-suit 2 in its own place counts as normal, so it's allowed. The Ace can be:
  - high: A K Q … 3 2
  - low: K Q … 2 A
- Worth 500, and counts as a pure meld for going out.
- **Upgrade:**
  - A meld already scored pure (200) that becomes a Timpa gets **+300**, for 500 in total.
  - A meld scored impure (100) gets **+400** only if it later becomes 13 normal cards. That's only possible if its wildcard was a same-suit 2 that ended up in its own place.
- A Timpa is **locked**: no card can be added.
- A 13-card sequence that still contains a wildcard is impure (100) and **closed**. It can never become a Timpa.

## 7. Extra decks

- One 11-card deck per team. A team can only ever claim **its own** deck.
- **Claim by melding:** empty your hand with melds and you take the deck immediately, then keep playing this turn.
- **Claim by throwing:** empty your hand with your throw and you take the deck now, but can only play its cards **from your next turn**.
- Melding at least one extra-deck card marks the deck as **Used**.
- The deck status shown is one of: *Extra deck* (unclaimed) · *Claimed* · *Used* · *−100* (forfeited).
- **−100 penalty** at game end if the deck was never claimed, or was claimed but none of its cards were melded.

## 8. Going out and emptying your hand

A player may go out only when **all** of these are true for their team:

1. The team has claimed its extra deck.
2. At least one extra-deck card has been melded.
3. The team has at least **2 completed melds**.
4. At least one completed meld is **pure**. A Timpa counts; a meld turned impure by a wildcard doesn't.

- To go out, meld every card. The final throw is optional: you can meld all but one card and throw it.
- Going out earns **+100** and ends the game immediately. The team's melds are scored first.
- **Empty-hand block:** while the team can't go out, the engine refuses any meld that would leave the hand empty or with exactly one card, since throwing that card would empty the hand.
  - The message lists what's missing, e.g. *"complete 1 more meld, meld at least one extra-deck card"*.
  - The player keeps their cards, including any picked up from the pile, and throws instead.
- **Exception:** if the team's deck is still unclaimed, emptying the hand is allowed, because it claims the deck (section 7).

## 9. When the centre stack runs out

1. **If any extra deck is unclaimed:** each unclaimed deck (one or both) is shuffled face down into the centre stack. For each team affected:
   - It gets **−100** immediately.
   - It **can no longer go out**.

   The discard pile stays as it is, and play continues.
2. **If no unclaimed decks remain:** the next player takes the **final turn**. They may:
   - pick up the discard pile (the top card must still be melded first) and meld
   - or tap **End game**.

   Returning the pile on the final turn ends the game. No further turns follow.
3. End-of-game penalties (section 7) are applied and the results are shown.

## 10. End of game

- The game ends when a player goes out, or after the final turn.
- **Results** show:
  - the winner and how the game ended
  - per team: completed melds (pure / impure), Timpas, meld points, going-out bonus, each penalty with its reason, and the total.
- Equal totals are a **draw**.
- **Play again** deals a new game with the same room and seats.

## 11. Online play and disconnects

- **Planned with Firebase:**
  - Every move is checked by this rules engine on the server.
  - Each player receives only their own view, so hands stay hidden.
- If a player disconnects, the game waits for them to rejoin with the same Game ID. After **3 minutes away**, a computer player takes over their seat until they return.
- **Prototype today:** pass-and-play on one phone plus computer players. The seat switch in the menu simulates a takeover.

## 12. Edge-case reference

| Situation | What happens |
|---|---|
| Picked up the pile but can't use the top card | Return pile: cards go back in order and you draw from the centre. No second pickup this turn. |
| Top discard is a Joker | Can be picked up, but the Joker must be melded first |
| Adding a 4th set | Blocked: max 3 sets per team |
| Two wildcards in one meld | Blocked |
| Normal card takes a wildcard's spot | Wildcard moves to the low end, else the high end, else the move is blocked |
| Wildcard added to a completed pure meld | Confirmation needed. The meld stops counting as pure immediately and drops 200 → 100 at end of turn |
| Adding a card to a Timpa or any 13-card meld | Blocked (locked or closed) |
| Meld would empty the hand before the team can go out | Blocked with the missing conditions, unless it claims the team's deck |
| Throw empties the hand while the deck is unclaimed | Deck claimed, usable from next turn |
| Centre empties while a deck is unclaimed | Deck shuffled into the centre; team gets −100 and can't go out |
| Centre empties with no decks left | The next player's turn is the final turn |
| Draw timer runs out | Game draws and throws that same card; turn ends |
| Player disconnects (online) | Game waits; computer takes over after 3 minutes until they rejoin |
| Equal scores | Draw |

## 13. Not yet decided

- **3v3 mode**, not built yet. The PRD suggests:
  - 162 cards, 15-card hands and 13-card extra decks
  - melds completed at 9 cards
  - 3 completed melds needed to go out.
- **Turn length online:** only the draw step is timed. A limit on the whole turn may be needed.
- **Timer after Return pile:** it currently restarts at 60 seconds. Alternatively, it could keep counting down from where it was.
- **Wildcard dropped between two cards:** decide whether to keep this option or allow drops at the high or low end only.
