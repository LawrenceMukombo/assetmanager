import { Router } from "express";
import { eq, desc, sql, ilike, or, and } from "drizzle-orm";
import {
  db,
  organizationSettings,
  agencies,
  tenants,
  assets,
  userScope,
  stockItems,
} from "@workspace/db";
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

async function getOrInitSettings(agencyId?: string | null) {
  if (agencyId) {
    const [agencyRow] = await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.agencyId, agencyId))
      .orderBy(desc(organizationSettings.updatedAt))
      .limit(1);

    if (agencyRow) {
      return agencyRow;
    }

    // Check if the agency exists to initialize its settings
    const [ag] = await db
      .select()
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1);

    if (ag) {
      const [createdForAgency] = await db
        .insert(organizationSettings)
        .values({
          agencyId: ag.id,
          tenantId: ag.tenantId,
          organizationName: ag.agencyName,
          shortCode: ag.agencyCode,
          organizationType: ag.agencyType || "enterprise",
          tagline: ag.description || DEFAULT_SETTINGS.tagline,
          systemTitle: `${ag.agencyName} Asset Management`,
          logoUrl: ag.logoUrl,
          primaryColor: ag.themeAccentColor || DEFAULT_SETTINGS.primaryColor,
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
          active: ag.active,
        })
        .returning();

      if (createdForAgency) return createdForAgency;
    }
  }

  // Fallback to global/default settings
  const [existing] = await db
    .select()
    .from(organizationSettings)
    .where(sql`${organizationSettings.agencyId} IS NULL`)
    .orderBy(desc(organizationSettings.updatedAt))
    .limit(1);

  if (existing) {
    return existing;
  }

  // Any latest existing row if no null agency row
  const [anyExisting] = await db
    .select()
    .from(organizationSettings)
    .orderBy(desc(organizationSettings.updatedAt))
    .limit(1);

  if (anyExisting) {
    return anyExisting;
  }

  // Insert default initial global row
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
    let agencyId = typeof req.query.agencyId === "string" ? req.query.agencyId : null;
    const code = typeof req.query.code === "string" ? req.query.code.trim().toUpperCase() : null;

    if (!agencyId && code) {
      const [foundAgency] = await db
        .select({ id: agencies.id })
        .from(agencies)
        .where(eq(agencies.agencyCode, code))
        .limit(1);
      if (foundAgency) agencyId = foundAgency.id;
    }

    const settings = await getOrInitSettings(agencyId);
    res.json({
      success: true,
      message: "Public organization settings retrieved",
      data: {
        agencyId: settings.agencyId ?? null,
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
    const requestedAgencyId =
      typeof req.query.agencyId === "string"
        ? req.query.agencyId
        : (req.headers["x-active-agency-id"] as string | undefined) ||
          req.user?.agencyId ||
          null;

    const settings = await getOrInitSettings(requestedAgencyId);
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
    agencyId: targetAgencyId,
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

  // Restrict Agency Admin to their own agency
  const effectiveAgencyId =
    req.user.roleName === "Super Admin"
      ? (targetAgencyId || req.user.agencyId || null)
      : (req.user.agencyId || null);

  const current = await getOrInitSettings(effectiveAgencyId);
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

    // If updating an agency, synchronize the agency record too
    if (effectiveAgencyId) {
      const agencySync: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.organizationName) agencySync.agencyName = updates.organizationName;
      if (updates.shortCode) agencySync.agencyCode = updates.shortCode;
      if (updates.organizationType) agencySync.agencyType = updates.organizationType;
      if (updates.logoUrl !== undefined) agencySync.logoUrl = updates.logoUrl;
      if (updates.primaryColor !== undefined) agencySync.themeAccentColor = updates.primaryColor;
      await db.update(agencies).set(agencySync).where(eq(agencies.id, effectiveAgencyId));
    }

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

// ─── MULTI-TENANT ORGANIZATIONS DIRECTORY & MANAGEMENT ───────────────────────────

// GET /v1/organizations - List all organizations / agencies with asset and user statistics
router.get("/v1/organizations", requireAuth, async (req, res) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : null;
    const activeFilter = req.query.active !== undefined ? req.query.active === "true" : null;

    const conditions = [];
    if (search) {
      conditions.push(
        or(
          ilike(agencies.agencyName, `%${search}%`),
          ilike(agencies.agencyCode, `%${search}%`),
          ilike(agencies.agencyType, `%${search}%`)
        )
      );
    }
    if (activeFilter !== null) {
      conditions.push(eq(agencies.active, activeFilter));
    }

    // Retrieve all agencies
    const allAgencies = await db
      .select({
        id: agencies.id,
        tenantId: agencies.tenantId,
        agencyCode: agencies.agencyCode,
        agencyName: agencies.agencyName,
        agencyType: agencies.agencyType,
        logoUrl: agencies.logoUrl,
        themeAccentColor: agencies.themeAccentColor,
        description: agencies.description,
        active: agencies.active,
        createdAt: agencies.createdAt,
        updatedAt: agencies.updatedAt,
      })
      .from(agencies)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(agencies.agencyName);

    // Get asset counts per agency
    const assetCounts = await db
      .select({
        agencyId: assets.agencyId,
        count: sql<number>`count(${assets.id})::int`,
      })
      .from(assets)
      .where(sql`${assets.agencyId} IS NOT NULL`)
      .groupBy(assets.agencyId);

    const assetCountMap = new Map(assetCounts.map((r) => [r.agencyId!, Number(r.count)]));

    // Get stock counts per agency
    const stockCounts = await db
      .select({
        agencyId: stockItems.agencyId,
        count: sql<number>`count(${stockItems.id})::int`,
      })
      .from(stockItems)
      .where(sql`${stockItems.agencyId} IS NOT NULL`)
      .groupBy(stockItems.agencyId);

    const stockCountMap = new Map(stockCounts.map((r) => [r.agencyId!, Number(r.count)]));

    // Get user counts per agency
    const userCounts = await db
      .select({
        agencyId: userScope.agencyId,
        count: sql<number>`count(${userScope.userId})::int`,
      })
      .from(userScope)
      .where(sql`${userScope.agencyId} IS NOT NULL`)
      .groupBy(userScope.agencyId);

    const userCountMap = new Map(userCounts.map((r) => [r.agencyId!, Number(r.count)]));

    const enriched = allAgencies.map((a) => ({
      ...a,
      assetCount: assetCountMap.get(a.id) ?? 0,
      stockCount: stockCountMap.get(a.id) ?? 0,
      userCount: userCountMap.get(a.id) ?? 0,
    }));

    res.json({
      success: true,
      message: "Organizations retrieved",
      data: enriched,
    });
  } catch (err) {
    req.log.error({ err }, "Get organizations error");
    res.status(500).json({ success: false, message: "Internal server error", data: [] });
  }
});

