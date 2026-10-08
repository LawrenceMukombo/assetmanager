import { Router } from "express";
import { eq, and, isNull, ilike, or, sql, desc, lte, gte } from "drizzle-orm";
import {
  db,
  assets,
  assetCategories,
  provinces,
  districts,
  facilities,
  agencies,
  stockItems,
  stockBalances,
  purchaseRequests,
} from "@workspace/db";
import { requireAuth, enforceScopeFilter } from "../lib/auth";

const router = Router();

// Build the standard scope filter array used by every report endpoint. Honours
// agency scope first (PNGICA users only see their own assets), falling back to
// geographic scope for province/district/facility users.
function reportAssetScope(req: Express.Request) {
  const conditions = [isNull(assets.deletedAt)];
  const agencyId = req.user?.scopedAgencyId || req.user?.agencyId;
  if (agencyId) {
    conditions.push(eq(assets.agencyId, agencyId));
    return conditions;
  }
  if (req.user?.scopedProvinceId) conditions.push(eq(assets.provinceId, req.user.scopedProvinceId));
  if (req.user?.scopedDistrictId) conditions.push(eq(assets.districtId, req.user.scopedDistrictId));
  if (req.user?.scopedFacilityId) conditions.push(eq(assets.facilityId, req.user.scopedFacilityId));
  return conditions;
}

function reportStockScope(req: Express.Request) {
  const conditions = [isNull(stockItems.deletedAt)];
  const agencyId = req.user?.scopedAgencyId || req.user?.agencyId;
  if (agencyId) {
    conditions.push(eq(stockItems.agencyId, agencyId));
  }
  if (req.user?.scopedProvinceId) {
    conditions.push(eq(stockItems.provinceId, req.user.scopedProvinceId));
  }
  if (req.user?.scopedDistrictId) {
    conditions.push(
      sql`${stockBalances.facilityId} in (select ${facilities.id} from ${facilities} where ${facilities.districtId} = ${req.user.scopedDistrictId})`,
    );
  }
  if (req.user?.scopedFacilityId) {
    conditions.push(eq(stockBalances.facilityId, req.user.scopedFacilityId));
  }
  return conditions;
}

function reportPurchaseRequestScope(req: Express.Request) {
  const conditions = [];
  const agencyId = req.user?.scopedAgencyId || req.user?.agencyId;
  if (agencyId) conditions.push(eq(purchaseRequests.agencyId, agencyId));
  if (req.user?.scopedProvinceId) conditions.push(eq(purchaseRequests.provinceId, req.user.scopedProvinceId));
  if (req.user?.scopedDistrictId) {
    conditions.push(
      sql`${purchaseRequests.facilityId} in (select ${facilities.id} from ${facilities} where ${facilities.districtId} = ${req.user.scopedDistrictId})`,
    );
  }
  if (req.user?.scopedFacilityId) conditions.push(eq(purchaseRequests.facilityId, req.user.scopedFacilityId));
  return conditions;
}

