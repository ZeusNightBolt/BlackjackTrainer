/* ============================================================
   Game + strategy engine (pure logic, no React).
   Rules come from ./rules.js; per-action EV/SD and the dealer
   bust table come from ./evdata.js (generated for the same rules).
   Strategy tables and indices cross-checked vs Wizard of Odds and
   Schlesinger's Blackjack Attack for 8-deck S17 DAS LS.
   ============================================================ */
import { RULES } from "./rules";
import { EVDATA, BUST } from "./evdata";

export { BUST };

/* ------------------------------ misc helpers ------------------------------ */
export const rnd = (n) => Math.floor(Math.random() * n);
export const pick = (a) => a[rnd(a.length)];
export const signed = (n) => (n >= 0 ? "+" : "") + n;
export function fmtMoney(n) { const v = Math.round(n * 100) / 100; const s = Number.isInteger(v) ? v.toString() : v.toFixed(2); return "$" + s; }
export function fmtSigned(n) { const v = Math.round(n * 100) / 100; const sign = v > 0 ? "+" : v < 0 ? "-" : ""; const abs = Math.abs(v); const s = Number.isInteger(abs) ? abs.toString() : abs.toFixed(2); return sign + "$" + s; }

/* ------------------------------ cards ------------------------------ */
export const SUITS = [{ s: "♠", red: false }, { s: "♣", red: false }, { s: "♥", red: true }, { s: "♦", red: true }];
export const RANKS = [["A", "A"], ["2", 2], ["3", 3], ["4", 4], ["5", 5], ["6", 6], ["7", 7], ["8", 8], ["9", 9], ["10", 10], ["J", 10], ["Q", 10], ["K", 10]];
export function faceFor(v) { if (v === "A") return "A"; if (v === 10) return pick(["10", "J", "Q", "K"]); return String(v); }
export function makeCard(v) { const su = pick(SUITS); return { rank: faceFor(v), red: su.red, suit: su.s, val: v }; }
export function baseVal(c) { return c.val === "A" ? 11 : c.val; }
export function tag(c) { if (c.val === "A" || c.val === 10) return -1; if (c.val >= 2 && c.val <= 6) return 1; return 0; }
export function handTotal(cards) { let sum = 0, a = 0; for (const c of cards) { if (c.val === "A") { a++; sum += 11; } else sum += c.val; } while (sum > 21 && a > 0) { sum -= 10; a--; } return { total: sum, soft: a > 0 }; }
export function splittable(cards) { return cards.length === 2 && cards[0].val === cards[1].val; }
export function handDesc(cards) { if (splittable(cards)) { const v = cards[0].val; if (v === "A") return "A,A"; if (v === 10) return cards[0].rank + "," + cards[1].rank; return v + "," + v; } const t = handTotal(cards); return (t.soft ? "soft " : "") + t.total; }
export function totalStr(cards) { const t = handTotal(cards); if (t.total > 21) return "BUST"; return (t.soft && t.total < 21 ? "soft " : "") + t.total; }
export function buildShoe() { const s = []; for (let d = 0; d < RULES.decks; d++) for (const su of SUITS) for (const [rank, val] of RANKS) s.push({ rank, val, suit: su.s, red: su.red }); for (let i = s.length - 1; i > 0; i--) { const j = rnd(i + 1);[s[i], s[j]] = [s[j], s[i]]; } return s; }
export function drawFrom(cg) { if (cg.shoe.length === 0) cg.shoe = buildShoe(); return cg.shoe.pop(); }

