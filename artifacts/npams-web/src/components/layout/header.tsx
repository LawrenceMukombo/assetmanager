import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useProvinceBranding } from "@/hooks/use-province-branding";
import { useOrganization } from "@/context/organization-context";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Bell, Check, CheckCheck, Building2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const isSuperAdmin =
    user?.role === "Super Admin" ||
    user?.role === "Super Administrator" ||
    (user?.role as string)?.toLowerCase().includes("super") ||
    user?.role === "National Asset Controller";
  const isNational = user?.scope_level === "national";
  const isAgency = user?.scope_level === "agency";
  const userAgencyName = (user?.scope as { agency_name?: string } | undefined)?.agency_name ?? null;
  const agencyDisplayName = branding.provinceName ?? userAgencyName;

  const { organization, activeAgencyId, allOrganizations, setActiveAgencyId } = useOrganization();

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

  const handleNotifClick = (n: { id?: string | null; readStatus?: boolean | null; entityType?: string | null; entityId?: string | null }) => {
    if (!n.readStatus && n.id) markOneRead(n.id);
    if (n.entityType === "asset" && n.entityId) {
      setNotifOpen(false);
      setLocation(`/assets/${n.entityId}`);
    } else if (n.entityType === "user" && n.entityId) {
      setNotifOpen(false);
      setLocation(`/users?edit=${n.entityId}`);
    }
  };

  const activeOrg = activeAgencyId ? allOrganizations.find((o) => o.id === activeAgencyId) : null;

  const headerTitle = activeOrg
    ? `${activeOrg.agencyName} — ${organization.systemTitle || "Asset Management"}`
    : isNational || isSuperAdmin
    ? `${organization.organizationName || "Asset Manager"} — ${organization.systemTitle || "Asset Management System"}`
    : isAgency
    ? agencyDisplayName
      ? `${agencyDisplayName} — ${organization.systemTitle || "Asset Management"}`
      : `${organization.organizationName} — ${organization.systemTitle || "Asset Management"}`
    : branding.provinceName
    ? `${branding.provinceName} — ${organization.systemTitle || "Asset Management"}`
    : `${organization.organizationName} — ${organization.systemTitle || "Asset Management"}`;

  const defaultColors = [organization.primaryColor || "#0F4C81", organization.accentColor || "#3B82F6"];

  const provinceColors = branding.flagColors?.length
    ? branding.flagColors
    : branding.themeAccentColor
    ? [branding.themeAccentColor]
    : [];

  const accentColors = isNational ? defaultColors : (provinceColors.length ? provinceColors : defaultColors);

  const accentBarStyle =
    accentColors.length > 1
      ? {
          background: `linear-gradient(to right, ${accentColors.map((c, i) => `${c} ${(i / accentColors.length) * 100}%, ${c} ${((i + 1) / accentColors.length) * 100}%`).join(", ")})`,
          height: "3px",
        }
      : accentColors.length === 1
      ? { background: accentColors[0], height: "3px" }
      : null;

  const activeLogoUrl = activeOrg?.logoUrl || organization.logoUrl || branding.flagUrl;

  return (
    <header className="border-b flex flex-col bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70 shrink-0 sticky top-0 z-30" style={{ height: accentBarStyle ? "67px" : "64px" }}>
      {accentBarStyle && <div style={accentBarStyle} className="w-full shrink-0" />}
      <div className="flex items-center justify-between px-3 md:px-6 flex-1 gap-2 md:gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <SidebarTrigger />
          <div className="flex items-center gap-2">
            {activeLogoUrl ? (
              <img
                src={activeLogoUrl}
                alt={activeOrg?.agencyName || organization.organizationName}
                className="h-8 w-8 object-contain rounded bg-white p-0.5 border hidden sm:block"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="h-8 w-8 rounded bg-primary/10 items-center justify-center text-primary font-bold text-xs hidden sm:flex border border-primary/20">
                {activeOrg?.agencyCode?.slice(0, 2) || organization.shortCode?.slice(0, 2) || "AM"}
              </div>
            )}
            <h1 className="font-semibold text-xs sm:text-sm lg:text-base tracking-tight hidden sm:block truncate max-w-[14rem] lg:max-w-[22rem]">
              {headerTitle}
            </h1>
          </div>
        </div>

        {/* Multi-Tenant Organization Switcher for Super Admins / Cross-Org Users */}
        {(isSuperAdmin || isNational) && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Select
              value={activeAgencyId || "all"}
              onValueChange={(val) => {
                setActiveAgencyId(val === "all" ? null : val);
                queryClient.invalidateQueries();
              }}
            >
              <SelectTrigger className="h-8 w-44 sm:w-56 lg:w-68 text-xs font-medium border-border/80 bg-background/80 shadow-none hover:bg-muted/50 transition-colors">
                <Building2 className="w-3.5 h-3.5 mr-1.5 text-primary shrink-0" />
                <SelectValue placeholder="All Organizations" />
              </SelectTrigger>
              <SelectContent align="start" className="max-w-[22rem]">
                <SelectItem value="all" className="text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    <span>All Organizations (Enterprise HQ)</span>
                  </div>
                </SelectItem>
                {allOrganizations.map((org) => (
                  <SelectItem key={org.id} value={org.id} className="text-xs">
                    <div className="flex items-center gap-2 truncate">
                      {org.themeAccentColor ? (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: org.themeAccentColor }}
                        />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-muted-foreground shrink-0" />
                      )}
                      <span className="font-semibold text-[11px] text-muted-foreground shrink-0">
                        [{org.agencyCode}]
                      </span>
                      <span className="truncate">{org.agencyName}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Global Search Bar */}
        <div className="flex-1 flex justify-center px-2 max-w-xl">
          <GlobalSearch />
        </div>

        {/* Right actions: Notifications & User Avatar */}
        <div className="flex items-center gap-3 shrink-0">
          <Popover open={notifOpen} onOpenChange={setNotifOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-8 w-8">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 text-[9px] flex items-center justify-center"
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
                      onClick={() => handleNotifClick(n)}
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

          <div className="flex items-center gap-2 pl-2 border-l h-8">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-xs font-semibold text-primary-foreground shadow-sm ring-1 ring-primary/20">
              {user?.full_name?.charAt(0)?.toUpperCase() ?? "U"}
            </div>
            <div className="hidden lg:flex flex-col leading-tight">
              <span className="text-xs font-medium truncate max-w-[8rem]">{user?.full_name}</span>
              {user?.role && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[8rem]">{user.role}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
