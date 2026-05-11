import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();
const startedAt = Date.now();

router.get("/v1/system/status", requireAuth, async (req, res) => {
  if (!req.user) return;
  if (req.user.roleName !== "Super Admin" && req.user.roleName !== "Agency Admin") {
    res.status(403).json({ success: false, message: "Super Admin or Agency Admin role required", data: null });
    return;
  }
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  try {
    const t0 = Date.now();
    await db.execute(sql`select 1`);
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const env = process.env.NODE_ENV ?? "development";
  res.json({
    success: true,
    message: "System status",
    data: {
      api: { status: "ok", uptime_seconds: Math.floor((Date.now() - startedAt) / 1000) },
      database: { status: dbOk ? "ok" : "error", latency_ms: dbLatencyMs },
      environment: env,
      backups: {
        provider: "Replit Managed PostgreSQL",
        cadence: "Automatic point-in-time recovery (PITR) — continuous WAL backups; daily full snapshots retained 7 days",
        last_known_snapshot_at: null,
        notes: "Backups are managed by the Replit platform. Restore via Replit dashboard → Database → Restore from snapshot.",
      },
      data_retention: {
        activity_logs: "Retained indefinitely",
        audit_sessions: "Retained indefinitely",
        deleted_assets: "Soft-deleted (deleted_at timestamp) — never hard-purged",
        refresh_tokens: "Auto-expire after 7 days",
      },
      disaster_recovery: {
        rpo_minutes: 5,
        rto_hours: 2,
        procedure: [
          "1. Notify Replit support and stakeholders of incident.",
          "2. Identify last-known-good snapshot in Replit dashboard → Database → Snapshots.",
          "3. Restore database to a new Replit PostgreSQL instance from snapshot.",
          "4. Update DATABASE_URL secret to point to the restored instance.",
          "5. Restart API server workflow; confirm /v1/system/status reports database OK.",
          "6. Re-issue user sessions (all refresh tokens are invalidated by restart).",
          "7. Conduct post-incident review and document root cause.",
        ],
        contacts: [
          "Director General — PNG ICA",
          "ICT Manager — PNG ICA",
          "Replit Platform Support — support@replit.com",
        ],
      },
      monitoring: {
        health_endpoint: "/api/healthz",
        log_aggregation: "Replit deployment logs (pino structured logging)",
        alerting: "Notifications module surfaces low-stock and warranty-expiry alerts to admins",
      },
    },
  });
});

export default router;
