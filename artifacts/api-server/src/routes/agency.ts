import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, agencies } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/v1/agency_branding", requireAuth, async (req, res) => {
  if (!req.user) return;
  if (req.user.scopeLevel !== "agency" || !req.user.agencyId) {
    res.status(403).json({ success: false, message: "Agency scope required", data: null });
    return;
  }
  if (req.user.roleName !== "Agency Admin" && req.user.roleName !== "Super Admin") {
    res.status(403).json({ success: false, message: "Agency Admin role required", data: null });
    return;
  }
  try {
    const [ag] = await db
      .select({
        id: agencies.id,
        agencyName: agencies.agencyName,
        agencyCode: agencies.agencyCode,
        agencyType: agencies.agencyType,
        logoUrl: agencies.logoUrl,
        themeAccentColor: agencies.themeAccentColor,
        flagColors: agencies.flagColors,
      })
      .from(agencies)
      .where(eq(agencies.id, req.user.agencyId))
      .limit(1);

    if (!ag) {
      res.status(404).json({ success: false, message: "Agency not found", data: null });
      return;
    }
    res.json({ success: true, message: "Agency branding retrieved", data: ag });
  } catch (err) {
    req.log.error({ err }, "Get agency branding error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/agency_branding", requireAuth, async (req, res) => {
  if (!req.user) return;
  if (req.user.scopeLevel !== "agency" || !req.user.agencyId) {
    res.status(403).json({ success: false, message: "Agency scope required", data: null });
    return;
  }
  if (req.user.roleName !== "Agency Admin" && req.user.roleName !== "Super Admin") {
    res.status(403).json({ success: false, message: "Agency Admin role required", data: null });
    return;
  }

  const { agency_name, logo_url, theme_accent_color, flag_colors } = req.body ?? {};

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof agency_name === "string" && agency_name.trim()) updates.agencyName = agency_name.trim();
  if (logo_url !== undefined) updates.logoUrl = logo_url || null;
  if (theme_accent_color !== undefined) updates.themeAccentColor = theme_accent_color || null;
  if (Array.isArray(flag_colors)) {
    updates.flagColors = flag_colors.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
  }

  try {
    const [updated] = await db
      .update(agencies)
      .set(updates)
      .where(eq(agencies.id, req.user.agencyId))
      .returning({
        id: agencies.id,
        agencyName: agencies.agencyName,
        agencyCode: agencies.agencyCode,
        agencyType: agencies.agencyType,
        logoUrl: agencies.logoUrl,
        themeAccentColor: agencies.themeAccentColor,
        flagColors: agencies.flagColors,
      });
    res.json({ success: true, message: "Agency branding updated", data: updated });
  } catch (err) {
    req.log.error({ err }, "Update agency branding error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
