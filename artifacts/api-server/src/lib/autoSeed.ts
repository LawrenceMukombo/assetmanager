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

  if (usersExist && agenciesExist) {
    logger.info("Auto-seed: database already seeded, skipping");
    return;
  }

  if (!usersExist) {
    logger.info("Auto-seed: empty database detected — seeding all reference data...");
    await seedInitialData();
  }

  if (!agenciesExist) {
    logger.info("Auto-seed: agencies missing — seeding agencies and agency users...");
    await seedAgencies();
  }

  logger.info("Auto-seed: complete. Default password: Admin1234!");
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
