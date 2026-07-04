# Blackjack Strategy &amp; Counting Trainer

An interactive trainer for **basic strategy** and **Hi-Lo card counting**, built as a single-page React app and set at an **Atlantic City high-limit table** (8 decks, dealer stands on all 17s, 3:2, DAS, late surrender, $100 minimum). Learn the chart, drill it, get coached move-by-move, then play full shoes with a live running/true count that grades your count-based decisions and explains the reasoning behind every play.

![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-e8b64c)

> Educational tool. Real casino conditions vary; see the disclaimer below.

**Live app:** https://zeusnightbolt.github.io/BlackjackTrainer/

---

## Features

**Learn** — the game and the single idea behind the whole chart (assume the dealer's hole card is a ten), in plain language.

**Chart** — the full basic-strategy matrix for this table (Atlantic City S17) and European No-Hole-Card rules, including a dedicated **late-surrender chart** (which player total × dealer up-card cells to give up half the bet). A dealer-bust-probability bar chart sits on top, showing *why* the strategy exists — the ~42% → ~26% cliff between a dealer 6 and 7 is the line most stand/hit decisions flip on. Tap any cell for the reasoning.

**Drill → Flashcards** — one decision at a time, pure basic strategy, with instant right/wrong and an explanation. Filter by hard totals, soft totals, or pairs.

**Coach Me** — the inverse of Drill: the coach speaks **before** you act. Build a bet from chips at a real-feel table, deal, and every legal action is priced — exact EV per $1, the cost of each suboptimal line ("standing here costs 32¢/$1"), and the volatility (±SD) of each action, with a count overlay for Illustrious-18/Fab-4 flips and a session ledger of the EV you gave up by overriding the coach. The coach also watches your **bet sizing**: it recommends scaling up or down against a Kelly-style count ramp, and flags **loss-chasing** (Martingale raises after a loss) and **house-money win-pressing** in real time, with the behavioral-economics receipts (Thaler & Johnson 1990; gambler's-fallacy and pre-commitment literature). Numbers computed by dynamic programming (Baldwin et al. 1956 method) — see [STRATEGY.md](STRATEGY.md) §5–6.

**Drill → Full game + count** — a real 8-deck shoe played to the end, laid out as a **single frame**: bankroll and bet sizing on top, the live count next, and the table with per-move coaching side by side (table left, learning/results right on wide screens; stacked on phones).

- **Bankroll & bet sizing** — a $10,000 bankroll with a $100 / $500 / $1,000 chip selector (locked mid-hand), a **$10,000 re-buy** whenever you fall below the table minimum, the next bet shown up front, and a **count-based bet ramp** ("bet with the count") that scales 1×–12× with the true count, à la Kelly. Win/loss *progression* betting is deliberately **not** offered — it's mathematically fake (see [STRATEGY.md](STRATEGY.md)).
- **Live Hi-Lo count** — running count, true count (running ÷ decks remaining), decks left, and estimated edge, updating card by card. Visibility-correct: only cards a real player would see are counted — the hole card counts when it flips (including after an all-bust round, where casinos expose it), while training-only reveals (ghost cards after a surrender, would-be dealer draws) are shown dimmed and never counted.
- **Late surrender, count-aware** — give up half your bet on your original two cards. Graded against the S17 basic set (15 vs 10; 16 — never the 8,8 pair — vs 9/10/A) **and** the Fab 4 count deviations (15 vs 10 skips surrender below TC 0; 14 vs 10 at +3; 15 vs 9 at +2; 15 vs A at +1).
- **Count-graded insurance** — when the dealer shows an Ace you make a real insurance decision, graded against the true count (correct at TC ≥ +3).
- **Illustrious 18 deviations** — the core count-based play changes (16 vs 10 stand at TC 0, 12 vs 3 at +2, 10,10 split at +5, …) graded by the count. Toggle off to drill pure basic strategy.
- **Coaching on every move** — a panel explains the *why* behind the correct play (basic strategy, a count deviation, or surrender) on correct plays too — learning, not just a verdict.
- **"What if?" counterfactual replay** — after every round (in Drill and Coach Me), the trainer replays your first decision against the **same shoe** with each alternative action and shows the realized outcome: stand on 15 v 6 and watch the dealer bust? It shows the hit would have busted *you*. Surrender a hand — or bust — and the felt itself flips the dealer's hole card and lays out the would-be draws as dimmed ghost cards, so you see exactly what you dodged or missed (training reveals are never counted). The replay is **timeline-correct**: had you stood instead of busting, the card that busted you is exactly the card the dealer would have drawn first — so the felt shows *that* card going to the dealer, not the one after it. Each line is framed as strategy vs. variance: "right call, worse result — don't let one draw retrain you."
- **Training aids** — show/hide the ± tags on each card, a hide-count "test me" mode with reveal-to-check.
- **Variance meter** — how often you misplay a hand and still win, plus strategy accuracy, count-play accuracy, net $, and W-L-P.
- **Casino feel, phone-first** — animated card deals and hole-card flips, casino-style chips, a win/lose glow on the felt, and on phones the action buttons dock to the bottom of the screen so Hit/Stand are always under your thumb. Bankroll, session stats, and settings persist in `localStorage`, so closing the tab doesn't reset your session.

> **Deep dive:** [STRATEGY.md](STRATEGY.md) documents the full math — the 16-vs-a-King EV table (you lose ~77% no matter what), the complete surrender set, the honest case for *why the count barely matters over a short session on a big shoe*, the Illustrious 18 / Fab 4 indices, and count-based vs. win/loss-progression bet sizing.

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

The engine runs Atlantic City high-limit rules: **8 decks, dealer peeks for blackjack, stands on all 17s (S17), blackjack pays 3:2, double on any two cards, double after split (DAS), split to four hands, split aces get one card, late surrender** on the original two cards only. All of it is driven from a single config in `src/rules.js`; the strategy/round engine lives in `src/engine.js`, and the per-action EV/SD tables in `src/evdata.js` are generated for exactly these rules.

See **[STRATEGY.md](STRATEGY.md)** for the full breakdown — surrender set with per-cell EV, the 16-vs-10 win/loss numbers, the honest shoe-game counting assessment, deviation indices, and bet-sizing.

Sanity checks used while building:

- A perfect-basic-strategy agent playing these exact rules over 2M seeded rounds returns **−0.49% without surrender / −0.41% with late surrender**, matching the published ~0.43% edge for Atlantic City rules — confirming dealer play, splits, doubles, surrender, and 3:2 payouts resolve correctly. Any single session will swing far more than this on pure variance — the "misplayed hand, still won" meter in Drill exists to make that visible.
- The generated per-action EV tables confirm every surrender cell: e.g. **16 vs 10** wins only ~23% and has a played-out EV of ~−0.54 either way, worse than surrender's −0.50; spot-checks agree with an independent Monte-Carlo to 3 decimals.
- The Hi-Lo count sums to exactly **0** over a full shoe (the balanced-count property), and tags are 2–6 = +1, 7–9 = 0, 10–A = −1.

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
