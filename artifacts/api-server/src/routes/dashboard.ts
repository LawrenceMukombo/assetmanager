import { Router } from "express";
import { eq, and, isNull, sql, desc, inArray } from "drizzle-orm";
import { db, assets, assetCategories, provinces, districts, facilities, agencies } from "@workspace/db";
import { requireAuth, requireNational } from "../lib/auth";

const router = Router();

const VALID_STATUSES   = ["active", "missing", "under_maintenance", "disposed"] as const;
const VALID_CONDITIONS = ["new", "good", "fair", "poor", "unserviceable"] as const;

// ─── PROVINCIAL DASHBOARD (supports cross-filter params) ─────────────────────

router.get("/v1/dashboard/provincial", requireAuth, async (req, res) => {
  if (!req.user) return;

  const isAgencyScoped = req.user.scopeLevel === "agency" || !!req.user.agencyId;
  const agencyId = isAgencyScoped ? req.user.agencyId : null;

  const provinceId = isAgencyScoped
    ? null
    : (req.user.scopeLevel === "national"
        ? (req.query.province_id as string | undefined) ?? null
        : req.user.provinceId);

  if (!isAgencyScoped && !provinceId) {
    res.status(400).json({ success: false, message: "province_id required for national users", data: null });
    return;
  }

  // Cross-filter params
  const statusFilter    = (req.query.status as string | undefined)?.toLowerCase() || undefined;
  const conditionFilter = (req.query.condition as string | undefined)?.toLowerCase() || undefined;
  const categoryName    = (req.query.category_name as string | undefined) || undefined;
  const districtId      = (req.query.district_id as string | undefined) || undefined;
  const facilityId      = (req.query.facility_id as string | undefined) || undefined;

  const safeStatus    = (statusFilter    && VALID_STATUSES.includes(statusFilter as typeof VALID_STATUSES[number])    ? statusFilter    : undefined) as "active" | "missing" | "under_maintenance" | "disposed" | undefined;
  const safeCondition = (conditionFilter && VALID_CONDITIONS.includes(conditionFilter as typeof VALID_CONDITIONS[number]) ? conditionFilter : undefined) as "excellent" | "good" | "fair" | "poor" | undefined;

  try {
    const baseConditions = [
      isNull(assets.deletedAt),
      isAgencyScoped ? eq(assets.agencyId, agencyId!) : eq(assets.provinceId, provinceId!),
    ];

    // Optional district/facility scope on baseConditions
    if (districtId) baseConditions.push(eq(assets.districtId, districtId));
    if (facilityId) baseConditions.push(eq(assets.facilityId, facilityId));

    // Resolve category_id from name (for cross-filter)
    let categoryId: string | undefined;
    if (categoryName) {
      const [cat] = await db.select({ id: assetCategories.id })
        .from(assetCategories)
        .where(eq(assetCategories.categoryName, categoryName))
        .limit(1);
      categoryId = cat?.id;
    }

    // Build cross-filter extra conditions (applied to filtered charts)
    const filterConditions = [...baseConditions];
    if (safeStatus)    filterConditions.push(eq(assets.status, safeStatus));
    if (safeCondition) filterConditions.push(eq(assets.condition, safeCondition));
    if (categoryId)    filterConditions.push(eq(assets.categoryId, categoryId));

    const baseWhere     = and(...baseConditions);
    const filteredWhere = and(...filterConditions);
    const hasFilters    = filterConditions.length > baseConditions.length;

    // Totals — always unfiltered for the KPI cards (but scoped to province/district/facility)
    const [totals] = await db.select({
      total_assets:       sql<number>`count(*)::int`,
      active_assets:      sql<number>`sum(case when ${assets.status} = 'active' then 1 else 0 end)::int`,
      missing_assets:     sql<number>`sum(case when ${assets.status} = 'missing' then 1 else 0 end)::int`,
      disposed_assets:    sql<number>`sum(case when ${assets.status} = 'disposed' then 1 else 0 end)::int`,
      maintenance_assets: sql<number>`sum(case when ${assets.status} = 'under_maintenance' then 1 else 0 end)::int`,
      total_value:        sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets).where(baseWhere);

    // Filtered totals (for cross-filter summary bar)
    const [filteredTotals] = await db.select({
      total_assets: sql<number>`count(*)::int`,
      total_value:  sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets).where(filteredWhere);

    // By Status — filter by condition/category but NOT status itself
    const statusConditions = [...baseConditions];
    if (safeCondition) statusConditions.push(eq(assets.condition, safeCondition));
    if (categoryId)    statusConditions.push(eq(assets.categoryId, categoryId));

    const byStatus = await db.select({
      status: assets.status,
      count:  sql<number>`count(*)::int`,
      value:  sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets).where(and(...statusConditions)).groupBy(assets.status).orderBy(desc(sql`count(*)`));

    // By Condition — filter by status/category but NOT condition itself
    const conditionConditions = [...baseConditions];
    if (safeStatus)  conditionConditions.push(eq(assets.status, safeStatus));
    if (categoryId)  conditionConditions.push(eq(assets.categoryId, categoryId));

    const byCondition = await db.select({
      condition: assets.condition,
      count:     sql<number>`count(*)::int`,
      value:     sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets).where(and(...conditionConditions)).groupBy(assets.condition).orderBy(assets.condition);

    // By Category — filter by status/condition but NOT category itself
    const categoryConditions = [...baseConditions];
    if (safeStatus)    categoryConditions.push(eq(assets.status, safeStatus));
    if (safeCondition) categoryConditions.push(eq(assets.condition, safeCondition));

    const byCategory = await db.select({
      category_id:   assetCategories.id,
      category_name: assetCategories.categoryName,
      count:         sql<number>`count(*)::int`,
      value:         sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .where(and(...categoryConditions))
      .groupBy(assetCategories.id, assetCategories.categoryName)
      .orderBy(desc(sql`count(*)`))
      .limit(12);

    // By District — only meaningful for province scope (agencies don't roll up by district)
    const byDistrict = !isAgencyScoped && provinceId
      ? await db.select({
          district_id:    districts.id,
          district_name:  districts.districtName,
          total_assets:   sql<number>`count(${assets.id})::int`,
          missing_assets: sql<number>`sum(case when ${assets.status} = 'missing' then 1 else 0 end)::int`,
          active_assets:  sql<number>`sum(case when ${assets.status} = 'active' then 1 else 0 end)::int`,
          total_value:    sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
        }).from(districts)
          .leftJoin(assets, and(
            eq(assets.districtId, districts.id),
            isNull(assets.deletedAt),
            ...(safeStatus    ? [eq(assets.status, safeStatus)]      : []),
            ...(safeCondition ? [eq(assets.condition, safeCondition)]: []),
            ...(categoryId    ? [eq(assets.categoryId, categoryId)]  : []),
            ...(facilityId    ? [eq(assets.facilityId, facilityId)]  : []),
          ))
          .where(eq(districts.provinceId, provinceId))
          .groupBy(districts.id, districts.districtName)
          .orderBy(desc(sql`count(${assets.id})`))
      : [];

    // Acquisition trend (scoped, always unfiltered by cross-filters)
    const acquisitionTrend = await db.select({
      month:       sql<string>`to_char(date_trunc('month', ${assets.createdAt}), 'Mon YYYY')`,
      month_key:   sql<string>`to_char(date_trunc('month', ${assets.createdAt}), 'YYYY-MM')`,
      count:       sql<number>`count(*)::int`,
      total_value: sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets)
      .where(and(baseWhere, sql`${assets.createdAt} >= now() - interval '12 months'`))
      .groupBy(sql`date_trunc('month', ${assets.createdAt})`)
      .orderBy(sql`date_trunc('month', ${assets.createdAt})`);

    // Recent assets (filtered)
    const recentAssets = await db.select({
      id:           assets.id,
      assetTag:     assets.assetTag,
      assetName:    assets.assetName,
      status:       assets.status,
      condition:    assets.condition,
      purchaseCost: assets.purchaseCost,
      createdAt:    assets.createdAt,
      categoryName: assetCategories.categoryName,
      facilityName: facilities.facilityName,
      districtName: districts.districtName,
    }).from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .leftJoin(districts, eq(assets.districtId, districts.id))
      .where(filteredWhere)
      .orderBy(desc(assets.createdAt))
      .limit(10);

    const province = !isAgencyScoped
      ? (await db.select({
          id:               provinces.id,
          provinceName:     provinces.provinceName,
          flagUrl:          provinces.flagUrl,
          themeAccentColor: provinces.themeAccentColor,
          flagColors:       provinces.flagColors,
          capitalCity:      provinces.capitalCity,
          region:           provinces.region,
          population:       provinces.population,
          areaKm2:          provinces.areaKm2,
        }).from(provinces).where(eq(provinces.id, provinceId!)).limit(1))[0]
      : undefined;

    const agency = isAgencyScoped && agencyId
      ? (await db.select({
          id:               agencies.id,
          agencyName:       agencies.agencyName,
          agencyCode:       agencies.agencyCode,
          agencyType:       agencies.agencyType,
          logoUrl:          agencies.logoUrl,
          themeAccentColor: agencies.themeAccentColor,
          flagColors:       agencies.flagColors,
        }).from(agencies).where(eq(agencies.id, agencyId)).limit(1))[0]
      : undefined;

    res.json({
      success: true,
      message: isAgencyScoped ? "Agency dashboard retrieved" : "Provincial dashboard retrieved",
      data: {
        province,
        agency,
        total_assets:       totals.total_assets       ?? 0,
        active_assets:      totals.active_assets      ?? 0,
        missing_assets:     totals.missing_assets     ?? 0,
        disposed_assets:    totals.disposed_assets    ?? 0,
        maintenance_assets: totals.maintenance_assets ?? 0,
        total_value:        totals.total_value        ?? "0",
        filtered_total:     filteredTotals.total_assets ?? 0,
        filtered_value:     filteredTotals.total_value  ?? "0",
        has_filters:        hasFilters,
        assets_by_category: byCategory,
        assets_by_condition: byCondition,
        assets_by_status:   byStatus,
        assets_by_district: byDistrict,
        acquisition_trend:  acquisitionTrend,
        recent_assets:      recentAssets,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Provincial dashboard error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// ─── NATIONAL DASHBOARD (supports cross-filter params + location scope) ──────

router.get("/v1/dashboard/national", requireNational, async (req, res) => {
  const statusFilter    = (req.query.status as string | undefined)?.toLowerCase() || undefined;
  const conditionFilter = (req.query.condition as string | undefined)?.toLowerCase() || undefined;
  const categoryName    = (req.query.category_name as string | undefined) || undefined;
  const provinceIdParam = (req.query.province_id as string | undefined) || undefined;
  const districtIdParam = (req.query.district_id as string | undefined) || undefined;
  const facilityIdParam = (req.query.facility_id as string | undefined) || undefined;
  const regionParam     = (req.query.region as string | undefined) || undefined;

  const safeStatus    = (statusFilter    && VALID_STATUSES.includes(statusFilter as typeof VALID_STATUSES[number])    ? statusFilter    : undefined) as "active" | "missing" | "under_maintenance" | "disposed" | undefined;
  const safeCondition = (conditionFilter && VALID_CONDITIONS.includes(conditionFilter as typeof VALID_CONDITIONS[number]) ? conditionFilter : undefined) as "excellent" | "good" | "fair" | "poor" | undefined;

  try {
    let categoryId: string | undefined;
    if (categoryName) {
      const [cat] = await db.select({ id: assetCategories.id })
        .from(assetCategories).where(eq(assetCategories.categoryName, categoryName)).limit(1);
      categoryId = cat?.id;
    }

    // Resolve region → list of province IDs
    let regionProvinceIds: string[] | undefined;
    if (regionParam && !provinceIdParam) {
      const regionProvinces = await db.select({ id: provinces.id })
        .from(provinces)
        .where(and(eq(provinces.region, regionParam), eq(provinces.active, true)));
      regionProvinceIds = regionProvinces.map(p => p.id);
    }

    // Base scope conditions (location scope — always applied to everything)
    const effectiveAgencyId = req.user?.scopedAgencyId || req.user?.agencyId;
    const scopeConditions: ReturnType<typeof eq>[] = [isNull(assets.deletedAt) as unknown as ReturnType<typeof eq>];
    if (effectiveAgencyId) scopeConditions.push(eq(assets.agencyId, effectiveAgencyId) as unknown as ReturnType<typeof eq>);
    if (provinceIdParam) scopeConditions.push(eq(assets.provinceId, provinceIdParam) as ReturnType<typeof eq>);
    else if (regionProvinceIds && regionProvinceIds.length > 0) scopeConditions.push(inArray(assets.provinceId, regionProvinceIds) as unknown as ReturnType<typeof eq>);
    if (districtIdParam) scopeConditions.push(eq(assets.districtId, districtIdParam) as ReturnType<typeof eq>);
    if (facilityIdParam) scopeConditions.push(eq(assets.facilityId, facilityIdParam) as ReturnType<typeof eq>);

    const baseWhere = and(...scopeConditions);

    const hasLocationScope = !!(provinceIdParam || districtIdParam || facilityIdParam || regionParam);

    // Unfiltered KPI totals (scoped by location)
    const [totals] = await db.select({
      total_assets:   sql<number>`count(*)::int`,
      active_assets:  sql<number>`sum(case when ${assets.status} = 'active' then 1 else 0 end)::int`,
      missing_assets: sql<number>`sum(case when ${assets.status} = 'missing' then 1 else 0 end)::int`,
      total_value:    sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets).where(baseWhere);

    const [provinceCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(provinces).where(eq(provinces.active, true));

    // Province breakdown — location-scoped, filtered by cross-filter params
    const byProvinceWhere = and(
      eq(provinces.active, true),
      ...(provinceIdParam ? [eq(provinces.id, provinceIdParam)] : []),
      ...(regionParam && !provinceIdParam && regionProvinceIds && regionProvinceIds.length > 0
        ? [inArray(provinces.id, regionProvinceIds)]
        : []),
    );

    const byProvince = await db.select({
      province_id:        provinces.id,
      province_name:      provinces.provinceName,
      province_code:      provinces.provinceCode,
      flag_url:           provinces.flagUrl,
      theme_accent_color: provinces.themeAccentColor,
      total_assets:       sql<number>`count(${assets.id})::int`,
      total_value:        sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
      missing_assets:     sql<number>`sum(case when ${assets.status} = 'missing' then 1 else 0 end)::int`,
      active_assets:      sql<number>`sum(case when ${assets.status} = 'active' then 1 else 0 end)::int`,
    }).from(provinces)
      .leftJoin(assets, and(
        eq(assets.provinceId, provinces.id),
        isNull(assets.deletedAt),
        ...(safeStatus    ? [eq(assets.status, safeStatus)]      : []),
        ...(safeCondition ? [eq(assets.condition, safeCondition)]: []),
        ...(categoryId    ? [eq(assets.categoryId, categoryId)]  : []),
        ...(districtIdParam ? [eq(assets.districtId, districtIdParam)] : []),
        ...(facilityIdParam ? [eq(assets.facilityId, facilityIdParam)] : []),
      ))
      .where(byProvinceWhere)
      .groupBy(provinces.id, provinces.provinceName, provinces.provinceCode, provinces.flagUrl, provinces.themeAccentColor)
      .orderBy(desc(sql`count(${assets.id})`));

    // Status breakdown — scoped, filtered by condition/category but NOT status
    const statusConditions = [...scopeConditions];
    if (safeCondition) statusConditions.push(eq(assets.condition, safeCondition) as ReturnType<typeof eq>);
    if (categoryId)    statusConditions.push(eq(assets.categoryId, categoryId) as ReturnType<typeof eq>);

    const byStatus = await db.select({
      status: assets.status,
      count:  sql<number>`count(*)::int`,
      value:  sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets).where(and(...statusConditions)).groupBy(assets.status).orderBy(desc(sql`count(*)`));

    // Condition breakdown — scoped, filtered by status/category but NOT condition
    const conditionConditions = [...scopeConditions];
    if (safeStatus)  conditionConditions.push(eq(assets.status, safeStatus) as ReturnType<typeof eq>);
    if (categoryId)  conditionConditions.push(eq(assets.categoryId, categoryId) as ReturnType<typeof eq>);

    const byCondition = await db.select({
      condition: assets.condition,
      count:     sql<number>`count(*)::int`,
      value:     sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets).where(and(...conditionConditions)).groupBy(assets.condition).orderBy(assets.condition);

    // Category breakdown — scoped, filtered by status/condition but NOT category
    const categoryConditions = [...scopeConditions];
    if (safeStatus)    categoryConditions.push(eq(assets.status, safeStatus) as ReturnType<typeof eq>);
    if (safeCondition) categoryConditions.push(eq(assets.condition, safeCondition) as ReturnType<typeof eq>);

    const topCategories = await db.select({
      category_id:   assetCategories.id,
      category_name: assetCategories.categoryName,
      count:         sql<number>`count(*)::int`,
      total_value:   sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .where(and(...categoryConditions))
      .groupBy(assetCategories.id, assetCategories.categoryName)
      .orderBy(desc(sql`count(*)`))
      .limit(8);

    // Acquisition trend (location-scoped, always unfiltered by cross-filters)
    const acquisitionTrend = await db.select({
      month:       sql<string>`to_char(date_trunc('month', ${assets.createdAt}), 'Mon YYYY')`,
      month_key:   sql<string>`to_char(date_trunc('month', ${assets.createdAt}), 'YYYY-MM')`,
      count:       sql<number>`count(*)::int`,
      total_value: sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets)
      .where(and(baseWhere, sql`${assets.createdAt} >= now() - interval '12 months'`))
      .groupBy(sql`date_trunc('month', ${assets.createdAt})`)
      .orderBy(sql`date_trunc('month', ${assets.createdAt})`);

    const hasFilters = !!(safeStatus || safeCondition || categoryId || hasLocationScope);

    // Filtered global totals
    const filterConds = [...scopeConditions];
    if (safeStatus)    filterConds.push(eq(assets.status, safeStatus) as ReturnType<typeof eq>);
    if (safeCondition) filterConds.push(eq(assets.condition, safeCondition) as ReturnType<typeof eq>);
    if (categoryId)    filterConds.push(eq(assets.categoryId, categoryId) as ReturnType<typeof eq>);

    const [filteredTotals] = await db.select({
      total_assets: sql<number>`count(*)::int`,
      total_value:  sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
    }).from(assets).where(and(...filterConds));

    res.json({
      success: true,
      message: "National dashboard retrieved",
      data: {
        total_assets:       totals.total_assets   ?? 0,
        active_assets:      totals.active_assets  ?? 0,
        missing_assets:     totals.missing_assets ?? 0,
        total_value:        totals.total_value    ?? "0",
        provinces_count:    provinceCount.count   ?? 0,
        filtered_total:     filteredTotals.total_assets ?? 0,
        filtered_value:     filteredTotals.total_value  ?? "0",
        has_filters:        hasFilters,
        assets_by_province: byProvince,
        top_categories:     topCategories,
        assets_by_condition: byCondition,
        assets_by_status:   byStatus,
        acquisition_trend:  acquisitionTrend,
      },
    });
  } catch (err) {
    req.log.error({ err }, "National dashboard error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
