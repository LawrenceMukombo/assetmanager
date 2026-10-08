import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { apiFetchJson } from "@/lib/api-fetch";
import { queryClient } from "@/App";

export interface OrganizationSettings {
  id?: string;
  agencyId?: string | null;
  organizationName: string;
  shortCode: string;
  organizationType: string;
  tagline: string | null;
  systemTitle: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  currencyCode: string;
  currencySymbol: string;
  hierarchyPreset: string;
  level1Label: string;
  level1Plural: string;
  level2Label: string;
  level2Plural: string;
  level3Label: string;
  level3Plural: string;
  countryCode?: string | null;
  countryName?: string | null;
  defaultLatitude?: string | null;
  defaultLongitude?: string | null;
  defaultZoom?: string | null;
}

export interface HierarchyLabels {
  preset: string;
  level1: string;
  level1Plural: string;
  level2: string;
  level2Plural: string;
  level3: string;
  level3Plural: string;
}

export interface OrganizationSummary {
  id: string;
  tenantId?: string;
  agencyCode: string;
  agencyName: string;
  agencyType: string | null;
  logoUrl: string | null;
  themeAccentColor: string | null;
  description: string | null;
  active: boolean;
  assetCount?: number;
  stockCount?: number;
  userCount?: number;
}

interface OrganizationContextType {
  organization: OrganizationSettings;
  hierarchy: HierarchyLabels;
  isLoading: boolean;
  activeAgencyId: string | null;
  allOrganizations: OrganizationSummary[];
  setActiveAgencyId: (id: string | null) => void;
  refreshOrganization: () => Promise<void>;
  updateOrganization: (updates: Partial<OrganizationSettings>, targetAgencyId?: string | null) => Promise<{ ok: boolean; message?: string }>;
  formatCurrency: (amount: number | string | null | undefined) => string;
}

const DEFAULT_ORGANIZATION: OrganizationSettings = {
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
  countryCode: "PNG",
  countryName: "Papua New Guinea",
  defaultLatitude: "-6.3150",
  defaultLongitude: "143.9555",
  defaultZoom: "6",
};

const STORAGE_KEY = "npams_org_settings";
const ACTIVE_AGENCY_KEY = "npams_active_agency_id";

function loadCached(): OrganizationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_ORGANIZATION, ...JSON.parse(raw) };
    }
  } catch {
    // fallback
  }
  return DEFAULT_ORGANIZATION;
}

function updateFavicon(url: string | null) {
  const href = url && url.trim() ? url.trim() : "/favicon.svg";
  const lower = href.toLowerCase();
  const type = lower.endsWith(".svg")
    ? "image/svg+xml"
    : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
    ? "image/jpeg"
    : lower.startsWith("data:image/svg")
    ? "image/svg+xml"
    : "image/png";

  const rels = ["icon", "shortcut icon", "apple-touch-icon"];
  for (const rel of rels) {
    let link = document.querySelector<HTMLLinkElement>(`link[rel='${rel}']`);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.type = type;
    link.href = href;
  }
}

