import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  db,
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
import { logger } from "./logger";

const HASH_ROUNDS = 10;
const DEFAULT_PASSWORD = "Admin1234!";

export async function autoSeedIfEmpty(): Promise<void> {
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) {
    logger.info("Auto-seed: database already seeded, skipping");
    return;
  }

  logger.info("Auto-seed: empty database detected — seeding now...");

  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Papua New Guinea Government", code: "PNG" })
    .onConflictDoUpdate({ target: tenants.code, set: { name: "Papua New Guinea Government" } })
    .returning();

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
  logger.info({ count: Object.keys(roleMap).length }, "Auto-seed: roles done");

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
  logger.info({ count: Object.keys(provinceMap).length }, "Auto-seed: provinces done");

  const districtData = [
    { provinceCode: "MO",  districtName: "Lae District",              districtCode: "MO-LAE" },
    { provinceCode: "MO",  districtName: "Huon Gulf District",        districtCode: "MO-HG" },
    { provinceCode: "MO",  districtName: "Markham District",          districtCode: "MO-MK" },
    { provinceCode: "MO",  districtName: "Menyamya District",         districtCode: "MO-ME" },
    { provinceCode: "WHP", districtName: "Mt Hagen District",         districtCode: "WHP-MTH" },
    { provinceCode: "WHP", districtName: "Dei District",              districtCode: "WHP-DEI" },
    { provinceCode: "WHP", districtName: "Mul-Baiyer District",       districtCode: "WHP-MUL" },
    { provinceCode: "NCD", districtName: "Moresby North-East District", districtCode: "NCD-NE" },
    { provinceCode: "NCD", districtName: "Moresby North-West District", districtCode: "NCD-NW" },
    { provinceCode: "NCD", districtName: "Moresby South District",    districtCode: "NCD-SO" },
    { provinceCode: "CP",  districtName: "Abau District",             districtCode: "CP-AB" },
    { provinceCode: "CP",  districtName: "Goilala District",          districtCode: "CP-GO" },
    { provinceCode: "CP",  districtName: "Kairuku District",          districtCode: "CP-KA" },
    { provinceCode: "CP",  districtName: "Hiri District",             districtCode: "CP-HI" },
    { provinceCode: "CP",  districtName: "Rigo District",             districtCode: "CP-RI" },
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
  const allDistricts = await db.select().from(districts);
  for (const d of allDistricts) if (d.districtCode) districtMap[d.districtCode] = d.id;
  logger.info({ count: Object.keys(districtMap).length }, "Auto-seed: districts done");

  const facilityData = [
    { districtCode: "MO-LAE", facilityName: "Lae Provincial Headquarters",    facilityType: "Government Office" },
    { districtCode: "MO-LAE", facilityName: "Angau Memorial Hospital",         facilityType: "Hospital" },
    { districtCode: "MO-LAE", facilityName: "Lae City Authority Office",       facilityType: "Government Office" },
    { districtCode: "MO-HG",  facilityName: "Huon Gulf District Office",       facilityType: "Government Office" },
    { districtCode: "WHP-MTH", facilityName: "Mt Hagen Provincial Headquarters", facilityType: "Government Office" },
    { districtCode: "WHP-MTH", facilityName: "Mt Hagen General Hospital",      facilityType: "Hospital" },
    { districtCode: "WHP-DEI", facilityName: "Dei District Administration",    facilityType: "Government Office" },
    { districtCode: "NCD-NE", facilityName: "Waigani Government Precinct",     facilityType: "Government Office" },
    { districtCode: "NCD-NE", facilityName: "Port Moresby General Hospital",   facilityType: "Hospital" },
    { districtCode: "NCD-SO", facilityName: "NCD City Hall",                   facilityType: "Government Office" },
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
  logger.info({ count: Object.keys(facilityMap).length }, "Auto-seed: facilities done");

  const categoryNames = ["ICT Equipment", "Vehicles & Transport", "Office Furniture", "Medical Equipment", "Heavy Machinery", "Buildings & Infrastructure", "Communication Equipment"];
  const categoryMap: Record<string, string> = {};
  for (const name of categoryNames) {
    const [row] = await db
      .insert(assetCategories)
      .values({ categoryName: name })
      .onConflictDoUpdate({ target: assetCategories.categoryName, set: { categoryName: name } })
      .returning();
    categoryMap[name] = row.id;
  }

  const hash = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);

  const userDataList = [
    { fullName: "Super Administrator",           email: "superadmin@npams.gov.pg",              roleName: "Super Admin",              scope: {} },
    { fullName: "National Controller",           email: "national@npams.gov.pg",                roleName: "National Asset Controller", scope: {} },
    { fullName: "National Auditor",              email: "auditor@npams.gov.pg",                 roleName: "National Auditor",          scope: {} },
    { fullName: "Morobe Admin",                  email: "morobe.admin@npams.gov.pg",            roleName: "Provincial Admin",          scope: { provinceCode: "MO" } },
    { fullName: "Morobe Asset Officer",          email: "morobe.officer@npams.gov.pg",          roleName: "Provincial Asset Officer",  scope: { provinceCode: "MO" } },
    { fullName: "Morobe Viewer",                 email: "morobe.viewer@npams.gov.pg",           roleName: "Provincial Viewer",         scope: { provinceCode: "MO" } },
    { fullName: "WHP Admin",                     email: "whp.admin@npams.gov.pg",               roleName: "Provincial Admin",          scope: { provinceCode: "WHP" } },
    { fullName: "NCD Admin",                     email: "ncd.admin@npams.gov.pg",               roleName: "Provincial Admin",          scope: { provinceCode: "NCD" } },
    { fullName: "Bougainville Provincial Admin", email: "bougainville.admin@npams.gov.pg",      roleName: "Provincial Admin",          scope: { provinceCode: "AB" } },
    { fullName: "Central Province Admin",        email: "central.admin@npams.gov.pg",           roleName: "Provincial Admin",          scope: { provinceCode: "CP" } },
    { fullName: "Chimbu Simbu Admin",            email: "chimbu.admin@npams.gov.pg",            roleName: "Provincial Admin",          scope: { provinceCode: "CH" } },
    { fullName: "East New Britain Admin",        email: "east-new-britain.admin@npams.gov.pg",  roleName: "Provincial Admin",          scope: { provinceCode: "ENB" } },
    { fullName: "East Sepik Admin",              email: "east-sepik.admin@npams.gov.pg",        roleName: "Provincial Admin",          scope: { provinceCode: "ES" } },
    { fullName: "Eastern Highlands Admin",       email: "eastern-highlands.admin@npams.gov.pg", roleName: "Provincial Admin",          scope: { provinceCode: "EH" } },
    { fullName: "Enga Province Admin",           email: "enga.admin@npams.gov.pg",              roleName: "Provincial Admin",          scope: { provinceCode: "EN" } },
    { fullName: "Gulf Province Admin",           email: "gulf.admin@npams.gov.pg",              roleName: "Provincial Admin",          scope: { provinceCode: "GU" } },
    { fullName: "Hela Province Admin",           email: "hela.admin@npams.gov.pg",              roleName: "Provincial Admin",          scope: { provinceCode: "HE" } },
    { fullName: "Jiwaka Province Admin",         email: "jiwaka.admin@npams.gov.pg",            roleName: "Provincial Admin",          scope: { provinceCode: "JI" } },
    { fullName: "Madang Province Admin",         email: "madang.admin@npams.gov.pg",            roleName: "Provincial Admin",          scope: { provinceCode: "MD" } },
    { fullName: "Manus Province Admin",          email: "manus.admin@npams.gov.pg",             roleName: "Provincial Admin",          scope: { provinceCode: "MA" } },
    { fullName: "Milne Bay Admin",               email: "milne-bay.admin@npams.gov.pg",         roleName: "Provincial Admin",          scope: { provinceCode: "MB" } },
    { fullName: "New Ireland Admin",             email: "new-ireland.admin@npams.gov.pg",       roleName: "Provincial Admin",          scope: { provinceCode: "NI" } },
    { fullName: "Northern Oro Admin",            email: "northern.admin@npams.gov.pg",          roleName: "Provincial Admin",          scope: { provinceCode: "NO" } },
    { fullName: "Sandaun West Sepik Admin",      email: "sandaun.admin@npams.gov.pg",           roleName: "Provincial Admin",          scope: { provinceCode: "SA" } },
    { fullName: "Southern Highlands Admin",      email: "southern-highlands.admin@npams.gov.pg",roleName: "Provincial Admin",          scope: { provinceCode: "SH" } },
    { fullName: "West New Britain Admin",        email: "west-new-britain.admin@npams.gov.pg",  roleName: "Provincial Admin",          scope: { provinceCode: "WNB" } },
    { fullName: "Western Province Admin",        email: "western.admin@npams.gov.pg",           roleName: "Provincial Admin",          scope: { provinceCode: "WS" } },
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
      .values({ userId, provinceId: (u.scope as { provinceCode?: string }).provinceCode ? (provinceMap[(u.scope as { provinceCode: string }).provinceCode] ?? null) : null })
      .onConflictDoUpdate({ target: userScope.userId, set: { provinceId: (u.scope as { provinceCode?: string }).provinceCode ? (provinceMap[(u.scope as { provinceCode: string }).provinceCode] ?? null) : null } });
  }
  logger.info({ count: Object.keys(userMap).length }, "Auto-seed: users done");

  const morobeAdminId = userMap["morobe.admin@npams.gov.pg"];
  const lahq = facilityMap["Lae Provincial Headquarters"];
  const mthq = facilityMap["Mt Hagen Provincial Headquarters"];
  const waigani = facilityMap["Waigani Government Precinct"];
  const angau = facilityMap["Angau Memorial Hospital"];
  const pmgh = facilityMap["Port Moresby General Hospital"];
  const mthGenHosp = facilityMap["Mt Hagen General Hospital"];
  const laeDistId = districtMap["MO-LAE"];
  const mthDistId = districtMap["WHP-MTH"];
  const ncdNeDistId = districtMap["NCD-NE"];

  const assetRows = [
    { assetTag: "MO-ICT-001", assetName: "Dell Latitude 5430 Laptop",           categoryId: categoryMap["ICT Equipment"]!,        status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["MO"]!,  districtId: laeDistId,    facilityId: lahq,       brand: "Dell",       model: "Latitude 5430",          purchaseCost: "3500",    supplier: "Pacific ICT Solutions", purchaseDate: "2024-01-15" },
    { assetTag: "MO-ICT-002", assetName: "HP LaserJet Pro Printer",              categoryId: categoryMap["ICT Equipment"]!,        status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId,    facilityId: lahq,       brand: "HP",         model: "LaserJet Pro M404n",     purchaseCost: "1200",    supplier: "Pacific ICT Solutions" },
    { assetTag: "MO-VEH-001", assetName: "Toyota Land Cruiser 79",               categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId,    facilityId: lahq,       brand: "Toyota",     model: "Land Cruiser LC79",      purchaseCost: "85000",   supplier: "Ela Motors PNG",        purchaseDate: "2023-06-10" },
    { assetTag: "MO-VEH-002", assetName: "Mitsubishi Pajero Sport",              categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const,            condition: "fair" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId,    facilityId: lahq,       brand: "Mitsubishi", model: "Pajero Sport",           purchaseCost: "65000",   supplier: "Ela Motors PNG" },
    { assetTag: "MO-VEH-003", assetName: "Isuzu NPR Truck",                      categoryId: categoryMap["Vehicles & Transport"]!, status: "under_maintenance" as const, condition: "fair" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId,    facilityId: lahq,       brand: "Isuzu",      model: "NPR 70",                 purchaseCost: "95000",   supplier: "ASCO Motors" },
    { assetTag: "MO-FUR-001", assetName: "Executive Office Desk Set",            categoryId: categoryMap["Office Furniture"]!,     status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId,    facilityId: lahq,       purchaseCost: "2800",    supplier: "Pacific Office Supplies" },
    { assetTag: "MO-FUR-002", assetName: "Conference Table (12-seater)",         categoryId: categoryMap["Office Furniture"]!,     status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["MO"]!,  districtId: laeDistId,    facilityId: lahq,       purchaseCost: "4500" },
    { assetTag: "MO-MED-001", assetName: "Digital X-Ray Machine",                categoryId: categoryMap["Medical Equipment"]!,    status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId,    facilityId: angau,      brand: "Siemens",    model: "MULTIX Select DR",       purchaseCost: "180000",  supplier: "Pacific Medical Supplies" },
    { assetTag: "MO-MED-002", assetName: "ECG Monitor",                          categoryId: categoryMap["Medical Equipment"]!,    status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["MO"]!,  districtId: laeDistId,    facilityId: angau,      brand: "Philips",    purchaseCost: "12000" },
    { assetTag: "MO-MED-003", assetName: "Portable Ultrasound Machine",          categoryId: categoryMap["Medical Equipment"]!,    status: "missing" as const,           condition: "fair" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId,    facilityId: angau,      purchaseCost: "45000" },
    { assetTag: "MO-ICT-003", assetName: "Cisco Network Switch 24-Port",         categoryId: categoryMap["ICT Equipment"]!,        status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId,    facilityId: lahq,       brand: "Cisco",      purchaseCost: "3200" },
    { assetTag: "WHP-VEH-001", assetName: "Toyota Hilux Double Cab",             categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId,    facilityId: mthq,       brand: "Toyota",     model: "Hilux DC",               purchaseCost: "72000",   supplier: "Ela Motors PNG",        purchaseDate: "2024-03-01" },
    { assetTag: "WHP-VEH-002", assetName: "Ford Ranger 4WD",                     categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId,    facilityId: mthq,       brand: "Ford",       model: "Ranger XLT",             purchaseCost: "68000" },
    { assetTag: "WHP-ICT-001", assetName: "HP Desktop Computer Set",             categoryId: categoryMap["ICT Equipment"]!,        status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId,    facilityId: mthq,       brand: "HP",         purchaseCost: "2800" },
    { assetTag: "WHP-ICT-002", assetName: "Projector Epson EB-X51",              categoryId: categoryMap["ICT Equipment"]!,        status: "active" as const,            condition: "fair" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId,    facilityId: mthq,       brand: "Epson",      model: "EB-X51",                 purchaseCost: "1500" },
    { assetTag: "WHP-MED-001", assetName: "Patient Monitoring System",           categoryId: categoryMap["Medical Equipment"]!,    status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId,    facilityId: mthGenHosp, purchaseCost: "28000" },
    { assetTag: "WHP-MED-002", assetName: "Autoclave Sterilizer",                categoryId: categoryMap["Medical Equipment"]!,    status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId,    facilityId: mthGenHosp, purchaseCost: "15000" },
    { assetTag: "WHP-FUR-001", assetName: "Reception Desk Set",                  categoryId: categoryMap["Office Furniture"]!,     status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId,    facilityId: mthq,       purchaseCost: "3200" },
    { assetTag: "WHP-HM-001",  assetName: "John Deere Tractor",                  categoryId: categoryMap["Heavy Machinery"]!,      status: "active" as const,            condition: "fair" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId,    facilityId: mthq,       brand: "John Deere", model: "3038E",                  purchaseCost: "65000" },
    { assetTag: "NCD-VEH-001", assetName: "Toyota Prado TX",                     categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId,  facilityId: waigani,    brand: "Toyota",     model: "Land Cruiser Prado TX",  purchaseCost: "92000",   purchaseDate: "2024-07-15" },
    { assetTag: "NCD-VEH-002", assetName: "Mazda BT-50 Pick-up",                 categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId,  facilityId: waigani,    brand: "Mazda",      model: "BT-50",                  purchaseCost: "62000" },
    { assetTag: "NCD-ICT-001", assetName: "Apple MacBook Pro 14-inch",           categoryId: categoryMap["ICT Equipment"]!,        status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId,  facilityId: waigani,    brand: "Apple",      model: "MacBook Pro M3",         purchaseCost: "5500" },
    { assetTag: "NCD-ICT-002", assetName: "Samsung 27-inch Monitor x5",          categoryId: categoryMap["ICT Equipment"]!,        status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId,  facilityId: waigani,    brand: "Samsung",    purchaseCost: "3500" },
    { assetTag: "NCD-COM-001", assetName: "Motorola Walkie-Talkie Set (10 units)",categoryId: categoryMap["Communication Equipment"]!, status: "active" as const,         condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId,  facilityId: waigani,    brand: "Motorola",   purchaseCost: "8500" },
    { assetTag: "NCD-MED-001", assetName: "MRI Scanner",                         categoryId: categoryMap["Medical Equipment"]!,    status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId,  facilityId: pmgh,       brand: "GE Healthcare", purchaseCost: "2500000", purchaseDate: "2023-01-01" },
    { assetTag: "NCD-MED-002", assetName: "Ventilator ICU Pro",                  categoryId: categoryMap["Medical Equipment"]!,    status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId,  facilityId: pmgh,       brand: "Medtronic",  purchaseCost: "95000" },
    { assetTag: "NCD-MED-003", assetName: "Portable Defibrillator",              categoryId: categoryMap["Medical Equipment"]!,    status: "missing" as const,           condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId,  facilityId: pmgh,       purchaseCost: "12000" },
    { assetTag: "NCD-FUR-001", assetName: "Boardroom Furniture Set",             categoryId: categoryMap["Office Furniture"]!,     status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId,  facilityId: waigani,    purchaseCost: "18000" },
    { assetTag: "NCD-HM-001",  assetName: "Caterpillar Generator 250KVA",        categoryId: categoryMap["Heavy Machinery"]!,      status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId,  facilityId: waigani,    brand: "Caterpillar", model: "C9.3B",                 purchaseCost: "285000" },
    { assetTag: "NCD-COM-002", assetName: "Satellite Communication System",      categoryId: categoryMap["Communication Equipment"]!, status: "active" as const,         condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId,  facilityId: waigani,    purchaseCost: "45000" },
  ];

  for (const a of assetRows) {
    await db
      .insert(assets)
      .values({ ...a, createdBy: morobeAdminId })
      .onConflictDoUpdate({ target: assets.assetTag, set: { assetName: a.assetName, status: a.status } });
  }
  logger.info({ count: assetRows.length }, "Auto-seed: assets done");

  await db.insert(notifications).values([
    { userId: morobeAdminId, title: "Welcome to NPAMS", message: "Your Morobe Provincial Asset Registry is now active. Start registering assets today.", readStatus: false },
    { userId: morobeAdminId, title: "Asset MO-MED-003 Reported Missing", message: "Portable Ultrasound Machine at Angau Hospital has been flagged as missing. Please investigate.", readStatus: false },
    { userId: userMap["whp.admin@npams.gov.pg"], title: "Welcome to NPAMS", message: "Your Western Highlands Provincial Asset Registry is now active.", readStatus: false },
    { userId: userMap["ncd.admin@npams.gov.pg"], title: "Welcome to NPAMS", message: "Your National Capital District Asset Registry is now active.", readStatus: false },
  ]).onConflictDoNothing();

  logger.info("Auto-seed: complete! All demo accounts use password: Admin1234!");
}
