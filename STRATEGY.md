# Blackjack Strategy — the math behind every play

This is the reference the trainer is built on. Everything here is for the ruleset the
Full-Game engine actually deals:

> **6-deck shoe · dealer peeks for blackjack · dealer HITS soft 17 (H17) · blackjack pays 3:2 ·
> double on any two cards · double after split (DAS) · split to 4 hands · split aces get one card ·
> late surrender allowed.**

Rule changes move these numbers. 6:5 blackjacks, no DAS, no surrender, or dealer standing on soft
17 (S17) each shift the edge, and a couple of them flip specific cells. Verify the felt before you sit.

All EV figures below are **per unit bet** and come from a composition-dependent Monte-Carlo
simulation of this exact ruleset (dealer peek modeled, ~400k trials per cell). "EV −0.54" means you
lose, on average, 54¢ of every $1 wagered on that decision.

---

## 1. The one idea

The dealer has **no choices** — hit until 17+, then stop. That fixed behavior is the whole game.
Assume the dealer's hole card is a ten (16/52 ≈ 31% of the deck is ten-valued), then:

- Dealer showing **2–6** → likely to bust. Stand on your stiffs, press your bets.
- Dealer showing **7–A** → likely 17+. Hit your stiffs and try to catch up.

The cliff is real: a dealer **6 busts ~44%**, a **7 only ~26%**. That 18-point drop between 6 and 7
is where most stand/hit decisions flip.

---

## 2. Surrender — including the "16 vs a King" question

Late surrender means: on your **original two cards only**, before hitting or splitting, you may quit
the hand and give back **half** your bet. Its EV is therefore a flat **−0.50**. You should take it
exactly when *playing the hand out* — the best of hitting or standing — is worse than −0.50.

### The 16 vs 10 (or any ten, incl. a King) breakdown

A hard 16 is the worst hand in blackjack. Against a dealer ten, played out:

| Line | Win | Lose | Push | EV |
|-----------|-----:|-----:|-----:|------:|
| **Stand** | ~23% | ~77% | ~0% | **−0.54** |
| **Hit**   | — | — | — | **−0.53** |
| **Surrender** | — | 100% (half) | — | **−0.50** |

You lose roughly **77% of the time no matter what you do**. Standing, the dealer starts with 10
showing and makes 17–21 far more often than they bust; you win only when they bust (~23%). Hitting,
you bust ~62% of the time outright. Both lines land near −0.54/−0.53 — *worse* than just handing back
half. So you **surrender**: −0.50 beats −0.54. It feels like quitting, but over thousands of these
hands, giving up half saves ~4¢ per hand versus playing on. That's the entire logic of surrender —
it's not for hands you'll probably lose, it's for hands you'll lose *more than half the time even
played perfectly*.

Two neighboring cells for context (same simulation):

| Hand | Stand EV | Hit EV | Surrender | Verdict |
|------|-----:|-----:|-----:|------|
| 16 vs 10 | −0.54 | −0.53 | −0.50 | **Surrender** |
| 16 vs 9  | −0.54 | −0.51 | −0.50 | **Surrender** (barely) |
| 15 vs 10 | −0.54 | −0.50 | −0.50 | **Surrender** (marginal — hit is a near-tie) |
| 16 vs A (H17) | −0.60 | −0.54 | −0.50 | **Surrender** |
| 15 vs A (H17) | −0.60 | −0.51 | −0.50 | **Surrender** |
| 17 vs A (H17) | −0.51 | −0.52 | −0.50 | **Surrender** (H17 only, very marginal) |

### The full late-surrender set (this H17 6-deck game)

| Player | Surrender vs |
|--------|--------------|
| Hard **15** | 10, **A** |
| Hard **16** (not the 8,8 pair) | 9, 10, A |
| Hard **17** | **A** |
| Pair **8,8** | **A** (otherwise split — 8,8 is the one pair that ever surrenders) |

The **A**-column entries for 15, 17, and 8,8 are **H17-only** additions — because a dealer who hits
soft 17 wins slightly more often, which drags those borderline hands below the −0.50 line. On an S17
table you'd only surrender 15 vs 10 and 16 vs 9/10/A. Never surrender any soft hand, and never
surrender 8,8 against anything but an Ace (splitting 8,8 is worth more everywhere else).

Surrender is checked **first** — before hit/stand/double/split — because it caps your loss at half.

---

## 3. Counting: how it works, and does it matter on 6 decks?

**Hi-Lo tags:** low cards `2–6 = +1`, neutral `7–9 = 0`, high cards `10–A = −1`. Sum the tags of every
card you *see* → the **running count**. High cards remaining favor you: more blackjacks (paid 3:2),
more dealer busts on stiffs, and more profitable doubles.

**True count = running count ÷ decks remaining.** A +6 running count is nearly meaningless with 5
decks left but huge with 1 deck left; dividing normalizes it. Rule of thumb: **each +1 of true count
≈ +0.5% to your edge**. Off the top you're at about −0.5%, so you cross break-even around **TC +1**
and are genuinely ahead above it.

