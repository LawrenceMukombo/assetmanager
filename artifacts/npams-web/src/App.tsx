import { ComponentType, ReactNode, lazy, Suspense } from "react";
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
import Audit from "@/pages/audit";
import AuditDetail from "@/pages/audit-detail";
import AuditVerify from "@/pages/audit-verify";
import Maintenance from "@/pages/maintenance";
const GIS = lazy(() => import("@/pages/gis"));

const queryClient = new QueryClient();

export const ADMIN_ROLES = [
  "Super Admin",
  "Provincial Admin",
  "National Asset Controller",
] as const;

export const OFFICER_ROLES = [
  "Super Admin",
  "Provincial Admin",
  "National Asset Controller",
  "Provincial Asset Officer",
] as const;

interface ProtectedRouteProps {
  path: string;
  component: ComponentType;
  requiredRoles?: readonly string[];
}

function ProtectedRoute({ path, component: Component, requiredRoles }: ProtectedRouteProps) {
  return (
    <Route path={path}>
      <AuthGuard requiredRoles={requiredRoles}>
        <Component />
      </AuthGuard>
    </Route>
  );
}

function AuthGuard({ children, requiredRoles }: { children: ReactNode; requiredRoles?: readonly string[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (requiredRoles && user?.role && !requiredRoles.includes(user.role)) {
    return <Redirect to="/dashboard" />;
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
      <ProtectedRoute path="/assets/new" component={AssetForm} requiredRoles={OFFICER_ROLES} />
      <ProtectedRoute path="/assets/:id" component={AssetDetail} />
      <ProtectedRoute path="/assets/:id/edit" component={AssetForm} requiredRoles={OFFICER_ROLES} />
      <ProtectedRoute path="/categories" component={Categories} requiredRoles={ADMIN_ROLES} />
      <ProtectedRoute path="/reports" component={Reports} />
      <ProtectedRoute path="/users" component={Users} requiredRoles={ADMIN_ROLES} />
      <ProtectedRoute path="/locations" component={Locations} requiredRoles={ADMIN_ROLES} />
      <ProtectedRoute path="/audit" component={Audit} />
      <ProtectedRoute path="/audit/verify/:id" component={AuditVerify} />
      <ProtectedRoute path="/audit/:id" component={AuditDetail} />
      <ProtectedRoute path="/maintenance" component={Maintenance} />
      <Route path="/gis">
        <AuthGuard>
          <Suspense fallback={<div className="flex items-center justify-center h-full p-12 text-muted-foreground">Loading map...</div>}>
            <GIS />
          </Suspense>
        </AuthGuard>
      </Route>
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
