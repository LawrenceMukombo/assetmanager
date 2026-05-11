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
import { GlobalSearch } from "@/components/global-search";

export function Header() {
  const { user } = useAuth();
  const { branding } = useProvinceBranding();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const isNational = user?.scope_level === "national";
  const isAgency = user?.scope_level === "agency";
  const userAgencyName = (user?.scope as { agency_name?: string } | undefined)?.agency_name ?? null;
  const agencyDisplayName = branding.provinceName ?? userAgencyName;

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
    : isAgency
    ? agencyDisplayName
      ? `${agencyDisplayName} — Asset Management System`
      : "Agency Asset Management System"
    : branding.provinceName
    ? `${branding.provinceName} — Asset Management System`
    : "Provincial Asset Management";

  const nationalColors = ["#CE1126", "#000000", "#FCD116"];

  const provinceColors = branding.flagColors?.length
    ? branding.flagColors
    : branding.themeAccentColor
    ? [branding.themeAccentColor]
    : [];

  const accentColors = isNational ? nationalColors : provinceColors;

  const accentBarStyle =
    accentColors.length > 1
      ? {
          background: `linear-gradient(to right, ${accentColors.map((c, i) => `${c} ${(i / accentColors.length) * 100}%, ${c} ${((i + 1) / accentColors.length) * 100}%`).join(", ")})`,
          height: "3px",
        }
      : accentColors.length === 1
      ? { background: accentColors[0], height: "3px" }
      : null;

  return (
    <header className="border-b flex flex-col bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70 shrink-0 sticky top-0 z-30" style={{ height: accentBarStyle ? "67px" : "64px" }}>
      {accentBarStyle && <div style={accentBarStyle} className="w-full shrink-0" />}
      <div className="flex items-center justify-between px-4 md:px-6 flex-1">
      <div className="flex items-center gap-4">
        <SidebarTrigger />
        <div className="flex items-center gap-3">
          {isNational ? (
            <img
              src="/flags/png_national.svg"
              alt="Papua New Guinea National Flag"
              className="h-6 w-10 object-cover rounded-sm border hidden sm:block"
            />
          ) : branding.flagUrl ? (
            <img
              src={branding.flagUrl}
              alt={`${branding.provinceName ?? "Org"} ${isAgency ? "logo" : "flag"}`}
              className={
                isAgency
                  ? "h-9 w-9 object-contain rounded-sm bg-white p-0.5 hidden sm:block"
                  : "h-6 w-10 object-contain rounded-sm border bg-muted hidden sm:block"
              }
            />
          ) : null}
          <h1 className="font-semibold text-base lg:text-lg tracking-tight hidden sm:block truncate max-w-[28rem] lg:max-w-[40rem]">{headerTitle}</h1>
        </div>
      </div>

      <div className="flex-1 flex justify-center px-4 max-w-2xl">
        <GlobalSearch />
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

        <div className="flex items-center gap-2.5 pl-2 border-l h-8">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-xs font-semibold text-primary-foreground shadow-sm ring-1 ring-primary/20">
            {user?.full_name?.charAt(0)?.toUpperCase() ?? "U"}
          </div>
          <div className="hidden md:flex flex-col leading-tight">
            <span className="text-sm font-medium truncate max-w-[10rem]">{user?.full_name}</span>
            {user?.role && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[10rem]">{user.role}</span>
            )}
          </div>
        </div>
      </div>
      </div>
    </header>
  );
}
