import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, organizationSettings } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

const DEFAULT_SETTINGS = {
  id: "default",
  organizationName: "Asset Manager",
  shortCode: "AM",
  organizationType: "enterprise",
  tagline: "Enterprise Asset & Inventory Management",
  systemTitle: "Asset Management System",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#0F4C81",
  accentColor: "#3B82F6",
  currencyCode: "USD",
  currencySymbol: "$",
  hierarchyPreset: "corporate",
  level1Label: "Division",
  level1Plural: "Divisions",
  level2Label: "Department",
  level2Plural: "Departments",
  level3Label: "Site / Room",
  level3Plural: "Sites / Rooms",
  active: true,
};

async function getOrInitSettings() {
  const [existing] = await db
    .select()
    .from(organizationSettings)
    .orderBy(desc(organizationSettings.updatedAt))
    .limit(1);

  if (existing) {
    return existing;
  }

  // Insert default initial row
  const [created] = await db
    .insert(organizationSettings)
    .values({
      organizationName: DEFAULT_SETTINGS.organizationName,
      shortCode: DEFAULT_SETTINGS.shortCode,
      organizationType: DEFAULT_SETTINGS.organizationType,
      tagline: DEFAULT_SETTINGS.tagline,
      systemTitle: DEFAULT_SETTINGS.systemTitle,
      logoUrl: DEFAULT_SETTINGS.logoUrl,
      faviconUrl: DEFAULT_SETTINGS.faviconUrl,
      primaryColor: DEFAULT_SETTINGS.primaryColor,
      accentColor: DEFAULT_SETTINGS.accentColor,
      currencyCode: DEFAULT_SETTINGS.currencyCode,
      currencySymbol: DEFAULT_SETTINGS.currencySymbol,
      hierarchyPreset: DEFAULT_SETTINGS.hierarchyPreset,
      level1Label: DEFAULT_SETTINGS.level1Label,
      level1Plural: DEFAULT_SETTINGS.level1Plural,
      level2Label: DEFAULT_SETTINGS.level2Label,
      level2Plural: DEFAULT_SETTINGS.level2Plural,
      level3Label: DEFAULT_SETTINGS.level3Label,
      level3Plural: DEFAULT_SETTINGS.level3Plural,
      active: true,
    })
    .returning();

  return created ?? DEFAULT_SETTINGS;
}

// Public endpoint for unauthenticated visitors (login page, favicon, theme, branding)
router.get("/v1/public/organization", async (req, res) => {
  try {
    const settings = await getOrInitSettings();
    res.json({
      success: true,
      message: "Public organization settings retrieved",
      data: {
        organizationName: settings.organizationName,
        shortCode: settings.shortCode,
        organizationType: settings.organizationType,
        tagline: settings.tagline,
        systemTitle: settings.systemTitle,
        logoUrl: settings.logoUrl,
        faviconUrl: settings.faviconUrl,
        primaryColor: settings.primaryColor,
        accentColor: settings.accentColor,
        currencyCode: settings.currencyCode,
        currencySymbol: settings.currencySymbol,
        hierarchyPreset: settings.hierarchyPreset,
        level1Label: settings.level1Label,
        level1Plural: settings.level1Plural,
        level2Label: settings.level2Label,
        level2Plural: settings.level2Plural,
        level3Label: settings.level3Label,
        level3Plural: settings.level3Plural,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Get public organization settings error");
    res.status(500).json({ success: false, message: "Internal server error", data: DEFAULT_SETTINGS });
  }
});

// Authenticated endpoint for full organization profile
router.get("/v1/organization", requireAuth, async (req, res) => {
  try {
    const settings = await getOrInitSettings();
    res.json({
      success: true,
      message: "Organization settings retrieved",
      data: settings,
    });
  } catch (err) {
    req.log.error({ err }, "Get organization settings error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// Update organization profile & hierarchy configuration
router.patch("/v1/organization", requireAuth, async (req, res) => {
  if (!req.user) return;
  const allowedRoles = ["Super Admin", "Agency Admin", "Provincial Admin", "System Admin", "Admin"];
  if (!allowedRoles.includes(req.user.roleName)) {
    res.status(403).json({ success: false, message: "Admin role required to modify organization settings", data: null });
    return;
  }

  const {
    organizationName,
    shortCode,
    organizationType,
    tagline,
    systemTitle,
    logoUrl,
    faviconUrl,
    primaryColor,
    accentColor,
    currencyCode,
    currencySymbol,
    hierarchyPreset,
    level1Label,
    level1Plural,
    level2Label,
    level2Plural,
    level3Label,
    level3Plural,
  } = req.body ?? {};

  const current = await getOrInitSettings();
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (typeof organizationName === "string" && organizationName.trim()) {
    updates.organizationName = organizationName.trim();
  }
  if (typeof shortCode === "string" && shortCode.trim()) {
    updates.shortCode = shortCode.trim().toUpperCase();
  }
  if (typeof organizationType === "string" && organizationType.trim()) {
    updates.organizationType = organizationType.trim();
  }
  if (tagline !== undefined) updates.tagline = tagline ? String(tagline).trim() : null;
  if (systemTitle !== undefined) updates.systemTitle = systemTitle ? String(systemTitle).trim() : "Asset Management System";
  if (logoUrl !== undefined) updates.logoUrl = logoUrl ? String(logoUrl).trim() : null;
  if (faviconUrl !== undefined) updates.faviconUrl = faviconUrl ? String(faviconUrl).trim() : null;
  if (primaryColor !== undefined) updates.primaryColor = primaryColor ? String(primaryColor).trim() : "#0F4C81";
  if (accentColor !== undefined) updates.accentColor = accentColor ? String(accentColor).trim() : "#3B82F6";
  if (currencyCode !== undefined) updates.currencyCode = currencyCode ? String(currencyCode).trim().toUpperCase() : "USD";
  if (currencySymbol !== undefined) updates.currencySymbol = currencySymbol ? String(currencySymbol).trim() : "$";
  if (hierarchyPreset !== undefined) updates.hierarchyPreset = hierarchyPreset ? String(hierarchyPreset).trim() : "corporate";

  if (typeof level1Label === "string" && level1Label.trim()) updates.level1Label = level1Label.trim();
  if (typeof level1Plural === "string" && level1Plural.trim()) updates.level1Plural = level1Plural.trim();
  if (typeof level2Label === "string" && level2Label.trim()) updates.level2Label = level2Label.trim();
  if (typeof level2Plural === "string" && level2Plural.trim()) updates.level2Plural = level2Plural.trim();
  if (typeof level3Label === "string" && level3Label.trim()) updates.level3Label = level3Label.trim();
  if (typeof level3Plural === "string" && level3Plural.trim()) updates.level3Plural = level3Plural.trim();

  try {
    const [updated] = await db
      .update(organizationSettings)
      .set(updates)
      .where(eq(organizationSettings.id, current.id))
      .returning();

    res.json({
      success: true,
      message: "Organization settings updated successfully",
      data: updated,
    });
  } catch (err) {
    req.log.error({ err }, "Update organization settings error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
