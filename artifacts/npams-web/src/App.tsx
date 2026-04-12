import { ComponentType } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ProvinceBrandingProvider } from "@/hooks/use-province-branding";
import Login from "@/pages/login";
import { AppShell } from "@/components/layout/app-shell";

import Dashboard from "@/pages/dashboard";
import Assets from "@/pages/assets";
import AssetDetail from "@/pages/asset-detail";
import AssetForm from "@/pages/asset-form";
import Categories from "@/pages/categories";
import Reports from "@/pages/reports";
import Users from "@/pages/users";
import Locations from "@/pages/locations";
import Notifications from "@/pages/notifications";
import Settings from "@/pages/settings";

const queryClient = new QueryClient();

interface ProtectedRouteProps {
  path: string;
  component: ComponentType;
  adminOnly?: boolean;
}

function ProtectedRoute({ path, component: Component, adminOnly }: ProtectedRouteProps) {
  return (
    <Route path={path}>
      <AuthGuard adminOnly={adminOnly}>
        <Component />
      </AuthGuard>
    </Route>
  );
}

function AuthGuard({ children, adminOnly }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (adminOnly) {
    const isAdmin = user?.role === "Super Admin" || user?.role === "Provincial Admin" || user?.role === "National Asset Controller";
    if (!isAdmin) {
      return <Redirect to="/dashboard" />;
    }
  }

  return <AppShell>{children}</AppShell>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/assets" component={Assets} />
      <ProtectedRoute path="/assets/new" component={AssetForm} adminOnly />
      <ProtectedRoute path="/assets/:id" component={AssetDetail} />
      <ProtectedRoute path="/assets/:id/edit" component={AssetForm} adminOnly />
      <ProtectedRoute path="/categories" component={Categories} adminOnly />
      <ProtectedRoute path="/reports" component={Reports} />
      <ProtectedRoute path="/users" component={Users} adminOnly />
      <ProtectedRoute path="/locations" component={Locations} adminOnly />
      <ProtectedRoute path="/notifications" component={Notifications} />
      <ProtectedRoute path="/settings" component={Settings} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <ProvinceBrandingProvider>
              <Router />
            </ProvinceBrandingProvider>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
