import { Router } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, assets, assetCategories, provinces, districts, facilities, users } from "@workspace/db";

const router = Router();

router.get("/v1/public/assets/:id", async (req, res) => {
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
        warrantyExpiry: assets.warrantyExpiry,
        photoUrl: assets.photoUrl,
        notes: assets.notes,
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
        },
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .leftJoin(provinces, eq(assets.provinceId, provinces.id))
      .leftJoin(districts, eq(assets.districtId, districts.id))
      .leftJoin(facilities, eq(assets.facilityId, facilities.id))
      .leftJoin(users, eq(assets.assignedToUser, users.id))
      .where(and(eq(assets.id, req.params.id as string), isNull(assets.deletedAt)))
      .limit(1);

    if (!row) {
      res.status(404).json({ success: false, message: "Asset not found", data: null });
      return;
    }

    res.json({ success: true, message: "Asset retrieved", data: row });
  } catch (err) {
    console.error("Public asset fetch error:", err);
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
