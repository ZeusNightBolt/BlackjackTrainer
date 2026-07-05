# Blackjack Trainer

A phone-first web app for learning **basic strategy** and **Hi-Lo card counting**, set at an **Atlantic City high-limit table** (8 decks, dealer stands on all 17s, 3:2, DAS, late surrender, $100 minimum). Get coached move-by-move, drill the chart, or play full shoes with a live count that grades every decision — and explains the reasoning behind it.

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-e8b64c)](LICENSE)

**▶ Live app: https://zeusnightbolt.github.io/BlackjackTrainer/** · *Educational tool — see the disclaimer below.*

---

## The four modes

| Mode | What it does |
|------|--------------|
| **Coach Me** *(home)* | A real-feel table: build a chip bet, deal, and the coach prices **every legal move before you act** — exact EV per $1, the cost of each suboptimal line, and each action's volatility (±SD), with a count overlay and a running ledger of the EV you give up by overriding it. It also watches your **bet sizing**, flagging loss-chasing and house-money pressing in real time. |
| **Drill → Flashcards** | One decision at a time, pure basic strategy, instant right/wrong with a plain-language reason. Filter by hard totals, soft totals, or pairs. |
| **Drill → Full game + count** | A full 8-deck shoe played to the end in a single frame: bankroll and bet sizing on top, live running/true count next, table and per-move coaching side by side. Grades insurance, surrender, and the Illustrious 18 / Fab 4 count deviations. |
| **Chart** | The full basic-strategy matrix (American S17 and European No-Hole-Card), a dedicated late-surrender chart, and a dealer-bust-probability bar chart showing *why* the strategy exists. Tap any cell for the reasoning. |
| **Learn** | The whole game — and the one idea behind the entire chart — in plain language. |

## Highlights

- **Coach before you act** — EV/SD for every move, computed by dynamic programming for these exact rules (Baldwin et al. 1956 method). See [STRATEGY.md](STRATEGY.md).
- **Honest, visibility-correct counting** — running/true count, decks left, and estimated edge, updating card by card. Only cards a real player would see are counted; training-only reveals (ghost cards, would-be dealer draws) are shown dimmed and never counted.
- **"What if?" replay** — after each round the trainer replays your first decision against the *same shoe* with every alternative and shows the realized outcome, framed as strategy vs. variance ("right call, worse result — don't let one draw retrain you"). On a bust or surrender the felt flips the dealer's hole card and lays out the would-be draws, timeline-correct: the card that busted you is the one the dealer would have drawn first.
- **Count-based bet sizing, done right** — a Kelly-style 1×–12× ramp on the true count. Win/loss *progression* betting is deliberately not offered — it's mathematically fake, and the coach says so.
- **Casino feel, phone-first** — a felt with a wooden rail and printed layout arcs, a betting circle that stacks your chips, suspenseful card deals, hole-card flips, an escalating win celebration on winning streaks, and a last-7 W/L strip. Action buttons dock under your thumb; add it to your iPhone home screen and it runs like an app. Bankroll and stats persist in `localStorage`.

## Rules & validation

The engine runs Atlantic City high-limit rules from a single config (`src/rules.js`): **8 decks, dealer peeks and stands on all 17s, 3:2, double any two, DAS, split to four, split aces one card, late surrender**, reshuffle at ~78 cards. The strategy/round engine lives in `src/engine.js`; per-action EV/SD tables in `src/evdata.js` are generated for exactly these rules.

Verified end-to-end against the shipped engine:

- **3,000,000 rounds** of perfect basic strategy return **−0.394%**, matching the published ≈−0.41% edge for these rules — confirming dealer play, splits, doubles, surrender, and 3:2 payouts resolve correctly.
- The Hi-Lo count sums to exactly **0** over a full shoe (balanced-count property); dealer stands on soft 17; blackjack pays 3:2; the cut card triggers a fresh shuffle.
- Every surrender cell is worse than −0.50 played out (e.g. **16 vs 10** wins only ~23%); spot-checks agree with independent Monte-Carlo to three decimals.

> Any single session swings far more than −0.4% on variance — the "misplayed hand, still won" meter exists to make that visible.

## Getting started

Requires **Node.js 18+**.

```bash
npm install       # install dependencies
npm run dev       # dev server → http://localhost:5173
npm run build     # production build → ./dist
npm run preview   # preview the production build
```

**Deploy:** pushed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`. `vite.config.js` uses `base: "./"`, so it works on a Pages project URL with no extra config.

**Stack:** React 18 (hooks only, no state library) · Vite 5 · Tailwind 3. No backend, no tracking, no external calls except Google Fonts.

## Sources

Grounded in **Wizard of Odds** (basic strategy, dealer odds, Hi-Lo, deviations), **basicstrategy.app** (American/European tables), and **Don Schlesinger, *Blackjack Attack*** (Illustrious 18, Fab 4, TC ≥ +3 insurance). Full math — surrender EVs, the counting honesty case, deviation indices, and bet-sizing — is in **[STRATEGY.md](STRATEGY.md)**. Verify the exact rules on the felt before playing anywhere; 6:5 payouts, no DAS, or no peek meaningfully shift the edge.

## Disclaimer

An educational and practice tool, not gambling advice. Blackjack has a house edge under all standard rules; basic strategy minimizes it but does not overcome it, and card counting yields only a small edge with high variance over a large sample. Counting is legal in most jurisdictions, but casinos may refuse service to suspected counters. Play responsibly and within your means.

## License

[MIT](LICENSE)
