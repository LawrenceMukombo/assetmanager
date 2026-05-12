import bcrypt from "bcryptjs";
import { eq, and, or, isNull, inArray, notInArray, sql } from "drizzle-orm";
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
  assetTransfers,
  activityLogs,
  maintenanceSchedules,
  auditItems,
  auditAssignments,
  auditSessions,
  notifications,
  stockItems,
  stockBalances,
  stockMovements,
  purchaseRequests,
} from "@workspace/db";
import { logger } from "./logger";
import { ICA_PRESENCE_SITES, ICA_PRESENCE_NAMES } from "./icaPresence";

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
  await seedIcaPresenceFacilities();
  await pruneNonImmigrationFacilities();
  await seedAgencyAssets();
  await linkIcaAssetsToFacilities();
  await seedAdditionalIcaAssets();
  await seedAdditionalIcaUsers();
  await recategorizeIcaAssetsForIcsaCatalog();
  await seedAgencyStock();
  await seedIcaPerLocationStockBalances();
  await seedAssetHistory();
  await pruneLegacyCategories();

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
    { assetTag: "PNGICA-ICT-003", assetName: "Passport Printing System",                   categoryName: "Passport & Document Production", serialNumber: "MORPHO-PP-2021-001", brand: "IDEMIA",        model: "MorphoPass PP",  purchaseDate: "2021-10-10", purchaseCost: "180000", supplier: "IDEMIA Australia",  usefulLifeYears: 10, status: "active", condition: "good", salvageValue: "18000", notes: "ePassport printing & personalisation, Konedobu HQ" },
    { assetTag: "PNGICA-ICT-004", assetName: "Biometric Capture Station",                  categoryName: "Biometric & Identity Capture",   serialNumber: "MORPHO-BIO-2022-001",brand: "IDEMIA",        model: "MorphoWave",     purchaseDate: "2022-08-05", purchaseCost: "45000",  supplier: "IDEMIA Australia",  usefulLifeYears: 8,  status: "active", condition: "good", salvageValue: "4500",  notes: "Fingerprint & facial capture — passport applications" },
    { assetTag: "PNGICA-ICT-005", assetName: "Biometric Capture Station",                  categoryName: "Biometric & Identity Capture",   serialNumber: "MORPHO-BIO-2022-002",brand: "IDEMIA",        model: "MorphoWave",     purchaseDate: "2022-08-05", purchaseCost: "45000",  supplier: "IDEMIA Australia",  usefulLifeYears: 8,  status: "active", condition: "good", salvageValue: "4500",  notes: "Biometric station — Jacksons Airport" },
    { assetTag: "PNGICA-ICT-006", assetName: "ePassport Reader",                           categoryName: "Border Control Equipment",       serialNumber: "3M-CR100-001",       brand: "3M",            model: "CR100M",         purchaseDate: "2020-12-01", purchaseCost: "8500",   supplier: "Datec PNG Ltd",     usefulLifeYears: 7,  status: "active",  condition: "fair", salvageValue: "850", notes: "Passport scanner — Jacksons immigration desk 1" },
    { assetTag: "PNGICA-ICT-007", assetName: "ePassport Reader",                           categoryName: "Border Control Equipment",       serialNumber: "3M-CR100-002",       brand: "3M",            model: "CR100M",         purchaseDate: "2020-12-01", purchaseCost: "8500",   supplier: "Datec PNG Ltd",     usefulLifeYears: 7,  status: "active",  condition: "fair", salvageValue: "850", notes: "Passport scanner — Jacksons immigration desk 2" },
    { assetTag: "PNGICA-ICT-008", assetName: "ePassport Reader",                           categoryName: "Border Control Equipment",       serialNumber: "3M-CR100-003",       brand: "3M",            model: "CR100M",         purchaseDate: "2020-12-01", purchaseCost: "8500",   supplier: "Datec PNG Ltd",     usefulLifeYears: 7,  status: "missing", condition: "poor", salvageValue: "850", notes: "Passport scanner — reported missing Vanimo, Mar 2024" },
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

  // Resolve a couple of real facility IDs to demonstrate per-location stock.
  // Falls back to null (agency reserve) if a facility isn't present yet.
  const [hq] = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.facilityName, "ICSA Konedobu Headquarters")).limit(1);
  const [lae] = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.facilityName, "ICSA Lae Regional Office")).limit(1);
  const [mth] = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.facilityName, "ICSA Mt Hagen Regional Office")).limit(1);
  const hqId = hq?.id ?? null;
  const laeId = lae?.id ?? null;
  const mthId = mth?.id ?? null;

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
    // Biometric & border-control consumables (task #86) — day-to-day burn at
    // immigration desks and border posts. Sensible reorder levels keep the
    // low-stock dashboard meaningful without being alarmist.
    { itemCode: "PNGICA-STK-014", itemName: "MorphoWave Scanner Cleaning Kit",             category: "Biometric Consumables",     unitOfMeasure: "kit",      onHandQuantity: 45,  reorderLevel: 15, unitCost: "65.00",  supplier: "IDEMIA Australia",   notes: "Wipes + solution for biometric capture stations — issued monthly per site" },
    { itemCode: "PNGICA-STK-015", itemName: "Fingerprint Sensor Replacement Pad",          category: "Biometric Consumables",     unitOfMeasure: "pad",      onHandQuantity: 120, reorderLevel: 40, unitCost: "12.00",  supplier: "IDEMIA Australia",   notes: "Silicone platen pad for MorphoSmart 1300 readers" },
    { itemCode: "PNGICA-STK-016", itemName: "Biometric Card Printer Ribbon (YMCKO)",       category: "Biometric Consumables",     unitOfMeasure: "ribbon",   onHandQuantity: 18,  reorderLevel: 8,  unitCost: "240.00", supplier: "Datec PNG Ltd",      notes: "ID card / temporary permit printer — colour ribbon" },
    { itemCode: "PNGICA-STK-017", itemName: "ePassport Reader Rubber Roller",              category: "Border Control Consumables",unitOfMeasure: "roller",   onHandQuantity: 24,  reorderLevel: 10, unitCost: "38.00",  supplier: "Datec PNG Ltd",      notes: "Replacement feed roller for 3M CR100M ePassport readers" },
    { itemCode: "PNGICA-STK-018", itemName: "Border Stamp Die — Entry (replacement head)", category: "Border Control Consumables",unitOfMeasure: "die",      onHandQuantity: 14,  reorderLevel: 6,  unitCost: "85.00",  supplier: "Office National PNG",notes: "Dated rubber die for entry-stamp handles — per port" },
    { itemCode: "PNGICA-STK-019", itemName: "Border Stamp Die — Exit (replacement head)",  category: "Border Control Consumables",unitOfMeasure: "die",      onHandQuantity: 14,  reorderLevel: 6,  unitCost: "85.00",  supplier: "Office National PNG",notes: "Dated rubber die for exit-stamp handles — per port" },
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
      // Distribute the seeded total across HQ vault (agency reserve), Waigani
      // HQ, Lae regional, and Mt Hagen so the per-location view is meaningful
      // out of the box. Roughly: 50% reserve, 30% HQ, 12% Lae, 8% Mt Hagen.
      const total = it.onHandQuantity;
      const reserveQty = Math.floor(total * 0.5);
      const hqQty = Math.floor(total * 0.3);
      const laeQty = Math.floor(total * 0.12);
      const mthQty = total - reserveQty - hqQty - laeQty;

      const distributed: Array<{ facilityId: string | null; quantity: number; reorderLevel: number }> = [
        { facilityId: null, quantity: reserveQty, reorderLevel: Math.floor(it.reorderLevel * 0.5) },
      ];
      if (hqId && hqQty > 0)   distributed.push({ facilityId: hqId,  quantity: hqQty,  reorderLevel: Math.floor(it.reorderLevel * 0.3) });
      if (laeId && laeQty > 0) distributed.push({ facilityId: laeId, quantity: laeQty, reorderLevel: Math.floor(it.reorderLevel * 0.15) });
      if (mthId && mthQty > 0) distributed.push({ facilityId: mthId, quantity: mthQty, reorderLevel: Math.floor(it.reorderLevel * 0.10) });

      for (const b of distributed) {
        await db.insert(stockBalances).values({
          stockItemId: row.id,
          facilityId: b.facilityId,
          quantity: b.quantity,
          reorderLevel: b.reorderLevel,
        }).onConflictDoNothing();
      }
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
    // Generic district office only — legacy demo data (hospitals, health
    // centres, schools) is no longer auto-generated. NPAMS for ICSA is an
    // immigration asset register; non-immigration facility types do not
    // belong in the location pickers. See task #76.
    const [row] = await db.insert(facilities)
      .values({ districtId: dId, facilityName: `${d.districtName} Office`, facilityType: "Government Office" })
      .onConflictDoNothing()
      .returning();
    if (row) facilityMap[`${d.districtName} Office`] = row.id;
  }

  // Seed the curated ICSA presence sites inline (so legacy demo asset rows
  // below can resolve their facilityId). The dedicated seedIcaPresenceFacilities
  // pass later will idempotently backfill GPS / type / address.
  for (const site of ICA_PRESENCE_SITES) {
    const dId = districtMap[site.districtCode];
    if (!dId) continue;
    const [row] = await db.insert(facilities)
      .values({
        districtId: dId,
        facilityName: site.facilityName,
        facilityType: site.facilityType,
        address: site.address,
        gpsLatitude: site.lat,
        gpsLongitude: site.lng,
      })
      .onConflictDoNothing()
      .returning();
    if (row) facilityMap[site.facilityName] = row.id;
  }
  // Re-fetch all facilities to ensure the map is populated
  const allFacilities = await db.select().from(facilities);
  for (const f of allFacilities) facilityMap[f.facilityName] = f.id;
  logger.info({ count: allFacilities.length }, "Auto-seed: facilities");

  // ── ASSET CATEGORIES ────────────────────────────────────────────────────────
  // ICSA-focused catalog. Generic public-sector categories such as Medical
  // Equipment and Heavy Machinery were removed in task #80 and are pruned
  // by `pruneLegacyCategories()` below for any DB that pre-dates the change.
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
    const [row] = await db.insert(assetCategories)
      .values({ categoryName: name, categoryCode: code })
      .onConflictDoUpdate({
        target: assetCategories.categoryName,
        set: { categoryName: name, categoryCode: code },
      })
      .returning();
    categoryMap[name] = row.id;
  }
  logger.info({ count: categorySeeds.length }, "Auto-seed: categories");

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
  // Legacy demo assets are now anchored to ICSA presence facilities (the
  // hospital / provincial-HQ stand-ins were removed in task #76).
  const lahq      = facilityMap["ICSA Lae Regional Office"];
  const mthq      = facilityMap["ICSA Mt Hagen Regional Office"];
  const waigani   = facilityMap["ICSA Jacksons Airport Immigration"];
  const angau     = facilityMap["ICSA Lae Regional Office"];
  const pmgh      = facilityMap["ICSA Jacksons Airport Immigration"];
  const mthHosp   = facilityMap["ICSA Mt Hagen Regional Office"];
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
    { assetTag: "MO-MED-001", assetName: "Passport Document Scanner (Lae)",       categoryId: categoryMap["Passport & Document Production"]!, status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: angau,   brand: "3M",          model: "AT9000 Mk2",            purchaseCost: "18000",   supplier: "Datec PNG Ltd"           },
    { assetTag: "MO-MED-002", assetName: "Biometric Fingerprint Reader (Lae)",    categoryId: categoryMap["Biometric & Identity Capture"]!,   status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: angau,   brand: "IDEMIA",      model: "MorphoSmart 1300",      purchaseCost: "12000",   supplier: "IDEMIA Australia"        },
    { assetTag: "MO-MED-003", assetName: "Border Stamp Set — Entry/Exit (Lae)",   categoryId: categoryMap["Border Control Equipment"]!,        status: "missing" as const,           condition: "fair" as const,      provinceId: provinceMap["MO"]!,  districtId: laeDistId, facilityId: angau,                                           purchaseCost: "4500"                                        },
    { assetTag: "WHP-VEH-001",assetName: "Toyota Hilux Double Cab",               categoryId: categoryMap["Vehicles & Transport"]!,  status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,    brand: "Toyota",      model: "Hilux DC",              purchaseCost: "72000",   supplier: "Ela Motors PNG",         purchaseDate: "2024-03-01" },
    { assetTag: "WHP-VEH-002",assetName: "Ford Ranger 4WD",                       categoryId: categoryMap["Vehicles & Transport"]!,  status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,    brand: "Ford",        model: "Ranger XLT",            purchaseCost: "68000"                                       },
    { assetTag: "WHP-ICT-001",assetName: "HP Desktop Computer Set",               categoryId: categoryMap["ICT Equipment"]!,         status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,    brand: "HP",                          purchaseCost: "2800"                                        },
    { assetTag: "WHP-ICT-002",assetName: "Projector Epson EB-X51",                categoryId: categoryMap["ICT Equipment"]!,         status: "active" as const,            condition: "fair" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,    brand: "Epson",       model: "EB-X51",                purchaseCost: "1500"                                        },
    { assetTag: "WHP-MED-001",assetName: "Passport Document Scanner (Mt Hagen)",  categoryId: categoryMap["Passport & Document Production"]!, status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthHosp, brand: "3M",          model: "AT9000 Mk2",            purchaseCost: "18000"                                       },
    { assetTag: "WHP-MED-002",assetName: "Biometric Capture Workstation (Mt Hagen)",categoryId: categoryMap["Biometric & Identity Capture"]!, status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthHosp, brand: "IDEMIA",      model: "MorphoWave",            purchaseCost: "45000"                                       },
    { assetTag: "WHP-FUR-001",assetName: "Reception Desk Set",                    categoryId: categoryMap["Office Furniture"]!,      status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,                                            purchaseCost: "3200"                                        },
    { assetTag: "WHP-HM-001", assetName: "Backup Diesel Generator (Mt Hagen)",    categoryId: categoryMap["Buildings & Infrastructure"]!, status: "active" as const,           condition: "fair" as const,      provinceId: provinceMap["WHP"]!, districtId: mthDistId, facilityId: mthq,    brand: "Caterpillar", model: "DE110E0",               purchaseCost: "65000"                                       },
    { assetTag: "NCD-VEH-001",assetName: "Toyota Prado TX",                       categoryId: categoryMap["Vehicles & Transport"]!,  status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Toyota",      model: "Land Cruiser Prado TX", purchaseCost: "92000",                                       purchaseDate: "2024-07-15" },
    { assetTag: "NCD-VEH-002",assetName: "Mazda BT-50 Pick-up",                   categoryId: categoryMap["Vehicles & Transport"]!,  status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Mazda",       model: "BT-50",                 purchaseCost: "62000"                                       },
    { assetTag: "NCD-ICT-001",assetName: "Apple MacBook Pro 14-inch",             categoryId: categoryMap["ICT Equipment"]!,         status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Apple",       model: "MacBook Pro M3",        purchaseCost: "5500"                                        },
    { assetTag: "NCD-ICT-002",assetName: "Samsung 27-inch Monitor x5",            categoryId: categoryMap["ICT Equipment"]!,         status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Samsung",                     purchaseCost: "3500"                                        },
    { assetTag: "NCD-COM-001",assetName: "Motorola Walkie-Talkie Set (10 units)", categoryId: categoryMap["Communication Equipment"]!,status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Motorola",                    purchaseCost: "8500"                                        },
    { assetTag: "NCD-MED-001",assetName: "Passport Personalisation Press (NCD)",  categoryId: categoryMap["Passport & Document Production"]!, status: "active" as const,            condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: pmgh,    brand: "IDEMIA",      model: "MorphoPass PP",         purchaseCost: "180000",                                      purchaseDate: "2023-01-01" },
    { assetTag: "NCD-MED-002",assetName: "Biometric Capture Workstation (NCD)",   categoryId: categoryMap["Biometric & Identity Capture"]!,   status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: pmgh,    brand: "IDEMIA",      model: "MorphoWave",            purchaseCost: "45000"                                       },
    { assetTag: "NCD-MED-003",assetName: "Border Stamp Set — Entry/Exit (NCD)",   categoryId: categoryMap["Border Control Equipment"]!,        status: "missing" as const,           condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: pmgh,                                            purchaseCost: "4500"                                        },
    { assetTag: "NCD-FUR-001",assetName: "Boardroom Furniture Set",               categoryId: categoryMap["Office Furniture"]!,      status: "active" as const,            condition: "excellent" as const, provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani,                                         purchaseCost: "18000"                                       },
    { assetTag: "NCD-HM-001", assetName: "Caterpillar Generator 250KVA",          categoryId: categoryMap["Buildings & Infrastructure"]!, status: "active" as const,           condition: "good" as const,      provinceId: provinceMap["NCD"]!, districtId: ncdNEId,   facilityId: waigani, brand: "Caterpillar", model: "C9.3B",                 purchaseCost: "285000"                                      },
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
    { userId: morobeAdminId,                    title: "Asset MO-MED-003 Reported Missing",message: "Border Stamp Set — Entry/Exit assigned to ICSA Lae Regional Office has been flagged as missing. Please investigate.", readStatus: false },
    { userId: userMap["whp.admin@npams.gov.pg"],title: "Welcome to NPAMS",                message: "Your Western Highlands Provincial Asset Registry is now active.", readStatus: false },
    { userId: userMap["ncd.admin@npams.gov.pg"],title: "Welcome to NPAMS",                message: "Your National Capital District Asset Registry is now active.", readStatus: false },
  ]).onConflictDoNothing();

  logger.info("Auto-seed: initial data complete — base demo users, all PNG districts, one office per district, and demo assets seeded; non-immigration facilities (hospitals/schools/health centres) are no longer generated and are pruned on startup if present.");
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

// ── ICSA presence sites ────────────────────────────────────────────────────
// Idempotent: inserts the curated ICSA presence facility list (with GPS) into
// the right districts. Updates GPS / facility_type if the row already exists.
async function seedIcaPresenceFacilities(): Promise<void> {
  const allDistricts = await db.select({ id: districts.id, code: districts.districtCode }).from(districts);
  const districtMap: Record<string, string> = {};
  for (const d of allDistricts) if (d.code) districtMap[d.code] = d.id;

  let upserted = 0;
  for (const site of ICA_PRESENCE_SITES) {
    const districtId = districtMap[site.districtCode];
    if (!districtId) {
      logger.warn({ site }, "Auto-seed: ICSA site district missing — skipping");
      continue;
    }
    const [row] = await db
      .insert(facilities)
      .values({
        districtId,
        facilityName: site.facilityName,
        facilityType: site.facilityType,
        address: site.address,
        gpsLatitude: site.lat,
        gpsLongitude: site.lng,
      })
      .onConflictDoNothing()
      .returning({ id: facilities.id });
    if (row) {
      upserted++;
    } else {
      // Already exists — backfill GPS + type + address if any are missing/empty
      await db
        .update(facilities)
        .set({
          facilityType: site.facilityType,
          address: site.address,
          gpsLatitude: site.lat,
          gpsLongitude: site.lng,
        })
        .where(and(eq(facilities.districtId, districtId), eq(facilities.facilityName, site.facilityName)));
    }
  }
  logger.info({ inserted: upserted, total: ICA_PRESENCE_SITES.length }, "Auto-seed: ICSA presence facilities");
}

// ── Prune non-immigration facilities ───────────────────────────────────────
// NPAMS for ICSA is an immigration asset register. Sweep out hospitals,
// health centres, schools and other non-immigration legacy demo facilities
// that may have been seeded by older builds. If a stray facility still has
// records attached (assets, users, stock, purchase requests, audit
// assignments) reassign them to the nearest ICSA presence facility in the
// same district, then same province, then ICSA Konedobu HQ — and only then
// delete the empty facility. Idempotent: a fully-clean DB is a no-op.
const NON_IMMIGRATION_FACILITY_TYPES = [
  "Hospital",
  "Health Centre",
  "School",
  "University",
  "Police Station",
  "Court House",
  "Jail / Correctional",
  "Power Station",
  "Water Treatment",
];
// Legacy demo facilities (Government Office type) that pre-date the ICSA
// pivot and should also be removed if they linger in dev databases.
const DEPRECATED_LEGACY_FACILITY_NAMES = [
  "Lae Provincial Headquarters",
  "Mt Hagen Provincial Headquarters",
  "Waigani Government Precinct",
  "Lae City Authority Office",
  // NOTE: do NOT add "Huon Gulf District Office" here — it now collides
  // with the generic `${districtName} Office` fallback rows we still seed
  // per district. Removing it would wipe a legitimate district fallback.
  "Dei District Administration",
  "NCD City Hall",
];
const NON_IMMIGRATION_NAME_REGEX = /(General Hospital|Health Centre|Secondary School)$/;

async function pruneNonImmigrationFacilities(): Promise<void> {
  // Build a province → district → ICSA-presence facility lookup so we can
  // re-home orphaned records efficiently.
  const allDistricts = await db
    .select({ id: districts.id, code: districts.districtCode, provinceId: districts.provinceId })
    .from(districts);
  const districtById: Record<string, { code: string | null; provinceId: string }> = {};
  for (const d of allDistricts) districtById[d.id] = { code: d.code, provinceId: d.provinceId };

  const icaRows = await db
    .select({ id: facilities.id, name: facilities.facilityName, districtId: facilities.districtId })
    .from(facilities)
    .where(inArray(facilities.facilityName, ICA_PRESENCE_NAMES));
  if (icaRows.length === 0) {
    // No ICSA facilities in this DB — nothing to re-home to. Bail safely.
    return;
  }
  const icaByDistrict: Record<string, string> = {};
  const icaByProvince: Record<string, string> = {};
  let icaKonedobuId: string | null = null;
  for (const r of icaRows) {
    if (!icaByDistrict[r.districtId]) icaByDistrict[r.districtId] = r.id;
    const meta = districtById[r.districtId];
    if (meta && !icaByProvince[meta.provinceId]) icaByProvince[meta.provinceId] = r.id;
    if (r.name === "ICSA Konedobu Headquarters") icaKonedobuId = r.id;
  }
  const fallbackId = icaKonedobuId ?? icaRows[0]!.id;

  // Find candidate facilities to remove (excluding the ICSA presence list).
  const candidates = await db
    .select({
      id: facilities.id,
      name: facilities.facilityName,
      type: facilities.facilityType,
      districtId: facilities.districtId,
    })
    .from(facilities)
    .where(notInArray(facilities.facilityName, ICA_PRESENCE_NAMES));

  const toRemove = candidates.filter((f) => {
    if (f.type && NON_IMMIGRATION_FACILITY_TYPES.includes(f.type)) return true;
    if (NON_IMMIGRATION_NAME_REGEX.test(f.name)) return true;
    if (DEPRECATED_LEGACY_FACILITY_NAMES.includes(f.name)) return true;
    return false;
  });

  if (toRemove.length === 0) return;

  let reassigned = 0;
  let deleted = 0;
  for (const f of toRemove) {
    const meta = districtById[f.districtId];
    const target =
      icaByDistrict[f.districtId] ??
      (meta ? icaByProvince[meta.provinceId] : undefined) ??
      fallbackId;

    // Re-point any attached records to the target ICSA facility before delete.
    // (Note: users → facility is via userScope, not users directly.)
    const r1 = await db.update(assets).set({ facilityId: target }).where(eq(assets.facilityId, f.id)).returning({ id: assets.id });
    const r2 = await db.update(userScope).set({ facilityId: target }).where(eq(userScope.facilityId, f.id)).returning({ id: userScope.id });
    const r3 = await db.update(stockItems).set({ facilityId: target }).where(eq(stockItems.facilityId, f.id)).returning({ id: stockItems.id });
    // stock_balances has a unique (stock_item_id, facility_id). A naive update
    // can collide with an existing target row for the same item — so first
    // merge the source quantity into any existing target row, delete the
    // source rows that collided, then re-point the remainder.
    await db.execute(sql`
      UPDATE stock_balances tgt
      SET quantity = tgt.quantity + src.quantity, updated_at = NOW()
      FROM stock_balances src
      WHERE src.facility_id = ${f.id}
        AND tgt.facility_id = ${target}
        AND tgt.stock_item_id = src.stock_item_id
    `);
    await db.execute(sql`
      DELETE FROM stock_balances
      WHERE facility_id = ${f.id}
        AND stock_item_id IN (
          SELECT stock_item_id FROM stock_balances WHERE facility_id = ${target}
        )
    `);
    const r4 = await db.update(stockBalances).set({ facilityId: target }).where(eq(stockBalances.facilityId, f.id)).returning({ id: stockBalances.id });
    const r5 = await db.update(purchaseRequests).set({ facilityId: target }).where(eq(purchaseRequests.facilityId, f.id)).returning({ id: purchaseRequests.id });
    const r6 = await db.update(auditAssignments).set({ facilityId: target }).where(eq(auditAssignments.facilityId, f.id)).returning({ id: auditAssignments.id });
    const r7a = await db.update(assetTransfers).set({ fromFacilityId: target }).where(eq(assetTransfers.fromFacilityId, f.id)).returning({ id: assetTransfers.id });
    const r7b = await db.update(assetTransfers).set({ toFacilityId: target }).where(eq(assetTransfers.toFacilityId, f.id)).returning({ id: assetTransfers.id });
    const r8a = await db.update(stockMovements).set({ fromFacilityId: target }).where(eq(stockMovements.fromFacilityId, f.id)).returning({ id: stockMovements.id });
    const r8b = await db.update(stockMovements).set({ toFacilityId: target }).where(eq(stockMovements.toFacilityId, f.id)).returning({ id: stockMovements.id });
    const moved = r1.length + r2.length + r3.length + r4.length + r5.length + r6.length + r7a.length + r7b.length + r8a.length + r8b.length;
    if (moved > 0) {
      reassigned += moved;
      logger.info({ from: f.name, toFacilityId: target, moved }, "Auto-seed cleanup: reassigned records off non-immigration facility");
    }

    try {
      await db.delete(facilities).where(eq(facilities.id, f.id));
      deleted++;
    } catch (err) {
      logger.warn({ facility: f.name, err: (err as Error).message }, "Auto-seed cleanup: could not delete facility (likely still referenced)");
    }
  }
  logger.info({ deleted, reassigned }, "Auto-seed: pruned non-immigration facilities");
}

// Maps existing PNGICA-* asset_tag → preferred ICSA presence facility name.
// Backfills facilityId where it is currently null so map pins resolve.
const ICA_ASSET_TAG_TO_SITE: Record<string, string> = {
  "PNGICA-BLD-001": "ICSA Konedobu Headquarters",
  "PNGICA-BLD-002": "ICSA Jacksons Airport Immigration",
  "PNGICA-BLD-003": "ICSA Vanimo Border Post",
  "PNGICA-BLD-004": "ICSA Wutung Border Crossing",
  "PNGICA-BLD-005": "ICSA Lae Regional Office",
  "PNGICA-VEH-001": "ICSA Konedobu Headquarters",
  "PNGICA-VEH-002": "ICSA Vanimo Border Post",
  "PNGICA-VEH-003": "ICSA Wutung Border Crossing",
  "PNGICA-VEH-004": "ICSA Konedobu Headquarters",
  "PNGICA-VEH-005": "ICSA Konedobu Headquarters",
  "PNGICA-VEH-006": "ICSA Lae Regional Office",
  "PNGICA-VEH-007": "ICSA Vanimo Border Post",
  "PNGICA-OFF-001": "ICSA Konedobu Headquarters",
  "PNGICA-OFF-002": "ICSA Konedobu Headquarters",
  "PNGICA-OFF-003": "ICSA Konedobu Headquarters",
  "PNGICA-OFF-004": "ICSA Konedobu Headquarters",
  "PNGICA-OFF-005": "ICSA Konedobu Headquarters",
  "PNGICA-ICT-001": "ICSA Konedobu Headquarters",
  "PNGICA-ICT-002": "ICSA Konedobu Headquarters",
  "PNGICA-ICT-003": "ICSA Konedobu Headquarters",
  "PNGICA-ICT-004": "ICSA Konedobu Headquarters",
  "PNGICA-ICT-005": "ICSA Jacksons Airport Immigration",
  "PNGICA-ICT-006": "ICSA Jacksons Airport Immigration",
  "PNGICA-ICT-007": "ICSA Jacksons Airport Immigration",
  "PNGICA-ICT-008": "ICSA Vanimo Border Post",
  "PNGICA-ICT-009": "ICSA Konedobu Headquarters",
  "PNGICA-ICT-010": "ICSA Konedobu Headquarters",
  "PNGICA-ICT-011": "ICSA Konedobu Headquarters",
  "PNGICA-ICT-012": "ICSA Konedobu Headquarters",
  "PNGICA-ICT-013": "ICSA Konedobu Headquarters",
  "PNGICA-ICT-014": "ICSA Vanimo Border Post",
  "PNGICA-COM-001": "ICSA Konedobu Headquarters",
  "PNGICA-COM-002": "ICSA Vanimo Border Post",
  "PNGICA-COM-003": "ICSA Wutung Border Crossing",
};

async function linkIcaAssetsToFacilities(): Promise<void> {
  const [ica] = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.agencyCode, "PNGICA")).limit(1);
  if (!ica) return;

  const siteRows = await db
    .select({ id: facilities.id, name: facilities.facilityName })
    .from(facilities)
    .where(inArray(facilities.facilityName, Object.values(ICA_ASSET_TAG_TO_SITE)));
  const siteIdByName: Record<string, string> = {};
  for (const r of siteRows) siteIdByName[r.name] = r.id;

  let updated = 0;
  for (const [assetTag, siteName] of Object.entries(ICA_ASSET_TAG_TO_SITE)) {
    const facilityId = siteIdByName[siteName];
    if (!facilityId) continue;
    const result = await db
      .update(assets)
      .set({ facilityId })
      .where(and(eq(assets.assetTag, assetTag), eq(assets.agencyId, ica.id), isNull(assets.facilityId)))
      .returning({ id: assets.id });
    if (result.length > 0) updated++;
  }
  if (updated > 0) logger.info({ updated }, "Auto-seed: linked ICSA assets → presence facilities");
}

// Adds new ICSA assets distributed across regional offices, sea ports and
// border posts so map pins appear at multiple locations beyond HQ.
async function seedAdditionalIcaAssets(): Promise<void> {
  const [ica] = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.agencyCode, "PNGICA")).limit(1);
  if (!ica) return;

  const cats = await db.select({ id: assetCategories.id, categoryName: assetCategories.categoryName }).from(assetCategories);
  const catMap: Record<string, string> = {};
  for (const c of cats) catMap[c.categoryName] = c.id;

  const siteRows = await db
    .select({ id: facilities.id, name: facilities.facilityName })
    .from(facilities)
    .where(inArray(facilities.facilityName, ICA_PRESENCE_SITES.map((s) => s.facilityName)));
  const siteIdByName: Record<string, string> = {};
  for (const r of siteRows) siteIdByName[r.name] = r.id;

  type ExtraAsset = {
    assetTag: string; assetName: string; categoryName: string;
    serialNumber?: string; brand?: string; model?: string;
    purchaseDate: string; purchaseCost: string; supplier: string;
    usefulLifeYears: number;
    status: "active" | "missing" | "under_maintenance" | "disposed";
    condition: "excellent" | "good" | "fair" | "poor";
    salvageValue: string; notes: string;
    siteName: string;
  };
  const extras: ExtraAsset[] = [
    // Mt Hagen Regional Office
    { assetTag: "PNGICA-BLD-006", assetName: "Mt Hagen Regional Office Building", categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-MTH-2017", purchaseDate: "2017-04-18", purchaseCost: "1400000", supplier: "Hebou Constructions Ltd", usefulLifeYears: 40, status: "active", condition: "good", salvageValue: "140000", notes: "Mt Hagen regional immigration office", siteName: "ICSA Mt Hagen Regional Office" },
    { assetTag: "PNGICA-VEH-008", assetName: "Toyota Hilux Dual Cab",             categoryName: "Vehicles & Transport",       serialNumber: "MR0FZ29G801234570", brand: "Toyota", model: "Hilux SR5", purchaseDate: "2022-05-12", purchaseCost: "138000", supplier: "Ela Motors PNG",  usefulLifeYears: 8, status: "active", condition: "good", salvageValue: "13800", notes: "Mt Hagen field operations vehicle", siteName: "ICSA Mt Hagen Regional Office" },
    { assetTag: "PNGICA-ICT-015", assetName: "ePassport Reader",                  categoryName: "Border Control Equipment",   serialNumber: "3M-CR100-MTH-001", brand: "3M",     model: "CR100M",   purchaseDate: "2022-09-01", purchaseCost: "8500",   supplier: "Datec PNG Ltd",   usefulLifeYears: 7, status: "active", condition: "good", salvageValue: "850", notes: "Mt Hagen enrolment desk", siteName: "ICSA Mt Hagen Regional Office" },
    // Kokopo Regional Office
    { assetTag: "PNGICA-BLD-007", assetName: "Kokopo Regional Office",            categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-KOK-2019", purchaseDate: "2019-08-05", purchaseCost: "1300000", supplier: "Curtain Bros",          usefulLifeYears: 40, status: "active", condition: "good", salvageValue: "130000", notes: "Kokopo regional immigration office, ENB", siteName: "ICSA Kokopo Regional Office" },
    { assetTag: "PNGICA-ICT-016", assetName: "Biometric Capture Station",         categoryName: "Biometric & Identity Capture", serialNumber: "MORPHO-BIO-KOK-001", brand: "IDEMIA", model: "MorphoWave", purchaseDate: "2023-01-20", purchaseCost: "45000", supplier: "IDEMIA Australia", usefulLifeYears: 8, status: "active", condition: "excellent", salvageValue: "4500", notes: "Kokopo passport biometric station", siteName: "ICSA Kokopo Regional Office" },
    { assetTag: "PNGICA-VEH-009", assetName: "Toyota Hilux Single Cab",           categoryName: "Vehicles & Transport",       serialNumber: "MR0CZ29G601234571", brand: "Toyota", model: "Hilux Workmate", purchaseDate: "2021-03-15", purchaseCost: "82000", supplier: "Ela Motors PNG", usefulLifeYears: 8, status: "active", condition: "good", salvageValue: "8200", notes: "Kokopo logistics vehicle", siteName: "ICSA Kokopo Regional Office" },
    // Madang Regional Office
    { assetTag: "PNGICA-BLD-008", assetName: "Madang Regional Office",            categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-MAD-2020", purchaseDate: "2020-02-10", purchaseCost: "1250000", supplier: "Hornibrook NGI",        usefulLifeYears: 40, status: "active", condition: "good", salvageValue: "125000", notes: "Madang regional immigration office", siteName: "ICSA Madang Regional Office" },
    { assetTag: "PNGICA-ICT-017", assetName: "ePassport Reader",                  categoryName: "Border Control Equipment",   serialNumber: "3M-CR100-MAD-001", brand: "3M",     model: "CR100M",   purchaseDate: "2021-12-05", purchaseCost: "8500",  supplier: "Datec PNG Ltd",   usefulLifeYears: 7, status: "active", condition: "fair", salvageValue: "850", notes: "Madang enrolment desk", siteName: "ICSA Madang Regional Office" },
    // Kiunga Border Office
    { assetTag: "PNGICA-BLD-009", assetName: "Kiunga Border Office",              categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-KIU-2018", purchaseDate: "2018-11-30", purchaseCost: "950000",  supplier: "Curtain Bros",          usefulLifeYears: 40, status: "active", condition: "fair", salvageValue: "95000",  notes: "Kiunga land border office (PNG–Indonesia)", siteName: "ICSA Kiunga Border Office" },
    { assetTag: "PNGICA-COM-004", assetName: "Iridium Satellite Phone",           categoryName: "Communication Equipment",    serialNumber: "IRID-9555-003",   brand: "Iridium", model: "Extreme 9575", purchaseDate: "2022-04-10", purchaseCost: "3500", supplier: "Daltron PNG",     usefulLifeYears: 7, status: "active", condition: "good", salvageValue: "350", notes: "Kiunga emergency comms", siteName: "ICSA Kiunga Border Office" },
    // Daru Sea Port
    { assetTag: "PNGICA-BLD-010", assetName: "Daru Sea Port Office",              categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-DAR-2019", purchaseDate: "2019-05-22", purchaseCost: "850000",  supplier: "Hornibrook NGI",        usefulLifeYears: 40, status: "active", condition: "good", salvageValue: "85000",  notes: "Daru sea port office", siteName: "ICSA Daru Sea Port Office" },
    { assetTag: "PNGICA-ICT-018", assetName: "ePassport Reader",                  categoryName: "Border Control Equipment",   serialNumber: "3M-CR100-DAR-001", brand: "3M",     model: "CR100M",   purchaseDate: "2022-06-18", purchaseCost: "8500",  supplier: "Datec PNG Ltd",   usefulLifeYears: 7, status: "active", condition: "good", salvageValue: "850", notes: "Daru sea port immigration desk", siteName: "ICSA Daru Sea Port Office" },
    // Lae Sea Port
    { assetTag: "PNGICA-BLD-011", assetName: "Lae Sea Port Office",               categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-LAS-2018", purchaseDate: "2018-07-15", purchaseCost: "1100000", supplier: "Hebou Constructions Ltd",usefulLifeYears: 40, status: "active", condition: "good", salvageValue: "110000", notes: "Lae main wharf immigration office", siteName: "ICSA Lae Sea Port Office" },
    { assetTag: "PNGICA-ICT-019", assetName: "Biometric Capture Station",         categoryName: "Biometric & Identity Capture", serialNumber: "MORPHO-BIO-LAS-001", brand: "IDEMIA", model: "MorphoWave", purchaseDate: "2023-03-08", purchaseCost: "45000", supplier: "IDEMIA Australia", usefulLifeYears: 8, status: "active", condition: "excellent", salvageValue: "4500", notes: "Lae sea port crew documentation station", siteName: "ICSA Lae Sea Port Office" },
    // Rabaul Sea Port
    { assetTag: "PNGICA-BLD-012", assetName: "Rabaul Sea Port Office",            categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-RAB-2020", purchaseDate: "2020-10-12", purchaseCost: "950000",  supplier: "Curtain Bros",          usefulLifeYears: 40, status: "active", condition: "good", salvageValue: "95000",  notes: "Rabaul sea port immigration office", siteName: "ICSA Rabaul Sea Port Office" },
    // Alotau Sea Port
    { assetTag: "PNGICA-BLD-013", assetName: "Alotau Sea Port Office",            categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-ALO-2021", purchaseDate: "2021-02-25", purchaseCost: "880000",  supplier: "Hornibrook NGI",        usefulLifeYears: 40, status: "active", condition: "good", salvageValue: "88000",  notes: "Alotau sea port immigration office", siteName: "ICSA Alotau Sea Port Office" },
    // Kavieng Sea Port
    { assetTag: "PNGICA-BLD-014", assetName: "Kavieng Sea Port Office",           categoryName: "Buildings & Infrastructure", serialNumber: "PNGICA-KAV-2019", purchaseDate: "2019-12-01", purchaseCost: "830000",  supplier: "Hornibrook NGI",        usefulLifeYears: 40, status: "active", condition: "fair", salvageValue: "83000", notes: "Kavieng sea port immigration office", siteName: "ICSA Kavieng Sea Port Office" },
    { assetTag: "PNGICA-COM-005", assetName: "Motorola APX 4500 Two-Way Radio Set (10 units)", categoryName: "Communication Equipment", serialNumber: "MOTO-APX-KAV-2023", brand: "Motorola", model: "APX 4500", purchaseDate: "2023-07-12", purchaseCost: "26000", supplier: "Datec PNG Ltd", usefulLifeYears: 8, status: "active", condition: "excellent", salvageValue: "2600", notes: "Kavieng port comms set (10 units)", siteName: "ICSA Kavieng Sea Port Office" },
  ];

  let inserted = 0;
  for (const a of extras) {
    const categoryId = catMap[a.categoryName];
    const facilityId = siteIdByName[a.siteName];
    if (!categoryId || !facilityId) continue;
    const [row] = await db.insert(assets).values({
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
      facilityId,
      depreciationMethod: "straight_line",
      salvageValue: a.salvageValue,
      notes: a.notes,
    }).onConflictDoNothing().returning({ id: assets.id });
    if (row) inserted++;
  }
  if (inserted > 0) logger.info({ inserted, agency: "PNGICA" }, "Auto-seed: additional ICSA assets");
}

// Adds 10+ ICSA staff users (besides the existing immigration.admin) covering
// executive, divisions, regional offices and border posts. All idempotent.
async function seedAdditionalIcaUsers(): Promise<void> {
  const [ica] = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.agencyCode, "PNGICA")).limit(1);
  if (!ica) return;
  const [agencyRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.roleName, "Agency Admin")).limit(1);
  if (!agencyRole) return;

  // The roles table currently only ships one agency-scoped role
  // ("Agency Admin"); the others are National/Provincial/Super. We therefore
  // assign Agency Admin to every ICSA user but vary jobTitle, department and
  // home facility so the roster is meaningful.
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);
  type IcaUser = {
    fullName: string; email: string; title: string;
    department: string;
    homeSite: string; // must match an ICA presence facilityName
  };
  const HQ = "ICSA Konedobu Headquarters";
  const icaUsers: IcaUser[] = [
    { fullName: "Stanis Hulahau",   email: "stanis.hulahau@ica.gov.pg",   title: "Director General",                              department: "Executive",                  homeSite: HQ },
    { fullName: "Robert Kennedy",   email: "robert.kennedy@ica.gov.pg",   title: "Deputy DG — Operations",                        department: "Executive",                  homeSite: HQ },
    { fullName: "Esther Bagari",    email: "esther.bagari@ica.gov.pg",    title: "Deputy DG — Corporate Services",                department: "Corporate Services",         homeSite: HQ },
    { fullName: "Mathew Bilong",    email: "mathew.bilong@ica.gov.pg",    title: "Director, Border Operations",                   department: "Border Operations",          homeSite: HQ },
    { fullName: "Joyce Marewu",     email: "joyce.marewu@ica.gov.pg",     title: "Director, Citizenship & Passports",             department: "Citizenship & Passports",    homeSite: HQ },
    { fullName: "Peter Yawi",       email: "peter.yawi@ica.gov.pg",       title: "Director, Visa Operations",                     department: "Visa Operations",            homeSite: HQ },
    { fullName: "Maria Tanda",      email: "maria.tanda@ica.gov.pg",      title: "Manager, Lae Regional Office",                  department: "Regional Operations",        homeSite: "ICSA Lae Regional Office" },
    { fullName: "Samson Wapi",      email: "samson.wapi@ica.gov.pg",      title: "Manager, Mt Hagen Regional Office",             department: "Regional Operations",        homeSite: "ICSA Mt Hagen Regional Office" },
    { fullName: "Grace Tomu",       email: "grace.tomu@ica.gov.pg",       title: "Manager, Kokopo Regional Office",               department: "Regional Operations",        homeSite: "ICSA Kokopo Regional Office" },
    { fullName: "Joseph Kambian",   email: "joseph.kambian@ica.gov.pg",   title: "Officer-in-Charge, Vanimo Border Post",         department: "Border Operations",          homeSite: "ICSA Vanimo Border Post" },
    { fullName: "Lucy Womai",       email: "lucy.womai@ica.gov.pg",       title: "Officer-in-Charge, Wutung Crossing",            department: "Border Operations",          homeSite: "ICSA Wutung Border Crossing" },
    { fullName: "Aaron Kalo",       email: "aaron.kalo@ica.gov.pg",       title: "Chief, Jacksons Airport Immigration",           department: "Border Operations",          homeSite: "ICSA Jacksons Airport Immigration" },
    { fullName: "Helen Pala",       email: "helen.pala@ica.gov.pg",       title: "Records & Stationery Custodian",                department: "Corporate Services",         homeSite: HQ },
    { fullName: "Daniel Maima",     email: "daniel.maima@ica.gov.pg",     title: "ICT Manager",                                   department: "Information Technology",     homeSite: HQ },
  ];

  // Resolve home-site facilityIds in one round-trip.
  const siteRows = await db
    .select({ id: facilities.id, name: facilities.facilityName })
    .from(facilities)
    .where(inArray(facilities.facilityName, ICA_PRESENCE_SITES.map((s) => s.facilityName)));
  const siteIdByName: Record<string, string> = {};
  for (const r of siteRows) siteIdByName[r.name] = r.id;

  for (const u of icaUsers) {
    const homeFacilityId = siteIdByName[u.homeSite] ?? null;
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1);
    let userId: string;
    if (existing.length > 0) {
      userId = existing[0].id;
      // Backfill jobTitle / department in case earlier seed runs created the
      // user without them (idempotent — safe to overwrite to canonical values).
      await db
        .update(users)
        .set({ fullName: u.fullName, jobTitle: u.title, department: u.department })
        .where(eq(users.id, userId));
    } else {
      const [row] = await db
        .insert(users)
        .values({
          fullName: u.fullName,
          email: u.email,
          passwordHash: hash,
          jobTitle: u.title,
          department: u.department,
        })
        .returning();
      userId = row.id;
    }
    await db.insert(userRoles).values({ userId, roleId: agencyRole.id }).onConflictDoNothing();
    await db
      .insert(userScope)
      .values({ userId, agencyId: ica.id, facilityId: homeFacilityId })
      .onConflictDoUpdate({
        target: userScope.userId,
        set: { agencyId: ica.id, provinceId: null, facilityId: homeFacilityId },
      });
  }
  logger.info({ count: icaUsers.length, agency: "PNGICA" }, "Auto-seed: ICSA staff users");
}

// Distributes per-location stock balances for every PNGICA stock item across
// the full ICSA presence facility set, in addition to the existing 4-bucket
// distribution. Idempotent: only inserts a balance row where one does not
// already exist for that (item, facility) pair, so existing balances and any
// prior movements stay intact.
async function seedIcaPerLocationStockBalances(): Promise<void> {
  const [ica] = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.agencyCode, "PNGICA")).limit(1);
  if (!ica) return;

  const items = await db
    .select({ id: stockItems.id, itemCode: stockItems.itemCode, reorderLevel: stockItems.reorderLevel })
    .from(stockItems)
    .where(and(eq(stockItems.agencyId, ica.id), isNull(stockItems.deletedAt)));

  const siteRows = await db
    .select({ id: facilities.id, name: facilities.facilityName })
    .from(facilities)
    .where(inArray(facilities.facilityName, ICA_PRESENCE_SITES.map((s) => s.facilityName)));

  // Per-site share of the item's reorder level — chosen so most sites get a
  // small working stock and a couple of border posts intentionally sit at or
  // near the reorder line for low-stock demos.
  const siteShare: Record<string, number> = {
    "ICSA Konedobu Headquarters":        80,
    "ICSA Jacksons Airport Immigration": 40,
    "ICSA Lae Regional Office":          25,
    "ICSA Mt Hagen Regional Office":     20,
    "ICSA Kokopo Regional Office":       18,
    "ICSA Madang Regional Office":       15,
    "ICSA Vanimo Border Post":           12,
    "ICSA Wutung Border Crossing":       8,
    "ICSA Kiunga Border Office":         6,
    "ICSA Daru Sea Port Office":         5,
    "ICSA Lae Sea Port Office":          14,
    "ICSA Rabaul Sea Port Office":       7,
    "ICSA Alotau Sea Port Office":       6,
    "ICSA Kavieng Sea Port Office":      5,
  };

  let inserts = 0;
  for (const item of items) {
    for (const site of siteRows) {
      const sharePct = siteShare[site.name] ?? 5;
      const qty = Math.max(1, Math.round((item.reorderLevel || 10) * (sharePct / 100)));
      const reorderForSite = Math.max(1, Math.floor((item.reorderLevel || 10) * (sharePct / 200)));
      const inserted = await db.insert(stockBalances).values({
        stockItemId: item.id,
        facilityId: site.id,
        quantity: qty,
        reorderLevel: reorderForSite,
      }).onConflictDoNothing().returning({ id: stockBalances.id });
      if (inserted.length > 0) inserts++;
    }
  }
  if (inserts > 0) logger.info({ inserts }, "Auto-seed: ICSA per-location stock balances");

  // Enforce ICSA-only stock locations: any PNGICA stock balance attached to a
  // non-ICSA facility (or to no facility at all) is a leftover from earlier
  // seed runs that targeted generic provincial HQs. Remove them so source/
  // destination pickers in Stock & Inventory only ever offer ICSA presence
  // sites for PNGICA items. Idempotent.
  const presenceIds = siteRows.map((s) => s.id);
  const itemIds = items.map((i) => i.id);
  if (itemIds.length > 0) {
    const removed = await db
      .delete(stockBalances)
      .where(
        and(
          inArray(stockBalances.stockItemId, itemIds),
          presenceIds.length > 0
            ? or(isNull(stockBalances.facilityId), notInArray(stockBalances.facilityId, presenceIds))!
            : sql`true`,
        ),
      )
      .returning({ id: stockBalances.id });
    if (removed.length > 0) {
      logger.info({ removed: removed.length }, "Auto-seed: removed PNGICA stock balances at non-ICSA facilities");
    }
  }
}

