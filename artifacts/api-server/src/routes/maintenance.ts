import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db, maintenanceSchedules, assets, users, provinces, notifications, activityLogs,
} from "@workspace/db";
import { requireAuth, requireAssetAdmin } from "../lib/auth";

const router = Router();

router.get("/v1/maintenance", requireAuth, async (req, res) => {
  try {
    const { status, assetId, priority } = req.query as { status?: string; assetId?: string; priority?: string };
    const { user } = req;

    const rows = await db
      .select({
        id: maintenanceSchedules.id,
        title: maintenanceSchedules.title,
        description: maintenanceSchedules.description,
        status: maintenanceSchedules.status,
        priority: maintenanceSchedules.priority,
        scheduledDate: maintenanceSchedules.scheduledDate,
        completedDate: maintenanceSchedules.completedDate,
        estimatedCost: maintenanceSchedules.estimatedCost,
        actualCost: maintenanceSchedules.actualCost,
        notes: maintenanceSchedules.notes,
        completionNotes: maintenanceSchedules.completionNotes,
        createdAt: maintenanceSchedules.createdAt,
        assetId: maintenanceSchedules.assetId,
        assetTag: assets.assetTag,
        assetName: assets.assetName,
        assetProvinceId: assets.provinceId,
        provinceName: provinces.provinceName,
        assignedTo: maintenanceSchedules.assignedTo,
        assignedToName: users.fullName,
      })
      .from(maintenanceSchedules)
      .leftJoin(assets, eq(maintenanceSchedules.assetId, assets.id))
      .leftJoin(provinces, eq(assets.provinceId, provinces.id))
      .leftJoin(users, eq(maintenanceSchedules.assignedTo, users.id))
      .orderBy(desc(maintenanceSchedules.scheduledDate));

    let filtered = rows;
    if (user.scopeLevel !== "national" && user.provinceId) {
      filtered = filtered.filter(r => r.assetProvinceId === user.provinceId);
    }
    if (status) filtered = filtered.filter(r => r.status === status);
    if (assetId) filtered = filtered.filter(r => r.assetId === assetId);
    if (priority) filtered = filtered.filter(r => r.priority === priority);

    res.json({ success: true, data: filtered });
  } catch (err) {
    req.log.error({ err }, "List maintenance error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/maintenance", requireAuth, requireAssetAdmin, async (req, res) => {
  try {
    const { assetId, title, description, priority, scheduledDate, assignedTo, estimatedCost, notes } = req.body as {
      assetId: string; title: string; description?: string; priority?: string;
      scheduledDate: string; assignedTo?: string; estimatedCost?: number; notes?: string;
    };

    if (!assetId || !title?.trim() || !scheduledDate) {
      return res.status(400).json({ success: false, message: "assetId, title, and scheduledDate are required", data: null });
    }

    const [created] = await db.insert(maintenanceSchedules).values({
      assetId,
      title: title.trim(),
      description: description?.trim() ?? null,
      priority: (priority as "low" | "medium" | "high" | "critical") ?? "medium",
      scheduledDate: new Date(scheduledDate),
      assignedTo: assignedTo ?? null,
      estimatedCost: estimatedCost != null ? String(estimatedCost) : null,
      notes: notes?.trim() ?? null,
      createdBy: req.user.userId,
    }).returning();

    if (assignedTo) {
      const [asset] = await db.select({ assetName: assets.assetName }).from(assets).where(eq(assets.id, assetId)).limit(1);
      await db.insert(notifications).values({
        userId: assignedTo,
        title: "Maintenance Task Assigned",
        message: `You have been assigned a maintenance task "${title}" for asset ${asset?.assetName ?? assetId}.`,
      }).catch(() => null);
    }

    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "MAINTENANCE_SCHEDULED",
      entityType: "asset",
      entityId: assetId,
      description: `Maintenance scheduled: ${title}`,
    }).catch(() => null);

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    req.log.error({ err }, "Create maintenance error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/maintenance/:id", requireAuth, async (req, res) => {
  try {
    const [row] = await db
      .select({
        id: maintenanceSchedules.id,
        title: maintenanceSchedules.title,
        description: maintenanceSchedules.description,
        status: maintenanceSchedules.status,
        priority: maintenanceSchedules.priority,
        scheduledDate: maintenanceSchedules.scheduledDate,
        completedDate: maintenanceSchedules.completedDate,
        estimatedCost: maintenanceSchedules.estimatedCost,
        actualCost: maintenanceSchedules.actualCost,
        notes: maintenanceSchedules.notes,
        completionNotes: maintenanceSchedules.completionNotes,
        createdAt: maintenanceSchedules.createdAt,
        assetId: maintenanceSchedules.assetId,
        assetTag: assets.assetTag,
        assetName: assets.assetName,
        provinceName: provinces.provinceName,
        assignedTo: maintenanceSchedules.assignedTo,
        assignedToName: users.fullName,
      })
      .from(maintenanceSchedules)
      .leftJoin(assets, eq(maintenanceSchedules.assetId, assets.id))
      .leftJoin(provinces, eq(assets.provinceId, provinces.id))
      .leftJoin(users, eq(maintenanceSchedules.assignedTo, users.id))
      .where(eq(maintenanceSchedules.id, req.params.id))
      .limit(1);

    if (!row) return res.status(404).json({ success: false, message: "Not found", data: null });
    res.json({ success: true, data: row });
  } catch (err) {
    req.log.error({ err }, "Get maintenance error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/maintenance/:id", requireAuth, requireAssetAdmin, async (req, res) => {
  try {
    const { title, description, priority, status, scheduledDate, assignedTo, estimatedCost, actualCost, notes, completionNotes } = req.body as {
      title?: string; description?: string; priority?: string; status?: string;
      scheduledDate?: string; assignedTo?: string; estimatedCost?: number; actualCost?: number;
      notes?: string; completionNotes?: string;
    };

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (title) patch.title = title.trim();
    if (description !== undefined) patch.description = description?.trim() ?? null;
    if (priority) patch.priority = priority;
    if (status) {
      patch.status = status;
      if (status === "completed") patch.completedDate = new Date();
    }
    if (scheduledDate) patch.scheduledDate = new Date(scheduledDate);
    if (assignedTo !== undefined) patch.assignedTo = assignedTo || null;
    if (estimatedCost !== undefined) patch.estimatedCost = estimatedCost != null ? String(estimatedCost) : null;
    if (actualCost !== undefined) patch.actualCost = actualCost != null ? String(actualCost) : null;
    if (notes !== undefined) patch.notes = notes?.trim() ?? null;
    if (completionNotes !== undefined) patch.completionNotes = completionNotes?.trim() ?? null;

    const [updated] = await db.update(maintenanceSchedules).set(patch).where(eq(maintenanceSchedules.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ success: false, message: "Not found", data: null });

    if (status === "completed") {
      await db.insert(activityLogs).values({
        userId: req.user.userId,
        actionType: "MAINTENANCE_COMPLETED",
        entityType: "asset",
        entityId: updated.assetId,
        description: `Maintenance completed: ${updated.title}`,
      }).catch(() => null);
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    req.log.error({ err }, "Patch maintenance error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.delete("/v1/maintenance/:id", requireAuth, requireAssetAdmin, async (req, res) => {
  try {
    const [deleted] = await db.delete(maintenanceSchedules).where(eq(maintenanceSchedules.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ success: false, message: "Not found", data: null });
    res.json({ success: true, data: null });
  } catch (err) {
    req.log.error({ err }, "Delete maintenance error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
