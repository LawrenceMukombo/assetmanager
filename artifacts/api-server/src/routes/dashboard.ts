import { Router } from "express";
import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { db, assets, assetCategories, provinces, districts, facilities, users } from "@workspace/db";
import { requireAuth, requireNational } from "../lib/auth";

const router = Router();

router.get("/v1/dashboard/provincial", requireAuth, async (req, res) => {
  if (!req.user) return;

  const provinceId = req.user.scopeLevel === "national"
    ? (req.query.province_id as string | undefined)
    : req.user.provinceId;

  if (!provinceId) {
    res.status(400).json({ success: false, message: "province_id required for national users" });
    return;
  }

  try {
    const baseWhere = and(isNull(assets.deletedAt), eq(assets.provinceId, provinceId));

    const [totals] = await db
      .select({
        total_assets: sql<number>`count(*)::int`,
        active_assets: sql<number>`sum(case when ${assets.status} = 'active' then 1 else 0 end)::int`,
        missing_assets: sql<number>`sum(case when ${assets.status} = 'missing' then 1 else 0 end)::int`,
        total_value: sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
      })
      .from(assets)
      .where(baseWhere);

    const byCategory = await db
      .select({
        category_name: assetCategories.categoryName,
        count: sql<number>`count(*)::int`,
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .where(baseWhere)
      .groupBy(assetCategories.categoryName)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const byCondition = await db
      .select({
        condition: assets.condition,
        count: sql<number>`count(*)::int`,
      })
      .from(assets)
      .where(baseWhere)
      .groupBy(assets.condition);

    const recentAssets = await db
      .select({
        id: assets.id,
        assetTag: assets.assetTag,
        assetName: assets.assetName,
        status: assets.status,
        condition: assets.condition,
        createdAt: assets.createdAt,
        categoryName: assetCategories.categoryName,
        facilityName: facilities.facilityName,
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .where(baseWhere)
      .orderBy(desc(assets.createdAt))
      .limit(5);

    const [province] = await db
      .select({ provinceName: provinces.provinceName, flagUrl: provinces.flagUrl, themeAccentColor: provinces.themeAccentColor })
      .from(provinces)
      .where(eq(provinces.id, provinceId))
      .limit(1);

    res.json({
      success: true,
      message: "Provincial dashboard retrieved",
      data: {
        province,
        total_assets: totals.total_assets ?? 0,
        active_assets: totals.active_assets ?? 0,
        missing_assets: totals.missing_assets ?? 0,
        total_value: totals.total_value ?? "0",
        assets_by_category: byCategory,
        assets_by_condition: byCondition,
        recent_assets: recentAssets,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Provincial dashboard error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/v1/dashboard/national", requireNational, async (req, res) => {
  try {
    const [totals] = await db
      .select({
        total_assets: sql<number>`count(*)::int`,
        total_value: sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
      })
      .from(assets)
      .where(isNull(assets.deletedAt));

    const [provinceCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(provinces)
      .where(eq(provinces.active, true));

    const byProvince = await db
      .select({
        province_id: provinces.id,
        province_name: provinces.provinceName,
        province_code: provinces.provinceCode,
        flag_url: provinces.flagUrl,
        theme_accent_color: provinces.themeAccentColor,
        total_assets: sql<number>`count(${assets.id})::int`,
        total_value: sql<string>`coalesce(sum(${assets.purchaseCost}::numeric), 0)::text`,
        missing_assets: sql<number>`sum(case when ${assets.status} = 'missing' then 1 else 0 end)::int`,
      })
      .from(provinces)
      .leftJoin(assets, and(eq(assets.provinceId, provinces.id), isNull(assets.deletedAt)))
      .where(eq(provinces.active, true))
      .groupBy(provinces.id, provinces.provinceName, provinces.provinceCode, provinces.flagUrl, provinces.themeAccentColor)
      .orderBy(desc(sql`count(${assets.id})`));

    const topCategories = await db
      .select({
        category_name: assetCategories.categoryName,
        count: sql<number>`count(*)::int`,
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .where(isNull(assets.deletedAt))
      .groupBy(assetCategories.categoryName)
      .orderBy(desc(sql`count(*)`))
      .limit(7);

    res.json({
      success: true,
      message: "National dashboard retrieved",
      data: {
        total_assets: totals.total_assets ?? 0,
        total_value: totals.total_value ?? "0",
        provinces_count: provinceCount.count ?? 0,
        assets_by_province: byProvince,
        top_categories: topCategories,
      },
    });
  } catch (err) {
    req.log.error({ err }, "National dashboard error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
