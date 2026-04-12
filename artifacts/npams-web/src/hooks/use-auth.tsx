import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useLocation } from "wouter";
import { useLogin, useLogout } from "@workspace/api-client-react";
import type { LoginRequest, LoginResponseData, LoginUser } from "@workspace/api-client-react";

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
      const responseData: LoginResponseData = response.data;
      const { access_token, refresh_token, user } = responseData;

      if (access_token) localStorage.setItem("npams_token", access_token);
      if (refresh_token) localStorage.setItem("npams_refresh", refresh_token);
      if (user) localStorage.setItem("npams_user", JSON.stringify(user));

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
      document.documentElement.style.removeProperty("--province-accent");
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
