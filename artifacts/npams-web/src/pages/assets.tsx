import { useState, useMemo } from "react";
import {
  useGetAssets,
  getGetAssetsQueryKey,
  useDeleteAsset,
  useGetCategories,
  useGetProvinces,
  useGetDistrictsByProvince,
  useGetFacilitiesByDistrict,
  getGetDistrictsByProvinceQueryKey,
  getGetFacilitiesByDistrictQueryKey,
  GetAssetsStatus,
  GetAssetsCondition,
} from "@workspace/api-client-react";
import type { GetAssetsParams } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { OFFICER_ROLES } from "@/App";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Trash,
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { statusBadgeClass } from "@/lib/status";
import { getCategoryMeta } from "@/lib/category";
import { cn } from "@/lib/utils";
import { DistrictPicker } from "@/components/district-picker";
import { PageHeader } from "@/components/layout/page-header";
import { Box } from "lucide-react";

const ALL = "__all__";

const STATUS_OPTIONS = [
  { value: GetAssetsStatus.active, label: "Active" },
  { value: GetAssetsStatus.disposed, label: "Disposed" },
  { value: GetAssetsStatus.missing, label: "Missing" },
  { value: GetAssetsStatus.under_maintenance, label: "Maintenance" },
];

const CONDITION_OPTIONS = [
  { value: GetAssetsCondition.excellent, label: "Excellent" },
  { value: GetAssetsCondition.good, label: "Good" },
  { value: GetAssetsCondition.fair, label: "Fair" },
  { value: GetAssetsCondition.poor, label: "Poor" },
];

const PNG_REGIONS: { name: string; codes: string[] }[] = [
  {
    name: "Southern Region",
    codes: ["CP", "GU", "MB", "NCD", "NO", "WS"],
  },
  {
    name: "Highlands Region",
    codes: ["CH", "EH", "EN", "HE", "JI", "SH", "WHP"],
  },
  {
    name: "Momase Region",
    codes: ["ES", "MD", "MO", "SA"],
  },
  {
    name: "Islands Region",
    codes: ["AB", "ENB", "MA", "NI", "WNB"],
  },
];