// ── ASSET HISTORY: depreciation defaults + transfer history + activity log ───
// Idempotent — backfills missing depreciation fields, then for each seeded
// asset that has no transfers/activity yet, creates a believable history.
async function seedAssetHistory(): Promise<void> {
  // 1) Backfill depreciation fields on assets that were seeded without them.
  await backfillDepreciationDefaults();

  // 2) Per-asset history (transfers + activity log). Skips any asset that
  //    already has rows so server restarts and real user actions never get
  //    duplicated.
  await seedPerAssetHistory();
}

// Demo asset prefixes — only assets whose tag starts with one of these are
// touched by the history seeder. Real, user-created assets (any other tag,
// e.g. test fixtures or assets created via the UI) are left alone so that
// repeated server starts cannot mutate non-demo records.
const DEMO_ASSET_PREFIXES = ["MO-", "WHP-", "NCD-", "PNGICA-"] as const;

function isDemoAssetTag(tag: string | null | undefined): boolean {
  if (!tag) return false;
  return DEMO_ASSET_PREFIXES.some((p) => tag.startsWith(p));
}

const CATEGORY_DEFAULTS: Record<string, { life: number; salvagePct: number }> = {
  "ICT Equipment":                  { life: 5,  salvagePct: 0.10 },
  "Vehicles & Transport":           { life: 8,  salvagePct: 0.10 },
  "Office Furniture":               { life: 12, salvagePct: 0.10 },
  "Buildings & Infrastructure":     { life: 40, salvagePct: 0.10 },
  "Communication Equipment":        { life: 8,  salvagePct: 0.10 },
  "Passport & Document Production": { life: 8,  salvagePct: 0.10 },
  "Biometric & Identity Capture":   { life: 7,  salvagePct: 0.10 },
  "Border Control Equipment":       { life: 6,  salvagePct: 0.05 },
  "Uniforms & Accoutrements":       { life: 4,  salvagePct: 0.05 },
  // Legacy — kept here so any pre-task-#80 assets that still carry these
  // categories receive sensible depreciation defaults until the prune step
  // re-homes them.
  "Medical Equipment":              { life: 10, salvagePct: 0.05 },
  "Heavy Machinery":                { life: 15, salvagePct: 0.10 },
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function backfillDepreciationDefaults(): Promise<void> {
  const cats = await db.select({ id: assetCategories.id, categoryName: assetCategories.categoryName }).from(assetCategories);
  const catNameById: Record<string, string> = {};
  for (const c of cats) catNameById[c.id] = c.categoryName;

  const rows = await db
    .select({
      id: assets.id,
      assetTag: assets.assetTag,
      categoryId: assets.categoryId,
      purchaseCost: assets.purchaseCost,
      purchaseDate: assets.purchaseDate,
      usefulLifeYears: assets.usefulLifeYears,
      salvageValue: assets.salvageValue,
      depreciationMethod: assets.depreciationMethod,
      createdAt: assets.createdAt,
    })
    .from(assets)
    .where(isNull(assets.deletedAt));

  let updated = 0;
  for (const a of rows) {
    if (!isDemoAssetTag(a.assetTag)) continue;
    const catName = a.categoryId ? catNameById[a.categoryId] : undefined;
    const defaults = catName ? CATEGORY_DEFAULTS[catName] : undefined;
    const patch: Partial<typeof assets.$inferInsert> = {};

    if (a.depreciationMethod === "none") patch.depreciationMethod = "straight_line";

    if (!a.usefulLifeYears && defaults) patch.usefulLifeYears = defaults.life;

    if (!a.purchaseDate) {
      // Fall back to ~3 years before created_at so depreciation has elapsed.
      const base = a.createdAt ? new Date(a.createdAt) : new Date();
      base.setFullYear(base.getFullYear() - 3);
      patch.purchaseDate = ymd(base);
    }

    if (!a.salvageValue && a.purchaseCost && defaults) {
      const cost = parseFloat(a.purchaseCost);
      patch.salvageValue = (cost * defaults.salvagePct).toFixed(2);
    }

    if (Object.keys(patch).length > 0) {
      await db.update(assets).set(patch).where(eq(assets.id, a.id));
      updated++;
    }
  }
  if (updated > 0) logger.info({ updated }, "Auto-seed: backfilled depreciation defaults");
}

// Tiny deterministic hash → integer in [0, m).
function hashMod(s: string, m: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % m;
}

const TRANSFER_REASONS = [
  "Reassignment to operational priority site",
  "Facility consolidation",
  "Loaned to district office for temporary use",
  "Returned from maintenance facility",
  "Officer transfer — equipment follows custodian",
  "Re-allocation following annual asset review",
  "Replacing decommissioned unit at destination",
  "Capacity boost for high-demand site",
];

async function seedPerAssetHistory(): Promise<void> {
  // Load assets with their current location.
  const assetRows = await db
    .select({
      id: assets.id,
      assetTag: assets.assetTag,
      assetName: assets.assetName,
      status: assets.status,
      provinceId: assets.provinceId,
      agencyId: assets.agencyId,
      districtId: assets.districtId,
      facilityId: assets.facilityId,
      purchaseDate: assets.purchaseDate,
      createdAt: assets.createdAt,
      createdBy: assets.createdBy,
    })
    .from(assets)
    .where(isNull(assets.deletedAt));

  if (assetRows.length === 0) return;

  // Pre-resolve province for each facility (used when an asset is agency-scoped
  // and has no provinceId of its own).
  const facilityIds = Array.from(new Set(assetRows.map((a) => a.facilityId).filter((v): v is string => !!v)));
  const facilityProvince: Record<string, { provinceId: string | null; districtId: string | null }> = {};
  if (facilityIds.length > 0) {
    const fRows = await db
      .select({
        facilityId: facilities.id,
        districtId: facilities.districtId,
        provinceId: districts.provinceId,
      })
      .from(facilities)
      .leftJoin(districts, eq(facilities.districtId, districts.id))
      .where(inArray(facilities.id, facilityIds));
    for (const r of fRows) {
      facilityProvince[r.facilityId] = { provinceId: r.provinceId ?? null, districtId: r.districtId ?? null };
    }
  }

  // Per-province alternative facilities to use as "from" sources.
  const allFacRows = await db
    .select({
      id: facilities.id,
      name: facilities.facilityName,
      districtId: facilities.districtId,
      provinceId: districts.provinceId,
    })
    .from(facilities)
    .leftJoin(districts, eq(facilities.districtId, districts.id));
  const facByProvince: Record<string, Array<{ id: string; name: string; districtId: string | null }>> = {};
  for (const f of allFacRows) {
    const pid = f.provinceId ?? "__none__";
    (facByProvince[pid] ??= []).push({ id: f.id, name: f.name, districtId: f.districtId ?? null });
  }

  // Pick a pool of seeded users to attribute history to. Prefer named non-superadmin.
  const userRows = await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users);
  const userPool = userRows.filter((u) => !u.email.startsWith("superadmin@"));
  const fallbackUserId = (userRows[0]?.id) ?? null;
  if (!fallbackUserId) return;

  // Existing maintenance schedules per asset (used to weave linked entries).
  const maintRows = await db
    .select({
      id: maintenanceSchedules.id,
      assetId: maintenanceSchedules.assetId,
      title: maintenanceSchedules.title,
      status: maintenanceSchedules.status,
      scheduledDate: maintenanceSchedules.scheduledDate,
      completedDate: maintenanceSchedules.completedDate,
    })
    .from(maintenanceSchedules);
  const maintByAsset: Record<string, typeof maintRows> = {};
  for (const m of maintRows) (maintByAsset[m.assetId] ??= []).push(m);

  // Existing transfer + activity counts per asset, for idempotency.
  const existingTransfers = await db
    .select({ assetId: assetTransfers.assetId })
    .from(assetTransfers);
  const hasTransfer = new Set(existingTransfers.map((r) => r.assetId));

  const existingActivity = await db
    .select({ entityId: activityLogs.entityId })
    .from(activityLogs)
    .where(eq(activityLogs.entityType, "asset"));
  const hasActivity = new Set(existingActivity.map((r) => r.entityId).filter((v): v is string => !!v));

  // Existing audit items per asset (used to weave linked AUDIT events).
  const auditRows = await db
    .select({
      id: auditItems.id,
      assetId: auditItems.assetId,
      status: auditItems.status,
      conditionObserved: auditItems.conditionObserved,
      verifiedAt: auditItems.verifiedAt,
      verifiedBy: auditItems.verifiedBy,
      sessionName: auditSessions.name,
      sessionId: auditSessions.id,
    })
    .from(auditItems)
    .leftJoin(auditAssignments, eq(auditItems.assignmentId, auditAssignments.id))
    .leftJoin(auditSessions, eq(auditAssignments.sessionId, auditSessions.id));
  const auditByAsset: Record<string, typeof auditRows> = {};
  for (const r of auditRows) (auditByAsset[r.assetId] ??= []).push(r);

  let transfersInserted = 0;
  let activityInserted = 0;
  let skippedNonDemo = 0;

  for (const a of assetRows) {
    // Demo-only: never touch user-created or test assets.
    if (!isDemoAssetTag(a.assetTag)) {
      skippedNonDemo++;
      continue;
    }

    // Resolve "current" province/district/facility for this asset.
    let currProvinceId = a.provinceId;
    let currDistrictId = a.districtId;
    if (!currProvinceId && a.facilityId && facilityProvince[a.facilityId]) {
      currProvinceId = facilityProvince[a.facilityId].provinceId;
      currDistrictId = currDistrictId ?? facilityProvince[a.facilityId].districtId;
    }
    const currFacilityId = a.facilityId ?? null;

    // Pick a deterministic actor user.
    const actor = userPool.length > 0
      ? userPool[hashMod(a.id, userPool.length)]
      : { id: fallbackUserId, fullName: "System" };

    // ── Transfers ────────────────────────────────────────────────────────
    type TransferRecord = { id: string; transferredAt: Date; reason: string };
    const seededTransfers: TransferRecord[] = [];

    if (!hasTransfer.has(a.id) && currProvinceId) {
      // Choose 0–3 transfers for ~50% of assets, deterministically.
      const bucket = hashMod(a.id, 10);
      const numTransfers = bucket < 1 ? 3 : bucket < 3 ? 2 : bucket < 5 ? 1 : 0;

      if (numTransfers > 0) {
        // Build pool of possible "from" facilities — same province first,
        // then any other facility, excluding the current one.
        const sameProvincePool = (facByProvince[currProvinceId] ?? [])
          .filter((f) => f.id !== currFacilityId);
        const fromPool = sameProvincePool.length > 0
          ? sameProvincePool
          : allFacRows.filter((f) => f.id !== currFacilityId).map((f) => ({ id: f.id, name: f.name, districtId: f.districtId ?? null }));

        // Spread transfers between purchaseDate and ~3 months ago.
        const start = a.purchaseDate
          ? new Date(a.purchaseDate)
          : (a.createdAt ? new Date(a.createdAt) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 3));
        const end = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90);
        if (end.getTime() > start.getTime() && fromPool.length > 0) {
          const span = end.getTime() - start.getTime();
          for (let i = 0; i < numTransfers; i++) {
            const fromFac = fromPool[hashMod(a.id + ":from:" + i, fromPool.length)];
            const reason = TRANSFER_REASONS[hashMod(a.id + ":r:" + i, TRANSFER_REASONS.length)];
            const offset = Math.floor(span * ((i + 1) / (numTransfers + 1)));
            const ts = new Date(start.getTime() + offset);
            const fromProvinceId = (allFacRows.find((f) => f.id === fromFac.id)?.provinceId) ?? currProvinceId;
            const transferredBy = userPool.length > 0
              ? userPool[hashMod(a.id + ":by:" + i, userPool.length)].id
              : fallbackUserId;
            const [row] = await db
              .insert(assetTransfers)
              .values({
                assetId: a.id,
                fromProvinceId,
                fromDistrictId: fromFac.districtId,
                fromFacilityId: fromFac.id,
                toProvinceId: currProvinceId,
                toDistrictId: currDistrictId ?? null,
                toFacilityId: currFacilityId,
                transferredBy,
                reason,
                transferredAt: ts,
              })
              .returning({ id: assetTransfers.id });
            if (row) {
              seededTransfers.push({ id: row.id, transferredAt: ts, reason });
              transfersInserted++;
            }
          }
        }
      }
    }

    // ── Activity log ─────────────────────────────────────────────────────
    if (hasActivity.has(a.id)) continue;

    type LogEvent = {
      actionType: string;
      description: string;
      createdAt: Date;
      userId: string;
      metadata?: Record<string, unknown>;
    };
    const events: LogEvent[] = [];

    const createdAt = a.purchaseDate
      ? new Date(a.purchaseDate)
      : (a.createdAt ? new Date(a.createdAt) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 365));
    const creatorId = a.createdBy ?? actor.id;

    events.push({
      actionType: "CREATE",
      description: `Registered asset ${a.assetTag} - ${a.assetName}`,
      createdAt,
      userId: creatorId,
      metadata: { assetTag: a.assetTag },
    });

    // 1–3 update events spread between creation and now.
    const numUpdates = 1 + hashMod(a.id + ":u", 3); // 1, 2 or 3
    const now = new Date();
    const lifeSpan = Math.max(1000 * 60 * 60 * 24 * 30, now.getTime() - createdAt.getTime());
    const updateDescriptions = [
      "Updated condition assessment after annual audit",
      "Reassigned custodian following staff rotation",
      "Updated supplier contact details",
      "Refreshed inventory record with serial number verification",
      "Photo and notes updated during site visit",
    ];
    for (let i = 0; i < numUpdates; i++) {
      const offset = Math.floor(lifeSpan * ((i + 1) / (numUpdates + 2)));
      const desc = updateDescriptions[hashMod(a.id + ":ud:" + i, updateDescriptions.length)];
      const u = userPool.length > 0
        ? userPool[hashMod(a.id + ":uu:" + i, userPool.length)]
        : { id: fallbackUserId, fullName: "System" };
      events.push({
        actionType: "UPDATE",
        description: desc,
        createdAt: new Date(createdAt.getTime() + offset),
        userId: u.id,
      });
    }

    // Transfer events (already inserted above; mirror them in the log).
    for (const t of seededTransfers) {
      events.push({
        actionType: "TRANSFER",
        description: `Transferred asset ${a.assetTag}: ${t.reason}`,
        createdAt: t.transferredAt,
        userId: actor.id,
        metadata: { transferId: t.id, reason: t.reason },
      });
    }

    // Maintenance link events (one per existing schedule).
    const maint = maintByAsset[a.id] ?? [];
    for (const m of maint) {
      events.push({
        actionType: "MAINTENANCE_SCHEDULED",
        description: `Maintenance scheduled: ${m.title}`,
        createdAt: m.scheduledDate ?? createdAt,
        userId: actor.id,
        metadata: { maintenanceId: m.id },
      });
      if (m.status === "completed" && m.completedDate) {
        events.push({
          actionType: "MAINTENANCE_COMPLETED",
          description: `Maintenance completed: ${m.title}`,
          createdAt: m.completedDate,
          userId: actor.id,
          metadata: { maintenanceId: m.id },
        });
      }
    }

    // Audit-linked events (one per existing audit item for this asset).
    const audits = auditByAsset[a.id] ?? [];
    for (const ai of audits) {
      const ts = ai.verifiedAt ?? new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14);
      const sessionLabel = ai.sessionName ? ` (${ai.sessionName})` : "";
      let actionType = "AUDIT_PENDING";
      let desc = `Audit pending${sessionLabel}`;
      if (ai.status === "verified") {
        actionType = "AUDIT_VERIFIED";
        desc = `Audit verified${sessionLabel}${ai.conditionObserved ? ` — condition ${ai.conditionObserved}` : ""}`;
      } else if (ai.status === "not_found") {
        actionType = "AUDIT_NOT_FOUND";
        desc = `Audit could not locate asset${sessionLabel}`;
      } else if (ai.status === "damaged") {
        actionType = "AUDIT_DAMAGED";
        desc = `Audit reported asset damaged${sessionLabel}`;
      }
      events.push({
        actionType,
        description: desc,
        createdAt: ts,
        userId: ai.verifiedBy ?? actor.id,
        metadata: { auditItemId: ai.id, auditSessionId: ai.sessionId, status: ai.status },
      });
    }

    // Status-derived events for non-active assets.
    if (a.status === "under_maintenance") {
      events.push({
        actionType: "STATUS_TO_MAINTENANCE",
        description: "Asset placed under maintenance",
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 21),
        userId: actor.id,
      });
    } else if (a.status === "missing") {
      events.push({
        actionType: "STATUS_REPORTED_MISSING",
        description: "Asset reported missing during stocktake",
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 60),
        userId: actor.id,
      });
    } else if (a.status === "disposed") {
      events.push({
        actionType: "STATUS_DISPOSED",
        description: "Asset disposed and written off the register",
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30),
        userId: actor.id,
      });
    }

    // Insert activity events in chronological order.
    events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (events.length > 0) {
      await db.insert(activityLogs).values(
        events.map((e) => ({
          userId: e.userId,
          actionType: e.actionType,
          entityType: "asset",
          entityId: a.id,
          description: e.description,
          metadata: e.metadata ?? null,
          createdAt: e.createdAt,
        })),
      );
      activityInserted += events.length;
    }
  }

  if (transfersInserted > 0 || activityInserted > 0) {
    logger.info(
      { transfers: transfersInserted, activity: activityInserted, assets: assetRows.length, skippedNonDemo },
      "Auto-seed: asset history (demo assets only)",
    );
  }
}

