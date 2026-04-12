import { Router } from "express";
import { eq, and, isNull, ilike, or, sql, desc } from "drizzle-orm";
import { db, assets, assetCategories, provinces, districts, facilities, users, activityLogs } from "@workspace/db";
import { requireAuth, enforceScopeFilter } from "../lib/auth";

const router = Router();

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

    const effectiveProvinceId = province_id || req.user?.scopedProvinceId || undefined;
    if (effectiveProvinceId) conditions.push(eq(assets.provinceId, effectiveProvinceId));
    if (district_id) conditions.push(eq(assets.districtId, district_id));
    if (facility_id) conditions.push(eq(assets.facilityId, facility_id));
    if (category_id) conditions.push(eq(assets.categoryId, category_id));
    if (status) conditions.push(eq(assets.status, status as "active" | "disposed" | "missing" | "under_maintenance"));
    if (condition) conditions.push(eq(assets.condition, condition as "excellent" | "good" | "fair" | "poor"));
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
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        category: {
          id: assetCategories.id,
          categoryName: assetCategories.categoryName,
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
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/v1/assets", requireAuth, async (req, res) => {
  if (!req.user) return;

  const scopeLevel = req.user.scopeLevel;
  const userProvinceId = req.user.provinceId;

  const body = req.body;

  if (!body.asset_name || !body.asset_tag) {
    res.status(400).json({ success: false, message: "asset_name and asset_tag are required" });
    return;
  }

  if (scopeLevel !== "national" && userProvinceId && body.province_id && body.province_id !== userProvinceId) {
    res.status(403).json({ success: false, message: "Cannot create asset outside your province" });
    return;
  }

  try {
    const [row] = await db
      .insert(assets)
      .values({
        assetTag: body.asset_tag,
        assetName: body.asset_name,
        categoryId: body.category_id ?? null,
        serialNumber: body.serial_number ?? null,
        brand: body.brand ?? null,
        model: body.model ?? null,
        purchaseDate: body.purchase_date ?? null,
        purchaseCost: body.purchase_cost != null ? String(body.purchase_cost) : null,
        supplier: body.supplier ?? null,
        warrantyExpiry: body.warranty_expiry ?? null,
        usefulLifeYears: body.useful_life_years ?? null,
        status: body.status ?? "active",
        condition: body.condition ?? "good",
        provinceId: body.province_id ?? userProvinceId ?? null,
        districtId: body.district_id ?? null,
        facilityId: body.facility_id ?? null,
        assignedToUser: body.assigned_to_user ?? null,
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
      res.status(409).json({ success: false, message: "Asset tag already exists" });
      return;
    }
    req.log.error({ err }, "Create asset error");
    res.status(500).json({ success: false, message: "Internal server error" });
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
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        category: {
          id: assetCategories.id,
          categoryName: assetCategories.categoryName,
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
      .where(and(eq(assets.id, req.params.id), isNull(assets.deletedAt)))
      .limit(1);

    if (!row) {
      res.status(404).json({ success: false, message: "Asset not found" });
      return;
    }

    if (req.user!.scopeLevel !== "national" && req.user!.provinceId && row.province?.id !== req.user!.provinceId) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    const logs = await db
      .select()
      .from(activityLogs)
      .where(and(eq(activityLogs.entityType, "asset"), eq(activityLogs.entityId, req.params.id)))
      .orderBy(desc(activityLogs.createdAt))
      .limit(20);

    res.json({ success: true, data: { ...row, activity_logs: logs } });
  } catch (err) {
    req.log.error({ err }, "Get asset error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.put("/v1/assets/:id", requireAuth, async (req, res) => {
  if (!req.user) return;

  try {
    const [existing] = await db
      .select({ id: assets.id, provinceId: assets.provinceId })
      .from(assets)
      .where(and(eq(assets.id, req.params.id), isNull(assets.deletedAt)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: "Asset not found" });
      return;
    }

    if (req.user.scopeLevel !== "national" && req.user.provinceId && existing.provinceId !== req.user.provinceId) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    const body = req.body;
    const [updated] = await db
      .update(assets)
      .set({
        assetName: body.asset_name,
        categoryId: body.category_id ?? null,
        serialNumber: body.serial_number ?? null,
        brand: body.brand ?? null,
        model: body.model ?? null,
        purchaseDate: body.purchase_date ?? null,
        purchaseCost: body.purchase_cost != null ? String(body.purchase_cost) : null,
        supplier: body.supplier ?? null,
        warrantyExpiry: body.warranty_expiry ?? null,
        usefulLifeYears: body.useful_life_years ?? null,
        status: body.status,
        condition: body.condition,
        provinceId: body.province_id ?? null,
        districtId: body.district_id ?? null,
        facilityId: body.facility_id ?? null,
        assignedToUser: body.assigned_to_user ?? null,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, req.params.id))
      .returning();

    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "UPDATE",
      entityType: "asset",
      entityId: req.params.id,
      description: `Updated asset ${updated.assetTag}`,
    });

    res.json({ success: true, message: "Asset updated", data: updated });
  } catch (err) {
    req.log.error({ err }, "Update asset error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.delete("/v1/assets/:id", requireAuth, async (req, res) => {
  if (!req.user) return;

  try {
    const [existing] = await db
      .select({ id: assets.id, provinceId: assets.provinceId, assetTag: assets.assetTag })
      .from(assets)
      .where(and(eq(assets.id, req.params.id), isNull(assets.deletedAt)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: "Asset not found" });
      return;
    }

    if (req.user.scopeLevel !== "national" && req.user.provinceId && existing.provinceId !== req.user.provinceId) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    await db
      .update(assets)
      .set({ deletedAt: new Date() })
      .where(eq(assets.id, req.params.id));

    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "DELETE",
      entityType: "asset",
      entityId: req.params.id,
      description: `Deleted asset ${existing.assetTag}`,
    });

    res.json({ success: true, message: "Asset deleted" });
  } catch (err) {
    req.log.error({ err }, "Delete asset error");
    res.status(500).json({ success: false, message: "Internal server error" });
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
        provinceName: provinces.provinceName,
        facilityName: facilities.facilityName,
      })
      .from(assets)
      .leftJoin(provinces, eq(assets.provinceId, provinces.id))
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .where(and(eq(assets.id, req.params.id), isNull(assets.deletedAt)))
      .limit(1);

    if (!row) {
      res.status(404).json({ success: false, message: "Asset not found" });
      return;
    }

    res.json({
      success: true,
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
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
