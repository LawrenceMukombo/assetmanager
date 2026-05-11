import { Router } from "express";
import crypto from "crypto";
import { eq, and, sql, desc, inArray, asc } from "drizzle-orm";
import {
  db,
  purchaseRequests,
  purchaseRequestEvents,
  stockItems,
  stockBalances,
  stockMovements,
  users,
  agencies,
  provinces,
  facilities,
  notifications,
  activityLogs,
  userRoles,
  roles,
  userScope,
} from "@workspace/db";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, requireAssetAdmin } from "../lib/auth";

const router = Router();

const APPROVER_ROLES = ["Super Admin", "National Asset Controller", "Provincial Admin", "Agency Admin"];

function requireApprover(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required", data: null });
    return;
  }
  if (!APPROVER_ROLES.includes(req.user.roleName)) {
    res.status(403).json({ success: false, message: "Approver role required", data: null });
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
    return user.agencyId ? [eq(purchaseRequests.agencyId, user.agencyId)] : [sql`1=0`];
  }
  if (user.facilityId) return [eq(purchaseRequests.facilityId, user.facilityId)];
  if (user.districtId) {
    return [
      sql`${purchaseRequests.facilityId} IN (SELECT id FROM ${facilities} WHERE district_id = ${user.districtId})`,
    ];
  }
  if (user.provinceId) return [eq(purchaseRequests.provinceId, user.provinceId)];
  return [sql`1=0`];
}

function isWithinStockScope(
  user: NonNullable<Express.Request["user"]>,
  item: { agencyId: string | null; provinceId: string | null; facilityId: string | null; districtId?: string | null },
): boolean {
  if (user.scopeLevel === "national") return true;
  if (user.scopeLevel === "agency" || user.agencyId) {
    return !!user.agencyId && item.agencyId === user.agencyId;
  }
  if (user.facilityId) return item.facilityId === user.facilityId;
  if (user.districtId) return !!item.districtId && item.districtId === user.districtId;
  if (user.provinceId) return item.provinceId === user.provinceId;
  return false;
}

const SIGNATURE_SECRET = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "npams-dev-secret-do-not-use-in-prod";
function computeSignedHash(parts: { userId: string; action: string; requestId: string; timestamp: string; signedName: string }): string {
  // HMAC-SHA256 keyed by server secret so signatures are tamper-evident and not
  // reproducible by anyone who only knows the public payload fields.
  const payload = `v1|${parts.userId}|${parts.action}|${parts.requestId}|${parts.timestamp}|${parts.signedName}`;
  return crypto.createHmac("sha256", SIGNATURE_SECRET).update(payload).digest("hex");
}

function requireSignedName(body: unknown): { ok: true; name: string } | { ok: false; message: string } {
  const name = typeof (body as { signed_name?: unknown })?.signed_name === "string"
    ? (body as { signed_name: string }).signed_name.trim()
    : "";
  if (name.length < 2) {
    return { ok: false, message: "signed_name is required (type your full name to sign this action)" };
  }
  return { ok: true, name };
}

function generateRequestNumber(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `PR-${yyyy}${mm}${dd}-${rand}`;
}

async function findApprovers(item: {
  agencyId: string | null;
  provinceId: string | null;
}): Promise<string[]> {
  const approverConditions = [eq(users.active, true), inArray(roles.roleName, APPROVER_ROLES)];

  const rows = await db
    .select({ id: users.id, scopeLevel: roles.scopeLevel, agencyId: userScope.agencyId, provinceId: userScope.provinceId })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(userScope, eq(userScope.userId, users.id))
    .where(and(...approverConditions));

  // Prefer agency admins for agency-owned items, otherwise province admins; always include nationals.
  const matches = rows.filter((r) => {
    if (r.scopeLevel === "national") return true;
    if (item.agencyId && r.agencyId === item.agencyId) return true;
    if (!item.agencyId && item.provinceId && r.provinceId === item.provinceId) return true;
    return false;
  });

  // De-duplicate
  const ids = Array.from(new Set(matches.map((r) => r.id)));
  return ids;
}