/**
 * Idempotent re-categorisation of pre-existing PNGICA assets that were seeded
 * before the ICSA-specific catalog (task #80) existed. Maps known asset tags
 * to their correct ICSA category by name. Safe to run repeatedly: it only
 * updates rows where the assetTag matches and the new category exists.
 */
async function recategorizeIcaAssetsForIcsaCatalog(): Promise<void> {
  const tagToCategory: Record<string, string> = {
    "PNGICA-ICT-003": "Passport & Document Production",
    "PNGICA-ICT-004": "Biometric & Identity Capture",
    "PNGICA-ICT-005": "Biometric & Identity Capture",
    "PNGICA-ICT-006": "Border Control Equipment",
    "PNGICA-ICT-007": "Border Control Equipment",
    "PNGICA-ICT-008": "Border Control Equipment",
    "PNGICA-ICT-015": "Border Control Equipment",
    "PNGICA-ICT-016": "Biometric & Identity Capture",
    "PNGICA-ICT-017": "Border Control Equipment",
    "PNGICA-ICT-018": "Border Control Equipment",
    "PNGICA-ICT-019": "Biometric & Identity Capture",
  };

  const cats = await db
    .select({ id: assetCategories.id, name: assetCategories.categoryName })
    .from(assetCategories);
  const catId: Record<string, string> = {};
  for (const c of cats) catId[c.name] = c.id;

  let updated = 0;
  for (const [tag, catName] of Object.entries(tagToCategory)) {
    const targetCatId = catId[catName];
    if (!targetCatId) continue;
    const r = await db
      .update(assets)
      .set({ categoryId: targetCatId })
      .where(eq(assets.assetTag, tag))
      .returning({ id: assets.id });
    updated += r.length;
  }
  if (updated > 0) {
    logger.info({ updated }, "Auto-seed: recategorized ICSA assets to new ICSA-specific catalog");
  }
}

