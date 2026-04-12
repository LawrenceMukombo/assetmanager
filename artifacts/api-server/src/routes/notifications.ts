import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notifications } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/v1/notifications", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.user.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    res.json({ success: true, data: rows });
  } catch (err) {
    req.log.error({ err }, "Get notifications error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.patch("/v1/notifications/:id/read", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    const [updated] = await db
      .update(notifications)
      .set({ readStatus: true })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, req.user.userId)))
      .returning();
    if (!updated) {
      res.status(404).json({ success: false, message: "Notification not found" });
      return;
    }
    res.json({ success: true, message: "Marked as read" });
  } catch (err) {
    req.log.error({ err }, "Mark notification read error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
