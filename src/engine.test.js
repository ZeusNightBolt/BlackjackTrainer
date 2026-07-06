import { describe, it, expect } from "vitest";
import { RULES, SHOE_CARDS } from "./rules";
import {
  tag, handTotal, splittable, totalStr, buildShoe, drawFrom, baseVal,
  getPlay, basicOptimal, shouldSurrender, finalizeOpening, resolveRound, advance,
  ghostDealerPlayout, simulateAlternative, edgePct, suggestedUnits, INIT_G, BUST,
} from "./engine";

// build a card by rank value ("A" or 2..10); face is fixed so tests are deterministic
const card = (val) => ({ rank: val === "A" ? "A" : String(val), val, suit: "♠", red: false });
const hand = (...vals) => vals.map(card);

describe("hand totals", () => {
  it("sums hard hands", () => {
    expect(handTotal(hand(10, 7)).total).toBe(17);
    expect(handTotal(hand(10, 7)).soft).toBe(false);
  });
  it("treats an ace as 11 when it fits (soft) and 1 when it doesn't", () => {
    expect(handTotal(hand("A", 7))).toEqual({ total: 18, soft: true });
    expect(handTotal(hand("A", 7, 5))).toEqual({ total: 13, soft: false });
    expect(handTotal(hand("A", "A", 9))).toEqual({ total: 21, soft: true });
  });
  it("busts above 21", () => {
    expect(handTotal(hand(10, 10, 5)).total).toBe(25);
    expect(totalStr(hand(10, 10, 5))).toBe("BUST");
  });
  it("detects pairs by value, including ten-value mixes", () => {
    expect(splittable(hand(8, 8))).toBe(true);
    expect(splittable([card(10), { rank: "K", val: 10, suit: "♦", red: false }])).toBe(true);
    expect(splittable(hand(10, 9))).toBe(false);
  });
});

describe("Hi-Lo tags", () => {
  it("assigns +1 to 2-6, 0 to 7-9, -1 to 10-A", () => {
    expect([2, 3, 4, 5, 6].map((v) => tag(card(v)))).toEqual([1, 1, 1, 1, 1]);
    expect([7, 8, 9].map((v) => tag(card(v)))).toEqual([0, 0, 0]);
    expect([10, "A"].map((v) => tag(card(v)))).toEqual([-1, -1]);
  });
  it("sums to exactly 0 over a full shoe (balanced count)", () => {
    const shoe = buildShoe();
    expect(shoe.length).toBe(SHOE_CARDS);
    expect(shoe.reduce((s, c) => s + tag(c), 0)).toBe(0);
  });
  it("has decks*4 of every rank", () => {
    const per = {};
    for (const c of buildShoe()) per[c.rank] = (per[c.rank] || 0) + 1;
    expect(Object.keys(per)).toHaveLength(13);
    expect(Object.values(per).every((n) => n === RULES.decks * 4)).toBe(true);
  });
});

describe("basic strategy spot-checks (S17, 8 deck)", () => {
  it("stands hard 16 vs dealer 6, hits hard 16 vs dealer 10", () => {
    expect(basicOptimal(hand(10, 6), 6, true, false)).toBe("S");
    expect(basicOptimal(hand(10, 6), 10, true, false)).toBe("H");
  });
  it("doubles 11 vs 6 and A,7 (soft 18) vs 6", () => {
    expect(basicOptimal(hand(6, 5), 6, true, false)).toBe("D");
    expect(basicOptimal(hand("A", 7), 6, true, false)).toBe("D");
  });
  it("always splits 8,8 and A,A; never splits 5,5 or 10,10", () => {
    expect(basicOptimal(hand(8, 8), 10, true, true)).toBe("P");
    expect(basicOptimal(hand("A", "A"), 6, true, true)).toBe("P");
    expect(basicOptimal(hand(5, 5), 6, true, true)).toBe("D");
    expect(basicOptimal(hand(10, 10), 6, true, true)).toBe("S");
  });
  it("late-surrenders exactly 15v10 and 16 (non-pair) vs 9/10/A", () => {
    expect(shouldSurrender(hand(10, 5), 10)).toBe(true);
    expect(shouldSurrender(hand(10, 6), 9)).toBe(true);
    expect(shouldSurrender(hand(10, 6), 10)).toBe(true);
    expect(shouldSurrender(hand(10, 6), 11)).toBe(true);
    expect(shouldSurrender(hand(8, 8), 10)).toBe(false); // 8,8 splits, never surrenders
    expect(shouldSurrender(hand(10, 6), 6)).toBe(false);
  });
});

