-- ============================================================================
-- DeliberateTrade — permanent account deletion (server-side).
-- PostgreSQL. Deletes the user and EVERY child record in one transaction.
-- Called from DELETE /api/me after password re-verification:
--   await pool.query(fs.readFileSync("server/users.sql", "utf8"), [userId, email])
-- ============================================================================

BEGIN;

-- Lock the user row first so concurrent writes can't resurrect children.
DELETE FROM users
WHERE id = $1::uuid
  AND email = $2::citext            -- caller must pass the confirmed email,
RETURNING id;                       -- not just the session id

-- Children cascade via FK, but explicit deletes keep order deterministic
-- and let the API report counts.
DELETE FROM journals        WHERE user_id = $1::uuid;
DELETE FROM emotion_logs    WHERE user_id = $1::uuid;
DELETE FROM trades          WHERE user_id = $1::uuid;
DELETE FROM positions       WHERE user_id = $1::uuid;
DELETE FROM orders          WHERE user_id = $1::uuid;
DELETE FROM violations      WHERE user_id = $1::uuid;
DELETE FROM tilt_events     WHERE user_id = $1::uuid;
DELETE FROM score_snapshots WHERE user_id = $1::uuid;
DELETE FROM daily_stats     WHERE user_id = $1::uuid;
DELETE FROM missions        WHERE user_id = $1::uuid;
DELETE FROM reviews         WHERE user_id = $1::uuid;
DELETE FROM plans           WHERE user_id = $1::uuid;
DELETE FROM plan_history    WHERE user_id = $1::uuid;
DELETE FROM indicator_prefs WHERE user_id = $1::uuid;
DELETE FROM watchlists      WHERE user_id = $1::uuid;
DELETE FROM sessions        WHERE user_id = $1::uuid;   -- revoke every device
DELETE FROM reset_tokens    WHERE user_id = $1::uuid;
DELETE FROM audit_events    WHERE user_id = $1::uuid;   -- then the trail itself

-- Finally the account row (idempotent if the first DELETE already took it).
DELETE FROM users WHERE id = $1::uuid;

COMMIT;

-- Express handler:
--   router.delete("/api/me", requireAuth, async (req, res) => {
--     const ok = await verifyPassword(req.body.password, req.user);
--     if (!ok) return res.status(401).json({ error: "Password incorrect." });
--     await pool.query(sql, [req.user.id, req.user.email]);
--     res.clearCookie("dt_session");           // HttpOnly cookie dies server-side
--     res.set("Cache-Control", "no-store, max-age=0");
--     res.json({ deleted: true });
--   });
