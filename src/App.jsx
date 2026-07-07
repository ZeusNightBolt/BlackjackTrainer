import React, { useState, useEffect, useRef, useCallback } from "react";
import { RULES, SHOE_CARDS } from "./rules";
import {
  BUST, DEALER, TABLES, INIT_G,
  rnd, pick, signed, fmtMoney, fmtSigned,
  makeCard, baseVal, tag, handTotal, splittable, handDesc, totalStr,
  softKey, hardKey, buildShoe, drawFrom,
  shouldSurrender, getPlay, edgePct, suggestedUnits, basicOptimal,
  finalizeOpening, resolveRound, advance, coachAdvice, simulateAlternative, ghostDealerPlayout,
} from "./engine";

/* ============================================================
   Blackjack Trainer — UI layer.
   Table rules live in src/rules.js (currently Atlantic City
   high-limit: 8 decks, dealer peeks & stands on all 17s, 3:2,
   DAS, late surrender). Game/strategy logic lives in
   src/engine.js; per-action EV/SD data in src/evdata.js.
   ============================================================ */

const C = {
  bg: "#0a0e0c", panel: "#111a16", panel2: "#0d1310", border: "#20302a",
  ink: "#e8efeb", sub: "#8aa79b", gold: "#e8b64c", felt: "#0e5a41", feltDark: "#093b2c",
  hit: "#f59e0b", stand: "#fb5b6b", double: "#38bdf8", split: "#34d399", surrender: "#a78bfa",
};
const MOVE = { H: { label: "Hit", color: C.hit }, S: { label: "Stand", color: C.stand }, D: { label: "Double", color: C.double }, P: { label: "Split", color: C.split }, R: { label: "Surrender", color: C.surrender } };

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
    if (isSoft) return "A strong made soft hand. Drawing only risks turning a winner into a loser — stand.";
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
  const { total } = handTotal(cards);
  // count-based surrender (Fab 4): count either unlocks or cancels a surrender
  if (rec && rec.surrender) {
    if (rec.skip) return `${total} vs ${dStr}: basic strategy surrenders here, but at true count ${signed(rec.index)}+ the extra high cards left tip it back to playing on, so you ${MOVE[correct].label.toLowerCase()}. You're at TC ${signed(tcFloor)} → ${MOVE[correct].label}. (Fab 4 surrender index ${signed(rec.index)}.)`;
    return `${total} vs ${dStr}: not a flat-bet surrender, but the shoe is ten-rich (TC ${signed(rec.index)}+), which makes you bust more and the dealer's stiff win more — so surrender is now the least-bad line. You're at TC ${signed(tcFloor)} → Surrender. (Fab 4 surrender index ${signed(rec.index)}.)`;
  }
  if (correct === "R") {
    return `Hard ${total} vs ${dStr}: a late-surrender spot. Even played perfectly you lose this hand well over half the time — 16 vs a 10 wins only ~23% — so giving up half (EV −0.50) beats both hitting (~−0.54) and standing (~−0.54). On this S17 shoe the basic surrenders are exactly: hard 15 vs 10, and hard 16 (never the 8,8 pair — always split that) vs 9, 10, or A.`;
  }
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
/* anim: "deal" slides the card in off the shoe; "flip" turns the hole card over.
   ghost: a would-have-been card — dimmed, dashed, never tagged (it isn't in play and isn't counted). */
function PlayingCard({ card, hidden, small, tagVal, anim, delay = 0, ghost }) {
  const w = small ? 42 : 56, h = small ? 60 : 80;
  const cls = anim === "deal" ? "card-deal" : anim === "flip" ? "card-flip" : "";
  const style = { animationDelay: delay ? `${delay}ms` : undefined, ...(ghost ? { opacity: 0.55, outline: "2px dashed rgba(255,255,255,.45)", outlineOffset: 2 } : null) };
  if (ghost) tagVal = null;
  if (hidden) return (
    <div className={cls} style={{ ...style, width: w, height: h, borderRadius: 8, border: "1px solid #2b4a63", padding: 3, background: "#16283a", boxShadow: "0 3px 8px rgba(0,0,0,.45)" }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 5, border: "1px solid rgba(120,170,215,.4)", background: "repeating-linear-gradient(45deg,#122032,#122032 4px,#1b3a52 4px,#1b3a52 8px)" }} />
    </div>
  );
  const showTag = tagVal !== undefined && tagVal !== null;
  const tCol = tagVal > 0 ? C.split : tagVal < 0 ? C.stand : C.sub;
  const ink = card.red ? "#c62828" : "#1a1a1a";
  const corner = (flip) => (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1, transform: flip ? "rotate(180deg)" : "none", alignSelf: flip ? "flex-end" : "flex-start" }}>
      <span style={{ fontWeight: 800, fontSize: small ? 12 : 15, color: ink }}>{card.rank}</span>
      <span style={{ fontSize: small ? 9 : 11, color: ink, marginTop: 1 }}>{card.suit}</span>
    </span>
  );
  return (
    <div className={cls} style={{ ...style, position: "relative", width: w, height: h, borderRadius: 8, background: "linear-gradient(150deg,#ffffff 0%,#f4f4ec 55%,#e9e9df 100%)", border: "1px solid #d0d0c5", boxShadow: "0 3px 8px rgba(0,0,0,.45)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: small ? 3 : 4 }}>
      {corner(false)}
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: small ? 18 : 26, color: ink, opacity: .92 }}>{card.suit}</span>
      {corner(true)}
      {showTag && <span style={{ position: "absolute", top: -7, right: -7, background: tCol, color: "#0a0e0c", fontWeight: 800, fontSize: 9, borderRadius: 5, padding: "1px 4px", fontFamily: "'IBM Plex Mono',monospace", boxShadow: "0 1px 3px rgba(0,0,0,.4)" }}>{tagVal > 0 ? "+1" : tagVal < 0 ? "−1" : "0"}</span>}
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
const INIT_AGG = { rounds: 0, handsWon: 0, handsLost: 0, handsPush: 0, decisions: 0, correct: 0, flawedHands: 0, flawedWon: 0, net: 0, countDecisions: 0, countCorrect: 0, recent: [] };
const CUT = RULES.cutCards;
const STARTING_BALANCE = RULES.startingBalance;
const CHIPS = RULES.chips;
const CHIP_STYLE = RULES.chipStyle;

/* Session persistence — bankroll, session stats, and settings survive a tab close (static-host friendly).
   Key is versioned: v2 = Atlantic City high-limit rules (older saves used different chips/bankroll). */
const LS_KEY = "bjt-save-v2";
function loadSaved() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } }
const SAVED = loadSaved();

