import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useLocation } from "wouter";
import { useLogin, useLogout } from "@workspace/api-client-react";
import type { LoginRequest, LoginResponseData, LoginUser } from "@workspace/api-client-react";
import { useProvinceBranding } from "@/hooks/use-province-branding";

interface AuthState {
  isAuthenticated: boolean;
  user: LoginUser | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (data: LoginRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const { applyBranding, clearBranding } = useProvinceBranding();
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true,
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  useEffect(() => {
    const token = localStorage.getItem("npams_token");
    const userStr = localStorage.getItem("npams_user");

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as LoginUser;
        setState({ isAuthenticated: true, user, isLoading: false });
      } catch {
        localStorage.removeItem("npams_token");
        localStorage.removeItem("npams_refresh");
        localStorage.removeItem("npams_user");
        setState({ isAuthenticated: false, user: null, isLoading: false });
      }
    } else {
      setState({ isAuthenticated: false, user: null, isLoading: false });
    }
  }, []);

  const login = async (credentials: LoginRequest) => {
    const response = await loginMutation.mutateAsync({ data: credentials });
    if (response.success && response.data) {
      const responseData = response.data as LoginResponseData & {
        province_branding?: {
          provinceName: string;
          flagUrl: string | null;
          flagColors: string[];
          themeAccentColor: string | null;
        } | null;
        agency_branding?: {
          agencyName: string;
          agencyCode: string;
          flagUrl: string | null;
          flagColors: string[];
          themeAccentColor: string | null;
        } | null;
      };
      const { access_token, refresh_token, user } = responseData;

      // Attach agency identity to the user so client-side UI (e.g. asset form) can display it
      if (user && responseData.agency_branding) {
        (user as LoginUser & { agency_name?: string; agency_code?: string }).agency_name =
          responseData.agency_branding.agencyName;
        (user as LoginUser & { agency_name?: string; agency_code?: string }).agency_code =
          responseData.agency_branding.agencyCode;
      }

      if (access_token) localStorage.setItem("npams_token", access_token);
      if (refresh_token) localStorage.setItem("npams_refresh", refresh_token);
      if (user) localStorage.setItem("npams_user", JSON.stringify(user));

      if (user?.scope_level === "national") {
        clearBranding();
      } else if (responseData.agency_branding) {
        applyBranding({
          provinceName: responseData.agency_branding.agencyName,
          flagUrl: responseData.agency_branding.flagUrl,
          themeAccentColor: responseData.agency_branding.themeAccentColor,
          flagColors: responseData.agency_branding.flagColors,
        });
      } else if (responseData.province_branding) {
        applyBranding({
          provinceName: responseData.province_branding.provinceName,
          flagUrl: responseData.province_branding.flagUrl,
          themeAccentColor: responseData.province_branding.themeAccentColor,
          flagColors: responseData.province_branding.flagColors,
        });
      }

      setState({ isAuthenticated: true, user: user ?? null, isLoading: false });
      setLocation("/dashboard");
    } else {
      throw new Error(response.message || "Login failed");
    }
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // Proceed with local logout regardless
    } finally {
      localStorage.removeItem("npams_token");
      localStorage.removeItem("npams_refresh");
      localStorage.removeItem("npams_user");
      clearBranding();
      setState({ isAuthenticated: false, user: null, isLoading: false });
      setLocation("/login");
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
