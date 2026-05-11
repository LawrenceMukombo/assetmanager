import { Router } from "express";
import { eq, and, desc, sql, inArray, isNotNull } from "drizzle-orm";
import { db, provinces, districts, facilities, assets, assetTransfers, users, userScope, agencies } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { ICA_PRESENCE_NAMES } from "../lib/icaPresence";

const router = Router();

// Returns the curated facility-name allowlist for an agency, or null when no
// allowlist is defined. PNGICA is restricted to ICSA presence sites only;
// other agencies have no curated list and therefore see no facilities in the
// agency-scoped Stock & Inventory location pickers.
async function getAgencyFacilityNameAllowlist(agencyId: string | null | undefined): Promise<string[] | null> {
  if (!agencyId) return null;
  const [row] = await db.select({ code: agencies.agencyCode }).from(agencies).where(eq(agencies.id, agencyId)).limit(1);
  if (!row) return null;
  if (row.code === "PNGICA") return ICA_PRESENCE_NAMES;
  return null;
}

// ─── REGIONS ─────────────────────────────────────────────────────────────────

router.get("/v1/locations/regions", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({
        region:       provinces.region,
        province_id:  provinces.id,
        province_name: provinces.provinceName,
        province_code: provinces.provinceCode,
      })
      .from(provinces)
      .where(and(eq(provinces.active, true), isNotNull(provinces.region)))
      .orderBy(provinces.region, provinces.provinceName);

    // Group by region
    const regionMap: Record<string, { name: string; provinces: { id: string; provinceName: string; provinceCode: string }[] }> = {};
    for (const row of rows) {
      const rName = row.region!;
      if (!regionMap[rName]) regionMap[rName] = { name: rName, provinces: [] };
      regionMap[rName].provinces.push({ id: row.province_id, provinceName: row.province_name, provinceCode: row.province_code });
    }

    const regionOrder = ["Southern", "Highlands", "Momase", "Islands"];
    const data = regionOrder
      .filter(r => regionMap[r])
      .map(r => regionMap[r])
      .concat(Object.keys(regionMap).filter(r => !regionOrder.includes(r)).map(r => regionMap[r]));

    res.json({ success: true, message: "Regions retrieved", data });
  } catch (err) {
    req.log.error({ err }, "Regions error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// ─── PROVINCES ───────────────────────────────────────────────────────────────

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

router.patch("/v1/locations/provinces/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.roleName !== "Super Admin") {
      res.status(403).json({ success: false, message: "Only Super Admin can update provinces", data: null });
      return;
    }
    const provinceId = String(req.params.id);
    const {
      flagUrl, themeAccentColor, flagColors, provinceName,
      region, capitalCity, population, areaKm2, description,
    } = req.body as {
      flagUrl?: string | null;
      themeAccentColor?: string | null;
      flagColors?: string[] | null;
      provinceName?: string;
      region?: string | null;
      capitalCity?: string | null;
      population?: number | null;
      areaKm2?: string | null;
      description?: string | null;
    };

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
        ...(flagUrl !== undefined ? { flagUrl: flagUrl ?? null } : {}),
        ...(themeAccentColor !== undefined ? { themeAccentColor: themeAccentColor ?? null } : {}),
        ...(validatedColors !== undefined ? { flagColors: validatedColors } : {}),
        ...(provinceName !== undefined ? { provinceName } : {}),
        ...(region !== undefined ? { region: region ?? null } : {}),
        ...(capitalCity !== undefined ? { capitalCity: capitalCity ?? null } : {}),
        ...(population !== undefined ? { population: population ?? null } : {}),
        ...(areaKm2 !== undefined ? { areaKm2: areaKm2 ?? null } : {}),
        ...(description !== undefined ? { description: description ?? null } : {}),
        updatedAt: new Date(),
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

// ─── DISTRICTS ───────────────────────────────────────────────────────────────

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
      .select({
        id: districts.id,
        provinceId: districts.provinceId,
        districtName: districts.districtName,
        districtCode: districts.districtCode,
        population: districts.population,
        areaKm2: districts.areaKm2,
        description: districts.description,
        active: districts.active,
        facilityCount: sql<number>`count(distinct ${facilities.id})::int`,
        assetCount: sql<number>`count(distinct ${assets.id})::int`,
      })
      .from(districts)
      .leftJoin(facilities, eq(facilities.districtId, districts.id))
      .leftJoin(assets, and(eq(assets.districtId, districts.id)))
      .where(and(...conditions))
      .groupBy(districts.id)
      .orderBy(districts.districtName);

    res.json({ success: true, message: "Districts retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get districts error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/locations/districts/:id", requireAuth, async (req, res) => {
  try {
    const districtId = req.params.id as string;
    const [row] = await db
      .select({
        id: districts.id,
        provinceId: districts.provinceId,
        districtName: districts.districtName,
        districtCode: districts.districtCode,
        population: districts.population,
        areaKm2: districts.areaKm2,
        description: districts.description,
        active: districts.active,
        facilityCount: sql<number>`count(distinct ${facilities.id})::int`,
      })
      .from(districts)
      .leftJoin(facilities, eq(facilities.districtId, districts.id))
      .where(eq(districts.id, districtId))
      .groupBy(districts.id)
      .limit(1);
    if (!row) {
      res.status(404).json({ success: false, message: "District not found", data: null });
      return;
    }
    res.json({ success: true, message: "District retrieved", data: row });
  } catch (err) {
    req.log.error({ err }, "Get district error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/locations/districts", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.roleName !== "Super Admin") {
      res.status(403).json({ success: false, message: "Only Super Admin can create districts", data: null });
      return;
    }
    const { provinceId, districtName, districtCode, population, areaKm2, description } = req.body as {
      provinceId: string;
      districtName: string;
      districtCode?: string | null;
      population?: number | null;
      areaKm2?: string | null;
      description?: string | null;
    };

    if (!provinceId || !districtName) {
      res.status(400).json({ success: false, message: "provinceId and districtName are required", data: null });
      return;
    }

    const [provRow] = await db.select().from(provinces).where(eq(provinces.id, provinceId)).limit(1);
    if (!provRow) {
      res.status(404).json({ success: false, message: "Province not found", data: null });
      return;
    }

    const [row] = await db
      .insert(districts)
      .values({
        provinceId,
        districtName,
        districtCode: districtCode || null,
        population: population ?? null,
        areaKm2: areaKm2 ?? null,
        description: description ?? null,
      })
      .returning();

    res.status(201).json({ success: true, message: "District created", data: row });
  } catch (err) {
    req.log.error({ err }, "Create district error");
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
    const { districtName, districtCode, population, areaKm2, description, active } = req.body as {
      districtName?: string;
      districtCode?: string | null;
      population?: number | null;
      areaKm2?: string | null;
      description?: string | null;
      active?: boolean;
    };

    const existing = await db.select().from(districts).where(eq(districts.id, districtId)).limit(1);
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: "District not found", data: null });
      return;
    }

    const [updated] = await db
      .update(districts)
      .set({
        ...(districtName !== undefined ? { districtName } : {}),
        ...(districtCode !== undefined ? { districtCode: districtCode ?? null } : {}),
        ...(population !== undefined ? { population: population ?? null } : {}),
        ...(areaKm2 !== undefined ? { areaKm2: areaKm2 ?? null } : {}),
        ...(description !== undefined ? { description: description ?? null } : {}),
        ...(active !== undefined ? { active } : {}),
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

router.delete("/v1/locations/districts/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.roleName !== "Super Admin") {
      res.status(403).json({ success: false, message: "Only Super Admin can delete districts", data: null });
      return;
    }
    const districtId = String(req.params.id);

    const existing = await db.select().from(districts).where(eq(districts.id, districtId)).limit(1);
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: "District not found", data: null });
      return;
    }

    const linkedAssets = await db.select({ id: assets.id }).from(assets).where(eq(assets.districtId, districtId)).limit(1);
    if (linkedAssets.length > 0) {
      res.status(409).json({ success: false, message: "Cannot delete district: it has assets linked to it. Reassign them first.", data: null });
      return;
    }

    const linkedFacilities = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.districtId, districtId)).limit(1);
    if (linkedFacilities.length > 0) {
      res.status(409).json({ success: false, message: "Cannot delete district: it has facilities. Delete them first.", data: null });
      return;
    }

    await db.update(userScope).set({ districtId: null }).where(eq(userScope.districtId, districtId));
    await db.delete(districts).where(eq(districts.id, districtId));

    res.json({ success: true, message: "District deleted", data: null });
  } catch (err) {
    req.log.error({ err }, "Delete district error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// ─── FACILITIES ──────────────────────────────────────────────────────────────

router.get("/v1/locations/facilities", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const conditions = [];
    if (user.scopeLevel !== "national") {
      // Agency-scoped users with a curated presence allowlist (currently only
      // PNGICA / ICSA) are restricted to that allowlist. Other agencies fall
      // through to the existing geographic / facility scoping below so they
      // continue to see whatever they did prior to this change.
      const presenceNames =
        user.scopeLevel === "agency" || user.agencyId
          ? await getAgencyFacilityNameAllowlist(user.agencyId)
          : null;
      if (presenceNames !== null) {
        // Agency has a curated presence allowlist (currently only PNGICA).
        conditions.push(inArray(facilities.facilityName, presenceNames));
      } else if (user.facilityId) {
        conditions.push(eq(facilities.id, user.facilityId));
      } else if (user.districtId) {
        conditions.push(eq(facilities.districtId, user.districtId));
      } else {
        const allowedProvinceId = await resolveUserProvinceId(user);
        if (allowedProvinceId) {
          conditions.push(eq(districts.provinceId, allowedProvinceId));
        }
      }
    }
    const rows = await db
      .select({
        id: facilities.id,
        facilityName: facilities.facilityName,
        districtId: facilities.districtId,
        districtName: districts.districtName,
        provinceId: districts.provinceId,
      })
      .from(facilities)
      .leftJoin(districts, eq(facilities.districtId, districts.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(facilities.facilityName);
    res.json({ success: true, message: "Facilities retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get all facilities error");
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
    if (user.scopeLevel !== "national") {
      const presenceNames =
        user.scopeLevel === "agency" || user.agencyId
          ? await getAgencyFacilityNameAllowlist(user.agencyId)
          : null;
      if (presenceNames !== null) {
        conditions.push(inArray(facilities.facilityName, presenceNames));
      } else if (user.facilityId) {
        conditions.push(eq(facilities.id, user.facilityId));
      }
    }

    const rows = await db
      .select({
        id: facilities.id,
        districtId: facilities.districtId,
        facilityName: facilities.facilityName,
        facilityType: facilities.facilityType,
        address: facilities.address,
        description: facilities.description,
        contactPhone: facilities.contactPhone,
        contactEmail: facilities.contactEmail,
        capacity: facilities.capacity,
        gpsLatitude: facilities.gpsLatitude,
        gpsLongitude: facilities.gpsLongitude,
        active: facilities.active,
        assetCount: sql<number>`count(distinct ${assets.id})::int`,
      })
      .from(facilities)
      .leftJoin(assets, eq(assets.facilityId, facilities.id))
      .where(and(...conditions))
      .groupBy(facilities.id)
      .orderBy(facilities.facilityName);

    res.json({ success: true, message: "Facilities retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get facilities error");
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
    const {
      districtId, facilityName, facilityType, address,
      description, contactPhone, contactEmail, capacity,
      gpsLatitude, gpsLongitude,
    } = req.body as {
      districtId: string;
      facilityName: string;
      facilityType?: string | null;
      address?: string | null;
      description?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      capacity?: number | null;
      gpsLatitude?: string | null;
      gpsLongitude?: string | null;
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
      .values({
        districtId,
        facilityName,
        facilityType: facilityType ?? null,
        address: address ?? null,
        description: description ?? null,
        contactPhone: contactPhone ?? null,
        contactEmail: contactEmail ?? null,
        capacity: capacity ?? null,
        gpsLatitude: gpsLatitude ?? null,
        gpsLongitude: gpsLongitude ?? null,
      })
      .returning();

    res.status(201).json({ success: true, message: "Facility created", data: row });
  } catch (err) {
    req.log.error({ err }, "Create facility error");
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
    const {
      facilityName, facilityType, address, description,
      contactPhone, contactEmail, capacity, gpsLatitude, gpsLongitude, active,
    } = req.body as {
      facilityName?: string;
      facilityType?: string | null;
      address?: string | null;
      description?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      capacity?: number | null;
      gpsLatitude?: string | null;
      gpsLongitude?: string | null;
      active?: boolean;
    };

    const existing = await db.select().from(facilities).where(eq(facilities.id, facilityId)).limit(1);
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: "Facility not found", data: null });
      return;
    }

    const [updated] = await db
      .update(facilities)
      .set({
        ...(facilityName !== undefined ? { facilityName } : {}),
        ...(facilityType !== undefined ? { facilityType: facilityType ?? null } : {}),
        ...(address !== undefined ? { address: address ?? null } : {}),
        ...(description !== undefined ? { description: description ?? null } : {}),
        ...(contactPhone !== undefined ? { contactPhone: contactPhone ?? null } : {}),
        ...(contactEmail !== undefined ? { contactEmail: contactEmail ?? null } : {}),
        ...(capacity !== undefined ? { capacity: capacity ?? null } : {}),
        ...(gpsLatitude !== undefined ? { gpsLatitude: gpsLatitude ?? null } : {}),
        ...(gpsLongitude !== undefined ? { gpsLongitude: gpsLongitude ?? null } : {}),
        ...(active !== undefined ? { active } : {}),
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

// ─── HELPER ──────────────────────────────────────────────────────────────────

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
