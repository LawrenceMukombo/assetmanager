import { useAuth } from "@/hooks/use-auth";
import { useProvinceBranding } from "@/hooks/use-province-branding";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Bell } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetNotifications } from "@workspace/api-client-react";

export function Header() {
  const { user } = useAuth();
  const { branding } = useProvinceBranding();
  const isNational = user?.scope_level === "national";

  const { data: notifications } = useGetNotifications({
    query: {
      refetchInterval: 60000,
      queryKey: ["/api/v1/notifications"],
    },
  });

  const unreadCount = notifications?.data?.filter((n) => !n.readStatus).length ?? 0;

  const headerTitle = isNational
    ? "National Public Asset Management System"
    : branding.provinceName
    ? `${branding.provinceName} Asset Management`
    : "Provincial Asset Management";

  return (
    <header className="h-16 border-b flex items-center justify-between px-4 bg-card shrink-0">
      <div className="flex items-center gap-4">
        <SidebarTrigger />
        <div className="flex items-center gap-3">
          {!isNational && branding.flagUrl && (
            <img
              src={branding.flagUrl}
              alt={`${branding.provinceName ?? "Province"} flag`}
              className="h-6 w-9 object-cover rounded-sm border hidden sm:block"
            />
          )}
          <h1 className="font-semibold text-lg hidden sm:block">{headerTitle}</h1>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Link href="/notifications">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full px-1 text-[10px] flex items-center justify-center"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
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