/* ------------------------------ basic strategy ------------------------------ */
export const DEALER = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
export const TABLES = {
  american: {
    label: "Atlantic City — 8 decks, dealer peeks, stands on all 17s",
    hard: [["5–8","HHHHHHHHHH"],["9","HDDDDHHHHH"],["10","DDDDDDDDHH"],["11","DDDDDDDDDH"],["12","HHSSSHHHHH"],["13–16","SSSSSHHHHH"],["17–21","SSSSSSSSSS"]],
    soft: [["A,2 / A,3","HHHDDHHHHH"],["A,4 / A,5","HHDDDHHHHH"],["A,6","HDDDDHHHHH"],["A,7","SDDDDSSHHH"],["A,8","SSSSSSSSSS"],["A,9 / A,10","SSSSSSSSSS"]],
    pairs: [["2,2 / 3,3","PPPPPPHHHH"],["4,4","HHHPPHHHHH"],["5,5","DDDDDDDDHH"],["6,6","PPPPPHHHHH"],["7,7","PPPPPPHHHH"],["8,8","PPPPPPPPPP"],["9,9","PPPPPSPPSS"],["10,10","SSSSSSSSSS"],["A,A","PPPPPPPPPP"]],
  },
  european: {
    label: "European — No Hole Card (dealer draws after you)",
    hard: [["5–8","HHHHHHHHHH"],["9","HDDDDHHHHH"],["10–11","DDDDDDDDHH"],["12","HHSSSHHHHH"],["13–16","SSSSSHHHHH"],["17–21","SSSSSSSSSS"]],
    soft: [["A,2 / A,3","HHHDDHHHHH"],["A,4 / A,5","HHDDDHHHHH"],["A,6","HDDDDHHHHH"],["A,7","SDDDDSSHHH"],["A,8","SSSSSSSSSS"],["A,9 / A,10","SSSSSSSSSS"]],
    pairs: [["2,2 / 3,3","PPPPPPHHHH"],["4,4","HHHPPHHHHH"],["5,5","DDDDDDDDHH"],["6,6","PPPPPHHHHH"],["7,7","PPPPPPHHHH"],["8,8","PPPPPPPPHH"],["9,9","PPPPPSPPSS"],["10,10","SSSSSSSSSS"],["A,A","PPPPPPPPPH"]],
  },
};
const AMH = Object.fromEntries(TABLES.american.hard), AMS = Object.fromEntries(TABLES.american.soft), AMP = Object.fromEntries(TABLES.american.pairs);
export function pairKey(cards) { const v = cards[0].val; if (v === "A") return "A,A"; if (v === 10) return "10,10"; if (v === 2 || v === 3) return "2,2 / 3,3"; return v + "," + v; }
export function softKey(t) { if (t <= 14) return "A,2 / A,3"; if (t <= 16) return "A,4 / A,5"; if (t === 17) return "A,6"; if (t === 18) return "A,7"; if (t === 19) return "A,8"; return "A,9 / A,10"; }
export function hardKey(t) { if (t <= 8) return "5–8"; if (t === 9) return "9"; if (t === 10) return "10"; if (t === 11) return "11"; if (t === 12) return "12"; if (t <= 16) return "13–16"; return "17–21"; }
export function dIdx(d) { return d === 11 ? 9 : d - 2; }
export function basicOptimal(cards, dUp, canDouble, canSplit) {
  const i = dIdx(dUp);
  if (canSplit && splittable(cards)) { const L = AMP[pairKey(cards)][i]; return L === "D" && !canDouble ? "H" : L; }
  const { total, soft } = handTotal(cards);
  if (soft && total >= 13 && total <= 21) { let L = AMS[softKey(total)][i]; if (L === "D" && !canDouble) L = total >= 18 ? "S" : "H"; return L; }
  if (soft && total < 13) return "H";
  let L = AMH[hardKey(total)][i]; if (L === "D" && !canDouble) L = "H"; return L;
}
/* Late-surrender basic strategy for this S17 shoe (verified by the EV tables in evdata.js:
   every cell here has hit AND stand EV worse than −0.50). S17 set: 16 (never the 8,8 pair)
   vs 9/10/A, and 15 vs 10. (H17 tables add 15 vs A, 17 vs A, 8,8 vs A — not this game.) */
export function shouldSurrender(cards, dUp) {
  const { total, soft } = handTotal(cards);
  if (soft) return false;
  if (splittable(cards) && cards[0].val === 8) return false; // 8,8 always splits under S17
  if (total === 16 && (dUp === 9 || dUp === 10 || dUp === 11)) return true;
  if (total === 15 && dUp === 10) return true;
  return false;
}
/* Illustrious-18 deviations (Hi-Lo). Stand/double/split if TC >= index, else basicAlt. */
export function deviationFor(cards, dUp, canSplit) {
  const { total, soft } = handTotal(cards), pair = splittable(cards) && canSplit, tens = pair && cards[0].val === 10, two = cards.length === 2;
  if (tens) { if (dUp === 5) return { index: 5, action: "P", basicAlt: "S", label: "10,10" }; if (dUp === 6) return { index: 4, action: "P", basicAlt: "S", label: "10,10" }; return null; }
  if (pair || soft) return null;
  if (total === 16) { if (dUp === 9) return { index: 5, action: "S", basicAlt: "H", label: "16" }; if (dUp === 10) return { index: 0, action: "S", basicAlt: "H", label: "16" }; return null; }
  if (total === 15) { if (dUp === 10) return { index: 4, action: "S", basicAlt: "H", label: "15" }; return null; }
  if (total === 13) { if (dUp === 2) return { index: -1, action: "S", basicAlt: "H", label: "13" }; if (dUp === 3) return { index: -2, action: "S", basicAlt: "H", label: "13" }; return null; }
  if (total === 12) { const m = { 2: 3, 3: 2, 4: 0, 5: -2, 6: -1 }; if (m[dUp] !== undefined) return { index: m[dUp], action: "S", basicAlt: "H", label: "12" }; return null; }
  if (total === 10 && two && (dUp === 10 || dUp === 11)) return { index: 4, action: "D", basicAlt: "H", label: "10" };
  if (total === 9 && two) { if (dUp === 2) return { index: 1, action: "D", basicAlt: "H", label: "9" }; if (dUp === 7) return { index: 3, action: "D", basicAlt: "H", label: "9" }; return null; }
  return null;
}
/* Fab 4 surrender deviations (Schlesinger): true count at/above the index means surrender.
   15v10 is a basic surrender you SKIP below TC 0; 14v10, 15v9, 15vA are count-unlocked. */
