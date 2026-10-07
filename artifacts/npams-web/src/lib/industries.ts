export const INDUSTRY_SECTORS = [
  "Healthcare & Medical",
  "Banking, Finance & Insurance",
  "Information Technology & Telecom",
  "Transportation, Fleet & Logistics",
  "Facilities, Buildings & Infrastructure",
  "Manufacturing, Mining & Heavy Industry",
  "Education & Academic Institutions",
  "Agriculture, Forestry & Natural Resources",
  "Government, Law Enforcement & Public Safety",
  "Corporate, Hospitality & Commercial",
] as const;

export type IndustrySector = typeof INDUSTRY_SECTORS[number];

/**
 * Intelligently detect the most relevant industry/sector for an agency or
 * organization based on keywords in its name or acronym.
 */
export function detectDefaultIndustry(agencyName?: string | null): string | null {
  if (!agencyName) return null;
  const a = agencyName.toLowerCase();

  // Healthcare
  if (
    a.includes("health") ||
    a.includes("moh") ||
    a.includes("hospital") ||
    a.includes("clinic") ||
    a.includes("medical") ||
    a.includes("pharm") ||
    a.includes("doctor") ||
    a.includes("nurse") ||
    a.includes("sanatorium")
  ) {
    return "Healthcare & Medical";
  }

  // Banking & Finance
  if (
    a.includes("finance") ||
    a.includes("bank") ||
    a.includes("treasury") ||
    a.includes("revenue") ||
    a.includes("tax") ||
    a.includes("insurance") ||
    a.includes("zra") ||
    a.includes("audit") ||
    a.includes("pension")
  ) {
    return "Banking, Finance & Insurance";
  }

  // IT & Telecom
  if (
    a.includes("ict") ||
    a.includes("tech") ||
    a.includes("telecom") ||
    a.includes("communication") ||
    a.includes("digital") ||
    a.includes("data") ||
    a.includes("software") ||
    a.includes("smart")
  ) {
    return "Information Technology & Telecom";
  }

  // Transportation & Logistics
  if (
    a.includes("transport") ||
    a.includes("fleet") ||
    a.includes("logistic") ||
    a.includes("transit") ||
    a.includes("aviation") ||
    a.includes("airport") ||
    a.includes("marine") ||
    a.includes("port") ||
    a.includes("roads") ||
    a.includes("rail") ||
    a.includes("rtsa")
  ) {
    return "Transportation, Fleet & Logistics";
  }

  // Education
  if (
    a.includes("education") ||
    a.includes("school") ||
    a.includes("university") ||
    a.includes("college") ||
    a.includes("academy") ||
    a.includes("academic") ||
    a.includes("training") ||
    a.includes("moe")
  ) {
    return "Education & Academic Institutions";
  }

  // Agriculture & Natural Resources
  if (
    a.includes("agri") ||
    a.includes("farm") ||
    a.includes("crop") ||
    a.includes("livestock") ||
    a.includes("fisher") ||
    a.includes("forest") ||
    a.includes("natural resource") ||
    a.includes("environment") ||
    a.includes("wildlife")
  ) {
    return "Agriculture, Forestry & Natural Resources";
  }

  // Government & Public Safety
  if (
    a.includes("police") ||
    a.includes("immigrat") ||
    a.includes("custom") ||
    a.includes("border") ||
    a.includes("defense") ||
    a.includes("security") ||
    a.includes("safety") ||
    a.includes("ica") ||
    a.includes("icsa") ||
    a.includes("interior") ||
    a.includes("justice") ||
    a.includes("prison") ||
    a.includes("correctional")
  ) {
    return "Government, Law Enforcement & Public Safety";
  }

  // Facilities & Infrastructure
  if (
    a.includes("works") ||
    a.includes("infrastructure") ||
    a.includes("building") ||
    a.includes("housing") ||
    a.includes("facility") ||
    a.includes("energy") ||
    a.includes("power") ||
    a.includes("water") ||
    a.includes("utilities")
  ) {
    return "Facilities, Buildings & Infrastructure";
  }

  // Manufacturing & Heavy Industry
  if (
    a.includes("mining") ||
    a.includes("mineral") ||
    a.includes("manufactur") ||
    a.includes("industrial") ||
    a.includes("factory") ||
    a.includes("petroleum") ||
    a.includes("quarry")
  ) {
    return "Manufacturing, Mining & Heavy Industry";
  }

  return null;
}