export default function App() {
  const [tab, setTab] = useState("coach");
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
  const [agg, setAgg] = useState(SAVED.agg || INIT_AGG);
  const [useDev, setUseDev] = useState(SAVED.useDev ?? true);
  const [betWithCount, setBetWithCount] = useState(SAVED.betWithCount ?? false);
  const [balance, setBalance] = useState(SAVED.balance ?? STARTING_BALANCE);
  const [chipSize, setChipSize] = useState(SAVED.chipSize ?? RULES.chips[0]);
  const [showTags, setShowTags] = useState(SAVED.showTags ?? true);
  const [hideCount, setHideCount] = useState(SAVED.hideCount ?? false);
  const [reveal, setReveal] = useState(false);
  const [primer, setPrimer] = useState(false);
  // holds the round result (message/flash/badges/money) until the dealer's cards finish landing
  const [gHold, setGHold] = useState(false);
  const gHoldTimer = useRef(null);
  const holdReveal = useCallback((cg, opening) => {
    clearTimeout(gHoldTimer.current);
    setGHold(true);
    gHoldTimer.current = setTimeout(() => setGHold(false), revealMsFor(cg, opening));
  }, []);
  const clearHold = useCallback(() => { clearTimeout(gHoldTimer.current); setGHold(false); }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ balance, chipSize, agg, useDev, betWithCount, showTags, hideCount })); } catch { /* private mode */ }
  }, [balance, chipSize, agg, useDev, betWithCount, showTags, hideCount]);

  const deal = useCallback(() => { setAnswered(null); setSc(buildScenario(ruleSet, cats)); }, [ruleSet, cats]);
  useEffect(() => { deal(); }, [deal]);
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(gHoldTimer.current); }, []);

  function answer(choice) {
    if (answered) return;
    const ok = choice === sc.correct;
    setAnswered({ choice, correct: ok });
    setStats((p) => { const streak = ok ? p.streak + 1 : 0; return { total: p.total + 1, correct: p.correct + (ok ? 1 : 0), streak, best: Math.max(p.best, streak) }; });
    if (ok && auto) { clearTimeout(timer.current); timer.current = setTimeout(deal, 1500); }
  }

  /* ---------------- count helpers (live) ---------------- */
  const decksRem = g.shoe.length / 52;
  const tc = g.shoe.length ? g.rc / decksRem : 0;
  const tcFloor = Math.floor(tc);
  const countVisible = !hideCount || reveal;

  /* ---------------- full game engine (module-scope fns shared with Coach Me) ---------------- */
  function dealNewRound() {
    if (balance < chipSize) return;
    let shoe = g.shoe.length < CUT ? buildShoe() : [...g.shoe];
    const shuffled = g.shoe.length < CUT;
    const rc0 = shuffled ? 0 : g.rc;
    const tcBet = shoe.length ? rc0 / (shoe.length / 52) : 0;
    const baseBet = betWithCount ? chipSize * suggestedUnits(tcBet) : chipSize;
    const bet = Math.min(baseBet, balance);
    const cg = { ...INIT_G, shoe, rc: rc0, bet, shuffled };
    const p0 = drawFrom(cg), du = drawFrom(cg), p1 = drawFrom(cg), dh = drawFrom(cg);
    cg.rc += tag(p0) + tag(p1) + tag(du);
    cg.dealer = [du, dh];
    cg.hands = [{ cards: [p0, p1], bet, done: false, doubled: false, mistakes: 0, isSplitAce: false, result: null }];
    setReveal(false);
    clearHold();
    if (baseVal(du) === 11) { cg.phase = "insurance"; setG(cg); return; }
    const S = finalizeOpening(cg);
    setG(cg);
    if (S) {
      holdReveal(cg, true);
      setAgg((a) => ({ ...a, rounds: a.rounds + 1, handsWon: a.handsWon + S.won, handsLost: a.handsLost + S.lost, handsPush: a.handsPush + S.push, net: a.net + S.net, recent: pushRecent(a.recent, S.net) }));
      setBalance((b) => Math.round((b + S.net) * 100) / 100);
    }
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
    if (S) holdReveal(cg, true);
    setAgg((a) => {
      const na = { ...a, countDecisions: a.countDecisions + 1, countCorrect: a.countCorrect + (insOK ? 1 : 0) };
      if (S) { na.rounds += 1; na.handsWon += S.won; na.handsLost += S.lost; na.handsPush += S.push; na.net += S.net; na.recent = pushRecent(a.recent, S.net); }
      return na;
    });
    if (S) setBalance((b) => Math.round((b + S.net) * 100) / 100);
  }

  function playerAct(action) {
    if (g.phase !== "player") return;
    const cg = { ...g, shoe: [...g.shoe], dealer: [...g.dealer], log: [...g.log], hands: g.hands.map((h) => ({ ...h, cards: [...h.cards] })) };
    const idx = cg.active, h = cg.hands[idx], dUp = baseVal(cg.dealer[0]);
    const exposure = cg.hands.reduce((s, x) => s + x.bet, 0);
    const canDouble = h.cards.length === 2 && exposure + h.bet <= balance;
    const canSplit = h.cards.length === 2 && splittable(h.cards) && cg.hands.length < 4 && !h.isSplitAce && exposure + h.bet <= balance;
    const canSurrender = h.cards.length === 2 && cg.hands.length === 1 && !h.isSplitAce;
    if (action === "P" && !canSplit) return;
    if (action === "D" && !canDouble) return;
    if (action === "R" && !canSurrender) return;
    const mtc = Math.floor(cg.rc / (cg.shoe.length / 52));
    const play = getPlay(h.cards, dUp, canDouble, canSplit, mtc, useDev, canSurrender);
    const ok = action === play.move;
    if (!ok) h.mistakes += 1;
    // snapshot the first decision so the round can be replayed with the alternatives afterwards
    if (h.cards.length === 2 && cg.hands.length === 1 && !cg.whatIf) {
      cg.whatIf = { shoe: [...cg.shoe], player: [...h.cards], dealer: [...cg.dealer], bet: h.bet, taken: action, correct: play.move, canSurrender };
    }
    // rolling pre-action snapshot: if this action busts the round, the dealer's ghost replay
    // starts from THIS shoe (your bust card would have been the dealer's first draw)
    cg.preShoe = [...cg.shoe]; cg.preTotal = handTotal(h.cards).total;
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
    else if (action === "R") {
      h.surrendered = true; h.done = true; h.result = "surrender";
      cg.dealerRevealed = false;
      cg.roundNet = -(h.bet / 2) + (cg.insNet || 0); // a lost insurance side bet still settles
      cg.message = "Surrendered — half your bet back.";
      cg.phase = "done";
      S = { won: 0, lost: 1, push: 0, flawed: h.mistakes > 0 ? 1 : 0, flawedWon: 0, net: cg.roundNet };
    }
    setG(cg);
    if (S) holdReveal(cg, false);
    setAgg((a) => {
      const na = { ...a, decisions: a.decisions + 1, correct: a.correct + (ok ? 1 : 0) };
      if (play.isDeviation) { na.countDecisions = a.countDecisions + 1; na.countCorrect = a.countCorrect + (ok ? 1 : 0); }
      if (S) { na.rounds += 1; na.handsWon += S.won; na.handsLost += S.lost; na.handsPush += S.push; na.flawedHands += S.flawed; na.flawedWon += S.flawedWon; na.net += S.net; na.recent = pushRecent(a.recent, S.net); }
      return na;
    });
    if (S) setBalance((b) => Math.round((b + S.net) * 100) / 100);
  }

  const acc = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
  const gAcc = agg.decisions ? Math.round((agg.correct / agg.decisions) * 100) : 0;
  const cAcc = agg.countDecisions ? Math.round((agg.countCorrect / agg.countDecisions) * 100) : 0;
  const flawedRate = agg.flawedHands ? Math.round((agg.flawedWon / agg.flawedHands) * 100) : 0;

  const tabBtn = (id, txt) => <button onClick={() => setTab(id)} style={{ padding: "8px 14px", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: tab === id ? C.gold : "transparent", color: tab === id ? "#0a0e0c" : C.sub }}>{txt}</button>;
  // rule-set switch lives with the content it affects (Chart + Flashcards), not the global header
  const ruleToggle = (
    <div className="flex rounded-full p-1" style={{ background: C.panel2, border: `1px solid ${C.border}`, width: "fit-content" }}>
      {["american", "european"].map((r) => <button key={r} onClick={() => setRuleSet(r)} style={{ padding: "5px 11px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, textTransform: "capitalize", background: ruleSet === r ? C.felt : "transparent", color: ruleSet === r ? "#fff" : C.sub }}>{r}</button>)}
    </div>
  );
  const catBtn = (id, txt) => <button onClick={() => setCats((p) => { const n = { ...p, [id]: !p[id] }; return (!n.hard && !n.soft && !n.pairs) ? p : n; })} style={{ padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, border: `1px solid ${cats[id] ? C.split : C.border}`, background: cats[id] ? "rgba(52,211,153,.14)" : "transparent", color: cats[id] ? C.split : C.sub }}>{txt}</button>;
  const fcButtons = sc ? (sc.isPair ? ["H", "S", "D", "P"] : ["H", "S", "D"]) : [];
  const toggle = (on, set, txt) => <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: C.sub }}><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />{txt}</label>;

  const gActive = g.hands[g.active];
  const gExposure = g.hands.reduce((s, x) => s + x.bet, 0);
  const gCanDouble = g.phase === "player" && gActive && gActive.cards.length === 2 && gExposure + gActive.bet <= balance;
  const gCanSplit = g.phase === "player" && gActive && gActive.cards.length === 2 && splittable(gActive.cards) && g.hands.length < 4 && !gActive.isSplitAce && gExposure + gActive.bet <= balance;
  const gCanHit = g.phase === "player" && gActive && handTotal(gActive.cards).total <= 21;
  const gCanSurrender = g.phase === "player" && gActive && gActive.cards.length === 2 && g.hands.length === 1 && !gActive.isSplitAce;
  // ghost play-out: on all-bust or surrender, show what the dealer WOULD have done (display-only, never counted)
  const gSurrHand = g.phase === "done" ? g.hands.find((h) => h.surrendered) : null;
  const gAllBusted = g.phase === "done" && g.hands.length > 0 && !gSurrHand && g.hands.every((h) => handTotal(h.cards).total > 21);
  // bust replays deal from the PRE-fatal-hit shoe: had you stood, your bust card is the dealer's first draw
  const gGhost = g.phase === "done" && (gAllBusted || gSurrHand) && g.dealer.length >= 2 ? ghostDealerPlayout(g.dealer, (gAllBusted && g.preShoe) || g.shoe) : null;

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.ink, fontFamily: "'Space Grotesk',system-ui,sans-serif" }}>
      <style>{`
        :root{color-scheme:dark;} *{box-sizing:border-box;}
        html{overscroll-behavior-y:contain;-webkit-text-size-adjust:100%;}
        button{touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;}
        button:active{transform:translateY(1px);} button:disabled{cursor:not-allowed;}
        button:focus-visible{outline:2px solid ${C.gold};outline-offset:2px;}
        .mono{font-family:'IBM Plex Mono',monospace;}
        /* Single-frame game layout: table on the left, coaching/results on the right on wide screens; stacked on phones. */
        .game-grid{display:grid;grid-template-columns:1fr;gap:14px;align-items:start;}
        @media(min-width:860px){.game-grid{grid-template-columns:minmax(360px,1.05fr) minmax(300px,0.95fr);}}
        .game-side{position:sticky;top:76px;}
        @media(max-width:859px){.game-side{position:static;}}
        /* --- motion: cards arc in off the shoe with a settle, slow enough to build suspense --- */
        @keyframes dealIn{0%{opacity:0;transform:translate(38px,-52px) rotate(-10deg) scale(.82);}45%{opacity:1;}72%{transform:translate(0,0) rotate(0) scale(1.04);}100%{opacity:1;transform:none;}}
        @keyframes flipIn{0%{transform:rotateY(92deg) scale(.98);opacity:.35;}60%{opacity:1;}100%{transform:rotateY(0) scale(1);opacity:1;}}
        @keyframes popIn{0%{transform:scale(.4);opacity:0;}70%{transform:scale(1.12);}100%{transform:scale(1);opacity:1;}}
        @keyframes floatUp{0%{opacity:0;transform:translateY(4px);}18%{opacity:1;}100%{opacity:0;transform:translateY(-24px);}}
        @keyframes activePulse{0%,100%{outline-color:${C.gold};box-shadow:0 0 10px rgba(232,182,76,.18);}50%{outline-color:#f4cf7d;box-shadow:0 0 20px rgba(232,182,76,.5);}}
        .card-deal{animation:dealIn 1.05s cubic-bezier(.2,.8,.3,1.03) both;}
        .card-flip{animation:flipIn 1.15s ease-out both;}
        .result-pop{animation:popIn .42s cubic-bezier(.2,.9,.3,1.4) both;}
        .delta-float{animation:floatUp 1.8s ease-out both;pointer-events:none;}
        .hand-active{animation:activePulse 1.5s ease-in-out infinite;}
        /* --- win celebration (escalates on win streaks) --- */
        @keyframes winPop{0%{transform:scale(.3) rotate(-4deg);opacity:0;}30%{transform:scale(1.2);opacity:1;}50%{transform:scale(1);}84%{opacity:1;}100%{transform:scale(1.04);opacity:0;}}
        @keyframes confettiFly{0%{transform:translate(0,0) rotate(0) scale(1);opacity:1;}100%{transform:translate(var(--dx),var(--dy)) rotate(600deg) scale(.55);opacity:0;}}
        @keyframes streakBurst{0%{opacity:0;transform:scale(.5);}28%{opacity:.95;}100%{opacity:0;transform:scale(1.7);}}
        @keyframes streakTagPop{0%{opacity:0;transform:translateY(10px) scale(.7);}45%{opacity:1;transform:translateY(0) scale(1.12);}62%{transform:scale(1);}85%{opacity:1;}100%{opacity:0;transform:translateY(-6px);}}
        .win-flash{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;z-index:6;}
        .win-text{animation:winPop 2s cubic-bezier(.2,.9,.3,1.2) both;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:clamp(26px,6vw,40px);color:#ffd76a;text-shadow:0 0 22px rgba(232,182,76,.85),0 2px 8px rgba(0,0,0,.65);letter-spacing:1px;}
        .win-text.hot{color:#ffdf8a;text-shadow:0 0 30px rgba(255,150,50,.95),0 0 12px rgba(255,90,40,.7),0 2px 8px rgba(0,0,0,.7);}
        .streak-tag{animation:streakTagPop 2.1s cubic-bezier(.2,.9,.3,1.2) both;animation-delay:.18s;margin-top:6px;font-family:'IBM Plex Mono',monospace;font-weight:800;font-size:clamp(12px,3.4vw,16px);letter-spacing:1.5px;padding:3px 12px;border-radius:999px;color:#0a0e0c;background:linear-gradient(120deg,#ffd76a,#ff9a3c);box-shadow:0 3px 12px rgba(255,140,50,.5);}
        .streak-burst{position:absolute;inset:0;border-radius:16px;animation:streakBurst 1.9s ease-out both;background:radial-gradient(ellipse at 50% 46%, rgba(255,190,70,.5), rgba(255,120,40,.14) 52%, transparent 74%);}
        .confetti{position:absolute;left:50%;top:50%;width:9px;height:9px;border-radius:2px;animation:confettiFly 1.7s ease-out both;}
        @media(prefers-reduced-motion:reduce){.win-flash{display:none;}}
        /* --- casino chip buttons --- */
        .chip-btn{width:50px;height:50px;border-radius:50%;font-weight:800;font-size:12px;cursor:pointer;position:relative;border:none;
          display:inline-flex;align-items:center;justify-content:center;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.55);
          box-shadow:0 3px 6px rgba(0,0,0,.5), inset 0 -2px 4px rgba(0,0,0,.35), inset 0 2px 3px rgba(255,255,255,.2);transition:transform .12s ease, box-shadow .12s ease;}
        .chip-btn::before{content:"";position:absolute;inset:5px;border-radius:50%;border:2px dashed rgba(255,255,255,.5);}
        .chip-btn.sel{transform:translateY(-3px);box-shadow:0 6px 12px rgba(0,0,0,.55), inset 0 -2px 4px rgba(0,0,0,.35), inset 0 2px 3px rgba(255,255,255,.2), 0 0 0 3px ${C.gold};}
        .chip-btn:disabled{opacity:.45;transform:none;}
        /* --- felt: casino table top with a wooden rail --- */
        .felt{position:relative;isolation:isolate;background:radial-gradient(ellipse at 50% 30%, ${C.felt}, ${C.feltDark} 85%);
          box-shadow:inset 0 0 46px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.05),
            0 0 0 5px #3a2a1c, 0 0 0 6px rgba(212,160,90,.35), 0 8px 22px rgba(0,0,0,.5);
          border:1px solid rgba(255,255,255,.08);transition:box-shadow .4s ease, border-color .4s ease;}
        .felt.won{box-shadow:inset 0 0 46px rgba(0,0,0,.45), 0 0 0 5px #3a2a1c, 0 0 0 6px rgba(212,160,90,.35), 0 0 22px rgba(52,211,153,.4);}
        .felt.lost{box-shadow:inset 0 0 46px rgba(0,0,0,.45), 0 0 0 5px #3a2a1c, 0 0 0 6px rgba(212,160,90,.35), 0 0 22px rgba(251,91,107,.35);}
        /* --- betting-circle chip stack --- */
        .chip-disc{position:absolute;left:50%;transform:translateX(-50%);width:44px;height:44px;border-radius:50%;
          box-shadow:0 2px 4px rgba(0,0,0,.5), inset 0 -2px 3px rgba(0,0,0,.35), inset 0 2px 2px rgba(255,255,255,.22);
          display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:10px;text-shadow:0 1px 2px rgba(0,0,0,.6);}
        .chip-disc::before{content:"";position:absolute;inset:4px;border-radius:50%;border:2px dashed rgba(255,255,255,.45);}
        /* --- sticky thumb-reach action bar on phones --- */
        @media(max-width:859px){
          .action-dock{position:sticky;bottom:0;z-index:15;margin:0 -16px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));
            background:linear-gradient(to top, ${C.bg} 72%, rgba(10,14,12,0));}
        }
        .act-btn{min-height:52px;}
        /* --- app frame: a contained, bordered surface so the trainer reads as an app --- */
        .play-frame{border:1px solid ${C.border};border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent 44%);padding:12px;box-shadow:0 1px 0 rgba(255,255,255,.03) inset, 0 10px 30px rgba(0,0,0,.35);}
        .play-frame > .game-grid{margin-bottom:0;}
        /* --- compact phone layout (iPhone Safari first) --- */
        @media(max-width:640px){
          .tagline{display:none;}
          .hide-sm{display:none;}
          .felt{padding:10px 9px;}
          main{padding-top:8px;padding-left:10px;padding-right:10px;}
          .play-frame{padding:8px;border-radius:14px;}
          .compact-p{padding:8px !important;}
        }
        /* the core play column stays centered and narrow so it feels like a fixed app screen */
        .play-col{max-width:560px;margin:0 auto;width:100%;}
        @media(prefers-reduced-motion:reduce){.card-deal,.card-flip,.result-pop,.delta-float,.hand-active,.streak-tag,.streak-burst{animation:none;}}
      `}</style>

      <header className="sticky top-0 z-20" style={{ background: C.panel, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }} className="px-4 pt-2 pb-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="font-bold tracking-tight" style={{ fontSize: 17 }}><span style={{ color: C.gold }}>21</span> · Blackjack Trainer</div>
            <div className="text-xs tagline" style={{ color: C.sub }}>Play, count, understand every move</div>
          </div>
          <div className="flex gap-1 mt-1.5">{tabBtn("coach", "Coach Me")}{tabBtn("drill", "Drill")}{tabBtn("chart", "Chart")}{tabBtn("learn", "Learn")}</div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto" }} className="px-4 py-4 pb-16">

        {/* ------------------------- LEARN ------------------------- */}
        {tab === "learn" && (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <Section title="The whole game in 20 seconds">You and the dealer each try to get closer to <b>21</b> than the other without going over. Cards = face value, J/Q/K = 10, Ace = 11 <i>or</i> 1. You see both your cards and one dealer card. The dealer has <b>no choices</b> — hit until 17+ then stop. That fixed behavior is what makes the game solvable.</Section>
            <Section title="Your five moves"><Bullet c={C.hit} k="Hit">Take another card.</Bullet><Bullet c={C.stand} k="Stand">Stop and keep your total.</Bullet><Bullet c={C.double} k="Double">Double the bet, take <b>one</b> more card, stop.</Bullet><Bullet c={C.split} k="Split">Only with a pair — two hands, one bet each.</Bullet><Bullet c={C.surrender} k="Surrender">Give up half your bet and end the hand — only on your original two cards, before you've hit or split.</Bullet></Section>
            <Section title="The one idea behind the chart">Assume the dealer's hidden card is a 10 (a third of the deck is ten-value). Dealer showing <b>2–6</b> → likely to bust, so you stand on stiffs and press bets. Dealer showing <b>7–Ace</b> → likely 17+, so you hit your stiffs. The Chart tab shows the real bust rates.</Section>
            <Section title="Then learn to count">Basic strategy only makes you lose slowly (~0.5%). The edge comes from <b>counting</b>: track high vs low cards, bet more and deviate when the shoe is ten-rich. The Drill → <b>Full game</b> tab has a live running/true count and grades your count-based plays. Start there once the chart is automatic.</Section>
            <Section title="Two ways to train"><b style={{ color: C.gold }}>Drill</b> tests you — you act first, then get graded. <b style={{ color: C.gold }}>Coach Me</b> teaches you — before you act, the coach prices every legal move (exact EV per $1, what each mistake costs, and how wild each action's swings are) and tracks the EV you give up when you override it. Learn in Coach Me, prove it in Drill.</Section>
            <Section title="Money rules"><div className="grid gap-1.5"><Rule><b>Never take insurance</b> unless you're counting and the true count is +3 or higher.</Rule><Rule>Only play <b>3:2</b> tables — 6:5 roughly triples the house edge.</Rule><Rule>Size your bet to the <b>count</b>, never to a win/loss streak — progression systems (Martingale, "chase your losses") don't change your EV by a cent; they just reshape variance until they hit the table limit.</Rule><Rule>Counting only pays with a <b>bet spread</b> over lots of hands; flat-betting a count just breaks even, and on an 8-deck shoe a short session is mostly variance.</Rule><Rule><b>Surrender</b> the hands you'd lose more than half the time played out — on this S17 shoe that's exactly hard 16 (never the 8,8 pair) vs 9/10/A, and hard 15 vs 10. (H17 tables, common elsewhere, add 15 vs A, 17 vs A, and 8,8 vs A.)</Rule></div></Section>
            <div className="rounded-lg p-3 mt-4 text-xs" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.sub }}>Sources: Wizard of Odds (basic strategy, Hi-Lo, Illustrious 18) · Schlesinger, <i>Blackjack Attack</i> (Illustrious 18 &amp; Fab 4 surrender indices) · Griffin, <i>The Theory of Blackjack</i> · basicstrategy.app. EV figures generated for this exact table ({RULES.name}: {RULES.shortLabel}) and verified by simulation. Verify table rules before you sit.</div>
          </div>
        )}

        {/* ------------------------- CHART ------------------------- */}
        {tab === "chart" && (
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap"><div className="text-sm" style={{ color: C.ink }}>Rows = your hand, columns = the dealer's up card.</div>{ruleToggle}</div>
            <div className="text-sm mb-3" style={{ color: C.ink }}>The chart is the optimal response to how often the dealer busts — here's that bust rate, the engine underneath every cell:</div>
            <DealerBustStrip />
            <div className="text-xs mb-4 rounded-lg p-3" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.sub }}>See the cliff: a <b style={{ color: C.split }}>6 busts ~{BUST["6"]}%</b>, a <b style={{ color: C.stand }}>7 only ~{BUST["7"]}%</b>. That {BUST["6"] - BUST["7"]}-point drop is why most stand/hit decisions flip between the dealer's 6 and 7. <span>({RULES.decks} decks, dealer stands on all 17s — computed from this table's own dealer model.)</span></div>
            <div className="text-xs mb-2" style={{ color: C.sub }}>Tap any cell to see <i>why</i>.</div>
            <Legend />
            <ChartBlock title="Hard totals" rows={TABLES[ruleSet].hard} onCell={(l, d, ch) => setCellInfo({ label: l, dealer: d, correct: ch, catKey: "hard", isSoft: false, isPair: false })} />
            <ChartBlock title="Soft totals (ace as 11)" rows={TABLES[ruleSet].soft} onCell={(l, d, ch) => setCellInfo({ label: l, dealer: d, correct: ch, catKey: "soft", isSoft: true, isPair: false })} />
            <ChartBlock title="Pairs" rows={TABLES[ruleSet].pairs} onCell={(l, d, ch) => setCellInfo({ label: l, dealer: d, correct: ch, catKey: "pairs", isSoft: false, isPair: true })} />
            <SurrenderChart />
            {cellInfo && (
              <div className="rounded-lg p-3" style={{ background: C.panel, border: `1px solid ${MOVE[cellInfo.correct].color}` }}>
                <div className="flex items-center gap-2 mb-1"><span className="mono text-sm" style={{ color: C.ink }}>{cellInfo.label} vs {cellInfo.dealer}</span><span style={{ background: MOVE[cellInfo.correct].color, color: "#0a0e0c", fontWeight: 800, fontSize: 12, padding: "2px 8px", borderRadius: 5 }}>{MOVE[cellInfo.correct].label}</span><span className="text-xs" style={{ color: C.sub }}>· dealer busts {BUST[cellInfo.dealer]}%</span></div>
                <div className="text-sm" style={{ color: C.sub }}>{reasonFor(cellInfo)}</div>
              </div>
            )}
            <div className="rounded-lg p-3 mt-4 text-xs" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.sub }}><b style={{ color: C.gold }}>American vs European:</b> under European No-Hole-Card the dealer draws only after you act, so you avoid doubling/splitting into a possible dealer blackjack — flipping four cells (11 vs 10, 8,8 vs 10/A, and A,A vs A).</div>
            <div className="rounded-lg p-3 mt-3 text-xs" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.sub }}><b style={{ color: C.gold }}>Deviations:</b> the plain chart is <i>flat-bet</i> basic strategy. As the true count climbs, a handful of cells flip (the Illustrious 18) — e.g. 16 vs 10 stands from TC 0 and 12 vs 3 stands from +2 — and the Fab 4 move the surrender lines (15 vs 10 surrenders only at TC 0+; 14 vs 10 surrenders from +3). Turn those on in Drill → Full game.</div>
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
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2"><div className="flex gap-1.5 items-center flex-wrap">{catBtn("hard", "Hard")}{catBtn("soft", "Soft")}{catBtn("pairs", "Pairs")}{ruleToggle}</div>{toggle(auto, setAuto, "Auto-deal on correct")}</div>
                <div key={`${stats.total}-${sc.label}-${sc.dealer}`} className="rounded-2xl p-4 mb-3 felt">
                  <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,.6)" }}>Dealer</div>
                  <div className="flex gap-2 mb-4"><PlayingCard card={sc.dealerCard} anim="deal" /><PlayingCard hidden anim="deal" delay={1340} /></div>
                  <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,.6)" }}>You</div>
                  <div className="flex gap-2">{sc.cards.map((c, i) => <PlayingCard key={i} card={c} anim="deal" delay={300 + i * 540} />)}</div>
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
              <div className="play-frame">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="text-xs" style={{ color: C.sub }}>{RULES.name} · {RULES.shortLabel} · Hi-Lo</div>
                  <button onClick={() => { setG(INIT_G); setAgg(INIT_AGG); setBalance(STARTING_BALANCE); try { localStorage.removeItem(LS_KEY); } catch {} }} style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.sub, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Reset</button>
                </div>

                {/* ===== BANKROLL + BET SIZING (top, right above the game) ===== */}
                <div className="rounded-xl p-3 mb-2" style={{ background: C.panel, border: `1px solid ${C.gold}` }}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div style={{ position: "relative" }}>
                      <div className="text-xs" style={{ color: C.sub }}>Balance</div>
                      <div className="mono" style={{ color: balance >= STARTING_BALANCE ? C.split : balance <= 0 ? C.stand : C.ink, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{fmtMoney(gHold ? balance - g.roundNet : balance)}</div>
                      {g.phase === "done" && g.roundNet !== 0 && !gHold && (
                        <span key={agg.rounds} className="delta-float mono" style={{ position: "absolute", left: "100%", marginLeft: 8, top: 12, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", color: g.roundNet > 0 ? C.split : C.stand }}>{fmtSigned(g.roundNet)}</span>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-right" style={{ color: C.sub }}>Chip</div>
                      <div className="flex gap-2 mt-1">
                        {CHIPS.map((c) => {
                          const locked = g.phase === "player" || g.phase === "insurance";
                          return <button key={c} disabled={locked} onClick={() => setChipSize(c)} className={"chip-btn" + (chipSize === c ? " sel" : "")} style={{ background: CHIP_STYLE[c] }}>${c}</button>;
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 flex-wrap gap-2" style={{ borderTop: `1px solid ${C.border}` }}>
                    <span className="text-xs" style={{ color: C.sub }}>Next bet <b className="mono" style={{ color: C.gold }}>{fmtMoney(Math.min(betWithCount ? chipSize * suggestedUnits(tc) : chipSize, balance))}</b>{betWithCount ? <span style={{ opacity: .75 }}> · ramped to the count</span> : <span style={{ opacity: .75 }}> · flat</span>}</span>
                    {toggle(betWithCount, setBetWithCount, "Bet with the count")}
                  </div>
                </div>

                {/* count panel */}
                <div className="rounded-xl p-3 mb-2" style={{ background: C.panel, border: `1px solid ${C.double}` }}>
                  <div className="flex items-center justify-between mb-2"><span className="text-xs" style={{ color: C.double, fontWeight: 700 }}>THE COUNT</span>{hideCount && <button onClick={() => setReveal((r) => !r)} style={{ padding: "3px 10px", borderRadius: 7, border: `1px solid ${C.double}`, background: "transparent", color: C.double, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{reveal ? "Hide" : "Reveal to check"}</button>}</div>
                  <div className="grid grid-cols-4 gap-2">
                    <MiniStat label="Running" value={countVisible ? signed(g.rc) : "•••"} color={C.ink} />
                    <MiniStat label="True" value={countVisible ? (g.shoe.length ? signed(Math.round(tc * 10) / 10) : "0") : "•••"} color={tc >= 2 ? C.split : tc <= -1 ? C.stand : C.ink} />
                    <MiniStat label="Decks left" value={g.shoe.length ? decksRem.toFixed(1) : RULES.decks.toFixed(1)} color={C.sub} />
                    <MiniStat label="Est. edge" value={countVisible ? (g.shoe.length ? signed(Math.round(edgePct(tc) * 100) / 100) + "%" : "−0.5%") : "•••"} color={edgePct(tc) >= 0 ? C.split : C.stand} />
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                    <span className="text-xs" style={{ color: C.sub }}>Suggested bet at this count: <b className="mono" style={{ color: C.gold }}>{countVisible ? fmtMoney(chipSize * suggestedUnits(tc)) : "•••"}</b> <span style={{ opacity: .7 }}>(1×–12× your {fmtMoney(chipSize)} chip)</span></span>
                  </div>
                </div>

                {/* toggles */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 px-1">
                  {toggle(showTags, setShowTags, "Show ±count tags on cards")}
                  {toggle(hideCount, setHideCount, "Hide count (test me)")}
                  {toggle(useDev, setUseDev, "Grade count deviations (I-18 + Fab 4)")}
                </div>

                {/* ===== SINGLE FRAME: table (left) + learning/results (right) ===== */}
                <div className="game-grid">
                <div>
                {/* penetration */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1" style={{ color: C.sub }}><span>Shoe</span><span>{g.shoe.length ? g.shoe.length + " cards left" : `fresh ${RULES.decks}-deck shoe`}</span></div>
                  <div style={{ height: 5, borderRadius: 3, background: C.panel2, overflow: "hidden" }}><div style={{ height: "100%", width: `${g.shoe.length ? Math.round(((SHOE_CARDS - g.shoe.length) / SHOE_CARDS) * 100) : 0}%`, background: C.felt }} /></div>
                </div>

                {/* felt */}
                <div className={"rounded-2xl p-4 mb-3 felt" + (g.phase === "done" && !gHold ? (g.roundNet > 0 ? " won" : g.roundNet < 0 ? " lost" : "") : "")}>
                  <FeltMarkings />
                  <LastHands recent={agg.recent} hold={gHold} />
                  {g.phase === "done" && g.roundNet > 0 && !gHold && <WinFlash key={agg.rounds} net={g.roundNet} blackjack={g.message.startsWith("Blackjack")} streak={winStreak(agg.recent)} />}
                  <div className="mb-2" style={{ color: "rgba(255,255,255,.35)", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{RULES.name}<span className="hide-sm"> · {fmtMoney(RULES.tableMin)} min</span></div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-xs" style={{ color: "rgba(255,255,255,.6)" }}>Dealer</span>{g.dealerRevealed && g.dealer.length > 0 && !gHold && <span className="mono text-xs" style={{ color: handTotal(g.dealer).total > 21 ? "#ffd7d7" : "#fff", fontWeight: 700 }}>{totalStr(g.dealer)}</span>}{gGhost && !gHold && <span className="mono text-xs" style={{ color: "#ffe9a8", fontStyle: "italic" }}>→ would've {gGhost.total > 21 ? "BUSTED" : gGhost.draws.length ? "made " + gGhost.total : "stood on " + gGhost.total}</span>}</div>
                  <div className="flex gap-2 mb-1" style={{ flexWrap: "wrap" }}>
                    {g.dealer.length === 0 ? <span className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>—</span> :
                      g.dealerRevealed
                        ? <>
                            {g.dealer.map((c, i) => <PlayingCard key={i} card={c} small tagVal={showTags ? tag(c) : null} anim={i === 1 ? "flip" : i > 1 ? "deal" : undefined} delay={i > 1 ? 1000 + (i - 2) * 620 : 0} />)}
                            {gGhost && gGhost.draws.map((c, i) => <PlayingCard key={"g" + i} card={c} small ghost anim="deal" delay={1000 + i * 620} />)}
                          </>
                        : gGhost
                          ? <>
                              <PlayingCard card={g.dealer[0]} small tagVal={showTags ? tag(g.dealer[0]) : null} />
                              <PlayingCard card={g.dealer[1]} small ghost anim="flip" />
                              {gGhost.draws.map((c, i) => <PlayingCard key={"g" + i} card={c} small ghost anim="deal" delay={1000 + i * 620} />)}
                            </>
                          : <><PlayingCard card={g.dealer[0]} small tagVal={showTags ? tag(g.dealer[0]) : null} anim="deal" /><PlayingCard hidden small anim="deal" delay={1340} /></>}
                  </div>
                  <div className="mb-3">{gGhost && !gHold && (
                    <span className="text-xs" style={{ color: "rgba(255,255,255,.55)", fontStyle: "italic" }}>
                      {gSurrHand ? "hole card + draws shown for training — not counted" : "replay from before your bust card — it goes to the dealer here · not counted"}
                      {gSurrHand && <> · standing pat, your {handTotal(gSurrHand.cards).total} would have <b style={{ color: gGhost.total > 21 || handTotal(gSurrHand.cards).total > gGhost.total ? "#7ce3b1" : handTotal(gSurrHand.cards).total === gGhost.total ? "#ffe9a8" : "#ffb3bd" }}>{gGhost.total > 21 || handTotal(gSurrHand.cards).total > gGhost.total ? "WON" : handTotal(gSurrHand.cards).total === gGhost.total ? "PUSHED" : "LOST"}</b></>}
                      {gAllBusted && g.hands.length === 1 && g.preTotal && <> · standing on your {g.preTotal}, you'd have <b style={{ color: gGhost.total > 21 || g.preTotal > gGhost.total ? "#7ce3b1" : g.preTotal === gGhost.total ? "#ffe9a8" : "#ffb3bd" }}>{gGhost.total > 21 || g.preTotal > gGhost.total ? "WON" : g.preTotal === gGhost.total ? "PUSHED" : "lost anyway"}</b></>}
                    </span>
                  )}</div>
                  <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,.6)" }}>You{g.hands.length > 1 ? ` · ${g.hands.length} hands` : ""}</div>
                  <div className="flex gap-3" style={{ flexWrap: "wrap" }}>
                    {g.hands.length === 0 ? <span className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>Press Deal to start</span> :
                      g.hands.map((h, hi) => { const isActive = g.phase === "player" && hi === g.active; const showRes = h.result && !gHold; const rc = h.result === "win" ? C.split : h.result === "lose" ? C.stand : h.result === "push" ? C.gold : h.result === "surrender" ? C.surrender : "transparent"; return (
                        <div key={hi} className={isActive ? "hand-active" : ""} style={{ padding: 6, borderRadius: 10, outline: isActive ? `2px solid ${C.gold}` : showRes ? `2px solid ${rc}` : "2px solid transparent", outlineOffset: 1 }}>
                          <div className="flex gap-1.5">{h.cards.map((c, i) => <PlayingCard key={i} card={c} small tagVal={showTags ? tag(c) : null} anim="deal" delay={h.cards.length === 2 && i < 2 ? 300 + i * 540 : 0} />)}</div>
                          <div className="flex items-center gap-1.5 mt-1"><span className="mono text-xs" style={{ color: "#fff", fontWeight: 700 }}>{totalStr(h.cards)}</span><span className="mono text-xs" style={{ color: "rgba(255,255,255,.55)" }}>{fmtMoney(h.bet)}</span>{h.doubled && <span className="text-xs" style={{ color: "rgba(255,255,255,.7)" }}>2x</span>}{showRes && <span className="result-pop" style={{ background: rc, color: "#0a0e0c", fontWeight: 800, fontSize: 10, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase" }}>{h.result}</span>}</div>
                        </div>); })}
                  </div>
                </div>

                {/* WHAT IF? — inline under the felt so the review is in view */}
                {g.phase === "done" && !gHold && <WhatIf snap={g.whatIf} actualNet={g.roundNet} />}

                {/* insurance prompt / actions / deal — docked to the thumb on phones */}
                <div className="action-dock">
                {g.phase === "insurance" ? (
                  <div className="rounded-xl p-3 mb-1" style={{ background: C.panel, border: `1px solid ${C.double}` }}>
                    <div className="text-sm mb-2" style={{ color: C.ink }}><b style={{ color: C.double }}>Dealer shows an Ace.</b> Take insurance? {countVisible ? <span className="mono" style={{ color: C.sub }}>(TC {signed(tcFloor)})</span> : <span style={{ color: C.sub }}>— you're testing, so decide from your own count</span>}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button className="act-btn" disabled={balance < g.bet * 1.5} onClick={() => resolveInsurance(true)} style={{ padding: "12px 0", borderRadius: 12, border: "none", cursor: balance >= g.bet * 1.5 ? "pointer" : "not-allowed", background: C.double, color: "#0a0e0c", fontWeight: 800, fontSize: 14, opacity: balance >= g.bet * 1.5 ? 1 : 0.4 }}>Take insurance</button>
                      <button className="act-btn" onClick={() => resolveInsurance(false)} style={{ padding: "12px 0", borderRadius: 12, border: `1px solid ${C.border}`, cursor: "pointer", background: "transparent", color: C.ink, fontWeight: 800, fontSize: 14 }}>No insurance</button>
                    </div>
                  </div>
                ) : g.phase === "player" ? (
                  <div>
                    {gCanSurrender && (
                      <button onClick={() => playerAct("R")} style={{ width: "100%", padding: "10px 0", borderRadius: 12, border: `1px solid ${C.surrender}`, cursor: "pointer", background: "rgba(167,139,250,.08)", color: C.surrender, fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Surrender <span style={{ opacity: .75, fontWeight: 600 }}>— give up half your bet</span></button>
                    )}
                    <div className="grid grid-cols-4 gap-2">
                      {[["S", gCanHit], ["H", gCanHit], ["D", gCanDouble], ["P", gCanSplit]].map(([k, on]) => <button key={k} className="act-btn" disabled={!on} onClick={() => playerAct(k)} style={{ padding: "14px 0", borderRadius: 12, fontWeight: 800, fontSize: 14, color: "#0a0e0c", background: MOVE[k].color, opacity: on ? 1 : 0.28, border: "none", cursor: on ? "pointer" : "not-allowed", boxShadow: on ? "0 2px 6px rgba(0,0,0,.35)" : "none" }}>{MOVE[k].label}</button>)}
                    </div>
                  </div>
                ) : balance < chipSize ? (
                  <div className="rounded-xl p-3" style={{ background: C.panel, border: `1px solid ${C.stand}` }}>
                    <div className="text-sm mb-2" style={{ color: C.ink }}>Not enough balance for a {fmtMoney(chipSize)} bet. Pick a smaller chip above, or take a fresh {fmtMoney(RULES.rebuy)} re-buy.</div>
                    <button className="act-btn" onClick={() => setBalance(RULES.rebuy)} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", cursor: "pointer", background: C.gold, color: "#0a0e0c", fontWeight: 800, fontSize: 14 }}>Re-buy {fmtMoney(RULES.rebuy)}</button>
                  </div>
                ) : (
                  <button className="act-btn" onClick={dealNewRound} style={{ width: "100%", padding: "15px 0", borderRadius: 12, border: "none", cursor: "pointer", background: `linear-gradient(160deg, #f2c96a, ${C.gold})`, color: "#0a0e0c", fontWeight: 800, fontSize: 15, boxShadow: "0 3px 10px rgba(232,182,76,.25)" }}>{g.phase === "idle" ? "Deal first hand" : "Deal next hand →"}</button>
                )}
                </div>
                </div>

                {/* ---- RIGHT COLUMN: learning + results ---- */}
                <div className="game-side">

                {/* coaching panel */}
                {!g.coach && g.phase !== "done" && (
                  <div className="rounded-lg p-3 mb-3" style={{ background: C.panel2, border: `1px dashed ${C.border}`, color: C.sub }}>
                    <div className="text-sm">Make a move — the reasoning behind the correct play (basic strategy, a count deviation, or surrender) shows up here, on right calls too.</div>
                  </div>
                )}
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

                {/* round result — held back until the dealer's cards have landed */}
                {g.phase === "done" && g.message && !gHold && (
                  <div className="rounded-lg p-3 mt-3" style={{ background: C.panel2, border: `1px solid ${g.roundNet > 0 ? C.split : g.roundNet < 0 ? C.stand : C.border}` }}>
                    <div className="flex items-center gap-2"><span className="text-sm" style={{ color: C.ink }}>{g.message}</span><span className="mono text-sm" style={{ color: g.roundNet > 0 ? C.split : g.roundNet < 0 ? C.stand : C.sub, fontWeight: 700 }}>{fmtSigned(g.roundNet)}</span></div>
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

                {/* session stats */}
                <div className="rounded-xl p-3 mt-3 mb-2" style={{ background: C.panel, border: `1px solid ${C.gold}` }}>
                  <div className="text-xs" style={{ color: C.sub }}>Hands you misplayed but still won</div>
                  <div className="flex items-end gap-2"><span className="mono" style={{ color: C.gold, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{agg.flawedWon}/{agg.flawedHands}</span><span className="mono text-xs" style={{ color: C.sub, paddingBottom: 2 }}>{agg.flawedHands ? flawedRate + "% — variance covering mistakes" : "misplay and see"}</span></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Strategy" value={`${gAcc}%`} sub={`${agg.decisions - agg.correct} miss`} color={C.split} />
                  <Stat label="Count plays" value={agg.countDecisions ? `${cAcc}%` : "—"} sub={`${agg.countDecisions} calls`} color={C.double} />
                  <Stat label="Net" value={fmtSigned(agg.net)} sub={`${agg.rounds} rds`} color={agg.net >= 0 ? C.split : C.stand} />
                  <Stat label="Hands" value={`${agg.handsWon}-${agg.handsLost}-${agg.handsPush}`} sub="W-L-P" color={C.gold} />
                </div>

                </div>{/* end right column */}
                </div>{/* end game-grid */}

                {/* Counting 101 primer (collapsible) */}
                <button onClick={() => setPrimer(!primer)} style={{ width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel2, color: C.gold, fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 14, marginBottom: 8 }}>{primer ? "▾" : "▸"} Counting 101 &amp; bet sizing — how it works and when it's worth it</button>
                {primer && (
                  <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.ink }}>
                    <p className="mb-2"><b style={{ color: C.gold }}>Hi-Lo tags:</b> low cards <b style={{ color: C.split }}>2–6 = +1</b>, neutral <b style={{ color: C.sub }}>7–9 = 0</b>, high cards <b style={{ color: C.stand }}>10–A = −1</b>. Add each tag as it's <i>shown</i> for the <b>running count</b>; high cards left over favor you (more blackjacks, more dealer busts, better doubles).</p>
                    <p className="mb-2"><b style={{ color: C.gold }}>True count = running ÷ decks remaining.</b> Each +1 of true count ≈ +0.5% edge — you're roughly break-even near TC +1 and ahead above it. On this <b>{RULES.decks}-deck</b> shoe the count only swings past +2 late in the shoe, so it's mostly a slow-burn edge: realistically a <b>1×–12× bet spread</b> over <b>tens of thousands</b> of hands to reliably beat the variance. Your skepticism is fair — for a casual player counting is a rounding error; its value shows up only in volume. Flat-betting a count barely breaks even.</p>
                    <p className="mb-2"><b style={{ color: C.gold }}>Bet sizing that's real vs. fake.</b> <b style={{ color: C.split }}>Count-based</b> (bet ∝ your edge, à la Kelly) is the one signal that actually earns — that's the "bet with the count" toggle. <b style={{ color: C.stand }}>Win/loss streak</b> systems (Martingale, "raise after a loss," "press a hot streak") do <i>not</i> change your EV one cent: each round is independent, so a losing streak tells you nothing about the next hand. They only reshape the variance and eventually hit the table limit or your bankroll. Size to the <i>count</i>, never to the streak.</p>
                    <p className="mb-1"><b style={{ color: C.gold }}>Then act on it:</b> the cleanest count plays are <b>insurance at TC +3+</b> and the Illustrious 18 / Fab 4 deviations. This trainer only counts cards you'd really see — the hole card isn't counted until it flips.</p>
                    <p className="text-xs" style={{ color: C.sub }}>Hi-Lo values, +3 insurance, Illustrious 18 &amp; Fab 4 surrender indices per Wizard of Odds &amp; Schlesinger's <i>Blackjack Attack</i>. EV figures (e.g. 16 vs 10 loses ~77%) generated for this exact {RULES.decks}-deck S17 table.</p>
                  </div>
                )}

                <div className="text-xs mt-2" style={{ color: C.sub }}>Practice loop: keep the running count in your head as cards come out (tags help at first — hide them once you're quick), convert to true count by dividing by decks left, size your bet <i>to the count</i>, and take the count-based plays. Turn on "Hide count" to test yourself, then "Reveal to check." Every move shows why the correct play is correct — read it, don't just note the ✗.</div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------- COACH ME ------------------------- */}
        {tab === "coach" && <CoachTable balance={balance} setBalance={setBalance} />}
      </main>
    </div>
  );
}

/* =============================== COACH ME ===============================
   Real-table flow: build a bet from chips, deal, and the coach ranks every
   legal action by expected value BEFORE you act — with the cost of each
   suboptimal line and the volatility (SD) of the action's outcome.
   EV/SD from src/evdata.js (see STRATEGY.md §7 for method + literature). */
const evc = (ev) => (ev >= 0 ? "+" : "−") + Math.abs(ev * 100).toFixed(1) + "¢";
/* greedy chip decomposition for the betting-circle stack (display only, max 6 discs) */
function chipStack(amount) {
  const out = [];
  let rem = amount;
  for (const c of [...CHIPS].sort((a, b) => b - a)) while (rem >= c && out.length < 6) { out.push(c); rem -= c; }
  return out.reverse(); // biggest chips at the bottom of the stack
}
const COACH_LS = "bjt-coach-v2";
function loadCoachSaved() { try { return JSON.parse(localStorage.getItem(COACH_LS)) || {}; } catch { return {}; } }
const COACH_INIT_CS = { hands: 0, decisions: 0, followed: 0, evGiven: 0, bets: 0, aligned: 0, lossChases: 0, winPresses: 0, base: null, lastBet: null, lastNet: null, recent: [] };
function CoachTable({ balance, setBalance }) {
  const [cq, setCq] = useState(INIT_G);
  const [betAmt, setBetAmt] = useState(0);
  const [cs, setCs] = useState(() => ({ ...COACH_INIT_CS, ...loadCoachSaved() }));
  const [clog, setClog] = useState([]);
  const [hideC, setHideC] = useState(false);
  // holds the round result until the dealer's reveal animation finishes (see revealMsFor)
  const [cHold, setCHold] = useState(false);
  const cHoldTimer = useRef(null);
  const holdReveal = useCallback((cg, opening) => { clearTimeout(cHoldTimer.current); setCHold(true); cHoldTimer.current = setTimeout(() => setCHold(false), revealMsFor(cg, opening)); }, []);
  const clearHold = useCallback(() => { clearTimeout(cHoldTimer.current); setCHold(false); }, []);
  useEffect(() => () => clearTimeout(cHoldTimer.current), []);
  useEffect(() => { try { localStorage.setItem(COACH_LS, JSON.stringify(cs)); } catch {} }, [cs]);

  const decksRem = cq.shoe.length / 52;
  const tc = cq.shoe.length ? cq.rc / decksRem : 0;
  const tcFloor = Math.floor(tc);

  /* --- bet-discipline monitor (see STRATEGY.md §5): the evidence-backed way to size bets is a
     pre-committed count ramp (Kelly-fraction); reacting to streaks is loss-chasing / house-money. --- */
  const baseUnit = cs.base || CHIPS[0];
  const recBet = Math.min(baseUnit * suggestedUnits(tc), balance);
  const lossChasing = cs.lastNet !== null && cs.lastNet < 0 && cs.lastBet !== null && betAmt > cs.lastBet;
  const winPressing = cs.lastNet !== null && cs.lastNet > 0 && cs.lastBet !== null && betAmt > cs.lastBet && betAmt > recBet * 1.5;
  function betVerdict() {
    if (!betAmt) return null;
    if (lossChasing) return { tone: C.stand, head: "Scale it back down.", text: `You lost the last hand and raised from ${fmtMoney(cs.lastBet)} to ${fmtMoney(betAmt)} — that's loss-chasing (a Martingale move). The shoe has no memory: raising after a loss doesn't change your odds by a cent, it only deepens the hole when the streak continues. Return to ~${fmtMoney(Math.min(baseUnit * suggestedUnits(tc), balance))} for TC ${signed(tcFloor)}.` };
    if (winPressing) return { tone: C.hit, head: "Careful — that's house money talking.", text: `Raising past the count's ramp after a win is the "house-money effect": found money feels free, so people over-bet it. The count, not the last result, is the only signal — ~${fmtMoney(recBet)} is right for TC ${signed(tcFloor)}.` };
    if (tcFloor >= 2 && betAmt < recBet * 0.6) return { tone: C.split, head: "Scale UP.", text: `TC ${signed(tcFloor)} — the shoe favors you (edge ≈ ${signed(Math.round(edgePct(tc) * 100) / 100)}%). This is exactly when a counter presses: ramp toward ${fmtMoney(recBet)} (~${suggestedUnits(tc)}× your base).` };
    if (tcFloor <= 1 && betAmt > baseUnit * 2) return { tone: C.hit, head: "Scale DOWN.", text: `TC ${signed(tcFloor)} — no edge yet, so every extra dollar out is pure variance at −EV. Keep it near your base ${fmtMoney(baseUnit)} until the count climbs.` };
    return { tone: C.split, head: "Good size.", text: `${fmtMoney(betAmt)} fits TC ${signed(tcFloor)} — betting the count, not the streak. That pre-committed ramp is the discipline that survives a real session.` };
  }
  function settle(S) {
    if (!S) return;
    setCs((p) => ({ ...p, hands: p.hands + 1, lastNet: S.net, recent: pushRecent(p.recent, S.net) }));
    setBalance((b) => Math.round((b + S.net) * 100) / 100);
  }
  function dealCoach() {
    if (betAmt <= 0 || betAmt > balance) return;
    // record bet-discipline stats at commit time
    setCs((p) => {
      const base = p.base ? Math.min(p.base, betAmt) : betAmt;
      const rec = base * suggestedUnits(tc);
      const aligned = betAmt >= rec / 2 && betAmt <= rec * 2;
      return { ...p, bets: p.bets + 1, aligned: p.aligned + (aligned ? 1 : 0), lossChases: p.lossChases + (lossChasing ? 1 : 0), winPresses: p.winPresses + (winPressing ? 1 : 0), base, lastBet: betAmt };
    });
    let shoe = cq.shoe.length < CUT ? buildShoe() : [...cq.shoe];
    const rc0 = cq.shoe.length < CUT ? 0 : cq.rc;
    const cg = { ...INIT_G, shoe, rc: rc0, bet: betAmt };
    const p0 = drawFrom(cg), du = drawFrom(cg), p1 = drawFrom(cg), dh = drawFrom(cg);
    cg.rc += tag(p0) + tag(p1) + tag(du);
    cg.dealer = [du, dh];
    cg.hands = [{ cards: [p0, p1], bet: betAmt, done: false, doubled: false, mistakes: 0, isSplitAce: false, result: null }];
    clearHold();
    if (baseVal(du) === 11) { cg.phase = "insurance"; setCq(cg); return; }
    const S = finalizeOpening(cg);
    setCq(cg); settle(S); if (S) holdReveal(cg, true);
  }
  /* back to a blank table for a fresh bet — keeps the shoe and running count (real-table behavior) */
  function newBet() { clearHold(); setCq((c) => ({ ...INIT_G, shoe: c.shoe, rc: c.rc })); }
  function coachInsurance(take) {
    if (cq.phase !== "insurance") return;
    const cg = { ...cq, shoe: [...cq.shoe], dealer: [...cq.dealer], hands: cq.hands.map((h) => ({ ...h, cards: [...h.cards] })) };
    const dealerBJ = handTotal(cg.dealer).total === 21;
    cg.insNet = take ? (dealerBJ ? cg.bet : -cg.bet / 2) : 0;
    const S = finalizeOpening(cg);
    setCq(cg); settle(S); if (S) holdReveal(cg, true);
  }
  function coachAct(action) {
    if (cq.phase !== "player") return;
    const cg = { ...cq, shoe: [...cq.shoe], dealer: [...cq.dealer], hands: cq.hands.map((h) => ({ ...h, cards: [...h.cards] })) };
    const idx = cg.active, h = cg.hands[idx], dUp = baseVal(cg.dealer[0]);
    // funds guard: the balance must cover every bet already on the table PLUS the new one
    const exposure = cg.hands.reduce((s, x) => s + x.bet, 0);
    const canDouble = h.cards.length === 2 && exposure + h.bet <= balance;
    const canSplit = h.cards.length === 2 && splittable(h.cards) && cg.hands.length < 4 && !h.isSplitAce && exposure + h.bet <= balance;
    const canSurrender = h.cards.length === 2 && cg.hands.length === 1 && !h.isSplitAce;
    if ((action === "P" && !canSplit) || (action === "D" && !canDouble) || (action === "R" && !canSurrender)) return;
    const adv = coachAdvice(h.cards, dUp, canDouble, canSplit, canSurrender);
    const best = adv[0], chosen = adv.find((x) => x.a === action);
    if (h.cards.length === 2 && cg.hands.length === 1 && !cg.whatIf) {
      cg.whatIf = { shoe: [...cg.shoe], player: [...h.cards], dealer: [...cg.dealer], bet: h.bet, taken: action, correct: best ? best.a : action, canSurrender };
    }
    cg.preShoe = [...cg.shoe]; cg.preTotal = handTotal(h.cards).total;
    if (best && chosen) {
      const gave = Math.max(0, (best.ev - chosen.ev)) * h.bet;
      setCs((p) => ({ ...p, decisions: p.decisions + 1, followed: p.followed + (action === best.a ? 1 : 0), evGiven: p.evGiven + gave }));
      setClog((L) => [{ txt: handDesc(h.cards) + " vs " + cg.dealer[0].rank, best: best.a, you: action, cost: (best.ev - chosen.ev) * h.bet }, ...L].slice(0, 8));
    }
    let S = null;
    const drawV = () => { const c = drawFrom(cg); cg.rc += tag(c); return c; };
    if (action === "H") { h.cards.push(drawV()); if (handTotal(h.cards).total > 21) { h.done = true; S = advance(cg); } }
    else if (action === "S") { h.done = true; S = advance(cg); }
    else if (action === "D") { h.bet *= 2; h.doubled = true; h.cards.push(drawV()); h.done = true; S = advance(cg); }
    else if (action === "P") {
      const [c0, c1] = h.cards, isA = c0.val === "A";
      const A = { cards: [c0], bet: cq.bet, done: false, doubled: false, mistakes: 0, isSplitAce: isA, result: null };
      const B = { cards: [c1], bet: cq.bet, done: false, doubled: false, mistakes: 0, isSplitAce: isA, result: null };
      if (isA) { A.cards.push(drawV()); A.done = true; cg.hands.splice(idx, 1, A, B); S = advance(cg); }
      else { A.cards.push(drawV()); cg.hands.splice(idx, 1, A, B); cg.active = idx; }
    }
    else if (action === "R") {
      h.surrendered = true; h.done = true; h.result = "surrender";
      cg.dealerRevealed = false; cg.roundNet = -(h.bet / 2) + (cg.insNet || 0); cg.message = "Surrendered — half back."; cg.phase = "done";
      S = { net: cg.roundNet };
    }
    setCq(cg); settle(S); if (S) holdReveal(cg, false);
  }

  const active = cq.hands[cq.active];
  const dUp = cq.dealer.length ? baseVal(cq.dealer[0]) : 0;
  const cqExposure = cq.hands.reduce((s, x) => s + x.bet, 0);
  const aCanDouble = cq.phase === "player" && active && active.cards.length === 2 && cqExposure + active.bet <= balance;
  const aCanSplit = cq.phase === "player" && active && active.cards.length === 2 && splittable(active.cards) && cq.hands.length < 4 && !active.isSplitAce && cqExposure + active.bet <= balance;
  const aCanHit = cq.phase === "player" && active && handTotal(active.cards).total <= 21;
  const aCanSurr = cq.phase === "player" && active && active.cards.length === 2 && cq.hands.length === 1 && !active.isSplitAce;
  const adv = cq.phase === "player" && active ? coachAdvice(active.cards, dUp, aCanDouble, aCanSplit, aCanSurr) : [];
  const best = adv[0];
  const cSurrHand = cq.phase === "done" ? cq.hands.find((h) => h.surrendered) : null;
  const cAllBusted = cq.phase === "done" && cq.hands.length > 0 && !cSurrHand && cq.hands.every((h) => handTotal(h.cards).total > 21);
  const cGhost = cq.phase === "done" && (cAllBusted || cSurrHand) && cq.dealer.length >= 2 ? ghostDealerPlayout(cq.dealer, (cAllBusted && cq.preShoe) || cq.shoe) : null;
  const play = cq.phase === "player" && active ? getPlay(active.cards, dUp, aCanDouble, aCanSplit, tcFloor, true, aCanSurr) : null;
  const countFlip = best && play && play.move !== best.a;
  const followRate = cs.decisions ? Math.round((cs.followed / cs.decisions) * 100) : 0;

  const barW = (ev) => Math.max(4, Math.min(100, ((ev + 1) / 2) * 100));
  return (
    <div className="play-frame">
      <div className="rounded-xl p-3 mb-2 compact-p" style={{ background: C.panel, border: `1px solid ${C.gold}` }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div><div className="text-xs" style={{ color: C.sub }}>Balance</div><div className="mono" style={{ fontSize: 20, fontWeight: 700, color: balance >= STARTING_BALANCE ? C.split : C.ink }}>{fmtMoney(cHold ? balance - cq.roundNet : balance)}</div></div>
          {!hideC && <div className="flex gap-4"><MiniStat label="Running" value={signed(cq.rc)} color={C.ink} /><MiniStat label="True" value={cq.shoe.length ? signed(Math.round(tc * 10) / 10) : "0"} color={tc >= 2 ? C.split : C.ink} /><MiniStat label="Decks" value={cq.shoe.length ? decksRem.toFixed(1) : RULES.decks.toFixed(1)} color={C.sub} /></div>}
        </div>
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 flex-wrap" style={{ borderTop: `1px solid ${C.border}` }}>
          <span className="text-xs hide-sm" style={{ color: C.sub }}>The coach prices every move <b style={{ color: C.gold }}>before</b> you act · {RULES.shortLabel}</span>
          <div className="flex items-center gap-3" style={{ marginLeft: "auto" }}>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: C.sub }}><input type="checkbox" checked={hideC} onChange={(e) => setHideC(e.target.checked)} />Hide count</label>
            <button onClick={() => { setCq(INIT_G); setCs({ ...COACH_INIT_CS }); setClog([]); setBetAmt(0); setBalance(RULES.startingBalance); try { localStorage.removeItem(COACH_LS); } catch {} }} style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.sub, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Reset session</button>
          </div>
        </div>
      </div>

      <div className="game-grid">
      <div>
        {/* felt */}
        <div className="flex justify-between text-xs mb-1 px-1" style={{ color: C.sub }}>
          <span>Shoe · {RULES.decks} decks</span>
          <span className="mono">{cq.shoe.length ? cq.shoe.length + " cards to the cut" : "fresh shuffle on deal"}</span>
        </div>
        <div className="mb-2" style={{ height: 4, borderRadius: 2, background: C.panel2, overflow: "hidden" }}><div style={{ height: "100%", width: `${cq.shoe.length ? Math.round(((SHOE_CARDS - cq.shoe.length) / SHOE_CARDS) * 100) : 0}%`, background: C.felt, transition: "width .4s ease" }} /></div>
        <div className={"rounded-2xl p-4 mb-3 felt" + (cq.phase === "done" && !cHold ? (cq.roundNet > 0 ? " won" : cq.roundNet < 0 ? " lost" : "") : "")}>
          <FeltMarkings />
          <LastHands recent={cs.recent} hold={cHold} />
          {cq.phase === "done" && cq.roundNet > 0 && !cHold && <WinFlash key={cs.hands} net={cq.roundNet} blackjack={cq.message.startsWith("Blackjack")} streak={winStreak(cs.recent)} />}
          <div className="mb-2" style={{ color: "rgba(255,255,255,.35)", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{RULES.name}<span className="hide-sm"> · {fmtMoney(RULES.tableMin)} min</span></div>
          <div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-xs" style={{ color: "rgba(255,255,255,.6)" }}>Dealer</span>{cq.dealerRevealed && cq.dealer.length > 0 && !cHold && <span className="mono text-xs" style={{ color: "#fff", fontWeight: 700 }}>{totalStr(cq.dealer)}</span>}{cGhost && !cHold && <span className="mono text-xs" style={{ color: "#ffe9a8", fontStyle: "italic" }}>→ would've {cGhost.total > 21 ? "BUSTED" : cGhost.draws.length ? "made " + cGhost.total : "stood on " + cGhost.total}</span>}</div>
          <div className="flex gap-2 mb-1" style={{ flexWrap: "wrap", minHeight: 62 }}>
            {cq.dealer.length === 0 ? <span className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>—</span> :
              cq.dealerRevealed
                ? <>
                    {cq.dealer.map((c, i) => <PlayingCard key={i} card={c} small anim={i === 1 ? "flip" : i > 1 ? "deal" : undefined} delay={i > 1 ? 1000 + (i - 2) * 620 : 0} />)}
                    {cGhost && cGhost.draws.map((c, i) => <PlayingCard key={"g" + i} card={c} small ghost anim="deal" delay={1000 + i * 620} />)}
                  </>
                : cGhost
                  ? <>
                      <PlayingCard card={cq.dealer[0]} small />
                      <PlayingCard card={cq.dealer[1]} small ghost anim="flip" />
                      {cGhost.draws.map((c, i) => <PlayingCard key={"g" + i} card={c} small ghost anim="deal" delay={1000 + i * 620} />)}
                    </>
                  : <><PlayingCard card={cq.dealer[0]} small anim="deal" /><PlayingCard hidden small anim="deal" delay={1340} /></>}
          </div>
          <div className="mb-3">{cGhost && !cHold && (
            <span className="text-xs" style={{ color: "rgba(255,255,255,.55)", fontStyle: "italic" }}>
              {cSurrHand ? "hole card + draws shown for training — not counted" : "replay from before your bust card — it goes to the dealer here · not counted"}
              {cSurrHand && <> · standing pat, your {handTotal(cSurrHand.cards).total} would have <b style={{ color: cGhost.total > 21 || handTotal(cSurrHand.cards).total > cGhost.total ? "#7ce3b1" : handTotal(cSurrHand.cards).total === cGhost.total ? "#ffe9a8" : "#ffb3bd" }}>{cGhost.total > 21 || handTotal(cSurrHand.cards).total > cGhost.total ? "WON" : handTotal(cSurrHand.cards).total === cGhost.total ? "PUSHED" : "LOST"}</b></>}
              {cAllBusted && cq.hands.length === 1 && cq.preTotal && <> · standing on your {cq.preTotal}, you'd have <b style={{ color: cGhost.total > 21 || cq.preTotal > cGhost.total ? "#7ce3b1" : cq.preTotal === cGhost.total ? "#ffe9a8" : "#ffb3bd" }}>{cGhost.total > 21 || cq.preTotal > cGhost.total ? "WON" : cq.preTotal === cGhost.total ? "PUSHED" : "lost anyway"}</b></>}
            </span>
          )}</div>
          <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,.6)" }}>You{cq.hands.length > 1 ? ` · ${cq.hands.length} hands` : ""}</div>
          <div className="flex gap-3 items-start" style={{ flexWrap: "wrap", minHeight: 70 }}>
            {cq.hands.length === 0 ? (
              <div className="flex items-center gap-3">
                <div style={{ position: "relative", width: 74, height: 92 }}>
                  <div style={{ position: "absolute", bottom: 0, left: 0, width: 74, height: 74, borderRadius: "50%", border: "2px dashed rgba(255,255,255,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {!betAmt && <span className="mono" style={{ color: "rgba(255,255,255,.7)", fontWeight: 700, fontSize: 13 }}>BET</span>}
                  </div>
                  {chipStack(betAmt).map((c, i, arr) => (
                    <div key={i} className="chip-disc" style={{ background: CHIP_STYLE[c], bottom: 15 + i * 7, zIndex: i + 1 }}>{i === arr.length - 1 ? "$" + betAmt : ""}</div>
                  ))}
                </div>
                <span className="text-xs" style={{ color: "rgba(255,255,255,.55)", maxWidth: 150 }}>{betAmt ? `${fmtMoney(betAmt)} in the circle — deal when ready.` : "Tap chips below to build your bet, then deal."}</span>
              </div>
            ) :
              cq.hands.map((h, hi) => { const isActive = cq.phase === "player" && hi === cq.active; const showRes = h.result && !cHold; const rc = h.result === "win" ? C.split : h.result === "lose" ? C.stand : h.result === "push" ? C.gold : h.result === "surrender" ? C.surrender : "transparent"; return (
                <div key={hi} className={isActive ? "hand-active" : ""} style={{ padding: 6, borderRadius: 10, outline: isActive ? `2px solid ${C.gold}` : showRes ? `2px solid ${rc}` : "2px solid transparent", outlineOffset: 1 }}>
                  <div className="flex gap-1.5">{h.cards.map((c, i) => <PlayingCard key={i} card={c} small anim="deal" delay={h.cards.length === 2 && i < 2 ? 300 + i * 540 : 0} />)}</div>
                  <div className="flex items-center gap-1.5 mt-1"><span className="mono text-xs" style={{ color: "#fff", fontWeight: 700 }}>{totalStr(h.cards)}</span><span className="mono text-xs" style={{ color: "rgba(255,255,255,.55)" }}>{fmtMoney(h.bet)}</span>{showRes && <span className="result-pop" style={{ background: rc, color: "#0a0e0c", fontWeight: 800, fontSize: 10, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase" }}>{h.result}</span>}</div>
                </div>); })}
          </div>
        </div>

        {/* WHAT IF? — inline right under the felt so the review sits in view, above the fold */}
        {cq.phase === "done" && !cHold && <WhatIf snap={cq.whatIf} actualNet={cq.roundNet} />}

        {/* pre-move coach advice — ABOVE the buttons so you read it before acting */}
        {cq.phase === "player" && best && (
          <div className="rounded-xl p-3 mb-2" style={{ background: C.panel, border: `1px solid ${MOVE[best.a].color}` }}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs" style={{ color: C.sub }}>COACH:</span>
              <span style={{ background: MOVE[best.a].color, color: "#0a0e0c", fontWeight: 800, fontSize: 13, padding: "2px 10px", borderRadius: 6 }}>{MOVE[best.a].label}</span>
              <span className="mono text-xs" style={{ color: C.sub }}>{handDesc(active.cards)} vs {cq.dealer[0].rank}</span>
              {countFlip && <span className="text-xs" style={{ color: C.double, fontWeight: 700 }}>count says {MOVE[play.move].label} (TC {signed(tcFloor)}{play.rec ? `, index ${signed(play.rec.index)}` : ""})</span>}
            </div>
            <div className="grid gap-1">
              {adv.map((x) => (
                <div key={x.a} className="flex items-center gap-2">
                  <span className="mono text-xs" style={{ width: 62, color: x.a === best.a ? MOVE[x.a].color : C.sub, fontWeight: x.a === best.a ? 800 : 600 }}>{MOVE[x.a].label}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: C.panel2, overflow: "hidden" }}><div style={{ width: `${barW(x.ev)}%`, height: "100%", background: x.a === best.a ? MOVE[x.a].color : C.border }} /></div>
                  <span className="mono text-xs" style={{ width: 52, textAlign: "right", color: x.ev >= 0 ? C.split : C.stand }}>{evc(x.ev)}</span>
                  <span className="mono text-xs" style={{ width: 74, textAlign: "right", color: C.sub }}>{x.a === best.a ? `±${x.sd.toFixed(2)}u` : `-${((best.ev - x.ev) * 100).toFixed(1)}¢/$`}</span>
                </div>
              ))}
            </div>
            <div className="text-xs mt-2" style={{ color: C.sub }}>EV per $1 of your original bet · ±u = swing (SD) of the outcome. Doubling ~doubles the swing; surrender has zero variance.</div>
          </div>
        )}

        {/* action dock */}
        <div className="action-dock">
        {cq.phase === "idle" && balance < RULES.chips[0] ? (
          /* --- felted: below the table minimum, dealing is impossible — offer the re-buy --- */
          <div className="rounded-xl p-3" style={{ background: C.panel, border: `1px solid ${C.stand}` }}>
            <div className="text-sm mb-2" style={{ color: C.ink }}>You're felted — {fmtMoney(balance)} can't cover the {fmtMoney(RULES.tableMin)} table minimum. Take a fresh {fmtMoney(RULES.rebuy)} re-buy and keep training.</div>
            <button className="act-btn" onClick={() => { setBetAmt(0); setBalance((b) => Math.round((b + RULES.rebuy) * 100) / 100); }} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", cursor: "pointer", background: C.gold, color: "#0a0e0c", fontWeight: 800, fontSize: 14 }}>Re-buy {fmtMoney(RULES.rebuy)}</button>
          </div>
        ) : cq.phase === "idle" ? (
          /* --- betting on a blank table: build the bet with chips --- */
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {CHIPS.map((c) => <button key={c} className="chip-btn" style={{ background: CHIP_STYLE[c] }} disabled={betAmt + c > balance} onClick={() => setBetAmt((b) => b + c)}>${c}</button>)}
              <button onClick={() => setBetAmt(0)} disabled={!betAmt} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.sub, fontSize: 12, fontWeight: 700, cursor: betAmt ? "pointer" : "not-allowed", opacity: betAmt ? 1 : 0.5 }}>Clear</button>
              <span className="text-xs mono" style={{ color: C.gold, marginLeft: "auto" }}>{betAmt ? "Bet " + fmtMoney(betAmt) : ""}</span>
            </div>
            {(() => { const v = betVerdict(); return !hideC && (
              v ? <div className="text-xs mb-2 rounded-lg p-2" style={{ color: C.sub, background: C.panel2, border: `1px solid ${v.tone}` }}><b style={{ color: v.tone }}>{v.head}</b> {v.text}</div>
                : <div className="text-xs mb-2" style={{ color: C.sub }}>Coach: TC {signed(tcFloor)} → about <b className="mono" style={{ color: C.gold }}>{fmtMoney(recBet)}</b> ({suggestedUnits(tc)}× base). Decide the ramp before the cards — never off the last result.</div>
            ); })()}
            <button className="act-btn" disabled={betAmt <= 0 || betAmt > balance} onClick={dealCoach} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", cursor: betAmt > 0 ? "pointer" : "not-allowed", background: betAmt > 0 ? `linear-gradient(160deg,#f2c96a,${C.gold})` : C.panel2, color: betAmt > 0 ? "#0a0e0c" : C.sub, fontWeight: 800, fontSize: 15 }}>Deal{betAmt ? " — " + fmtMoney(betAmt) : ""}</button>
          </div>
        ) : cq.phase === "done" ? (
          /* --- round over: fast rebet, or wipe the table to change the bet --- */
          <div>
            {cq.message && !cHold && (
              <div className="rounded-lg p-2 mb-2 flex items-center gap-2" style={{ background: C.panel2, border: `1px solid ${cq.roundNet > 0 ? C.split : cq.roundNet < 0 ? C.stand : C.border}` }}>
                <span className="text-sm" style={{ color: C.ink }}>{cq.message}</span><span className="mono text-sm" style={{ fontWeight: 700, color: cq.roundNet > 0 ? C.split : cq.roundNet < 0 ? C.stand : C.sub }}>{fmtSigned(cq.roundNet)}</span>
              </div>
            )}
            {cHold && <div className="text-xs mb-2 mono" style={{ color: C.sub }}>Dealer plays…</div>}
            {betAmt > balance && <div className="text-xs mb-2" style={{ color: C.stand }}>Balance can't cover the last bet — change it.</div>}
            <div className="grid grid-cols-2 gap-2">
              <button className="act-btn" disabled={betAmt <= 0 || betAmt > balance} onClick={dealCoach} style={{ padding: "14px 0", borderRadius: 12, border: "none", cursor: betAmt > 0 && betAmt <= balance ? "pointer" : "not-allowed", background: betAmt > 0 && betAmt <= balance ? `linear-gradient(160deg,#f2c96a,${C.gold})` : C.panel2, color: betAmt > 0 && betAmt <= balance ? "#0a0e0c" : C.sub, fontWeight: 800, fontSize: 14 }}>Rebet {fmtMoney(betAmt)} &amp; deal</button>
              <button className="act-btn" onClick={newBet} style={{ padding: "14px 0", borderRadius: 12, border: `1px solid ${C.gold}`, cursor: "pointer", background: "transparent", color: C.gold, fontWeight: 800, fontSize: 14 }}>Change bet</button>
            </div>
          </div>
        ) : cq.phase === "insurance" ? (
          <div className="rounded-xl p-3" style={{ background: C.panel, border: `1px solid ${C.double}` }}>
            <div className="text-sm mb-1" style={{ color: C.ink }}><b style={{ color: C.double }}>Dealer shows an Ace.</b> Insurance?</div>
            <div className="text-xs mb-2" style={{ color: C.sub }}>Coach: insurance is a side bet that the hole card is a ten. Flat EV is <b style={{ color: C.stand }}>−7.7¢ per $1</b> insured — decline unless the shoe is ten-rich: take it at <b>TC +3 or higher</b>.{!hideC && <> You're at TC <b className="mono" style={{ color: tcFloor >= 3 ? C.split : C.ink }}>{signed(tcFloor)}</b> → <b>{tcFloor >= 3 ? "TAKE it" : "DECLINE"}</b>.</>}</div>
            <div className="grid grid-cols-2 gap-2">
              <button className="act-btn" disabled={balance < cq.bet * 1.5} onClick={() => coachInsurance(true)} style={{ padding: "12px 0", borderRadius: 12, border: "none", cursor: balance >= cq.bet * 1.5 ? "pointer" : "not-allowed", background: C.double, color: "#0a0e0c", fontWeight: 800, fontSize: 14, opacity: balance >= cq.bet * 1.5 ? 1 : 0.4 }}>Take insurance</button>
              <button className="act-btn" onClick={() => coachInsurance(false)} style={{ padding: "12px 0", borderRadius: 12, border: `1px solid ${C.border}`, cursor: "pointer", background: "transparent", color: C.ink, fontWeight: 800, fontSize: 14 }}>No insurance</button>
            </div>
          </div>
        ) : (
          <div>
            {aCanSurr && <button onClick={() => coachAct("R")} style={{ width: "100%", padding: "9px 0", borderRadius: 12, border: `1px solid ${C.surrender}`, cursor: "pointer", background: "rgba(167,139,250,.08)", color: C.surrender, fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Surrender — take half back</button>}
            <div className="grid grid-cols-4 gap-2">
              {[["S", aCanHit], ["H", aCanHit], ["D", aCanDouble], ["P", aCanSplit]].map(([k, on]) => <button key={k} className="act-btn" disabled={!on} onClick={() => coachAct(k)} style={{ padding: "14px 0", borderRadius: 12, fontWeight: 800, fontSize: 14, color: "#0a0e0c", background: MOVE[k].color, opacity: on ? 1 : 0.28, border: "none", cursor: on ? "pointer" : "not-allowed", outline: best && best.a === k ? `3px solid #fff` : "none", outlineOffset: -3 }}>{MOVE[k].label}</button>)}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* right column: decision log + ledger (What-If now sits inline under the felt) */}
      <div className="game-side">
        {clog.length > 0 && (
          <div className="mb-3">
            <div className="text-xs mb-1" style={{ color: C.sub }}>Recent decisions vs coach:</div>
            <div className="rounded-lg p-2" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
              {clog.map((l, i) => <div key={i} className="flex items-center gap-2 text-xs py-0.5"><span style={{ color: l.you === l.best ? C.split : C.stand, fontWeight: 800, width: 14 }}>{l.you === l.best ? "✓" : "✗"}</span><span className="mono" style={{ color: C.ink }}>{l.txt}</span><span style={{ color: C.sub }}>you {MOVE[l.you].label}</span>{l.you !== l.best && <span style={{ color: C.stand }}>coach {MOVE[l.best].label} ({fmtMoney(Math.abs(l.cost))} EV)</span>}</div>)}
            </div>
          </div>
        )}
        <div className="rounded-xl p-3 mb-2" style={{ background: C.panel, border: `1px solid ${C.gold}` }}>
          <div className="text-xs mb-1" style={{ color: C.sub }}>EV you gave up by overriding the coach</div>
          <div className="flex items-end gap-2"><span className="mono" style={{ color: cs.evGiven > 0 ? C.stand : C.split, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{fmtMoney(cs.evGiven)}</span><span className="text-xs" style={{ color: C.sub, paddingBottom: 2 }}>expected cost of off-chart moves</span></div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Stat label="Followed coach" value={cs.decisions ? followRate + "%" : "—"} sub={`${cs.followed}/${cs.decisions} moves`} color={C.split} />
          <Stat label="Hands" value={cs.hands} sub="this sitting" color={C.gold} />
          <Stat label="Bet discipline" value={cs.bets ? Math.round((cs.aligned / cs.bets) * 100) + "%" : "—"} sub="sized to the count" color={C.double} />
          <Stat label="Loss-chases" value={cs.lossChases} sub={cs.winPresses ? `+${cs.winPresses} win-presses` : "raises after a loss"} color={cs.lossChases > 0 ? C.stand : C.split} />
        </div>
        {cs.lossChases > 0 && (
          <div className="rounded-lg p-3 mb-3 text-xs" style={{ background: "rgba(251,91,107,.07)", border: `1px solid ${C.stand}`, color: C.sub }}>
            <b style={{ color: C.stand }}>Pattern flagged:</b> you've raised after a loss {cs.lossChases}×. Loss-chasing is the single most reliable tilt marker in the gambling-behavior literature, and mathematically it buys nothing — rounds are independent, so a progression only concentrates your losses into rarer, bigger ones. The evidence-backed fix is <i>pre-commitment</i>: fix the count ramp before the session and let it, not the last hand, size every bet.
          </div>
        )}
        <div className="rounded-lg p-3 text-xs" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.sub }}>
          <b style={{ color: C.gold }}>Where these numbers come from:</b> exact expected values for every action, computed by dynamic programming for these rules ({RULES.decks}-deck, dealer stands on all 17s, dealer peeks — conditioned on no dealer blackjack), the same method behind published basic-strategy tables since Baldwin et&nbsp;al. (1956) and Griffin's <i>Theory of Blackjack</i>. The ± swing is the standard deviation of each action's outcome — a typical hand runs ~±1.1&nbsp;units (Griffin/Schlesinger), doubles ~±1.9, splits more. "Costs ¢/$" is the EV you give up versus the coach's line; the count overlay flags Illustrious-18 / Fab-4 flips. Details in STRATEGY.md.
        </div>
      </div>
      </div>
    </div>
  );
}

/* --------------------- dealer-reveal timing ---------------------
   The result (dealer total + message + win flash + money, all gated together)
   fires just ~200ms after the LAST dealer card BEGINS to reveal — so the
   outcome lands in sync with the card coming into view, not well after it has
   fully settled. `drawBase`/`drawGap` mirror the card-deal delays on the felt
   (the last draw starts at drawBase + (draws-1)*drawGap); `drawOffset` /
   `flipOffset` are the short lead the result trails the card's entrance by. */
const DEAL_TIMING = { drawBase: 1000, drawGap: 620, drawOffset: 230, flipOffset: 430, opening: 720 };
function revealMsFor(cg, opening) {
  if (opening) return DEAL_TIMING.opening;
  if (cg.dealerRevealed) {
    const draws = Math.max(0, cg.dealer.length - 2);
    if (draws === 0) return DEAL_TIMING.flipOffset; // dealer stood on two — fire as the hole flips into view
    return DEAL_TIMING.drawBase + (draws - 1) * DEAL_TIMING.drawGap + DEAL_TIMING.drawOffset;
  }
  // player bust / surrender: fire as the hole flips into view
  return DEAL_TIMING.flipOffset;
}

/* --------------------- last-hands W/L strip --------------------- */
const wlp = (net) => (net > 0 ? "W" : net < 0 ? "L" : "P");
const pushRecent = (list, net) => [...(list || []), wlp(net)].slice(-7);
// count of consecutive wins ending at the most recent hand (a loss breaks it; a push doesn't extend it)
const winStreak = (recent) => { let n = 0; for (let i = (recent || []).length - 1; i >= 0; i--) { if (recent[i] === "W") n++; else break; } return n; };
/* Top-right of the felt: the last 7 round results, oldest → newest.
   While the current round's reveal is still animating (`hold`), the newest
   letter is withheld so the strip doesn't spoil the outcome early. */
function LastHands({ recent, hold }) {
  const shown = hold && recent && recent.length ? recent.slice(0, -1) : recent;
  if (!shown || shown.length === 0) return null;
  return (
    <span className="mono" aria-label="last hands, oldest to newest" style={{ position: "absolute", top: 7, right: 10, fontSize: 10, fontWeight: 800, letterSpacing: 0.5, zIndex: 2, background: "rgba(0,0,0,.25)", borderRadius: 6, padding: "2px 6px" }}>
      {shown.map((r, i) => (
        <span key={i} style={{ color: r === "W" ? "#7ce3b1" : r === "L" ? "#ffb3bd" : "#ffe9a8", marginLeft: i ? 4 : 0 }}>{r}</span>
      ))}
    </span>
  );
}

/* --------------------- felt table markings --------------------- */
/* The classic printed arcs on a real layout — pinned to the bottom of the felt,
   behind the cards (pure decoration, aria-hidden). */
function FeltMarkings() {
  return (
    <svg viewBox="0 0 400 120" preserveAspectRatio="xMidYMax meet" aria-hidden="true"
      style={{ position: "absolute", left: 0, right: 0, bottom: 4, width: "100%", height: "58%", pointerEvents: "none", opacity: 0.8, zIndex: -1 }}>
      <defs>
        <path id="feltArc1" d="M 34 96 A 200 150 0 0 1 366 96" fill="none" />
        <path id="feltArc2" d="M 62 112 A 175 130 0 0 1 338 112" fill="none" />
      </defs>
      <use href="#feltArc1" stroke="rgba(255,233,168,.22)" strokeWidth="1" />
      <text fontSize="13" fontWeight="700" letterSpacing="4" fill="rgba(255,233,168,.5)" fontFamily="Georgia,serif">
        <textPath href="#feltArc1" startOffset="50%" textAnchor="middle">BLACKJACK PAYS 3 TO 2</textPath>
      </text>
      <text fontSize="7.5" letterSpacing="2.5" fill="rgba(255,255,255,.32)">
        <textPath href="#feltArc2" startOffset="50%" textAnchor="middle">DEALER MUST STAND ON ALL 17s · INSURANCE PAYS 2 TO 1</textPath>
      </text>
    </svg>
  );
}

/* --------------------- win celebration overlay ---------------------
   Escalates with the win streak: a normal win gets a small confetti burst;
   3+ in a row adds a "N IN A ROW" badge and more confetti; 5+ turns it into
   a hot (fire-palette) burst with a radial glow and a bigger, longer flash. */
const CONFETTI_COLORS = ["#e8b64c", "#34d399", "#38bdf8", "#fb5b6b", "#a78bfa", "#f7f7f2"];
const HOT_CONFETTI = ["#ffd76a", "#ff9a3c", "#ff5b2e", "#ffcf3c", "#ff7a1a", "#ffe9a8"];
function WinFlash({ net, blackjack, streak = 0 }) {
  const warm = streak >= 3;
  const hot = streak >= 5;
  const count = 14 + (warm ? 12 : 0) + (hot ? 16 : 0);
  const palette = hot ? HOT_CONFETTI : CONFETTI_COLORS;
  const spread = hot ? 1.35 : warm ? 1.15 : 1;
  const bits = Array.from({ length: count }, (_, i) => {
    const ang = (i / count) * Math.PI * 2 + (i % 3) * 0.35;
    const dist = (70 + (i % 5) * 26) * spread;
    return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist - 30, color: palette[i % palette.length], delay: (i % 5) * 60 };
  });
  return (
    <div className="win-flash">
      {warm && <div className="streak-burst" />}
      {bits.map((b, i) => <span key={i} className="confetti" style={{ background: b.color, "--dx": b.dx + "px", "--dy": b.dy + "px", animationDelay: b.delay + "ms", width: hot ? 11 : 9, height: hot ? 11 : 9 }} />)}
      <span className={"win-text" + (hot ? " hot" : "")} style={hot ? { fontSize: "clamp(30px,7vw,48px)" } : undefined}>{blackjack ? "BLACKJACK!" : `WIN ${fmtSigned(net)}`}</span>
      {warm && <span className="streak-tag">{hot ? "🔥 " : ""}{streak} IN A ROW{hot ? " 🔥" : "!"}</span>}
    </div>
  );
}

/* --------------------- "What if?" — counterfactual replay --------------------- */
function MiniCard({ c }) { return <span className="mono" style={{ background: "#f4f4ec", color: c.red ? "#c62828" : "#1a1a1a", borderRadius: 3, padding: "0 3px", marginRight: 2, fontSize: 11, fontWeight: 700, display: "inline-block" }}>{c.rank}{c.suit}</span>; }
function WhatIf({ snap, actualNet }) {
  if (!snap) return null;
  const dUp = baseVal(snap.dealer[0]);
  const surrendered = snap.taken === "R";
  let alts;
  if (surrendered) alts = [basicOptimal(snap.player, dUp, true, splittable(snap.player))];
  else {
    alts = ["S", "H", "D"].filter((a) => a !== snap.taken);
    if (splittable(snap.player) && snap.taken !== "P") alts.push("P");
    if (snap.canSurrender) alts.push("R");
  }
  const sims = alts.map((a) => ({ a, r: simulateAlternative(snap, a) }));
  const line = ({ a, r }) => {
    if (r.surrendered) return <span style={{ color: C.sub }}>half back, hand over — guaranteed</span>;
    const single = r.hands.length === 1;
    const drawn = single ? r.hands[0].cards.slice(2) : [];
    return (
      <span style={{ color: C.sub }}>
        {single && drawn.length > 0 && <>you'd draw {drawn.map((c, i) => <MiniCard key={i} c={c} />)}→ </>}
        <b style={{ color: C.ink }}>{r.hands.map((h) => totalStr(h.cards)).join(" & ")}</b>
        {" · "}
        {r.dealerRevealed
          ? <>dealer {r.dealer.slice(1).map((c, i) => <MiniCard key={i} c={c} />)}→ <b style={{ color: r.dT > 21 ? C.split : C.ink }}>{r.dT > 21 ? "BUST" : r.dT}</b></>
          : <>dealer doesn't draw</>}
      </span>
    );
  };
  const anyBetter = sims.some(({ r }) => r.net > actualNet);
  const tookCorrect = snap.taken === snap.correct;
  return (
    <div className="rounded-lg p-3 mt-3" style={{ background: C.panel, border: `1px solid ${C.gold}` }}>
      <div className="text-xs mb-2" style={{ color: C.gold, fontWeight: 700 }}>
        WHAT IF? <span style={{ color: C.sub, fontWeight: 400 }}>— same shoe, different first move ({handDesc(snap.player)} vs {snap.dealer[0].rank}{surrendered ? ", you surrendered" : `, you took ${MOVE[snap.taken].label}`})</span>
      </div>
      <div className="grid gap-1.5">
        {sims.map(({ a, r }) => (
          <div key={a} className="flex items-center gap-2 flex-wrap text-xs">
            <span style={{ background: MOVE[a].color, color: "#0a0e0c", fontWeight: 800, fontSize: 10, padding: "1px 7px", borderRadius: 4, minWidth: 34, textAlign: "center" }}>{MOVE[a].label}</span>
            {line({ a, r })}
            <span className="mono" style={{ fontWeight: 700, color: r.net > 0 ? C.split : r.net < 0 ? C.stand : C.sub }}>{fmtSigned(r.net)}</span>
            {r.net > actualNet && <span style={{ color: C.hit, fontSize: 10, fontWeight: 700 }}>would've paid more{a !== snap.correct ? " — but it's the wrong line" : ""}</span>}
            {r.net < actualNet && <span style={{ color: C.split, fontSize: 10, fontWeight: 700 }}>your result beat it</span>}
            {r.net === actualNet && <span style={{ color: C.sub, fontSize: 10 }}>same result</span>}
          </div>
        ))}
      </div>
      <div className="text-xs mt-2 pt-2" style={{ color: C.sub, borderTop: `1px solid ${C.border}` }}>
        {surrendered
          ? (snap.correct !== "R"
            ? <>This wasn't a surrender spot — the chart line is <b style={{ color: MOVE[snap.correct].color }}>{MOVE[snap.correct].label}</b>{sims[0].r.net > actualNet ? <>, and this time it shows: playing on was worth <b style={{ color: C.stand }}>{fmtMoney(sims[0].r.net - actualNet)}</b> more</> : <> — the cards happened to forgive it this round, but the EV cost was real</>}.</>
            : sims[0].r.net < actualNet
              ? <>Surrender <b style={{ color: C.split }}>saved you {fmtMoney(actualNet - sims[0].r.net)}</b> this time — and it's the right call whenever playing on loses more than half on average.</>
              : <>Right call, unlucky peek: playing on would have done <b style={{ color: C.hit }}>{fmtMoney(sims[0].r.net - actualNet)}</b> better this time — that's one draw of the cards. Surrender is judged on the average, not the anecdote.</>)
          : tookCorrect && anyBetter
            ? <>An alternative paid better <b>this time</b> — that's <b style={{ color: C.gold }}>variance, not strategy</b>. You made the right call; over thousands of these hands the chart line wins. Don't let one lucky draw retrain you.</>
            : tookCorrect
              ? <>Right call, best result — this is what the chart line looks like when it works. It won't always (that's variance), but it wins on average.</>
              : anyBetter && sims.some(({ a, r }) => a === snap.correct && r.net > actualNet)
                ? <>The chart line ({MOVE[snap.correct].label}) <b style={{ color: C.stand }}>would have cashed here</b> — the miss had a real price this round.</>
                : <>Your off-chart move survived this round — <b style={{ color: C.gold }}>variance covering a mistake</b>. The EV cost was real even though the cards forgave it.</>}
      </div>
    </div>
  );
}

/* --------------------------- small UI bits --------------------------- */
function DealerBustStrip() {
  const max = Math.max(...DEALER.map((d) => BUST[d]));
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
function Legend() { return <div className="flex flex-wrap gap-2 mb-3">{["H", "S", "D", "P", "R"].map((k) => <span key={k} className="flex items-center gap-1.5 text-xs" style={{ color: C.sub }}><span style={{ width: 14, height: 14, borderRadius: 3, background: MOVE[k].color, display: "inline-block" }} />{MOVE[k].label}</span>)}</div>; }
function ChartBlock({ title, rows, onCell }) {
  return (
    <div className="mb-5">
      <div className="text-sm font-semibold mb-1.5" style={{ color: C.gold }}>{title}</div>
      {/* table-layout: fixed + % columns so every column stays on-screen on any phone width — no hidden horizontal scroll. */}
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 2 }}>
        <colgroup><col style={{ width: "21%" }} />{DEALER.map((d) => <col key={d} style={{ width: "7.9%" }} />)}</colgroup>
        <thead><tr><th></th>{DEALER.map((d) => <th key={d} className="text-xs" style={{ color: C.sub, fontWeight: 600 }}>{d}</th>)}</tr></thead>
        <tbody>{rows.map(([label, cells]) => <tr key={label}><td className="text-xs pr-1 text-right" style={{ color: C.ink, fontWeight: 600, fontSize: 11, lineHeight: 1.15 }}>{label}</td>{cells.split("").map((ch, i) => <td key={i}><button onClick={() => onCell(label, DEALER[i], ch)} style={{ width: "100%", aspectRatio: "1", borderRadius: 5, border: "none", cursor: "pointer", background: MOVE[ch].color, color: "#0a0e0c", fontWeight: 800, fontSize: 11 }}>{ch}</button></td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
/* Late-surrender cells for this S17 shoe (verified against evdata.js: every R cell plays out
   worse than −0.50). S17 set: 15 vs 10; 16 (not the 8,8 pair) vs 9/10/A.
   H17 tables — common outside AC — add 15 vs A, 17 vs A, and 8,8 vs A. */
const SURR_ROWS = [
  ["15", "········R·"],
  ["16 (not 8,8)", "·······RRR"],
];
function SurrenderChart() {
  return (
    <div className="mb-4">
      <div className="text-sm font-semibold mb-1.5" style={{ color: C.surrender }}>Late surrender — give up half the bet</div>
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 2 }}>
        <colgroup><col style={{ width: "23%" }} />{DEALER.map((d) => <col key={d} style={{ width: "7.7%" }} />)}</colgroup>
        <thead><tr><th></th>{DEALER.map((d) => <th key={d} className="text-xs" style={{ color: C.sub, fontWeight: 600 }}>{d}</th>)}</tr></thead>
        <tbody>{SURR_ROWS.map(([label, cells]) => <tr key={label}><td className="text-xs pr-1 text-right" style={{ color: C.ink, fontWeight: 600, fontSize: 11, lineHeight: 1.1 }}>{label}</td>{cells.split("").map((ch, i) => <td key={i}><div style={{ width: "100%", aspectRatio: "1", borderRadius: 5, background: ch === "R" ? C.surrender : C.panel2, border: ch === "R" ? "none" : `1px solid ${C.border}`, color: "#0a0e0c", fontWeight: 800, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{ch === "R" ? "R" : ""}</div></td>)}</tr>)}</tbody>
      </table>
      <div className="text-xs mt-2 rounded-lg p-3" style={{ background: C.panel2, border: `1px solid ${C.surrender}`, color: C.sub }}>
        Surrender is checked <b>first</b>, only on your original two cards. Take it and you forfeit exactly <b>half</b> your bet (EV −0.50). These cells are the hands you'd lose <i>more</i> than half the time no matter how you play them: <b style={{ color: C.ink }}>16 vs 10</b> wins only ~23% — you lose ~77% whether you hit (EV −0.54) or stand (−0.54), so bailing for −0.50 is the least-bad option. If your table has no surrender, play these as hard hits/stands from the chart above. <span style={{ opacity: .8 }}>({RULES.decks}-deck S17 — this table. Dealer-hits-soft-17 (H17) games add 15 vs A, 17 vs A, and 8,8 vs A.)</span>
      </div>
    </div>
  );
}
function Section({ title, children }) { return <div className="mb-5"><div className="font-semibold mb-1.5" style={{ color: C.gold, fontSize: 15 }}>{title}</div><div className="text-sm leading-relaxed" style={{ color: C.ink }}>{children}</div></div>; }
function Bullet({ c, k, children }) { return <div className="flex items-start gap-2 mb-1.5"><span style={{ background: c, color: "#0a0e0c", fontWeight: 800, fontSize: 11, padding: "2px 8px", borderRadius: 5, whiteSpace: "nowrap", marginTop: 1 }}>{k}</span><span className="text-sm" style={{ color: C.ink }}>{children}</span></div>; }
function Rule({ children }) { return <div className="flex items-start gap-2 text-sm" style={{ color: C.ink }}><span style={{ color: C.gold, marginTop: 1 }}>▸</span><span>{children}</span></div>; }
function Stat({ label, value, sub, color }) { return <div className="rounded-xl p-2" style={{ background: C.panel, border: `1px solid ${C.border}`, minWidth: 0 }}><div className="text-xs" style={{ color: C.sub }}>{label}</div><div className="mono" style={{ color, fontSize: 14, fontWeight: 700, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div><div className="text-xs" style={{ color: C.sub }}>{sub}</div></div>; }
function MiniStat({ label, value, color }) { return <div style={{ minWidth: 0 }}><div className="text-xs" style={{ color: C.sub }}>{label}</div><div className="mono" style={{ color, fontSize: 15, fontWeight: 700, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div></div>; }
