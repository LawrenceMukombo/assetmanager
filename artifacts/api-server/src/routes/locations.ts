import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, provinces, districts, facilities } from "@workspace/db";
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
    } else {
      const conditions = [eq(provinces.active, true)];
      if (user.provinceId) {
        conditions.push(eq(provinces.id, user.provinceId));
      }
      const rows = await db
        .select()
        .from(provinces)
        .where(and(...conditions))
        .orderBy(provinces.provinceName);
      res.json({ success: true, message: "Provinces retrieved", data: rows });
    }
  } catch (err) {
    req.log.error({ err }, "Get provinces error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/v1/locations/provinces/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const provinceId = req.params.id as string;

    if (user.scopeLevel !== "national" && user.provinceId && user.provinceId !== provinceId) {
      res.status(403).json({ success: false, message: "Access denied: outside your geographic scope" });
      return;
    }

    const [row] = await db
      .select()
      .from(provinces)
      .where(eq(provinces.id, provinceId))
      .limit(1);
    if (!row) {
      res.status(404).json({ success: false, message: "Province not found" });
      return;
    }
    res.json({ success: true, message: "Province retrieved", data: row });
  } catch (err) {
    req.log.error({ err }, "Get province error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/v1/locations/provinces/:id/districts", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const provinceId = req.params.id as string;

    if (user.scopeLevel !== "national" && user.provinceId && user.provinceId !== provinceId) {
      res.status(403).json({ success: false, message: "Access denied: outside your geographic scope" });
      return;
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
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/v1/locations/districts/:id/facilities", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const districtId = req.params.id as string;

    if (user.scopeLevel !== "national" && user.districtId && user.districtId !== districtId) {
      res.status(403).json({ success: false, message: "Access denied: outside your district scope" });
      return;
    }

    if (user.scopeLevel !== "national" && user.provinceId) {
      const [districtRow] = await db
        .select({ provinceId: districts.provinceId })
        .from(districts)
        .where(eq(districts.id, districtId))
        .limit(1);
      if (districtRow && districtRow.provinceId !== user.provinceId) {
        res.status(403).json({ success: false, message: "Access denied: outside your geographic scope" });
        return;
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
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/v1/locations/facilities/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const facilityId = req.params.id as string;

    if (user.scopeLevel !== "national" && user.facilityId && user.facilityId !== facilityId) {
      res.status(403).json({ success: false, message: "Access denied: outside your facility scope" });
      return;
    }

    const [row] = await db
      .select()
      .from(facilities)
      .where(eq(facilities.id, facilityId))
      .limit(1);

    if (!row) {
      res.status(404).json({ success: false, message: "Facility not found" });
      return;
    }

    if (user.scopeLevel !== "national" && user.provinceId) {
      const [districtRow] = await db
        .select({ provinceId: districts.provinceId })
        .from(districts)
        .where(eq(districts.id, row.districtId))
        .limit(1);
      if (districtRow && districtRow.provinceId !== user.provinceId) {
        res.status(403).json({ success: false, message: "Access denied: outside your geographic scope" });
        return;
      }
    }

    res.json({ success: true, message: "Facility retrieved", data: row });
  } catch (err) {
    req.log.error({ err }, "Get facility error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
