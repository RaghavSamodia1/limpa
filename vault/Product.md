# Product
- **Name:** Limpa's Breakfast. A 2v2 team card game (2 decks + 4 Jokers, 108 cards). Rules: `docs/RULES.md`.
- **Owner:** Raghav (raghavsamodia1). Launch target was early November 2026.
- **Platform:** mobile web app, installable to the home screen (PWA). Live: https://raghavsamodia1.github.io/limpa/ (GitHub Pages, deployed from `main` by `.github/workflows/pages.yml`).
- **Players:** family and friends, including older people, on iPhones. So: big targets, few fine movements, little text.
- **Modes:** play on one phone vs computer (Easy / Smart / Expert), hot-seat, online rooms with friends.
- **Testers:** Bholi Kumari gives structured feedback, see [[Tester Feedback]].
- Look and feel: one modern light theme "Morning" (warm paper and table, white cards, espresso card backs, saffron and teal teams), see [[Design System]]. Team names Bhujia and Kachori, computer names Chunnu, Munnu, Tunnu.

## Website or app? (advice given 5 Nov 2026)
- The computer players do **not** use the cloud: all thinking (including the Expert's 1.5 s lookahead) runs on the player's own phone, in a background thread. GitHub Pages only serves the files. A native app would not make the computer smarter or faster.
- The site is already an installable app (PWA): home-screen icon, full screen, works offline.
- Reasons to publish in the stores later: discoverability (App Store / Play Store search), reliable notifications for online turns, a store review badge for family to trust. Cheapest route: wrap the same code with Capacitor (no rewrite); costs Apple $99/year, Google $25 once, plus store review.
- Recommendation: stay a website now; revisit a Capacitor wrapper once there are regular players or a need for turn notifications.

