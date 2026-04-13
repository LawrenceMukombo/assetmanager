import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, provinces, districts, facilities, assets, assetTransfers } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/v1/locations/provinces", requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    if (user.scopeLevel === "national") {
      const rows = await db
        .select()
        .from(provinces)
        .where(eq(provinces.active, true))
        .orderBy(provinces.provinceName);
      res.json({ success: true, message: "Provinces retrieved", data: rows });
      return;
    }

    if (user.provinceId) {
      const rows = await db
        .select()
        .from(provinces)
        .where(and(eq(provinces.active, true), eq(provinces.id, user.provinceId)))
        .orderBy(provinces.provinceName);
      res.json({ success: true, message: "Provinces retrieved", data: rows });
      return;
    }

    if (user.districtId) {
      const [district] = await db
        .select({ provinceId: districts.provinceId })
        .from(districts)
        .where(eq(districts.id, user.districtId))
        .limit(1);
      if (district) {
        const rows = await db
          .select()
          .from(provinces)
          .where(and(eq(provinces.active, true), eq(provinces.id, district.provinceId)))
          .orderBy(provinces.provinceName);
        res.json({ success: true, message: "Provinces retrieved", data: rows });
        return;
      }
    }

    if (user.facilityId) {
      const [facilityRow] = await db
        .select({ districtId: facilities.districtId })
        .from(facilities)
        .where(eq(facilities.id, user.facilityId))
        .limit(1);
      if (facilityRow) {
        const [district] = await db
          .select({ provinceId: districts.provinceId })
          .from(districts)
          .where(eq(districts.id, facilityRow.districtId))
          .limit(1);
        if (district) {
          const rows = await db
            .select()
            .from(provinces)
            .where(and(eq(provinces.active, true), eq(provinces.id, district.provinceId)))
            .orderBy(provinces.provinceName);
          res.json({ success: true, message: "Provinces retrieved", data: rows });
          return;
        }
      }
    }

    res.json({ success: true, message: "Provinces retrieved", data: [] });
  } catch (err) {
    req.log.error({ err }, "Get provinces error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/locations/provinces/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const provinceId = req.params.id as string;

    if (user.scopeLevel !== "national") {
      const allowedProvinceId = await resolveUserProvinceId(user);
      if (allowedProvinceId === null || allowedProvinceId !== provinceId) {
        res.status(403).json({ success: false, message: "Access denied: outside your geographic scope", data: null });
        return;
      }
    }

    const [row] = await db
      .select()
      .from(provinces)
      .where(eq(provinces.id, provinceId))
      .limit(1);
    if (!row) {
      res.status(404).json({ success: false, message: "Province not found", data: null });
      return;
    }
    res.json({ success: true, message: "Province retrieved", data: row });
  } catch (err) {
    req.log.error({ err }, "Get province error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/locations/provinces/:id/districts", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const provinceId = req.params.id as string;

    if (user.scopeLevel !== "national") {
      const allowedProvinceId = await resolveUserProvinceId(user);
      if (allowedProvinceId === null || allowedProvinceId !== provinceId) {
        res.status(403).json({ success: false, message: "Access denied: outside your geographic scope", data: null });
        return;
      }
    }

    const conditions = [eq(districts.provinceId, provinceId)];
    if (user.scopeLevel !== "national" && user.districtId) {
      conditions.push(eq(districts.id, user.districtId));
    }

    const rows = await db
      .select()
      .from(districts)
      .where(and(...conditions))
      .orderBy(districts.districtName);
    res.json({ success: true, message: "Districts retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get districts error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/locations/districts/:id/facilities", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const districtId = req.params.id as string;

    if (user.scopeLevel !== "national") {
      if (user.districtId && user.districtId !== districtId) {
        res.status(403).json({ success: false, message: "Access denied: outside your district scope", data: null });
        return;
      }

      const [districtRow] = await db
        .select({ provinceId: districts.provinceId })
        .from(districts)
        .where(eq(districts.id, districtId))
        .limit(1);

      if (districtRow) {
        const allowedProvinceId = await resolveUserProvinceId(user);
        if (allowedProvinceId !== null && districtRow.provinceId !== allowedProvinceId) {
          res.status(403).json({ success: false, message: "Access denied: outside your geographic scope", data: null });
          return;
        }
      }
    }

    const conditions = [eq(facilities.districtId, districtId)];
    if (user.scopeLevel !== "national" && user.facilityId) {
      conditions.push(eq(facilities.id, user.facilityId));
    }

    const rows = await db
      .select()
      .from(facilities)
      .where(and(...conditions))
      .orderBy(facilities.facilityName);
    res.json({ success: true, message: "Facilities retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get facilities error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/locations/provinces/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.roleName !== "Super Admin") {
      res.status(403).json({ success: false, message: "Only Super Admin can update province branding", data: null });
      return;
    }
    const provinceId = String(req.params.id);
    const { flagUrl, themeAccentColor, flagColors, provinceName } = req.body as {
      flagUrl?: string | null;
      themeAccentColor?: string | null;
      flagColors?: string[] | null;
      provinceName?: string;
    };

    if (flagUrl === undefined && themeAccentColor === undefined && provinceName === undefined && flagColors === undefined) {
      res.status(400).json({ success: false, message: "No fields to update", data: null });
      return;
    }

    const existing = await db.select().from(provinces).where(eq(provinces.id, provinceId)).limit(1);
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: "Province not found", data: null });
      return;
    }

    const validatedColors = Array.isArray(flagColors)
      ? flagColors.filter((c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 8)
      : flagColors === null ? [] : undefined;

    const [updated] = await db
      .update(provinces)
      .set({
        flagUrl: flagUrl !== undefined ? flagUrl : existing[0].flagUrl,
        themeAccentColor: themeAccentColor !== undefined ? themeAccentColor : existing[0].themeAccentColor,
        flagColors: validatedColors !== undefined ? validatedColors : (existing[0].flagColors ?? []),
        provinceName: provinceName !== undefined ? provinceName : existing[0].provinceName,
      })
      .where(eq(provinces.id, provinceId))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: "Province not found", data: null });
      return;
    }
    res.json({ success: true, message: "Province updated", data: updated });
  } catch (err) {
    req.log.error({ err }, "Update province error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/locations/facilities/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const facilityId = req.params.id as string;

    if (user.scopeLevel !== "national" && user.facilityId && user.facilityId !== facilityId) {
      res.status(403).json({ success: false, message: "Access denied: outside your facility scope", data: null });
      return;
    }

    const [row] = await db
      .select()
      .from(facilities)
      .where(eq(facilities.id, facilityId))
      .limit(1);

    if (!row) {
      res.status(404).json({ success: false, message: "Facility not found", data: null });
      return;
    }

    if (user.scopeLevel !== "national") {
      const [districtRow] = await db
        .select({ provinceId: districts.provinceId })
        .from(districts)
        .where(eq(districts.id, row.districtId))
        .limit(1);

      if (districtRow) {
        const allowedProvinceId = await resolveUserProvinceId(user);
        if (allowedProvinceId !== null && districtRow.provinceId !== allowedProvinceId) {
          res.status(403).json({ success: false, message: "Access denied: outside your geographic scope", data: null });
          return;
        }
      }

      if (user.districtId && row.districtId !== user.districtId) {
        res.status(403).json({ success: false, message: "Access denied: outside your district scope", data: null });
        return;
      }
    }

    res.json({ success: true, message: "Facility retrieved", data: row });
  } catch (err) {
    req.log.error({ err }, "Get facility error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/locations/facilities", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.roleName !== "Super Admin") {
      res.status(403).json({ success: false, message: "Only Super Admin can create facilities", data: null });
      return;
    }
    const { districtId, facilityName, facilityType, address } = req.body as {
      districtId: string;
      facilityName: string;
      facilityType?: string | null;
      address?: string | null;
    };

    if (!districtId || !facilityName) {
      res.status(400).json({ success: false, message: "districtId and facilityName are required", data: null });
      return;
    }

    const [districtRow] = await db.select().from(districts).where(eq(districts.id, districtId)).limit(1);
    if (!districtRow) {
      res.status(404).json({ success: false, message: "District not found", data: null });
      return;
    }

    const [row] = await db
      .insert(facilities)
      .values({ districtId, facilityName, facilityType: facilityType ?? null, address: address ?? null })
      .returning();

    res.status(201).json({ success: true, message: "Facility created", data: row });
  } catch (err) {
    req.log.error({ err }, "Create facility error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.delete("/v1/locations/facilities/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.roleName !== "Super Admin") {
      res.status(403).json({ success: false, message: "Only Super Admin can delete facilities", data: null });
      return;
    }
    const facilityId = String(req.params.id);

    const existing = await db.select().from(facilities).where(eq(facilities.id, facilityId)).limit(1);
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: "Facility not found", data: null });
      return;
    }

    await db.update(assets).set({ facilityId: null }).where(eq(assets.facilityId, facilityId));
    await db.update(assetTransfers).set({ fromFacilityId: null }).where(eq(assetTransfers.fromFacilityId, facilityId));
    await db.update(assetTransfers).set({ toFacilityId: null }).where(eq(assetTransfers.toFacilityId, facilityId));

    await db.delete(facilities).where(eq(facilities.id, facilityId));
    res.json({ success: true, message: "Facility deleted", data: null });
  } catch (err) {
    req.log.error({ err }, "Delete facility error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/locations/districts/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.roleName !== "Super Admin") {
      res.status(403).json({ success: false, message: "Only Super Admin can update districts", data: null });
      return;
    }
    const districtId = String(req.params.id);
    const { districtName, districtCode } = req.body as { districtName?: string; districtCode?: string | null };

    if (districtName === undefined && districtCode === undefined) {
      res.status(400).json({ success: false, message: "No fields to update", data: null });
      return;
    }

    const existing = await db.select().from(districts).where(eq(districts.id, districtId)).limit(1);
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: "District not found", data: null });
      return;
    }

    const [updated] = await db
      .update(districts)
      .set({
        districtName: districtName !== undefined ? districtName : existing[0].districtName,
        districtCode: districtCode !== undefined ? districtCode : existing[0].districtCode,
      })
      .where(eq(districts.id, districtId))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: "District not found", data: null });
      return;
    }
    res.json({ success: true, message: "District updated", data: updated });
  } catch (err) {
    req.log.error({ err }, "Patch district error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/locations/facilities/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.roleName !== "Super Admin") {
      res.status(403).json({ success: false, message: "Only Super Admin can update facilities", data: null });
      return;
    }
    const facilityId = String(req.params.id);
    const { facilityName, facilityType } = req.body as { facilityName?: string; facilityType?: string | null };

    if (facilityName === undefined && facilityType === undefined) {
      res.status(400).json({ success: false, message: "No fields to update", data: null });
      return;
    }

    const existing = await db.select().from(facilities).where(eq(facilities.id, facilityId)).limit(1);
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: "Facility not found", data: null });
      return;
    }

    const [updated] = await db
      .update(facilities)
      .set({
        facilityName: facilityName !== undefined ? facilityName : existing[0].facilityName,
        facilityType: facilityType !== undefined ? facilityType : existing[0].facilityType,
      })
      .where(eq(facilities.id, facilityId))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: "Facility not found", data: null });
      return;
    }
    res.json({ success: true, message: "Facility updated", data: updated });
  } catch (err) {
    req.log.error({ err }, "Patch facility error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

async function resolveUserProvinceId(user: { provinceId: string | null; districtId: string | null; facilityId: string | null }): Promise<string | null> {
  if (user.provinceId) return user.provinceId;

  if (user.districtId) {
    const [district] = await db
      .select({ provinceId: districts.provinceId })
      .from(districts)
      .where(eq(districts.id, user.districtId))
      .limit(1);
    return district?.provinceId ?? null;
  }

  if (user.facilityId) {
    const [facility] = await db
      .select({ districtId: facilities.districtId })
      .from(facilities)
      .where(eq(facilities.id, user.facilityId))
      .limit(1);
    if (facility) {
      const [district] = await db
        .select({ provinceId: districts.provinceId })
        .from(districts)
        .where(eq(districts.id, facility.districtId))
        .limit(1);
      return district?.provinceId ?? null;
    }
  }

  return null;
}

export default router;
