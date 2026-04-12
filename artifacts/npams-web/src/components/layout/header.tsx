import { useAuth } from "@/hooks/use-auth";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Bell } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useGetNotifications } from "@workspace/api-client-react";

export function Header() {
  const { user } = useAuth();

  const { data: notifications } = useGetNotifications({
    query: {
      refetchInterval: 60000,
      queryKey: ["/api/v1/notifications"],
    },
  });

  const unreadCount = notifications?.data?.filter((n) => !n.readStatus).length ?? 0;

  return (
    <header className="h-16 border-b flex items-center justify-between px-4 bg-card shrink-0">
      <div className="flex items-center gap-4">
        <SidebarTrigger />
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-lg hidden sm:block">
            {user?.scope_level === "national"
              ? "National Public Asset Management System"
              : "Provincial Dashboard"}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Link href="/notifications">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
            )}
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
            {user?.full_name?.charAt(0)?.toUpperCase() ?? "U"}
          </div>
          <span className="text-sm font-medium hidden md:block">{user?.full_name}</span>
        </div>
      </div>
    </header>
  );
}