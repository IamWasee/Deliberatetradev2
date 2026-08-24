/* =====================================================================
   Tilt / revenge-trading detection — SERVER-SIDE, trade data only.
   Six behavioral signals. Every detection is persisted to tilt_events
   for analysis and feeds the Post-Loss component of the Process Score.
   The frontend never sees weights or thresholds — only outcomes.
   ===================================================================== */

const RAPID_MS = 5 * 60 * 1000;        // re-entry window
const RULE_WINDOW_MS = 10 * 60 * 1000; // rule-break window after a loss
const BURST_WINDOW_MS = 30 * 60 * 1000;

/**
 * @typedef {Object} TradeRow  (SELECT * FROM trades WHERE user_id = $1 ORDER BY exit_ts)
 * @property {string} id
 * @property {string} side          'long' | 'short'
 * @property {number} pnl
 * @property {number} r
 * @property {number} risk_amount
 * @property {string} setup
 * @property {boolean} override
 * @property {string[]} violations
 * @property {number} entry_ts
 * @property {number} exit_ts
 */

const isLoss = (t) => t.pnl < 0 || t.r < 0;

/** The trader's "normal book": their two most-used setups. */
function normalSetups(trades) {
  const counts = new Map();
  for (const t of trades) counts.set(t.setup, (counts.get(t.setup) || 0) + 1);
  return new Set([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s));
}

/**
 * Detect all six tilt signals for a user's ordered trade log.
 * Pure function — deterministic over the same rows.
 *
 * @param {TradeRow[]} trades   sorted by exit_ts ascending
 * @param {{ id: string; rule: string; ts: number }[]} violations
 * @returns {Array<{ key: string; type: string; severity: 1|2|3; at: number; detail: string }>}
 */
export function detectTiltSignals(trades, violations = []) {
  const out = [];
  const usual = normalSetups(trades);

  // personal baseline: trades per 30-min window across history
  let baseline = 1;
  if (trades.length >= 8) {
    const span = Math.max(BURST_WINDOW_MS, trades[trades.length - 1].entry_ts - trades[0].entry_ts);
    baseline = trades.length / (span / BURST_WINDOW_MS);
  }

  trades.forEach((t, i) => {
    if (!isLoss(t)) return;
    const next = trades.slice(i + 1, i + 4); // next ≤3 trades

    /* 1 · SIZE UP AFTER LOSS — risk +50% or more within next 3 trades */
    for (const n of next) {
      if (t.risk_amount > 0 && n.risk_amount >= t.risk_amount * 1.5) {
        out.push({
          key: `size:${t.id}:${n.id}`, type: "size-up-after-loss", severity: 2, at: n.entry_ts,
          detail: `Risk ${t.risk_amount} → ${n.risk_amount} (+${Math.round((n.risk_amount / t.risk_amount - 1) * 100)}%) within 3 trades of a loss`,
        });
        break;
      }
    }

    /* 2 · RAPID RE-ENTRY — new trade opened ≤5 min after the losing close */
    const re = trades.slice(i + 1).find((n) => n.entry_ts - t.exit_ts >= 0 && n.entry_ts - t.exit_ts <= RAPID_MS);
    if (re) {
      const mins = (re.entry_ts - t.exit_ts) / 60000;
      out.push({
        key: `rapid:${t.id}:${re.id}`, type: "rapid-reentry", severity: mins < 2 ? 2 : 1, at: re.entry_ts,
        detail: `Re-entered ${mins.toFixed(1)} min after a losing close`,
      });
    }

    /* 6 · REVENGE DIRECTION FLIP — immediate opposite side, ≥125% size, ≤5 min */
    const imm = trades[i + 1];
    if (imm && imm.side !== t.side && imm.entry_ts - t.exit_ts <= RAPID_MS &&
        t.risk_amount > 0 && imm.risk_amount >= t.risk_amount * 1.25) {
      out.push({
        key: `flip:${t.id}:${imm.id}`, type: "revenge-flip", severity: 3, at: imm.entry_ts,
        detail: `Flipped ${t.side} → ${imm.side} at ${Math.round((imm.risk_amount / t.risk_amount) * 100)}% size, ${((imm.entry_ts - t.exit_ts) / 60000).toFixed(1)} min after the loss`,
      });
    }

    /* 3 · SETUP ABANDON — after ≥2 straight losses, leaves the usual book */
    let streak = 0;
    for (let k = i; k >= 0 && isLoss(trades[k]); k--) streak++;
    if (streak >= 2 && usual.size > 0) {
      const after = trades[i + 1];
      if (after && !usual.has(after.setup)) {
        out.push({
          key: `abandon:${t.id}:${after.id}`, type: "setup-abandon", severity: 2, at: after.entry_ts,
          detail: `After ${streak} straight losses, left usual setups for “${after.setup}”`,
        });
      }
    }

    /* 4 · RULE BREAK AFTER LOSS — violation within 10 min or next 3 trades */
    const near = violations.filter((v) => v.ts > t.exit_ts && v.ts <= t.exit_ts + RULE_WINDOW_MS);
    if (near.length > 0) {
      out.push({
        key: `break:${t.id}:${near[0].id}`, type: "rule-break-after-loss", severity: 3, at: near[0].ts,
        detail: `${near[0].rule} shortly after a losing close`,
      });
    } else {
      const breaker = next.find((n) => (n.violations || []).length > 0 || n.override);
      if (breaker) {
        out.push({
          key: `break:${t.id}:${breaker.id}`, type: "rule-break-after-loss", severity: 3, at: breaker.entry_ts,
          detail: "Risk rule broken on the very next trade after a loss",
        });
      }
    }

    /* 5 · OVERTRADING BURST — ≥2.5× personal rate in the next 30 min */
    const burst = trades.filter((n) => n.entry_ts > t.exit_ts && n.entry_ts <= t.exit_ts + BURST_WINDOW_MS).length;
    if (burst >= 4 && burst >= baseline * 2.5) {
      out.push({
        key: `burst:${t.id}`, type: "overtrading-burst", severity: 2, at: t.exit_ts + 60000,
        detail: `${burst} trades in 30 min after a loss vs ${baseline.toFixed(1)}/window norm`,
      });
    }
  });

  return out;
}

