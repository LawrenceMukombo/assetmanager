import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { SidebarProvider } from "@/components/ui/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden w-full">
          <Header />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}