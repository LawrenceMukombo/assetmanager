import { db, pool } from "@workspace/db";
import {
  tenants,
  provinces,
  districts,
  facilities,
  roles,
  users,
  userRoles,
  userScope,
  assetCategories,
  assets,
  notifications,
} from "@workspace/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const HASH_ROUNDS = 10;
const DEFAULT_PASSWORD = "Admin1234!";

async function main() {
  console.log("Seeding NPAMS database...");

  // --- TENANT ---
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Papua New Guinea Government", code: "PNG" })
    .onConflictDoUpdate({ target: tenants.code, set: { name: "Papua New Guinea Government" } })
    .returning();
  console.log("Tenant:", tenant.id);

  // --- ROLES ---
  const roleData = [
    { roleName: "Super Admin", description: "Full platform access", scopeLevel: "national" as const },
    { roleName: "National Asset Controller", description: "Read/write all provinces", scopeLevel: "national" as const },
    { roleName: "National Auditor", description: "Read-only across all data", scopeLevel: "national" as const },
    { roleName: "Provincial Admin", description: "Full access within province", scopeLevel: "provincial" as const },
    { roleName: "Provincial Asset Officer", description: "Create/edit assets in province", scopeLevel: "provincial" as const },
    { roleName: "Provincial Viewer", description: "Read-only within province", scopeLevel: "provincial" as const },
  ];

  const roleMap: Record<string, string> = {};
  for (const r of roleData) {
    const [row] = await db
      .insert(roles)
      .values(r)
      .onConflictDoUpdate({ target: roles.roleName, set: { description: r.description } })
      .returning();
    roleMap[r.roleName] = row.id;
  }
  console.log("Roles seeded:", Object.keys(roleMap).length);

  // --- PROVINCES (All 22 PNG Provinces with local flag files) ---
  const provinceData = [
    { provinceCode: "CP",  provinceName: "Central Province",                    flagUrl: "/flags/central.svg",             themeAccentColor: "#1E40AF", region: "Southern" },
    { provinceCode: "CH",  provinceName: "Chimbu (Simbu) Province",             flagUrl: "/flags/chimbu.svg",              themeAccentColor: "#B91C1C", region: "Highlands" },
    { provinceCode: "EH",  provinceName: "Eastern Highlands Province",          flagUrl: "/flags/eastern_highlands.svg",   themeAccentColor: "#065F46", region: "Highlands" },
    { provinceCode: "ENB", provinceName: "East New Britain Province",           flagUrl: "/flags/east_new_britain.svg",    themeAccentColor: "#7C3AED", region: "Islands" },
    { provinceCode: "ES",  provinceName: "East Sepik Province",                 flagUrl: "/flags/east_sepik.png",          themeAccentColor: "#0369A1", region: "Momase" },
    { provinceCode: "EN",  provinceName: "Enga Province",                       flagUrl: "/flags/enga.png",                themeAccentColor: "#CA8A04", region: "Highlands" },
    { provinceCode: "GU",  provinceName: "Gulf Province",                       flagUrl: "/flags/gulf.png",                themeAccentColor: "#0F766E", region: "Southern" },
    { provinceCode: "HE",  provinceName: "Hela Province",                       flagUrl: "/flags/hela.svg",                themeAccentColor: "#92400E", region: "Highlands" },
    { provinceCode: "JI",  provinceName: "Jiwaka Province",                     flagUrl: "/flags/jiwaka.svg",              themeAccentColor: "#1D4ED8", region: "Highlands" },
    { provinceCode: "MA",  provinceName: "Manus Province",                      flagUrl: "/flags/manus.svg",               themeAccentColor: "#0284C7", region: "Islands" },
    { provinceCode: "MB",  provinceName: "Milne Bay Province",                  flagUrl: "/flags/milne_bay.svg",           themeAccentColor: "#047857", region: "Southern" },
    { provinceCode: "MO",  provinceName: "Morobe Province",                     flagUrl: "/flags/morobe.png",              themeAccentColor: "#1E3A8A", region: "Momase" },
    { provinceCode: "NCD", provinceName: "National Capital District",           flagUrl: "/flags/ncd.svg",                 themeAccentColor: "#DC2626", region: "Southern" },
    { provinceCode: "NI",  provinceName: "New Ireland Province",                flagUrl: "/flags/new_ireland.svg",         themeAccentColor: "#9D174D", region: "Islands" },
    { provinceCode: "NO",  provinceName: "Northern (Oro) Province",             flagUrl: "/flags/northern.png",            themeAccentColor: "#166534", region: "Southern" },
    { provinceCode: "AB",  provinceName: "Autonomous Region of Bougainville",   flagUrl: "/flags/bougainville.svg",        themeAccentColor: "#1E3A5F", region: "Islands" },
    { provinceCode: "SA",  provinceName: "Sandaun (West Sepik) Province",       flagUrl: "/flags/sandaun.svg",             themeAccentColor: "#6D28D9", region: "Momase" },
    { provinceCode: "SH",  provinceName: "Southern Highlands Province",         flagUrl: "/flags/southern_highlands.svg",  themeAccentColor: "#B45309", region: "Highlands" },
    { provinceCode: "WS",  provinceName: "Western Province",                    flagUrl: "/flags/western.svg",             themeAccentColor: "#047857", region: "Southern" },
    { provinceCode: "WHP", provinceName: "Western Highlands Province",          flagUrl: "/flags/western_highlands.svg",   themeAccentColor: "#7C2D12", region: "Highlands" },
    { provinceCode: "WNB", provinceName: "West New Britain Province",           flagUrl: "/flags/west_new_britain.svg",    themeAccentColor: "#064E3B", region: "Islands" },
    { provinceCode: "MD",  provinceName: "Madang Province",                     flagUrl: "/flags/madang.svg",              themeAccentColor: "#312E81", region: "Momase" },
  ];

  const provinceMap: Record<string, string> = {};
  for (const p of provinceData) {
    const [row] = await db
      .insert(provinces)
      .values({ ...p, tenantId: tenant.id })
      .onConflictDoUpdate({ target: provinces.provinceCode, set: { provinceName: p.provinceName, flagUrl: p.flagUrl, themeAccentColor: p.themeAccentColor, region: p.region } })
      .returning();
    provinceMap[p.provinceCode] = row.id;
  }
  console.log("Provinces seeded:", Object.keys(provinceMap).length);

  // --- DISTRICTS for Morobe, WHP, NCD, Central ---
  const districtData = [
    // Morobe
    { provinceCode: "MO", districtName: "Lae District", districtCode: "MO-LAE" },
    { provinceCode: "MO", districtName: "Huon Gulf District", districtCode: "MO-HG" },
    { provinceCode: "MO", districtName: "Markham District", districtCode: "MO-MK" },
    { provinceCode: "MO", districtName: "Menyamya District", districtCode: "MO-ME" },
    // WHP
    { provinceCode: "WHP", districtName: "Mt Hagen District", districtCode: "WHP-MTH" },
    { provinceCode: "WHP", districtName: "Dei District", districtCode: "WHP-DEI" },
    { provinceCode: "WHP", districtName: "Mul-Baiyer District", districtCode: "WHP-MUL" },
    // NCD
    { provinceCode: "NCD", districtName: "Moresby North-East District", districtCode: "NCD-NE" },
    { provinceCode: "NCD", districtName: "Moresby North-West District", districtCode: "NCD-NW" },
    { provinceCode: "NCD", districtName: "Moresby South District", districtCode: "NCD-SO" },
    // Central Province (5 districts — Kairuku-Hiri split into two)
    { provinceCode: "CP", districtName: "Abau District",    districtCode: "CP-AB" },
    { provinceCode: "CP", districtName: "Goilala District", districtCode: "CP-GO" },
    { provinceCode: "CP", districtName: "Kairuku District", districtCode: "CP-KA" },
    { provinceCode: "CP", districtName: "Hiri District",    districtCode: "CP-HI" },
    { provinceCode: "CP", districtName: "Rigo District",    districtCode: "CP-RI" },
    // Districts required by ICSA presence sites (task #76)
    { provinceCode: "SA",  districtName: "Vanimo-Green River District", districtCode: "SA-VG" },
    { provinceCode: "ENB", districtName: "Kokopo District",             districtCode: "ENB-KO" },
    { provinceCode: "ENB", districtName: "Rabaul District",             districtCode: "ENB-RA" },
    // ICA_PRESENCE_SITES uses MA-MA for Madang Regional Office; we mirror
    // that mapping here so the seeded district id matches the auto-seeder.
    { provinceCode: "MD",  districtName: "Madang District",             districtCode: "MA-MA" },
    { provinceCode: "WS",  districtName: "North Fly District",          districtCode: "WP-NF" },
    { provinceCode: "WS",  districtName: "South Fly District",          districtCode: "WP-SF" },
    { provinceCode: "MB",  districtName: "Alotau District",             districtCode: "MB-AL" },
    { provinceCode: "NI",  districtName: "Kavieng District",            districtCode: "NI-KA" },
  ];

  const districtMap: Record<string, string> = {};
  for (const d of districtData) {
    const [row] = await db
      .insert(districts)
      .values({ provinceId: provinceMap[d.provinceCode]!, districtName: d.districtName, districtCode: d.districtCode })
      .onConflictDoNothing()
      .returning();
    if (row) districtMap[d.districtCode] = row.id;
  }
  // Fetch existing districts
  const allDistricts = await db.select().from(districts);
  for (const d of allDistricts) {
    if (d.districtCode) districtMap[d.districtCode] = d.id;
  }
  console.log("Districts seeded:", Object.keys(districtMap).length);

  // --- FACILITIES ---
  // ICSA presence facilities only — NPAMS is an immigration asset register.
  // Hospitals / health centres / schools / city-authority offices were
  // dropped in task #76; they are not ICSA-relevant. This list MUST stay
  // in sync with ICA_PRESENCE_SITES in
  // artifacts/api-server/src/lib/icaPresence.ts so that `pnpm seed` and the
  // server's auto-seeder produce the same curated facility set.
  const facilityData = [
    { districtCode: "NCD-NW",  facilityName: "ICSA Konedobu Headquarters",        facilityType: "Headquarters" },
    { districtCode: "NCD-NE",  facilityName: "ICSA Jacksons Airport Immigration", facilityType: "Airport Immigration" },
    { districtCode: "SA-VG",   facilityName: "ICSA Vanimo Border Post",           facilityType: "Border Post" },
    { districtCode: "SA-VG",   facilityName: "ICSA Wutung Border Crossing",       facilityType: "Land Border Crossing" },
    { districtCode: "MO-LAE",  facilityName: "ICSA Lae Regional Office",          facilityType: "Regional Office" },
    { districtCode: "WHP-MTH", facilityName: "ICSA Mt Hagen Regional Office",     facilityType: "Regional Office" },
    { districtCode: "ENB-KO",  facilityName: "ICSA Kokopo Regional Office",       facilityType: "Regional Office" },
    { districtCode: "MA-MA",   facilityName: "ICSA Madang Regional Office",       facilityType: "Regional Office" },
    { districtCode: "WP-NF",   facilityName: "ICSA Kiunga Border Office",         facilityType: "Border Post" },
    { districtCode: "WP-SF",   facilityName: "ICSA Daru Sea Port Office",         facilityType: "Sea Port Office" },
    { districtCode: "MO-LAE",  facilityName: "ICSA Lae Sea Port Office",          facilityType: "Sea Port Office" },
    { districtCode: "ENB-RA",  facilityName: "ICSA Rabaul Sea Port Office",       facilityType: "Sea Port Office" },
    { districtCode: "MB-AL",   facilityName: "ICSA Alotau Sea Port Office",       facilityType: "Sea Port Office" },
    { districtCode: "NI-KA",   facilityName: "ICSA Kavieng Sea Port Office",      facilityType: "Sea Port Office" },
  ];

  const facilityMap: Record<string, string> = {};
  for (const f of facilityData) {
    if (!districtMap[f.districtCode]) continue;
    const [row] = await db
      .insert(facilities)
      .values({ districtId: districtMap[f.districtCode]!, facilityName: f.facilityName, facilityType: f.facilityType })
      .onConflictDoNothing()
      .returning();
    if (row) facilityMap[f.facilityName] = row.id;
  }
  const allFacilities = await db.select().from(facilities);
  for (const f of allFacilities) facilityMap[f.facilityName] = f.id;
  console.log("Facilities seeded:", Object.keys(facilityMap).length);

  // --- ASSET CATEGORIES ---
  // ICSA-focused catalog (task #80). The legacy Medical Equipment and Heavy
  // Machinery categories were dropped; the auto-seeder prunes them from any
  // pre-existing dev DB.
  const categorySeeds: { name: string; code: string }[] = [
    { name: "ICT Equipment",                  code: "ICT" },
    { name: "Vehicles & Transport",           code: "VEH" },
    { name: "Office Furniture",               code: "OFF" },
    { name: "Buildings & Infrastructure",     code: "BLD" },
    { name: "Communication Equipment",        code: "COM" },
    { name: "Passport & Document Production", code: "PDP" },
    { name: "Biometric & Identity Capture",   code: "BIO" },
    { name: "Border Control Equipment",       code: "BRD" },
    { name: "Uniforms & Accoutrements",       code: "UNI" },
  ];

  const categoryMap: Record<string, string> = {};
  for (const { name, code } of categorySeeds) {
    const [row] = await db
      .insert(assetCategories)
      .values({ categoryName: name, categoryCode: code })
      .onConflictDoUpdate({
        target: assetCategories.categoryName,
        set: { categoryName: name, categoryCode: code },
      })
      .returning();
    categoryMap[name] = row.id;
  }
  console.log("Categories seeded:", Object.keys(categoryMap).length);

  // --- USERS ---
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);

  const userDataList = [
    { fullName: "Super Administrator", email: "superadmin@npams.gov.pg", roleName: "Super Admin", scope: {} },
    { fullName: "National Controller", email: "national@npams.gov.pg", roleName: "National Asset Controller", scope: {} },
    { fullName: "National Auditor", email: "auditor@npams.gov.pg", roleName: "National Auditor", scope: {} },
    { fullName: "Morobe Admin", email: "morobe.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "MO" } },
    { fullName: "Morobe Asset Officer", email: "morobe.officer@npams.gov.pg", roleName: "Provincial Asset Officer", scope: { provinceCode: "MO" } },
    { fullName: "Morobe Viewer", email: "morobe.viewer@npams.gov.pg", roleName: "Provincial Viewer", scope: { provinceCode: "MO" } },
    { fullName: "WHP Admin", email: "whp.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "WHP" } },
    { fullName: "NCD Admin", email: "ncd.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "NCD" } },
    // All 22 PNG Provincial Admins
    { fullName: "Bougainville Provincial Admin", email: "bougainville.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "AB" } },
    { fullName: "Central Province Admin", email: "central.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "CP" } },
    { fullName: "Chimbu Simbu Admin", email: "chimbu.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "CH" } },
    { fullName: "East New Britain Admin", email: "east-new-britain.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "ENB" } },
    { fullName: "East Sepik Admin", email: "east-sepik.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "ES" } },
    { fullName: "Eastern Highlands Admin", email: "eastern-highlands.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "EH" } },
    { fullName: "Enga Province Admin", email: "enga.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "EN" } },
    { fullName: "Gulf Province Admin", email: "gulf.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "GU" } },
    { fullName: "Hela Province Admin", email: "hela.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "HE" } },
    { fullName: "Jiwaka Province Admin", email: "jiwaka.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "JI" } },
    { fullName: "Madang Province Admin", email: "madang.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "MD" } },
    { fullName: "Manus Province Admin", email: "manus.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "MA" } },
    { fullName: "Milne Bay Admin", email: "milne-bay.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "MB" } },
    { fullName: "New Ireland Admin", email: "new-ireland.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "NI" } },
    { fullName: "Northern Oro Admin", email: "northern.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "NO" } },
    { fullName: "Sandaun West Sepik Admin", email: "sandaun.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "SA" } },
    { fullName: "Southern Highlands Admin", email: "southern-highlands.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "SH" } },
    { fullName: "West New Britain Admin", email: "west-new-britain.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "WNB" } },
    { fullName: "Western Province Admin", email: "western.admin@npams.gov.pg", roleName: "Provincial Admin", scope: { provinceCode: "WS" } },
  ];

  const userMap: Record<string, string> = {};
  for (const u of userDataList) {
    const existing = await db.select().from(users).where(eq(users.email, u.email)).limit(1);
    let userId: string;
    if (existing.length > 0) {
      userId = existing[0].id;
    } else {
      const [row] = await db
        .insert(users)
        .values({ fullName: u.fullName, email: u.email, passwordHash: hash })
        .returning();
      userId = row.id;
    }
    userMap[u.email] = userId;

    await db.insert(userRoles).values({ userId, roleId: roleMap[u.roleName]! }).onConflictDoNothing();
    await db
      .insert(userScope)
      .values({
        userId,
        provinceId: u.scope.provinceCode ? (provinceMap[u.scope.provinceCode] ?? null) : null,
      })
      .onConflictDoUpdate({ target: userScope.userId, set: { provinceId: u.scope.provinceCode ? (provinceMap[u.scope.provinceCode] ?? null) : null } });
  }
  console.log("Users seeded:", Object.keys(userMap).length);

  // --- ASSETS (30+ across provinces) ---
  const morobeAdminId = userMap["morobe.admin@npams.gov.pg"];
  // Legacy demo asset rows now anchor to ICSA presence facilities (the
  // hospital / provincial-HQ stand-ins were removed in task #76).
  const lahq = facilityMap["ICSA Lae Regional Office"];
  const mthq = facilityMap["ICSA Mt Hagen Regional Office"];
  const waigani = facilityMap["ICSA Jacksons Airport Immigration"];
  const angau = facilityMap["ICSA Lae Regional Office"];
  const pmgh = facilityMap["ICSA Jacksons Airport Immigration"];
  const mthGenHosp = facilityMap["ICSA Mt Hagen Regional Office"];

  const laeDistId = districtMap["MO-LAE"];
  const mthDistId = districtMap["WHP-MTH"];
  const ncdNeDistId = districtMap["NCD-NE"];

  const assetRows = [
    // Morobe assets
    { assetTag: "MO-ICT-001", assetName: "Dell Latitude 5430 Laptop", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "Dell", model: "Latitude 5430", purchaseCost: "3500", supplier: "Pacific ICT Solutions", purchaseDate: "2024-01-15" },
    { assetTag: "MO-ICT-002", assetName: "HP LaserJet Pro Printer", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "HP", model: "LaserJet Pro M404n", purchaseCost: "1200", supplier: "Pacific ICT Solutions" },
    { assetTag: "MO-VEH-001", assetName: "Toyota Land Cruiser 79", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "Toyota", model: "Land Cruiser LC79", purchaseCost: "85000", supplier: "Ela Motors PNG", purchaseDate: "2023-06-10" },
    { assetTag: "MO-VEH-002", assetName: "Mitsubishi Pajero Sport", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "fair" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "Mitsubishi", model: "Pajero Sport", purchaseCost: "65000", supplier: "Ela Motors PNG" },
    { assetTag: "MO-VEH-003", assetName: "Isuzu NPR Truck", categoryId: categoryMap["Vehicles & Transport"]!, status: "under_maintenance" as const, condition: "fair" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "Isuzu", model: "NPR 70", purchaseCost: "95000", supplier: "ASCO Motors" },
    { assetTag: "MO-FUR-001", assetName: "Executive Office Desk Set", categoryId: categoryMap["Office Furniture"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, purchaseCost: "2800", supplier: "Pacific Office Supplies" },
    { assetTag: "MO-FUR-002", assetName: "Conference Table (12-seater)", categoryId: categoryMap["Office Furniture"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, purchaseCost: "4500" },
    { assetTag: "MO-MED-001", assetName: "Passport Document Scanner (Lae)", categoryId: categoryMap["Passport & Document Production"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: angau, brand: "3M", model: "AT9000 Mk2", purchaseCost: "18000", supplier: "Datec PNG Ltd" },
    { assetTag: "MO-MED-002", assetName: "Biometric Fingerprint Reader (Lae)", categoryId: categoryMap["Biometric & Identity Capture"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: angau, brand: "IDEMIA", model: "MorphoSmart 1300", purchaseCost: "12000" },
    { assetTag: "MO-MED-003", assetName: "Border Stamp Set — Entry/Exit (Lae)", categoryId: categoryMap["Border Control Equipment"]!, status: "missing" as const, condition: "fair" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: angau, purchaseCost: "4500" },
    { assetTag: "MO-ICT-003", assetName: "Cisco Network Switch 24-Port", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "Cisco", purchaseCost: "3200" },

    // WHP assets
    { assetTag: "WHP-VEH-001", assetName: "Toyota Hilux Double Cab", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, brand: "Toyota", model: "Hilux DC", purchaseCost: "72000", supplier: "Ela Motors PNG", purchaseDate: "2024-03-01" },
    { assetTag: "WHP-VEH-002", assetName: "Ford Ranger 4WD", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, brand: "Ford", model: "Ranger XLT", purchaseCost: "68000" },
    { assetTag: "WHP-ICT-001", assetName: "HP Desktop Computer Set", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, brand: "HP", purchaseCost: "2800" },
    { assetTag: "WHP-ICT-002", assetName: "Projector Epson EB-X51", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "fair" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, brand: "Epson", model: "EB-X51", purchaseCost: "1500" },
    { assetTag: "WHP-MED-001", assetName: "Passport Document Scanner (Mt Hagen)", categoryId: categoryMap["Passport & Document Production"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthGenHosp, brand: "3M", model: "AT9000 Mk2", purchaseCost: "18000" },
    { assetTag: "WHP-MED-002", assetName: "Biometric Capture Workstation (Mt Hagen)", categoryId: categoryMap["Biometric & Identity Capture"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthGenHosp, brand: "IDEMIA", model: "MorphoWave", purchaseCost: "45000" },
    { assetTag: "WHP-FUR-001", assetName: "Reception Desk Set", categoryId: categoryMap["Office Furniture"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, purchaseCost: "3200" },
    { assetTag: "WHP-HM-001", assetName: "Backup Diesel Generator (Mt Hagen)", categoryId: categoryMap["Buildings & Infrastructure"]!, status: "active" as const, condition: "fair" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, brand: "Caterpillar", model: "DE110E0", purchaseCost: "65000" },

    // NCD assets
    { assetTag: "NCD-VEH-001", assetName: "Toyota Prado TX", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Toyota", model: "Land Cruiser Prado TX", purchaseCost: "92000", purchaseDate: "2024-07-15" },
    { assetTag: "NCD-VEH-002", assetName: "Mazda BT-50 Pick-up", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Mazda", model: "BT-50", purchaseCost: "62000" },
    { assetTag: "NCD-ICT-001", assetName: "Apple MacBook Pro 14-inch", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Apple", model: "MacBook Pro M3", purchaseCost: "5500" },
    { assetTag: "NCD-ICT-002", assetName: "Samsung 27-inch Monitor x5", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Samsung", purchaseCost: "3500" },
    { assetTag: "NCD-COM-001", assetName: "Motorola Walkie-Talkie Set (10 units)", categoryId: categoryMap["Communication Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Motorola", purchaseCost: "8500" },
    { assetTag: "NCD-MED-001", assetName: "Passport Personalisation Press (NCD)", categoryId: categoryMap["Passport & Document Production"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: pmgh, brand: "IDEMIA", model: "MorphoPass PP", purchaseCost: "180000", purchaseDate: "2023-01-01" },
    { assetTag: "NCD-MED-002", assetName: "Biometric Capture Workstation (NCD)", categoryId: categoryMap["Biometric & Identity Capture"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: pmgh, brand: "IDEMIA", model: "MorphoWave", purchaseCost: "45000" },
    { assetTag: "NCD-MED-003", assetName: "Border Stamp Set — Entry/Exit (NCD)", categoryId: categoryMap["Border Control Equipment"]!, status: "missing" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: pmgh, purchaseCost: "4500" },
    { assetTag: "NCD-FUR-001", assetName: "Boardroom Furniture Set", categoryId: categoryMap["Office Furniture"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, purchaseCost: "18000" },
    { assetTag: "NCD-HM-001", assetName: "Caterpillar Generator 250KVA", categoryId: categoryMap["Buildings & Infrastructure"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Caterpillar", model: "C9.3B", purchaseCost: "285000" },
    { assetTag: "NCD-COM-002", assetName: "Satellite Communication System", categoryId: categoryMap["Communication Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, purchaseCost: "45000" },
  ];

  let assetCount = 0;
  for (const a of assetRows) {
    await db
      .insert(assets)
      .values({ ...a, createdBy: morobeAdminId })
      .onConflictDoUpdate({ target: assets.assetTag, set: { assetName: a.assetName, status: a.status } });
    assetCount++;
  }
  console.log("Assets seeded:", assetCount);

  // --- NOTIFICATIONS ---
  const morobeAdminUserId = userMap["morobe.admin@npams.gov.pg"];
  await db.insert(notifications).values([
    { userId: morobeAdminUserId, title: "Welcome to NPAMS", message: "Your Morobe Provincial Asset Registry is now active. Start registering assets today.", readStatus: false },
    { userId: morobeAdminUserId, title: "Asset MO-MED-003 Reported Missing", message: "Border Stamp Set — Entry/Exit assigned to ICSA Lae Regional Office has been flagged as missing. Please investigate.", readStatus: false },
    { userId: userMap["whp.admin@npams.gov.pg"], title: "Welcome to NPAMS", message: "Your Western Highlands Provincial Asset Registry is now active.", readStatus: false },
    { userId: userMap["ncd.admin@npams.gov.pg"], title: "Welcome to NPAMS", message: "Your National Capital District Asset Registry is now active.", readStatus: false },
  ]).onConflictDoNothing();

  console.log("Notifications seeded.");
  console.log("\nSeed complete!");
  console.log("\nDemo credentials (all use password: Admin1234!):");
  console.log("  superadmin@npams.gov.pg            - Super Admin (national)");
  console.log("  national@npams.gov.pg              - National Asset Controller");
  console.log("  auditor@npams.gov.pg               - National Auditor");
  console.log("  morobe.admin@npams.gov.pg          - Provincial Admin (Morobe)");
  console.log("  morobe.officer@npams.gov.pg        - Provincial Asset Officer (Morobe)");
  console.log("  morobe.viewer@npams.gov.pg         - Provincial Viewer (Morobe)");
  console.log("  whp.admin@npams.gov.pg             - Provincial Admin (Western Highlands)");
  console.log("  ncd.admin@npams.gov.pg             - Provincial Admin (NCD)");
  console.log("  bougainville.admin@npams.gov.pg    - Provincial Admin (Bougainville)");
  console.log("  central.admin@npams.gov.pg         - Provincial Admin (Central)");
  console.log("  chimbu.admin@npams.gov.pg          - Provincial Admin (Chimbu/Simbu)");
  console.log("  east-new-britain.admin@npams.gov.pg - Provincial Admin (East New Britain)");
  console.log("  east-sepik.admin@npams.gov.pg      - Provincial Admin (East Sepik)");
  console.log("  eastern-highlands.admin@npams.gov.pg - Provincial Admin (Eastern Highlands)");
  console.log("  enga.admin@npams.gov.pg            - Provincial Admin (Enga)");
  console.log("  gulf.admin@npams.gov.pg            - Provincial Admin (Gulf)");
  console.log("  hela.admin@npams.gov.pg            - Provincial Admin (Hela)");
  console.log("  jiwaka.admin@npams.gov.pg          - Provincial Admin (Jiwaka)");
  console.log("  madang.admin@npams.gov.pg          - Provincial Admin (Madang)");
  console.log("  manus.admin@npams.gov.pg           - Provincial Admin (Manus)");
  console.log("  milne-bay.admin@npams.gov.pg       - Provincial Admin (Milne Bay)");
  console.log("  new-ireland.admin@npams.gov.pg     - Provincial Admin (New Ireland)");
  console.log("  northern.admin@npams.gov.pg        - Provincial Admin (Northern/Oro)");
  console.log("  sandaun.admin@npams.gov.pg         - Provincial Admin (Sandaun/West Sepik)");
  console.log("  southern-highlands.admin@npams.gov.pg - Provincial Admin (Southern Highlands)");
  console.log("  west-new-britain.admin@npams.gov.pg - Provincial Admin (West New Britain)");
  console.log("  western.admin@npams.gov.pg         - Provincial Admin (Western)");
}

main()
  .catch(console.error)
  .finally(() => pool.end());
