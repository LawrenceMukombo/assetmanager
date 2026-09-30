import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { apiFetchJson } from "@/lib/api-fetch";

export interface OrganizationSettings {
  id?: string;
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

interface OrganizationContextType {
  organization: OrganizationSettings;
  hierarchy: HierarchyLabels;
  isLoading: boolean;
  refreshOrganization: () => Promise<void>;
  updateOrganization: (updates: Partial<OrganizationSettings>) => Promise<{ ok: boolean; message?: string }>;
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
};

const STORAGE_KEY = "npams_org_settings";

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
  if (!url || !url.trim()) return;
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url.trim();
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

  const applyOrganizationEffects = useCallback((org: OrganizationSettings) => {
    // Update document title
    const titleParts = [org.organizationName, org.systemTitle].filter(Boolean);
    if (titleParts.length > 0) {
      document.title = titleParts.join(" — ");
    }

    // Update favicon
    if (org.faviconUrl || org.logoUrl) {
      updateFavicon(org.faviconUrl || org.logoUrl);
    }

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
      const res = await apiFetchJson<{ success: boolean; data: OrganizationSettings }>("/api/v1/public/organization");
      if (res.ok && res.data?.data) {
        const merged: OrganizationSettings = { ...DEFAULT_ORGANIZATION, ...res.data.data };
        setOrganization(merged);
        applyOrganizationEffects(merged);
      }
    } catch (err) {
      console.warn("Failed to load organization settings, using defaults/cache:", err);
    } finally {
      setIsLoading(false);
    }
  }, [applyOrganizationEffects]);

  useEffect(() => {
    applyOrganizationEffects(organization);
    refreshOrganization();
  }, []);

  const updateOrganization = useCallback(
    async (updates: Partial<OrganizationSettings>): Promise<{ ok: boolean; message?: string }> => {
      try {
        const res = await apiFetchJson<{ success: boolean; message?: string; data: OrganizationSettings }>(
          "/api/v1/organization",
          {
            method: "PATCH",
            body: JSON.stringify(updates),
          }
        );

        if (res.ok && res.data?.data) {
          const updated = { ...organization, ...res.data.data };
          setOrganization(updated);
          applyOrganizationEffects(updated);
          return { ok: true, message: res.data.message };
        }
        return { ok: false, message: res.data?.message || "Failed to update organization settings" };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Network error" };
      }
    },
    [organization, applyOrganizationEffects]
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
