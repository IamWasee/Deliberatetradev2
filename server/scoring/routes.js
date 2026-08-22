/* =====================================================================
   Score API — Express router. Server is the ONLY authority:
     · every route requires an authenticated session (user's own rows only)
     · all SQL is parameterized ($1..$n) — no interpolation anywhere
     · rate limited; responses are no-store
     · payloads are OPAQUE: score/stage/feedback only — the formula,
       weights and thresholds never leave this process
   ===================================================================== */
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { computeProcessScore, PROCESS_SQL } from "./processScore.js";
import { computeReadinessScore } from "./readinessScore.js";
import { detectTiltSignals, decideCooldown, recordTiltEvents } from "./tiltDetection.js";

export function createScoreRouter(pool) {
  const router = Router();

  /* session auth — cookie is HttpOnly, so JS can't forge it */
  const requireAuth = (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Authentication required." });
    next();
  };

  const limiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true });
  router.use(limiter);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store, max-age=0");
    next();
  });

  /* ------------------------- Process Score -------------------------- */
  router.get("/api/scores/process", requireAuth, async (req, res, next) => {
    try {
      const [trades, violations, planRow] = await Promise.all([
        pool.query(PROCESS_SQL.trades, [req.session.userId]),
        pool.query(PROCESS_SQL.violations, [req.session.userId]),
        pool.query(PROCESS_SQL.plan, [req.session.userId]),
      ]);
      const { score, components } = computeProcessScore({
        trades: trades.rows,
        violations: violations.rows,
        plan: planRow.rows[0] ?? null,
      });
      // OPAQUE: component names + 0..1 values only. No weights, no formula.
      res.json({
        score,
        components: Object.fromEntries(
          Object.entries(components).map(([k, v]) => [k, Math.round(v * 100) / 100])),
        updatedAt: Date.now(),
      });
    } catch (err) { next(err); }
  });

  /* ------------------------- Readiness Score ------------------------ */
  router.get("/api/scores/readiness", requireAuth, async (req, res, next) => {
    try {
      const [trades, violations, planRow] = await Promise.all([
        pool.query(PROCESS_SQL.trades, [req.session.userId]),
        pool.query(PROCESS_SQL.violations, [req.session.userId]),
        pool.query(PROCESS_SQL.plan, [req.session.userId]),
      ]);
      const r = computeReadinessScore({
        trades: trades.rows,
        violations: violations.rows,
        plan: planRow.rows[0] ?? null,
      });
      res.json({
        score: r.score,
        stage: r.stage,
        feedback: r.feedback,
        gates: r.gates.map(({ id, label, pass, detail }) => ({ id, label, pass, detail })),
        components: r.components.map(({ key, label, value }) => ({
          key, label, value: Math.round(value * 100),
        })),
        updatedAt: Date.now(),
      });
    } catch (err) { next(err); }
  });

  /* --------------------- trade-close hook --------------------------- */
  /* Called by the order engine after a position closes. Re-runs tilt
     detection over the user's log, persists NEW signals, and extends
     the cooldown when the evidence is strong. The client is merely
     informed of the resulting cooldown — it cannot argue with it. */
  router.post("/api/hooks/trade-closed", requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.userId;
      const [trades, violations] = await Promise.all([
        pool.query(PROCESS_SQL.trades, [userId]),
        pool.query(PROCESS_SQL.violations, [userId]),
      ]);
      const signals = detectTiltSignals(trades.rows, violations.rows);

      const { rows: known } = await pool.query(
        `SELECT key FROM tilt_events WHERE user_id = $1 AND key = ANY($2::text[])`,
        [userId, signals.map((s) => s.key)]);
      const knownKeys = new Set(known.map((r) => r.key));
      const fresh = signals.filter((s) => !knownKeys.has(s.key));
      if (fresh.length) await recordTiltEvents(pool, userId, fresh);

      const { rows: [user] } = await pool.query(
        `SELECT cooldown_until FROM users WHERE id = $1`, [userId]);
      const prev = user?.cooldown_until ? new Date(user.cooldown_until).getTime() : 0;
      const decision = decideCooldown(signals, prev);
      if (decision.apply) {
        await pool.query(
          `UPDATE users SET cooldown_until = to_timestamp($2::double precision / 1000)
           WHERE id = $1 AND (cooldown_until IS NULL
             OR cooldown_until < to_timestamp($2::double precision / 1000))`,
          [userId, decision.expiresAt]);
      }

      // daily_stats rollup (consistency component input)
      await pool.query(
        `INSERT INTO daily_stats (user_id, day, trades, pnl, violations, tilt_signals)
         SELECT $1, (to_timestamp($3::double precision / 1000))::date, 1, $4, $5, $6
         ON CONFLICT (user_id, day) DO UPDATE SET
           trades = daily_stats.trades + 1,
           pnl = daily_stats.pnl + $4,
           violations = daily_stats.violations + $5,
           tilt_signals = daily_stats.tilt_signals + $6`,
        [userId, null, req.body.exitTs ?? Date.now(), req.body.pnl ?? 0,
         (req.body.violations || []).length, fresh.length]);

      res.json({
        newSignals: fresh.length,
        cooldownUntil: decision.apply ? decision.expiresAt : prev || null,
        reasons: decision.reasons,
      });
    } catch (err) { next(err); }
  });

  return router;
}
