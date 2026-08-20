/* =====================================================================
   Journal quality analysis.
   Distinguishes genuine reflection from keyboard-mash / placeholder
   garbage, produces a strict 0–100 quality score, and enforces a hard
   submission gate. Used both by the UI (JournalModal) and the store
   (defense in depth — the reducer re-validates before accepting).
   ===================================================================== */

/** High-frequency English words + trading/emotion vocabulary. A real
 *  reflection is mostly drawn from words like these. */
const KNOWN = new Set((
  "a about after again all also am an and any are as at be because been before being but by can could did do does doing " +
  "down during each even few first for from get got had has have having he her here hers him his how i if in into is it its " +
  "just like me more most my myself no not now of off on once only or other our out over own really said same she should so " +
  "some such than that the their them then there these they this those through to too under until up very was we were what " +
  "when where which while who why will with would you your yours yourself " +
  "trade trading entry exit stop loss target risk size position plan rule journal emotion feeling calm focused fomo fear " +
  "greed revenge bored overconfident fearful anxious patient impatient setup breakout pullback trend range chop level support " +
  "resistance candle wick moved moved against hit filled waited chased jumped sold bought held closed opened missed followed " +
  "broke broke violated stuck stayed panic panicked sold too early late quick slow big small tight wide " +
  "market price moved up down sideways because since after before when while if then so but and " +
  "i my me lesson learned learn next time should must need want tried attempt note thought thinking realized noticed saw " +
  "the a an is was were be been am are do did does done have had has " +
  "good bad better worse best worst right wrong correct incorrect " +
  "minutes seconds hours day session today yesterday " +
  "atr rsi macd vwap ema sma bollinger volume spread slippage fill order limit bracket " +
  "too very really quite pretty much many lot bit little " +
  "keep keep it simple k i dont don't cant can't wont won't didnt didn't thats that's im i'm ive i've"
).split(/\s+/));

export interface TextStats {
  chars: number;
  words: string[];
  wordCount: number;
  vowelRatio: number;
  maxConsonantRun: number;
  repeatedChar: boolean;
  keyboardMash: boolean;
  knownRatio: number;
  hasSentence: boolean;
  diversity: number;
}

