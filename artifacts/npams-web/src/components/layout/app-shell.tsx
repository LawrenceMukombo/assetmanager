import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { SidebarProvider } from "@/components/ui/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden w-full">
          <Header />
          <main className="flex-1 overflow-auto pb-20 md:pb-8">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-8 md:py-7 space-y-6">
              {children}
            </div>
          </main>
        </div>
      </div>
      <MobileNav />
    </SidebarProvider>
  );
}