/**
 * Post-loss discipline, 0..1 — recency-weighted (7-day half-life) so old
 * mistakes fade but recent tilt hits hard. Feeds the 25% Post-Loss
 * component of the Process Score.
 */
export function postLossComponent(trades, signals, now = Date.now()) {
  const DAY = 86400000;
  if (!trades.some(isLoss)) return 0.8; // untested — neutral, never perfect
  let score = 1;
  for (const s of signals) {
    const ageDays = Math.max(0, now - s.at) / DAY;
    const decay = Math.pow(0.5, ageDays / 7);
    score -= (s.severity === 3 ? 0.24 : s.severity === 2 ? 0.16 : 0.08) * decay;
  }
  return Math.max(0, Math.min(1, score));
}

/**
 * Cooldown decision — called from the trade-close hook. Strong signals
 * trigger or EXTEND an existing cooldown; returns the new expiry (ms).
 */
export function decideCooldown(signals, previousExpiry = 0, now = Date.now()) {
  const recent = signals.filter((s) => now - s.at <= 15 * 60 * 1000);
  const sev = recent.reduce((a, s) => a + s.severity, 0);
  if (sev < 2) return { apply: false, expiresAt: previousExpiry, reasons: [] };
  const seconds = Math.min(240, 60 + 25 * sev);
  return {
    apply: true,
    expiresAt: Math.max(previousExpiry, now + seconds * 1000),
    reasons: [...new Set(recent.map((s) => s.type))],
  };
}

/**
 * Persist new signals for analysis. Idempotent on (user_id, key).
 * @param {import('pg').Pool} pool
 */
export async function recordTiltEvents(pool, userId, signals) {
  for (const s of signals) {
    await pool.query(
      `INSERT INTO tilt_events (user_id, key, type, severity, at, detail)
       VALUES ($1, $2, $3, $4, to_timestamp($5::double precision / 1000), $6)
       ON CONFLICT (user_id, key) DO NOTHING`,
      [userId, s.key, s.type, s.severity, s.at, s.detail],
    );
  }
}