const REQUEST_SELECT = {
  id: purchaseRequests.id,
  requestNumber: purchaseRequests.requestNumber,
  status: purchaseRequests.status,
  quantity: purchaseRequests.quantity,
  receivedQuantity: purchaseRequests.receivedQuantity,
  supplier: purchaseRequests.supplier,
  unitCost: purchaseRequests.unitCost,
  notes: purchaseRequests.notes,
  rejectedReason: purchaseRequests.rejectedReason,
  approvedAt: purchaseRequests.approvedAt,
  receivedAt: purchaseRequests.receivedAt,
  closedAt: purchaseRequests.closedAt,
  requiredByDate: purchaseRequests.requiredByDate,
  createdAt: purchaseRequests.createdAt,
  updatedAt: purchaseRequests.updatedAt,
  stockItem: {
    id: stockItems.id,
    itemCode: stockItems.itemCode,
    itemName: stockItems.itemName,
    unitOfMeasure: stockItems.unitOfMeasure,
    onHandQuantity: stockItems.onHandQuantity,
    reorderLevel: stockItems.reorderLevel,
  },
  requester: { id: users.id, fullName: users.fullName },
  agency: { id: agencies.id, agencyName: agencies.agencyName, agencyCode: agencies.agencyCode },
  province: { id: provinces.id, provinceName: provinces.provinceName },
  facility: { id: facilities.id, facilityName: facilities.facilityName },
} as const;