export const SURR_DEV = { "15-10": 0, "14-10": 3, "15-9": 2, "15-11": 1 };
export function surrenderReco(cards, dUp, tcFloor, useDev) {
  const basic = shouldSurrender(cards, dUp);
  if (!useDev) return { sur: basic, dev: false, index: null };
  const { total, soft } = handTotal(cards);
  if (soft) return { sur: basic, dev: false, index: null };
  const key = total + "-" + (dUp === 11 ? 11 : dUp);
  if (SURR_DEV[key] !== undefined) { const index = SURR_DEV[key]; const sur = tcFloor >= index; return { sur, dev: sur !== basic, index, label: String(total) }; }
  return { sur: basic, dev: false, index: null };
}
export function getPlay(cards, dUp, canDouble, canSplit, tcFloor, useDev, canSurrender) {
  const basicSur = canSurrender && shouldSurrender(cards, dUp);
  const basicMove = basicSur ? "R" : basicOptimal(cards, dUp, canDouble, canSplit);
  if (!useDev) return { move: basicMove, isDeviation: false, rec: null, basic: basicMove };
  // 1) surrender deviations (take precedence — decided on the original two cards)
  if (canSurrender) {
    const sp = surrenderReco(cards, dUp, tcFloor, useDev);
    if (sp.sur) { const rec = sp.dev ? { label: sp.label, index: sp.index, action: "R", basicAlt: basicMove, surrender: true } : null; return { move: "R", isDeviation: sp.dev, rec, basic: basicMove }; }
    if (basicSur && !sp.sur) { // count says skip a basic surrender → play it out
      const rec = { label: sp.label, index: sp.index, action: basicOptimal(cards, dUp, canDouble, canSplit), basicAlt: "R", surrender: true, skip: true };
      let move = basicOptimal(cards, dUp, canDouble, canSplit);
      return { move, isDeviation: true, rec, basic: basicMove };
    }
  }
  // 2) play deviations (Illustrious 18)
  const rec = deviationFor(cards, dUp, canSplit);
  if (!rec) return { move: basicMove, isDeviation: false, rec: null, basic: basicMove };
  let move = tcFloor >= rec.index ? rec.action : rec.basicAlt;
  if (move === "D" && !canDouble) move = "H";
  if (move === "P" && !canSplit) move = "S";
  return { move, isDeviation: move !== basicMove, rec, basic: basicMove };
}

/* ------------------------------ counting / betting ------------------------------ */
export const edgePct = (tc) => 0.5 * tc - 0.5;
export function suggestedUnits(tc) { const f = Math.floor(tc); if (f <= 1) return 1; if (f === 2) return 2; if (f === 3) return 4; if (f === 4) return 6; if (f === 5) return 8; return 12; }