// POST /v1/organizations - Create a new organization/agency (Super Admin only)
router.post("/v1/organizations", requireAuth, async (req, res) => {
  if (!req.user || req.user.roleName !== "Super Admin") {
    res.status(403).json({ success: false, message: "Super Admin role required to create organizations", data: null });
    return;
  }

  const {
    agencyCode,
    agencyName,
    agencyType,
    description,
    logoUrl,
    themeAccentColor,
    currencyCode = "USD",
    currencySymbol = "$",
    hierarchyPreset = "corporate",
    systemTitle,
  } = req.body ?? {};

  if (!agencyCode || typeof agencyCode !== "string" || !agencyCode.trim()) {
    res.status(400).json({ success: false, message: "Organization Code is required", data: null });
    return;
  }

  if (!agencyName || typeof agencyName !== "string" || !agencyName.trim()) {
    res.status(400).json({ success: false, message: "Organization Name is required", data: null });
    return;
  }

  const cleanCode = agencyCode.trim().toUpperCase();
  const cleanName = agencyName.trim();

  try {
    // Check for duplicate code
    const [existing] = await db
      .select({ id: agencies.id })
      .from(agencies)
      .where(eq(agencies.agencyCode, cleanCode))
      .limit(1);

    if (existing) {
      res.status(409).json({ success: false, message: `Organization code '${cleanCode}' is already registered`, data: null });
      return;
    }

    // Find default tenant or first tenant
    const [defaultTenant] = await db.select({ id: tenants.id }).from(tenants).limit(1);
    let tenantId = defaultTenant?.id;

    if (!tenantId) {
      const [newTenant] = await db
        .insert(tenants)
        .values({ name: "Default Enterprise Group", code: "DEFAULT" })
        .returning();
      tenantId = newTenant.id;
    }

    const [createdAgency] = await db
      .insert(agencies)
      .values({
        tenantId,
        agencyCode: cleanCode,
        agencyName: cleanName,
        agencyType: agencyType ? String(agencyType).trim() : "Enterprise",
        description: description ? String(description).trim() : null,
        logoUrl: logoUrl ? String(logoUrl).trim() : null,
        themeAccentColor: themeAccentColor ? String(themeAccentColor).trim() : "#0F4C81",
        active: true,
      })
      .returning();

    // Initialize individual organizationSettings for this organization
    await db.insert(organizationSettings).values({
      agencyId: createdAgency.id,
      tenantId,
      organizationName: cleanName,
      shortCode: cleanCode,
      organizationType: createdAgency.agencyType || "enterprise",
      tagline: createdAgency.description || "Enterprise Asset & Inventory Management",
      systemTitle: systemTitle ? String(systemTitle).trim() : `${cleanName} Asset Management`,
      logoUrl: createdAgency.logoUrl,
      primaryColor: createdAgency.themeAccentColor || "#0F4C81",
      accentColor: "#3B82F6",
      currencyCode: String(currencyCode).toUpperCase(),
      currencySymbol: String(currencySymbol),
      hierarchyPreset: String(hierarchyPreset),
      level1Label: "Division",
      level1Plural: "Divisions",
      level2Label: "Department",
      level2Plural: "Departments",
      level3Label: "Site / Room",
      level3Plural: "Sites / Rooms",
      active: true,
    });

    res.status(201).json({
      success: true,
      message: "Organization created successfully",
      data: createdAgency,
    });
  } catch (err) {
    req.log.error({ err }, "Create organization error");
    res.status(500).json({ success: false, message: "Failed to create organization", data: null });
  }
});