router.get("/v1/reports/assets", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const { province_id, district_id, facility_id, category_id, status, condition, search } = req.query as Record<string, string>;

    const conditions = reportAssetScope(req);
    // Caller-supplied refinements only apply when the caller is national or in
    // matching geographic scope (enforceScopeFilter already validated).
    if (province_id && !req.user?.scopedAgencyId) conditions.push(eq(assets.provinceId, province_id));
    if (district_id && !req.user?.scopedAgencyId) conditions.push(eq(assets.districtId, district_id));
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
        agency_name: agencies.agencyName,
        province_name: provinces.provinceName,
        district_name: districts.districtName,
        facility_name: facilities.facilityName,
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .leftJoin(agencies, eq(assets.agencyId, agencies.id))
      .leftJoin(provinces, eq(assets.provinceId, provinces.id))
      .leftJoin(districts, eq(assets.districtId, districts.id))
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .where(and(...conditions))
      .orderBy(assets.assetTag)
      .limit(10000);

    res.json({ success: true, message: "Report generated", data: { items: rows, total: rows.length } });
  } catch (err) {
    req.log.error({ err }, "Reports assets error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/reports/summary", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const user = req.user!;

    // Agency-scoped users get a per-facility roll-up of their own assets,
    // since they have no province scope. Geographic / national users get the
    // existing per-province roll-up.
    if (user.scopedAgencyId) {
      const rows = await db
        .select({
          province_name: facilities.facilityName,
          flag_url: sql<string | null>`null::text`,
          total_assets: sql<number>`count(${assets.id})::int`,
          active_assets: sql<number>`sum(case when ${assets.status} = 'active' then 1 else 0 end)::int`,
          missing_assets: sql<number>`sum(case when ${assets.status} = 'missing' then 1 else 0 end)::int`,
          total_value: sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
        })
        .from(assets)
        .leftJoin(facilities, eq(assets.facilityId, facilities.id))
        .where(and(eq(assets.agencyId, user.scopedAgencyId), isNull(assets.deletedAt)))
        .groupBy(facilities.facilityName)
        .orderBy(facilities.facilityName);
      res.json({ success: true, message: "Report summary retrieved", data: rows });
      return;
    }

    const scopedProvinceId = user.scopedProvinceId;
    const scopedDistrictId = user.scopedDistrictId;
    const scopedFacilityId = user.scopedFacilityId;

    const provinceConditions = scopedProvinceId
      ? and(eq(provinces.active, true), eq(provinces.id, scopedProvinceId))
      : eq(provinces.active, true);

    const assetJoinConditions = [eq(assets.provinceId, provinces.id), isNull(assets.deletedAt)];
    if (scopedDistrictId) assetJoinConditions.push(eq(assets.districtId, scopedDistrictId));
    if (scopedFacilityId) assetJoinConditions.push(eq(assets.facilityId, scopedFacilityId));

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
      .leftJoin(assets, and(...assetJoinConditions))
      .where(provinceConditions)
      .groupBy(provinces.id, provinces.provinceName, provinces.flagUrl)
      .orderBy(provinces.provinceName);

    res.json({ success: true, message: "Report summary retrieved", data: summary });
  } catch (err) {
    req.log.error({ err }, "Reports summary error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// ── Asset condition summary ────────────────────────────────────────────────
router.get("/v1/reports/condition-summary", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const conditions = reportAssetScope(req);
    const rows = await db
      .select({
        condition: assets.condition,
        status: assets.status,
        count: sql<number>`count(${assets.id})::int`,
        total_value: sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
      })
      .from(assets)
      .where(and(...conditions))
      .groupBy(assets.condition, assets.status)
      .orderBy(assets.condition, assets.status);
    res.json({ success: true, message: "Condition summary generated", data: { items: rows, total: rows.length } });
  } catch (err) {
    req.log.error({ err }, "Reports condition-summary error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// ── Depreciation report (straight-line) ────────────────────────────────────
router.get("/v1/reports/depreciation", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const conditions = reportAssetScope(req);
    const rows = await db
      .select({
        asset_tag: assets.assetTag,
        asset_name: assets.assetName,
        category_name: assetCategories.categoryName,
        facility_name: facilities.facilityName,
        purchase_date: assets.purchaseDate,
        purchase_cost: assets.purchaseCost,
        salvage_value: assets.salvageValue,
        useful_life_years: assets.usefulLifeYears,
        depreciation_method: assets.depreciationMethod,
        // years_in_service computed in SQL so we can sort/aggregate later if needed
        years_in_service: sql<string>`coalesce(extract(year from age(now(), ${assets.purchaseDate}::date))::numeric, 0)::text`,
        annual_depreciation: sql<string>`(case
          when ${assets.depreciationMethod} = 'straight_line'
            and ${assets.usefulLifeYears} > 0
            and ${assets.purchaseCost} is not null
          then ((coalesce(${assets.purchaseCost}::numeric, 0) - coalesce(${assets.salvageValue}::numeric, 0)) / ${assets.usefulLifeYears})
          else 0
        end)::text`,
        accumulated_depreciation: sql<string>`(case
          when ${assets.depreciationMethod} = 'straight_line'
            and ${assets.usefulLifeYears} > 0
            and ${assets.purchaseCost} is not null
          then least(
            coalesce(${assets.purchaseCost}::numeric, 0) - coalesce(${assets.salvageValue}::numeric, 0),
            ((coalesce(${assets.purchaseCost}::numeric, 0) - coalesce(${assets.salvageValue}::numeric, 0)) / ${assets.usefulLifeYears})
              * extract(year from age(now(), ${assets.purchaseDate}::date))
          )
          else 0
        end)::text`,
        book_value: sql<string>`(case
          when ${assets.depreciationMethod} = 'straight_line'
            and ${assets.usefulLifeYears} > 0
            and ${assets.purchaseCost} is not null
          then greatest(
            coalesce(${assets.salvageValue}::numeric, 0),
            coalesce(${assets.purchaseCost}::numeric, 0) -
              ((coalesce(${assets.purchaseCost}::numeric, 0) - coalesce(${assets.salvageValue}::numeric, 0)) / ${assets.usefulLifeYears})
              * extract(year from age(now(), ${assets.purchaseDate}::date))
          )
          else coalesce(${assets.purchaseCost}::numeric, 0)
        end)::text`,
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .where(and(...conditions))
      .orderBy(assets.assetTag)
      .limit(10000);
    res.json({ success: true, message: "Depreciation report generated", data: { items: rows, total: rows.length } });
  } catch (err) {
    req.log.error({ err }, "Reports depreciation error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// ── Stock on hand by location ──────────────────────────────────────────────
router.get("/v1/reports/stock-on-hand", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const conditions = reportStockScope(req);
    const rows = await db
      .select({
        item_code: stockItems.itemCode,
        item_name: stockItems.itemName,
        category: stockItems.category,
        unit_of_measure: stockItems.unitOfMeasure,
        unit_cost: stockItems.unitCost,
        facility_name: facilities.facilityName,
        quantity: stockBalances.quantity,
        reorder_level: stockBalances.reorderLevel,
        line_value: sql<string>`(coalesce(${stockBalances.quantity}, 0) * coalesce(${stockItems.unitCost}::numeric, 0))::text`,
      })
      .from(stockItems)
      .leftJoin(stockBalances, eq(stockBalances.stockItemId, stockItems.id))
      .leftJoin(facilities, eq(stockBalances.facilityId, facilities.id))
      .where(and(...conditions))
      .orderBy(stockItems.itemCode, facilities.facilityName)
      .limit(10000);
    res.json({ success: true, message: "Stock on hand generated", data: { items: rows, total: rows.length } });
  } catch (err) {
    req.log.error({ err }, "Reports stock-on-hand error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// ── Low-stock alerts ───────────────────────────────────────────────────────
router.get("/v1/reports/low-stock", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    // Use the per-balance reorder threshold when set; otherwise fall back to
    // the agency-wide item reorder level. A location is "low" when its on-hand
    // is at or below its applicable threshold (and the threshold > 0).
    const effectiveThreshold = sql`(case when coalesce(${stockBalances.reorderLevel}, 0) > 0
      then ${stockBalances.reorderLevel}
      else coalesce(${stockItems.reorderLevel}, 0) end)`;
    const conditions = reportStockScope(req);
    conditions.push(sql`coalesce(${stockBalances.quantity}, 0) <= ${effectiveThreshold}`);
    conditions.push(sql`${effectiveThreshold} > 0`);
    const rows = await db
      .select({
        item_code: stockItems.itemCode,
        item_name: stockItems.itemName,
        category: stockItems.category,
        unit_of_measure: stockItems.unitOfMeasure,
        facility_name: facilities.facilityName,
        on_hand: stockBalances.quantity,
        reorder_level: sql<number>`(${effectiveThreshold})::int`,
        shortfall: sql<number>`((${effectiveThreshold}) - coalesce(${stockBalances.quantity}, 0))::int`,
      })
      .from(stockItems)
      .innerJoin(stockBalances, eq(stockBalances.stockItemId, stockItems.id))
      .leftJoin(facilities, eq(stockBalances.facilityId, facilities.id))
      .where(and(...conditions))
      .orderBy(desc(sql`((${effectiveThreshold}) - coalesce(${stockBalances.quantity}, 0))`))
      .limit(5000);
    res.json({ success: true, message: "Low-stock report generated", data: { items: rows, total: rows.length } });
  } catch (err) {
    req.log.error({ err }, "Reports low-stock error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// ── Purchase request status breakdown ──────────────────────────────────────
router.get("/v1/reports/purchase-requests-status", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const conds = reportPurchaseRequestScope(req);
    const where = conds.length > 0 ? and(...conds) : undefined;
    const rows = await db
      .select({
        status: purchaseRequests.status,
        count: sql<number>`count(${purchaseRequests.id})::int`,
        total_quantity: sql<number>`coalesce(sum(${purchaseRequests.quantity}), 0)::int`,
        total_value: sql<string>`coalesce(sum(coalesce(${purchaseRequests.unitCost}::numeric, 0) * ${purchaseRequests.quantity}), 0)::text`,
      })
      .from(purchaseRequests)
      .where(where)
      .groupBy(purchaseRequests.status)
      .orderBy(purchaseRequests.status);
    res.json({ success: true, message: "Purchase request status report generated", data: { items: rows, total: rows.length } });
  } catch (err) {
    req.log.error({ err }, "Reports purchase-requests-status error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// ── Maintenance / warranty due ─────────────────────────────────────────────
router.get("/v1/reports/maintenance-due", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const conditions = reportAssetScope(req);
    // assets currently under maintenance OR with a warranty expiring within
    // 90 days OR already expired in the past 30 days
    conditions.push(
      or(
        eq(assets.status, "under_maintenance"),
        and(
          sql`${assets.warrantyExpiry} is not null`,
          gte(assets.warrantyExpiry, sql`(now() - interval '30 days')::date`),
          lte(assets.warrantyExpiry, sql`(now() + interval '90 days')::date`),
        ),
      )!,
    );
    const rows = await db
      .select({
        asset_tag: assets.assetTag,
        asset_name: assets.assetName,
        category_name: assetCategories.categoryName,
        facility_name: facilities.facilityName,
        status: assets.status,
        condition: assets.condition,
        warranty_expiry: assets.warrantyExpiry,
        purchase_date: assets.purchaseDate,
        days_to_warranty_expiry: sql<number>`(case when ${assets.warrantyExpiry} is null then null
          else (extract(day from (${assets.warrantyExpiry}::timestamp - now())))::int end)`,
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .where(and(...conditions))
      .orderBy(assets.warrantyExpiry, assets.assetTag)
      .limit(5000);
    res.json({ success: true, message: "Maintenance due report generated", data: { items: rows, total: rows.length } });
  } catch (err) {
    req.log.error({ err }, "Reports maintenance-due error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// ── Assets grouped by location (facility / district / province) ────────────
router.get("/v1/reports/assets-by-location", requireAuth, enforceScopeFilter, async (req, res) => {
  try {
    const conditions = reportAssetScope(req);
    const rows = await db
      .select({
        province_name: provinces.provinceName,
        district_name: districts.districtName,
        facility_name: facilities.facilityName,
        gps_lat: facilities.gpsLatitude,
        gps_lng: facilities.gpsLongitude,
        total_assets: sql<number>`count(${assets.id})::int`,
        active_assets: sql<number>`sum(case when ${assets.status} = 'active' then 1 else 0 end)::int`,
        missing_assets: sql<number>`sum(case when ${assets.status} = 'missing' then 1 else 0 end)::int`,
        total_value: sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
      })
      .from(assets)
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .leftJoin(districts, eq(facilities.districtId, districts.id))
      .leftJoin(provinces, eq(districts.provinceId, provinces.id))
      .where(and(...conditions))
      .groupBy(provinces.provinceName, districts.districtName, facilities.facilityName, facilities.gpsLatitude, facilities.gpsLongitude)
      .orderBy(facilities.facilityName)
      .limit(5000);
    res.json({ success: true, message: "Assets by location generated", data: { items: rows, total: rows.length } });
  } catch (err) {
    req.log.error({ err }, "Reports assets-by-location error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