function updateThemeVariables(primary: string, accent: string) {
  const root = document.documentElement;
  if (primary && primary.trim()) {
    root.style.setProperty("--org-primary", primary.trim());
  }
  if (accent && accent.trim()) {
    root.style.setProperty("--org-accent", accent.trim());
  }
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [organization, setOrganization] = useState<OrganizationSettings>(loadCached);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAgencyId, setActiveAgencyIdState] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_AGENCY_KEY) || null;
  });
  const [allOrganizations, setAllOrganizations] = useState<OrganizationSummary[]>([]);

  const applyOrganizationEffects = useCallback((org: OrganizationSettings) => {
    // Update document title
    const titleParts = [org.organizationName, org.systemTitle].filter(Boolean);
    if (titleParts.length > 0) {
      document.title = titleParts.join(" — ");
    }

    // Update site icon (browser favicon and touch icons) to the uploaded logo
    const siteIconUrl = org.logoUrl || org.faviconUrl || "/favicon.svg";
    updateFavicon(siteIconUrl);

    // Update colors
    updateThemeVariables(org.primaryColor, org.accentColor);

    // Cache locally
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(org));
    } catch {
      // ignore
    }
  }, []);

  const refreshOrganization = useCallback(async () => {
    try {
      const activeId = localStorage.getItem(ACTIVE_AGENCY_KEY);
      const url = activeId && activeId !== "all"
        ? `/api/v1/public/organization?agencyId=${encodeURIComponent(activeId)}`
        : "/api/v1/public/organization";

      const res = await apiFetchJson<any>(url);
      if (res.ok && res.data) {
        const raw = res.data.data !== undefined && res.data.data !== null ? res.data.data : res.data;
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          const merged: OrganizationSettings = { ...DEFAULT_ORGANIZATION, ...raw };
          setOrganization(merged);
          applyOrganizationEffects(merged);
        }
      }

      // Also fetch list of all organizations for the switcher
      const orgsRes = await apiFetchJson<any>("/api/v1/organizations");
      if (orgsRes.ok && orgsRes.data) {
        const list = Array.isArray(orgsRes.data)
          ? orgsRes.data
          : Array.isArray(orgsRes.data.data)
          ? orgsRes.data.data
          : [];
        setAllOrganizations(list);
      }
    } catch (err) {
      console.warn("Failed to load organization settings, using defaults/cache:", err);
    } finally {
      setIsLoading(false);
    }
  }, [applyOrganizationEffects]);

  const setActiveAgencyId = useCallback(
    (id: string | null) => {
      if (id && id !== "all") {
        localStorage.setItem(ACTIVE_AGENCY_KEY, id);
        setActiveAgencyIdState(id);
      } else {
        localStorage.removeItem(ACTIVE_AGENCY_KEY);
        setActiveAgencyIdState(null);
      }
      // Clear react-query cache and re-fetch organization settings to guarantee
      // that no records or views from the previous agency remain cached in memory.
      queryClient.clear();
      queryClient.invalidateQueries();
      refreshOrganization();
    },
    [refreshOrganization]
  );

  useEffect(() => {
    applyOrganizationEffects(organization);
    refreshOrganization();
  }, []);

  const updateOrganization = useCallback(
    async (updates: Partial<OrganizationSettings>, targetAgencyId?: string | null): Promise<{ ok: boolean; message?: string }> => {
      try {
        const agencyId = targetAgencyId !== undefined ? targetAgencyId : activeAgencyId;
        const res = await apiFetchJson<any>(
          "/api/v1/organization",
          {
            method: "PATCH",
            body: JSON.stringify({ ...updates, agencyId }),
          }
        );

        if (res.ok && res.data) {
          const raw = res.data.data !== undefined && res.data.data !== null ? res.data.data : res.data;
          const updated = { ...organization, ...raw };
          setOrganization(updated);
          applyOrganizationEffects(updated);
          refreshOrganization();
          return { ok: true, message: res.data?.message || res.message };
        }
        return { ok: false, message: res.data?.message || res.message || "Failed to update organization settings" };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Network error" };
      }
    },
    [organization, activeAgencyId, applyOrganizationEffects, refreshOrganization]
  );

  const formatCurrency = useCallback(
    (amount: number | string | null | undefined): string => {
      if (amount == null || amount === "") return `${organization.currencySymbol} 0.00`;
      const num = typeof amount === "number" ? amount : Number(amount);
      if (!Number.isFinite(num)) return `${organization.currencySymbol} 0.00`;

      return `${organization.currencySymbol} ${num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    },
    [organization.currencySymbol]
  );

  const hierarchy: HierarchyLabels = {
    preset: organization.hierarchyPreset || "corporate",
    level1: organization.level1Label || "Division",
    level1Plural: organization.level1Plural || "Divisions",
    level2: organization.level2Label || "Department",
    level2Plural: organization.level2Plural || "Departments",
    level3: organization.level3Label || "Site / Room",
    level3Plural: organization.level3Plural || "Sites / Rooms",
  };

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        hierarchy,
        isLoading,
        activeAgencyId,
        allOrganizations,
        setActiveAgencyId,
        refreshOrganization,
        updateOrganization,
        formatCurrency,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return context;
}
