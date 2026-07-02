import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   Blackjack Trainer — basic strategy + Hi-Lo card counting
   Full Game: 6-deck shuffled shoe, plays every hand out, live
   running/true count (counts only cards a real player would SEE),
   count-graded insurance + Illustrious 18 deviations, and a
   coaching panel that explains the WHY behind every play.
   Strategy + counting math cross-checked vs wizardofodds.com.
   ============================================================ */

const C = {
  bg: "#0a0e0c", panel: "#111a16", panel2: "#0d1310", border: "#20302a",
  ink: "#e8efeb", sub: "#8aa79b", gold: "#e8b64c", felt: "#0e5a41", feltDark: "#093b2c",
  hit: "#f59e0b", stand: "#fb5b6b", double: "#38bdf8", split: "#34d399",
};
const MOVE = { H: { label: "Hit", color: C.hit }, S: { label: "Stand", color: C.stand }, D: { label: "Double", color: C.double }, P: { label: "Split", color: C.split } };
const DEALER = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
/* Dealer bust % by up card — 6-deck, dealer hits soft 17 (Wizard of Odds). */
const BUST = { "2": 36, "3": 38, "4": 40, "5": 42, "6": 44, "7": 26, "8": 24, "9": 23, "10": 21, "A": 14 };

const TABLES = {
  american: {
    label: "American — dealer peeks, hits soft 17",
    hard: [["5–8","HHHHHHHHHH"],["9","HDDDDHHHHH"],["10","DDDDDDDDHH"],["11","DDDDDDDDDD"],["12","HHSSSHHHHH"],["13–16","SSSSSHHHHH"],["17–21","SSSSSSSSSS"]],
    soft: [["A,2 / A,3","HHHDDHHHHH"],["A,4 / A,5","HHDDDHHHHH"],["A,6","HDDDDHHHHH"],["A,7","DDDDDSSHHH"],["A,8","SSSSDSSSSS"],["A,9 / A,10","SSSSSSSSSS"]],
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

/* ------------------------------ helpers ------------------------------ */
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const signed = (n) => (n >= 0 ? "+" : "") + n;
const SUITS = [{ s: "♠", red: false }, { s: "♣", red: false }, { s: "♥", red: true }, { s: "♦", red: true }];
const RANKS = [["A", "A"], ["2", 2], ["3", 3], ["4", 4], ["5", 5], ["6", 6], ["7", 7], ["8", 8], ["9", 9], ["10", 10], ["J", 10], ["Q", 10], ["K", 10]];
function faceFor(v) { if (v === "A") return "A"; if (v === 10) return pick(["10", "J", "Q", "K"]); return String(v); }
function makeCard(v) { const su = pick(SUITS); return { rank: faceFor(v), red: su.red, suit: su.s, val: v }; }
function baseVal(c) { return c.val === "A" ? 11 : c.val; }
function tag(c) { if (c.val === "A" || c.val === 10) return -1; if (c.val >= 2 && c.val <= 6) return 1; return 0; }
function handTotal(cards) { let sum = 0, a = 0; for (const c of cards) { if (c.val === "A") { a++; sum += 11; } else sum += c.val; } while (sum > 21 && a > 0) { sum -= 10; a--; } return { total: sum, soft: a > 0 }; }
function splittable(cards) { return cards.length === 2 && cards[0].val === cards[1].val; }
function pairKey(cards) { const v = cards[0].val; if (v === "A") return "A,A"; if (v === 10) return "10,10"; if (v === 2 || v === 3) return "2,2 / 3,3"; return v + "," + v; }
function softKey(t) { if (t <= 14) return "A,2 / A,3"; if (t <= 16) return "A,4 / A,5"; if (t === 17) return "A,6"; if (t === 18) return "A,7"; if (t === 19) return "A,8"; return "A,9 / A,10"; }
function hardKey(t) { if (t <= 8) return "5–8"; if (t === 9) return "9"; if (t === 10) return "10"; if (t === 11) return "11"; if (t === 12) return "12"; if (t <= 16) return "13–16"; return "17–21"; }
function dIdx(d) { return d === 11 ? 9 : d - 2; }
function basicOptimal(cards, dUp, canDouble, canSplit) {
  const i = dIdx(dUp);
  if (canSplit && splittable(cards)) { const L = AMP[pairKey(cards)][i]; return L === "D" && !canDouble ? "H" : L; }
  const { total, soft } = handTotal(cards);
  if (soft && total >= 13 && total <= 21) { let L = AMS[softKey(total)][i]; if (L === "D" && !canDouble) L = total >= 18 ? "S" : "H"; return L; }
  if (soft && total < 13) return "H";
  let L = AMH[hardKey(total)][i]; if (L === "D" && !canDouble) L = "H"; return L;
}
/* Illustrious-18 deviations (Hi-Lo, 6-deck). Stand/double/split if TC >= index, else basicAlt. */
function deviationFor(cards, dUp, canSplit) {
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
function getPlay(cards, dUp, canDouble, canSplit, tcFloor, useDev) {
  const basic = basicOptimal(cards, dUp, canDouble, canSplit);
  if (!useDev) return { move: basic, isDeviation: false, rec: null, basic };
  const rec = deviationFor(cards, dUp, canSplit);
  if (!rec) return { move: basic, isDeviation: false, rec: null, basic };
  let move = tcFloor >= rec.index ? rec.action : rec.basicAlt;
  if (move === "D" && !canDouble) move = "H";
  if (move === "P" && !canSplit) move = "S";
  return { move, isDeviation: move !== basic, rec, basic };
}
function handDesc(cards) { if (splittable(cards)) { const v = cards[0].val; if (v === "A") return "A,A"; if (v === 10) return cards[0].rank + "," + cards[1].rank; return v + "," + v; } const t = handTotal(cards); return (t.soft ? "soft " : "") + t.total; }
function totalStr(cards) { const t = handTotal(cards); if (t.total > 21) return "BUST"; return (t.soft && t.total < 21 ? "soft " : "") + t.total; }
function buildShoe() { const s = []; for (let d = 0; d < 6; d++) for (const su of SUITS) for (const [rank, val] of RANKS) s.push({ rank, val, suit: su.s, red: su.red }); for (let i = s.length - 1; i > 0; i--) { const j = rnd(i + 1);[s[i], s[j]] = [s[j], s[i]]; } return s; }
function drawFrom(cg) { if (cg.shoe.length === 0) cg.shoe = buildShoe(); return cg.shoe.pop(); }
const edgePct = (tc) => 0.5 * tc - 0.5;
function suggestedUnits(tc) { const f = Math.floor(tc); if (f <= 1) return 1; if (f === 2) return 2; if (f === 3) return 4; if (f === 4) return 6; if (f === 5) return 8; return 12; }

/* --------- reason engine for basic-strategy plays --------- */
function reasonFor(sc) {
  const { catKey, label, dealer, correct, isSoft } = sc;
  if (catKey === "pairs") {
    if (label === "A,A") return correct === "P" ? "Two aces together are only a soft 12. Split them — each ace starts a hand with a big shot at 21." : "No-Hole-Card: splitting aces into a 10/Ace risks losing both bets to a dealer blackjack, so just hit.";
    if (label === "8,8") return correct === "P" ? "A pair of 8s is 16 — the worst hand in the game. Splitting turns one terrible hand into two starting on 8. Always." : "No-Hole-Card exception: vs 10/Ace the dealer may have blackjack, so don't double your exposure — hit.";
    if (label === "10,10") return "20 is a near-lock winner. Never break it up chasing two weaker hands — stand.";
    if (label === "5,5") return "A pair of 5s is really a 10, a great doubling total. Never split it.";
    if (label === "9,9" && correct === "S") return "You already hold 18. Vs a 7 the dealer likely has 17, and vs 10/Ace splitting into strength is worse — stand.";
    if (correct === "P") return `The dealer's ${dealer} is weak and bust-prone. Split to get more money out against a hand that often busts.`;
    return `Splitting vs a ${dealer} loses value — play it as one hand and ${MOVE[correct].label.toLowerCase()}.`;
  }
  if (correct === "S") {
    if (catKey === "hard" && /12|13|14|15|16/.test(label)) return `Your 12–16 is a "stiff" — one card can bust you. The dealer's ${dealer} is weak and likely to bust, so stand and let them take the risk.`;
    if (isSoft) return "A strong made hand (soft 19+). Drawing only risks turning a winner into a loser — stand.";
    return "You already hold 17+. Hitting only risks busting a made hand. Stand.";
  }
  if (correct === "H") {
    if (catKey === "hard" && /12|13|14|15|16/.test(label)) return `Assume the dealer's hidden card is a 10, so a ${dealer} up likely means 17+. A stiff loses if you stand — hit and try to improve.`;
    if (isSoft) return "A soft hand can't bust on the next card and isn't strong enough to stand — take the free card.";
    return "Too low to stand, dealer not weak enough to double into — just hit.";
  }
  if (correct === "D") {
    if (label === "11") return "11 is the premier doubling total — one card often makes 20–21 and the dealer is beatable. Get more money out.";
    if (label === "10") return "10 doubles vs everything except a 10/Ace: you draw to 20 far more than you bust.";
    if (label === "9") return "9 doubles only vs the dealer's weak 3–6, where their bust risk pays off.";
    if (label === "5,5") return "Play the pair of 5s as a 10 and double — never split it.";
    if (isSoft) return `Soft hand: can't bust on one card, and the dealer's weak ${dealer} makes putting out more money +EV. Double (else hit).`;
    return "The math favors putting more money out here. Double.";
  }
  return "";
}
function explainPlay(cards, dUp, correct, isDev, rec, tcFloor, canSplit) {
  const dStr = dUp === 11 ? "A" : String(dUp);
  if (isDev && rec) {
    const above = tcFloor >= rec.index;
    const dir = rec.action === "S" ? "stand — a ten-rich shoe means the dealer busts more on a stiff and you bust less" : rec.action === "D" ? "double — you'll draw a ten to a strong total far more often" : "split — each new hand becomes a likely 20 when tens are rich";
    if (above) return `${rec.label} vs ${dStr}: this is a count deviation. Basic strategy would ${MOVE[rec.basicAlt].label.toLowerCase()}, but the true count is ${signed(rec.index)} or higher, so you ${dir}. You're at TC ${signed(tcFloor)} → ${MOVE[correct].label}. (Illustrious 18, index ${signed(rec.index)}.)`;
    return `${rec.label} vs ${dStr}: there's a deviation here at TC ${signed(rec.index)}+, but you're only at TC ${signed(tcFloor)}, so you stick with basic strategy — ${MOVE[correct].label}.`;
  }
  let catKey, label, isSoft = false;
  if (canSplit && splittable(cards)) { catKey = "pairs"; const v = cards[0].val; label = v === "A" ? "A,A" : v === 10 ? "10,10" : v + "," + v; }
  else { const t = handTotal(cards); if (t.soft && t.total >= 13 && t.total <= 21) { catKey = "soft"; label = softKey(t.total); isSoft = true; } else { catKey = "hard"; label = hardKey(t.total); } }
  return reasonFor({ catKey, label, dealer: dStr, correct, isSoft });
}

/* ------------------------------ Card UI ------------------------------ */
function PlayingCard({ card, hidden, small, tagVal }) {
  const w = small ? 38 : 52, h = small ? 54 : 74;
  if (hidden) return <div style={{ width: w, height: h, borderRadius: 8, background: "repeating-linear-gradient(45deg,#122,#122 5px,#1b3a52 5px,#1b3a52 10px)", border: "1px solid #2b4a63" }} />;
  const showTag = tagVal !== undefined && tagVal !== null;
  const tCol = tagVal > 0 ? C.split : tagVal < 0 ? C.stand : C.sub;
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: 8, background: "#f7f7f2", border: "1px solid #d8d8cf", boxShadow: "0 3px 8px rgba(0,0,0,.45)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: small ? 3 : 5 }}>
      <span style={{ fontWeight: 800, fontSize: small ? 13 : 17, lineHeight: 1, color: card.red ? "#c62828" : "#151515" }}>{card.rank}</span>
      <span style={{ textAlign: "center", fontSize: small ? 15 : 20, color: card.red ? "#c62828" : "#151515" }}>{card.suit}</span>
      <span style={{ alignSelf: "flex-end", fontWeight: 800, fontSize: small ? 13 : 17, lineHeight: 1, transform: "rotate(180deg)", color: card.red ? "#c62828" : "#151515" }}>{card.rank}</span>
      {showTag && <span style={{ position: "absolute", top: -7, right: -7, background: tCol, color: "#0a0e0c", fontWeight: 800, fontSize: 9, borderRadius: 5, padding: "1px 4px", fontFamily: "'IBM Plex Mono',monospace" }}>{tagVal > 0 ? "+1" : tagVal < 0 ? "−1" : "0"}</span>}
    </div>
  );
}

/* ============================= FLASHCARD builder ============================= */
const HARD_TOTALS = { "5–8": [5, 6, 7, 8], "9": [9], "10": [10], "11": [11], "10–11": [10, 11], "12": [12], "13–16": [13, 14, 15, 16], "17–21": [17, 18, 19] };
function hardCards(total) { for (let i = 0; i < 200; i++) { const a = 2 + rnd(9), b = total - a; if (b >= 2 && b <= 10 && b !== a) return [makeCard(a), makeCard(b)]; } return [makeCard(10), makeCard(total - 10)]; }
function buildScenario(ruleSet, cats) {
  const enabled = ["hard", "soft", "pairs"].filter((c) => cats[c]);
  const catKey = pick(enabled.length ? enabled : ["hard", "soft", "pairs"]);
  const [label, cells] = pick(TABLES[ruleSet][catKey]);
  const di = rnd(10), dealer = DEALER[di], correct = cells[di];
  let cards, isPair = false, isSoft = false;
  if (catKey === "hard") cards = hardCards(pick(HARD_TOTALS[label]));
  else if (catKey === "soft") { let x; if (label.includes("A,2")) x = pick([2, 3]); else if (label.includes("A,4")) x = pick([4, 5]); else if (label.includes("A,6")) x = 6; else if (label.includes("A,7")) x = 7; else if (label.includes("A,8")) x = 8; else x = pick([9, 10]); cards = [makeCard("A"), makeCard(x)]; isSoft = true; }
  else { let r; if (label.includes("2,2")) r = pick([2, 3]); else if (label === "A,A") r = "A"; else r = parseInt(label, 10); cards = [makeCard(r), makeCard(r)]; isPair = true; }
  return { catKey, label, dealer, dealerCard: makeCard(dealer === "A" ? "A" : parseInt(dealer, 10)), correct, cards, isPair, isSoft };
}

/* =============================== APP =============================== */
const INIT_G = { phase: "idle", shoe: [], hands: [], dealer: [], log: [], dealerRevealed: false, active: 0, message: "", roundNet: 0, roundFlawedWon: 0, rc: 0, bet: 1, insNet: 0, coach: null, shuffled: false };
const INIT_AGG = { rounds: 0, handsWon: 0, handsLost: 0, handsPush: 0, decisions: 0, correct: 0, flawedHands: 0, flawedWon: 0, net: 0, countDecisions: 0, countCorrect: 0 };
const CUT = 60; // reshuffle when fewer than ~1.15 decks remain (≈80% penetration)

export default function App() {
  const [tab, setTab] = useState("learn");
  const [ruleSet, setRuleSet] = useState("american");
  const [drillMode, setDrillMode] = useState("cards");
  const [cats, setCats] = useState({ hard: true, soft: true, pairs: true });
  const [sc, setSc] = useState(null);
  const [answered, setAnswered] = useState(null);
  const [stats, setStats] = useState({ total: 0, correct: 0, streak: 0, best: 0 });
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);
  const [cellInfo, setCellInfo] = useState(null);
  // full game
  const [g, setG] = useState(INIT_G);
  const [agg, setAgg] = useState(INIT_AGG);
  const [useDev, setUseDev] = useState(true);
  const [betWithCount, setBetWithCount] = useState(false);
  const [showTags, setShowTags] = useState(true);
  const [hideCount, setHideCount] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [primer, setPrimer] = useState(false);

  const deal = useCallback(() => { setAnswered(null); setSc(buildScenario(ruleSet, cats)); }, [ruleSet, cats]);
  useEffect(() => { deal(); }, [deal]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function answer(choice) {
    if (answered) return;
    const ok = choice === sc.correct;
    setAnswered({ choice, correct: ok });
    setStats((p) => { const streak = ok ? p.streak + 1 : 0; return { total: p.total + 1, correct: p.correct + (ok ? 1 : 0), streak, best: Math.max(p.best, streak) }; });
    if (ok && auto) { clearTimeout(timer.current); timer.current = setTimeout(deal, 750); }
  }

  /* ---------------- count helpers (live) ---------------- */
  const decksRem = g.shoe.length / 52;
  const tc = g.shoe.length ? g.rc / decksRem : 0;
  const tcFloor = Math.floor(tc);
  const countVisible = !hideCount || reveal;

  /* ---------------- full game engine ---------------- */
  function finalizeOpening(cg) {
    const du = cg.dealer[0], dh = cg.dealer[1], dUp = baseVal(du);
    const peeks = dUp === 11 || dUp === 10;
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
      const h = cg.hands[0]; h.result = "win"; h.bet = cg.bet * 1.5; cg.dealerRevealed = false; cg.phase = "done"; cg.message = "Blackjack! Paid 3:2."; cg.roundNet = cg.bet * 1.5 + insNet;
      return { won: 1, lost: 0, push: 0, flawed: 0, flawedWon: 0, net: cg.roundNet };
    }
    cg.phase = "player"; cg.active = 0; cg.insNet = insNet; return null;
  }
  function resolveRound(cg) {
    const live = cg.hands.some((h) => handTotal(h.cards).total <= 21);
    if (live) {
      cg.dealerRevealed = true; cg.rc += tag(cg.dealer[1]);
      let guard = 0; while (guard++ < 20) { const { total, soft } = handTotal(cg.dealer); if (total < 17 || (total === 17 && soft)) { const c = drawFrom(cg); cg.rc += tag(c); cg.dealer.push(c); } else break; }
    } else cg.dealerRevealed = false;
    const dT = handTotal(cg.dealer).total, dBust = dT > 21;
    let won = 0, lost = 0, push = 0, flawed = 0, flawedWon = 0, net = 0;
    for (const h of cg.hands) {
      const pT = handTotal(h.cards).total; let res;
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
  function advance(cg) {
    const next = cg.hands.findIndex((h) => !h.done);
    if (next === -1) return resolveRound(cg);
    cg.active = next; const h = cg.hands[next];
    if (h.cards.length === 1) { const c = drawFrom(cg); cg.rc += tag(c); h.cards.push(c); if (h.isSplitAce) { h.done = true; return advance(cg); } }
    return null;
  }

  function dealNewRound() {
    let shoe = g.shoe.length < CUT ? buildShoe() : [...g.shoe];
    const shuffled = g.shoe.length < CUT;
    const rc0 = shuffled ? 0 : g.rc;
    const tcBet = shoe.length ? rc0 / (shoe.length / 52) : 0;
    const bet = betWithCount ? suggestedUnits(tcBet) : 1;
    const cg = { ...INIT_G, shoe, rc: rc0, bet, shuffled };
    const p0 = drawFrom(cg), du = drawFrom(cg), p1 = drawFrom(cg), dh = drawFrom(cg);
    cg.rc += tag(p0) + tag(p1) + tag(du);
    cg.dealer = [du, dh];
    cg.hands = [{ cards: [p0, p1], bet, done: false, doubled: false, mistakes: 0, isSplitAce: false, result: null }];
    setReveal(false);
    if (baseVal(du) === 11) { cg.phase = "insurance"; setG(cg); return; }
    const S = finalizeOpening(cg);
    setG(cg);
    if (S) setAgg((a) => ({ ...a, rounds: a.rounds + 1, handsWon: a.handsWon + S.won, handsLost: a.handsLost + S.lost, handsPush: a.handsPush + S.push, net: a.net + S.net }));
  }

  function resolveInsurance(take) {
    if (g.phase !== "insurance") return;
    const cg = { ...g, shoe: [...g.shoe], dealer: [...g.dealer], log: [...g.log], hands: g.hands.map((h) => ({ ...h, cards: [...h.cards] })) };
    const itc = Math.floor(cg.rc / (cg.shoe.length / 52));
    const correctTake = itc >= 3;
    const dealerBJ = handTotal(cg.dealer).total === 21;
    cg.insNet = take ? (dealerBJ ? cg.bet : -cg.bet / 2) : 0;
    const insOK = take === correctTake;
    cg.coach = { ok: insOK, ins: true, text: `Insurance wins only if the dealer's hole card is a ten. That's +EV only when the shoe is ten-rich — true count +3 or higher (at +3 the chance of a ten in the hole passes 1 in 3). You're at TC ${signed(itc)}, so the correct play was ${correctTake ? "TAKE" : "DECLINE"}. You ${take ? "took" : "declined"} it.` };
    const S = finalizeOpening(cg);
    setG(cg);
    setAgg((a) => {
      const na = { ...a, countDecisions: a.countDecisions + 1, countCorrect: a.countCorrect + (insOK ? 1 : 0) };
      if (S) { na.rounds += 1; na.handsWon += S.won; na.handsLost += S.lost; na.handsPush += S.push; na.net += S.net; }
      return na;
    });
  }

  function playerAct(action) {
    if (g.phase !== "player") return;
    const cg = { ...g, shoe: [...g.shoe], dealer: [...g.dealer], log: [...g.log], hands: g.hands.map((h) => ({ ...h, cards: [...h.cards] })) };
    const idx = cg.active, h = cg.hands[idx], dUp = baseVal(cg.dealer[0]);
    const canDouble = h.cards.length === 2, canSplit = h.cards.length === 2 && splittable(h.cards) && cg.hands.length < 4 && !h.isSplitAce;
    if (action === "P" && !canSplit) return;
    if (action === "D" && !canDouble) return;
    const mtc = Math.floor(cg.rc / (cg.shoe.length / 52));
    const play = getPlay(h.cards, dUp, canDouble, canSplit, mtc, useDev);
    const ok = action === play.move;
    if (!ok) h.mistakes += 1;
    cg.coach = { ok, isDev: play.isDeviation, you: action, correct: play.move, text: explainPlay(h.cards, dUp, play.move, play.isDeviation, play.rec, mtc, canSplit) };
    cg.log.push({ hand: idx + 1, txt: handDesc(h.cards) + " vs " + cg.dealer[0].rank, you: action, want: play.move, ok, dev: play.isDeviation });
    let S = null;
    const drawV = () => { const c = drawFrom(cg); cg.rc += tag(c); return c; };
    if (action === "H") { h.cards.push(drawV()); if (handTotal(h.cards).total > 21) { h.done = true; S = advance(cg); } }
    else if (action === "S") { h.done = true; S = advance(cg); }
    else if (action === "D") { h.bet *= 2; h.doubled = true; h.cards.push(drawV()); h.done = true; S = advance(cg); }
    else if (action === "P") {
      const [c0, c1] = h.cards, isA = c0.val === "A";
      const A = { cards: [c0], bet: cg.bet, done: false, doubled: false, mistakes: h.mistakes, isSplitAce: isA, result: null };
      const B = { cards: [c1], bet: cg.bet, done: false, doubled: false, mistakes: 0, isSplitAce: isA, result: null };
      if (isA) { A.cards.push(drawV()); A.done = true; cg.hands.splice(idx, 1, A, B); S = advance(cg); }
      else { A.cards.push(drawV()); cg.hands.splice(idx, 1, A, B); cg.active = idx; }
    }
    setG(cg);
    setAgg((a) => {
      const na = { ...a, decisions: a.decisions + 1, correct: a.correct + (ok ? 1 : 0) };
      if (play.isDeviation) { na.countDecisions = a.countDecisions + 1; na.countCorrect = a.countCorrect + (ok ? 1 : 0); }
      if (S) { na.rounds += 1; na.handsWon += S.won; na.handsLost += S.lost; na.handsPush += S.push; na.flawedHands += S.flawed; na.flawedWon += S.flawedWon; na.net += S.net; }
      return na;
    });
  }

  const acc = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
  const gAcc = agg.decisions ? Math.round((agg.correct / agg.decisions) * 100) : 0;
  const cAcc = agg.countDecisions ? Math.round((agg.countCorrect / agg.countDecisions) * 100) : 0;
  const flawedRate = agg.flawedHands ? Math.round((agg.flawedWon / agg.flawedHands) * 100) : 0;

  const tabBtn = (id, txt) => <button onClick={() => setTab(id)} style={{ padding: "8px 14px", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: tab === id ? C.gold : "transparent", color: tab === id ? "#0a0e0c" : C.sub }}>{txt}</button>;
  const catBtn = (id, txt) => <button onClick={() => setCats((p) => { const n = { ...p, [id]: !p[id] }; return (!n.hard && !n.soft && !n.pairs) ? p : n; })} style={{ padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, border: `1px solid ${cats[id] ? C.split : C.border}`, background: cats[id] ? "rgba(52,211,153,.14)" : "transparent", color: cats[id] ? C.split : C.sub }}>{txt}</button>;
  const fcButtons = sc ? (sc.isPair ? ["H", "S", "D", "P"] : ["H", "S", "D"]) : [];
  const toggle = (on, set, txt) => <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: C.sub }}><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />{txt}</label>;

  const gActive = g.hands[g.active];
  const gCanDouble = g.phase === "player" && gActive && gActive.cards.length === 2;
  const gCanSplit = g.phase === "player" && gActive && gActive.cards.length === 2 && splittable(gActive.cards) && g.hands.length < 4 && !gActive.isSplitAce;
  const gCanHit = g.phase === "player" && gActive && handTotal(gActive.cards).total <= 21;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'Space Grotesk',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@500;700&display=swap');
        :root{color-scheme:dark;} *{box-sizing:border-box;}
        button:active{transform:translateY(1px);} button:disabled{cursor:not-allowed;}
        .mono{font-family:'IBM Plex Mono',monospace;}
      `}</style>

      <header className="sticky top-0 z-20" style={{ background: C.panel, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }} className="px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-bold tracking-tight" style={{ fontSize: 18 }}><span style={{ color: C.gold }}>21</span> · Strategy &amp; Counting Trainer</div>
              <div className="text-xs" style={{ color: C.sub }}>Learn the chart, count the shoe, understand every play</div>
            </div>
            <div className="flex rounded-full p-1" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
              {["american", "european"].map((r) => <button key={r} onClick={() => setRuleSet(r)} style={{ padding: "5px 11px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, textTransform: "capitalize", background: ruleSet === r ? C.felt : "transparent", color: ruleSet === r ? "#fff" : C.sub }}>{r}</button>)}
            </div>
          </div>
          <div className="flex gap-1 mt-2">{tabBtn("learn", "Learn")}{tabBtn("chart", "Chart")}{tabBtn("drill", "Drill")}</div>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto" }} className="px-4 py-4 pb-16">

        {/* ------------------------- LEARN ------------------------- */}
        {tab === "learn" && (
          <div>
            <Section title="The whole game in 20 seconds">You and the dealer each try to get closer to <b>21</b> than the other without going over. Cards = face value, J/Q/K = 10, Ace = 11 <i>or</i> 1. You see both your cards and one dealer card. The dealer has <b>no choices</b> — hit until 17+ then stop. That fixed behavior is what makes the game solvable.</Section>
            <Section title="Your four moves"><Bullet c={C.hit} k="Hit">Take another card.</Bullet><Bullet c={C.stand} k="Stand">Stop and keep your total.</Bullet><Bullet c={C.double} k="Double">Double the bet, take <b>one</b> more card, stop.</Bullet><Bullet c={C.split} k="Split">Only with a pair — two hands, one bet each.</Bullet></Section>
            <Section title="The one idea behind the chart">Assume the dealer's hidden card is a 10 (a third of the deck is ten-value). Dealer showing <b>2–6</b> → likely to bust, so you stand on stiffs and press bets. Dealer showing <b>7–Ace</b> → likely 17+, so you hit your stiffs. The Chart tab shows the real bust rates.</Section>
            <Section title="Then learn to count">Basic strategy only makes you lose slowly (~0.5%). The edge comes from <b>counting</b>: track high vs low cards, bet more and deviate when the shoe is ten-rich. The Drill → <b>Full game</b> tab has a live running/true count and grades your count-based plays. Start there once the chart is automatic.</Section>
            <Section title="Money rules"><div className="grid gap-1.5"><Rule><b>Never take insurance</b> unless you're counting and the true count is +3 or higher.</Rule><Rule>Only play <b>3:2</b> tables — 6:5 roughly triples the house edge.</Rule><Rule>Counting only pays with a <b>bet spread</b>; flat-betting a count just breaks even at best.</Rule></div></Section>
            <div className="rounded-lg p-3 mt-4 text-xs" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.sub }}>Sources: basicstrategy.app · wizardofodds.com (basic strategy, Hi-Lo, Illustrious 18) · blackjackapprenticeship.com. Verify table rules before you sit.</div>
          </div>
        )}

        {/* ------------------------- CHART ------------------------- */}
        {tab === "chart" && (
          <div>
            <div className="text-sm mb-3" style={{ color: C.ink }}>Rows = your hand, columns = the dealer's up card. The chart is the optimal response to how often the dealer busts — here's that bust rate, the engine underneath every cell:</div>
            <DealerBustStrip />
            <div className="text-xs mb-4 rounded-lg p-3" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.sub }}>See the cliff: a <b style={{ color: C.split }}>6 busts ~44%</b>, a <b style={{ color: C.stand }}>7 only ~26%</b>. That 18-point drop is why most stand/hit decisions flip between the dealer's 6 and 7. <span>(6 decks, hits soft 17 — Wizard of Odds.)</span></div>
            <div className="text-xs mb-2" style={{ color: C.sub }}>Tap any cell to see <i>why</i>.</div>
            <Legend />
            <ChartBlock title="Hard totals" rows={TABLES[ruleSet].hard} onCell={(l, d, ch) => setCellInfo({ label: l, dealer: d, correct: ch, catKey: "hard", isSoft: false, isPair: false })} />
            <ChartBlock title="Soft totals (ace as 11)" rows={TABLES[ruleSet].soft} onCell={(l, d, ch) => setCellInfo({ label: l, dealer: d, correct: ch, catKey: "soft", isSoft: true, isPair: false })} />
            <ChartBlock title="Pairs" rows={TABLES[ruleSet].pairs} onCell={(l, d, ch) => setCellInfo({ label: l, dealer: d, correct: ch, catKey: "pairs", isSoft: false, isPair: true })} />
            {cellInfo && (
              <div className="rounded-lg p-3" style={{ background: C.panel, border: `1px solid ${MOVE[cellInfo.correct].color}` }}>
                <div className="flex items-center gap-2 mb-1"><span className="mono text-sm" style={{ color: C.ink }}>{cellInfo.label} vs {cellInfo.dealer}</span><span style={{ background: MOVE[cellInfo.correct].color, color: "#0a0e0c", fontWeight: 800, fontSize: 12, padding: "2px 8px", borderRadius: 5 }}>{MOVE[cellInfo.correct].label}</span><span className="text-xs" style={{ color: C.sub }}>· dealer busts {BUST[cellInfo.dealer]}%</span></div>
                <div className="text-sm" style={{ color: C.sub }}>{reasonFor(cellInfo)}</div>
              </div>
            )}
            <div className="rounded-lg p-3 mt-4 text-xs" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.sub }}><b style={{ color: C.gold }}>American vs European:</b> under European No-Hole-Card the dealer draws only after you act, so you avoid doubling/splitting into a possible dealer blackjack — flipping five cells (11 vs 10/A, 8,8 vs 10/A, A,A vs A, and soft 18/19 doubles).</div>
          </div>
        )}

        {/* ------------------------- DRILL ------------------------- */}
        {tab === "drill" && (
          <div>
            <div className="flex rounded-full p-1 mb-4" style={{ background: C.panel2, border: `1px solid ${C.border}`, width: "fit-content" }}>
              {[["cards", "Flashcards"], ["game", "Full game + count"]].map(([id, t]) => <button key={id} onClick={() => setDrillMode(id)} style={{ padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: drillMode === id ? C.gold : "transparent", color: drillMode === id ? "#0a0e0c" : C.sub }}>{t}</button>)}
            </div>

            {/* -------- FLASHCARDS -------- */}
            {drillMode === "cards" && sc && (
              <div>
                <div className="text-xs mb-3" style={{ color: C.sub }}>One decision at a time — pure basic strategy reps to burn the chart into memory.</div>
                <div className="grid grid-cols-3 gap-2 mb-3"><Stat label="Accuracy" value={`${acc}%`} sub={`${stats.correct}/${stats.total}`} color={C.gold} /><Stat label="Streak" value={stats.streak} sub={`best ${stats.best}`} color={C.split} /><Stat label="Playing" value={sc.dealer} sub="dealer shows" color={C.double} /></div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2"><div className="flex gap-1.5">{catBtn("hard", "Hard")}{catBtn("soft", "Soft")}{catBtn("pairs", "Pairs")}</div>{toggle(auto, setAuto, "Auto-deal on correct")}</div>
                <div className="rounded-2xl p-4 mb-3" style={{ background: `radial-gradient(ellipse at center, ${C.felt}, ${C.feltDark})`, border: `1px solid ${C.border}` }}>
                  <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,.6)" }}>Dealer</div>
                  <div className="flex gap-2 mb-4"><PlayingCard card={sc.dealerCard} /><PlayingCard hidden /></div>
                  <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,.6)" }}>You</div>
                  <div className="flex gap-2">{sc.cards.map((c, i) => <PlayingCard key={i} card={c} />)}</div>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: fcButtons.length === 4 ? "1fr 1fr" : "1fr 1fr 1fr" }}>
                  {fcButtons.map((k) => { const chosen = answered && answered.choice === k, right = answered && sc.correct === k; let ring = "transparent"; if (answered) { if (right) ring = C.split; else if (chosen) ring = C.stand; } return <button key={k} onClick={() => answer(k)} style={{ padding: "14px 0", borderRadius: 12, cursor: answered ? "default" : "pointer", fontWeight: 800, fontSize: 15, color: "#0a0e0c", background: MOVE[k].color, opacity: answered && !right && !chosen ? 0.4 : 1, outline: `3px solid ${ring}`, outlineOffset: 2, border: "none" }}>{MOVE[k].label}</button>; })}
                </div>
                {answered && (
                  <div className="rounded-lg p-3 mt-3" style={{ background: C.panel, border: `1px solid ${answered.correct ? C.split : C.stand}` }}>
                    <div className="flex items-center gap-2 mb-1"><span style={{ fontWeight: 800, color: answered.correct ? C.split : C.stand }}>{answered.correct ? "Correct" : "Not optimal"}</span><span className="mono text-xs" style={{ color: C.sub }}>{sc.label} vs {sc.dealer} →</span><span style={{ background: MOVE[sc.correct].color, color: "#0a0e0c", fontWeight: 800, fontSize: 12, padding: "2px 8px", borderRadius: 5 }}>{MOVE[sc.correct].label}</span></div>
                    <div className="text-sm" style={{ color: C.sub }}>{reasonFor(sc)}</div>
                    <button onClick={deal} style={{ marginTop: 10, padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer", background: C.gold, color: "#0a0e0c", fontWeight: 800, fontSize: 13 }}>Next hand →</button>
                  </div>
                )}
                {!answered && <div className="text-center text-xs mt-3" style={{ color: C.sub }}>What's the correct basic-strategy play?</div>}
              </div>
            )}

            {/* -------- FULL GAME + COUNT -------- */}
            {drillMode === "game" && (
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="text-xs" style={{ color: C.sub }}>6 decks · dealer peeks &amp; hits soft 17 · 3:2 · Hi-Lo</div>
                  <button onClick={() => { setG(INIT_G); setAgg(INIT_AGG); }} style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.sub, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Reset</button>
                </div>

                {/* Counting 101 */}
                <button onClick={() => setPrimer(!primer)} style={{ width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel2, color: C.gold, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>{primer ? "▾" : "▸"} Counting 101 — how the count works</button>
                {primer && (
                  <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.ink }}>
                    <p className="mb-2"><b style={{ color: C.gold }}>Hi-Lo tags:</b> low cards <b style={{ color: C.split }}>2–6 = +1</b>, neutral <b style={{ color: C.sub }}>7–9 = 0</b>, high cards <b style={{ color: C.stand }}>10–A = −1</b>. Add each card's tag as it's <i>shown</i> to get the <b>running count</b>. High cards left = good for you (more blackjacks, more dealer busts, better doubles).</p>
                    <p className="mb-2"><b style={{ color: C.gold }}>True count = running count ÷ decks remaining.</b> A +6 running count means little with 5 decks left but a lot with 1 deck left. Divide to normalize. Each +1 of true count ≈ +0.5% to your edge — you're roughly break-even around TC +1 and actually ahead above it.</p>
                    <p className="mb-1"><b style={{ color: C.gold }}>Then act on it:</b> bet more as the true count climbs, and make a few count-based plays (deviations). The cleanest: <b>take insurance at TC +3+</b>. This trainer only counts cards you'd really see — the dealer's hole card isn't counted until it's flipped.</p>
                    <p className="text-xs" style={{ color: C.sub }}>Hi-Lo values and the +3 insurance / Illustrious-18 indices per Wizard of Odds &amp; Schlesinger's Blackjack Attack.</p>
                  </div>
                )}

                {/* count panel */}
                <div className="rounded-xl p-3 mb-2" style={{ background: C.panel, border: `1px solid ${C.double}` }}>
                  <div className="flex items-center justify-between mb-2"><span className="text-xs" style={{ color: C.double, fontWeight: 700 }}>THE COUNT</span>{hideCount && <button onClick={() => setReveal((r) => !r)} style={{ padding: "3px 10px", borderRadius: 7, border: `1px solid ${C.double}`, background: "transparent", color: C.double, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{reveal ? "Hide" : "Reveal to check"}</button>}</div>
                  <div className="grid grid-cols-4 gap-2">
                    <MiniStat label="Running" value={countVisible ? signed(g.rc) : "•••"} color={C.ink} />
                    <MiniStat label="True" value={countVisible ? (g.shoe.length ? signed(Math.round(tc * 10) / 10) : "0") : "•••"} color={tc >= 2 ? C.split : tc <= -1 ? C.stand : C.ink} />
                    <MiniStat label="Decks left" value={g.shoe.length ? decksRem.toFixed(1) : "6.0"} color={C.sub} />
                    <MiniStat label="Est. edge" value={countVisible ? (g.shoe.length ? signed(Math.round(edgePct(tc) * 100) / 100) + "%" : "−0.5%") : "•••"} color={edgePct(tc) >= 0 ? C.split : C.stand} />
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                    <span className="text-xs" style={{ color: C.sub }}>Suggested bet at this count: <b className="mono" style={{ color: C.gold }}>{countVisible ? suggestedUnits(tc) + "u" : "•••"}</b> <span style={{ opacity: .7 }}>(1–12 spread)</span></span>
                  </div>
                </div>

                {/* toggles */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 px-1">
                  {toggle(showTags, setShowTags, "Show ±count tags on cards")}
                  {toggle(hideCount, setHideCount, "Hide count (test me)")}
                  {toggle(useDev, setUseDev, "Grade count deviations (I-18)")}
                  {toggle(betWithCount, setBetWithCount, "Bet with the count")}
                </div>

                {/* headline + stats */}
                <div className="rounded-xl p-3 mb-2" style={{ background: C.panel, border: `1px solid ${C.gold}` }}>
                  <div className="text-xs" style={{ color: C.sub }}>Hands you misplayed but still won</div>
                  <div className="flex items-end gap-2"><span className="mono" style={{ color: C.gold, fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{agg.flawedWon}/{agg.flawedHands}</span><span className="mono text-sm" style={{ color: C.sub, paddingBottom: 2 }}>{agg.flawedHands ? flawedRate + "% — variance covering mistakes" : "misplay a hand and see"}</span></div>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <Stat label="Strategy" value={`${gAcc}%`} sub={`${agg.decisions - agg.correct} miss`} color={C.split} />
                  <Stat label="Count plays" value={agg.countDecisions ? `${cAcc}%` : "—"} sub={`${agg.countDecisions} calls`} color={C.double} />
                  <Stat label="Net" value={(agg.net >= 0 ? "+" : "") + (Math.round(agg.net * 10) / 10)} sub={`${agg.rounds} rds`} color={agg.net >= 0 ? C.split : C.stand} />
                  <Stat label="Hands" value={`${agg.handsWon}-${agg.handsLost}-${agg.handsPush}`} sub="W-L-P" color={C.gold} />
                </div>

                {/* penetration */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1" style={{ color: C.sub }}><span>Shoe</span><span>{g.shoe.length ? g.shoe.length + " cards left" : "fresh 6-deck shoe"}</span></div>
                  <div style={{ height: 5, borderRadius: 3, background: C.panel2, overflow: "hidden" }}><div style={{ height: "100%", width: `${g.shoe.length ? Math.round(((312 - g.shoe.length) / 312) * 100) : 0}%`, background: C.felt }} /></div>
                </div>

                {/* felt */}
                <div className="rounded-2xl p-4 mb-3" style={{ background: `radial-gradient(ellipse at center, ${C.felt}, ${C.feltDark})`, border: `1px solid ${C.border}` }}>
                  <div className="flex items-center gap-2 mb-1"><span className="text-xs" style={{ color: "rgba(255,255,255,.6)" }}>Dealer</span>{g.dealerRevealed && g.dealer.length > 0 && <span className="mono text-xs" style={{ color: handTotal(g.dealer).total > 21 ? "#ffd7d7" : "#fff", fontWeight: 700 }}>{totalStr(g.dealer)}</span>}</div>
                  <div className="flex gap-2 mb-4" style={{ flexWrap: "wrap" }}>
                    {g.dealer.length === 0 ? <span className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>—</span> :
                      g.dealerRevealed ? g.dealer.map((c, i) => <PlayingCard key={i} card={c} small tagVal={showTags ? tag(c) : null} />) : <><PlayingCard card={g.dealer[0]} small tagVal={showTags ? tag(g.dealer[0]) : null} /><PlayingCard hidden small /></>}
                  </div>
                  <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,.6)" }}>You{g.hands.length > 1 ? ` · ${g.hands.length} hands` : ""}{g.bet !== 1 && g.phase !== "idle" ? ` · bet ${g.bet}u` : ""}</div>
                  <div className="flex gap-3" style={{ flexWrap: "wrap" }}>
                    {g.hands.length === 0 ? <span className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>Press Deal to start</span> :
                      g.hands.map((h, hi) => { const isActive = g.phase === "player" && hi === g.active; const rc = h.result === "win" ? C.split : h.result === "lose" ? C.stand : h.result === "push" ? C.gold : "transparent"; return (
                        <div key={hi} style={{ padding: 6, borderRadius: 10, outline: isActive ? `2px solid ${C.gold}` : h.result ? `2px solid ${rc}` : "2px solid transparent", outlineOffset: 1 }}>
                          <div className="flex gap-1.5">{h.cards.map((c, i) => <PlayingCard key={i} card={c} small tagVal={showTags ? tag(c) : null} />)}</div>
                          <div className="flex items-center gap-1.5 mt-1"><span className="mono text-xs" style={{ color: "#fff", fontWeight: 700 }}>{totalStr(h.cards)}</span>{h.doubled && <span className="text-xs" style={{ color: "rgba(255,255,255,.7)" }}>2x</span>}{h.result && <span style={{ background: rc, color: "#0a0e0c", fontWeight: 800, fontSize: 10, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase" }}>{h.result}</span>}</div>
                        </div>); })}
                  </div>
                </div>

                {/* insurance prompt / actions / deal */}
                {g.phase === "insurance" ? (
                  <div className="rounded-xl p-3 mb-1" style={{ background: C.panel, border: `1px solid ${C.double}` }}>
                    <div className="text-sm mb-2" style={{ color: C.ink }}><b style={{ color: C.double }}>Dealer shows an Ace.</b> Take insurance? {countVisible ? <span className="mono" style={{ color: C.sub }}>(TC {signed(tcFloor)})</span> : <span style={{ color: C.sub }}>— you're testing, so decide from your own count</span>}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => resolveInsurance(true)} style={{ padding: "12px 0", borderRadius: 12, border: "none", cursor: "pointer", background: C.double, color: "#0a0e0c", fontWeight: 800, fontSize: 14 }}>Take insurance</button>
                      <button onClick={() => resolveInsurance(false)} style={{ padding: "12px 0", borderRadius: 12, border: `1px solid ${C.border}`, cursor: "pointer", background: "transparent", color: C.ink, fontWeight: 800, fontSize: 14 }}>No insurance</button>
                    </div>
                  </div>
                ) : g.phase === "player" ? (
                  <div className="grid grid-cols-4 gap-2">
                    {[["H", gCanHit], ["S", gCanHit], ["D", gCanDouble], ["P", gCanSplit]].map(([k, on]) => <button key={k} disabled={!on} onClick={() => playerAct(k)} style={{ padding: "14px 0", borderRadius: 12, fontWeight: 800, fontSize: 14, color: "#0a0e0c", background: MOVE[k].color, opacity: on ? 1 : 0.28, border: "none", cursor: on ? "pointer" : "not-allowed" }}>{MOVE[k].label}</button>)}
                  </div>
                ) : (
                  <button onClick={dealNewRound} style={{ width: "100%", padding: "15px 0", borderRadius: 12, border: "none", cursor: "pointer", background: C.gold, color: "#0a0e0c", fontWeight: 800, fontSize: 15 }}>{g.phase === "idle" ? "Deal first hand" : "Deal next hand →"}</button>
                )}

                {/* coaching panel */}
                {g.coach && (
                  <div className="rounded-lg p-3 mt-3" style={{ background: C.panel, border: `1px solid ${g.coach.ok ? C.split : C.stand}` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontWeight: 800, color: g.coach.ok ? C.split : C.stand }}>{g.coach.ok ? "Correct" : "Learn this"}</span>
                      {g.coach.isDev && <span style={{ background: C.double, color: "#0a0e0c", fontWeight: 800, fontSize: 10, padding: "1px 7px", borderRadius: 4 }}>COUNT DEVIATION</span>}
                      {!g.coach.ins && !g.coach.ok && <span className="mono text-xs" style={{ color: C.sub }}>you {MOVE[g.coach.you].label} · chart {MOVE[g.coach.correct].label}</span>}
                    </div>
                    <div className="text-sm" style={{ color: C.sub }}>{g.coach.text}</div>
                  </div>
                )}

                {/* round result */}
                {g.phase === "done" && g.message && (
                  <div className="rounded-lg p-3 mt-3" style={{ background: C.panel2, border: `1px solid ${g.roundNet > 0 ? C.split : g.roundNet < 0 ? C.stand : C.border}` }}>
                    <div className="flex items-center gap-2"><span className="text-sm" style={{ color: C.ink }}>{g.message}</span><span className="mono text-sm" style={{ color: g.roundNet > 0 ? C.split : g.roundNet < 0 ? C.stand : C.sub, fontWeight: 700 }}>{g.roundNet > 0 ? "+" : ""}{Math.round(g.roundNet * 10) / 10}u</span></div>
                    {g.roundFlawedWon > 0 && <div className="text-xs mt-1" style={{ color: C.gold }}>You misplayed and still won — that's variance, not skill.</div>}
                  </div>
                )}

                {/* move log */}
                {g.log.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs mb-1" style={{ color: C.sub }}>This round — every move vs the correct play:</div>
                    <div className="rounded-lg p-2" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
                      {g.log.map((l, i) => <div key={i} className="flex items-center gap-2 text-xs py-0.5"><span style={{ color: l.ok ? C.split : C.stand, fontWeight: 800, width: 14 }}>{l.ok ? "✓" : "✗"}</span>{g.hands.length > 1 && <span style={{ color: C.sub }}>H{l.hand}</span>}<span className="mono" style={{ color: C.ink }}>{l.txt}</span><span style={{ color: C.sub }}>— you {MOVE[l.you].label}</span>{l.dev && <span style={{ color: C.double }}>[dev]</span>}{!l.ok && <span style={{ color: C.stand }}>→ {MOVE[l.want].label}</span>}</div>)}
                    </div>
                  </div>
                )}

                <div className="text-xs mt-3" style={{ color: C.sub }}>Practice loop: keep the running count in your head as cards come out (tags on the cards help at first — hide them once you're quick), convert to true count by dividing by decks left, size your bet, and take the count-based plays. Turn on "Hide count" to test yourself, then "Reveal to check." Every wrong move shows why the correct play is correct — read it, don't just note the ✗.</div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/* --------------------------- small UI bits --------------------------- */
function DealerBustStrip() {
  const max = 44;
  return (
    <div className="rounded-xl p-3 mb-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="text-xs mb-2" style={{ color: C.gold, fontWeight: 700 }}>Dealer bust % by up card</div>
      <div className="flex items-end justify-between gap-1" style={{ height: 96 }}>
        {DEALER.map((d) => { const v = BUST[d], col = v >= 35 ? C.split : v >= 25 ? C.hit : C.stand; return (
          <div key={d} className="flex flex-col items-center" style={{ flex: 1 }}>
            <span className="mono" style={{ fontSize: 10, color: col, fontWeight: 700 }}>{v}</span>
            <div style={{ width: "70%", height: `${(v / max) * 66}px`, background: col, borderRadius: "3px 3px 0 0", marginTop: 2 }} />
            <span className="mono" style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>{d}</span>
          </div>); })}
      </div>
    </div>
  );
}
function Legend() { return <div className="flex flex-wrap gap-2 mb-3">{["H", "S", "D", "P"].map((k) => <span key={k} className="flex items-center gap-1.5 text-xs" style={{ color: C.sub }}><span style={{ width: 14, height: 14, borderRadius: 3, background: MOVE[k].color, display: "inline-block" }} />{MOVE[k].label}</span>)}</div>; }
function ChartBlock({ title, rows, onCell }) {
  return (
    <div className="mb-5">
      <div className="text-sm font-semibold mb-1.5" style={{ color: C.gold }}>{title}</div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table style={{ borderCollapse: "separate", borderSpacing: 3 }}>
          <thead><tr><th style={{ minWidth: 62 }}></th>{DEALER.map((d) => <th key={d} className="text-xs" style={{ color: C.sub, fontWeight: 600, width: 26 }}>{d}</th>)}</tr></thead>
          <tbody>{rows.map(([label, cells]) => <tr key={label}><td className="text-xs pr-1 text-right" style={{ color: C.ink, whiteSpace: "nowrap", fontWeight: 600 }}>{label}</td>{cells.split("").map((ch, i) => <td key={i}><button onClick={() => onCell(label, DEALER[i], ch)} style={{ width: 26, height: 26, borderRadius: 5, border: "none", cursor: "pointer", background: MOVE[ch].color, color: "#0a0e0c", fontWeight: 800, fontSize: 12 }}>{ch}</button></td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
function Section({ title, children }) { return <div className="mb-5"><div className="font-semibold mb-1.5" style={{ color: C.gold, fontSize: 15 }}>{title}</div><div className="text-sm leading-relaxed" style={{ color: C.ink }}>{children}</div></div>; }
function Bullet({ c, k, children }) { return <div className="flex items-start gap-2 mb-1.5"><span style={{ background: c, color: "#0a0e0c", fontWeight: 800, fontSize: 11, padding: "2px 8px", borderRadius: 5, whiteSpace: "nowrap", marginTop: 1 }}>{k}</span><span className="text-sm" style={{ color: C.ink }}>{children}</span></div>; }
function Rule({ children }) { return <div className="flex items-start gap-2 text-sm" style={{ color: C.ink }}><span style={{ color: C.gold, marginTop: 1 }}>▸</span><span>{children}</span></div>; }
function Stat({ label, value, sub, color }) { return <div className="rounded-xl p-2.5" style={{ background: C.panel, border: `1px solid ${C.border}` }}><div className="text-xs" style={{ color: C.sub }}>{label}</div><div className="mono" style={{ color, fontSize: 19, fontWeight: 700, lineHeight: 1.15 }}>{value}</div><div className="text-xs" style={{ color: C.sub }}>{sub}</div></div>; }
function MiniStat({ label, value, color }) { return <div><div className="text-xs" style={{ color: C.sub }}>{label}</div><div className="mono" style={{ color, fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{value}</div></div>; }