### "6 decks, so the count is almost useless" — is that fair?

**Largely, yes — for a casual player.** Here's the honest math:

- Off the top the house has ~0.5%. Counting doesn't remove that on most hands; it tells you *when* to
  bet more and *when* the deck has swung. On a 6-deck shoe the true count only drifts to strongly
  positive territory **late in the shoe**, and good games only deal ~65–80% before reshuffling — so
  high counts are a **minority of hands**.
- With a realistic **1×–12× bet spread**, a competent Hi-Lo counter earns roughly **+0.5% to +1.0% of
  average bet per hand** — a tiny edge riding on enormous variance (per-hand standard deviation ≈
  **1.1–1.3 units**, and much more when you're spreading big).
- Because of that variance, the number of hands before your results reliably reflect your edge (the
  "**N₀**" — hands to one standard deviation of separation from break-even) is on the order of
  **tens of thousands of hands**. That's *hundreds of hours* at a table.

So the skepticism is correct: **over a short session the count is a rounding error**, and flat-betting
a count barely breaks even. Counting only turns into money through a real bet spread sustained over a
*lot* of volume. This trainer teaches the mechanics honestly — and the "misplayed a hand and still won"
meter exists precisely to show you how much of any single session is just variance.

---

## 4. Deviations — where the count changes the play

Basic strategy is *flat-bet* optimal. As the true count moves, a handful of cells flip. The trainer
grades the two canonical sets:

**Illustrious 18** (Schlesinger) — the most valuable play deviations. A few examples the engine uses
(true-count index → take the deviation at that TC or higher):

- **Insurance** at TC **+3** (the single most valuable count play).
- **16 vs 10**: stand at TC **0**+ (instead of hit — when you can't surrender, e.g. a 3-card 16).
- **15 vs 10**: stand at TC **+4**.
- **12 vs 3**: stand at **+2**; **12 vs 2**: stand at **+3**; **13 vs 2**: stand at **−1**.
- **10 vs 10/A**: double at **+4**; **9 vs 2**: double at **+1**; **9 vs 7**: double at **+3**.
- **10,10 split** vs 5 at **+5**, vs 6 at **+4** (advanced / high-count only).

**Fab 4** (Schlesinger) — the surrender deviations. Surrender becomes correct on *extra* hands as the
shoe goes ten-rich:

- **15 vs 10**: surrender at TC **0**+ (below 0, play it out).
- **14 vs 10**: surrender at **+3**.
- **15 vs 9**: surrender at **+2**.
- **16 vs 8**: surrender at **+4**.

Turn "Grade count deviations" off to drill pure basic strategy; on, and the trainer expects the
count-correct play and labels every deviation.

---

## 5. Bet sizing — what's real and what's a myth

There are two ways people size bets. Only one is real.

### Count-based (real) — bet ∝ your advantage

This is the entire point of counting, and it's grounded in the **Kelly criterion**: to maximize
long-run bankroll growth, wager a fraction of your bankroll proportional to your edge. In practice
counters use a **bet ramp** keyed to true count — flat minimum at TC ≤ +1, then scaling up:

| True count | Bet (× your unit) |
|-----------:|:------------------|
| ≤ +1 | 1× |
| +2 | 2× |
| +3 | 4× |
| +4 | 6× |
| +5 | 8× |
| +6+ | 12× |

(the trainer's "Bet with the count" toggle uses exactly this ramp.) You bet big only when you're
actually favored, small when you're not. More spread = more edge but more variance and higher
risk-of-ruin, so full-Kelly is aggressive; most counters bet a fraction of it. **This is the only
bet-sizing signal that changes your expected value.**

### Win/loss progression (a myth) — Martingale, "press a hot streak," "chase your losses"

Adjusting your bet based on whether you just **won or lost** does **not** work, and it's worth being
blunt about why:

- **Rounds are independent of your results.** The cards don't know or care that you just lost four
  hands. The probability of the next hand is set by the *composition of the shoe* (which the count
  tracks), **not** by your recent W/L streak. Believing otherwise is the **gambler's fallacy**.
- **No betting pattern changes EV.** Multiplying a series of −0.5%-EV bets by any schedule of numbers
  that ignores the count leaves the sum at −0.5% EV. You cannot add up negative-expectation bets and
  reach a positive total by reordering the amounts.
- **Martingale (double after every loss) is a bankroll time-bomb.** It "works" until the one
  inevitable long losing streak, where the required next bet blows past the table limit or your
  bankroll. You trade many small wins for a rare catastrophic loss — same negative EV, worse variance,
  and a hard ceiling from table maximums.

Why do people believe it? Because most sessions are short, and a progression *usually* ends a short
session with a small win (you claw back small losses often) — while quietly setting up the occasional
blow-up. The wins are frequent and visible; the ruin is rare and remembered as "bad luck."

**Verdict: size to the count, never to the streak.** This trainer implements the count ramp and
deliberately does **not** offer a win/loss progression, because modeling a fake edge would be
mis-educating you. If your bet decision uses anything other than the count and your bankroll, it's
decoration.

---

## 6. The Coach: per-action EV and variance

The **Coach Me** table prices every legal action *before* you act. Where those numbers come from:

**Method.** For each player state (hard 4–21, soft 12–21, every pair) against each dealer up-card,
we compute the exact expected value of **Stand, Hit, Double, Split, and Surrender** by dynamic
programming: build the dealer's final-total distribution (H17, with the peek — all values are
conditioned on the dealer *not* having blackjack, which is the only situation in which you actually
make a decision), then evaluate Stand directly, Hit as one card followed by optimal play, Double as
one card at doubled stakes, and Split with the standard two-hand approximation (DAS allowed, split
aces one card, no resplit). This is the same machinery behind every published basic-strategy table
since **Baldwin, Cantey, Maisel & McDermott, "The Optimum Strategy in Blackjack,"
*Journal of the American Statistical Association* 51 (1956)** — the first complete mathematical
solution of the game — refined by **Thorp (*Beat the Dealer*, 1962)** and given its definitive
treatment in **Griffin, *The Theory of Blackjack*** and **Werthamer, *Risk and Reward: The Science
of Casino Blackjack* (Springer, 2nd ed. 2018)**. The infinite-deck computation matches 6-deck
composition-dependent values to a few thousandths of a bet — smaller than any decision boundary the
coach displays — and was cross-checked against our own 6-deck Monte-Carlo simulator (e.g. soft 18 vs 6
double: DP +0.355 vs 3M-round MC +0.3557).

**What the columns mean.**
- **EV (¢/$1)** — expected win/loss per dollar of your *original* bet if you take that action and
  play on perfectly. The coach's pick is simply the highest EV.
- **Cost (−¢/$)** — how much EV you give up choosing that action instead of the coach's line. This is
  the honest price of a "feel" play: standing on 16 vs 10 instead of hitting costs ~0.1¢; **not**
  doubling 11 vs 6 costs ~10¢; splitting 10,10 vs 6 instead of standing costs ~20¢ per dollar.
- **± swing (SD)** — the standard deviation of the action's outcome. A flat hand runs about
  **±0.95–1.1 units**; a double, **~±1.9** (same decision EV, double the volatility); splits more;
  surrender exactly **0**. Two actions can have nearly identical EV and very different variance —
  16 vs 10's hit/stand is a near-tie in EV, but surrender removes *all* variance at a known −0.50.
  Per-hand SD for the overall game is ≈1.15 units (Griffin; Schlesinger, *Blackjack Attack*), which
  is why short sessions are noise (§3).
- The **"EV you gave up" ledger** accumulates cost × your actual bet across the session — the expected
  dollar price of every override. Over a long session it converges to what your deviations actually
  cost you; in any short session, variance can pay you *despite* them (that's the trap).

**Count overlay.** The EV table is flat-count (fresh-shoe composition). When the true count crosses an
Illustrious-18 or Fab-4 index, the coach flags the flip (e.g. "count says Stand, TC +1, index 0") —
the count shifts these EVs by roughly ½¢ per $1 per true-count point in the flagged cells.

---

## 7. How these numbers were validated

- **House edge:** a perfect-basic-strategy agent playing the engine over 2M seeded rounds returns
  **−0.6% to −0.8% per round**, matching the known basic-strategy edge for 6-deck H17 DAS.
- **Surrender / odd-hand EVs:** a composition-dependent simulator (dealer peek modeled) computes
  stand/hit/surrender EV per cell; every surrender cell in §2 has a played-out EV worse than −0.50.
- **Count integrity:** the Hi-Lo count sums to exactly **0** over a full 6-deck shoe (the balanced-count
  property); the trainer only counts cards a real player would see (the hole card isn't counted until
  it flips).

## Sources

- **Baldwin, Cantey, Maisel & McDermott (1956)** — "The Optimum Strategy in Blackjack," *JASA* 51:
  the founding academic paper; first complete basic strategy by expected-value analysis.
- **Edward O. Thorp, *Beat the Dealer* (1962)** — card counting and the first winning system,
  built on the Baldwin group's mathematics.
- **Peter Griffin, *The Theory of Blackjack*** — composition-dependent EV, per-hand variance,
  effects of removal; the standard theoretical reference.
- **Don Schlesinger, *Blackjack Attack*** — the Illustrious 18, the Fab 4 surrender indices, the
  TC ≥ +3 insurance play, N₀/SCORE and risk-adjusted betting.
- **N. Richard Werthamer, *Risk and Reward: The Science of Casino Blackjack* (Springer, 2nd ed. 2018)** —
  the modern academic monograph: optimal betting, variance, and risk formalized.
- **Wizard of Odds** — basic strategy, dealer bust odds, Hi-Lo, and deviation indices (cross-check).
- **basicstrategy.app** — American/European basic-strategy tables (cross-checked).
