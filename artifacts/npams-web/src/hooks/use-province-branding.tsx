import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from "react";

interface ProvinceBranding {
  provinceName: string | null;
  flagUrl: string | null;
  themeAccentColor: string | null;
  flagColors: string[];
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
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ProvinceBranding>;
      return {
        provinceName: parsed.provinceName ?? null,
        flagUrl: parsed.flagUrl ?? null,
        themeAccentColor: parsed.themeAccentColor ?? null,
        flagColors: Array.isArray(parsed.flagColors) ? parsed.flagColors : [],
      };
    }
  } catch {
    // ignore
  }
  return { provinceName: null, flagUrl: null, themeAccentColor: null, flagColors: [] };
}

const DEFAULT_FAVICON = "/agencies/pngica.png";

function setFavicon(url: string | null) {
  const href = url && url.trim() ? url : DEFAULT_FAVICON;
  const type = href.endsWith(".svg") ? "image/svg+xml" : "image/png";
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = type;
  link.href = href;
}

function applyAccentCss(colors: string[], singleColor: string | null) {
  const root = document.documentElement;
  const primary = colors[0] ?? singleColor;
  if (primary) {
    root.style.setProperty("--province-accent", primary);
  } else {
    root.style.removeProperty("--province-accent");
  }
}

const ProvinceBrandingContext = createContext<ProvinceBrandingContextType | undefined>(undefined);

export function ProvinceBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<ProvinceBranding>(loadFromStorage);

  useEffect(() => {
    applyAccentCss(branding.flagColors, branding.themeAccentColor);
    setFavicon(branding.flagUrl);
  }, []);

  const applyBranding = useCallback((b: ProvinceBranding) => {
    setBranding(b);
    applyAccentCss(b.flagColors, b.themeAccentColor);
    setFavicon(b.flagUrl);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
    } catch {
      // ignore
    }
  }, []);

  const clearBranding = useCallback(() => {
    const empty: ProvinceBranding = { provinceName: null, flagUrl: null, themeAccentColor: null, flagColors: [] };
    setBranding(empty);
    applyAccentCss([], null);
    setFavicon(null);
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
