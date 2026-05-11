import { Router } from "express";
import { eq, and, isNull, ilike, or, sql, desc } from "drizzle-orm";
import { db, stockItems, stockBalances, stockMovements, facilities, districts, users, provinces, agencies, activityLogs } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, requireAssetAdmin, isWithinAssetScope } from "../lib/auth";

const router = Router();

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
  if (user.districtId) {
    return [
      sql`${stockItems.facilityId} IN (SELECT id FROM ${facilities} WHERE district_id = ${user.districtId})`,
    ];
  }
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
      // An item is "low" if any per-location balance row sits at or below its
      // configured reorder threshold (and that threshold is > 0). Falls back to
      // the item-level threshold for items that have no per-location threshold
      // configured anywhere.
      conditions.push(sql`(
        EXISTS (
          SELECT 1 FROM ${stockBalances} sb
          WHERE sb.stock_item_id = ${stockItems.id}
            AND (
              (sb.reorder_level > 0 AND sb.quantity <= sb.reorder_level)
              OR (sb.reorder_level = 0 AND ${stockItems.reorderLevel} > 0 AND sb.quantity <= ${stockItems.reorderLevel})
            )
        )
        OR (
          ${stockItems.reorderLevel} > 0
          AND ${stockItems.onHandQuantity} <= ${stockItems.reorderLevel}
          AND NOT EXISTS (SELECT 1 FROM ${stockBalances} sb2 WHERE sb2.stock_item_id = ${stockItems.id})
        )
      )`);
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

    const itemIds = rows.map((r) => r.id);
    const balRows = itemIds.length === 0 ? [] : await db
      .select({
        stockItemId: stockBalances.stockItemId,
        facilityId: stockBalances.facilityId,
        facilityName: facilities.facilityName,
        quantity: stockBalances.quantity,
        reorderLevel: stockBalances.reorderLevel,
      })
      .from(stockBalances)
      .leftJoin(facilities, eq(stockBalances.facilityId, facilities.id))
      .where(sql`${stockBalances.stockItemId} IN (${sql.join(itemIds.map((id) => sql`${id}`), sql`, `)})`);

    const balByItem = new Map<string, typeof balRows>();
    for (const b of balRows) {
      const list = balByItem.get(b.stockItemId) ?? [];
      list.push(b);
      balByItem.set(b.stockItemId, list);
    }

    const enriched = rows.map((r) => {
      const balances = (balByItem.get(r.id) ?? []).slice().sort((a, b) =>
        (a.facilityName ?? "Unassigned / Agency reserve").localeCompare(b.facilityName ?? "Unassigned / Agency reserve"),
      );
      const totalQuantity = balances.length > 0
        ? balances.reduce((s, b) => s + b.quantity, 0)
        : (r.onHandQuantity ?? 0);
      let lowLocationCount = balances.filter((b) => {
        if (b.reorderLevel > 0) return b.quantity <= b.reorderLevel;
        if (r.reorderLevel > 0) return b.quantity <= r.reorderLevel;
        return false;
      }).length;
      // Legacy/edge items with no balance rows: fall back to item-level
      // threshold so the badge agrees with the low_stock=true backend filter.
      if (balances.length === 0 && r.reorderLevel > 0 && (r.onHandQuantity ?? 0) <= r.reorderLevel) {
        lowLocationCount = 1;
      }
      return { ...r, balances, totalQuantity, lowLocationCount };
    });

    res.json({ success: true, message: "Stock items retrieved", data: enriched });
  } catch (err) {
    req.log.error({ err }, "Get stock items error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// Returns the latest item_code in scope that matches `[AGENCY]-STK-[NNN]`,
// sorted by the numeric suffix. Used by the UI to prefill the next code in
// the New Stock Item dialog. Also returns the caller's agency code so the
// client can fall back to `[AGENCY]-STK-001` when no items exist yet.
router.get("/v1/stock/latest-code", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    let agencyCode: string | null = null;
    if (req.user.agencyId) {
      const [ag] = await db
        .select({ agencyCode: agencies.agencyCode })
        .from(agencies)
        .where(eq(agencies.id, req.user.agencyId))
        .limit(1);
      agencyCode = ag?.agencyCode ?? null;
    }
    const conditions = [
      isNull(stockItems.deletedAt),
      sql`${stockItems.itemCode} ~ '^[A-Z0-9]+-STK-[0-9]+$'`,
      ...scopeFilter(req.user),
    ];
    const [row] = await db
      .select({ itemCode: stockItems.itemCode })
      .from(stockItems)
      .where(and(...conditions))
      .orderBy(sql`CAST(SPLIT_PART(${stockItems.itemCode}, '-', 3) AS INTEGER) DESC`)
      .limit(1);
    res.json({
      success: true,
      message: "Latest stock code retrieved",
      data: { latestCode: row?.itemCode ?? null, agencyCode },
    });
  } catch (err) {
    req.log.error({ err }, "Get latest stock code error");
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
  const isAgency = req.user.scopeLevel === "agency" || !!req.user.agencyId;
  let agencyId: string | null;
  let provinceId: string | null;
  const facilityId: string | null = orNull(body.facility_id);
  if (isAgency) {
    agencyId = req.user.agencyId ?? null;
    provinceId = null;
    if (!agencyId) {
      res.status(403).json({ success: false, message: "User has no agency scope", data: null });
      return;
    }
    if (body.agency_id && body.agency_id !== agencyId) {
      res.status(403).json({ success: false, message: "Cannot create stock outside your agency", data: null });
      return;
    }
  } else if (req.user.scopeLevel === "national") {
    agencyId = orNull(body.agency_id);
    provinceId = orNull(body.province_id);
  } else {
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
  const initialQty = body.on_hand_quantity != null ? Number(body.on_hand_quantity) : 0;
  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx.insert(stockItems).values({
        itemCode: body.item_code,
        itemName: body.item_name,
        category: orNull(body.category),
        description: orNull(body.description),
        unitOfMeasure: body.unit_of_measure ?? "each",
        onHandQuantity: initialQty,
        reorderLevel: body.reorder_level != null ? Number(body.reorder_level) : 0,
        unitCost: orNull(body.unit_cost),
        supplier: orNull(body.supplier),
        notes: orNull(body.notes),
        provinceId,
        agencyId,
        facilityId,
        createdBy: req.user!.userId,
      }).returning();
      await tx.insert(stockBalances).values({
        stockItemId: row.id,
        facilityId,
        quantity: initialQty,
      });
      return row;
    });
    res.status(201).json({ success: true, message: "Stock item created", data: result });
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
    const balances = await db
      .select({
        id: stockBalances.id,
        facilityId: stockBalances.facilityId,
        facilityName: facilities.facilityName,
        quantity: stockBalances.quantity,
        reorderLevel: stockBalances.reorderLevel,
      })
      .from(stockBalances)
      .leftJoin(facilities, eq(stockBalances.facilityId, facilities.id))
      .where(eq(stockBalances.stockItemId, req.params.id))
      .orderBy(facilities.facilityName);
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
    res.json({ success: true, message: "Stock item retrieved", data: { ...row, balances, movements } });
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

router.patch("/v1/stock/:id/balances", requireAuth, requireStockAdmin, async (req, res) => {
  if (!req.user) return;
  const body = req.body as { facility_id?: string | null; reorder_level?: number };
  const reorder = Number(body.reorder_level);
  if (!Number.isInteger(reorder) || reorder < 0) {
    res.status(400).json({ success: false, message: "reorder_level must be a non-negative integer", data: null });
    return;
  }
  const facilityId = body.facility_id ?? null;
  try {
    const conditions = [eq(stockItems.id, req.params.id), isNull(stockItems.deletedAt), ...scopeFilter(req.user)];
    const [item] = await db.select({ id: stockItems.id }).from(stockItems).where(and(...conditions)).limit(1);
    if (!item) {
      res.status(404).json({ success: false, message: "Stock item not found", data: null });
      return;
    }
    if (facilityId !== null) {
      const [fac] = await db
        .select({ id: facilities.id, districtId: facilities.districtId, provinceId: districts.provinceId })
        .from(facilities)
        .leftJoin(districts, eq(facilities.districtId, districts.id))
        .where(eq(facilities.id, facilityId))
        .limit(1);
      if (!fac) {
        res.status(400).json({ success: false, message: "Facility not found", data: null });
        return;
      }
      const isAgencyScoped = req.user.scopeLevel === "agency" || !!req.user.agencyId;
      if (!isAgencyScoped && !isWithinAssetScope(req.user, {
        provinceId: fac.provinceId ?? null,
        districtId: fac.districtId,
        facilityId: fac.id,
      })) {
        res.status(403).json({ success: false, message: "Cannot configure thresholds for a facility outside your scope", data: null });
        return;
      }
    }
    const where = facilityId === null
      ? and(eq(stockBalances.stockItemId, item.id), isNull(stockBalances.facilityId))
      : and(eq(stockBalances.stockItemId, item.id), eq(stockBalances.facilityId, facilityId));
    const existing = await db.select({ id: stockBalances.id }).from(stockBalances).where(where).limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(stockBalances)
        .set({ reorderLevel: reorder, updatedAt: new Date() })
        .where(eq(stockBalances.id, existing[0].id))
        .returning();
      res.json({ success: true, message: "Reorder threshold updated", data: updated });
      return;
    }
    const [created] = await db.insert(stockBalances).values({
      stockItemId: item.id,
      facilityId,
      quantity: 0,
      reorderLevel: reorder,
    }).returning();
    res.json({ success: true, message: "Reorder threshold set", data: created });
  } catch (err) {
    req.log.error({ err }, "Update balance reorder error");
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

  // Validate any client-supplied facility IDs are real and within caller scope.
  // Agency-scoped users own stock by agencyId (no facility hierarchy applies),
  // but the facility must still exist; non-agency users must stay inside their
  // geographic scope for both source and destination.
  async function validateFacilityScope(facilityId: string, label: "source" | "destination"): Promise<{ ok: true } | { ok: false; status: 400 | 403; message: string }> {
    const [row] = await db
      .select({ id: facilities.id, districtId: facilities.districtId, provinceId: districts.provinceId })
      .from(facilities)
      .leftJoin(districts, eq(facilities.districtId, districts.id))
      .where(eq(facilities.id, facilityId))
      .limit(1);
    if (!row) return { ok: false, status: 400, message: `${label === "source" ? "Source" : "Destination"} facility not found` };
    const isAgencyScoped = req.user!.scopeLevel === "agency" || !!req.user!.agencyId;
    if (!isAgencyScoped && !isWithinAssetScope(req.user, {
      provinceId: row.provinceId ?? null,
      districtId: row.districtId,
      facilityId: row.id,
    })) {
      return { ok: false, status: 403, message: `Cannot use a ${label} facility outside your scope` };
    }
    return { ok: true };
  }

  let toFacilityId: string | null = null;
  if (movementType === "transfer") {
    toFacilityId = orNull(body.to_facility_id);
    if (!toFacilityId) {
      res.status(400).json({ success: false, message: "to_facility_id is required for transfers", data: null });
      return;
    }
    const v = await validateFacilityScope(toFacilityId, "destination");
    if (!v.ok) { res.status(v.status).json({ success: false, message: v.message, data: null }); return; }
  }
  // Distinguish undefined (caller did not specify, fall back to item's primary
  // facility) from explicit null (caller chose the agency reserve / unassigned
  // bucket). Both are valid; only undefined triggers the fallback later.
  const fromExplicit = Object.prototype.hasOwnProperty.call(body, "from_facility_id");
  const fromFacilityRaw = fromExplicit ? orNull(body.from_facility_id) : undefined;
  if (fromFacilityRaw) {
    const v = await validateFacilityScope(fromFacilityRaw, "source");
    if (!v.ok) { res.status(v.status).json({ success: false, message: v.message, data: null }); return; }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const conditions = [eq(stockItems.id, req.params.id), isNull(stockItems.deletedAt), ...scopeFilter(req.user!)];
      const [item] = await tx
        .select({
          id: stockItems.id,
          itemCode: stockItems.itemCode,
          itemName: stockItems.itemName,
          unitOfMeasure: stockItems.unitOfMeasure,
          onHandQuantity: stockItems.onHandQuantity,
          facilityId: stockItems.facilityId,
        })
        .from(stockItems)
        .where(and(...conditions))
        .for("update")
        .limit(1);
      if (!item) return { status: 404 as const, message: "Stock item not found" };

      const fromFacilityId: string | null = fromExplicit
        ? (fromFacilityRaw ?? null)
        : (item.facilityId ?? null);

      const lockBalance = async (facilityId: string | null) => {
        const where = facilityId === null
          ? and(eq(stockBalances.stockItemId, item.id), isNull(stockBalances.facilityId))
          : and(eq(stockBalances.stockItemId, item.id), eq(stockBalances.facilityId, facilityId));
        const rows = await tx
          .select({ id: stockBalances.id, quantity: stockBalances.quantity })
          .from(stockBalances)
          .where(where)
          .for("update")
          .limit(1);
        return rows[0] ?? null;
      };

      const upsertBalance = async (facilityId: string | null, delta: number) => {
        const existing = await lockBalance(facilityId);
        if (existing) {
          const newQty = existing.quantity + delta;
          if (newQty < 0) return { ok: false as const, currentQty: existing.quantity };
          await tx.update(stockBalances)
            .set({ quantity: newQty, updatedAt: new Date() })
            .where(eq(stockBalances.id, existing.id));
          return { ok: true as const };
        }
        if (delta < 0) return { ok: false as const, currentQty: 0 };
        await tx.insert(stockBalances).values({
          stockItemId: item.id,
          facilityId,
          quantity: delta,
        });
        return { ok: true as const };
      };

      let aggregateDelta = 0;
      if (movementType === "receive") {
        const r = await upsertBalance(fromFacilityId, quantity);
        if (!r.ok) return { status: 400 as const, message: "Could not update balance" };
        aggregateDelta = quantity;
      } else if (movementType === "issue") {
        const r = await upsertBalance(fromFacilityId, -quantity);
        if (!r.ok) {
          return {
            status: 400 as const,
            message: `Insufficient stock at source location (have ${r.currentQty} ${item.unitOfMeasure})`,
          };
        }
        aggregateDelta = -quantity;
      } else if (movementType === "adjust") {
        const r = await upsertBalance(fromFacilityId, quantity);
        if (!r.ok) return { status: 400 as const, message: "Could not update balance" };
        aggregateDelta = quantity;
      } else {
        const src = await lockBalance(fromFacilityId);
        if (!src || src.quantity < quantity) {
          return {
            status: 400 as const,
            message: `Insufficient stock at source facility (have ${src?.quantity ?? 0} ${item.unitOfMeasure})`,
          };
        }
        await tx.update(stockBalances)
          .set({ quantity: src.quantity - quantity, updatedAt: new Date() })
          .where(eq(stockBalances.id, src.id));
        const dst = await upsertBalance(toFacilityId, quantity);
        if (!dst.ok) return { status: 400 as const, message: "Could not update destination balance" };
        aggregateDelta = 0;
      }

      await tx.insert(stockMovements).values({
        stockItemId: item.id,
        movementType,
        quantity,
        fromFacilityId,
        toFacilityId,
        issuedToUser: orNull(body.issued_to_user),
        issuedToName: orNull(body.issued_to_name),
        reference: orNull(body.reference),
        reason: orNull(body.reason),
        actorUserId: req.user!.userId,
      });

      const newAggregate = item.onHandQuantity + aggregateDelta;
      let persistedQty = item.onHandQuantity;
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (aggregateDelta !== 0) update.onHandQuantity = newAggregate;
      if (movementType === "transfer" && toFacilityId && item.facilityId === fromFacilityId) {
        const remaining = await lockBalance(fromFacilityId);
        if (remaining && remaining.quantity === 0) {
          update.facilityId = toFacilityId;
        }
      }
      const [updated] = await tx.update(stockItems)
        .set(update)
        .where(eq(stockItems.id, item.id))
        .returning({ onHandQuantity: stockItems.onHandQuantity });
      persistedQty = updated.onHandQuantity;

      await tx.insert(activityLogs).values({
        userId: req.user!.userId,
        actionType: `STOCK_${movementType.toUpperCase()}`,
        entityType: "stock_item",
        entityId: item.id,
        description: `${movementType} ${quantity} ${item.unitOfMeasure} of ${item.itemName} (${item.itemCode})`,
        metadata: { quantity, from_facility_id: fromFacilityId, to_facility_id: toFacilityId, reference: body.reference ?? null },
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