/**
 * Idempotent prune of legacy generic categories ("Medical Equipment",
 * "Heavy Machinery") that were dropped in task #80 in favour of the
 * ICSA-specific catalog. Any pre-existing assets in those categories are
 * re-homed (legacy MO/WHP/NCD demo tags use a curated mapping; anything
 * else falls back to "Buildings & Infrastructure"), then the empty
 * categories are deleted. Safe to run on each startup.
 */
async function pruneLegacyCategories(): Promise<void> {
  const LEGACY_CATEGORY_NAMES = ["Medical Equipment", "Heavy Machinery"];

  // Curated re-homing for the legacy demo tags from seedInitialData. Keeps
  // existing demo dashboards / notifications meaningful.
  const LEGACY_TAG_REMAP: Record<string, { name: string; category: string }> = {
    "MO-MED-001":  { name: "Passport Document Scanner (Lae)",            category: "Passport & Document Production" },
    "MO-MED-002":  { name: "Biometric Fingerprint Reader (Lae)",         category: "Biometric & Identity Capture"   },
    "MO-MED-003":  { name: "Border Stamp Set — Entry/Exit (Lae)",        category: "Border Control Equipment"       },
    "WHP-MED-001": { name: "Passport Document Scanner (Mt Hagen)",       category: "Passport & Document Production" },
    "WHP-MED-002": { name: "Biometric Capture Workstation (Mt Hagen)",   category: "Biometric & Identity Capture"   },
    "WHP-HM-001":  { name: "Backup Diesel Generator (Mt Hagen)",         category: "Buildings & Infrastructure"     },
    "NCD-MED-001": { name: "Passport Personalisation Press (NCD)",       category: "Passport & Document Production" },
    "NCD-MED-002": { name: "Biometric Capture Workstation (NCD)",        category: "Biometric & Identity Capture"   },
    "NCD-MED-003": { name: "Border Stamp Set — Entry/Exit (NCD)",        category: "Border Control Equipment"       },
    "NCD-HM-001":  { name: "Caterpillar Generator 250KVA",               category: "Buildings & Infrastructure"     },
  };

  const cats = await db
    .select({ id: assetCategories.id, name: assetCategories.categoryName })
    .from(assetCategories);
  const catIdByName: Record<string, string> = {};
  for (const c of cats) catIdByName[c.name] = c.id;

  const legacyIds = cats.filter((c) => LEGACY_CATEGORY_NAMES.includes(c.name)).map((c) => c.id);
  if (legacyIds.length === 0) return;

  const fallbackId = catIdByName["Buildings & Infrastructure"];

  // Step 1: rename + recategorise the curated legacy demo tags.
  let demoUpdated = 0;
  for (const [tag, target] of Object.entries(LEGACY_TAG_REMAP)) {
    const targetCatId = catIdByName[target.category];
    if (!targetCatId) continue;
    const r = await db
      .update(assets)
      .set({ assetName: target.name, categoryId: targetCatId })
      .where(eq(assets.assetTag, tag))
      .returning({ id: assets.id });
    demoUpdated += r.length;
  }

  // Step 2: any remaining assets in legacy categories → fallback (so we can
  // safely delete the categories).
  let othersMoved = 0;
  if (fallbackId) {
    const r = await db
      .update(assets)
      .set({ categoryId: fallbackId })
      .where(inArray(assets.categoryId, legacyIds))
      .returning({ id: assets.id });
    othersMoved = r.length;
  }

  // Step 3: delete the now-empty legacy categories.
  const deleted = await db
    .delete(assetCategories)
    .where(inArray(assetCategories.id, legacyIds))
    .returning({ id: assetCategories.id });

  if (demoUpdated > 0 || othersMoved > 0 || deleted.length > 0) {
    logger.info(
      { demoUpdated, othersMoved, deletedCategories: deleted.length },
      "Auto-seed: pruned legacy generic categories (Medical Equipment / Heavy Machinery)",
    );
  }
}
