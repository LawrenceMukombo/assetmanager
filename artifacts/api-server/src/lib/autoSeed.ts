import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  db,
  tenants,
  provinces,
  agencies,
  districts,
  facilities,
  roles,
  users,
  userRoles,
  userScope,
  assetCategories,
  assets,
  notifications,
  stockItems,
  stockBalances,
} from "@workspace/db";
import { logger } from "./logger";

const HASH_ROUNDS = 10;
const DEFAULT_PASSWORD = "Admin1234!";

function facilityPrefix(districtName: string): string {
  // Strip trailing " District" and derive the short prefix used for hospital/school names
  const base = districtName.replace(/ District$/, "");
  // Handle "Mt X" – keep two tokens
  if (base.startsWith("Mt ")) return base.split(" ").slice(0, 2).join(" ");
  // Split on first space or hyphen and take the first segment
  return base.split(/[\s-]/)[0]!;
}

export async function autoSeedIfEmpty(): Promise<void> {
  const usersExist = (await db.select().from(users).limit(1)).length > 0;
  const agenciesExist = (await db.select().from(agencies).limit(1)).length > 0;

  if (!usersExist) {
    logger.info("Auto-seed: empty database detected — seeding all reference data...");
    await seedInitialData();
  }

  if (!agenciesExist) {
    logger.info("Auto-seed: agencies missing — seeding agencies and agency users...");
    await seedAgencies();
  }

  // Idempotent — these check for existing rows themselves
  await seedAgencyAssets();
  await seedAgencyStock();

  if (usersExist && agenciesExist) {
    logger.info("Auto-seed: idempotent top-up complete");
  } else {
    logger.info("Auto-seed: complete. Default password: Admin1234!");
  }
}

