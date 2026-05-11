import { Router } from "express";
import { eq, and, isNull, ilike, or, sql, desc } from "drizzle-orm";
import { db, stockItems, stockMovements, facilities, districts, users, provinces, agencies, activityLogs } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, requireAssetAdmin, isWithinAssetScope } from "../lib/auth";

const router = Router();

// Stock catalog management (create/edit items): admin-only — excludes Provincial Asset Officer
const STOCK_ADMIN_ROLES = ["Super Admin", "National Asset Controller", "Provincial Admin", "Agency Admin"];
function requireStockAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required", data: null });
    return;
  }
  if (!STOCK_ADMIN_ROLES.includes(req.user.roleName)) {
    res.status(403).json({ success: false, message: "Admin role required to manage stock items", data: null });
    return;
  }
  next();
}

function orNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function scopeFilter(user: NonNullable<Express.Request["user"]>) {
  if (user.scopeLevel === "national") return [];
  if (user.scopeLevel === "agency" || user.agencyId) {
    return user.agencyId ? [eq(stockItems.agencyId, user.agencyId)] : [sql`1=0`];
  }
  if (user.facilityId) return [eq(stockItems.facilityId, user.facilityId)];
  if (user.provinceId) return [eq(stockItems.provinceId, user.provinceId)];
  return [sql`1=0`];
}