// GET /v1/organizations/:id - Get single organization details
router.get("/v1/organizations/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const [ag] = await db.select().from(agencies).where(eq(agencies.id, id)).limit(1);

    if (!ag) {
      res.status(404).json({ success: false, message: "Organization not found", data: null });
      return;
    }

    const settings = await getOrInitSettings(ag.id);

    const [assetCount] = await db
      .select({ count: sql<number>`count(${assets.id})::int` })
      .from(assets)
      .where(eq(assets.agencyId, ag.id));

    const [userCount] = await db
      .select({ count: sql<number>`count(${userScope.userId})::int` })
      .from(userScope)
      .where(eq(userScope.agencyId, ag.id));

    res.json({
      success: true,
      message: "Organization details retrieved",
      data: {
        ...ag,
        settings,
        assetCount: Number(assetCount?.count ?? 0),
        userCount: Number(userCount?.count ?? 0),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Get organization detail error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// PATCH /v1/organizations/:id - Update organization details
router.patch("/v1/organizations/:id", requireAuth, async (req, res) => {
  if (!req.user) return;
  const isSuperAdmin = req.user.roleName === "Super Admin";
  const isMyAgency = req.user.agencyId === req.params.id;

  if (!isSuperAdmin && (!isMyAgency || req.user.roleName !== "Agency Admin")) {
    res.status(403).json({ success: false, message: "Permission denied", data: null });
    return;
  }

  const id = req.params.id as string;
  const { agencyName, agencyType, description, logoUrl, themeAccentColor, active } = req.body ?? {};

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof agencyName === "string" && agencyName.trim()) updates.agencyName = agencyName.trim();
  if (typeof agencyType === "string" && agencyType.trim()) updates.agencyType = agencyType.trim();
  if (description !== undefined) updates.description = description ? String(description).trim() : null;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl ? String(logoUrl).trim() : null;
  if (themeAccentColor !== undefined) updates.themeAccentColor = themeAccentColor ? String(themeAccentColor).trim() : null;
  if (typeof active === "boolean" && isSuperAdmin) updates.active = active;

  try {
    const [updated] = await db
      .update(agencies)
      .set(updates)
      .where(eq(agencies.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: "Organization not found", data: null });
      return;
    }

    // Keep linked organizationSettings in sync
    const settingsSync: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.agencyName) settingsSync.organizationName = updates.agencyName;
    if (updates.agencyType) settingsSync.organizationType = updates.agencyType;
    if (updates.logoUrl !== undefined) settingsSync.logoUrl = updates.logoUrl;
    if (updates.themeAccentColor !== undefined) settingsSync.primaryColor = updates.themeAccentColor;
    if (typeof active === "boolean") settingsSync.active = active;

    await db.update(organizationSettings).set(settingsSync).where(eq(organizationSettings.agencyId, id));

    res.json({
      success: true,
      message: "Organization updated successfully",
      data: updated,
    });
  } catch (err) {
    req.log.error({ err }, "Update organization error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

// PATCH /v1/organizations/:id/status - Toggle organization active state (Super Admin only)
router.patch("/v1/organizations/:id/status", requireAuth, async (req, res) => {
  if (!req.user || req.user.roleName !== "Super Admin") {
    res.status(403).json({ success: false, message: "Super Admin role required", data: null });
    return;
  }

  const id = req.params.id as string;
  const { active } = req.body ?? {};

  if (typeof active !== "boolean") {
    res.status(400).json({ success: false, message: "'active' boolean is required", data: null });
    return;
  }

  try {
    const [updated] = await db
      .update(agencies)
      .set({ active, updatedAt: new Date() })
      .where(eq(agencies.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: "Organization not found", data: null });
      return;
    }

    await db
      .update(organizationSettings)
      .set({ active, updatedAt: new Date() })
      .where(eq(organizationSettings.agencyId, id));

    res.json({
      success: true,
      message: `Organization ${active ? "activated" : "deactivated"} successfully`,
      data: updated,
    });
  } catch (err) {
    req.log.error({ err }, "Toggle organization status error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