/* ------------------------------ round engine ------------------------------ */
export const INIT_G = { phase: "idle", shoe: [], hands: [], dealer: [], log: [], dealerRevealed: false, active: 0, message: "", roundNet: 0, roundFlawedWon: 0, rc: 0, bet: 1, insNet: 0, coach: null, shuffled: false };
export function finalizeOpening(cg) {
  const du = cg.dealer[0], dh = cg.dealer[1], dUp = baseVal(du);
  const peeks = RULES.peek && (dUp === 11 || dUp === 10);
  const dealerBJ = peeks && handTotal(cg.dealer).total === 21;
  const playerBJ = handTotal(cg.hands[0].cards).total === 21;
  const insNet = cg.insNet || 0;
  if (dealerBJ) {
    cg.dealerRevealed = true; cg.rc += tag(dh);
    const h = cg.hands[0];
    if (playerBJ) { h.result = "push"; cg.message = "Both blackjack — push."; cg.roundNet = insNet; cg.phase = "done"; return { won: 0, lost: 0, push: 1, flawed: 0, flawedWon: 0, net: cg.roundNet }; }
    h.result = "lose"; cg.message = "Dealer blackjack."; cg.roundNet = -cg.bet + insNet; cg.phase = "done"; return { won: 0, lost: 1, push: 0, flawed: 0, flawedWon: 0, net: cg.roundNet };
  }
  if (playerBJ) {
    const h = cg.hands[0]; h.result = "win"; h.bet = cg.bet * RULES.blackjackPays; cg.dealerRevealed = false; cg.phase = "done"; cg.message = "Blackjack! Paid 3:2."; cg.roundNet = cg.bet * RULES.blackjackPays + insNet;
    return { won: 1, lost: 0, push: 0, flawed: 0, flawedWon: 0, net: cg.roundNet };
  }
  cg.phase = "player"; cg.active = 0; cg.insNet = insNet; return null;
}
export function resolveRound(cg) {
  const live = cg.hands.some((h) => handTotal(h.cards).total <= 21);
  if (live) {
    cg.dealerRevealed = true; cg.rc += tag(cg.dealer[1]);
    let guard = 0; while (guard++ < 20) { const { total, soft } = handTotal(cg.dealer); if (total < 17 || (RULES.h17 && total === 17 && soft)) { const c = drawFrom(cg); cg.rc += tag(c); cg.dealer.push(c); } else break; }
  } else cg.dealerRevealed = false;
  const dT = handTotal(cg.dealer).total, dBust = dT > 21;
  let won = 0, lost = 0, push = 0, flawed = 0, flawedWon = 0, net = 0;
  for (const h of cg.hands) {
    const pT = handTotal(h.cards).total; let res;
    if (h.surrendered) { net -= h.bet / 2; lost++; continue; }
    if (pT > 21) res = "lose"; else if (!live) res = "lose"; else if (dBust) res = "win"; else if (pT > dT) res = "win"; else if (pT < dT) res = "lose"; else res = "push";
    h.result = res;
    if (res === "win") { won++; net += h.bet; } else if (res === "lose") { lost++; net -= h.bet; } else push++;
    if (h.mistakes > 0) { flawed++; if (res === "win") flawedWon++; }
  }
  net += cg.insNet || 0;
  cg.phase = "done"; cg.roundNet = net; cg.roundFlawedWon = flawedWon;
  cg.message = live ? (dBust ? "Dealer busts." : "Dealer stands on " + dT + ".") : "All hands busted — dealer doesn't draw.";
  return { won, lost, push, flawed, flawedWon, net };
}
export function advance(cg) {
  const next = cg.hands.findIndex((h) => !h.done);
  if (next === -1) return resolveRound(cg);
  cg.active = next; const h = cg.hands[next];
  if (h.cards.length === 1) { const c = drawFrom(cg); cg.rc += tag(c); h.cards.push(c); if (h.isSplitAce) { h.done = true; return advance(cg); } }
  return null;
}

/* ------------------------------ coach lookup ------------------------------ */
export function coachUpKey(dUp) { return dUp === 11 ? "A" : dUp === 10 ? "T" : String(dUp); }
export function coachAdvice(cards, dUp, canDouble, canSplit, canSurrender) {
  const uk = coachUpKey(dUp);
  const t = handTotal(cards);
  if (t.total > 21) return [];
  const totKey = (t.soft ? "S" : "H") + t.total;
  const base = (EVDATA[totKey] || {})[uk];
  if (!base) return [];
  const out = [];
  if (base.S) out.push({ a: "S", ev: base.S[0], sd: base.S[1] });
  if (base.H && t.total < 21) out.push({ a: "H", ev: base.H[0], sd: base.H[1] });
  if (canDouble && base.D) out.push({ a: "D", ev: base.D[0], sd: base.D[1] });
  if (canSurrender && base.R) out.push({ a: "R", ev: base.R[0], sd: base.R[1] });
  if (canSplit && splittable(cards)) {
    const v = cards[0].val, pk = "P" + (v === "A" ? "A" : v === 10 ? "T" : v);
    const p = (EVDATA[pk] || {})[uk];
    if (p && p.P) out.push({ a: "P", ev: p.P[0], sd: p.P[1] });
  }
  out.sort((x, y) => y.ev - x.ev);
  return out;
}
