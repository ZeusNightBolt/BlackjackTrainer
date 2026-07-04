/* ============================================================
   Table rules — single source of truth.
   Everything rule-shaped (deck count, dealer behavior, payouts,
   bankroll, chip denominations, penetration) lives here so the
   whole app re-derives from one config. Current table:
   Atlantic City high-limit — 8 decks, dealer peeks and STANDS on
   all 17s (S17), blackjack 3:2, double any two, DAS, split to 4,
   split aces one card, late surrender.
   NOTE: src/evdata.js (per-action EV/SD + dealer bust table) is
   generated for THIS ruleset; regenerate it if these change.
   ============================================================ */
export const RULES = {
  name: "Atlantic City High-Limit",
  shortLabel: "8 decks · dealer peeks, stands on all 17s · 3:2 · late surrender",
  decks: 8,
  h17: false,            // dealer stands on all 17s
  blackjackPays: 1.5,    // 3:2
  peek: true,
  das: true,
  maxSplitHands: 4,
  lateSurrender: true,
  cutCards: 78,          // reshuffle when < ~1.5 decks remain (≈81% penetration)
  tableMin: 100,
  chips: [100, 500, 1000],
  chipStyle: {
    100: "linear-gradient(160deg,#4b535e,#20242a)",
    500: "linear-gradient(160deg,#8b5cf6,#5b21b6)",
    1000: "linear-gradient(160deg,#f0a13c,#a85f14)",
  },
  startingBalance: 10000,
  rebuy: 10000,          // re-buy amount offered when the bankroll can't cover the table minimum
};
export const SHOE_CARDS = RULES.decks * 52;