describe("dealer play + settlement", () => {
  const setup = (dealer, playerCards) => {
    const cg = { ...INIT_G, shoe: buildShoe(), rc: 0, bet: 100, dealer, insNet: 0,
      hands: [{ cards: playerCards, bet: 100, done: true, doubled: false, mistakes: 0, result: null }] };
    return cg;
  };
  it("stands on soft 17 (S17) — player 18 beats it", () => {
    const cg = setup(hand("A", 6), hand(10, 8));
    const S = advance(cg);
    expect(handTotal(cg.dealer).total).toBe(17);
    expect(cg.dealer).toHaveLength(2); // did not draw
    expect(S.net).toBe(100);
  });
  it("pays blackjack 3:2", () => {
    const cg = { ...INIT_G, shoe: buildShoe(), rc: 0, bet: 100, insNet: 0,
      dealer: hand(9, 7), hands: [{ cards: hand("A", 10), bet: 100, done: false, mistakes: 0, result: null }] };
    const S = finalizeOpening(cg);
    expect(S.net).toBe(150);
    expect(cg.message).toMatch(/blackjack/i);
  });
  it("a busted player loses even if the dealer would also bust (no dealer draw)", () => {
    const cg = setup(hand(10, 6), hand(10, 8, 9)); // player 27 bust, dealer 16
    const S = resolveRound(cg);
    expect(cg.dealer).toHaveLength(2); // dealer does NOT draw when all hands bust
    expect(S.net).toBe(-100);
    expect(cg.message).toMatch(/busted/i);
  });
  it("dealer draws to 17+ against a standing player", () => {
    const cg = setup(hand(5, 6), hand(10, 9)); // dealer 11, must draw
    const S = resolveRound(cg);
    expect(handTotal(cg.dealer).total).toBeGreaterThanOrEqual(17);
    expect(typeof S.net).toBe("number");
  });
});

describe("replay helpers never mutate live state", () => {
  it("ghostDealerPlayout copies the shoe and dealer", () => {
    const shoe = buildShoe();
    const len = shoe.length;
    const dealer = hand(6, 6);
    ghostDealerPlayout(dealer, shoe);
    expect(shoe).toHaveLength(len);
    expect(dealer).toHaveLength(2);
  });
  it("simulateAlternative does not touch the snapshot", () => {
    const snap = { shoe: buildShoe(), player: hand(8, 7), dealer: hand(10, 9), bet: 100, taken: "S", correct: "H", canSurrender: true };
    const shoeLen = snap.shoe.length, pLen = snap.player.length;
    const r = simulateAlternative(snap, "H");
    expect(snap.shoe).toHaveLength(shoeLen);
    expect(snap.player).toHaveLength(pLen);
    expect(typeof r.net).toBe("number");
  });
  it("surrender alternative returns exactly -half the bet", () => {
    const snap = { shoe: buildShoe(), player: hand(10, 6), dealer: hand(10, 9), bet: 100, taken: "H", correct: "R", canSurrender: true };
    expect(simulateAlternative(snap, "R").net).toBe(-50);
  });
});

describe("count → edge / bet ramp", () => {
  it("edge crosses zero near TC +1 (~+0.5% per true count)", () => {
    expect(edgePct(0)).toBeCloseTo(-0.5, 5);
    expect(edgePct(1)).toBeCloseTo(0, 5);
    expect(edgePct(4)).toBeCloseTo(1.5, 5);
  });
  it("bet ramp is flat at low counts and monotonic upward", () => {
    expect(suggestedUnits(0)).toBe(1);
    expect(suggestedUnits(1)).toBe(1);
    const ramp = [2, 3, 4, 5, 6].map(suggestedUnits);
    expect(ramp).toEqual([2, 4, 6, 8, 12]);
    for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
  });
  it("dealer bust table has the 6→7 cliff the strategy hinges on", () => {
    expect(BUST["6"]).toBeGreaterThan(BUST["7"] + 8);
  });
});

describe("shoe integrity", () => {
  it("drawFrom refills an empty shoe rather than returning undefined", () => {
    const cg = { shoe: [] };
    const c = drawFrom(cg);
    expect(c).toBeTruthy();
    expect(cg.shoe.length).toBeGreaterThan(0);
  });
  it("baseVal treats an ace as 11", () => {
    expect(baseVal(card("A"))).toBe(11);
    expect(baseVal(card(7))).toBe(7);
  });
});
