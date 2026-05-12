import { Router } from "express";
import { eq, and, desc, inArray, count } from "drizzle-orm";
import {
  db, auditSessions, auditAssignments, auditItems,
  provinces, districts, facilities, users, assets, notifications,
} from "@workspace/db";
import { requireAuth, requireAssetAdmin } from "../lib/auth";
import { readPageParams, paginatedResponse, paginateArray } from "../lib/pagination";

const router = Router();

router.get("/v1/audit/sessions", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const rows = await db
      .select({
        id: auditSessions.id,
        name: auditSessions.name,
        description: auditSessions.description,
        status: auditSessions.status,
        startDate: auditSessions.startDate,
        endDate: auditSessions.endDate,
        createdAt: auditSessions.createdAt,
        provinceId: auditSessions.provinceId,
        provinceName: provinces.provinceName,
        createdByName: users.fullName,
      })
      .from(auditSessions)
      .leftJoin(provinces, eq(auditSessions.provinceId, provinces.id))
      .leftJoin(users, eq(auditSessions.createdBy, users.id))
      .orderBy(desc(auditSessions.createdAt));

    const filtered = user.scopeLevel === "national"
      ? rows
      : rows.filter(r => !r.provinceId || r.provinceId === user.provinceId);

    const pageParams = readPageParams(req);
    if (pageParams.enabled) {
      const { items, total } = paginateArray(filtered, pageParams);
      res.json({ success: true, data: paginatedResponse(items, total, pageParams) });
      return;
    }
    res.json({ success: true, data: filtered });
  } catch (err) {
    req.log.error({ err }, "List audit sessions error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/audit/sessions", requireAuth, requireAssetAdmin, async (req, res) => {
  try {
    const { name, description, provinceId, startDate, endDate } = req.body as {
      name: string; description?: string; provinceId?: string; startDate?: string; endDate?: string;
    };
    if (!name?.trim()) { res.status(400).json({ success: false, message: "Name is required", data: null }); return; }

    const scopedProvinceId = req.user!.scopeLevel !== "national" ? req.user!.provinceId : (provinceId ?? null);

    const [created] = await db.insert(auditSessions).values({
      name: name.trim(),
      description: description?.trim() ?? null,
      provinceId: scopedProvinceId,
      createdBy: req.user!.userId,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    }).returning();

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    req.log.error({ err }, "Create audit session error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/audit/sessions/:id", requireAuth, async (req, res) => {
  try {
    const [session] = await db
      .select({
        id: auditSessions.id,
        name: auditSessions.name,
        description: auditSessions.description,
        status: auditSessions.status,
        startDate: auditSessions.startDate,
        endDate: auditSessions.endDate,
        createdAt: auditSessions.createdAt,
        provinceId: auditSessions.provinceId,
        provinceName: provinces.provinceName,
        createdByName: users.fullName,
      })
      .from(auditSessions)
      .leftJoin(provinces, eq(auditSessions.provinceId, provinces.id))
      .leftJoin(users, eq(auditSessions.createdBy, users.id))
      .where(eq(auditSessions.id, req.params.id as string))
      .limit(1);

    if (!session) { res.status(404).json({ success: false, message: "Session not found", data: null }); return; }

    const assignments = await db
      .select({
        id: auditAssignments.id,
        status: auditAssignments.status,
        dueDate: auditAssignments.dueDate,
        createdAt: auditAssignments.createdAt,
        provinceId: auditAssignments.provinceId,
        districtId: auditAssignments.districtId,
        facilityId: auditAssignments.facilityId,
        provinceName: provinces.provinceName,
        districtName: districts.districtName,
        facilityName: facilities.facilityName,
        assignedToName: users.fullName,
        assignedTo: auditAssignments.assignedTo,
      })
      .from(auditAssignments)
      .leftJoin(provinces, eq(auditAssignments.provinceId, provinces.id))
      .leftJoin(districts, eq(auditAssignments.districtId, districts.id))
      .leftJoin(facilities, eq(auditAssignments.facilityId, facilities.id))
      .leftJoin(users, eq(auditAssignments.assignedTo, users.id))
      .where(eq(auditAssignments.sessionId, req.params.id as string))
      .orderBy(desc(auditAssignments.createdAt));

    const assignmentIds = assignments.map(a => a.id);
    const itemCounts = assignmentIds.length > 0
      ? await db
          .select({ assignmentId: auditItems.assignmentId, cnt: count() })
          .from(auditItems)
          .where(inArray(auditItems.assignmentId, assignmentIds))
          .groupBy(auditItems.assignmentId)
      : [];

    const countMap = Object.fromEntries(itemCounts.map(r => [r.assignmentId, Number(r.cnt)]));
    const enriched = assignments.map(a => ({ ...a, itemCount: countMap[a.id] ?? 0 }));

    res.json({ success: true, data: { ...session, assignments: enriched } });
  } catch (err) {
    req.log.error({ err }, "Get audit session error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/audit/sessions/:id/neighbors", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const id = req.params.id as string;
    const { status } = req.query as { status?: string };

    const rows = await db
      .select({
        id: auditSessions.id,
        name: auditSessions.name,
        status: auditSessions.status,
        provinceId: auditSessions.provinceId,
        provinceName: provinces.provinceName,
      })
      .from(auditSessions)
      .leftJoin(provinces, eq(auditSessions.provinceId, provinces.id))
      .orderBy(desc(auditSessions.createdAt));

    let filtered = user.scopeLevel === "national"
      ? rows
      : rows.filter(r => !r.provinceId || r.provinceId === user.provinceId);

    if (status) {
      filtered = filtered.filter(r => r.status === status);
    }

    const idx = filtered.findIndex(r => r.id === id);
    const toNeighbor = (r: typeof filtered[number] | undefined) =>
      r ? { id: r.id, title: r.name, subtitle: r.provinceName ?? null } : null;

    if (idx === -1) {
      // Confirm the session itself exists & is visible to the user (regardless of filter)
      const visible = (user.scopeLevel === "national" ? rows : rows.filter(r => !r.provinceId || r.provinceId === user.provinceId))
        .some(r => r.id === id);
      if (!visible) {
        res.status(404).json({ success: false, message: "Session not found", data: null });
        return;
      }
      res.json({
        success: true,
        message: "Neighbors retrieved",
        data: { previous: null, next: null, position: 0, total: filtered.length, in_context: false },
      });
      return;
    }

    res.json({
      success: true,
      message: "Neighbors retrieved",
      data: {
        previous: toNeighbor(filtered[idx - 1]),
        next: toNeighbor(filtered[idx + 1]),
        position: idx + 1,
        total: filtered.length,
        in_context: true,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Get audit session neighbors error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/audit/sessions/:id", requireAuth, requireAssetAdmin, async (req, res) => {
  try {
    const { status, name, description, startDate, endDate } = req.body as {
      status?: string; name?: string; description?: string; startDate?: string; endDate?: string;
    };
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (status) patch.status = status;
    if (name) patch.name = name.trim();
    if (description !== undefined) patch.description = description?.trim() ?? null;
    if (startDate !== undefined) patch.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) patch.endDate = endDate ? new Date(endDate) : null;

    const [updated] = await db.update(auditSessions)
      .set(patch)
      .where(eq(auditSessions.id, req.params.id as string))
      .returning();

    if (!updated) { res.status(404).json({ success: false, message: "Session not found", data: null }); return; }
    res.json({ success: true, data: updated });
  } catch (err) {
    req.log.error({ err }, "Patch audit session error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/audit/sessions/:id/assignments", requireAuth, requireAssetAdmin, async (req, res) => {
  try {
    const { provinceId, districtId, facilityId, assignedTo, dueDate } = req.body as {
      provinceId?: string; districtId?: string; facilityId?: string; assignedTo?: string; dueDate?: string;
    };

    const [session] = await db.select().from(auditSessions).where(eq(auditSessions.id, req.params.id as string)).limit(1);
    if (!session) { res.status(404).json({ success: false, message: "Session not found", data: null }); return; }

    const [assignment] = await db.insert(auditAssignments).values({
      sessionId: req.params.id as string,
      provinceId: provinceId ?? session.provinceId ?? null,
      districtId: districtId ?? null,
      facilityId: facilityId ?? null,
      assignedTo: assignedTo ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
    }).returning();

    if (assignedTo) {
      await db.insert(notifications).values({
        userId: assignedTo,
        title: "New Audit Assignment",
        message: `You have been assigned to audit "${session.name}". Please complete the verification.`,
      }).catch(() => null);
    }

    if (facilityId) {
      const facilityAssets = await db
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.facilityId, facilityId), eq(assets.status, "active")));

      if (facilityAssets.length > 0) {
        await db.insert(auditItems).values(
          facilityAssets.map(a => ({ assignmentId: assignment.id, assetId: a.id }))
        );
      }
    }

    res.status(201).json({ success: true, data: assignment });
  } catch (err) {
    req.log.error({ err }, "Create audit assignment error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/audit/assignments/mine", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: auditAssignments.id,
        status: auditAssignments.status,
        dueDate: auditAssignments.dueDate,
        createdAt: auditAssignments.createdAt,
        facilityId: auditAssignments.facilityId,
        facilityName: facilities.facilityName,
        districtName: districts.districtName,
        provinceName: provinces.provinceName,
        sessionId: auditAssignments.sessionId,
        sessionName: auditSessions.name,
        sessionStatus: auditSessions.status,
      })
      .from(auditAssignments)
      .leftJoin(facilities, eq(auditAssignments.facilityId, facilities.id))
      .leftJoin(districts, eq(auditAssignments.districtId, districts.id))
      .leftJoin(provinces, eq(auditAssignments.provinceId, provinces.id))
      .leftJoin(auditSessions, eq(auditAssignments.sessionId, auditSessions.id))
      .where(eq(auditAssignments.assignedTo, req.user!.userId))
      .orderBy(desc(auditAssignments.createdAt));

    res.json({ success: true, data: rows });
  } catch (err) {
    req.log.error({ err }, "Get my assignments error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/audit/assignments/:id", requireAuth, async (req, res) => {
  try {
    const [assignment] = await db
      .select({
        id: auditAssignments.id,
        sessionId: auditAssignments.sessionId,
        status: auditAssignments.status,
        dueDate: auditAssignments.dueDate,
        facilityId: auditAssignments.facilityId,
        facilityName: facilities.facilityName,
        districtName: districts.districtName,
        provinceName: provinces.provinceName,
        assignedTo: auditAssignments.assignedTo,
        assignedToName: users.fullName,
        sessionName: auditSessions.name,
      })
      .from(auditAssignments)
      .leftJoin(facilities, eq(auditAssignments.facilityId, facilities.id))
      .leftJoin(districts, eq(auditAssignments.districtId, districts.id))
      .leftJoin(provinces, eq(auditAssignments.provinceId, provinces.id))
      .leftJoin(users, eq(auditAssignments.assignedTo, users.id))
      .leftJoin(auditSessions, eq(auditAssignments.sessionId, auditSessions.id))
      .where(eq(auditAssignments.id, req.params.id as string))
      .limit(1);

    if (!assignment) { res.status(404).json({ success: false, message: "Assignment not found", data: null }); return; }

    const items = await db
      .select({
        id: auditItems.id,
        assetId: auditItems.assetId,
        status: auditItems.status,
        conditionObserved: auditItems.conditionObserved,
        gpsLat: auditItems.gpsLat,
        gpsLon: auditItems.gpsLon,
        photoUrl: auditItems.photoUrl,
        notes: auditItems.notes,
        verifiedAt: auditItems.verifiedAt,
        assetTag: assets.assetTag,
        assetName: assets.assetName,
        assetStatus: assets.status,
        assetCondition: assets.condition,
      })
      .from(auditItems)
      .leftJoin(assets, eq(auditItems.assetId, assets.id))
      .where(eq(auditItems.assignmentId, req.params.id as string))
      .orderBy(assets.assetTag);

    res.json({ success: true, data: { ...assignment, items } });
  } catch (err) {
    req.log.error({ err }, "Get audit assignment error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/audit/items/:id", requireAuth, async (req, res) => {
  try {
    const { status, conditionObserved, gpsLat, gpsLon, photoUrl, notes } = req.body as {
      status?: string; conditionObserved?: string; gpsLat?: number; gpsLon?: number; photoUrl?: string; notes?: string;
    };

    const patch: Record<string, unknown> = {};
    if (status) { patch.status = status; patch.verifiedBy = req.user!.userId; patch.verifiedAt = new Date(); }
    if (conditionObserved !== undefined) patch.conditionObserved = conditionObserved;
    if (gpsLat !== undefined) patch.gpsLat = String(gpsLat);
    if (gpsLon !== undefined) patch.gpsLon = String(gpsLon);
    if (photoUrl !== undefined) patch.photoUrl = photoUrl;
    if (notes !== undefined) patch.notes = notes;

    const [updated] = await db.update(auditItems).set(patch).where(eq(auditItems.id, req.params.id as string)).returning();
    if (!updated) { res.status(404).json({ success: false, message: "Item not found", data: null }); return; }

    const pending = await db
      .select({ cnt: count() })
      .from(auditItems)
      .where(and(eq(auditItems.assignmentId, updated.assignmentId), eq(auditItems.status, "pending")));

    if (Number(pending[0]?.cnt ?? 1) === 0) {
      await db.update(auditAssignments)
        .set({ status: "completed" })
        .where(eq(auditAssignments.id, updated.assignmentId));
    } else {
      await db.update(auditAssignments)
        .set({ status: "in_progress" })
        .where(and(eq(auditAssignments.id, updated.assignmentId), eq(auditAssignments.status, "pending")));
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    req.log.error({ err }, "Patch audit item error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
