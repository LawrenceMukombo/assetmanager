import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, provinces, districts, facilities } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/v1/locations/provinces", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(provinces)
      .where(eq(provinces.active, true))
      .orderBy(provinces.provinceName);
    res.json({ success: true, message: "Provinces retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get provinces error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/v1/locations/provinces/:id", requireAuth, async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(provinces)
      .where(eq(provinces.id, req.params.id))
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
    const rows = await db
      .select()
      .from(districts)
      .where(eq(districts.provinceId, req.params.id))
      .orderBy(districts.districtName);
    res.json({ success: true, message: "Districts retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get districts error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/v1/locations/districts/:id/facilities", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(facilities)
      .where(eq(facilities.districtId, req.params.id))
      .orderBy(facilities.facilityName);
    res.json({ success: true, message: "Facilities retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get facilities error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/v1/locations/facilities/:id", requireAuth, async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(facilities)
      .where(eq(facilities.id, req.params.id))
      .limit(1);
    if (!row) {
      res.status(404).json({ success: false, message: "Facility not found" });
      return;
    }
    res.json({ success: true, message: "Facility retrieved", data: row });
  } catch (err) {
    req.log.error({ err }, "Get facility error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