function PillPicker({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-all duration-150",
              "hover:scale-105 active:scale-95 cursor-pointer select-none",
              isSelected
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-accent"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ActiveFilterChips({
  filters,
}: {
  filters: { key: string; label: string; onRemove: () => void }[];
}) {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {filters.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20 animate-in fade-in-0 slide-in-from-top-1 duration-200"
        >
          {f.label}
          <button
            type="button"
            onClick={f.onRemove}
            className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5 transition-colors"
            aria-label={`Remove ${f.label} filter`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}

export default function Assets() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const isNational = user?.scope_level === "national";
  const userProvinceId = (!isNational ? (user?.scope as { province_id?: string })?.province_id : undefined) ?? "";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [regionName, setRegionName] = useState("");
  const [provinceId, setProvinceId] = useState(userProvinceId);
  const [districtId, setDistrictId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(true);

  const canCreateAsset = OFFICER_ROLES.includes(
    user?.role as (typeof OFFICER_ROLES)[number]
  );

  const filters: GetAssetsParams = {
    page,
    limit: 10,
    ...(search ? { search } : {}),
    ...(provinceId ? { province_id: provinceId } : {}),
    ...(districtId ? { district_id: districtId } : {}),
    ...(facilityId ? { facility_id: facilityId } : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(statuses.length > 0 ? { status: statuses.join(",") as GetAssetsParams["status"] } : {}),
    ...(conditions.length > 0 ? { condition: conditions.join(",") as GetAssetsParams["condition"] } : {}),
  };

  const { data, isLoading, refetch } = useGetAssets(filters, {
    query: { queryKey: getGetAssetsQueryKey(filters) },
  });

  const { data: categoriesData } = useGetCategories();
  const { data: provincesData } = useGetProvinces();
  const { data: districtsData } = useGetDistrictsByProvince(provinceId, {
    query: {
      enabled: !!provinceId,
      queryKey: getGetDistrictsByProvinceQueryKey(provinceId),
    },
  });
  const { data: facilitiesData } = useGetFacilitiesByDistrict(districtId, {
    query: {
      enabled: !!districtId,
      queryKey: getGetFacilitiesByDistrictQueryKey(districtId),
    },
  });

  const deleteMutation = useDeleteAsset({
    mutation: {
      onSuccess: () => {
        toast({ title: "Asset deleted successfully" });
        refetch();
        setDeleteId(null);
      },
      onError: (error: Error) => {
        toast({
          variant: "destructive",
          title: "Failed to delete asset",
          description: error.message,
        });
        setDeleteId(null);
      },
    },
  });

  const allProvinces = provincesData?.data || [];

  const filteredProvinces = useMemo(() => {
    if (!regionName) return allProvinces;
    const region = PNG_REGIONS.find((r) => r.name === regionName);
    if (!region) return allProvinces;
    return allProvinces.filter((p) =>
      region.codes.includes((p as { provinceCode?: string }).provinceCode ?? "")
    );
  }, [allProvinces, regionName]);

  const assets = data?.data?.items || [];
  const pagination = data?.data?.pagination;

  const clearFilters = () => {
    setRegionName("");
    setProvinceId(userProvinceId);
    setDistrictId("");
    setFacilityId("");
    setCategoryId("");
    setStatuses([]);
    setConditions([]);
    setPage(1);
  };

  const activeFilterChips: {
    key: string;
    label: string;
    onRemove: () => void;
  }[] = [];

  if (regionName) {
    activeFilterChips.push({
      key: "region",
      label: `Region: ${regionName}`,
      onRemove: () => {
        setRegionName("");
        setProvinceId(userProvinceId);
        setDistrictId("");
        setFacilityId("");
        setPage(1);
      },
    });
  }

  if (provinceId && isNational) {
    const prov = allProvinces.find((p) => p.id === provinceId);
    activeFilterChips.push({
      key: "province",
      label: `Province: ${prov?.provinceName || provinceId}`,
      onRemove: () => {
        setProvinceId("");
        setDistrictId("");
        setFacilityId("");
        setPage(1);
      },
    });
  }

  if (districtId) {
    const dist = districtsData?.data?.find((d) => d.id === districtId);
    activeFilterChips.push({
      key: "district",
      label: `District: ${dist?.districtName || districtId}`,
      onRemove: () => {
        setDistrictId("");
        setFacilityId("");
        setPage(1);
      },
    });
  }

  if (facilityId) {
    const fac = (
      facilitiesData?.data as { id?: string; facilityName?: string }[] | undefined
    )?.find((f) => f.id === facilityId);
    activeFilterChips.push({
      key: "facility",
      label: `Facility: ${fac?.facilityName || facilityId}`,
      onRemove: () => {
        setFacilityId("");
        setPage(1);
      },
    });
  }

  if (categoryId) {
    const cat = categoriesData?.data?.find((c) => c.id === categoryId);
    const catLabel = cat
      ? `${cat.categoryName}${cat.categoryCode ? ` (${cat.categoryCode})` : ""}`
      : categoryId;
    activeFilterChips.push({
      key: "category",
      label: `Category: ${catLabel}`,
      onRemove: () => {
        setCategoryId("");
        setPage(1);
      },
    });
  }

  statuses.forEach((s) => {
    const opt = STATUS_OPTIONS.find((o) => o.value === s);
    activeFilterChips.push({
      key: `status-${s}`,
      label: `Status: ${opt?.label || s}`,
      onRemove: () => {
        setStatuses((prev) => prev.filter((x) => x !== s));
        setPage(1);
      },
    });
  });

  conditions.forEach((c) => {
    const opt = CONDITION_OPTIONS.find((o) => o.value === c);
    activeFilterChips.push({
      key: `condition-${c}`,
      label: `Condition: ${opt?.label || c}`,
      onRemove: () => {
        setConditions((prev) => prev.filter((x) => x !== c));
        setPage(1);
      },
    });
  });

  const activeCount = activeFilterChips.length;
  const hasActiveFilters = activeCount > 0;

  const districts = districtsData?.data || [];
  const facilities = (facilitiesData?.data || []) as {
    id?: string;
    facilityName?: string;
  }[];

  const goToAsset = (assetId: string) => {
    const ctx: Record<string, string> = {};
    if (provinceId) ctx.province_id = provinceId;
    if (districtId) ctx.district_id = districtId;
    if (facilityId) ctx.facility_id = facilityId;
    if (categoryId) ctx.category_id = categoryId;
    if (statuses.length) ctx.status = statuses.join(",");
    if (conditions.length) ctx.condition = conditions.join(",");
    if (search) ctx.search = search;
    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    try {
      sessionStorage.setItem(`npams_assets_list_ctx_${nonce}`, JSON.stringify(ctx));
    } catch {
      // ignore quota errors
    }
    setLocation(`/assets/${assetId}?ctx=${nonce}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Register"
        subtitle="Manage and track all public assets."
        icon={<Box className="w-5 h-5" />}
        breadcrumbs={[{ label: "Assets" }]}
        actions={canCreateAsset && (
          <Button onClick={() => setLocation("/assets/new")}>
            <Plus className="w-4 h-4" />
            Add Asset
          </Button>
        )}
      />

      <div className="bg-card rounded-lg border">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <button
            type="button"
            className="flex items-center gap-2 cursor-pointer select-none flex-1 text-left"
            onClick={() => setFilterOpen((o) => !o)}
            aria-expanded={filterOpen}
            aria-label="Toggle filters"
          >
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
            {hasActiveFilters && (
              <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                {activeCount} active {activeCount === 1 ? "filter" : "filters"}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 text-xs px-2"
              >
                <X className="w-3 h-3 mr-1" />
                Clear all
              </Button>
            )}
            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className="p-1 rounded hover:bg-muted transition-colors"
              aria-label={filterOpen ? "Collapse filters" : "Expand filters"}
            >
              {filterOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        {filterOpen && (
          <div className="p-4 space-y-4 border-b animate-in fade-in-0 slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, tag, serial..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>

            {isNational && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Region
                    </p>
                    <Select
                      value={regionName || ALL}
                      onValueChange={(v) => {
                        const newRegion = v === ALL ? "" : v;
                        setRegionName(newRegion);
                        setProvinceId("");
                        setDistrictId("");
                        setFacilityId("");
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="All Regions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>All Regions</SelectItem>
                        {PNG_REGIONS.map((r) => (
                          <SelectItem key={r.name} value={r.name}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Province
                    </p>
                    <Select
                      value={provinceId || ALL}
                      onValueChange={(v) => {
                        const newVal = v === ALL ? "" : v;
                        setProvinceId(newVal);
                        setDistrictId("");
                        setFacilityId("");
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="All Provinces" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>All Provinces</SelectItem>
                        {filteredProvinces.map((p) => (
                          <SelectItem key={p.id} value={p.id!}>
                            {p.provinceName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DistrictPicker
                  districts={districts}
                  selectedId={districtId}
                  onSelect={(id) => {
                    setDistrictId(id);
                    setFacilityId("");
                    setPage(1);
                  }}
                  visible={!!provinceId && districts.length > 0}
                />

                {districtId && facilities.length > 0 && (
                  <div className="animate-in fade-in-0 slide-in-from-top-1 duration-200">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Facility
                    </p>
                    <Select
                      value={facilityId || ALL}
                      onValueChange={(v) => {
                        setFacilityId(v === ALL ? "" : v);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="All Facilities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>All Facilities</SelectItem>
                        {facilities.map((f) => (
                          <SelectItem key={f.id} value={f.id!}>
                            {f.facilityName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {!isNational && (
              <div className="space-y-3">
                <DistrictPicker
                  districts={districts}
                  selectedId={districtId}
                  onSelect={(id) => {
                    setDistrictId(id);
                    setFacilityId("");
                    setPage(1);
                  }}
                  visible={districts.length > 0}
                />
                {districtId && facilities.length > 0 && (
                  <div className="animate-in fade-in-0 slide-in-from-top-1 duration-200">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Facility
                    </p>
                    <Select
                      value={facilityId || ALL}
                      onValueChange={(v) => {
                        setFacilityId(v === ALL ? "" : v);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="All Facilities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>All Facilities</SelectItem>
                        {facilities.map((f) => (
                          <SelectItem key={f.id} value={f.id!}>
                            {f.facilityName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Category
              </p>
              <div className="flex flex-wrap gap-1.5">
                {categoriesData?.data?.map((c) => {
                  const isSelected = categoryId === c.id;
                  const meta = getCategoryMeta(c.categoryName, c.categoryCode);
                  const Icon = meta.icon;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCategoryId(isSelected ? "" : c.id!);
                        setPage(1);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all duration-150",
                        "hover:scale-105 active:scale-95 cursor-pointer select-none",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-accent"
                      )}
                    >
                      <Icon
                        className="h-3.5 w-3.5 shrink-0"
                        style={isSelected ? undefined : { color: meta.color }}
                      />
                      <span>{c.categoryName}</span>
                      {c.categoryCode && (
                        <span
                          className={cn(
                            "ml-0.5 font-mono text-[10px] px-1 py-0.5 rounded",
                            isSelected
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {c.categoryCode}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Status
              </p>
              <PillPicker
                options={STATUS_OPTIONS}
                selected={statuses}
                onToggle={(v) => {
                  setStatuses((prev) =>
                    prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v]
                  );
                  setPage(1);
                }}
              />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Condition
              </p>
              <PillPicker
                options={CONDITION_OPTIONS}
                selected={conditions}
                onToggle={(v) => {
                  setConditions((prev) =>
                    prev.includes(v) ? prev.filter((c) => c !== v) : [...prev, v]
                  );
                  setPage(1);
                }}
              />
            </div>
          </div>
        )}

        {hasActiveFilters && (
          <div className="px-4 py-2 bg-muted/30">
            <ActiveFilterChips filters={activeFilterChips} />
          </div>
        )}
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Tag</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Province</TableHead>
                <TableHead>Facility</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : assets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No assets found.
                  </TableCell>
                </TableRow>
              ) : (
                assets.map((asset) => (
                  <TableRow
                    key={asset.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => goToAsset(asset.id!)}
                  >
                    <TableCell className="font-mono text-xs">
                      {asset.assetTag}
                    </TableCell>
                    <TableCell className="font-medium">
                      {asset.assetName}
                    </TableCell>
                    <TableCell>
                      {asset.category?.categoryName ? (() => {
                        const meta = getCategoryMeta(
                          asset.category.categoryName,
                          asset.category.categoryCode,
                        );
                        const Icon = meta.icon;
                        return (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0",
                                meta.chipClass,
                              )}
                              aria-hidden
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </span>
                            <span>{asset.category.categoryName}</span>
                            {asset.category.categoryCode && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {asset.category.categoryCode}
                              </span>
                            )}
                          </span>
                        );
                      })() : (
                        "N/A"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {asset.condition}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`capitalize ${statusBadgeClass(asset.status)}`}
                      >
                        {asset.status?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {asset.province?.provinceName || "N/A"}
                    </TableCell>
                    <TableCell>
                      {asset.facility?.facilityName || "N/A"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => goToAsset(asset.id!)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          {canCreateAsset && (
                            <DropdownMenuItem
                              onClick={() =>
                                setLocation(`/assets/${asset.id}/edit`)
                              }
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {user?.role === "Super Admin" && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteId(asset.id!)}
                            >
                              <Trash className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {pagination &&
          pagination.total_pages &&
          pagination.total_pages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing page {pagination.page} of {pagination.total_pages} (
                {pagination.total} total)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
      </div>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              asset record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) deleteMutation.mutate({ id: deleteId });
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Asset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
