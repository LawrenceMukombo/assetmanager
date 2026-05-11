/**
 * Curated list of ICSA (PNG Immigration & Citizenship Authority) physical
 * presence sites — HQ, regional immigration offices, land border posts, sea
 * ports, and international airport immigration desks. Used to:
 *   1. Seed real facilities (with GPS) for these sites in autoSeed.
 *   2. Restrict the agency-scoped facility pickers in /v1/locations/facilities*
 *      so PNGICA users only see ICSA presence sites in Stock & Inventory
 *      location dropdowns.
 *
 * Each entry must reference an existing seeded district by code.
 */
export interface IcaSite {
  facilityName: string;
  districtCode: string;
  facilityType: string;
  lat: string;
  lng: string;
  address: string;
}

export const ICA_PRESENCE_SITES: IcaSite[] = [
  { facilityName: "ICSA Konedobu Headquarters",        districtCode: "NCD-NW", facilityType: "Government Office", lat: "-9.4485000", lng: "147.1525000", address: "Konedobu, Port Moresby" },
  { facilityName: "ICSA Jacksons Airport Immigration", districtCode: "NCD-NE", facilityType: "Border Post",       lat: "-9.4434000", lng: "147.2200000", address: "Jacksons International Airport, NCD" },
  { facilityName: "ICSA Vanimo Border Post",           districtCode: "SA-VG",  facilityType: "Border Post",       lat: "-2.6906000", lng: "141.3019000", address: "Vanimo, Sandaun" },
  { facilityName: "ICSA Wutung Border Crossing",       districtCode: "SA-VG",  facilityType: "Border Post",       lat: "-2.5965000", lng: "141.0118000", address: "Wutung, Sandaun (PNG–Indonesia border)" },
  { facilityName: "ICSA Lae Regional Office",          districtCode: "MO-LAE", facilityType: "Government Office", lat: "-6.7330000", lng: "147.0024000", address: "Lae, Morobe" },
  { facilityName: "ICSA Mt Hagen Regional Office",     districtCode: "WHP-MTH",facilityType: "Government Office", lat: "-5.8584000", lng: "144.2305000", address: "Mt Hagen, Western Highlands" },
  { facilityName: "ICSA Kokopo Regional Office",       districtCode: "ENB-KO", facilityType: "Government Office", lat: "-4.3454000", lng: "152.2710000", address: "Kokopo, East New Britain" },
  { facilityName: "ICSA Madang Regional Office",       districtCode: "MA-MA",  facilityType: "Government Office", lat: "-5.2225000", lng: "145.7886000", address: "Madang Town" },
  { facilityName: "ICSA Kiunga Border Office",         districtCode: "WP-NF",  facilityType: "Border Post",       lat: "-6.1208000", lng: "141.2898000", address: "Kiunga, Western (North Fly)" },
  { facilityName: "ICSA Daru Sea Port Office",         districtCode: "WP-SF",  facilityType: "Sea Port",          lat: "-9.0764000", lng: "143.2089000", address: "Daru, Western (South Fly)" },
  { facilityName: "ICSA Lae Sea Port Office",          districtCode: "MO-LAE", facilityType: "Sea Port",          lat: "-6.7376000", lng: "146.9966000", address: "Lae main wharf, Morobe" },
  { facilityName: "ICSA Rabaul Sea Port Office",       districtCode: "ENB-RA", facilityType: "Sea Port",          lat: "-4.2024000", lng: "152.1631000", address: "Rabaul, East New Britain" },
  { facilityName: "ICSA Alotau Sea Port Office",       districtCode: "MB-AL",  facilityType: "Sea Port",          lat: "-10.3157000", lng: "150.4549000", address: "Alotau, Milne Bay" },
  { facilityName: "ICSA Kavieng Sea Port Office",      districtCode: "NI-KA",  facilityType: "Sea Port",          lat: "-2.5740000", lng: "150.7967000", address: "Kavieng, New Ireland" },
];

export const ICA_PRESENCE_NAMES: string[] = ICA_PRESENCE_SITES.map((s) => s.facilityName);
