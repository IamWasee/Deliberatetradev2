/* =====================================================================
   Journal quality engine — hard gate + strict 0–100 scoring.
   Gibberish / keyboard-mash submissions are rejected outright;
   low-effort ones score 10–30 and tank the (low-weight) journal
   component of the Process Score.
   ===================================================================== */

export interface JournalFields {
  plan: string; whatHappened: string; rulesNote: string; lesson: string;
  followedRules: "yes" | "no";
}

const PLACEHOLDERS = ["n/a", "na", "none", "idk", "lol", "test", "todo", "tbd", "asdf", "qwerty", "lorem", "ipsum", "…", "...", "-"];
const REPEAT_RE = /(.)\1{5,}/; // same char 6+ times
const WORD_REPEAT_RE = /\b(\w{2,})\b(?:\s+\1\b){4,}/i; // same word 5+ times
const KEYBOARD_MASH = /^[^aeiou\s]{6,}$/i; // long vowel-free run = mash

function realWords(text: string): string[] {
  return text.toLowerCase().split(/[^a-z']+/).filter((w) => w.length >= 3);
}
function isGibberishWord(w: string): boolean {
  if (KEYBOARD_MASH.test(w)) return true;
  const vowels = (w.match(/[aeiou]/g) ?? []).length;
  return w.length >= 6 && vowels === 0;
}
const hasSentence = (t: string) => /\b\w+\b\s+\b\w+\b\s+\b\w+\b/.test(t);

function fieldIsGarbage(t: string): boolean {
  const s = t.trim().toLowerCase();
  if (!s) return true;
  if (PLACEHOLDERS.includes(s)) return true;
  if (REPEAT_RE.test(s)) return true;
  if (WORD_REPEAT_RE.test(s)) return true;
  const words = realWords(s);
  if (words.length === 0) return s.replace(/[^a-z0-9]/gi, "").length > 8; // symbols/digits mash
  const junk = words.filter(isGibberishWord).length;
  return junk / words.length > 0.5;
}

export interface GateResult { ok: boolean; reason: string }

/** HARD GATE — blocks submission entirely. */
export function journalGate(f: JournalFields): GateResult {
  const fields: [string, string][] = [
    ["the plan", f.plan], ["what happened", f.whatHappened],
    ["the lesson", f.lesson],
    ...(f.followedRules === "no" ? [["the rules note", f.rulesNote] as [string, string]] : []),
  ];
  for (const [label, text] of fields) {
    if (!text || text.trim().length === 0) return { ok: false, reason: `Required field empty: ${label}.` };
    if (fieldIsGarbage(text))
      return { ok: false, reason: `“${label}” reads like random characters. Write a real reflection (at least 2–3 proper sentences) before you can continue.` };
  }
  const total = realWords(f.plan).length + realWords(f.whatHappened).length + realWords(f.lesson).length;
  const meaningfulChars = (f.plan + f.whatHappened + f.lesson).replace(/\s/g, "").length;
  if (meaningfulChars < 40 || total < 10)
    return { ok: false, reason: "This journal is too low effort. Please write a real reflection (at least 2–3 proper sentences) before you can continue." };
  if (!hasSentence(f.plan) || !hasSentence(f.lesson))
    return { ok: false, reason: "Answers need full sentences — the plan and the lesson both read like fragments. Expand them." };
  return { ok: true, reason: "" };
}

/** STRICT SCORE 0–100. Nonsense lands in 10–30 by construction. */
export function journalQualityScore(f: JournalFields): number {
  const texts = [f.plan, f.whatHappened, f.rulesNote, f.lesson];
  const words = texts.flatMap(realWords);
  const totalWords = words.length;
  if (totalWords < 8) return 10;

  const junk = words.filter(isGibberishWord).length;
  const realRatio = 1 - junk / totalWords;

  // 1 · effort (0–30): word count, saturating at ~90 words
  const effort = Math.min(1, totalWords / 90) * 30;
  // 2 · sentence structure (0–20)
  const sentences = texts.filter(hasSentence).length;
  const structure = (sentences / 4) * 20;
  // 3 · specificity (0–25): names the trade, emotion, rule, lesson
  const all = texts.join(" ").toLowerCase();
  const mentions = [
    /\b(stop|entry|target|size|risk|atr|setup|breakout|pullback|support|resistance|long|short|position)\b/,
    /\b(felt|emotion|fomo|fear|calm|angry|anxious|greed|impatient|disciplined|tilted|revenge)\b/,
    /\b(rule|plan|broke|followed|violated|adhered|checklist|process)\b/,
    /\b(learn|lesson|next time|will|i should|improve|avoid|mistake)\b/,
  ].filter((re) => re.test(all)).length;
  const specificity = (mentions / 4) * 25;
  // 4 · reflection depth (0–15): first-person + causal language
  const reflection = [/\b(i|i'm|my)\b/, /\b(because|so|therefore|led to|caused|resulted)\b/, /\b(if|when|next time)\b/]
    .filter((re) => re.test(all)).length;
  const depth = (reflection / 3) * 15;
  // 5 · diversity (0–10): unique/total ratio
  const unique = new Set(words).size;
  const diversity = Math.min(1, unique / Math.max(1, totalWords * 0.55)) * 10;

  let score = effort + structure + specificity + depth + diversity;
  score *= realRatio;                                   // gibberish collapses everything
  if (WORD_REPEAT_RE.test(all) || REPEAT_RE.test(all)) score *= 0.4;
  return Math.max(0, Math.min(100, Math.round(score)));
}
