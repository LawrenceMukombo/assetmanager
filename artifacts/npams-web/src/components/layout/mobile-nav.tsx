import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES, OFFICER_ROLES } from "@/App";
import { useGetNotifications, getGetNotificationsQueryKey } from "@workspace/api-client-react";
import { LayoutDashboard, Box, FileBarChart, Bell, Settings } from "lucide-react";

export function MobileNav() {
  const { user } = useAuth();
  const [location] = useLocation();

  const isOfficer = user?.role ? OFFICER_ROLES.includes(user.role as typeof OFFICER_ROLES[number]) : false;

  const { data: notifications } = useGetNotifications({
    query: {
      refetchInterval: 60000,
      queryKey: getGetNotificationsQueryKey(),
    },
  });
  const unreadCount = notifications?.data?.filter((n) => !n.readStatus).length ?? 0;

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    ...(isOfficer ? [{ href: "/assets", icon: Box, label: "Assets" }] : []),
    { href: "/reports", icon: FileBarChart, label: "Reports" },
    { href: "/notifications", icon: Bell, label: "Alerts", badge: unreadCount },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t flex items-center justify-around h-14 px-2">
      {navItems.map(({ href, icon: Icon, label, badge }) => {
        const isActive = location === href || (href !== "/dashboard" && location.startsWith(href));
        return (
          <Link key={href} href={href}>
            <button
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[48px] h-full relative ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {badge !== undefined && badge > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center h-4 min-w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-0.5">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] leading-none">{label}</span>
            </button>
          </Link>
        );
      })}
    </nav>
  );
}
