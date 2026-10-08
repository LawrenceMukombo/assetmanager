import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  db,
  tenants,
  agencies,
  organizationSettings,
  users,
  userRoles,
  roles,
  userScope,
  activityLogs,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();
const HASH_ROUNDS = 10;

// Presets for Countries & Map coordinates
export const COUNTRY_PRESETS = [
  {
    code: "ZMB",
    name: "Zambia",
    currencyCode: "ZMW",
    currencySymbol: "K",
    lat: "-13.1339",
    lng: "27.8493",
    zoom: "6",
    level1: "Province",
    level1Plural: "Provinces",
    level2: "District",
    level2Plural: "Districts",
    level3: "Health Facility",
    level3Plural: "Health Facilities",
    primaryColor: "#198754",
    accentColor: "#FF8C00",
  },
  {
    code: "PNG",
    name: "Papua New Guinea",
    currencyCode: "PGK",
    currencySymbol: "K",
    lat: "-6.3150",
    lng: "143.9555",
    zoom: "6",
    level1: "Province",
    level1Plural: "Provinces",
    level2: "District",
    level2Plural: "Districts",
    level3: "Facility / Station",
    level3Plural: "Facilities / Stations",
    primaryColor: "#0F4C81",
    accentColor: "#E11D48",
  },
  {
    code: "KEN",
    name: "Kenya",
    currencyCode: "KES",
    currencySymbol: "KSh",
    lat: "-0.0236",
    lng: "37.9062",
    zoom: "6",
    level1: "County",
    level1Plural: "Counties",
    level2: "Sub-County",
    level2Plural: "Sub-Counties",
    level3: "Ward / Facility",
    level3Plural: "Wards / Facilities",
    primaryColor: "#0D5C3A",
    accentColor: "#BB1E10",
  },
  {
    code: "RWA",
    name: "Rwanda",
    currencyCode: "RWF",
    currencySymbol: "FRw",
    lat: "-1.9403",
    lng: "29.8739",
    zoom: "8",
    level1: "Province",
    level1Plural: "Provinces",
    level2: "District",
    level2Plural: "Districts",
    level3: "Sector / Center",
    level3Plural: "Sectors / Centers",
    primaryColor: "#0072BC",
    accentColor: "#FAD201",
  },
  {
    code: "GHA",
    name: "Ghana",
    currencyCode: "GHS",
    currencySymbol: "GH₵",
    lat: "7.9465",
    lng: "-1.0232",
    zoom: "6",
    level1: "Region",
    level1Plural: "Regions",
    level2: "District",
    level2Plural: "Districts",
    level3: "Sub-District / Facility",
    level3Plural: "Sub-Districts / Facilities",
    primaryColor: "#CE1126",
    accentColor: "#FCD116",
  },
  {
    code: "GLOBAL",
    name: "International / Multi-National",
    currencyCode: "USD",
    currencySymbol: "$",
    lat: "0.0",
    lng: "0.0",
    zoom: "2",
    level1: "Region",
    level1Plural: "Regions",
    level2: "Branch",
    level2Plural: "Branches",
    level3: "Site",
    level3Plural: "Sites",
    primaryColor: "#1E3A8A",
    accentColor: "#3B82F6",
  },
];