router.get("/v1/stock", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    const { search, low_stock } = req.query as { search?: string; low_stock?: string };
    const conditions = [isNull(stockItems.deletedAt), ...scopeFilter(req.user)];
    if (search) {
      conditions.push(or(ilike(stockItems.itemName, `%${search}%`), ilike(stockItems.itemCode, `%${search}%`))!);
    }
    if (low_stock === "true") {
      conditions.push(sql`${stockItems.onHandQuantity} <= ${stockItems.reorderLevel}`);
    }
    const rows = await db
      .select({
        id: stockItems.id,
        itemCode: stockItems.itemCode,
        itemName: stockItems.itemName,
        category: stockItems.category,
        unitOfMeasure: stockItems.unitOfMeasure,
        onHandQuantity: stockItems.onHandQuantity,
        reorderLevel: stockItems.reorderLevel,
        unitCost: stockItems.unitCost,
        supplier: stockItems.supplier,
        notes: stockItems.notes,
        createdAt: stockItems.createdAt,
        updatedAt: stockItems.updatedAt,
        agency: { id: agencies.id, agencyName: agencies.agencyName, agencyCode: agencies.agencyCode },
        province: { id: provinces.id, provinceName: provinces.provinceName },
        facility: { id: facilities.id, facilityName: facilities.facilityName },
      })
      .from(stockItems)
      .leftJoin(agencies, eq(stockItems.agencyId, agencies.id))
      .leftJoin(provinces, eq(stockItems.provinceId, provinces.id))
      .leftJoin(facilities, eq(stockItems.facilityId, facilities.id))
      .where(and(...conditions))
      .orderBy(stockItems.itemName);
    res.json({ success: true, message: "Stock items retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get stock items error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/stock", requireAuth, requireStockAdmin, async (req, res) => {
  if (!req.user) return;
  const body = req.body;
  if (!body.item_code || !body.item_name) {
    res.status(400).json({ success: false, message: "item_code and item_name are required", data: null });
    return;
  }
  // Enforce strict scope: non-national users cannot place stock outside their scope.
  const isAgency = req.user.scopeLevel === "agency" || !!req.user.agencyId;
  let agencyId: string | null;
  let provinceId: string | null;
  let facilityId: string | null = orNull(body.facility_id);
  if (isAgency) {
    agencyId = req.user.agencyId ?? null;
    provinceId = null;
    if (!agencyId) {
      res.status(403).json({ success: false, message: "User has no agency scope", data: null });
      return;
    }
    // Body cannot override agency
    if (body.agency_id && body.agency_id !== agencyId) {
      res.status(403).json({ success: false, message: "Cannot create stock outside your agency", data: null });
      return;
    }
  } else if (req.user.scopeLevel === "national") {
    agencyId = orNull(body.agency_id);
    provinceId = orNull(body.province_id);
  } else {
    // Province / facility scoped users: force province from token
    agencyId = null;
    provinceId = req.user.provinceId ?? null;
    if (!provinceId) {
      res.status(403).json({ success: false, message: "User has no province scope", data: null });
      return;
    }
    if (body.province_id && body.province_id !== provinceId) {
      res.status(403).json({ success: false, message: "Cannot create stock outside your province", data: null });
      return;
    }
    if (req.user.facilityId && facilityId && facilityId !== req.user.facilityId) {
      res.status(403).json({ success: false, message: "Cannot create stock outside your facility", data: null });
      return;
    }
  }
  try {
    const [row] = await db.insert(stockItems).values({
      itemCode: body.item_code,
      itemName: body.item_name,
      category: orNull(body.category),
      description: orNull(body.description),
      unitOfMeasure: body.unit_of_measure ?? "each",
      onHandQuantity: body.on_hand_quantity != null ? Number(body.on_hand_quantity) : 0,
      reorderLevel: body.reorder_level != null ? Number(body.reorder_level) : 0,
      unitCost: orNull(body.unit_cost),
      supplier: orNull(body.supplier),
      notes: orNull(body.notes),
      provinceId,
      agencyId,
      facilityId,
      createdBy: req.user.userId,
    }).returning();
    res.status(201).json({ success: true, message: "Stock item created", data: row });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "23505") {
      res.status(409).json({ success: false, message: "Item code already exists", data: null });
      return;
    }
    req.log.error({ err }, "Create stock item error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/stock/:id", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    const conditions = [eq(stockItems.id, req.params.id), isNull(stockItems.deletedAt), ...scopeFilter(req.user)];
    const [row] = await db
      .select({
        id: stockItems.id,
        itemCode: stockItems.itemCode,
        itemName: stockItems.itemName,
        category: stockItems.category,
        description: stockItems.description,
        unitOfMeasure: stockItems.unitOfMeasure,
        onHandQuantity: stockItems.onHandQuantity,
        reorderLevel: stockItems.reorderLevel,
        unitCost: stockItems.unitCost,
        supplier: stockItems.supplier,
        notes: stockItems.notes,
        createdAt: stockItems.createdAt,
        updatedAt: stockItems.updatedAt,
        agency: { id: agencies.id, agencyName: agencies.agencyName, agencyCode: agencies.agencyCode },
        province: { id: provinces.id, provinceName: provinces.provinceName },
        facility: { id: facilities.id, facilityName: facilities.facilityName },
      })
      .from(stockItems)
      .leftJoin(agencies, eq(stockItems.agencyId, agencies.id))
      .leftJoin(provinces, eq(stockItems.provinceId, provinces.id))
      .leftJoin(facilities, eq(stockItems.facilityId, facilities.id))
      .where(and(...conditions))
      .limit(1);
    if (!row) {
      res.status(404).json({ success: false, message: "Stock item not found", data: null });
      return;
    }
    const movements = await db
      .select({
        id: stockMovements.id,
        movementType: stockMovements.movementType,
        quantity: stockMovements.quantity,
        issuedToName: stockMovements.issuedToName,
        reference: stockMovements.reference,
        reason: stockMovements.reason,
        createdAt: stockMovements.createdAt,
        actor: { id: users.id, fullName: users.fullName },
        fromFacility: { id: facilities.id, facilityName: facilities.facilityName },
      })
      .from(stockMovements)
      .leftJoin(users, eq(stockMovements.actorUserId, users.id))
      .leftJoin(facilities, eq(stockMovements.fromFacilityId, facilities.id))
      .where(eq(stockMovements.stockItemId, req.params.id))
      .orderBy(desc(stockMovements.createdAt))
      .limit(100);
    res.json({ success: true, message: "Stock item retrieved", data: { ...row, movements } });
  } catch (err) {
    req.log.error({ err }, "Get stock item error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/stock/:id", requireAuth, requireStockAdmin, async (req, res) => {
  if (!req.user) return;
  const body = req.body;
  try {
    const conditions = [eq(stockItems.id, req.params.id), isNull(stockItems.deletedAt), ...scopeFilter(req.user)];
    const [existing] = await db.select({ id: stockItems.id }).from(stockItems).where(and(...conditions)).limit(1);
    if (!existing) {
      res.status(404).json({ success: false, message: "Stock item not found", data: null });
      return;
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.item_name !== undefined) patch.itemName = body.item_name;
    if (body.category !== undefined) patch.category = orNull(body.category);
    if (body.description !== undefined) patch.description = orNull(body.description);
    if (body.unit_of_measure !== undefined) patch.unitOfMeasure = body.unit_of_measure;
    if (body.reorder_level !== undefined) patch.reorderLevel = Number(body.reorder_level);
    if (body.unit_cost !== undefined) patch.unitCost = orNull(body.unit_cost);
    if (body.supplier !== undefined) patch.supplier = orNull(body.supplier);
    if (body.notes !== undefined) patch.notes = orNull(body.notes);
    const [updated] = await db.update(stockItems).set(patch).where(eq(stockItems.id, req.params.id)).returning();
    res.json({ success: true, message: "Stock item updated", data: updated });
  } catch (err) {
    req.log.error({ err }, "Update stock item error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/stock/:id/movements", requireAuth, requireAssetAdmin, async (req, res) => {
  if (!req.user) return;
  const body = req.body;
  const movementType = body.movement_type as "receive" | "issue" | "transfer" | "adjust";
  const quantity = Number(body.quantity);
  if (!["receive", "issue", "transfer", "adjust"].includes(movementType) || !Number.isFinite(quantity) || quantity <= 0) {
    res.status(400).json({ success: false, message: "movement_type and positive quantity are required", data: null });
    return;
  }
  const delta = movementType === "receive" ? quantity
    : movementType === "issue" ? -quantity
    : movementType === "transfer" ? 0
    : quantity; // adjust = positive delta

  // Validate transfer destination is in caller scope (single-location stock model:
  // transfer reassigns the item's facility; per-location balances are tracked in follow-up #7).
  if (movementType === "transfer") {
    const toFacilityId = orNull(body.to_facility_id);
    if (!toFacilityId) {
      res.status(400).json({ success: false, message: "to_facility_id is required for transfers", data: null });
      return;
    }
    const [destFacility] = await db
      .select({ id: facilities.id, districtId: facilities.districtId, provinceId: districts.provinceId })
      .from(facilities)
      .leftJoin(districts, eq(facilities.districtId, districts.id))
      .where(eq(facilities.id, toFacilityId))
      .limit(1);
    if (!destFacility) {
      res.status(400).json({ success: false, message: "Destination facility not found", data: null });
      return;
    }
    if (!isWithinAssetScope(req.user, {
      provinceId: destFacility.provinceId ?? null,
      districtId: destFacility.districtId,
      facilityId: destFacility.id,
    })) {
      res.status(403).json({ success: false, message: "Cannot transfer to a facility outside your scope", data: null });
      return;
    }
  }
  try {
    const result = await db.transaction(async (tx) => {
      const conditions = [eq(stockItems.id, req.params.id), isNull(stockItems.deletedAt), ...scopeFilter(req.user!)];
      const lockedRows = await tx
        .select({
          id: stockItems.id,
          itemCode: stockItems.itemCode,
          itemName: stockItems.itemName,
          unitOfMeasure: stockItems.unitOfMeasure,
          onHandQuantity: stockItems.onHandQuantity,
        })
        .from(stockItems)
        .where(and(...conditions))
        .for("update")
        .limit(1);
      const item = lockedRows[0];
      if (!item) return { status: 404 as const, message: "Stock item not found" };
      const newQty = item.onHandQuantity + delta;
      if (newQty < 0) return { status: 400 as const, message: "Insufficient stock for issue" };

      await tx.insert(stockMovements).values({
        stockItemId: item.id,
        movementType,
        quantity,
        fromFacilityId: orNull(body.from_facility_id),
        toFacilityId: orNull(body.to_facility_id),
        issuedToUser: orNull(body.issued_to_user),
        issuedToName: orNull(body.issued_to_name),
        reference: orNull(body.reference),
        reason: orNull(body.reason),
        actorUserId: req.user!.userId,
      });

      let persistedQty = item.onHandQuantity;
      if (delta !== 0) {
        const [updated] = await tx.update(stockItems)
          .set({ onHandQuantity: newQty, updatedAt: new Date() })
          .where(eq(stockItems.id, item.id))
          .returning({ onHandQuantity: stockItems.onHandQuantity });
        persistedQty = updated.onHandQuantity;
      }
      if (movementType === "transfer" && body.to_facility_id) {
        await tx.update(stockItems)
          .set({ facilityId: String(body.to_facility_id), updatedAt: new Date() })
          .where(eq(stockItems.id, item.id));
      }

      await tx.insert(activityLogs).values({
        userId: req.user!.userId,
        actionType: `STOCK_${movementType.toUpperCase()}`,
        entityType: "stock_item",
        entityId: item.id,
        description: `${movementType} ${quantity} ${item.unitOfMeasure} of ${item.itemName} (${item.itemCode})`,
        metadata: { quantity, reference: body.reference ?? null },
      });

      return { status: 201 as const, onHandQuantity: persistedQty };
    });

    if (result.status !== 201) {
      res.status(result.status).json({ success: false, message: result.message, data: null });
      return;
    }
    res.status(201).json({ success: true, message: "Movement recorded", data: { onHandQuantity: result.onHandQuantity } });
  } catch (err) {
    req.log.error({ err }, "Record stock movement error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/stock/:id/movements", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    const conditions = [eq(stockItems.id, req.params.id), isNull(stockItems.deletedAt), ...scopeFilter(req.user)];
    const [item] = await db.select({ id: stockItems.id }).from(stockItems).where(and(...conditions)).limit(1);
    if (!item) {
      res.status(404).json({ success: false, message: "Stock item not found", data: null });
      return;
    }
    const movements = await db
      .select({
        id: stockMovements.id,
        movementType: stockMovements.movementType,
        quantity: stockMovements.quantity,
        issuedToName: stockMovements.issuedToName,
        reference: stockMovements.reference,
        reason: stockMovements.reason,
        createdAt: stockMovements.createdAt,
        actor: { id: users.id, fullName: users.fullName },
      })
      .from(stockMovements)
      .leftJoin(users, eq(stockMovements.actorUserId, users.id))
      .where(eq(stockMovements.stockItemId, req.params.id))
      .orderBy(desc(stockMovements.createdAt));
    res.json({ success: true, message: "Movements retrieved", data: movements });
  } catch (err) {
    req.log.error({ err }, "Get movements error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
