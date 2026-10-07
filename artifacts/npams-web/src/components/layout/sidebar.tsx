import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useProvinceBranding } from "@/hooks/use-province-branding";
import { useOrganization } from "@/context/organization-context";
import { Building2 } from "lucide-react";
import { ADMIN_ROLES, OFFICER_ROLES } from "@/App";
import { useGetNotifications, getGetNotificationsQueryKey } from "@workspace/api-client-react";
import {
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Box,
  Tags,
  FileBarChart,
  Users,
  MapPin,
  Settings,
  LogOut,
  Bell,
  Globe,
  ClipboardList,
  Wrench,
  Boxes,
  ServerCog,
  ShoppingCart,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

export function Sidebar() {
  const { user, logout } = useAuth();
  const { branding } = useProvinceBranding();
  const [location] = useLocation();

  const { data: notifications } = useGetNotifications({
    query: {
      refetchInterval: 60000,
      queryKey: getGetNotificationsQueryKey(),
    },
  });
  const unreadCount = notifications?.data?.filter((n) => !n.readStatus).length ?? 0;

  const { organization, hierarchy, activeAgencyId, allOrganizations } = useOrganization();

  const activeOrg = activeAgencyId ? allOrganizations.find((o) => o.id === activeAgencyId) : null;
  const isSuperAdmin =
    user?.role === "Super Admin" ||
    user?.role === "Super Administrator" ||
    (user?.role as string)?.toLowerCase().includes("super");
  const isNational = user?.scope_level === "national";
  const isAgency = user?.scope_level === "agency";
  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]) : false;
  const isOfficer = user?.role ? OFFICER_ROLES.includes(user.role as typeof OFFICER_ROLES[number]) : false;

  const scopeLabel = activeOrg
    ? `Org · ${activeOrg.agencyCode}`
    : isSuperAdmin
    ? "Enterprise HQ"
    : isNational
    ? "National Scope"
    : isAgency
    ? "Branch / Agency"
    : hierarchy.level1;

  const userAgencyName = (user?.scope as { agency_name?: string } | undefined)?.agency_name ?? null;
  const orgName = activeOrg
    ? activeOrg.agencyName
    : isSuperAdmin || isNational
    ? organization.organizationName || "Asset Manager"
    : branding.provinceName ?? (isAgency ? userAgencyName ?? organization.organizationName : organization.organizationName);

  const displayLogoUrl = activeOrg?.logoUrl || (!isNational && branding.flagUrl ? branding.flagUrl : organization.logoUrl);
  const themeBarColor = activeOrg?.themeAccentColor || (isNational || isSuperAdmin ? (organization.primaryColor || "#0F4C81") : "var(--province-accent, hsl(var(--primary)))");

  return (
    <SidebarComponent>
      <SidebarHeader
        className="border-b p-4"
        style={{
          borderTopWidth: 4,
          borderTopStyle: "solid",
          borderTopColor: themeBarColor,
        }}
      >
        <div className="flex items-center gap-2.5">
          {displayLogoUrl ? (
            <img
              src={displayLogoUrl}
              alt={orgName}
              className="w-10 h-10 object-contain rounded-sm bg-white p-0.5 ring-1 ring-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm"
              style={{ background: activeOrg?.themeAccentColor || organization.primaryColor || "#0F4C81" }}
            >
              {activeOrg?.agencyCode?.slice(0, 2) || organization.shortCode || "AM"}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm truncate" title={orgName}>{orgName}</span>
            <span className="text-xs text-muted-foreground truncate">{scopeLabel}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/dashboard"}>
                  <Link href="/dashboard">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <Collapsible defaultOpen className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <Box />
                      <span>Assets</span>
                      <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={location === "/assets"}>
                          <Link href="/assets">
                            <Box className="w-4 h-4" />
                            <span>Asset Register</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {isAdmin && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location === "/categories"}>
                            <Link href="/categories">
                              <Tags className="w-4 h-4" />
                              <span>Categories</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/audit")}>
                  <Link href="/audit">
                    <ClipboardList />
                    <span>Audit Sessions</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/maintenance")}>
                  <Link href="/maintenance">
                    <Wrench />
                    <span>Maintenance</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/stock")}>
                  <Link href="/stock">
                    <Boxes />
                    <span>Stock & Inventory</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/purchase-requests")}>
                  <Link href="/purchase-requests">
                    <ShoppingCart />
                    <span>Purchase Requests</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/reports"}>
                  <Link href="/reports">
                    <FileBarChart />
                    <span>Reports</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/gis"}>
                  <Link href="/gis">
                    <Globe />
                    <span>GIS Map</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {isAdmin && (
                <>
                  {(user?.role === "Super Admin" || user?.role === "Agency Admin") && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location === "/organizations"}>
                        <Link href="/organizations">
                          <Building2 />
                          <span>Organizations</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/users"}>
                      <Link href="/users">
                        <Users />
                        <span>Users</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/locations"}>
                      <Link href="/locations">
                        <MapPin />
                        <span>Locations</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {(user?.role === "Super Admin" || user?.role === "Agency Admin") && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location === "/system-status"}>
                        <Link href="/system-status">
                          <ServerCog />
                          <span>System Status</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/notifications"}>
                  <Link href="/notifications">
                    <Bell />
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold px-1">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/settings"}>
                  <Link href="/settings">
                    <Settings />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} className="text-destructive hover:text-destructive">
              <LogOut />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </SidebarComponent>
  );
}