export const INDUSTRY_PRESETS = [
  {
    id: "healthcare",
    name: "Healthcare & Medical Services",
    preset: "health",
    level1: "Directorate",
    level1Plural: "Directorates",
    level2: "Provincial / Regional Health Office",
    level2Plural: "Health Offices",
    level3: "Hospital / Health Center",
    level3Plural: "Hospitals & Health Centers",
    primaryColor: "#0D9488",
    accentColor: "#14B8A6",
  },
  {
    id: "finance",
    name: "Finance, Banking & Revenue Authority",
    preset: "finance",
    level1: "Division",
    level1Plural: "Divisions",
    level2: "Department",
    level2Plural: "Departments",
    level3: "Branch / Operational Office",
    level3Plural: "Branches / Offices",
    primaryColor: "#1E3A8A",
    accentColor: "#3B82F6",
  },
  {
    id: "border_control",
    name: "Immigration, Customs & Homeland Security",
    preset: "public_sector",
    level1: "Command Division",
    level1Plural: "Command Divisions",
    level2: "Regional Office",
    level2Plural: "Regional Offices",
    level3: "Port of Entry / Border Post",
    level3Plural: "Ports of Entry & Border Posts",
    primaryColor: "#0F4C81",
    accentColor: "#DC2626",
  },
  {
    id: "transport",
    name: "Transportation, Fleet & Logistics",
    preset: "logistics",
    level1: "Logistics Hub",
    level1Plural: "Logistics Hubs",
    level2: "Regional Depot",
    level2Plural: "Regional Depots",
    level3: "Fleet Station / Bay",
    level3Plural: "Fleet Stations & Bays",
    primaryColor: "#4338CA",
    accentColor: "#6366F1",
  },
  {
    id: "education",
    name: "Education, Universities & Research",
    preset: "education",
    level1: "Campus",
    level1Plural: "Campuses",
    level2: "Faculty / School",
    level2Plural: "Faculties & Schools",
    level3: "Department / Laboratory",
    level3Plural: "Departments & Labs",
    primaryColor: "#7C3AED",
    accentColor: "#A855F7",
  },
  {
    id: "government",
    name: "Ministry, Public Agency & Local Government",
    preset: "public_sector",
    level1: "Department",
    level1Plural: "Departments",
    level2: "Directorate",
    level2Plural: "Directorates",
    level3: "Field Office / Station",
    level3Plural: "Field Offices & Stations",
    primaryColor: "#15803D",
    accentColor: "#22C55E",
  },
  {
    id: "corporate",
    name: "Commercial Corporation & Enterprise",
    preset: "corporate",
    level1: "Division",
    level1Plural: "Divisions",
    level2: "Department",
    level2Plural: "Departments",
    level3: "Facility / Room / Site",
    level3Plural: "Facilities / Rooms / Sites",
    primaryColor: "#0F172A",
    accentColor: "#0284C7",
  },
];

// GET /v1/onboarding/options
router.get("/v1/onboarding/options", requireAuth, async (req, res) => {
  try {
    const existingTenants = await db.select().from(tenants).where(eq(tenants.active, true));
    const existingAgencies = await db.select().from(agencies).where(eq(agencies.active, true));

    res.json({
      success: true,
      data: {
        countries: COUNTRY_PRESETS,
        industries: INDUSTRY_PRESETS,
        existingTenants,
        existingAgencies,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Onboarding options error");
    res.status(500).json({ success: false, message: "Failed to load onboarding options" });
  }
});

// POST /v1/onboarding/country
// Sovereign Country Tier onboarding logic
router.post("/v1/onboarding/country", requireAuth, async (req, res) => {
  try {
    if (req.user?.roleName !== "Super Admin") {
      res.status(403).json({ success: false, message: "Super Admin privileges required to onboard a country" });
      return;
    }

    const {
      countryName,
      countryCode,
      currencyCode,
      currencySymbol,
      defaultLatitude,
      defaultLongitude,
      defaultZoom,
      logoUrl,
      faviconUrl,
      primaryColor,
      accentColor,
      hierarchyPreset,
      level1Label,
      level1Plural,
      level2Label,
      level2Plural,
      level3Label,
      level3Plural,
      adminUser,
    } = req.body;

    if (!countryName?.trim() || !countryCode?.trim()) {
      res.status(400).json({ success: false, message: "Country name and country code are required" });
      return;
    }

    const cleanCode = countryCode.trim().toUpperCase();
    const cleanName = countryName.trim();

    // 1. Upsert Sovereign Tenant
    let tenantRow: any;
    const [existingTenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.code, cleanCode))
      .limit(1);

    if (existingTenant) {
      const [updated] = await db
        .update(tenants)
        .set({ name: cleanName, active: true, updatedAt: new Date() })
        .where(eq(tenants.id, existingTenant.id))
        .returning();
      tenantRow = updated;
    } else {
      const [created] = await db
        .insert(tenants)
        .values({ name: cleanName, code: cleanCode, active: true })
        .returning();
      tenantRow = created;
    }

    // 2. Upsert Sovereign Country Organization Settings
    let settingsRow: any;
    const [existingSettings] = await db
      .select()
      .from(organizationSettings)
      .where(sql`${organizationSettings.tenantId} = ${tenantRow.id} AND ${organizationSettings.agencyId} IS NULL`)
      .limit(1);

    const settingsData = {
      tenantId: tenantRow.id,
      organizationName: cleanName,
      shortCode: cleanCode,
      organizationType: "sovereign",
      tagline: `National Asset & Infrastructure Portal of ${cleanName}`,
      systemTitle: `${cleanName} National Asset Register`,
      logoUrl: logoUrl || null,
      faviconUrl: faviconUrl || logoUrl || null,
      primaryColor: primaryColor || "#0F4C81",
      accentColor: accentColor || "#3B82F6",
      currencyCode: currencyCode || "USD",
      currencySymbol: currencySymbol || "$",
      countryCode: cleanCode,
      countryName: cleanName,
      defaultLatitude: defaultLatitude ? String(defaultLatitude) : null,
      defaultLongitude: defaultLongitude ? String(defaultLongitude) : null,
      defaultZoom: defaultZoom ? String(defaultZoom) : "6",
      hierarchyPreset: hierarchyPreset || "sovereign",
      level1Label: level1Label || "Province",
      level1Plural: level1Plural || "Provinces",
      level2Label: level2Label || "District",
      level2Plural: level2Plural || "Districts",
      level3Label: level3Label || "Facility",
      level3Plural: level3Plural || "Facilities",
      active: true,
      updatedAt: new Date(),
    };

    if (existingSettings) {
      const [updated] = await db
        .update(organizationSettings)
        .set(settingsData)
        .where(eq(organizationSettings.id, existingSettings.id))
        .returning();
      settingsRow = updated;
    } else {
      const [created] = await db
        .insert(organizationSettings)
        .values(settingsData)
        .returning();
      settingsRow = created;
    }

    // 3. Optional Country Admin User
    let createdAdmin: any = null;
    if (adminUser?.email && adminUser?.fullName) {
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, adminUser.email.trim().toLowerCase()))
        .limit(1);

      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(adminUser.password || "Admin1234!", HASH_ROUNDS);
        const [superRole] = await db.select().from(roles).where(eq(roles.roleName, "Super Admin")).limit(1);

        const [newUser] = await db
          .insert(users)
          .values({
            email: adminUser.email.trim().toLowerCase(),
            passwordHash: hashedPassword,
            fullName: adminUser.fullName.trim(),
            jobTitle: adminUser.jobTitle || `${cleanName} National Administrator`,
            department: adminUser.department || "National Administration",
            active: true,
          })
          .returning();

        if (superRole && newUser) {
          await db.insert(userRoles).values({
            userId: newUser.id,
            roleId: superRole.id,
          });
          await db.insert(userScope).values({
            userId: newUser.id,
          });
        }
        createdAdmin = { id: newUser.id, email: newUser.email, fullName: newUser.fullName };
      }
    }

    // Log Activity
    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "onboard_country",
      entityType: "tenants",
      entityId: tenantRow.id,
      description: `Onboarded country ${cleanName} (${cleanCode})`,
      metadata: { countryName: cleanName, countryCode: cleanCode },
    });

    res.status(201).json({
      success: true,
      message: `Country ${cleanName} onboarded successfully`,
      data: {
        tenant: tenantRow,
        settings: settingsRow,
        adminUser: createdAdmin,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Onboard country error");
    res.status(500).json({ success: false, message: "Failed to onboard country" });
  }
});