router.get("/v1/purchase-requests", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    const { status, mine, pending, stock_item_id: stockItemIdQ } = req.query as { status?: string; mine?: string; pending?: string; stock_item_id?: string };
    const conditions = [...scopeFilter(req.user)];
    if (stockItemIdQ) {
      conditions.push(eq(purchaseRequests.stockItemId, stockItemIdQ));
    }
    if (status) {
      const allowed = ["draft", "submitted", "approved", "rejected", "received", "closed"] as const;
      if (!(allowed as readonly string[]).includes(status)) {
        res.status(400).json({ success: false, message: "Invalid status filter", data: null });
        return;
      }
      conditions.push(sql`${purchaseRequests.status} = ${status}`);
    }
    if (mine === "true") {
      conditions.push(eq(purchaseRequests.requestedBy, req.user.userId));
    }
    if (pending === "true") {
      conditions.push(sql`${purchaseRequests.status} = 'submitted'`);
    }
    const rows = await db
      .select(REQUEST_SELECT)
      .from(purchaseRequests)
      .innerJoin(stockItems, eq(purchaseRequests.stockItemId, stockItems.id))
      .leftJoin(users, eq(purchaseRequests.requestedBy, users.id))
      .leftJoin(agencies, eq(purchaseRequests.agencyId, agencies.id))
      .leftJoin(provinces, eq(purchaseRequests.provinceId, provinces.id))
      .leftJoin(facilities, eq(purchaseRequests.facilityId, facilities.id))
      .where(and(...conditions))
      .orderBy(desc(purchaseRequests.createdAt))
      .limit(200);
    res.json({ success: true, message: "Purchase requests retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "List purchase requests error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/purchase-requests/:id/neighbors", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    const id = req.params.id as string;
    const { status, mine, pending, stock_item_id: stockItemIdQ } = req.query as {
      status?: string; mine?: string; pending?: string; stock_item_id?: string;
    };

    const [current] = await db
      .select({ id: purchaseRequests.id })
      .from(purchaseRequests)
      .where(and(eq(purchaseRequests.id, id), ...scopeFilter(req.user)))
      .limit(1);
    if (!current) {
      res.status(404).json({ success: false, message: "Purchase request not found", data: null });
      return;
    }

    const conditions = [...scopeFilter(req.user)];
    if (stockItemIdQ) conditions.push(eq(purchaseRequests.stockItemId, stockItemIdQ));
    if (status) {
      const allowed = ["draft", "submitted", "approved", "rejected", "received", "closed"] as const;
      if (!(allowed as readonly string[]).includes(status)) {
        res.status(400).json({ success: false, message: "Invalid status filter", data: null });
        return;
      }
      conditions.push(sql`${purchaseRequests.status} = ${status}`);
    }
    if (mine === "true") conditions.push(eq(purchaseRequests.requestedBy, req.user.userId));
    if (pending === "true") conditions.push(sql`${purchaseRequests.status} = 'submitted'`);

    const rows = await db
      .select({
        id: purchaseRequests.id,
        requestNumber: purchaseRequests.requestNumber,
        itemName: stockItems.itemName,
      })
      .from(purchaseRequests)
      .innerJoin(stockItems, eq(purchaseRequests.stockItemId, stockItems.id))
      .where(and(...conditions))
      .orderBy(desc(purchaseRequests.createdAt));

    const idx = rows.findIndex((r) => r.id === id);
    const toNeighbor = (r: typeof rows[number] | undefined) =>
      r ? { id: r.id, title: r.requestNumber, subtitle: r.itemName } : null;

    if (idx === -1) {
      res.json({
        success: true,
        message: "Neighbors retrieved",
        data: { previous: null, next: null, position: 0, total: rows.length, in_context: false },
      });
      return;
    }

    res.json({
      success: true,
      message: "Neighbors retrieved",
      data: {
        previous: toNeighbor(rows[idx - 1]),
        next: toNeighbor(rows[idx + 1]),
        position: idx + 1,
        total: rows.length,
        in_context: true,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Get purchase request neighbors error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/purchase-requests/:id", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    const conditions = [eq(purchaseRequests.id, req.params.id as string), ...scopeFilter(req.user)];
    const [row] = await db
      .select(REQUEST_SELECT)
      .from(purchaseRequests)
      .innerJoin(stockItems, eq(purchaseRequests.stockItemId, stockItems.id))
      .leftJoin(users, eq(purchaseRequests.requestedBy, users.id))
      .leftJoin(agencies, eq(purchaseRequests.agencyId, agencies.id))
      .leftJoin(provinces, eq(purchaseRequests.provinceId, provinces.id))
      .leftJoin(facilities, eq(purchaseRequests.facilityId, facilities.id))
      .where(and(...conditions))
      .limit(1);
    if (!row) {
      res.status(404).json({ success: false, message: "Purchase request not found", data: null });
      return;
    }
    res.json({ success: true, message: "Purchase request retrieved", data: row });
  } catch (err) {
    req.log.error({ err }, "Get purchase request error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/purchase-requests", requireAuth, async (req, res) => {
  if (!req.user) return;
  const body = req.body ?? {};
  const stockItemId = orNull(body.stock_item_id);
  const quantity = Number(body.quantity);
  if (!stockItemId || !Number.isInteger(quantity) || quantity <= 0) {
    res.status(400).json({ success: false, message: "stock_item_id and positive integer quantity are required", data: null });
    return;
  }
  const submitSig = requireSignedName(body);
  if (!submitSig.ok) {
    res.status(400).json({ success: false, message: submitSig.message, data: null });
    return;
  }

  try {
    const [item] = await db
      .select({
        id: stockItems.id,
        itemCode: stockItems.itemCode,
        itemName: stockItems.itemName,
        supplier: stockItems.supplier,
        unitCost: stockItems.unitCost,
        provinceId: stockItems.provinceId,
        agencyId: stockItems.agencyId,
        facilityId: stockItems.facilityId,
        districtId: facilities.districtId,
      })
      .from(stockItems)
      .leftJoin(facilities, eq(stockItems.facilityId, facilities.id))
      .where(eq(stockItems.id, stockItemId))
      .limit(1);
    if (!item) {
      res.status(404).json({ success: false, message: "Stock item not found", data: null });
      return;
    }
    if (!isWithinStockScope(req.user, item)) {
      res.status(403).json({ success: false, message: "Cannot raise a request for an item outside your scope", data: null });
      return;
    }

    const supplier = orNull(body.supplier) ?? item.supplier ?? null;
    const unitCost = orNull(body.unit_cost) ?? item.unitCost ?? null;
    const notes = orNull(body.notes);
    const rawRequiredBy = orNull(body.required_by_date);
    const requiredByDate = rawRequiredBy && /^\d{4}-\d{2}-\d{2}$/.test(rawRequiredBy) ? rawRequiredBy : null;

    let attempts = 0;
    let created;
    while (attempts < 5) {
      const requestNumber = generateRequestNumber();
      try {
        const [row] = await db.insert(purchaseRequests).values({
          requestNumber,
          stockItemId: item.id,
          supplier,
          quantity,
          unitCost,
          notes,
          status: "submitted",
          provinceId: item.provinceId,
          agencyId: item.agencyId,
          facilityId: item.facilityId,
          requestedBy: req.user.userId,
          requiredByDate,
        }).returning();
        created = row;
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "23505") {
          attempts += 1;
          continue;
        }
        throw e;
      }
    }
    if (!created) {
      res.status(500).json({ success: false, message: "Could not allocate request number", data: null });
      return;
    }

    // Notify approvers
    const approverIds = await findApprovers({ agencyId: item.agencyId, provinceId: item.provinceId });
    const approverNotifs = approverIds
      .filter((id) => id !== req.user!.userId)
      .map((id) => ({
        userId: id,
        title: "New purchase request",
        message: `${created!.requestNumber}: ${quantity} × ${item.itemName} (${item.itemCode}) needs approval.`,
      }));
    if (approverNotifs.length > 0) {
      await db.insert(notifications).values(approverNotifs).catch(() => null);
    }

    const submitTs = new Date();
    await db.insert(purchaseRequestEvents).values({
      requestId: created.id,
      eventType: "submitted",
      actorUserId: req.user.userId,
      actorRole: req.user.roleName,
      signedName: submitSig.name,
      signedAt: submitTs,
      signedHash: computeSignedHash({
        userId: req.user.userId, action: "submitted", requestId: created.id,
        timestamp: submitTs.toISOString(), signedName: submitSig.name,
      }),
      payload: { quantity, supplier, unit_cost: unitCost, required_by_date: requiredByDate, notes },
    });

    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "PURCHASE_REQUEST_SUBMITTED",
      entityType: "purchase_request",
      entityId: created.id,
      description: `Purchase request ${created.requestNumber} submitted for ${item.itemName}`,
      metadata: { quantity, supplier, stock_item_id: item.id },
    }).catch(() => null);

    res.status(201).json({ success: true, message: "Purchase request submitted", data: created });
  } catch (err) {
    req.log.error({ err }, "Create purchase request error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

async function loadRequestForAction(reqId: string, user: NonNullable<Express.Request["user"]>) {
  const [row] = await db
    .select({
      id: purchaseRequests.id,
      requestNumber: purchaseRequests.requestNumber,
      status: purchaseRequests.status,
      quantity: purchaseRequests.quantity,
      receivedQuantity: purchaseRequests.receivedQuantity,
      stockItemId: purchaseRequests.stockItemId,
      requestedBy: purchaseRequests.requestedBy,
      facilityId: purchaseRequests.facilityId,
      agencyId: purchaseRequests.agencyId,
      provinceId: purchaseRequests.provinceId,
      itemName: stockItems.itemName,
      itemCode: stockItems.itemCode,
      itemAgencyId: stockItems.agencyId,
      itemProvinceId: stockItems.provinceId,
      itemFacilityId: stockItems.facilityId,
      itemDistrictId: facilities.districtId,
      unitOfMeasure: stockItems.unitOfMeasure,
    })
    .from(purchaseRequests)
    .innerJoin(stockItems, eq(purchaseRequests.stockItemId, stockItems.id))
    .leftJoin(facilities, eq(stockItems.facilityId, facilities.id))
    .where(eq(purchaseRequests.id, reqId))
    .limit(1);
  if (!row) return null;
  if (!isWithinStockScope(user, { agencyId: row.itemAgencyId, provinceId: row.itemProvinceId, facilityId: row.itemFacilityId, districtId: row.itemDistrictId })) {
    return "out_of_scope" as const;
  }
  return row;
}

router.post("/v1/purchase-requests/:id/approve", requireAuth, requireApprover, async (req, res) => {
  if (!req.user) return;
  const sig = requireSignedName(req.body);
  if (!sig.ok) { res.status(400).json({ success: false, message: sig.message, data: null }); return; }
  try {
    const row = await loadRequestForAction(req.params.id as string, req.user);
    if (!row) { res.status(404).json({ success: false, message: "Purchase request not found", data: null }); return; }
    if (row === "out_of_scope") { res.status(403).json({ success: false, message: "Outside your scope", data: null }); return; }
    if (row.status !== "submitted") {
      res.status(400).json({ success: false, message: `Cannot approve a request in status "${row.status}"`, data: null });
      return;
    }
    const approvedAt = new Date();
    const [updated] = await db
      .update(purchaseRequests)
      .set({ status: "approved", approvedBy: req.user.userId, approvedAt, updatedAt: approvedAt })
      .where(eq(purchaseRequests.id, row.id))
      .returning();

    await db.insert(purchaseRequestEvents).values({
      requestId: row.id,
      eventType: "approved",
      actorUserId: req.user.userId,
      actorRole: req.user.roleName,
      signedName: sig.name,
      signedAt: approvedAt,
      signedHash: computeSignedHash({
        userId: req.user.userId, action: "approved", requestId: row.id,
        timestamp: approvedAt.toISOString(), signedName: sig.name,
      }),
    });

    await db.insert(notifications).values({
      userId: row.requestedBy,
      title: "Purchase request approved",
      message: `${row.requestNumber}: your request for ${row.quantity} × ${row.itemName} was approved.`,
    }).catch(() => null);

    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "PURCHASE_REQUEST_APPROVED",
      entityType: "purchase_request",
      entityId: row.id,
      description: `Purchase request ${row.requestNumber} approved`,
    }).catch(() => null);

    res.json({ success: true, message: "Purchase request approved", data: updated });
  } catch (err) {
    req.log.error({ err }, "Approve purchase request error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/purchase-requests/:id/reject", requireAuth, requireApprover, async (req, res) => {
  if (!req.user) return;
  const sig = requireSignedName(req.body);
  if (!sig.ok) { res.status(400).json({ success: false, message: sig.message, data: null }); return; }
  const reason = orNull(req.body?.reason);
  try {
    const row = await loadRequestForAction(req.params.id as string, req.user);
    if (!row) { res.status(404).json({ success: false, message: "Purchase request not found", data: null }); return; }
    if (row === "out_of_scope") { res.status(403).json({ success: false, message: "Outside your scope", data: null }); return; }
    if (row.status !== "submitted") {
      res.status(400).json({ success: false, message: `Cannot reject a request in status "${row.status}"`, data: null });
      return;
    }
    const ts = new Date();
    const [updated] = await db
      .update(purchaseRequests)
      .set({
        status: "rejected",
        approvedBy: req.user.userId,
        approvedAt: ts,
        rejectedReason: reason,
        closedAt: ts,
        updatedAt: ts,
      })
      .where(eq(purchaseRequests.id, row.id))
      .returning();

    await db.insert(purchaseRequestEvents).values({
      requestId: row.id,
      eventType: "rejected",
      actorUserId: req.user.userId,
      actorRole: req.user.roleName,
      signedName: sig.name,
      signedAt: ts,
      reason,
      signedHash: computeSignedHash({
        userId: req.user.userId, action: "rejected", requestId: row.id,
        timestamp: ts.toISOString(), signedName: sig.name,
      }),
    });

    await db.insert(notifications).values({
      userId: row.requestedBy,
      title: "Purchase request rejected",
      message: `${row.requestNumber}: your request for ${row.itemName} was rejected${reason ? ` — ${reason}` : ""}.`,
    }).catch(() => null);

    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "PURCHASE_REQUEST_REJECTED",
      entityType: "purchase_request",
      entityId: row.id,
      description: `Purchase request ${row.requestNumber} rejected`,
      metadata: { reason },
    }).catch(() => null);

    res.json({ success: true, message: "Purchase request rejected", data: updated });
  } catch (err) {
    req.log.error({ err }, "Reject purchase request error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/purchase-requests/:id/receive", requireAuth, requireAssetAdmin, async (req, res) => {
  if (!req.user) return;
  const body = req.body ?? {};
  const sig = requireSignedName(body);
  if (!sig.ok) { res.status(400).json({ success: false, message: sig.message, data: null }); return; }
  const receiveQty = Number(body.quantity);
  if (!Number.isInteger(receiveQty) || receiveQty <= 0) {
    res.status(400).json({ success: false, message: "quantity must be a positive integer", data: null });
    return;
  }
  const reference = orNull(body.reference);
  const reason = orNull(body.reason);

  try {
    const result = await db.transaction(async (tx) => {
      const [pr] = await tx
        .select({
          id: purchaseRequests.id,
          requestNumber: purchaseRequests.requestNumber,
          status: purchaseRequests.status,
          quantity: purchaseRequests.quantity,
          receivedQuantity: purchaseRequests.receivedQuantity,
          stockItemId: purchaseRequests.stockItemId,
          requestedBy: purchaseRequests.requestedBy,
          facilityId: purchaseRequests.facilityId,
          itemName: stockItems.itemName,
          itemCode: stockItems.itemCode,
          itemAgencyId: stockItems.agencyId,
          itemProvinceId: stockItems.provinceId,
          itemFacilityId: stockItems.facilityId,
          itemDistrictId: facilities.districtId,
          itemUnit: stockItems.unitOfMeasure,
          itemOnHand: stockItems.onHandQuantity,
        })
        .from(purchaseRequests)
        .innerJoin(stockItems, eq(purchaseRequests.stockItemId, stockItems.id))
        .leftJoin(facilities, eq(stockItems.facilityId, facilities.id))
        .where(eq(purchaseRequests.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!pr) return { status: 404 as const, message: "Purchase request not found" };
      if (!isWithinStockScope(req.user!, { agencyId: pr.itemAgencyId, provinceId: pr.itemProvinceId, facilityId: pr.itemFacilityId, districtId: pr.itemDistrictId })) {
        return { status: 403 as const, message: "Outside your scope" };
      }
      if (pr.status !== "approved" && pr.status !== "received") {
        return { status: 400 as const, message: `Cannot receive against a request in status "${pr.status}"` };
      }
      const remaining = pr.quantity - pr.receivedQuantity;
      if (remaining <= 0) {
        return { status: 400 as const, message: "Request is already fully received" };
      }
      if (receiveQty > remaining) {
        return { status: 400 as const, message: `Only ${remaining} ${pr.itemUnit} remain to receive` };
      }

      const facilityId = pr.facilityId ?? pr.itemFacilityId ?? null;

      // Upsert the balance for this facility
      const balWhere = facilityId === null
        ? and(eq(stockBalances.stockItemId, pr.stockItemId), sql`${stockBalances.facilityId} IS NULL`)
        : and(eq(stockBalances.stockItemId, pr.stockItemId), eq(stockBalances.facilityId, facilityId));
      const [existingBal] = await tx
        .select({ id: stockBalances.id, quantity: stockBalances.quantity })
        .from(stockBalances)
        .where(balWhere)
        .for("update")
        .limit(1);
      if (existingBal) {
        await tx.update(stockBalances)
          .set({ quantity: existingBal.quantity + receiveQty, updatedAt: new Date() })
          .where(eq(stockBalances.id, existingBal.id));
      } else {
        await tx.insert(stockBalances).values({
          stockItemId: pr.stockItemId,
          facilityId,
          quantity: receiveQty,
        });
      }

      // Insert movement
      await tx.insert(stockMovements).values({
        stockItemId: pr.stockItemId,
        movementType: "receive",
        quantity: receiveQty,
        fromFacilityId: facilityId,
        toFacilityId: null,
        reference: reference ?? pr.requestNumber,
        reason: reason ?? `Receipt against ${pr.requestNumber}`,
        actorUserId: req.user!.userId,
      });

      // Update aggregate on item
      await tx.update(stockItems)
        .set({ onHandQuantity: pr.itemOnHand + receiveQty, updatedAt: new Date() })
        .where(eq(stockItems.id, pr.stockItemId));

      const newReceived = pr.receivedQuantity + receiveQty;
      const fullyReceived = newReceived >= pr.quantity;
      const [updatedPr] = await tx.update(purchaseRequests)
        .set({
          receivedQuantity: newReceived,
          status: fullyReceived ? "closed" : "received",
          receivedAt: pr.status === "approved" ? new Date() : sql`${purchaseRequests.receivedAt}`,
          closedAt: fullyReceived ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(purchaseRequests.id, pr.id))
        .returning();

      return {
        status: 201 as const,
        pr: updatedPr,
        snapshot: pr,
        fullyReceived,
        receivedQty: receiveQty,
      };
    });

    if (result.status !== 201) {
      res.status(result.status).json({ success: false, message: result.message, data: null });
      return;
    }

    const { pr, snapshot, fullyReceived, receivedQty } = result;

    const evTs = new Date();
    await db.insert(purchaseRequestEvents).values({
      requestId: snapshot.id,
      eventType: fullyReceived ? "closed" : "received",
      actorUserId: req.user.userId,
      actorRole: req.user.roleName,
      signedName: sig.name,
      signedAt: evTs,
      reason,
      signedHash: computeSignedHash({
        userId: req.user.userId, action: fullyReceived ? "closed" : "received",
        requestId: snapshot.id, timestamp: evTs.toISOString(), signedName: sig.name,
      }),
      payload: { received_quantity: receivedQty, reference, fully_received: fullyReceived },
    });

    await db.insert(notifications).values({
      userId: snapshot.requestedBy,
      title: fullyReceived ? "Purchase request closed" : "Goods received against your request",
      message: fullyReceived
        ? `${snapshot.requestNumber}: all ${snapshot.quantity} ${snapshot.itemUnit} of ${snapshot.itemName} received and closed.`
        : `${snapshot.requestNumber}: ${receivedQty} ${snapshot.itemUnit} of ${snapshot.itemName} received (partial).`,
    }).catch(() => null);

    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: fullyReceived ? "PURCHASE_REQUEST_CLOSED" : "PURCHASE_REQUEST_RECEIVED",
      entityType: "purchase_request",
      entityId: snapshot.id,
      description: `Received ${receivedQty} ${snapshot.itemUnit} against ${snapshot.requestNumber}`,
      metadata: { received_quantity: receivedQty, fully_received: fullyReceived },
    }).catch(() => null);

    res.status(201).json({ success: true, message: fullyReceived ? "Request closed" : "Receipt recorded", data: pr });
  } catch (err) {
    req.log.error({ err }, "Receive purchase request error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// ── Events / timeline for a purchase request ─────────────────────────────────
router.get("/v1/purchase-requests/:id/events", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    const conditions = [eq(purchaseRequests.id, req.params.id as string), ...scopeFilter(req.user)];
    const [exists] = await db
      .select({ id: purchaseRequests.id })
      .from(purchaseRequests)
      .where(and(...conditions))
      .limit(1);
    if (!exists) {
      res.status(404).json({ success: false, message: "Purchase request not found", data: null });
      return;
    }
    const rows = await db
      .select({
        id: purchaseRequestEvents.id,
        eventType: purchaseRequestEvents.eventType,
        actorRole: purchaseRequestEvents.actorRole,
        signedName: purchaseRequestEvents.signedName,
        signedHash: purchaseRequestEvents.signedHash,
        signedAt: purchaseRequestEvents.signedAt,
        reason: purchaseRequestEvents.reason,
        payload: purchaseRequestEvents.payload,
        createdAt: purchaseRequestEvents.createdAt,
        actorName: users.fullName,
      })
      .from(purchaseRequestEvents)
      .leftJoin(users, eq(users.id, purchaseRequestEvents.actorUserId))
      .where(eq(purchaseRequestEvents.requestId, req.params.id as string))
      .orderBy(asc(purchaseRequestEvents.createdAt));
    res.json({ success: true, message: "Events", data: rows });
  } catch (err) {
    req.log.error({ err }, "List PR events error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
