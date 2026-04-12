import { Router } from "express";
import { eq, and, isNull, ilike, or, sql, desc } from "drizzle-orm";
import { db, assets, assetCategories, provinces, districts, facilities } from "@workspace/db";
import { requireAuth, enforceScopeFilter } from "../lib/auth";

const router = Router();

router.get("/v1/reports/assets", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const { province_id, district_id, facility_id, category_id, status, condition, search } = req.query as Record<string, string>;

    const conditions = [isNull(assets.deletedAt)];
    const effectiveProvinceId = province_id || req.user?.scopedProvinceId || undefined;
    const effectiveDistrictId = district_id || req.user?.scopedDistrictId || undefined;
    const effectiveFacilityId = facility_id || req.user?.scopedFacilityId || undefined;
    if (effectiveProvinceId) conditions.push(eq(assets.provinceId, effectiveProvinceId));
    if (effectiveDistrictId) conditions.push(eq(assets.districtId, effectiveDistrictId));
    if (effectiveFacilityId) conditions.push(eq(assets.facilityId, effectiveFacilityId));
    if (category_id) conditions.push(eq(assets.categoryId, category_id));
    if (status) conditions.push(eq(assets.status, status as "active" | "disposed" | "missing" | "under_maintenance"));
    if (condition) conditions.push(eq(assets.condition, condition as "excellent" | "good" | "fair" | "poor"));
    if (search) {
      conditions.push(
        or(
          ilike(assets.assetName, `%${search}%`),
          ilike(assets.assetTag, `%${search}%`),
          ilike(assets.serialNumber, `%${search}%`),
        )!,
      );
    }

    const rows = await db
      .select({
        asset_tag: assets.assetTag,
        asset_name: assets.assetName,
        serial_number: assets.serialNumber,
        brand: assets.brand,
        model: assets.model,
        status: assets.status,
        condition: assets.condition,
        purchase_date: assets.purchaseDate,
        purchase_cost: assets.purchaseCost,
        supplier: assets.supplier,
        warranty_expiry: assets.warrantyExpiry,
        useful_life_years: assets.usefulLifeYears,
        created_at: assets.createdAt,
        category_name: assetCategories.categoryName,
        province_name: provinces.provinceName,
        district_name: districts.districtName,
        facility_name: facilities.facilityName,
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .leftJoin(provinces, eq(assets.provinceId, provinces.id))
      .leftJoin(districts, eq(assets.districtId, districts.id))
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .where(and(...conditions))
      .orderBy(assets.assetTag)
      .limit(10000);

    res.json({ success: true, message: "Report generated", data: rows, total: rows.length });
  } catch (err) {
    req.log.error({ err }, "Reports assets error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/v1/reports/summary", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const scopedProvinceId = req.user?.scopedProvinceId || (req.query.province_id as string) || undefined;

    const provinceConditions = scopedProvinceId
      ? and(eq(provinces.active, true), eq(provinces.id, scopedProvinceId))
      : eq(provinces.active, true);

    const summary = await db
      .select({
        province_name: provinces.provinceName,
        flag_url: provinces.flagUrl,
        total_assets: sql<number>`count(${assets.id})::int`,
        active_assets: sql<number>`sum(case when ${assets.status} = 'active' then 1 else 0 end)::int`,
        missing_assets: sql<number>`sum(case when ${assets.status} = 'missing' then 1 else 0 end)::int`,
        total_value: sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
      })
      .from(provinces)
      .leftJoin(assets, and(eq(assets.provinceId, provinces.id), isNull(assets.deletedAt)))
      .where(provinceConditions)
      .groupBy(provinces.id, provinces.provinceName, provinces.flagUrl)
      .orderBy(provinces.provinceName);

    res.json({ success: true, message: "Report summary retrieved", data: summary });
  } catch (err) {
    req.log.error({ err }, "Reports summary error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
