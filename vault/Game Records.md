# Game records (learning from how people play)

Raghav, 4 Nov 2026: "keep a log of all games played on the website, to learn how humans play, how they deviate from how you would have played, and learn what to do."

## What is recorded (`js/gamelog.js`)
- Every game played on a phone (vs computers or pass-and-play) and every online game **on the host's phone** (only the host sees every hand; guests don't record).
- The starting deal as card ids (`E.dealOf`), or the whole position for a game picked up part way (a host reopening a room).
- Every move: seat, person / computer / person using the help button (`h` 1/0/2), seconds since the previous move, the move in short form (`d` draw, `p` take pile, `r` return pile, `n` new meld, `a` add to meld, `x` throw, `e` end game, `t` timeout), and the new centre order when an unclaimed deck is shuffled in (`rs`).
- Moves the game **refused** for a person, with the message (`bad`): shows where rules or screen confuse.
- Seats as person or computer + level, a random device id, a fingerprint of the computer settings (`bot`), mode, result.
- **No names, avatars, room codes or anything personal.** A game shorter than 6 moves is not kept.
- About 5 KB a game. The latest 150 games stay on the phone (`localStorage limpa.games`); an unfinished game survives a reload (`limpa.recording`, closed as `interrupted`).
- Menu > Game records: switch (`Record games on/off`, off drops the game in progress), **Send N games** (share sheet / download, one game per line in a .txt).

## Collection point (needs Raghav, once)
The site is static, so records are kept on each phone until a collection point is set. Chosen design: a **Google Form** with one paragraph question; finished games are posted to it (`fetch` no-cors, parts of 30,000 characters for long ones, retried when back online). Setup:
1. forms.google.com > Blank form, title "Limpa game records". One question, type **Paragraph**, title `record`. Settings > Responses: don't collect emails, no sign-in.
2. Three-dot menu > **Get pre-filled link**, type `x` in the answer, **Get link**, copy it and give it to Claude. It contains the form id and the field (`entry.NNN`).
3. Responses tab > **Link to Sheets** (so Claude can read the records through the Google Drive connector).
Then set `ENDPOINT = { url: 'https://docs.google.com/forms/d/e/<FORM_ID>/formResponse', field: 'entry.<NNN>' }` in `js/gamelog.js`, bump the service-worker cache, deploy.

## Where records are kept
`records/` in the repository, one .txt per batch (one game per line), as sent from Menu > Game records. Raghav pastes them in chat ("record the games on my github"); Claude adds the file and re-runs the tool on all of `records/*.txt`.

## Studying the records (`tools/analyze-games.js`)
- `node tools/analyze-games.js <files...>`: .txt files sent from phones and/or the .csv downloaded from the responses sheet (long records arriving in parts are joined back up).
- Replays every game exactly (`E.fromDeal` + moves). At each person's move it asks the Expert what it would do **from that person's point of view** (their hand and their own memory), and where they differ it judges both with `E.compareMoves` (both choices played out on the same imagined deals).
- Writes `vault/Human Play Insights.md`: agreement per decision (draw, throw, meld, use the top card), patterns where people differ (took a small/big pile the Expert would leave, threw a card that fits the other team's melds, threw a wildcard, broke up a run, melded where the Expert would hold, made a middle-rank set, ...) with the average result in win-chance points, **what the computer could learn** (patterns where people are clearly better: at least 20 judged cases and a clear average), **where people lose most** (ideas for New player help), refused moves, decision times, help-button use, people-vs-computer results.
- Speed: about 25 s a game (`--deals 40 --think 500`; `--think` is now milliseconds for the planning Expert).
- Try it without real data: `node tools/analyze-games.js --simulate 6 practice.txt` (Easy computers stand in for people), then analyse that file. Do not commit a report made from practice records.

## Loop
1. Collect real games. 2. Run the tool, read the report. 3. For a "people better" pattern: turn it into a computer rule, test with `test/bot-eval.js`, keep it only if it wins. 4. For "people lose": a hint or a clearer message. 5. Note what changed in [[Computer Players]] / [[UX Decisions]].
