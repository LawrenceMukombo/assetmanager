import { Router } from "express";
import { eq, and, isNull, ilike, or, sql, desc, lte, gte, isNotNull, inArray } from "drizzle-orm";
import { db, assets, assetCategories, provinces, districts, facilities, users, activityLogs, notifications, assetTransfers, agencies } from "@workspace/db";
import { requireAuth, enforceScopeFilter, requireAssetAdmin, isWithinAssetScope } from "../lib/auth";

const router = Router();

function computeDepreciation(asset: {
  purchaseCost?: string | null;
  salvageValue?: string | null;
  usefulLifeYears?: number | null;
  purchaseDate?: string | null;
  depreciationMethod?: string;
}) {
  if (
    asset.depreciationMethod === "none" ||
    !asset.purchaseCost ||
    !asset.usefulLifeYears ||
    !asset.purchaseDate
  ) {
    return null;
  }

  const cost = parseFloat(asset.purchaseCost);
  const salvage = asset.salvageValue ? parseFloat(asset.salvageValue) : 0;
  const life = asset.usefulLifeYears;
  const purchasedAt = new Date(asset.purchaseDate);
  const now = new Date();
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsElapsed = Math.max(0, (now.getTime() - purchasedAt.getTime()) / msPerYear);

  let currentValue: number;
  let annualDepreciation: number;

  if (asset.depreciationMethod === "straight_line") {
    annualDepreciation = (cost - salvage) / life;
    currentValue = Math.max(salvage, cost - annualDepreciation * yearsElapsed);
  } else {
    const rate = 2 / life;
    annualDepreciation = cost * rate;
    currentValue = Math.max(salvage, cost * Math.pow(1 - rate, yearsElapsed));
  }

  const depreciatedAmount = cost - currentValue;
  const percentDepreciated = cost > 0 ? (depreciatedAmount / cost) * 100 : 0;

  return {
    method: asset.depreciationMethod,
    original_cost: cost,
    salvage_value: salvage,
    useful_life_years: life,
    years_elapsed: Math.round(yearsElapsed * 10) / 10,
    annual_depreciation: Math.round(annualDepreciation * 100) / 100,
    current_value: Math.round(currentValue * 100) / 100,
    depreciated_amount: Math.round(depreciatedAmount * 100) / 100,
    percent_depreciated: Math.round(percentDepreciated * 10) / 10,
  };
}