async function seedAgencyAssets(): Promise<void> {
  const [ica] = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.agencyCode, "PNGICA")).limit(1);
  if (!ica) return;

  const existing = await db.select({ id: assets.id }).from(assets).where(eq(assets.agencyId, ica.id)).limit(1);
  if (existing.length > 0) return;

  const cats = await db.select({ id: assetCategories.id, categoryName: assetCategories.categoryName }).from(assetCategories);
  const catMap: Record<string, string> = {};
  for (const c of cats) catMap[c.categoryName] = c.id;

  type SeedAsset = {
    assetTag: string; assetName: string; categoryName: string;
    serialNumber?: string; brand?: string; model?: string;
    purchaseDate: string; purchaseCost: string; supplier: string;
    usefulLifeYears: number; status: "active" | "missing" | "under_maintenance" | "disposed" | "transferred";
    condition: "excellent" | "good" | "fair" | "poor"; salvageValue: string; notes: string;
  };
  const icaAssets: SeedAsset[] = [
    // Buildings & Infrastructure
    { assetTag: "PNGICA-BLD-001", assetName: "Konedobu Head Office Building",       categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-HQ-2018",  purchaseDate: "2018-03-01", purchaseCost: "8500000", supplier: "Hebou Constructions Ltd", usefulLifeYears: 50, status: "active", condition: "good", salvageValue: "850000", notes: "PNGICA HQ — 4 storey office building, Konedobu, Port Moresby" },
    { assetTag: "PNGICA-BLD-002", assetName: "Jacksons Airport Border Post",         categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-JBP-2019", purchaseDate: "2019-06-15", purchaseCost: "2200000", supplier: "Curtain Bros",            usefulLifeYears: 40, status: "active", condition: "good", salvageValue: "220000", notes: "Border control facility at Jacksons Intl Airport" },
    { assetTag: "PNGICA-BLD-003", assetName: "Vanimo Border Post",                   categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-VBP-2017", purchaseDate: "2017-09-20", purchaseCost: "1800000", supplier: "Hornibrook NGI",          usefulLifeYears: 40, status: "active", condition: "fair", salvageValue: "180000", notes: "Indonesia border post, West Sepik" },
    { assetTag: "PNGICA-BLD-004", assetName: "Wutung Border Crossing Office",        categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-WUT-2020", purchaseDate: "2020-11-10", purchaseCost: "1500000", supplier: "Curtain Bros",            usefulLifeYears: 40, status: "active", condition: "good", salvageValue: "150000", notes: "Land border crossing, Sandaun Province" },
    { assetTag: "PNGICA-BLD-005", assetName: "Lae Regional Office",                  categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-LAE-2016", purchaseDate: "2016-04-12", purchaseCost: "1200000", supplier: "Hebou Constructions Ltd", usefulLifeYears: 40, status: "active", condition: "fair", salvageValue: "120000", notes: "Regional immigration office, Morobe Province" },
    // Vehicles & Transport
    { assetTag: "PNGICA-VEH-001", assetName: "Toyota Land Cruiser 200",              categoryName: "Vehicles & Transport", serialNumber: "JTMHV09J504123456", brand: "Toyota", model: "Land Cruiser VX",   purchaseDate: "2022-01-15", purchaseCost: "285000", supplier: "Ela Motors PNG",  usefulLifeYears: 10, status: "active", condition: "good", salvageValue: "28500", notes: "Director General official vehicle" },
    { assetTag: "PNGICA-VEH-002", assetName: "Toyota Hilux 4x4 Dual Cab",            categoryName: "Vehicles & Transport", serialNumber: "MR0FZ29G801234567", brand: "Toyota", model: "Hilux SR5",         purchaseDate: "2021-07-20", purchaseCost: "135000", supplier: "Ela Motors PNG",  usefulLifeYears: 8,  status: "active", condition: "good", salvageValue: "13500", notes: "Field operations — Vanimo border post" },
    { assetTag: "PNGICA-VEH-003", assetName: "Toyota Hilux 4x4 Dual Cab",            categoryName: "Vehicles & Transport", serialNumber: "MR0FZ29G801234568", brand: "Toyota", model: "Hilux SR5",         purchaseDate: "2021-07-20", purchaseCost: "135000", supplier: "Ela Motors PNG",  usefulLifeYears: 8,  status: "active", condition: "fair", salvageValue: "13500", notes: "Field operations — Wutung crossing" },
    { assetTag: "PNGICA-VEH-004", assetName: "Nissan Patrol Y62",                    categoryName: "Vehicles & Transport", serialNumber: "JN1TANY62U0123456", brand: "Nissan", model: "Patrol Ti",         purchaseDate: "2020-09-05", purchaseCost: "265000", supplier: "Boroko Motors",   usefulLifeYears: 10, status: "active", condition: "good", salvageValue: "26500", notes: "Deputy DG vehicle" },
    { assetTag: "PNGICA-VEH-005", assetName: "Toyota HiAce Commuter Bus",            categoryName: "Vehicles & Transport", serialNumber: "JTFSS22P607123456", brand: "Toyota", model: "HiAce GL",          purchaseDate: "2019-03-22", purchaseCost: "95000",  supplier: "Ela Motors PNG",  usefulLifeYears: 8,  status: "under_maintenance", condition: "fair", salvageValue: "9500", notes: "Staff transport — engine service overdue" },
    { assetTag: "PNGICA-VEH-006", assetName: "Toyota Hilux Single Cab",              categoryName: "Vehicles & Transport", serialNumber: "MR0CZ29G601234569", brand: "Toyota", model: "Hilux Workmate",    purchaseDate: "2018-11-30", purchaseCost: "78000",  supplier: "Ela Motors PNG",  usefulLifeYears: 8,  status: "active", condition: "poor", salvageValue: "7800",  notes: "Logistics vehicle — Lae regional office" },
    { assetTag: "PNGICA-VEH-007", assetName: "Honda CRF 250 Motorcycle",             categoryName: "Vehicles & Transport", serialNumber: "MLHME10A0L1234567", brand: "Honda",  model: "CRF 250L",          purchaseDate: "2023-02-14", purchaseCost: "32000",  supplier: "Ela Motors PNG",  usefulLifeYears: 6,  status: "active", condition: "excellent", salvageValue: "3200", notes: "Border patrol motorcycle, Sandaun" },
    // Office Furniture
    { assetTag: "PNGICA-OFF-001", assetName: "Executive Office Desk Set",            categoryName: "Office Furniture", brand: "SteelCase",    model: "Series 7",   purchaseDate: "2022-04-10", purchaseCost: "8500",  supplier: "Office National PNG", usefulLifeYears: 15, status: "active", condition: "good", salvageValue: "850",  notes: "DG office furniture set — desk, credenza, return" },
    { assetTag: "PNGICA-OFF-002", assetName: "Boardroom Conference Table 12-seat",   categoryName: "Office Furniture", brand: "Herman Miller",model: "Eames",      purchaseDate: "2021-11-20", purchaseCost: "24000", supplier: "Office National PNG", usefulLifeYears: 20, status: "active", condition: "good", salvageValue: "2400", notes: "Executive boardroom, Konedobu HQ" },
    { assetTag: "PNGICA-OFF-003", assetName: "Filing Cabinet Bank (10 units)",       categoryName: "Office Furniture", brand: "Sentinel",     model: "4-drawer",   purchaseDate: "2020-08-15", purchaseCost: "18000", supplier: "Office National PNG", usefulLifeYears: 15, status: "active", condition: "fair", salvageValue: "1800", notes: "Records section — citizen files" },
    { assetTag: "PNGICA-OFF-004", assetName: "Workstation Cubicles (set of 20)",     categoryName: "Office Furniture", brand: "Haworth",      model: "Compose",    purchaseDate: "2022-06-01", purchaseCost: "95000", supplier: "Office National PNG", usefulLifeYears: 12, status: "active", condition: "good", salvageValue: "9500", notes: "Open-plan office, Level 2 HQ" },
    { assetTag: "PNGICA-OFF-005", assetName: "Reception Counter",                    categoryName: "Office Furniture", model: "Custom",       purchaseDate: "2019-05-25", purchaseCost: "12000", supplier: "PNG Joinery Works",  usefulLifeYears: 15, status: "active", condition: "fair", salvageValue: "1200", notes: "Public reception, ground floor HQ" },
    // ICT Equipment
    { assetTag: "PNGICA-ICT-001", assetName: "Border Management System Server",            categoryName: "ICT Equipment", serialNumber: "DELL-PE-R750-001",   brand: "Dell",          model: "PowerEdge R750", purchaseDate: "2022-03-15", purchaseCost: "85000",  supplier: "Datec PNG Ltd",     usefulLifeYears: 7,  status: "active", condition: "good", salvageValue: "8500",  notes: "Primary BMS server — biometric & passport database" },
    { assetTag: "PNGICA-ICT-002", assetName: "Border Management System Server (Failover)", categoryName: "ICT Equipment", serialNumber: "DELL-PE-R750-002",   brand: "Dell",          model: "PowerEdge R750", purchaseDate: "2022-03-15", purchaseCost: "85000",  supplier: "Datec PNG Ltd",     usefulLifeYears: 7,  status: "active", condition: "good", salvageValue: "8500",  notes: "Failover BMS server" },
    { assetTag: "PNGICA-ICT-003", assetName: "Passport Printing System",                   categoryName: "ICT Equipment", serialNumber: "MORPHO-PP-2021-001", brand: "IDEMIA",        model: "MorphoPass PP",  purchaseDate: "2021-10-10", purchaseCost: "180000", supplier: "IDEMIA Australia",  usefulLifeYears: 10, status: "active", condition: "good", salvageValue: "18000", notes: "ePassport printing & personalisation, Konedobu HQ" },
    { assetTag: "PNGICA-ICT-004", assetName: "Biometric Capture Station",                  categoryName: "ICT Equipment", serialNumber: "MORPHO-BIO-2022-001",brand: "IDEMIA",        model: "MorphoWave",     purchaseDate: "2022-08-05", purchaseCost: "45000",  supplier: "IDEMIA Australia",  usefulLifeYears: 8,  status: "active", condition: "good", salvageValue: "4500",  notes: "Fingerprint & facial capture — passport applications" },
    { assetTag: "PNGICA-ICT-005", assetName: "Biometric Capture Station",                  categoryName: "ICT Equipment", serialNumber: "MORPHO-BIO-2022-002",brand: "IDEMIA",        model: "MorphoWave",     purchaseDate: "2022-08-05", purchaseCost: "45000",  supplier: "IDEMIA Australia",  usefulLifeYears: 8,  status: "active", condition: "good", salvageValue: "4500",  notes: "Biometric station — Jacksons Airport" },
    { assetTag: "PNGICA-ICT-006", assetName: "ePassport Reader",                           categoryName: "ICT Equipment", serialNumber: "3M-CR100-001",       brand: "3M",            model: "CR100M",         purchaseDate: "2020-12-01", purchaseCost: "8500",   supplier: "Datec PNG Ltd",     usefulLifeYears: 7,  status: "active",  condition: "fair", salvageValue: "850", notes: "Passport scanner — Jacksons immigration desk 1" },
    { assetTag: "PNGICA-ICT-007", assetName: "ePassport Reader",                           categoryName: "ICT Equipment", serialNumber: "3M-CR100-002",       brand: "3M",            model: "CR100M",         purchaseDate: "2020-12-01", purchaseCost: "8500",   supplier: "Datec PNG Ltd",     usefulLifeYears: 7,  status: "active",  condition: "fair", salvageValue: "850", notes: "Passport scanner — Jacksons immigration desk 2" },
    { assetTag: "PNGICA-ICT-008", assetName: "ePassport Reader",                           categoryName: "ICT Equipment", serialNumber: "3M-CR100-003",       brand: "3M",            model: "CR100M",         purchaseDate: "2020-12-01", purchaseCost: "8500",   supplier: "Datec PNG Ltd",     usefulLifeYears: 7,  status: "missing", condition: "poor", salvageValue: "850", notes: "Passport scanner — reported missing Vanimo, Mar 2024" },
    { assetTag: "PNGICA-ICT-009", assetName: "Cisco Catalyst 9300 Switch",                 categoryName: "ICT Equipment", serialNumber: "FCW2440L0A1",        brand: "Cisco",         model: "Catalyst 9300",  purchaseDate: "2021-05-20", purchaseCost: "22000",  supplier: "Daltron PNG",       usefulLifeYears: 8,  status: "active", condition: "good", salvageValue: "2200",  notes: "Core network switch, HQ data centre" },
    { assetTag: "PNGICA-ICT-010", assetName: "HP EliteBook 850 G9 Laptop",                 categoryName: "ICT Equipment", serialNumber: "5CG2123ABC",         brand: "HP",            model: "EliteBook 850",  purchaseDate: "2023-04-10", purchaseCost: "5800",   supplier: "Datec PNG Ltd",     usefulLifeYears: 5,  status: "active", condition: "excellent", salvageValue: "580", notes: "Director laptop — Operations Division" },
    { assetTag: "PNGICA-ICT-011", assetName: "HP EliteBook 850 G9 Laptop",                 categoryName: "ICT Equipment", serialNumber: "5CG2123ABD",         brand: "HP",            model: "EliteBook 850",  purchaseDate: "2023-04-10", purchaseCost: "5800",   supplier: "Datec PNG Ltd",     usefulLifeYears: 5,  status: "active", condition: "excellent", salvageValue: "580", notes: "Director laptop — Citizenship Division" },
    { assetTag: "PNGICA-ICT-012", assetName: "Dell OptiPlex Desktop (x25)",                categoryName: "ICT Equipment", serialNumber: "DELL-OPT-2022-BULK", brand: "Dell",          model: "OptiPlex 7090",  purchaseDate: "2022-11-15", purchaseCost: "125000", supplier: "Datec PNG Ltd",     usefulLifeYears: 6,  status: "active", condition: "good", salvageValue: "12500", notes: "Officer workstations — Konedobu HQ (25 units)" },
    { assetTag: "PNGICA-ICT-013", assetName: "Konica Bizhub C658 Multifunction",           categoryName: "ICT Equipment", serialNumber: "A6F1011001234",      brand: "Konica Minolta",model: "Bizhub C658",    purchaseDate: "2021-06-30", purchaseCost: "28000",  supplier: "Konica Minolta PNG",usefulLifeYears: 7,  status: "under_maintenance", condition: "fair", salvageValue: "2800", notes: "Records section MFP — drum replacement scheduled" },
    { assetTag: "PNGICA-ICT-014", assetName: "VSAT Satellite Terminal",                    categoryName: "ICT Equipment", serialNumber: "HUGHES-HX260-001",   brand: "Hughes",        model: "HX260",          purchaseDate: "2020-02-12", purchaseCost: "45000",  supplier: "Daltron PNG",       usefulLifeYears: 10, status: "active", condition: "good", salvageValue: "4500",  notes: "Vanimo border post — primary internet uplink" },
    // Communication Equipment
    { assetTag: "PNGICA-COM-001", assetName: "Motorola APX 4500 Two-Way Radio (set of 30)", categoryName: "Communication Equipment", serialNumber: "MOTO-APX-BULK-2022", brand: "Motorola", model: "APX 4500",      purchaseDate: "2022-07-18", purchaseCost: "75000", supplier: "Datec PNG Ltd", usefulLifeYears: 8, status: "active", condition: "good", salvageValue: "7500", notes: "Border officer comms — bulk procurement (30 units)" },
    { assetTag: "PNGICA-COM-002", assetName: "Iridium Satellite Phone",                     categoryName: "Communication Equipment", serialNumber: "IRID-9555-001",      brand: "Iridium",  model: "Extreme 9575",  purchaseDate: "2021-09-22", purchaseCost: "3500",  supplier: "Daltron PNG",   usefulLifeYears: 7, status: "active", condition: "good", salvageValue: "350", notes: "Vanimo border post emergency comms" },
    { assetTag: "PNGICA-COM-003", assetName: "Iridium Satellite Phone",                     categoryName: "Communication Equipment", serialNumber: "IRID-9555-002",      brand: "Iridium",  model: "Extreme 9575",  purchaseDate: "2021-09-22", purchaseCost: "3500",  supplier: "Daltron PNG",   usefulLifeYears: 7, status: "active", condition: "good", salvageValue: "350", notes: "Wutung crossing emergency comms" },
  ];

  let inserted = 0;
  for (const a of icaAssets) {
    const categoryId = catMap[a.categoryName];
    if (!categoryId) continue;
    await db.insert(assets).values({
      assetTag: a.assetTag,
      assetName: a.assetName,
      categoryId,
      serialNumber: a.serialNumber ?? null,
      brand: a.brand ?? null,
      model: a.model ?? null,
      purchaseDate: a.purchaseDate,
      purchaseCost: a.purchaseCost,
      supplier: a.supplier,
      usefulLifeYears: a.usefulLifeYears,
      status: a.status,
      condition: a.condition,
      agencyId: ica.id,
      depreciationMethod: "straight_line",
      salvageValue: a.salvageValue,
      notes: a.notes,
    }).onConflictDoNothing();
    inserted++;
  }
  logger.info({ count: inserted, agency: "PNGICA" }, "Auto-seed: agency assets");
}

async function seedAgencyStock(): Promise<void> {
  const [ica] = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.agencyCode, "PNGICA")).limit(1);
  if (!ica) return;

  type Seed = {
    itemCode: string; itemName: string; category: string;
    unitOfMeasure: string; onHandQuantity: number; reorderLevel: number;
    unitCost: string; supplier: string; notes: string;
  };
  const items: Seed[] = [
    { itemCode: "PNGICA-STK-001", itemName: "Blank ePassport Booklet (32-page)",          category: "Passport Stationery",   unitOfMeasure: "booklet", onHandQuantity: 4500, reorderLevel: 1000, unitCost: "85.00",  supplier: "IDEMIA Australia",         notes: "Secure storage — passport vault, Konedobu HQ" },
    { itemCode: "PNGICA-STK-002", itemName: "Blank ePassport Booklet (64-page)",          category: "Passport Stationery",   unitOfMeasure: "booklet", onHandQuantity: 850,  reorderLevel: 500,  unitCost: "120.00", supplier: "IDEMIA Australia",         notes: "Frequent traveller passports" },
    { itemCode: "PNGICA-STK-003", itemName: "Visa Sticker (Type A)",                       category: "Visa Stationery",       unitOfMeasure: "sticker", onHandQuantity: 12000,reorderLevel: 3000, unitCost: "4.50",   supplier: "IDEMIA Australia",         notes: "Standard visa sticker — bonded stock" },
    { itemCode: "PNGICA-STK-004", itemName: "Citizenship Certificate (Security Paper)",    category: "Citizenship Stationery",unitOfMeasure: "sheet",   onHandQuantity: 1500, reorderLevel: 300,  unitCost: "12.00",  supplier: "Note Printing Australia",  notes: "Watermarked certificate paper" },
    { itemCode: "PNGICA-STK-005", itemName: "Border Stamp Ink Cartridge",                  category: "Office Consumables",    unitOfMeasure: "cartridge",onHandQuantity: 60,  reorderLevel: 20,   unitCost: "35.00",  supplier: "Office National PNG",      notes: "Self-inking border stamps — entry/exit" },
    { itemCode: "PNGICA-STK-006", itemName: "A4 Bond Paper (80gsm, ream)",                 category: "Office Consumables",    unitOfMeasure: "ream",    onHandQuantity: 320,  reorderLevel: 100,  unitCost: "18.00",  supplier: "Office National PNG",      notes: "General office printing" },
    { itemCode: "PNGICA-STK-007", itemName: "HP 305A Black Toner Cartridge",               category: "Office Consumables",    unitOfMeasure: "cartridge",onHandQuantity: 24,  reorderLevel: 10,   unitCost: "280.00", supplier: "Datec PNG Ltd",            notes: "Officer workstation printers" },
    { itemCode: "PNGICA-STK-008", itemName: "Konica Bizhub C658 Toner (Cyan)",             category: "Office Consumables",    unitOfMeasure: "cartridge",onHandQuantity: 6,   reorderLevel: 4,    unitCost: "420.00", supplier: "Konica Minolta PNG",       notes: "Records section MFP" },
    { itemCode: "PNGICA-STK-009", itemName: "Officer Uniform Shirt (white, embroidered)",  category: "Uniform & PPE",         unitOfMeasure: "each",    onHandQuantity: 180,  reorderLevel: 50,   unitCost: "65.00",  supplier: "PNG Garment Manufacturers",notes: "Border officer issue" },
    { itemCode: "PNGICA-STK-010", itemName: "Officer Cap (with ICA badge)",                category: "Uniform & PPE",         unitOfMeasure: "each",    onHandQuantity: 95,   reorderLevel: 30,   unitCost: "45.00",  supplier: "PNG Garment Manufacturers",notes: "Standard issue uniform cap" },
    { itemCode: "PNGICA-STK-011", itemName: "High-Visibility Safety Vest",                 category: "Uniform & PPE",         unitOfMeasure: "each",    onHandQuantity: 40,   reorderLevel: 25,   unitCost: "28.00",  supplier: "Brian Bell Hardware",      notes: "Apron/Tarmac duty — Jacksons" },
    { itemCode: "PNGICA-STK-012", itemName: "Toyota Hilux Engine Oil 10W-40 (4L)",         category: "Vehicle Spares",        unitOfMeasure: "bottle",  onHandQuantity: 22,   reorderLevel: 10,   unitCost: "85.00",  supplier: "Ela Motors PNG",           notes: "Fleet servicing supplies" },
    { itemCode: "PNGICA-STK-013", itemName: "Vehicle Air Filter — Hilux/Land Cruiser",     category: "Vehicle Spares",        unitOfMeasure: "each",    onHandQuantity: 8,    reorderLevel: 6,    unitCost: "55.00",  supplier: "Ela Motors PNG",           notes: "Routine maintenance stock" },
  ];

  let inserted = 0;
  for (const it of items) {
    const [row] = await db.insert(stockItems).values({
      itemCode: it.itemCode,
      itemName: it.itemName,
      category: it.category,
      unitOfMeasure: it.unitOfMeasure,
      onHandQuantity: it.onHandQuantity,
      reorderLevel: it.reorderLevel,
      unitCost: it.unitCost,
      supplier: it.supplier,
      notes: it.notes,
      agencyId: ica.id,
    }).onConflictDoNothing().returning({ id: stockItems.id });
    if (row) {
      await db.insert(stockBalances).values({
        stockItemId: row.id,
        facilityId: null,
        quantity: it.onHandQuantity,
      }).onConflictDoNothing();
    }
    inserted++;
  }
  logger.info({ count: inserted, agency: "PNGICA" }, "Auto-seed: agency stock items");
}

async function seedInitialData(): Promise<void> {

  // ── TENANT ──────────────────────────────────────────────────────────────────
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Papua New Guinea Government", code: "PNG" })
    .onConflictDoUpdate({ target: tenants.code, set: { name: "Papua New Guinea Government" } })
    .returning();

  // ── ROLES ────────────────────────────────────────────────────────────────────
  const roleData = [
    { roleName: "Super Admin",              description: "Full platform access",              scopeLevel: "national"   as const },
    { roleName: "National Asset Controller",description: "Read/write all provinces",          scopeLevel: "national"   as const },
    { roleName: "National Auditor",         description: "Read-only across all data",         scopeLevel: "national"   as const },
    { roleName: "Provincial Admin",         description: "Full access within province",       scopeLevel: "provincial" as const },
    { roleName: "Provincial Asset Officer", description: "Create/edit assets in province",    scopeLevel: "provincial" as const },
    { roleName: "Provincial Viewer",        description: "Read-only within province",         scopeLevel: "provincial" as const },
  ];
  const roleMap: Record<string, string> = {};
  for (const r of roleData) {
    const [row] = await db.insert(roles).values(r)
      .onConflictDoUpdate({ target: roles.roleName, set: { description: r.description } })
      .returning();
    roleMap[r.roleName] = row.id;
  }
  logger.info({ count: Object.keys(roleMap).length }, "Auto-seed: roles");

  // ── PROVINCES (all 22) ───────────────────────────────────────────────────────
  const provinceData = [
    { provinceCode: "CP",  provinceName: "Central Province",                    flagUrl: "/flags/central.svg",              themeAccentColor: "#1E40AF", region: "Southern"   },
    { provinceCode: "CH",  provinceName: "Chimbu (Simbu) Province",             flagUrl: "/flags/chimbu.svg",               themeAccentColor: "#B91C1C", region: "Highlands"  },
    { provinceCode: "EH",  provinceName: "Eastern Highlands Province",          flagUrl: "/flags/eastern_highlands.svg",    themeAccentColor: "#065F46", region: "Highlands"  },
    { provinceCode: "ENB", provinceName: "East New Britain Province",           flagUrl: "/flags/east_new_britain.svg",     themeAccentColor: "#7C3AED", region: "Islands"    },
    { provinceCode: "ES",  provinceName: "East Sepik Province",                 flagUrl: "/flags/east_sepik.png",           themeAccentColor: "#0369A1", region: "Momase"     },
    { provinceCode: "EN",  provinceName: "Enga Province",                       flagUrl: "/flags/enga.png",                 themeAccentColor: "#CA8A04", region: "Highlands"  },
    { provinceCode: "GU",  provinceName: "Gulf Province",                       flagUrl: "/flags/gulf.png",                 themeAccentColor: "#0F766E", region: "Southern"   },
    { provinceCode: "HE",  provinceName: "Hela Province",                       flagUrl: "/flags/hela.svg",                 themeAccentColor: "#92400E", region: "Highlands"  },
    { provinceCode: "JI",  provinceName: "Jiwaka Province",                     flagUrl: "/flags/jiwaka.svg",               themeAccentColor: "#1D4ED8", region: "Highlands"  },
    { provinceCode: "MA",  provinceName: "Manus Province",                      flagUrl: "/flags/manus.svg",                themeAccentColor: "#0284C7", region: "Islands"    },
    { provinceCode: "MB",  provinceName: "Milne Bay Province",                  flagUrl: "/flags/milne_bay.svg",            themeAccentColor: "#047857", region: "Southern"   },
    { provinceCode: "MO",  provinceName: "Morobe Province",                     flagUrl: "/flags/morobe.png",               themeAccentColor: "#1E3A8A", region: "Momase"     },
    { provinceCode: "NCD", provinceName: "National Capital District",           flagUrl: "/flags/ncd.svg",                  themeAccentColor: "#DC2626", region: "Southern"   },
    { provinceCode: "NI",  provinceName: "New Ireland Province",                flagUrl: "/flags/new_ireland.svg",          themeAccentColor: "#9D174D", region: "Islands"    },
    { provinceCode: "NO",  provinceName: "Northern (Oro) Province",             flagUrl: "/flags/northern.png",             themeAccentColor: "#166534", region: "Southern"   },
    { provinceCode: "AB",  provinceName: "Autonomous Region of Bougainville",   flagUrl: "/flags/bougainville.svg",         themeAccentColor: "#1E3A5F", region: "Islands"    },
    { provinceCode: "SA",  provinceName: "Sandaun (West Sepik) Province",       flagUrl: "/flags/sandaun.svg",              themeAccentColor: "#6D28D9", region: "Momase"     },
    { provinceCode: "SH",  provinceName: "Southern Highlands Province",         flagUrl: "/flags/southern_highlands.svg",   themeAccentColor: "#B45309", region: "Highlands"  },
    { provinceCode: "WS",  provinceName: "Western Province",                    flagUrl: "/flags/western.svg",              themeAccentColor: "#047857", region: "Southern"   },
    { provinceCode: "WHP", provinceName: "Western Highlands Province",          flagUrl: "/flags/western_highlands.svg",    themeAccentColor: "#7C2D12", region: "Highlands"  },
    { provinceCode: "WNB", provinceName: "West New Britain Province",           flagUrl: "/flags/west_new_britain.svg",     themeAccentColor: "#064E3B", region: "Islands"    },
    { provinceCode: "MD",  provinceName: "Madang Province",                     flagUrl: "/flags/madang.svg",               themeAccentColor: "#312E81", region: "Momase"     },
  ];
  const provinceMap: Record<string, string> = {};
  for (const p of provinceData) {
    const [row] = await db.insert(provinces)
      .values({ ...p, tenantId: tenant.id })
      .onConflictDoUpdate({ target: provinces.provinceCode, set: { provinceName: p.provinceName, flagUrl: p.flagUrl, themeAccentColor: p.themeAccentColor, region: p.region } })
      .returning();
    provinceMap[p.provinceCode] = row.id;
  }
  logger.info({ count: Object.keys(provinceMap).length }, "Auto-seed: provinces");

  // ── DISTRICTS (all 95) ───────────────────────────────────────────────────────
  const districtData = [
    // Bougainville (AB)
    { provinceCode: "AB",  districtCode: "ARB-CB",  districtName: "Central Bougainville District" },
    { provinceCode: "AB",  districtCode: "ARB-NB",  districtName: "North Bougainville District"   },
    { provinceCode: "AB",  districtCode: "ARB-SB",  districtName: "South Bougainville District"   },
    // Chimbu / Simbu (CH)
    { provinceCode: "CH",  districtCode: "SIM-CH",  districtName: "Chuave District"               },
    { provinceCode: "CH",  districtCode: "SIM-GU",  districtName: "Gumine District"               },
    { provinceCode: "CH",  districtCode: "SIM-KN",  districtName: "Karimui-Nomane District"       },
    { provinceCode: "CH",  districtCode: "SIM-KE",  districtName: "Kerowagi District"             },
    { provinceCode: "CH",  districtCode: "SIM-KG",  districtName: "Kundiawa-Gembogl District"     },
    { provinceCode: "CH",  districtCode: "SIM-SN",  districtName: "Salt-Nomane District"          },
    // Central Province (CP)
    { provinceCode: "CP",  districtCode: "CP-AB",   districtName: "Abau District"                 },
    { provinceCode: "CP",  districtCode: "CP-GO",   districtName: "Goilala District"              },
    { provinceCode: "CP",  districtCode: "CP-HI",   districtName: "Hiri District"                 },
    { provinceCode: "CP",  districtCode: "CP-KA",   districtName: "Kairuku District"              },
    { provinceCode: "CP",  districtCode: "CP-RI",   districtName: "Rigo District"                 },
    // Eastern Highlands (EH)
    { provinceCode: "EH",  districtCode: "EH-DA",   districtName: "Daulo District"                },
    { provinceCode: "EH",  districtCode: "EH-GO",   districtName: "Goroka District"               },
    { provinceCode: "EH",  districtCode: "EH-HE",   districtName: "Henganofi District"            },
    { provinceCode: "EH",  districtCode: "EH-KA",   districtName: "Kainantu District"             },
    { provinceCode: "EH",  districtCode: "EH-LU",   districtName: "Lufa District"                 },
    { provinceCode: "EH",  districtCode: "EH-OW",   districtName: "Obura-Wonenara District"       },
    { provinceCode: "EH",  districtCode: "EH-OK",   districtName: "Okapa District"                },
    { provinceCode: "EH",  districtCode: "EH-UB",   districtName: "Unggai-Bena District"          },
    // Enga (EN)
    { provinceCode: "EN",  districtCode: "EN-KA",   districtName: "Kandep District"               },
    { provinceCode: "EN",  districtCode: "EN-KO",   districtName: "Kompiam-Ambum District"        },
    { provinceCode: "EN",  districtCode: "EN-LP",   districtName: "Lagaip-Porgera District"       },
    { provinceCode: "EN",  districtCode: "EN-WA",   districtName: "Wabag District"                },
    { provinceCode: "EN",  districtCode: "EN-WP",   districtName: "Wapenamanda District"          },
    // East New Britain (ENB)
    { provinceCode: "ENB", districtCode: "ENB-GA",  districtName: "Gazelle District"              },
    { provinceCode: "ENB", districtCode: "ENB-KO",  districtName: "Kokopo District"               },
    { provinceCode: "ENB", districtCode: "ENB-PO",  districtName: "Pomio District"                },
    { provinceCode: "ENB", districtCode: "ENB-RA",  districtName: "Rabaul District"               },
    // East Sepik (ES)
    { provinceCode: "ES",  districtCode: "ES-AD",   districtName: "Ambunti-Dreikikir District"    },
    { provinceCode: "ES",  districtCode: "ES-AN",   districtName: "Angoram District"              },
    { provinceCode: "ES",  districtCode: "ES-MA",   districtName: "Maprik District"               },
    { provinceCode: "ES",  districtCode: "ES-WE",   districtName: "Wewak District"                },
    { provinceCode: "ES",  districtCode: "ES-WG",   districtName: "Wosera-Gawi District"          },
    { provinceCode: "ES",  districtCode: "ES-YS",   districtName: "Yangoru-Saussia District"      },
    // Gulf (GU)
    { provinceCode: "GU",  districtCode: "GU-KE",   districtName: "Kerema District"               },
    { provinceCode: "GU",  districtCode: "GU-KI",   districtName: "Kikori District"               },
    { provinceCode: "GU",  districtCode: "GU-KO",   districtName: "Kotidanga District"            },
    // Hela (HE)
    { provinceCode: "HE",  districtCode: "HL-KM",   districtName: "Komo-Margarima District"       },
    { provinceCode: "HE",  districtCode: "HL-KL",   districtName: "Koroba-Lake Kopiago District"  },
    { provinceCode: "HE",  districtCode: "HL-TP",   districtName: "Tari-Pori District"            },
    // Jiwaka (JI)
    { provinceCode: "JI",  districtCode: "JI-AS",   districtName: "Anglimp-South Waghi District"  },
    { provinceCode: "JI",  districtCode: "JI-JI",   districtName: "Jimi District"                 },
    { provinceCode: "JI",  districtCode: "JI-NW",   districtName: "North Waghi District"          },
    // Manus (MA)
    { provinceCode: "MA",  districtCode: "MN-LP",   districtName: "Lou-Pam District"              },
    { provinceCode: "MA",  districtCode: "MN-MA",   districtName: "Manus District"                },
    // Milne Bay (MB)
    { provinceCode: "MB",  districtCode: "MB-AL",   districtName: "Alotau District"               },
    { provinceCode: "MB",  districtCode: "MB-ES",   districtName: "Esaala District"               },
    { provinceCode: "MB",  districtCode: "MB-KG",   districtName: "Kiriwina-Goodenough District"  },
    { provinceCode: "MB",  districtCode: "MB-SM",   districtName: "Samarai-Murua District"        },
    // Madang (MD)
    { provinceCode: "MD",  districtCode: "MA-BO",   districtName: "Bogia District"                },
    { provinceCode: "MD",  districtCode: "MA-MA",   districtName: "Madang District"               },
    { provinceCode: "MD",  districtCode: "MA-MR",   districtName: "Middle Ramu District"          },
    { provinceCode: "MD",  districtCode: "MA-RC",   districtName: "Rai Coast District"            },
    { provinceCode: "MD",  districtCode: "MA-SU",   districtName: "Sumkar District"               },
    { provinceCode: "MD",  districtCode: "MA-UB",   districtName: "Usino-Bundi District"          },
    // Morobe (MO)
    { provinceCode: "MO",  districtCode: "MO-BU",   districtName: "Bulolo District"               },
    { provinceCode: "MO",  districtCode: "MO-FI",   districtName: "Finschhafen District"          },
    { provinceCode: "MO",  districtCode: "MO-HG",   districtName: "Huon Gulf District"            },
    { provinceCode: "MO",  districtCode: "MO-KA",   districtName: "Kabwum District"               },
    { provinceCode: "MO",  districtCode: "MO-LAE",  districtName: "Lae District"                  },
    { provinceCode: "MO",  districtCode: "MO-MK",   districtName: "Markham District"              },
    { provinceCode: "MO",  districtCode: "MO-ME",   districtName: "Menyamya District"             },
    { provinceCode: "MO",  districtCode: "MO-NA",   districtName: "Nawae District"                },
    { provinceCode: "MO",  districtCode: "MO-TS",   districtName: "Tewai-Siassi District"         },
    // NCD
    { provinceCode: "NCD", districtCode: "NCD-NE",  districtName: "Moresby North-East District"   },
    { provinceCode: "NCD", districtCode: "NCD-NW",  districtName: "Moresby North-West District"   },
    { provinceCode: "NCD", districtCode: "NCD-SO",  districtName: "Moresby South District"        },
    // New Ireland (NI)
    { provinceCode: "NI",  districtCode: "NI-KA",   districtName: "Kavieng District"              },
    { provinceCode: "NI",  districtCode: "NI-NA",   districtName: "Namatanai District"            },
    { provinceCode: "NI",  districtCode: "NI-NH",   districtName: "New Hanover District"          },
    // Northern/Oro (NO)
    { provinceCode: "NO",  districtCode: "OR-IJ",   districtName: "Ijivitari District"            },
    { provinceCode: "NO",  districtCode: "OR-PO",   districtName: "Popondetta District"           },
    { provinceCode: "NO",  districtCode: "OR-SO",   districtName: "Sohe District"                 },
    // Sandaun/West Sepik (SA)
    { provinceCode: "SA",  districtCode: "SA-AL",   districtName: "Aitape-Lumi District"          },
    { provinceCode: "SA",  districtCode: "SA-AM",   districtName: "Amanab District"               },
    { provinceCode: "SA",  districtCode: "SA-NU",   districtName: "Nuku District"                 },
    { provinceCode: "SA",  districtCode: "SA-TE",   districtName: "Telefomin District"            },
    { provinceCode: "SA",  districtCode: "SA-VG",   districtName: "Vanimo-Green District"         },
    // Southern Highlands (SH)
    { provinceCode: "SH",  districtCode: "SH-IM",   districtName: "Imbonggu District"             },
    { provinceCode: "SH",  districtCode: "SH-IP",   districtName: "Ialibu-Pangia District"        },
    { provinceCode: "SH",  districtCode: "SH-KE",   districtName: "Kagua-Erave District"          },
    { provinceCode: "SH",  districtCode: "SH-MM",   districtName: "Mendi-Munihu District"         },
    { provinceCode: "SH",  districtCode: "SH-NK",   districtName: "Nipa-Kutubu District"          },
    // Western Province (WS)
    { provinceCode: "WS",  districtCode: "WP-MF",   districtName: "Middle Fly District"           },
    { provinceCode: "WS",  districtCode: "WP-NF",   districtName: "North Fly District"            },
    { provinceCode: "WS",  districtCode: "WP-SF",   districtName: "South Fly District"            },
    // Western Highlands (WHP)
    { provinceCode: "WHP", districtCode: "WHP-DEI", districtName: "Dei District"                  },
    { provinceCode: "WHP", districtCode: "WHP-MTH", districtName: "Mt Hagen District"             },
    { provinceCode: "WHP", districtCode: "WHP-MUL", districtName: "Mul-Baiyer District"           },
    // West New Britain (WNB)
    { provinceCode: "WNB", districtCode: "WNB-KG",  districtName: "Kandrian-Gloucester District"  },
    { provinceCode: "WNB", districtCode: "WNB-NA",  districtName: "Nakanai District"              },
    { provinceCode: "WNB", districtCode: "WNB-TA",  districtName: "Talasea District"              },
  ];

  const districtMap: Record<string, string> = {};
  for (const d of districtData) {
    const [row] = await db.insert(districts)
      .values({ provinceId: provinceMap[d.provinceCode]!, districtName: d.districtName, districtCode: d.districtCode })
      .onConflictDoNothing()
      .returning();
    if (row) districtMap[d.districtCode] = row.id;
  }
  // Re-fetch to catch any that already existed
  const allDistricts = await db.select().from(districts);
  for (const d of allDistricts) if (d.districtCode) districtMap[d.districtCode] = d.id;
  logger.info({ count: Object.keys(districtMap).length }, "Auto-seed: districts");

  // ── FACILITIES ───────────────────────────────────────────────────────────────
  // Generate 4 standard facilities per district, then add special named ones.
  const facilityMap: Record<string, string> = {};

  for (const d of districtData) {
    const dId = districtMap[d.districtCode];
    if (!dId) continue;
    const pfx = facilityPrefix(d.districtName);
    const standard = [
      { facilityName: `${d.districtName} Office`, facilityType: "Government Office" },
      { facilityName: `${pfx} General Hospital`,  facilityType: "Hospital"          },
      { facilityName: `${pfx} Health Centre`,     facilityType: "Health Centre"     },
      { facilityName: `${pfx} Secondary School`,  facilityType: "School"            },
    ];
    for (const f of standard) {
      const [row] = await db.insert(facilities)
        .values({ districtId: dId, facilityName: f.facilityName, facilityType: f.facilityType })
        .onConflictDoNothing()
        .returning();
      if (row) facilityMap[f.facilityName] = row.id;
    }
  }

  // Special named facilities referenced by assets / users
  const specialFacilities = [
    { districtCode: "MO-LAE",  facilityName: "Lae Provincial Headquarters",    facilityType: "Government Office" },
    { districtCode: "MO-LAE",  facilityName: "Angau Memorial Hospital",         facilityType: "Hospital"          },
    { districtCode: "MO-LAE",  facilityName: "Lae City Authority Office",       facilityType: "Government Office" },
    { districtCode: "MO-HG",   facilityName: "Huon Gulf District Office",       facilityType: "Government Office" },
    { districtCode: "WHP-MTH", facilityName: "Mt Hagen Provincial Headquarters",facilityType: "Government Office" },
    { districtCode: "WHP-MTH", facilityName: "Mt Hagen General Hospital",       facilityType: "Hospital"          },
    { districtCode: "WHP-DEI", facilityName: "Dei District Administration",     facilityType: "Government Office" },
    { districtCode: "NCD-NE",  facilityName: "Waigani Government Precinct",     facilityType: "Government Office" },
    { districtCode: "NCD-NE",  facilityName: "Port Moresby General Hospital",   facilityType: "Hospital"          },
    { districtCode: "NCD-SO",  facilityName: "NCD City Hall",                   facilityType: "Government Office" },
  ];
  for (const f of specialFacilities) {
    const dId = districtMap[f.districtCode];
    if (!dId) continue;
    const [row] = await db.insert(facilities)
      .values({ districtId: dId, facilityName: f.facilityName, facilityType: f.facilityType })
      .onConflictDoNothing()
      .returning();
    if (row) facilityMap[f.facilityName] = row.id;
  }
  // Re-fetch all facilities to ensure the map is populated
  const allFacilities = await db.select().from(facilities);
  for (const f of allFacilities) facilityMap[f.facilityName] = f.id;
  logger.info({ count: allFacilities.length }, "Auto-seed: facilities");

  // ── ASSET CATEGORIES ────────────────────────────────────────────────────────
  const categoryNames = ["ICT Equipment", "Vehicles & Transport", "Office Furniture", "Medical Equipment", "Heavy Machinery", "Buildings & Infrastructure", "Communication Equipment"];
  const categoryMap: Record<string, string> = {};
  for (const name of categoryNames) {
    const [row] = await db.insert(assetCategories)
      .values({ categoryName: name })
      .onConflictDoUpdate({ target: assetCategories.categoryName, set: { categoryName: name } })
      .returning();
    categoryMap[name] = row.id;
  }
  logger.info({ count: categoryNames.length }, "Auto-seed: categories");

  // ── USERS ────────────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);
  const userDataList = [
    { fullName: "Super Administrator",           email: "superadmin@npams.gov.pg",               roleName: "Super Admin",              provinceCode: null  },
    { fullName: "National Controller",           email: "national@npams.gov.pg",                 roleName: "National Asset Controller", provinceCode: null  },
    { fullName: "National Auditor",              email: "auditor@npams.gov.pg",                  roleName: "National Auditor",          provinceCode: null  },
    { fullName: "Morobe Admin",                  email: "morobe.admin@npams.gov.pg",             roleName: "Provincial Admin",          provinceCode: "MO"  },
    { fullName: "Morobe Asset Officer",          email: "morobe.officer@npams.gov.pg",           roleName: "Provincial Asset Officer",  provinceCode: "MO"  },
    { fullName: "Morobe Viewer",                 email: "morobe.viewer@npams.gov.pg",            roleName: "Provincial Viewer",         provinceCode: "MO"  },
    { fullName: "WHP Admin",                     email: "whp.admin@npams.gov.pg",                roleName: "Provincial Admin",          provinceCode: "WHP" },
    { fullName: "NCD Admin",                     email: "ncd.admin@npams.gov.pg",                roleName: "Provincial Admin",          provinceCode: "NCD" },
    { fullName: "Bougainville Provincial Admin", email: "bougainville.admin@npams.gov.pg",       roleName: "Provincial Admin",          provinceCode: "AB"  },
    { fullName: "Central Province Admin",        email: "central.admin@npams.gov.pg",            roleName: "Provincial Admin",          provinceCode: "CP"  },
    { fullName: "Chimbu Simbu Admin",            email: "chimbu.admin@npams.gov.pg",             roleName: "Provincial Admin",          provinceCode: "CH"  },
    { fullName: "East New Britain Admin",        email: "east-new-britain.admin@npams.gov.pg",   roleName: "Provincial Admin",          provinceCode: "ENB" },
    { fullName: "East Sepik Admin",              email: "east-sepik.admin@npams.gov.pg",         roleName: "Provincial Admin",          provinceCode: "ES"  },
    { fullName: "Eastern Highlands Admin",       email: "eastern-highlands.admin@npams.gov.pg",  roleName: "Provincial Admin",          provinceCode: "EH"  },
    { fullName: "Enga Province Admin",           email: "enga.admin@npams.gov.pg",               roleName: "Provincial Admin",          provinceCode: "EN"  },
    { fullName: "Gulf Province Admin",           email: "gulf.admin@npams.gov.pg",               roleName: "Provincial Admin",          provinceCode: "GU"  },
    { fullName: "Hela Province Admin",           email: "hela.admin@npams.gov.pg",               roleName: "Provincial Admin",          provinceCode: "HE"  },
    { fullName: "Jiwaka Province Admin",         email: "jiwaka.admin@npams.gov.pg",             roleName: "Provincial Admin",          provinceCode: "JI"  },
    { fullName: "Madang Province Admin",         email: "madang.admin@npams.gov.pg",             roleName: "Provincial Admin",          provinceCode: "MD"  },
    { fullName: "Manus Province Admin",          email: "manus.admin@npams.gov.pg",              roleName: "Provincial Admin",          provinceCode: "MA"  },
    { fullName: "Milne Bay Admin",               email: "milne-bay.admin@npams.gov.pg",          roleName: "Provincial Admin",          provinceCode: "MB"  },
    { fullName: "New Ireland Admin",             email: "new-ireland.admin@npams.gov.pg",        roleName: "Provincial Admin",          provinceCode: "NI"  },
    { fullName: "Northern Oro Admin",            email: "northern.admin@npams.gov.pg",           roleName: "Provincial Admin",          provinceCode: "NO"  },
    { fullName: "Sandaun West Sepik Admin",      email: "sandaun.admin@npams.gov.pg",            roleName: "Provincial Admin",          provinceCode: "SA"  },
    { fullName: "Southern Highlands Admin",      email: "southern-highlands.admin@npams.gov.pg", roleName: "Provincial Admin",          provinceCode: "SH"  },
    { fullName: "West New Britain Admin",        email: "west-new-britain.admin@npams.gov.pg",   roleName: "Provincial Admin",          provinceCode: "WNB" },
    { fullName: "Western Province Admin",        email: "western.admin@npams.gov.pg",            roleName: "Provincial Admin",          provinceCode: "WS"  },
  ];

  const userMap: Record<string, string> = {};
  for (const u of userDataList) {
    const existing = await db.select().from(users).where(eq(users.email, u.email)).limit(1);
    let userId: string;
    if (existing.length > 0) {
      userId = existing[0].id;
    } else {
      const [row] = await db.insert(users)
        .values({ fullName: u.fullName, email: u.email, passwordHash: hash })
        .returning();
      userId = row.id;
    }
    userMap[u.email] = userId;
    await db.insert(userRoles).values({ userId, roleId: roleMap[u.roleName]! }).onConflictDoNothing();
    await db.insert(userScope)
      .values({ userId, provinceId: u.provinceCode ? (provinceMap[u.provinceCode] ?? null) : null })
      .onConflictDoUpdate({ target: userScope.userId, set: { provinceId: u.provinceCode ? (provinceMap[u.provinceCode] ?? null) : null } });
  }
  logger.info({ count: Object.keys(userMap).length }, "Auto-seed: users");

  // ── ASSETS ───────────────────────────────────────────────────────────────────
  const morobeAdminId = userMap["morobe.admin@npams.gov.pg"];
  const lahq      = facilityMap["Lae Provincial Headquarters"];
  const mthq      = facilityMap["Mt Hagen Provincial Headquarters"];
  const waigani   = facilityMap["Waigani Government Precinct"];
  const angau     = facilityMap["Angau Memorial Hospital"];
  const pmgh      = facilityMap["Port Moresby General Hospital"];
  const mthHosp   = facilityMap["Mt Hagen General Hospital"];
  const laeDistId = districtMap["MO-LAE"];
  const mthDistId = districtMap["WHP-MTH"];
  const ncdNEId   = districtMap["NCD-NE"];

  const assetRows = [
    { assetTag: "MO-ICT-001", assetName: "Dell Latitude 5430 Laptop",            categoryId: categoryMap["ICT Equipment"]!,         status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: lahq,    brand: "Dell",        model: "Latitude 5430",         purchaseCost: "3500",    supplier: "Pacific ICT Solutions",  purchaseDate: "2024-01-15" },
    { assetTag: "MO-ICT-002", assetName: "HP LaserJet Pro Printer",               categoryId: categoryMap["ICT Equipment"]!,         status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: lahq,    brand: "HP",          model: "LaserJet Pro M404n",    purchaseCost: "1200",    supplier: "Pacific ICT Solutions"   },
    { assetTag: "MO-ICT-003", assetName: "Cisco Network Switch 24-Port",          categoryId: categoryMap["ICT Equipment"]!,         status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: lahq,    brand: "Cisco",                       purchaseCost: "3200"                                        },
    { assetTag: "MO-VEH-001", assetName: "Toyota Land Cruiser 79",                categoryId: categoryMap["Vehicles & Transport"]!,  status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: lahq,    brand: "Toyota",      model: "Land Cruiser LC79",     purchaseCost: "85000",   supplier: "Ela Motors PNG",         purchaseDate: "2023-06-10" },
    { assetTag: "MO-VEH-002", assetName: "Mitsubishi Pajero Sport",               categoryId: categoryMap["Vehicles & Transport"]!,  status: "active" as const,            condition: "fair" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: lahq,    brand: "Mitsubishi",  model: "Pajero Sport",          purchaseCost: "65000",   supplier: "Ela Motors PNG"          },
    { assetTag: "MO-VEH-003", assetName: "Isuzu NPR Truck",                       categoryId: categoryMap["Vehicles & Transport"]!,  status: "under_maintenance" as const, condition: "fair" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: lahq,    brand: "Isuzu",       model: "NPR 70",                purchaseCost: "95000",   supplier: "ASCO Motors"             },
    { assetTag: "MO-FUR-001", assetName: "Executive Office Desk Set",             categoryId: categoryMap["Office Furniture"]!,      status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: lahq,                                            purchaseCost: "2800",    supplier: "Pacific Office Supplies" },
    { assetTag: "MO-FUR-002", assetName: "Conference Table (12-seater)",          categoryId: categoryMap["Office Furniture"]!,      status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: lahq,                                            purchaseCost: "4500"                                        },
    { assetTag: "MO-MED-001", assetName: "Digital X-Ray Machine",                 categoryId: categoryMap["Medical Equipment"]!,     status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: angau,   brand: "Siemens",     model: "MULTIX Select DR",      purchaseCost: "180000",  supplier: "Pacific Medical Supplies"},
    { assetTag: "MO-MED-002", assetName: "ECG Monitor",                           categoryId: categoryMap["Medical Equipment"]!,     status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: angau,   brand: "Philips",                     purchaseCost: "12000"                                       },
    { assetTag: "MO-MED-003", assetName: "Portable Ultrasound Machine",           categoryId: categoryMap["Medical Equipment"]!,     status: "missing" as const,           condition: "fair" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: angau,                                           purchaseCost: "45000"                                       },
    { assetTag: "WHP-VEH-001",assetName: "Toyota Hilux Double Cab",               categoryId: categoryMap["Vehicles & Transport"]!,  status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,    brand: "Toyota",      model: "Hilux DC",              purchaseCost: "72000",   supplier: "Ela Motors PNG",         purchaseDate: "2024-03-01" },
    { assetTag: "WHP-VEH-002",assetName: "Ford Ranger 4WD",                       categoryId: categoryMap["Vehicles & Transport"]!,  status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,    brand: "Ford",        model: "Ranger XLT",            purchaseCost: "68000"                                       },
    { assetTag: "WHP-ICT-001",assetName: "HP Desktop Computer Set",               categoryId: categoryMap["ICT Equipment"]!,         status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,    brand: "HP",                          purchaseCost: "2800"                                        },
    { assetTag: "WHP-ICT-002",assetName: "Projector Epson EB-X51",                categoryId: categoryMap["ICT Equipment"]!,         status: "active" as const,            condition: "fair" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,    brand: "Epson",       model: "EB-X51",                purchaseCost: "1500"                                        },
    { assetTag: "WHP-MED-001",assetName: "Patient Monitoring System",             categoryId: categoryMap["Medical Equipment"]!,     status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthHosp,                                         purchaseCost: "28000"                                       },
    { assetTag: "WHP-MED-002",assetName: "Autoclave Sterilizer",                  categoryId: categoryMap["Medical Equipment"]!,     status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthHosp,                                         purchaseCost: "15000"                                       },
    { assetTag: "WHP-FUR-001",assetName: "Reception Desk Set",                    categoryId: categoryMap["Office Furniture"]!,      status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,                                            purchaseCost: "3200"                                        },
    { assetTag: "WHP-HM-001", assetName: "John Deere Tractor",                    categoryId: categoryMap["Heavy Machinery"]!,       status: "active" as const,            condition: "fair" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,    brand: "John Deere",  model: "3038E",                 purchaseCost: "65000"                                       },
    { assetTag: "NCD-VEH-001",assetName: "Toyota Prado TX",                       categoryId: categoryMap["Vehicles & Transport"]!,  status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Toyota",      model: "Land Cruiser Prado TX", purchaseCost: "92000",                                       purchaseDate: "2024-07-15" },
    { assetTag: "NCD-VEH-002",assetName: "Mazda BT-50 Pick-up",                   categoryId: categoryMap["Vehicles & Transport"]!,  status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Mazda",       model: "BT-50",                 purchaseCost: "62000"                                       },
    { assetTag: "NCD-ICT-001",assetName: "Apple MacBook Pro 14-inch",             categoryId: categoryMap["ICT Equipment"]!,         status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Apple",       model: "MacBook Pro M3",        purchaseCost: "5500"                                        },
    { assetTag: "NCD-ICT-002",assetName: "Samsung 27-inch Monitor x5",            categoryId: categoryMap["ICT Equipment"]!,         status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Samsung",                     purchaseCost: "3500"                                        },
    { assetTag: "NCD-COM-001",assetName: "Motorola Walkie-Talkie Set (10 units)", categoryId: categoryMap["Communication Equipment"]!,status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Motorola",                    purchaseCost: "8500"                                        },
    { assetTag: "NCD-MED-001",assetName: "MRI Scanner",                           categoryId: categoryMap["Medical Equipment"]!,     status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: pmgh,    brand: "GE Healthcare",              purchaseCost: "2500000",                                     purchaseDate: "2023-01-01" },
    { assetTag: "NCD-MED-002",assetName: "Ventilator ICU Pro",                    categoryId: categoryMap["Medical Equipment"]!,     status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: pmgh,    brand: "Medtronic",                  purchaseCost: "95000"                                       },
    { assetTag: "NCD-MED-003",assetName: "Portable Defibrillator",                categoryId: categoryMap["Medical Equipment"]!,     status: "missing" as const,           condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: pmgh,                                            purchaseCost: "12000"                                       },
    { assetTag: "NCD-FUR-001",assetName: "Boardroom Furniture Set",               categoryId: categoryMap["Office Furniture"]!,      status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani,                                         purchaseCost: "18000"                                       },
    { assetTag: "NCD-HM-001", assetName: "Caterpillar Generator 250KVA",          categoryId: categoryMap["Heavy Machinery"]!,       status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Caterpillar", model: "C9.3B",                 purchaseCost: "285000"                                      },
    { assetTag: "NCD-COM-002",assetName: "Satellite Communication System",        categoryId: categoryMap["Communication Equipment"]!,status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani,                                         purchaseCost: "45000"                                       },
    { assetTag: "NCD-BLD-001",assetName: "Waigani Secretariat Building",          categoryId: categoryMap["Buildings & Infrastructure"]!, status: "active" as const,       condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani,                                         purchaseCost: "12000000",                                    purchaseDate: "2010-01-01" },
  ];

  for (const a of assetRows) {
    await db.insert(assets)
      .values({ ...a, createdBy: morobeAdminId })
      .onConflictDoUpdate({ target: assets.assetTag, set: { assetName: a.assetName, status: a.status } });
  }
  logger.info({ count: assetRows.length }, "Auto-seed: assets");

  // ── NOTIFICATIONS ────────────────────────────────────────────────────────────
  await db.insert(notifications).values([
    { userId: morobeAdminId,                    title: "Welcome to NPAMS",                message: "Your Morobe Provincial Asset Registry is now active. Start registering assets today.", readStatus: false },
    { userId: morobeAdminId,                    title: "Asset MO-MED-003 Reported Missing",message: "Portable Ultrasound Machine at Angau Hospital has been flagged as missing. Please investigate.", readStatus: false },
    { userId: userMap["whp.admin@npams.gov.pg"],title: "Welcome to NPAMS",                message: "Your Western Highlands Provincial Asset Registry is now active.", readStatus: false },
    { userId: userMap["ncd.admin@npams.gov.pg"],title: "Welcome to NPAMS",                message: "Your National Capital District Asset Registry is now active.", readStatus: false },
  ]).onConflictDoNothing();

  logger.info("Auto-seed: initial data complete — 27 users, 95 districts, 385 facilities, 31 assets.");
}

async function seedAgencies(): Promise<void> {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Papua New Guinea Government", code: "PNG" })
    .onConflictDoUpdate({ target: tenants.code, set: { name: "Papua New Guinea Government" } })
    .returning();

  // Ensure the Agency Admin role exists (with new "agency" scope level)
  const [agencyRole] = await db
    .insert(roles)
    .values({
      roleName: "Agency Admin",
      description: "Full access within agency / parastatal",
      scopeLevel: "agency" as const,
    })
    .onConflictDoUpdate({
      target: roles.roleName,
      set: { description: "Full access within agency / parastatal", scopeLevel: "agency" as const },
    })
    .returning();

  // ── AGENCIES ────────────────────────────────────────────────────────────────
  // Logos live at /agencies/{code}.svg (placeholder emblems — replace with real logos when ready)
  const agencyData = [
    { agencyCode: "PNGICA",    agencyName: "PNG Immigration & Citizenship Authority", agencyType: "Authority",      logoUrl: "/agencies/pngica.png",    themeAccentColor: "#0F4C81", flagColors: ["#0F4C81", "#FFFFFF"] },
    { agencyCode: "OMBUDSMAN", agencyName: "Ombudsman Commission",                    agencyType: "Commission",     logoUrl: "/agencies/ombudsman.jpg", themeAccentColor: "#5B2C6F", flagColors: ["#5B2C6F", "#FFD700"] },
    { agencyCode: "RPNGC",     agencyName: "Royal Papua New Guinea Constabulary",     agencyType: "Police",         logoUrl: "/agencies/rpngc.svg",     themeAccentColor: "#003366", flagColors: ["#003366", "#FFD700"] },
    { agencyCode: "PNGDF",     agencyName: "Papua New Guinea Defence Force",          agencyType: "Defence",        logoUrl: "/agencies/pngdf.svg",     themeAccentColor: "#1B4332", flagColors: ["#1B4332", "#FFD700"] },
    { agencyCode: "PNGCS",     agencyName: "Papua New Guinea Customs Service",        agencyType: "Service",        logoUrl: "/agencies/customs.svg",   themeAccentColor: "#7B1F1F", flagColors: ["#7B1F1F", "#FFD700"] },
    { agencyCode: "IRC",       agencyName: "Internal Revenue Commission",             agencyType: "Commission",     logoUrl: "/agencies/irc.svg",       themeAccentColor: "#0E5C2F", flagColors: ["#0E5C2F", "#FFFFFF"] },
    { agencyCode: "TREASURY",  agencyName: "Department of Treasury",                  agencyType: "Department",     logoUrl: "/agencies/treasury.svg",  themeAccentColor: "#1A3A5C", flagColors: ["#1A3A5C", "#D4AF37"] },
  ];

  const agencyMap: Record<string, string> = {};
  for (const a of agencyData) {
    const [row] = await db
      .insert(agencies)
      .values({ ...a, tenantId: tenant.id })
      .onConflictDoUpdate({
        target: agencies.agencyCode,
        set: {
          agencyName: a.agencyName,
          agencyType: a.agencyType,
          logoUrl: a.logoUrl,
          themeAccentColor: a.themeAccentColor,
          flagColors: a.flagColors,
        },
      })
      .returning();
    agencyMap[a.agencyCode] = row.id;
  }
  logger.info({ count: Object.keys(agencyMap).length }, "Auto-seed: agencies");

  // ── AGENCY ADMIN USERS ─────────────────────────────────────────────────────
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);
  const agencyUsers = [
    { fullName: "Immigration Admin",  email: "immigration.admin@npams.gov.pg", agencyCode: "PNGICA"    },
    { fullName: "Ombudsman Admin",    email: "ombudsman.admin@npams.gov.pg",   agencyCode: "OMBUDSMAN" },
    { fullName: "Police Admin",       email: "police.admin@npams.gov.pg",      agencyCode: "RPNGC"     },
    { fullName: "Defence Admin",      email: "defence.admin@npams.gov.pg",     agencyCode: "PNGDF"     },
    { fullName: "Customs Admin",      email: "customs.admin@npams.gov.pg",     agencyCode: "PNGCS"     },
    { fullName: "IRC Admin",          email: "irc.admin@npams.gov.pg",         agencyCode: "IRC"       },
    { fullName: "Treasury Admin",     email: "treasury.admin@npams.gov.pg",    agencyCode: "TREASURY"  },
  ];

  for (const u of agencyUsers) {
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
    await db.insert(userRoles).values({ userId, roleId: agencyRole.id }).onConflictDoNothing();
    await db
      .insert(userScope)
      .values({ userId, agencyId: agencyMap[u.agencyCode]! })
      .onConflictDoUpdate({ target: userScope.userId, set: { agencyId: agencyMap[u.agencyCode]!, provinceId: null } });
  }
  logger.info({ count: agencyUsers.length }, "Auto-seed: agency users");
}
