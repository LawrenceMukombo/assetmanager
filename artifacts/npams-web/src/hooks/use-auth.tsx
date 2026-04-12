import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useLocation } from "wouter";
import { useLogin, useLogout } from "@workspace/api-client-react";
import type { LoginRequest, LoginResponseData, LoginUser, ProvinceInfo } from "@workspace/api-client-react";

interface AuthState {
  isAuthenticated: boolean;
  user: LoginUser | null;
  province: ProvinceInfo | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (data: LoginRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    province: null,
    isLoading: true,
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  useEffect(() => {
    // Check local storage on mount
    const token = localStorage.getItem("npams_token");
    const userStr = localStorage.getItem("npams_user");
    const provinceStr = localStorage.getItem("npams_province");

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        const province = provinceStr ? JSON.parse(provinceStr) : null;
        
        setState({
          isAuthenticated: true,
          user,
          province,
          isLoading: false,
        });

        if (province?.themeAccentColor) {
          document.documentElement.style.setProperty("--province-accent", province.themeAccentColor);
        }
      } catch (e) {
        // Invalid stored data
        localStorage.removeItem("npams_token");
        localStorage.removeItem("npams_refresh");
        localStorage.removeItem("npams_user");
        localStorage.removeItem("npams_province");
        setState({ isAuthenticated: false, user: null, province: null, isLoading: false });
      }
    } else {
      setState({ isAuthenticated: false, user: null, province: null, isLoading: false });
    }
  }, []);

  const login = async (credentials: LoginRequest) => {
    const response = await loginMutation.mutateAsync({ data: credentials });
    if (response.success && response.data) {
      const { access_token, refresh_token, user } = response.data;
      // We assume province is returned in response.data.province or similar if typed
      // Based on API spec, login returns user. The requirements say:
      // returned as { access_token, refresh_token, user: {...}, province: {...} }
      // We'll cast to any to extract province since LoginResponseData might not have it strictly typed
      const data: any = response.data;
      const province = data.province || null;

      if (access_token) localStorage.setItem("npams_token", access_token);
      if (refresh_token) localStorage.setItem("npams_refresh", refresh_token);
      if (user) localStorage.setItem("npams_user", JSON.stringify(user));
      if (province) localStorage.setItem("npams_province", JSON.stringify(province));

      setState({
        isAuthenticated: true,
        user: user || null,
        province,
        isLoading: false,
      });

      if (province?.themeAccentColor) {
        document.documentElement.style.setProperty("--province-accent", province.themeAccentColor);
      }

      setLocation("/dashboard");
    } else {
      throw new Error(response.message || "Login failed");
    }
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (e) {
      console.error("Logout error", e);
    } finally {
      localStorage.removeItem("npams_token");
      localStorage.removeItem("npams_refresh");
      localStorage.removeItem("npams_user");
      localStorage.removeItem("npams_province");
      document.documentElement.style.removeProperty("--province-accent");
      
      setState({
        isAuthenticated: false,
        user: null,
        province: null,
        isLoading: false,
      });
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