router.get("/v1/assets", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const {
      page = "1",
      limit = "20",
      province_id,
      district_id,
      facility_id,
      category_id,
      status,
      condition,
      search,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [isNull(assets.deletedAt)];

    const effectiveAgencyId = req.user?.scopedAgencyId || undefined;
    if (effectiveAgencyId) {
      // Agency users see ONLY their agency's assets — never province/district/facility filters
      conditions.push(eq(assets.agencyId, effectiveAgencyId));
    } else {
      const effectiveProvinceId = province_id || req.user?.scopedProvinceId || undefined;
      const effectiveDistrictId = district_id || req.user?.scopedDistrictId || undefined;
      const effectiveFacilityId = facility_id || req.user?.scopedFacilityId || undefined;

      if (effectiveProvinceId) conditions.push(eq(assets.provinceId, effectiveProvinceId));
      if (effectiveDistrictId) conditions.push(eq(assets.districtId, effectiveDistrictId));
      if (effectiveFacilityId) conditions.push(eq(assets.facilityId, effectiveFacilityId));
    }
    if (category_id) conditions.push(eq(assets.categoryId, category_id));
    const VALID_STATUSES = ["active", "disposed", "missing", "under_maintenance"] as const;
    const VALID_CONDITIONS = ["excellent", "good", "fair", "poor"] as const;
    if (status) {
      const statusValues = status.split(",").map((s) => s.trim()).filter((s): s is typeof VALID_STATUSES[number] => (VALID_STATUSES as readonly string[]).includes(s));
      if (statusValues.length === 1) {
        conditions.push(eq(assets.status, statusValues[0]));
      } else if (statusValues.length > 1) {
        conditions.push(inArray(assets.status, statusValues));
      }
    }
    if (condition) {
      const conditionValues = condition.split(",").map((c) => c.trim()).filter((c): c is typeof VALID_CONDITIONS[number] => (VALID_CONDITIONS as readonly string[]).includes(c));
      if (conditionValues.length === 1) {
        conditions.push(eq(assets.condition, conditionValues[0]));
      } else if (conditionValues.length > 1) {
        conditions.push(inArray(assets.condition, conditionValues));
      }
    }
    if (search) {
      conditions.push(
        or(
          ilike(assets.assetName, `%${search}%`),
          ilike(assets.assetTag, `%${search}%`),
          ilike(assets.serialNumber, `%${search}%`),
          ilike(assets.brand, `%${search}%`),
        )!,
      );
    }

    const where = and(...conditions);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(assets)
      .where(where);

    const rows = await db
      .select({
        id: assets.id,
        assetTag: assets.assetTag,
        assetName: assets.assetName,
        serialNumber: assets.serialNumber,
        brand: assets.brand,
        model: assets.model,
        status: assets.status,
        condition: assets.condition,
        purchaseDate: assets.purchaseDate,
        purchaseCost: assets.purchaseCost,
        supplier: assets.supplier,
        warrantyExpiry: assets.warrantyExpiry,
        usefulLifeYears: assets.usefulLifeYears,
        depreciationMethod: assets.depreciationMethod,
        salvageValue: assets.salvageValue,
        photoUrl: assets.photoUrl,
        notes: assets.notes,
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        category: {
          id: assetCategories.id,
          categoryName: assetCategories.categoryName,
          categoryCode: assetCategories.categoryCode,
        },
        province: {
          id: provinces.id,
          provinceName: provinces.provinceName,
          flagUrl: provinces.flagUrl,
          themeAccentColor: provinces.themeAccentColor,
        },
        district: {
          id: districts.id,
          districtName: districts.districtName,
        },
        facility: {
          id: facilities.id,
          facilityName: facilities.facilityName,
        },
        assignedUser: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .leftJoin(provinces, eq(assets.provinceId, provinces.id))
      .leftJoin(districts, eq(assets.districtId, districts.id))
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .leftJoin(users, eq(assets.assignedToUser, users.id))
      .where(where)
      .orderBy(desc(assets.createdAt))
      .limit(limitNum)
      .offset(offset);

    res.json({
      success: true,
      message: "Assets retrieved",
      data: {
        items: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          total_pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (err) {
    req.log.error({ err }, "Get assets error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

/** Convert empty strings (and null/undefined) to null for optional DB fields */
function orNull(v: unknown): null | string {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

router.post("/v1/assets", requireAuth, requireAssetAdmin, async (req, res) => {
  if (!req.user) return;

  const scopeLevel = req.user.scopeLevel;
  const userProvinceId = req.user.provinceId;
  const userAgencyId = req.user.agencyId;
  const isAgencyScoped = scopeLevel === "agency" || !!userAgencyId;

  const body = req.body;

  if (!body.asset_name || !body.asset_tag) {
    res.status(400).json({ success: false, message: "asset_name and asset_tag are required", data: null });
    return;
  }

  // Agency users: assets MUST belong to their agency (no province)
  if (isAgencyScoped) {
    if (body.province_id) {
      res.status(403).json({ success: false, message: "Agency users cannot assign assets to a province", data: null });
      return;
    }
    if (body.agency_id && body.agency_id !== userAgencyId) {
      res.status(403).json({ success: false, message: "Cannot create asset outside your agency scope", data: null });
      return;
    }
  } else if (scopeLevel !== "national" && body.province_id) {
    if (!isWithinAssetScope(req.user, {
      provinceId: body.province_id as string,
      districtId: body.district_id as string | undefined,
      facilityId: body.facility_id as string | undefined,
    })) {
      res.status(403).json({ success: false, message: "Cannot create asset outside your geographic scope", data: null });
      return;
    }
  }

  try {
    const [row] = await db
      .insert(assets)
      .values({
        assetTag: body.asset_tag,
        assetName: body.asset_name,
        categoryId: orNull(body.category_id),
        serialNumber: orNull(body.serial_number),
        brand: orNull(body.brand),
        model: orNull(body.model),
        purchaseDate: orNull(body.purchase_date),
        purchaseCost: orNull(body.purchase_cost),
        supplier: orNull(body.supplier),
        warrantyExpiry: orNull(body.warranty_expiry),
        usefulLifeYears: body.useful_life_years != null && body.useful_life_years !== "" ? Number(body.useful_life_years) : null,
        depreciationMethod: orNull(body.depreciation_method) ?? "none",
        salvageValue: orNull(body.salvage_value),
        photoUrl: orNull(body.photo_url),
        notes: orNull(body.notes),
        status: body.status ?? "active",
        condition: body.condition ?? "good",
        provinceId: isAgencyScoped ? null : (orNull(body.province_id) ?? userProvinceId ?? null),
        agencyId: isAgencyScoped ? userAgencyId : null,
        districtId: isAgencyScoped ? null : orNull(body.district_id),
        facilityId: isAgencyScoped ? null : orNull(body.facility_id),
        assignedToUser: orNull(body.assigned_to_user),
        createdBy: req.user.userId,
      })
      .returning();

    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "CREATE",
      entityType: "asset",
      entityId: row.id,
      description: `Created asset ${row.assetTag} - ${row.assetName}`,
    });

    res.status(201).json({ success: true, message: "Asset created", data: row });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "23505") {
      res.status(409).json({ success: false, message: "Asset tag already exists", data: null });
      return;
    }
    req.log.error({ err }, "Create asset error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// Returns the latest asset_tag in scope that matches `[AGENCY]-[TYPE]-[NNN]`
// for the requested 3-letter `type` (e.g. BLD, VEH, OFF, ICT, COM), sorted by
// the numeric suffix. Used by the New Asset form to prefill the next code.
// Also returns the caller's agency code so the client can fall back to
// `[AGENCY]-[TYPE]-001` when no asset of that type exists yet.
router.get("/v1/assets/latest-code", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    const rawType = String((req.query as { type?: string }).type ?? "").toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(rawType)) {
      res.status(400).json({ success: false, message: "type must be 2-5 uppercase letters", data: null });
      return;
    }

    let agencyCode: string | null = null;
    if (req.user.agencyId) {
      const [ag] = await db
        .select({ agencyCode: agencies.agencyCode })
        .from(agencies)
        .where(eq(agencies.id, req.user.agencyId))
        .limit(1);
      agencyCode = ag?.agencyCode ?? null;
    }

    const scopeConditions = (() => {
      const u = req.user!;
      if (u.scopeLevel === "national") return [];
      if (u.scopeLevel === "agency" || u.agencyId) {
        return u.agencyId ? [eq(assets.agencyId, u.agencyId)] : [sql`1=0`];
      }
      if (u.facilityId) return [eq(assets.facilityId, u.facilityId)];
      if (u.districtId) return [eq(assets.districtId, u.districtId)];
      if (u.provinceId) return [eq(assets.provinceId, u.provinceId)];
      return [sql`1=0`];
    })();

    const conditions = [
      isNull(assets.deletedAt),
      sql`${assets.assetTag} ~ ${'^[A-Z0-9]+-' + rawType + '-[0-9]+$'}`,
      ...scopeConditions,
    ];

    const [row] = await db
      .select({ assetTag: assets.assetTag })
      .from(assets)
      .where(and(...conditions))
      .orderBy(sql`CAST(SPLIT_PART(${assets.assetTag}, '-', 3) AS INTEGER) DESC`)
      .limit(1);

    res.json({
      success: true,
      message: "Latest asset code retrieved",
      data: { latestCode: row?.assetTag ?? null, agencyCode, type: rawType },
    });
  } catch (err) {
    req.log.error({ err }, "Get latest asset code error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/assets/:id/neighbors", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const id = req.params.id as string;

    const [current] = await db
      .select({
        id: assets.id,
        agencyId: assets.agencyId,
        provinceId: assets.provinceId,
        districtId: assets.districtId,
        facilityId: assets.facilityId,
      })
      .from(assets)
      .where(and(eq(assets.id, id), isNull(assets.deletedAt)))
      .limit(1);

    if (!current) {
      res.status(404).json({ success: false, message: "Asset not found", data: null });
      return;
    }

    if (!isWithinAssetScope(req.user!, {
      agencyId: current.agencyId,
      provinceId: current.provinceId,
      districtId: current.districtId,
      facilityId: current.facilityId,
    })) {
      res.status(403).json({ success: false, message: "Access denied", data: null });
      return;
    }

    const {
      province_id,
      district_id,
      facility_id,
      category_id,
      status,
      condition,
      search,
    } = req.query as Record<string, string>;

    const conditions = [isNull(assets.deletedAt)];

    const effectiveAgencyId = req.user?.scopedAgencyId || undefined;
    if (effectiveAgencyId) {
      conditions.push(eq(assets.agencyId, effectiveAgencyId));
    } else {
      const effectiveProvinceId = province_id || req.user?.scopedProvinceId || undefined;
      const effectiveDistrictId = district_id || req.user?.scopedDistrictId || undefined;
      const effectiveFacilityId = facility_id || req.user?.scopedFacilityId || undefined;

      if (effectiveProvinceId) conditions.push(eq(assets.provinceId, effectiveProvinceId));
      if (effectiveDistrictId) conditions.push(eq(assets.districtId, effectiveDistrictId));
      if (effectiveFacilityId) conditions.push(eq(assets.facilityId, effectiveFacilityId));
    }

    if (category_id) conditions.push(eq(assets.categoryId, category_id));

    const VALID_STATUSES = ["active", "disposed", "missing", "under_maintenance"] as const;
    const VALID_CONDITIONS = ["excellent", "good", "fair", "poor"] as const;

    if (status) {
      const sv = status.split(",").map((s) => s.trim()).filter((s): s is typeof VALID_STATUSES[number] => (VALID_STATUSES as readonly string[]).includes(s));
      if (sv.length === 1) conditions.push(eq(assets.status, sv[0]));
      else if (sv.length > 1) conditions.push(inArray(assets.status, sv));
    }
    if (condition) {
      const cv = condition.split(",").map((c) => c.trim()).filter((c): c is typeof VALID_CONDITIONS[number] => (VALID_CONDITIONS as readonly string[]).includes(c));
      if (cv.length === 1) conditions.push(eq(assets.condition, cv[0]));
      else if (cv.length > 1) conditions.push(inArray(assets.condition, cv));
    }
    if (search) {
      conditions.push(
        or(
          ilike(assets.assetName, `%${search}%`),
          ilike(assets.assetTag, `%${search}%`),
          ilike(assets.serialNumber, `%${search}%`),
          ilike(assets.brand, `%${search}%`),
        )!,
      );
    }

    const rows = await db
      .select({ id: assets.id, assetTag: assets.assetTag, assetName: assets.assetName })
      .from(assets)
      .where(and(...conditions))
      .orderBy(desc(assets.createdAt));

    const idx = rows.findIndex((r) => r.id === id);

    if (idx === -1) {
      const [{ totalAll }] = await db
        .select({ totalAll: sql<number>`count(*)::int` })
        .from(assets)
        .where(and(...conditions));
      res.json({
        success: true,
        message: "Neighbors retrieved",
        data: { previous: null, next: null, position: 0, total: totalAll, in_context: false },
      });
      return;
    }

    res.json({
      success: true,
      message: "Neighbors retrieved",
      data: {
        previous: idx > 0 ? rows[idx - 1] : null,
        next: idx < rows.length - 1 ? rows[idx + 1] : null,
        position: idx + 1,
        total: rows.length,
        in_context: true,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Get asset neighbors error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/assets/:id", requireAuth, async (req, res) => {
  try {
    const [row] = await db
      .select({
        id: assets.id,
        assetTag: assets.assetTag,
        assetName: assets.assetName,
        serialNumber: assets.serialNumber,
        brand: assets.brand,
        model: assets.model,
        status: assets.status,
        condition: assets.condition,
        purchaseDate: assets.purchaseDate,
        purchaseCost: assets.purchaseCost,
        supplier: assets.supplier,
        warrantyExpiry: assets.warrantyExpiry,
        usefulLifeYears: assets.usefulLifeYears,
        depreciationMethod: assets.depreciationMethod,
        salvageValue: assets.salvageValue,
        photoUrl: assets.photoUrl,
        notes: assets.notes,
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        category: {
          id: assetCategories.id,
          categoryName: assetCategories.categoryName,
          categoryCode: assetCategories.categoryCode,
        },
        province: {
          id: provinces.id,
          provinceName: provinces.provinceName,
          flagUrl: provinces.flagUrl,
          themeAccentColor: provinces.themeAccentColor,
        },
        district: {
          id: districts.id,
          districtName: districts.districtName,
        },
        facility: {
          id: facilities.id,
          facilityName: facilities.facilityName,
        },
        agency: {
          id: agencies.id,
          agencyName: agencies.agencyName,
          agencyCode: agencies.agencyCode,
          logoUrl: agencies.logoUrl,
        },
        assignedUser: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .leftJoin(provinces, eq(assets.provinceId, provinces.id))
      .leftJoin(districts, eq(assets.districtId, districts.id))
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .leftJoin(agencies, eq(assets.agencyId, agencies.id))
      .leftJoin(users, eq(assets.assignedToUser, users.id))
      .where(and(eq(assets.id, req.params.id as string), isNull(assets.deletedAt)))
      .limit(1);

    if (!row) {
      res.status(404).json({ success: false, message: "Asset not found", data: null });
      return;
    }

    const [scopeRow] = await db
      .select({ agencyId: assets.agencyId, provinceId: assets.provinceId, districtId: assets.districtId, facilityId: assets.facilityId })
      .from(assets)
      .where(eq(assets.id, req.params.id as string))
      .limit(1);

    if (!isWithinAssetScope(req.user!, {
      agencyId: scopeRow?.agencyId ?? null,
      provinceId: scopeRow?.provinceId ?? null,
      districtId: scopeRow?.districtId ?? null,
      facilityId: scopeRow?.facilityId ?? null,
    })) {
      res.status(403).json({ success: false, message: "Access denied", data: null });
      return;
    }

    const logs = await db
      .select({
        id: activityLogs.id,
        actionType: activityLogs.actionType,
        description: activityLogs.description,
        metadata: activityLogs.metadata,
        createdAt: activityLogs.createdAt,
        userId: activityLogs.userId,
        actorName: users.fullName,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(and(eq(activityLogs.entityType, "asset"), eq(activityLogs.entityId, req.params.id as string)))
      .orderBy(desc(activityLogs.createdAt))
      .limit(20);

    const depreciation = computeDepreciation(row);

    res.json({ success: true, message: "Asset retrieved", data: { ...row, activity_logs: logs, depreciation } });
  } catch (err) {
    req.log.error({ err }, "Get asset error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.put("/v1/assets/:id", requireAuth, requireAssetAdmin, async (req, res) => {
  if (!req.user) return;

  try {
    const [existing] = await db
      .select({ id: assets.id, provinceId: assets.provinceId, agencyId: assets.agencyId, districtId: assets.districtId, facilityId: assets.facilityId, assetTag: assets.assetTag, status: assets.status })
      .from(assets)
      .where(and(eq(assets.id, req.params.id as string), isNull(assets.deletedAt)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: "Asset not found", data: null });
      return;
    }

    if (!isWithinAssetScope(req.user, {
      provinceId: existing.provinceId,
      agencyId: existing.agencyId,
      districtId: existing.districtId,
      facilityId: existing.facilityId,
    })) {
      res.status(403).json({ success: false, message: "Access denied", data: null });
      return;
    }

    const body = req.body;

    const isAgencyAsset = !!existing.agencyId;
    const targetProvinceId = isAgencyAsset
      ? null
      : (body.province_id !== undefined ? (orNull(body.province_id) ?? existing.provinceId) : existing.provinceId);
    if (req.user.scopeLevel !== "national" && !isAgencyAsset && targetProvinceId && targetProvinceId !== existing.provinceId) {
      res.status(403).json({ success: false, message: "Cannot reassign asset to a different province", data: null });
      return;
    }

    const [updated] = await db
      .update(assets)
      .set({
        assetName: body.asset_name,
        categoryId: orNull(body.category_id),
        serialNumber: orNull(body.serial_number),
        brand: orNull(body.brand),
        model: orNull(body.model),
        purchaseDate: orNull(body.purchase_date),
        purchaseCost: orNull(body.purchase_cost),
        supplier: orNull(body.supplier),
        warrantyExpiry: orNull(body.warranty_expiry),
        usefulLifeYears: body.useful_life_years != null && body.useful_life_years !== "" ? Number(body.useful_life_years) : null,
        depreciationMethod: orNull(body.depreciation_method) ?? "none",
        salvageValue: orNull(body.salvage_value),
        photoUrl: body.photo_url !== undefined ? orNull(body.photo_url) : undefined,
        notes: body.notes !== undefined ? orNull(body.notes) : undefined,
        status: body.status,
        condition: body.condition,
        provinceId: targetProvinceId,
        districtId: isAgencyAsset ? null : orNull(body.district_id),
        facilityId: isAgencyAsset ? null : orNull(body.facility_id),
        assignedToUser: orNull(body.assigned_to_user),
        updatedAt: new Date(),
      })
      .where(eq(assets.id, req.params.id as string))
      .returning();

    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "UPDATE",
      entityType: "asset",
      entityId: req.params.id as string,
      description: `Updated asset ${updated.assetTag}`,
    });

    // Lifecycle: record explicit status-change event when status differs
    if (body.status && body.status !== existing.status) {
      const statusActionMap: Record<string, string> = {
        active: "STATUS_ACTIVATED",
        under_maintenance: "STATUS_TO_MAINTENANCE",
        missing: "STATUS_REPORTED_MISSING",
        disposed: "STATUS_DISPOSED",
      };
      await db.insert(activityLogs).values({
        userId: req.user.userId,
        actionType: statusActionMap[body.status] ?? "STATUS_CHANGED",
        entityType: "asset",
        entityId: req.params.id as string,
        description: `Status changed to ${body.status}`,
        metadata: { from: existing.status, to: body.status },
      }).catch(() => null);
    }

    res.json({ success: true, message: "Asset updated", data: updated });
  } catch (err) {
    req.log.error({ err }, "Update asset error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.delete("/v1/assets/:id", requireAuth, requireAssetAdmin, async (req, res) => {
  if (!req.user) return;

  try {
    const [existing] = await db
      .select({ id: assets.id, provinceId: assets.provinceId, agencyId: assets.agencyId, districtId: assets.districtId, facilityId: assets.facilityId, assetTag: assets.assetTag })
      .from(assets)
      .where(and(eq(assets.id, req.params.id as string), isNull(assets.deletedAt)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: "Asset not found", data: null });
      return;
    }

    if (!isWithinAssetScope(req.user, {
      provinceId: existing.provinceId,
      agencyId: existing.agencyId,
      districtId: existing.districtId,
      facilityId: existing.facilityId,
    })) {
      res.status(403).json({ success: false, message: "Access denied", data: null });
      return;
    }

    await db
      .update(assets)
      .set({ deletedAt: new Date() })
      .where(eq(assets.id, req.params.id as string));

    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "DELETE",
      entityType: "asset",
      entityId: req.params.id as string,
      description: `Deleted asset ${existing.assetTag}`,
    });

    res.json({ success: true, message: "Asset deleted", data: null });
  } catch (err) {
    req.log.error({ err }, "Delete asset error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/assets/:id/qr-data", requireAuth, async (req, res) => {
  try {
    const [row] = await db
      .select({
        id: assets.id,
        assetTag: assets.assetTag,
        assetName: assets.assetName,
        serialNumber: assets.serialNumber,
        status: assets.status,
        provinceId: assets.provinceId,
        districtId: assets.districtId,
        facilityId: assets.facilityId,
        provinceName: provinces.provinceName,
        facilityName: facilities.facilityName,
      })
      .from(assets)
      .leftJoin(provinces, eq(assets.provinceId, provinces.id))
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .where(and(eq(assets.id, req.params.id as string), isNull(assets.deletedAt)))
      .limit(1);

    if (!row) {
      res.status(404).json({ success: false, message: "Asset not found", data: null });
      return;
    }

    if (!isWithinAssetScope(req.user!, {
      provinceId: row.provinceId,
      districtId: row.districtId,
      facilityId: row.facilityId,
    })) {
      res.status(403).json({ success: false, message: "Access denied", data: null });
      return;
    }

    res.json({
      success: true,
      message: "QR data retrieved",
      data: {
        qr_value: `NPAMS:${row.assetTag}:${row.id}`,
        asset_tag: row.assetTag,
        asset_name: row.assetName,
        serial_number: row.serialNumber,
        location: [row.provinceName, row.facilityName].filter(Boolean).join(" / "),
        status: row.status,
      },
    });
  } catch (err) {
    req.log.error({ err }, "QR data error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/assets/:id/status", requireAuth, requireAssetAdmin, async (req, res) => {
  if (!req.user) return;

  try {
    const [existing] = await db
      .select({ id: assets.id, provinceId: assets.provinceId, districtId: assets.districtId, facilityId: assets.facilityId, assetTag: assets.assetTag, status: assets.status })
      .from(assets)
      .where(and(eq(assets.id, req.params.id as string), isNull(assets.deletedAt)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: "Asset not found", data: null });
      return;
    }

    if (!isWithinAssetScope(req.user, {
      provinceId: existing.provinceId,
      districtId: existing.districtId,
      facilityId: existing.facilityId,
    })) {
      res.status(403).json({ success: false, message: "Access denied", data: null });
      return;
    }

    const { status, notes } = req.body as { status: "active" | "under_maintenance" | "disposed" | "missing"; notes?: string };
    const validStatuses = ["active", "under_maintenance", "disposed", "missing"];

    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(", ")}`, data: null });
      return;
    }

    if (status === existing.status) {
      res.status(400).json({ success: false, message: "Asset is already in that status", data: null });
      return;
    }

    const [updated] = await db
      .update(assets)
      .set({ status, updatedAt: new Date() })
      .where(eq(assets.id, existing.id))
      .returning();

    const actionLabels: Record<string, string> = {
      active: "Marked as Active",
      under_maintenance: "Marked as Under Maintenance",
      disposed: "Marked as Disposed",
      missing: "Reported as Missing",
    };

    const actionTypeMap: Record<string, string> = {
      active: "STATUS_ACTIVATED",
      under_maintenance: "STATUS_TO_MAINTENANCE",
      disposed: "STATUS_DISPOSED",
      missing: "STATUS_REPORTED_MISSING",
    };
    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: actionTypeMap[status] ?? "STATUS_CHANGE",
      entityType: "asset",
      entityId: existing.id,
      description: `${actionLabels[status] ?? `Status changed to ${status}`} — ${existing.assetTag}${notes ? ". Notes: " + notes : ""}`,
      metadata: { fromStatus: existing.status, toStatus: status, notes: notes ?? null },
    });

    res.json({ success: true, message: "Asset status updated", data: updated });
  } catch (err) {
    req.log.error({ err }, "Update asset status error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/assets/:id/transfer", requireAuth, requireAssetAdmin, async (req, res) => {
  if (!req.user) return;

  try {
    const [existing] = await db
      .select({
        id: assets.id,
        assetTag: assets.assetTag,
        assetName: assets.assetName,
        provinceId: assets.provinceId,
        districtId: assets.districtId,
        facilityId: assets.facilityId,
      })
      .from(assets)
      .where(and(eq(assets.id, req.params.id as string), isNull(assets.deletedAt)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: "Asset not found", data: null });
      return;
    }

    if (!isWithinAssetScope(req.user, {
      provinceId: existing.provinceId,
      districtId: existing.districtId,
      facilityId: existing.facilityId,
    })) {
      res.status(403).json({ success: false, message: "Access denied", data: null });
      return;
    }

    const { to_province_id, to_district_id, to_facility_id, reason } = req.body as {
      to_province_id: string;
      to_district_id?: string;
      to_facility_id?: string;
      reason?: string;
    };

    if (!to_province_id) {
      res.status(400).json({ success: false, message: "to_province_id is required", data: null });
      return;
    }

    if (req.user.scopeLevel !== "national" && to_province_id !== existing.provinceId) {
      res.status(403).json({ success: false, message: "Cannot transfer asset to a different province outside your scope", data: null });
      return;
    }

    await db.insert(assetTransfers).values({
      assetId: existing.id,
      fromProvinceId: existing.provinceId,
      fromDistrictId: existing.districtId,
      fromFacilityId: existing.facilityId,
      toProvinceId: to_province_id,
      toDistrictId: to_district_id ?? null,
      toFacilityId: to_facility_id ?? null,
      transferredBy: req.user.userId,
      reason: reason ?? null,
    });

    const [updated] = await db
      .update(assets)
      .set({
        provinceId: to_province_id,
        districtId: to_district_id ?? null,
        facilityId: to_facility_id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, existing.id))
      .returning();

    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "TRANSFER",
      entityType: "asset",
      entityId: existing.id,
      description: `Transferred asset ${existing.assetTag}${reason ? ": " + reason : ""}`,
      metadata: {
        from_province_id: existing.provinceId,
        to_province_id,
        from_facility_id: existing.facilityId,
        to_facility_id: to_facility_id ?? null,
        reason: reason ?? null,
      },
    });

    res.json({ success: true, message: "Asset transferred successfully", data: updated });
  } catch (err) {
    req.log.error({ err }, "Transfer asset error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/assets/:id/transfers", requireAuth, async (req, res) => {
  try {
    const [existing] = await db
      .select({ id: assets.id, provinceId: assets.provinceId, districtId: assets.districtId, facilityId: assets.facilityId })
      .from(assets)
      .where(and(eq(assets.id, req.params.id as string), isNull(assets.deletedAt)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: "Asset not found", data: null });
      return;
    }

    if (!isWithinAssetScope(req.user!, {
      provinceId: existing.provinceId,
      districtId: existing.districtId,
      facilityId: existing.facilityId,
    })) {
      res.status(403).json({ success: false, message: "Access denied", data: null });
      return;
    }

    const fromProvinces = db.select({ id: provinces.id, provinceName: provinces.provinceName }).from(provinces).as("from_prov");
    const toProvinces = db.select({ id: provinces.id, provinceName: provinces.provinceName }).from(provinces).as("to_prov");
    const fromFacilities = db.select({ id: facilities.id, facilityName: facilities.facilityName }).from(facilities).as("from_fac");
    const toFacilities = db.select({ id: facilities.id, facilityName: facilities.facilityName }).from(facilities).as("to_fac");
    const transferUsers = db.select({ id: users.id, fullName: users.fullName }).from(users).as("trans_user");

    const transfers = await db
      .select({
        id: assetTransfers.id,
        reason: assetTransfers.reason,
        transferredAt: assetTransfers.transferredAt,
        fromProvince: fromProvinces.provinceName,
        fromFacility: fromFacilities.facilityName,
        toProvince: toProvinces.provinceName,
        toFacility: toFacilities.facilityName,
        transferredBy: transferUsers.fullName,
      })
      .from(assetTransfers)
      .leftJoin(fromProvinces, eq(assetTransfers.fromProvinceId, fromProvinces.id))
      .leftJoin(toProvinces, eq(assetTransfers.toProvinceId, toProvinces.id))
      .leftJoin(fromFacilities, eq(assetTransfers.fromFacilityId, fromFacilities.id))
      .leftJoin(toFacilities, eq(assetTransfers.toFacilityId, toFacilities.id))
      .leftJoin(transferUsers, eq(assetTransfers.transferredBy, transferUsers.id))
      .where(eq(assetTransfers.assetId, req.params.id as string))
      .orderBy(desc(assetTransfers.transferredAt));

    res.json({ success: true, message: "Transfers retrieved", data: transfers });
  } catch (err) {
    req.log.error({ err }, "Get transfers error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/assets/:id/lifecycle", requireAuth, async (req, res) => {
  if (!req.user) return;
  try {
    const [existing] = await db
      .select({ id: assets.id, provinceId: assets.provinceId, agencyId: assets.agencyId, districtId: assets.districtId, facilityId: assets.facilityId, assetTag: assets.assetTag, assetName: assets.assetName, status: assets.status, createdAt: assets.createdAt })
      .from(assets)
      .where(and(eq(assets.id, req.params.id as string), isNull(assets.deletedAt)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ success: false, message: "Asset not found", data: null });
      return;
    }
    if (!isWithinAssetScope(req.user, {
      provinceId: existing.provinceId,
      agencyId: existing.agencyId,
      districtId: existing.districtId,
      facilityId: existing.facilityId,
    })) {
      res.status(403).json({ success: false, message: "Access denied", data: null });
      return;
    }
    const events = await db
      .select({
        id: activityLogs.id,
        actionType: activityLogs.actionType,
        description: activityLogs.description,
        metadata: activityLogs.metadata,
        createdAt: activityLogs.createdAt,
        actorId: activityLogs.userId,
        actorName: users.fullName,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(and(eq(activityLogs.entityType, "asset"), eq(activityLogs.entityId, req.params.id as string)))
      .orderBy(desc(activityLogs.createdAt));
    res.json({
      success: true,
      message: "Lifecycle retrieved",
      data: {
        asset: { id: existing.id, assetTag: existing.assetTag, assetName: existing.assetName, currentStatus: existing.status, createdAt: existing.createdAt },
        events,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Get lifecycle error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/assets/warranty-check", requireAuth, async (req, res) => {
  if (!req.user || !["Super Admin", "National Asset Controller"].includes(req.user.roleName)) {
    res.status(403).json({ success: false, message: "Access denied", data: null });
    return;
  }

  try {
    const created = await runWarrantyCheck();
    res.json({ success: true, message: `Warranty check complete. ${created} notifications created.`, data: { notifications_created: created } });
  } catch (err) {
    req.log.error({ err }, "Warranty check error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export async function runWarrantyCheck(): Promise<number> {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split("T")[0];
  const in30DaysStr = in30Days.toISOString().split("T")[0];

  const expiringAssets = await db
    .select({
      id: assets.id,
      assetTag: assets.assetTag,
      assetName: assets.assetName,
      warrantyExpiry: assets.warrantyExpiry,
      provinceId: assets.provinceId,
      provinceName: provinces.provinceName,
    })
    .from(assets)
    .leftJoin(provinces, eq(assets.provinceId, provinces.id))
    .where(
      and(
        isNull(assets.deletedAt),
        isNotNull(assets.warrantyExpiry),
        gte(assets.warrantyExpiry, todayStr),
        lte(assets.warrantyExpiry, in30DaysStr),
      ),
    );

  if (expiringAssets.length === 0) return 0;

  const adminUsers = await db
    .select({ id: users.id, provinceId: users.id })
    .from(users)
    .where(isNull(users.deletedAt));

  let notifCount = 0;

  for (const asset of expiringAssets) {
    const daysLeft = Math.ceil((new Date(asset.warrantyExpiry!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    for (const user of adminUsers) {
      await db.insert(notifications).values({
        userId: user.id,
        title: `Warranty Expiring: ${asset.assetTag}`,
        message: `${asset.assetName} (${asset.provinceName ?? "Unknown"}) warranty expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${asset.warrantyExpiry}).`,
      }).onConflictDoNothing();
      notifCount++;
    }
  }

  return notifCount;
}

export default router;
