# Blackjack Strategy &amp; Counting Trainer

An interactive trainer for **basic strategy** and **Hi-Lo card counting**, built as a single-page React app. Learn the chart, drill it, then play a full 6-deck shoe with a live running/true count that grades your count-based decisions and explains the reasoning behind every play.

![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-e8b64c)

> Educational tool. Real casino conditions vary; see the disclaimer below.

**Live app:** https://zeusnightbolt.github.io/BlackjackTrainer/

---

## Features

**Learn** — the game and the single idea behind the whole chart (assume the dealer's hole card is a ten), in plain language.

**Chart** — the full basic-strategy matrix for American (dealer peeks, H17) and European (No Hole Card) rules. A dealer-bust-probability bar chart sits on top, showing *why* the strategy exists — the ~44% → ~26% cliff between a dealer 6 and 7 is the line most stand/hit decisions flip on. Tap any cell for the reasoning.

**Drill → Flashcards** — one decision at a time, pure basic strategy, with instant right/wrong and an explanation. Filter by hard totals, soft totals, or pairs.

**Drill → Full game + count** — a real 6-deck shoe played to the end:

- **Live Hi-Lo count** — running count, true count (running ÷ decks remaining), decks left, estimated edge, and a suggested bet spread, all updating card by card.
- **Visibility-correct counting** — only cards a real player would see are counted. The dealer's hole card isn't counted until it's flipped; on rounds that end early (player blackjack, or all hands bust) it's never revealed or counted.
- **Bankroll and bet sizing** — a real dollar balance and a $5 / $25 / $100 chip selector (locked once a hand is in progress), with per-hand bet amounts shown on the felt and a reset-bankroll option.
- **Late surrender** — give up half your bet on your original two cards (before hitting or splitting), graded against the two spots where it beats playing on: hard 16 (never the 8,8 pair) vs 9/10/A, and hard 15 vs 10.
- **Count-graded insurance** — when the dealer shows an Ace you make an actual insurance decision, graded against the true count (correct at TC ≥ +3, where the chance of a ten in the hole passes 1/3).
- **Illustrious 18 deviations** — the core count-based strategy changes (e.g., 16 vs 10 stand at TC 0, 12 vs 3 at +2, 10,10 split at +5) are graded by the count, not just against basic strategy. Toggle off to drill pure basic strategy.
- **Coaching on every move** — a panel explains the *why* behind the correct play (basic-strategy logic, the deviation logic, or the surrender logic), on correct plays too — learning, not just a verdict.
- **Training aids** — show/hide the ± tags printed on each card, a hide-count "test me" mode with reveal-to-check, and an optional bet-with-the-count mode so bet sizing reflects spreading.
- **Variance meter** — tracks how often you misplay a hand and still win, plus strategy accuracy, count-play accuracy, net $, and W-L-P.

---

## Tech stack

- **React 18** — UI, all state in hooks (no external state library).
- **Vite 5** — dev server and build.
- **Tailwind CSS 3** — layout utilities. Custom colors are inline styles (no arbitrary/JIT classes), so the dark theme renders regardless of purge.

No backend, no tracking, no external calls except Google Fonts.

---

## Getting started

Requires **Node.js 18+**.

```bash
# install dependencies
npm install

# start the dev server (http://localhost:5173)
npm run dev

# production build → ./dist
npm run build

# preview the production build locally
npm run preview
```

---

## Deploy to GitHub Pages

Deployed at **https://zeusnightbolt.github.io/BlackjackTrainer/** via the workflow at `.github/workflows/deploy.yml`.

That workflow (already enabled: **Settings → Pages → Build and deployment → Source → GitHub Actions**) builds and publishes the site on every push to `main`. `vite.config.js` uses `base: "./"` (relative asset paths), so it works on a Pages project URL without extra configuration.

---

## Rules modeled &amp; validation

The full-game engine runs standard American shoe rules: **6 decks, dealer peeks for blackjack, hits soft 17 (H17), blackjack pays 3:2, double allowed on any two cards, double after split (DAS), split to four hands, split aces get one card, late surrender** on the original two cards only.

Sanity checks used while building:

- A perfect-basic-strategy agent playing the engine over 400k–2M hands returns roughly **−0.6% to −0.8% per round** (no surrender; surrender trims a further ~0.02%), consistent with the known basic-strategy house edge for these rules — confirming dealer play, splits, doubles, surrender, and 3:2 payouts resolve correctly. Any single session will swing far more than this on pure variance — the "misplayed hand, still won" meter in Drill exists to make that visible.
- The Hi-Lo count sums to exactly **0** over a full 6-deck shoe (the balanced-count property), and tags are 2–6 = +1, 7–9 = 0, 10–A = −1.

---

## Sources

Strategy and counting math are grounded in:

- **Wizard of Odds** — [basic strategy](https://wizardofodds.com/games/blackjack/strategy/4-decks/), [dealer bust odds](https://wizardofodds.com/games/blackjack/dealer-odds-blackjack-us-rules/), [Hi-Lo card counting](https://wizardofodds.com/games/blackjack/card-counting/high-low/), and [count deviations](https://wizardofodds.com/ask-the-wizard/blackjack/card-counting/).
- **basicstrategy.app** — American and European basic-strategy tables (cross-checked against Wizard of Odds).
- **Don Schlesinger, *Blackjack Attack*** — the Illustrious 18 deviation indices and the TC ≥ +3 insurance play.

Verify the exact rules on the felt before playing anywhere; small rule changes (6:5 payouts, no DAS, no peek) meaningfully shift the edge.

---

## Disclaimer

This is an educational and practice tool, not gambling advice. Blackjack has a house edge under all standard rules; basic strategy minimizes it but does not overcome it, and card counting produces only a small edge with high variance over a large sample. Card counting is legal in most jurisdictions but casinos may refuse service to suspected counters. Play responsibly and within your means.

## License

[MIT](LICENSE)
