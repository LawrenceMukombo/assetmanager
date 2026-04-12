import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/hooks/use-auth";
import Login from "@/pages/login";
import { AppShell } from "@/components/layout/app-shell";
import { Redirect } from "wouter";

// Import pages
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

function ProtectedRoute({ component: Component, ...rest }: any) {
  return (
    <Route {...rest}>
      <AppShell>
        <Component />
      </AppShell>
    </Route>
  );
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
      <ProtectedRoute path="/assets/new" component={AssetForm} />
      <ProtectedRoute path="/assets/:id" component={AssetDetail} />
      <ProtectedRoute path="/assets/:id/edit" component={AssetForm} />
      <ProtectedRoute path="/categories" component={Categories} />
      <ProtectedRoute path="/reports" component={Reports} />
      <ProtectedRoute path="/users" component={Users} />
      <ProtectedRoute path="/locations" component={Locations} />
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
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;