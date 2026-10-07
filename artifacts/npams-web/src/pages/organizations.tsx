import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization, OrganizationSummary } from "@/context/organization-context";
import { apiFetchJson } from "@/lib/api-fetch";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Plus,
  Search,
  SlidersHorizontal,
  Download,
  ArrowUpDown,
  Boxes,
  Users,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Edit,
  Power,
  Layers,
  Globe,
  RefreshCw,
  Upload,
  Image as ImageIcon,
  Pipette,
  X,
} from "lucide-react";

import { LogoUploaderField, BrandColorPickerField, PRESET_BRAND_COLORS } from "@/components/brand-fields";

interface EnrichedOrganization extends OrganizationSummary {
  assetCount: number;
  stockCount: number;
  userCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export default function OrganizationsPage() {
  const { user } = useAuth();
  const { activeAgencyId, setActiveAgencyId, refreshOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isSuperAdmin = user?.role === "Super Admin";

  // Filters & Search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Sorting
  const [sortField, setSortField] = useState<keyof EnrichedOrganization>("agencyName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState({
    code: true,
    name: true,
    type: true,
    status: true,
    assets: true,
    stock: true,
    users: true,
    actions: true,
  });

  // Modal dialogs state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<EnrichedOrganization | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    agencyCode: "",
    agencyName: "",
    agencyType: "Enterprise",
    description: "",
    logoUrl: "",
    themeAccentColor: "#0F4C81",
    currencyCode: "USD",
    currencySymbol: "$",
    hierarchyPreset: "corporate",
    systemTitle: "",
  });

  // Query organizations
  const { data: orgs = [], isLoading, isError, refetch } = useQuery<EnrichedOrganization[]>({
    queryKey: ["/api/v1/organizations"],
    queryFn: async () => {
      const res = await apiFetchJson<any>("/api/v1/organizations");
      if (res.ok && res.data) {
        if (Array.isArray(res.data)) {
          return res.data as EnrichedOrganization[];
        }
        if (Array.isArray(res.data.data)) {
          return res.data.data as EnrichedOrganization[];
        }
      }
      return [];
    },
  });

  // Create organization mutation
  const createMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      const res = await apiFetchJson<{ success: boolean; message?: string; data: unknown }>("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(res.message || "Failed to create organization");
      }
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: "Organization Created",
        description: `Successfully registered organization '${formData.agencyName}'.`,
      });
      setCreateDialogOpen(false);
      setFormData({
        agencyCode: "",
        agencyName: "",
        agencyType: "Enterprise",
        description: "",
        logoUrl: "",
        themeAccentColor: "#0F4C81",
        currencyCode: "USD",
        currencySymbol: "$",
        hierarchyPreset: "corporate",
        systemTitle: "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/organizations"] });
      refreshOrganization();
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Creation Failed",
        description: err.message,
      });
    },
  });

  // Edit organization mutation
  const editMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<EnrichedOrganization> }) => {
      const res = await apiFetchJson<{ success: boolean; message?: string }>(`/api/v1/organizations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        throw new Error(res.message || "Failed to update organization");
      }
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: "Organization Updated",
        description: "Organization details and branding have been synchronized.",
      });
      setEditDialogOpen(false);
      setSelectedOrg(null);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/organizations"] });
      refreshOrganization();
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err.message,
      });
    },
  });

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiFetchJson<{ success: boolean; message?: string }>(`/api/v1/organizations/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        throw new Error(res.message || "Failed to toggle organization status");
      }
      return res.data;
    },
    onSuccess: (_, { active }) => {
      toast({
        title: active ? "Organization Activated" : "Organization Deactivated",
        description: "The organization status has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/organizations"] });
      refreshOrganization();
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Status Update Failed",
        description: err.message,
      });
    },
  });

  // Unique organization types for filtering
  const organizationTypes = useMemo(() => {
    const set = new Set<string>();
    orgs.forEach((o) => {
      if (o.agencyType) set.add(o.agencyType);
    });
    return Array.from(set).sort();
  }, [orgs]);

  // Aggregated KPIs
  const stats = useMemo(() => {
    const total = orgs.length;
    const active = orgs.filter((o) => o.active).length;
    const totalAssets = orgs.reduce((acc, o) => acc + (o.assetCount || 0), 0);
    const totalUsers = orgs.reduce((acc, o) => acc + (o.userCount || 0), 0);
    return { total, active, totalAssets, totalUsers };
  }, [orgs]);

  // Filtered & Sorted Data
  const filteredOrgs = useMemo(() => {
    return orgs
      .filter((org) => {
        const matchesSearch =
          !search ||
          org.agencyName.toLowerCase().includes(search.toLowerCase()) ||
          org.agencyCode.toLowerCase().includes(search.toLowerCase()) ||
          (org.agencyType && org.agencyType.toLowerCase().includes(search.toLowerCase())) ||
          (org.description && org.description.toLowerCase().includes(search.toLowerCase()));

        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && org.active) ||
          (statusFilter === "inactive" && !org.active);

        const matchesType = typeFilter === "all" || org.agencyType === typeFilter;

        return matchesSearch && matchesStatus && matchesType;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        if (sortOrder === "asc") {
          return valA > valB ? 1 : -1;
        } else {
          return valA < valB ? 1 : -1;
        }
      });
  }, [orgs, search, statusFilter, typeFilter, sortField, sortOrder]);

  // Pagination calculation
  const totalRecords = filteredOrgs.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const paginatedOrgs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrgs.slice(start, start + pageSize);
  }, [filteredOrgs, currentPage, pageSize]);

  const toggleSort = (field: keyof EnrichedOrganization) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const handleExportCSV = () => {
    const headers = ["Code", "Organization Name", "Type", "Status", "Total Assets", "Total Users", "Total Stock Items", "Description"];
    const rows = filteredOrgs.map((o) => [
      `"${o.agencyCode}"`,
      `"${o.agencyName.replace(/"/g, '""')}"`,
      `"${o.agencyType || ""}"`,
      `"${o.active ? "Active" : "Inactive"}"`,
      o.assetCount,
      o.userCount,
      o.stockCount,
      `"${(o.description || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `organizations-export-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openEditModal = (org: EnrichedOrganization) => {
    setSelectedOrg(org);
    setEditDialogOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <PageHeader
        icon={<Building2 className="w-5 h-5 text-primary" />}
        title="Multi-Tenant Organizations"
        subtitle="Manage independent organizations, parastatals, branding, and institutional scoping."
        breadcrumbs={[{ label: "Administration" }, { label: "Organizations" }]}
        actions={
          isSuperAdmin && (
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Register Organization
            </Button>
          )
        }
      />

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border-border/80">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium">Total Organizations</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              {stats.total}
              <Building2 className="w-5 h-5 text-muted-foreground/60" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {stats.active} currently active &amp; accessible
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/80">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium">Active Status</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between text-emerald-600 dark:text-emerald-400">
              {stats.active}
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {stats.total - stats.active} archived or inactive
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/80">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium">Total Assets Scoped</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between text-blue-600 dark:text-blue-400">
              {stats.totalAssets.toLocaleString()}
              <Boxes className="w-5 h-5 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Scoped across all tenant registries
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/80">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium">Platform Personnel</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between text-purple-600 dark:text-purple-400">
              {stats.totalUsers.toLocaleString()}
              <Users className="w-5 h-5 text-purple-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Staff and agency administrators
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="shadow-sm border-border/80">
        <CardHeader className="p-4 sm:p-6 pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-semibold">Registered Organizations</CardTitle>
              <CardDescription>
                Select an organization to activate its tenant context, or manage institutional credentials.
              </CardDescription>
            </div>

            {/* Quick Context Indicator */}
            {activeAgencyId ? (
              <Badge variant="outline" className="self-start md:self-auto py-1 px-2.5 gap-2 border-primary/40 bg-primary/5">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Active Context:{" "}
                <span className="font-semibold">
                  {orgs.find((o) => o.id === activeAgencyId)?.agencyName ?? "Selected Agency"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setActiveAgencyId(null);
                    queryClient.invalidateQueries();
                  }}
                >
                  Reset to All
                </Button>
              </Badge>
            ) : (
              <Badge variant="secondary" className="self-start md:self-auto py-1 px-2.5">
                Global View (All Organizations)
              </Badge>
            )}
          </div>

          {/* Search, Filter & Actions Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 pt-4">
            <div className="md:col-span-5 relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search by code, name, type..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 h-9 text-sm"
              />
            </div>

            <div className="md:col-span-3">
              <Select
                value={typeFilter}
                onValueChange={(val) => {
                  setTypeFilter(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Organization Types</SelectItem>
                  {organizationTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="inactive">Inactive Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 flex items-center justify-end gap-2">
              {/* Column Visibility Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 px-2.5 text-xs gap-1.5" title="Customize Columns">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-48 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Toggle Columns</p>
                  {Object.entries({
                    code: "Code",
                    name: "Name",
                    type: "Type",
                    status: "Status",
                    assets: "Assets",
                    stock: "Stock Items",
                    users: "Users",
                  }).map(([key, label]) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`col-${key}`}
                        checked={visibleColumns[key as keyof typeof visibleColumns]}
                        onCheckedChange={(checked) =>
                          setVisibleColumns((prev) => ({ ...prev, [key]: Boolean(checked) }))
                        }
                      />
                      <label htmlFor={`col-${key}`} className="text-xs cursor-pointer select-none">
                        {label}
                      </label>
                    </div>
                  ))}
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2.5 text-xs gap-1.5"
                onClick={handleExportCSV}
                title="Export Table as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 border-t">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span>Loading organizations directory...</span>
            </div>
          ) : isError ? (
            <div className="p-12 text-center text-sm text-destructive flex flex-col items-center gap-2">
              <XCircle className="w-6 h-6" />
              <span>Failed to load organizations. Please try again.</span>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                Retry
              </Button>
            </div>
          ) : paginatedOrgs.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Building2 className="w-8 h-8 opacity-40" />
              <span className="font-medium">No organizations match your filters</span>
              <span className="text-xs text-muted-foreground">Try clearing the search query or status filter.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {visibleColumns.code && (
                      <TableHead
                        className="cursor-pointer select-none hover:text-foreground text-xs font-semibold w-24"
                        onClick={() => toggleSort("agencyCode")}
                      >
                        <div className="flex items-center gap-1">
                          Code <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </TableHead>
                    )}
                    {visibleColumns.name && (
                      <TableHead
                        className="cursor-pointer select-none hover:text-foreground text-xs font-semibold"
                        onClick={() => toggleSort("agencyName")}
                      >
                        <div className="flex items-center gap-1">
                          Organization Name <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </TableHead>
                    )}
                    {visibleColumns.type && (
                      <TableHead
                        className="cursor-pointer select-none hover:text-foreground text-xs font-semibold w-32"
                        onClick={() => toggleSort("agencyType")}
                      >
                        <div className="flex items-center gap-1">
                          Type <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </TableHead>
                    )}
                    {visibleColumns.status && (
                      <TableHead className="text-xs font-semibold w-24">Status</TableHead>
                    )}
                    {visibleColumns.assets && (
                      <TableHead
                        className="cursor-pointer select-none hover:text-foreground text-xs font-semibold text-right w-24"
                        onClick={() => toggleSort("assetCount")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Assets <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </TableHead>
                    )}
                    {visibleColumns.stock && (
                      <TableHead
                        className="cursor-pointer select-none hover:text-foreground text-xs font-semibold text-right w-24"
                        onClick={() => toggleSort("stockCount")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Stock Items <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </TableHead>
                    )}
                    {visibleColumns.users && (
                      <TableHead
                        className="cursor-pointer select-none hover:text-foreground text-xs font-semibold text-right w-20"
                        onClick={() => toggleSort("userCount")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Users <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </TableHead>
                    )}
                    {visibleColumns.actions && (
                      <TableHead className="text-xs font-semibold text-right w-44">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrgs.map((org) => {
                    const isCurrentlyActive = activeAgencyId === org.id;
                    return (
                      <TableRow
                        key={org.id}
                        className={`hover:bg-muted/40 transition-colors ${isCurrentlyActive ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                      >
                        {visibleColumns.code && (
                          <TableCell className="font-mono text-xs font-bold">
                            <Badge variant="outline" className="font-mono text-[11px] tracking-wide">
                              {org.agencyCode}
                            </Badge>
                          </TableCell>
                        )}

                        {visibleColumns.name && (
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {org.logoUrl ? (
                                <img
                                  src={org.logoUrl}
                                  alt={org.agencyName}
                                  className="w-7 h-7 object-contain rounded bg-white p-0.5 border shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              ) : (
                                <div
                                  className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-xs"
                                  style={{ backgroundColor: org.themeAccentColor || "#0F4C81" }}
                                >
                                  {org.agencyCode.slice(0, 2)}
                                </div>
                              )}
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium text-sm text-foreground truncate max-w-sm">
                                  {org.agencyName}
                                </span>
                                {org.description && (
                                  <span className="text-xs text-muted-foreground truncate max-w-sm">
                                    {org.description}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        )}

                        {visibleColumns.type && (
                          <TableCell className="text-xs text-muted-foreground font-medium">
                            {org.agencyType || "Enterprise"}
                          </TableCell>
                        )}

                        {visibleColumns.status && (
                          <TableCell>
                            {org.active ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-medium">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-muted-foreground text-[10px]">
                                Inactive
                              </Badge>
                            )}
                          </TableCell>
                        )}

                        {visibleColumns.assets && (
                          <TableCell className="text-right text-xs font-semibold tabular-nums">
                            {org.assetCount.toLocaleString()}
                          </TableCell>
                        )}

                        {visibleColumns.stock && (
                          <TableCell className="text-right text-xs font-semibold tabular-nums text-muted-foreground">
                            {org.stockCount.toLocaleString()}
                          </TableCell>
                        )}

                        {visibleColumns.users && (
                          <TableCell className="text-right text-xs font-semibold tabular-nums text-muted-foreground">
                            {org.userCount.toLocaleString()}
                          </TableCell>
                        )}

                        {visibleColumns.actions && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick Switch Button */}
                              {isSuperAdmin && (
                                <Button
                                  variant={isCurrentlyActive ? "secondary" : "outline"}
                                  size="sm"
                                  className={`h-7 px-2 text-xs gap-1 ${isCurrentlyActive ? "font-bold text-primary" : ""}`}
                                  onClick={() => {
                                    if (isCurrentlyActive) {
                                      setActiveAgencyId(null);
                                    } else {
                                      setActiveAgencyId(org.id);
                                    }
                                    queryClient.invalidateQueries();
                                  }}
                                  title={isCurrentlyActive ? "Reset to Global View" : "Switch to this organization"}
                                >
                                  {isCurrentlyActive ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Active
                                    </>
                                  ) : (
                                    "Switch To"
                                  )}
                                </Button>
                              )}

                              {/* Edit details */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => openEditModal(org)}
                                title="Edit Organization"
                              >
                                <Edit className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                              </Button>

                              {/* Toggle Active status */}
                              {isSuperAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => toggleStatusMutation.mutate({ id: org.id, active: !org.active })}
                                  title={org.active ? "Deactivate organization" : "Activate organization"}
                                >
                                  <Power className={`w-3.5 h-3.5 ${org.active ? "text-emerald-600" : "text-muted-foreground"}`} />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Footer */}
          <div className="p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Showing</span>
              <span className="font-semibold text-foreground">
                {totalRecords > 0 ? (currentPage - 1) * pageSize + 1 : 0}
              </span>
              <span>to</span>
              <span className="font-semibold text-foreground">
                {Math.min(currentPage * pageSize, totalRecords)}
              </span>
              <span>of</span>
              <span className="font-semibold text-foreground">{totalRecords}</span>
              <span>organizations</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span>Rows per page:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => {
                    setPageSize(Number(val));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-7 w-16 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="px-2 font-medium text-foreground">
                  {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CREATE ORGANIZATION DIALOG */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Register New Organization
            </DialogTitle>
            <DialogDescription>
              Create an institutional organization or parastatal with custom branding, currency, and scoping.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(formData);
            }}
            className="space-y-4 py-2"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="agencyCode" className="text-xs font-semibold">
                  Organization Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="agencyCode"
                  placeholder="e.g. DOH, FINANCE, PORT"
                  value={formData.agencyCode}
                  onChange={(e) => setFormData({ ...formData, agencyCode: e.target.value.toUpperCase() })}
                  required
                />
                <p className="text-[10px] text-muted-foreground">Unique identifier used in asset tags &amp; stock codes.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agencyType" className="text-xs font-semibold">
                  Organization Type
                </Label>
                <Select
                  value={formData.agencyType}
                  onValueChange={(val) => setFormData({ ...formData, agencyType: val })}
                >
                  <SelectTrigger id="agencyType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Enterprise">Enterprise / Commercial</SelectItem>
                    <SelectItem value="Department">Government Department</SelectItem>
                    <SelectItem value="Authority">Statutory Authority</SelectItem>
                    <SelectItem value="Commission">Commission</SelectItem>
                    <SelectItem value="Service">Public Service</SelectItem>
                    <SelectItem value="Hospital">Hospital / Healthcare</SelectItem>
                    <SelectItem value="University">Education / Academic</SelectItem>
                    <SelectItem value="NGO">Non-Governmental (NGO)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agencyName" className="text-xs font-semibold">
                Organization Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="agencyName"
                placeholder="e.g. National Department of Health"
                value={formData.agencyName}
                onChange={(e) => setFormData({ ...formData, agencyName: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-semibold">
                Description / Mission Tagline
              </Label>
              <Textarea
                id="description"
                placeholder="Brief summary of the organization's purpose or jurisdictional mandate..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <LogoUploaderField
                id="create-logo"
                label="Organization Logo"
                value={formData.logoUrl}
                onChange={(url) => setFormData({ ...formData, logoUrl: url })}
              />
              <BrandColorPickerField
                id="create-color"
                label="Primary Brand Color"
                value={formData.themeAccentColor}
                onChange={(hex) => setFormData({ ...formData, themeAccentColor: hex })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="currencyCode" className="text-xs font-semibold">
                  Currency Code
                </Label>
                <Input
                  id="currencyCode"
                  placeholder="USD, PGK, AUD, EUR..."
                  value={formData.currencyCode}
                  onChange={(e) => setFormData({ ...formData, currencyCode: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="currencySymbol" className="text-xs font-semibold">
                  Currency Symbol
                </Label>
                <Input
                  id="currencySymbol"
                  placeholder="$, K, €, £..."
                  value={formData.currencySymbol}
                  onChange={(e) => setFormData({ ...formData, currencySymbol: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Registering..." : "Register Organization"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT ORGANIZATION DIALOG */}
      {selectedOrg && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-primary" />
                Edit Organization: {selectedOrg.agencyName}
              </DialogTitle>
              <DialogDescription>
                Modify display title, organization category, emblem, and branding colors.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                editMutation.mutate({
                  id: selectedOrg.id,
                  updates: {
                    agencyName: selectedOrg.agencyName,
                    agencyType: selectedOrg.agencyType,
                    description: selectedOrg.description,
                    logoUrl: selectedOrg.logoUrl,
                    themeAccentColor: selectedOrg.themeAccentColor,
                  },
                });
              }}
              className="space-y-4 py-2"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Organization Code</Label>
                  <Input value={selectedOrg.agencyCode} disabled className="bg-muted font-mono" />
                  <p className="text-[10px] text-muted-foreground">Code is immutable once created.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="editType" className="text-xs font-semibold">
                    Organization Type
                  </Label>
                  <Input
                    id="editType"
                    value={selectedOrg.agencyType || ""}
                    onChange={(e) => setSelectedOrg({ ...selectedOrg, agencyType: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editName" className="text-xs font-semibold">
                  Organization Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="editName"
                  value={selectedOrg.agencyName}
                  onChange={(e) => setSelectedOrg({ ...selectedOrg, agencyName: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editDesc" className="text-xs font-semibold">
                  Description
                </Label>
                <Textarea
                  id="editDesc"
                  value={selectedOrg.description || ""}
                  onChange={(e) => setSelectedOrg({ ...selectedOrg, description: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <LogoUploaderField
                  id="edit-logo"
                  label="Organization Logo"
                  value={selectedOrg.logoUrl || ""}
                  onChange={(url) => setSelectedOrg({ ...selectedOrg, logoUrl: url })}
                />
                <BrandColorPickerField
                  id="edit-color"
                  label="Theme Accent Color"
                  value={selectedOrg.themeAccentColor || "#0F4C81"}
                  onChange={(hex) => setSelectedOrg({ ...selectedOrg, themeAccentColor: hex })}
                />
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editMutation.isPending}>
                  {editMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