export function analyze(raw: string): TextStats {
  const text = raw.trim().toLowerCase();
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const letters = text.replace(/[^a-z]/g, "");
  const vowels = (letters.match(/[aeiou]/g) || []).length;
  const vowelRatio = letters.length ? vowels / letters.length : 0;

  let run = 0, maxConsonantRun = 0;
  for (const ch of letters) {
    if (/[aeiou]/.test(ch)) run = 0;
    else { run++; if (run > maxConsonantRun) maxConsonantRun = run; }
  }

  const repeatedChar = /(.)\1{3,}/.test(text);
  const keyboardMash = /qwert|asdf|zxcv|qaz|wsx|wasd|poiuy|lkjhg|mnbvc/.test(text);
  const known = words.filter((w) => KNOWN.has(w.replace(/[^a-z']/g, ""))).length;
  const knownRatio = words.length ? known / words.length : 0;
  const hasSentence = /[.!?]/.test(text) && words.length >= 3;
  const unique = new Set(words).size;
  const diversity = words.length ? unique / words.length : 0;

  return { chars: text.replace(/\s+/g, "").length, words, wordCount: words.length, vowelRatio, maxConsonantRun, repeatedChar, keyboardMash, knownRatio, hasSentence, diversity };
}

/** Is this field essentially random noise / mash? */
export function isGibberish(raw: string): boolean {
  const t = analyze(raw);
  if (t.chars === 0) return true;
  if (t.chars < 4) return true;
  if (t.keyboardMash) return true;
  if (t.repeatedChar) return true;
  if (t.maxConsonantRun >= 6) return true;
  if (t.wordCount >= 2 && t.knownRatio === 0 && t.vowelRatio < 0.22) return true;
  if (t.wordCount >= 4 && t.knownRatio < 0.25 && t.vowelRatio < 0.25) return true;
  return false;
}

const PLACEHOLDER = /^(lorem|ipsum|placeholder|asdf|qwert|test|n\/?a|idk|none|nothing|-+|\.+|x+|\?+|todo|tbd|skip|ok|okay|yes|no|idc)[\s.!]*$/i;

export function isPlaceholder(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  if (t.length <= 3) return true;
  return PLACEHOLDER.test(t);
}

/** Quality of one field, 0..1. Heavily penalizes noise. */
export function fieldQuality(raw: string): number {
  const t = analyze(raw);
  if (t.chars === 0) return 0;
  if (isPlaceholder(raw)) return 0.04;

  let q = 0;
  q += 0.28 * Math.min(1, t.chars / 110);                        // length / effort
  q += 0.30 * t.knownRatio;                                      // real words
  q += 0.14 * (t.hasSentence ? 1 : t.wordCount > 4 ? 0.55 : 0.15); // structure
  q += 0.14 * t.diversity;                                       // not repeating one word
  q += 0.14 * (t.vowelRatio >= 0.2 && t.vowelRatio <= 0.6 ? 1 : t.vowelRatio >= 0.12 ? 0.4 : 0); // english-like

  if (t.keyboardMash) q *= 0.12;
  if (t.repeatedChar) q *= 0.35;
  if (t.maxConsonantRun >= 6) q *= 0.25;
  if (t.knownRatio < 0.2) q *= 0.5;
  return Math.max(0, Math.min(1, q));
}

export interface JournalFields {
  plan: string;
  whatHappened: string;
  rulesNote: string;
  lesson: string;
  followedRules: "yes" | "no";
}

export interface GateResult { ok: boolean; reason: string }

const LOW_EFFORT_MSG = "This journal is too low effort. Please write a real reflection (at least 2-3 proper sentences) before you can continue.";

/** Hard gate — blocks submission outright. */
export function journalGate(f: JournalFields): GateResult {
  const meaningful = [f.plan, f.whatHappened, f.lesson, f.followedRules === "no" ? f.rulesNote : ""].join(" ");
  const totalChars = meaningful.replace(/\s+/g, "").length;
  if (totalChars < 40) return { ok: false, reason: LOW_EFFORT_MSG };

  const required: [string, string][] = [
    ["What was the plan", f.plan],
    ["What actually happened", f.whatHappened],
    ["One concrete lesson", f.lesson],
  ];
  for (const [name, val] of required) {
    if (isGibberish(val)) return { ok: false, reason: `The “${name}” field reads like random characters. Write a real sentence about the trade.` };
    if (isPlaceholder(val)) return { ok: false, reason: `The “${name}” field is a placeholder. Fill it with a real reflection.` };
  }
  if (f.followedRules === "no" && (isGibberish(f.rulesNote) || isPlaceholder(f.rulesNote)))
    return { ok: false, reason: "You said you deviated — explain which rule and why, in a real sentence." };

  return { ok: true, reason: "" };
}

/** Words that signal genuine, specific reflection. */
const REFLECTIVE = /(because|so that|when|after|before|since|if|then|realized|noticed|should|next time|lesson|mistake|avoid|wait|size|stop|risk|plan|rule|felt|feeling|emotion|calm|fomo|fear|greed|revenge|patient|chased|jumped|early|late|\d)/i;

/** Strict 0–100 journal quality score. Garbage lands at 10–30. */
export function journalQualityScore(f: JournalFields): number {
  const base =
    fieldQuality(f.plan) * 0.22 +
    fieldQuality(f.whatHappened) * 0.30 +
    fieldQuality(f.lesson) * 0.33 +
    (f.followedRules === "no" ? fieldQuality(f.rulesNote) * 0.15 : 0.15 * 0.7);

  // specificity bonus: does it actually reference the trade / emotion / rules?
  const all = `${f.plan} ${f.whatHappened} ${f.lesson} ${f.rulesNote}`;
  const specificity = REFLECTIVE.test(all) ? 1 : 0.25;
  const digits = (all.match(/\d/g) || []).length > 0 ? 1 : 0.4;

  let score = base * 0.78 + specificity * 0.14 + digits * 0.08;

  // hard cap: if any required field is outright noise, never reward it
  if (isGibberish(f.lesson) || isGibberish(f.whatHappened)) score = Math.min(score, 0.22);

  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
