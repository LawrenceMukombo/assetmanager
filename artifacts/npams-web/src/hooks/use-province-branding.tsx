import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from "react";

interface ProvinceBranding {
  provinceName: string | null;
  flagUrl: string | null;
  themeAccentColor: string | null;
}

interface ProvinceBrandingContextType {
  branding: ProvinceBranding;
  applyBranding: (b: ProvinceBranding) => void;
  clearBranding: () => void;
}

const STORAGE_KEY = "npams_province_branding";

function loadFromStorage(): ProvinceBranding {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProvinceBranding;
  } catch {
    // ignore
  }
  return { provinceName: null, flagUrl: null, themeAccentColor: null };
}

function applyAccentCss(color: string | null) {
  if (color) {
    document.documentElement.style.setProperty("--province-accent", color);
  } else {
    document.documentElement.style.removeProperty("--province-accent");
  }
}

const ProvinceBrandingContext = createContext<ProvinceBrandingContextType | undefined>(undefined);

export function ProvinceBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<ProvinceBranding>(loadFromStorage);

  useEffect(() => {
    applyAccentCss(branding.themeAccentColor);
  }, []);

  const applyBranding = useCallback((b: ProvinceBranding) => {
    setBranding(b);
    applyAccentCss(b.themeAccentColor);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
    } catch {
      // ignore
    }
  }, []);

  const clearBranding = useCallback(() => {
    const empty: ProvinceBranding = { provinceName: null, flagUrl: null, themeAccentColor: null };
    setBranding(empty);
    applyAccentCss(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return (
    <ProvinceBrandingContext.Provider value={{ branding, applyBranding, clearBranding }}>
      {children}
    </ProvinceBrandingContext.Provider>
  );
}

export function useProvinceBranding() {
  const ctx = useContext(ProvinceBrandingContext);
  if (!ctx) throw new Error("useProvinceBranding must be used within ProvinceBrandingProvider");
  return ctx;
}
