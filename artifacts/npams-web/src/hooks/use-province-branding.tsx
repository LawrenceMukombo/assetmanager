import { createContext, useContext, useState, ReactNode, useCallback } from "react";

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

const ProvinceBrandingContext = createContext<ProvinceBrandingContextType | undefined>(undefined);

export function ProvinceBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<ProvinceBranding>({
    provinceName: null,
    flagUrl: null,
    themeAccentColor: null,
  });

  const applyBranding = useCallback((b: ProvinceBranding) => {
    setBranding(b);
    if (b.themeAccentColor) {
      document.documentElement.style.setProperty("--province-accent", b.themeAccentColor);
    } else {
      document.documentElement.style.removeProperty("--province-accent");
    }
  }, []);

  const clearBranding = useCallback(() => {
    setBranding({ provinceName: null, flagUrl: null, themeAccentColor: null });
    document.documentElement.style.removeProperty("--province-accent");
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
