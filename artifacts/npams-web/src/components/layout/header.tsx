import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useProvinceBranding } from "@/hooks/use-province-branding";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGetNotifications, getGetNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { formatDistanceToNow } from "date-fns";

export function Header() {
  const { user } = useAuth();
  const { branding } = useProvinceBranding();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const isNational = user?.scope_level === "national";

  const { data: notifications } = useGetNotifications({
    query: {
      refetchInterval: 60000,
      queryKey: getGetNotificationsQueryKey(),
    },
  });

  const unreadCount = notifications?.data?.filter((n) => !n.readStatus).length ?? 0;
  const recentNotifs = (notifications?.data ?? []).slice(0, 8);

  const markAllRead = async () => {
    await apiFetch("/api/v1/notifications/mark-all-read", { method: "POST" }).catch(() => null);
    queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
  };

  const markOneRead = async (id: string) => {
    await apiFetch(`/api/v1/notifications/${id}/read`, { method: "PATCH" }).catch(() => null);
    queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
  };

  const headerTitle = isNational
    ? "National Public Asset Management System"
    : branding.provinceName
    ? `${branding.provinceName} Asset Management`
    : "Provincial Asset Management";

  const accentStyle = !isNational && branding.themeAccentColor
    ? { borderBottomColor: branding.themeAccentColor, borderBottomWidth: "3px" }
    : {};

  return (
    <header className="h-16 border-b flex items-center justify-between px-4 bg-card shrink-0" style={accentStyle}>
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
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
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
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={markAllRead}>
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </Button>
              )}
            </div>
            <ScrollArea className="max-h-80">
              {recentNotifs.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications</div>
              ) : (
                recentNotifs.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors ${!n.readStatus ? "bg-primary/5" : ""}`}
                    onClick={() => { if (!n.readStatus && n.id) markOneRead(n.id); }}
                  >
                    <div className="mt-0.5 shrink-0">
                      {!n.readStatus
                        ? <div className="w-2 h-2 rounded-full bg-primary mt-1" />
                        : <Check className="w-3 h-3 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-tight ${!n.readStatus ? "font-medium" : ""}`}>{n.message}</p>
                      {n.createdAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </ScrollArea>
            {(notifications?.data ?? []).length > 8 && (
              <div className="px-4 py-3 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => { setNotifOpen(false); setLocation("/notifications"); }}
                >
                  View all notifications
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

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
