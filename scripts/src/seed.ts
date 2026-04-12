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

  // --- PROVINCES (All 22 PNG Provinces with Wikipedia flag URLs) ---
  const provinceData = [
    {
      provinceCode: "CP",
      provinceName: "Central Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Flag_of_Central_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Central_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#1E40AF",
    },
    {
      provinceCode: "CH",
      provinceName: "Chimbu (Simbu) Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Flag_of_Simbu_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Simbu_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#B91C1C",
    },
    {
      provinceCode: "EH",
      provinceName: "Eastern Highlands Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Flag_of_Eastern_Highlands_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Eastern_Highlands_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#065F46",
    },
    {
      provinceCode: "ENB",
      provinceName: "East New Britain Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Flag_of_East_New_Britain_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_East_New_Britain_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#7C3AED",
    },
    {
      provinceCode: "ES",
      provinceName: "East Sepik Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Flag_of_East_Sepik_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_East_Sepik_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#0369A1",
    },
    {
      provinceCode: "EN",
      provinceName: "Enga Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Flag_of_Enga_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Enga_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#CA8A04",
    },
    {
      provinceCode: "GU",
      provinceName: "Gulf Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Flag_of_Gulf_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Gulf_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#0F766E",
    },
    {
      provinceCode: "HE",
      provinceName: "Hela Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Flag_of_Hela_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Hela_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#92400E",
    },
    {
      provinceCode: "JI",
      provinceName: "Jiwaka Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Flag_of_Jiwaka_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Jiwaka_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#1D4ED8",
    },
    {
      provinceCode: "MA",
      provinceName: "Manus Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Flag_of_Manus_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Manus_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#0284C7",
    },
    {
      provinceCode: "MB",
      provinceName: "Milne Bay Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Flag_of_Milne_Bay_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Milne_Bay_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#047857",
    },
    {
      provinceCode: "MO",
      provinceName: "Morobe Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Flag_of_Morobe_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Morobe_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#1E3A8A",
    },
    {
      provinceCode: "NCD",
      provinceName: "National Capital District",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Flag_of_National_Capital_District%2C_Papua_New_Guinea.svg/200px-Flag_of_National_Capital_District%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#DC2626",
    },
    {
      provinceCode: "NI",
      provinceName: "New Ireland Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Flag_of_New_Ireland_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_New_Ireland_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#9D174D",
    },
    {
      provinceCode: "NO",
      provinceName: "Northern (Oro) Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Flag_of_Oro_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Oro_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#166534",
    },
    {
      provinceCode: "AB",
      provinceName: "Autonomous Region of Bougainville",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Flag_of_the_Autonomous_Region_of_Bougainville.svg/200px-Flag_of_the_Autonomous_Region_of_Bougainville.svg.png",
      themeAccentColor: "#1E3A5F",
    },
    {
      provinceCode: "SA",
      provinceName: "Sandaun (West Sepik) Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Flag_of_Sandaun_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Sandaun_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#6D28D9",
    },
    {
      provinceCode: "SH",
      provinceName: "Southern Highlands Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Flag_of_Southern_Highlands_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Southern_Highlands_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#B45309",
    },
    {
      provinceCode: "WS",
      provinceName: "Western Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Flag_of_Western_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Western_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#047857",
    },
    {
      provinceCode: "WHP",
      provinceName: "Western Highlands Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Flag_of_Western_Highlands_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Western_Highlands_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#7C2D12",
    },
    {
      provinceCode: "WNB",
      provinceName: "West New Britain Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Flag_of_West_New_Britain_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_West_New_Britain_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#064E3B",
    },
    {
      provinceCode: "MD",
      provinceName: "Madang Province",
      flagUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Flag_of_Madang_Province%2C_Papua_New_Guinea.svg/200px-Flag_of_Madang_Province%2C_Papua_New_Guinea.svg.png",
      themeAccentColor: "#312E81",
    },
  ];

  const provinceMap: Record<string, string> = {};
  for (const p of provinceData) {
    const [row] = await db
      .insert(provinces)
      .values({ ...p, tenantId: tenant.id })
      .onConflictDoUpdate({ target: provinces.provinceCode, set: { provinceName: p.provinceName, flagUrl: p.flagUrl, themeAccentColor: p.themeAccentColor } })
      .returning();
    provinceMap[p.provinceCode] = row.id;
  }
  console.log("Provinces seeded:", Object.keys(provinceMap).length);

  // --- DISTRICTS for Morobe, WHP, NCD ---
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
  const facilityData = [
    { districtCode: "MO-LAE", facilityName: "Lae Provincial Headquarters", facilityType: "Government Office" },
    { districtCode: "MO-LAE", facilityName: "Angau Memorial Hospital", facilityType: "Hospital" },
    { districtCode: "MO-LAE", facilityName: "Lae City Authority Office", facilityType: "Government Office" },
    { districtCode: "MO-HG", facilityName: "Huon Gulf District Office", facilityType: "Government Office" },
    { districtCode: "WHP-MTH", facilityName: "Mt Hagen Provincial Headquarters", facilityType: "Government Office" },
    { districtCode: "WHP-MTH", facilityName: "Mt Hagen General Hospital", facilityType: "Hospital" },
    { districtCode: "WHP-DEI", facilityName: "Dei District Administration", facilityType: "Government Office" },
    { districtCode: "NCD-NE", facilityName: "Waigani Government Precinct", facilityType: "Government Office" },
    { districtCode: "NCD-NE", facilityName: "Port Moresby General Hospital", facilityType: "Hospital" },
    { districtCode: "NCD-SO", facilityName: "NCD City Hall", facilityType: "Government Office" },
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
  const categoryNames = [
    "ICT Equipment",
    "Vehicles & Transport",
    "Office Furniture",
    "Medical Equipment",
    "Heavy Machinery",
    "Buildings & Infrastructure",
    "Communication Equipment",
  ];

  const categoryMap: Record<string, string> = {};
  for (const name of categoryNames) {
    const [row] = await db
      .insert(assetCategories)
      .values({ categoryName: name })
      .onConflictDoUpdate({ target: assetCategories.categoryName, set: { categoryName: name } })
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
    // Morobe assets
    { assetTag: "MO-ICT-001", assetName: "Dell Latitude 5430 Laptop", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "Dell", model: "Latitude 5430", purchaseCost: "3500", supplier: "Pacific ICT Solutions", purchaseDate: "2024-01-15" },
    { assetTag: "MO-ICT-002", assetName: "HP LaserJet Pro Printer", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "HP", model: "LaserJet Pro M404n", purchaseCost: "1200", supplier: "Pacific ICT Solutions" },
    { assetTag: "MO-VEH-001", assetName: "Toyota Land Cruiser 79", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "Toyota", model: "Land Cruiser LC79", purchaseCost: "85000", supplier: "Ela Motors PNG", purchaseDate: "2023-06-10" },
    { assetTag: "MO-VEH-002", assetName: "Mitsubishi Pajero Sport", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "fair" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "Mitsubishi", model: "Pajero Sport", purchaseCost: "65000", supplier: "Ela Motors PNG" },
    { assetTag: "MO-VEH-003", assetName: "Isuzu NPR Truck", categoryId: categoryMap["Vehicles & Transport"]!, status: "under_maintenance" as const, condition: "fair" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "Isuzu", model: "NPR 70", purchaseCost: "95000", supplier: "ASCO Motors" },
    { assetTag: "MO-FUR-001", assetName: "Executive Office Desk Set", categoryId: categoryMap["Office Furniture"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, purchaseCost: "2800", supplier: "Pacific Office Supplies" },
    { assetTag: "MO-FUR-002", assetName: "Conference Table (12-seater)", categoryId: categoryMap["Office Furniture"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, purchaseCost: "4500" },
    { assetTag: "MO-MED-001", assetName: "Digital X-Ray Machine", categoryId: categoryMap["Medical Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: angau, brand: "Siemens", model: "MULTIX Select DR", purchaseCost: "180000", supplier: "Pacific Medical Supplies" },
    { assetTag: "MO-MED-002", assetName: "ECG Monitor", categoryId: categoryMap["Medical Equipment"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: angau, brand: "Philips", purchaseCost: "12000" },
    { assetTag: "MO-MED-003", assetName: "Portable Ultrasound Machine", categoryId: categoryMap["Medical Equipment"]!, status: "missing" as const, condition: "fair" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: angau, purchaseCost: "45000" },
    { assetTag: "MO-ICT-003", assetName: "Cisco Network Switch 24-Port", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["MO"]!, districtId: laeDistId, facilityId: lahq, brand: "Cisco", purchaseCost: "3200" },

    // WHP assets
    { assetTag: "WHP-VEH-001", assetName: "Toyota Hilux Double Cab", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, brand: "Toyota", model: "Hilux DC", purchaseCost: "72000", supplier: "Ela Motors PNG", purchaseDate: "2024-03-01" },
    { assetTag: "WHP-VEH-002", assetName: "Ford Ranger 4WD", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, brand: "Ford", model: "Ranger XLT", purchaseCost: "68000" },
    { assetTag: "WHP-ICT-001", assetName: "HP Desktop Computer Set", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, brand: "HP", purchaseCost: "2800" },
    { assetTag: "WHP-ICT-002", assetName: "Projector Epson EB-X51", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "fair" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, brand: "Epson", model: "EB-X51", purchaseCost: "1500" },
    { assetTag: "WHP-MED-001", assetName: "Patient Monitoring System", categoryId: categoryMap["Medical Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthGenHosp, purchaseCost: "28000" },
    { assetTag: "WHP-MED-002", assetName: "Autoclave Sterilizer", categoryId: categoryMap["Medical Equipment"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthGenHosp, purchaseCost: "15000" },
    { assetTag: "WHP-FUR-001", assetName: "Reception Desk Set", categoryId: categoryMap["Office Furniture"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, purchaseCost: "3200" },
    { assetTag: "WHP-HM-001", assetName: "John Deere Tractor", categoryId: categoryMap["Heavy Machinery"]!, status: "active" as const, condition: "fair" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq, brand: "John Deere", model: "3038E", purchaseCost: "65000" },

    // NCD assets
    { assetTag: "NCD-VEH-001", assetName: "Toyota Prado TX", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Toyota", model: "Land Cruiser Prado TX", purchaseCost: "92000", purchaseDate: "2024-07-15" },
    { assetTag: "NCD-VEH-002", assetName: "Mazda BT-50 Pick-up", categoryId: categoryMap["Vehicles & Transport"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Mazda", model: "BT-50", purchaseCost: "62000" },
    { assetTag: "NCD-ICT-001", assetName: "Apple MacBook Pro 14-inch", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Apple", model: "MacBook Pro M3", purchaseCost: "5500" },
    { assetTag: "NCD-ICT-002", assetName: "Samsung 27-inch Monitor x5", categoryId: categoryMap["ICT Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Samsung", purchaseCost: "3500" },
    { assetTag: "NCD-COM-001", assetName: "Motorola Walkie-Talkie Set (10 units)", categoryId: categoryMap["Communication Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Motorola", purchaseCost: "8500" },
    { assetTag: "NCD-MED-001", assetName: "MRI Scanner", categoryId: categoryMap["Medical Equipment"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: pmgh, brand: "GE Healthcare", purchaseCost: "2500000", purchaseDate: "2023-01-01" },
    { assetTag: "NCD-MED-002", assetName: "Ventilator ICU Pro", categoryId: categoryMap["Medical Equipment"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: pmgh, brand: "Medtronic", purchaseCost: "95000" },
    { assetTag: "NCD-MED-003", assetName: "Portable Defibrillator", categoryId: categoryMap["Medical Equipment"]!, status: "missing" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: pmgh, purchaseCost: "12000" },
    { assetTag: "NCD-FUR-001", assetName: "Boardroom Furniture Set", categoryId: categoryMap["Office Furniture"]!, status: "active" as const, condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, purchaseCost: "18000" },
    { assetTag: "NCD-HM-001", assetName: "Caterpillar Generator 250KVA", categoryId: categoryMap["Heavy Machinery"]!, status: "active" as const, condition: "good" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNeDistId, facilityId: waigani, brand: "Caterpillar", model: "C9.3B", purchaseCost: "285000" },
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
    { userId: morobeAdminUserId, title: "Asset MO-MED-003 Reported Missing", message: "Portable Ultrasound Machine at Angau Hospital has been flagged as missing. Please investigate.", readStatus: false },
    { userId: userMap["whp.admin@npams.gov.pg"], title: "Welcome to NPAMS", message: "Your Western Highlands Provincial Asset Registry is now active.", readStatus: false },
    { userId: userMap["ncd.admin@npams.gov.pg"], title: "Welcome to NPAMS", message: "Your National Capital District Asset Registry is now active.", readStatus: false },
  ]).onConflictDoNothing();

  console.log("Notifications seeded.");
  console.log("\nSeed complete!");
  console.log("\nDemo credentials (all use password: Admin1234!):");
  console.log("  superadmin@npams.gov.pg - Super Admin (national)");
  console.log("  national@npams.gov.pg   - National Asset Controller");
  console.log("  morobe.admin@npams.gov.pg - Provincial Admin (Morobe)");
  console.log("  whp.admin@npams.gov.pg  - Provincial Admin (Western Highlands)");
  console.log("  ncd.admin@npams.gov.pg  - Provincial Admin (NCD)");
}

main()
  .catch(console.error)
  .finally(() => pool.end());