// POST /v1/onboarding/organization
// Enterprise / Ministry / Agency onboarding logic
router.post("/v1/onboarding/organization", requireAuth, async (req, res) => {
  try {
    if (req.user?.roleName !== "Super Admin" && req.user?.roleName !== "Agency Admin") {
      res.status(403).json({ success: false, message: "Administrative privileges required to onboard an organization" });
      return;
    }

    const {
      tenantId,
      countryCode,
      organizationName,
      shortCode,
      organizationType,
      industry,
      description,
      logoUrl,
      faviconUrl,
      primaryColor,
      accentColor,
      currencyCode,
      currencySymbol,
      defaultLatitude,
      defaultLongitude,
      defaultZoom,
      hierarchyPreset,
      level1Label,
      level1Plural,
      level2Label,
      level2Plural,
      level3Label,
      level3Plural,
      adminUser,
    } = req.body;

    if (!organizationName?.trim() || !shortCode?.trim()) {
      res.status(400).json({ success: false, message: "Organization name and short code are required" });
      return;
    }

    const cleanCode = shortCode.trim().toUpperCase();
    const cleanName = organizationName.trim();

    // 1. Resolve Sovereign Tenant
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId && countryCode) {
      const [tenantByCode] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.code, countryCode.trim().toUpperCase()))
        .limit(1);
      if (tenantByCode) resolvedTenantId = tenantByCode.id;
    }

    if (!resolvedTenantId) {
      const [firstTenant] = await db.select().from(tenants).limit(1);
      resolvedTenantId = firstTenant?.id;
    }

    if (!resolvedTenantId) {
      // Create a default host tenant if none exists
      const [createdTenant] = await db
        .insert(tenants)
        .values({ name: "National Platform", code: "NAT", active: true })
        .returning();
      resolvedTenantId = createdTenant.id;
    }

    // 2. Upsert Agency / Organization
    let agencyRow: any;
    const [existingAgency] = await db
      .select()
      .from(agencies)
      .where(eq(agencies.agencyCode, cleanCode))
      .limit(1);

    const agencyPayload = {
      tenantId: resolvedTenantId,
      agencyName: cleanName,
      agencyCode: cleanCode,
      agencyType: organizationType || industry || "enterprise",
      logoUrl: logoUrl || null,
      themeAccentColor: primaryColor || "#0F4C81",
      description: description || `${cleanName} Operations`,
      active: true,
      updatedAt: new Date(),
    };

    if (existingAgency) {
      const [updated] = await db
        .update(agencies)
        .set(agencyPayload)
        .where(eq(agencies.id, existingAgency.id))
        .returning();
      agencyRow = updated;
    } else {
      const [created] = await db
        .insert(agencies)
        .values(agencyPayload)
        .returning();
      agencyRow = created;
    }

    // 3. Upsert Organization Settings for this Agency
    let settingsRow: any;
    const [existingSettings] = await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.agencyId, agencyRow.id))
      .limit(1);

    const settingsPayload = {
      tenantId: resolvedTenantId,
      agencyId: agencyRow.id,
      organizationName: cleanName,
      shortCode: cleanCode,
      organizationType: organizationType || industry || "enterprise",
      tagline: description || `${cleanName} Asset & Inventory Management`,
      systemTitle: `${cleanName} Asset Management`,
      logoUrl: logoUrl || null,
      faviconUrl: faviconUrl || logoUrl || null,
      primaryColor: primaryColor || "#0F4C81",
      accentColor: accentColor || "#3B82F6",
      currencyCode: currencyCode || "USD",
      currencySymbol: currencySymbol || "$",
      countryCode: countryCode ? countryCode.trim().toUpperCase() : "PNG",
      defaultLatitude: defaultLatitude ? String(defaultLatitude) : null,
      defaultLongitude: defaultLongitude ? String(defaultLongitude) : null,
      defaultZoom: defaultZoom ? String(defaultZoom) : "6",
      hierarchyPreset: hierarchyPreset || "corporate",
      level1Label: level1Label || "Division",
      level1Plural: level1Plural || "Divisions",
      level2Label: level2Label || "Department",
      level2Plural: level2Plural || "Departments",
      level3Label: level3Label || "Site / Room",
      level3Plural: level3Plural || "Sites / Rooms",
      active: true,
      updatedAt: new Date(),
    };

    if (existingSettings) {
      const [updated] = await db
        .update(organizationSettings)
        .set(settingsPayload)
        .where(eq(organizationSettings.id, existingSettings.id))
        .returning();
      settingsRow = updated;
    } else {
      const [created] = await db
        .insert(organizationSettings)
        .values(settingsPayload)
        .returning();
      settingsRow = created;
    }

    // 4. Optional Organization Admin User
    let createdAdmin: any = null;
    if (adminUser?.email && adminUser?.fullName) {
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, adminUser.email.trim().toLowerCase()))
        .limit(1);

      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(adminUser.password || "Admin1234!", HASH_ROUNDS);
        const [agencyAdminRole] = await db
          .select()
          .from(roles)
          .where(eq(roles.roleName, "Agency Admin"))
          .limit(1);

        const [newUser] = await db
          .insert(users)
          .values({
            email: adminUser.email.trim().toLowerCase(),
            passwordHash: hashedPassword,
            fullName: adminUser.fullName.trim(),
            jobTitle: adminUser.jobTitle || `${cleanName} Lead Administrator`,
            department: adminUser.department || "Executive Office",
            active: true,
          })
          .returning();

        if (agencyAdminRole && newUser) {
          await db.insert(userRoles).values({
            userId: newUser.id,
            roleId: agencyAdminRole.id,
          });
          await db.insert(userScope).values({
            userId: newUser.id,
            agencyId: agencyRow.id,
          });
        }
        createdAdmin = { id: newUser.id, email: newUser.email, fullName: newUser.fullName };
      }
    }

    // Log Activity
    await db.insert(activityLogs).values({
      userId: req.user.userId,
      actionType: "onboard_organization",
      entityType: "agencies",
      entityId: agencyRow.id,
      description: `Onboarded organization ${cleanName} (${cleanCode})`,
      metadata: { organizationName: cleanName, shortCode: cleanCode },
    });

    res.status(201).json({
      success: true,
      message: `Organization ${cleanName} onboarded successfully`,
      data: {
        agency: agencyRow,
        settings: settingsRow,
        adminUser: createdAdmin,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Onboard organization error");
    res.status(500).json({ success: false, message: "Failed to onboard organization" });
  }
});

export default router;
