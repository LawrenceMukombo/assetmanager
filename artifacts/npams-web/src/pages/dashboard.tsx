import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardMap from "@/components/dashboard/dashboard-map";
import { useAuth } from "@/hooks/use-auth";
import { useProvinceBranding } from "@/hooks/use-province-branding";
import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Box, AlertTriangle, Wrench, DollarSign, Map,
  ArrowUpDown, ArrowUp, ArrowDown, Activity, TrendingUp,
  CheckCircle, XCircle, X, Filter, ChevronRight, ExternalLink, MapPin,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area, LabelList,
} from "recharts";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/layout/page-header";
import {
  STATUS_COLOR_MAP as STATUS_COLORS,
  STATUS_TEXT_COLOR_MAP as STATUS_TEXT_COLORS,
  CONDITION_COLOR_MAP as CONDITION_COLORS,
  FALLBACK_STATUS_COLOR,
  FALLBACK_STATUS_TEXT_COLOR,
} from "@/lib/status";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-2))",
  "hsl(var(--info))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-2) / 0.7)",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--success))",
  "hsl(var(--info) / 0.7)",
  "hsl(var(--chart-5) / 0.7)",
];

const STATUS_LABELS: Record<string, string> = {
  active:            "Active",
  missing:           "Missing",
  under_maintenance: "Under Maintenance",
  disposed:          "Disposed",
  transferred:       "Transferred",
};

const CONDITION_LABELS: Record<string, string> = {
  new:           "New",
  good:          "Good",
  fair:          "Fair",
  poor:          "Poor",
  unserviceable: "Unserviceable",
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmtKina(v: string | number | null | undefined): string {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  if (isNaN(n)) return "K 0";
  if (n >= 1_000_000) return `K ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `K ${(n / 1_000).toFixed(1)}K`;
  return `K ${n.toLocaleString()}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function capitalize(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Filter State ─────────────────────────────────────────────────────────────

interface DashFilters {
  status:       string | null;
  condition:    string | null;
  categoryName: string | null;
  districtId:   string | null;
  provinceId:   string | null;
  facilityId:   string | null;
  region:       string | null;
}

const EMPTY_FILTERS: DashFilters = {
  status: null, condition: null, categoryName: null, districtId: null, provinceId: null, facilityId: null, region: null,
};

function buildParams(filters: DashFilters, extra?: Record<string, string>): string {
  const p = new URLSearchParams();
  if (filters.status)       p.set("status", filters.status);
  if (filters.condition)    p.set("condition", filters.condition);
  if (filters.categoryName) p.set("category_name", filters.categoryName);
  if (filters.region)       p.set("region", filters.region);
  if (filters.provinceId)   p.set("province_id", filters.provinceId);
  if (filters.districtId)   p.set("district_id", filters.districtId);
  if (filters.facilityId)   p.set("facility_id", filters.facilityId);
  if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ─── Location Filter Bar ──────────────────────────────────────────────────────

interface LocationScope {
  region:       string | null;
  provinceId:   string | null;
  provinceName: string | null;
  provinceCode: string | null;
  districtId:   string | null;
  districtName: string | null;
  facilityId:   string | null;
  facilityName: string | null;
}
const EMPTY_LOCATION: LocationScope = {
  region: null, provinceId: null, provinceName: null, provinceCode: null,
  districtId: null, districtName: null, facilityId: null, facilityName: null,
};

type RegionEntry = { name: string; provinces: { id: string; provinceName: string; provinceCode: string }[] };

function LocationFilterBar({
  scope,
  onChange,
  showRegionProvince,
  fixedProvinceId,
}: {
  scope: LocationScope;
  onChange: (patch: Partial<LocationScope> & Partial<DashFilters>) => void;
  showRegionProvince: boolean;
  fixedProvinceId?: string | null;
}) {
  const lookupProvinceId = fixedProvinceId ?? scope.provinceId;

  const { data: regionsData } = useQuery({
    queryKey: ["regions-list"],
    queryFn:  () => apiFetchJson("/api/v1/locations/regions"),
    staleTime: 600_000,
    enabled:  showRegionProvince,
  });

  const { data: provData } = useQuery({
    queryKey: ["provinces-list"],
    queryFn:  () => apiFetchJson("/api/v1/locations/provinces"),
    staleTime: 600_000,
    enabled:  showRegionProvince,
  });

  const { data: distData } = useQuery({
    queryKey: ["districts-list", lookupProvinceId],
    queryFn:  () => apiFetchJson(`/api/v1/locations/provinces/${lookupProvinceId}/districts`),
    staleTime: 600_000,
    enabled:  !!lookupProvinceId,
  });

  const { data: facData } = useQuery({
    queryKey: ["facilities-list", scope.districtId],
    queryFn:  () => apiFetchJson(`/api/v1/locations/districts/${scope.districtId}/facilities`),
    staleTime: 600_000,
    enabled:  !!scope.districtId,
  });

  type ProvRow = { id: string; provinceName: string; provinceCode?: string };
  type DistRow = { id: string; districtName: string };
  type FacRow  = { id: string; facilityName: string };

  const regionsList: RegionEntry[] = (regionsData?.data as RegionEntry[]) ?? [];
  const allProvinces: ProvRow[] = (provData?.data as ProvRow[]) ?? [];
  const districts: DistRow[] = (distData?.data as DistRow[]) ?? [];
  const facList: FacRow[] = (facData?.data as FacRow[]) ?? [];

  // Filter province list by selected region
  const filteredProvinces = useMemo(() => {
    if (!scope.region) return allProvinces;
    const rEntry = regionsList.find(r => r.name === scope.region);
    if (!rEntry) return allProvinces;
    const codes = new Set(rEntry.provinces.map(p => p.provinceCode));
    return allProvinces.filter(p => codes.has(p.provinceCode ?? ""));
  }, [allProvinces, regionsList, scope.region]);

  const hasAnyScope = !!(scope.region || scope.provinceId || scope.districtId || scope.facilityId);

  return (
    <Card className="border-dashed bg-muted/30">
      <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground shrink-0">
          <MapPin className="w-4 h-4" /> Location Scope
        </div>

        {showRegionProvince && (
          <Select
            value={scope.region ?? "_none"}
            onValueChange={v => {
              if (v === "_none") {
                onChange({ region: null, provinceId: null, provinceName: null, districtId: null, districtName: null, facilityId: null, facilityName: null });
              } else {
                onChange({ region: v, provinceId: null, provinceName: null, districtId: null, districtName: null, facilityId: null, facilityName: null });
              }
            }}
          >
            <SelectTrigger className="h-8 w-[160px] text-sm">
              <SelectValue placeholder="All Regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">All Regions</SelectItem>
              {regionsList.map(r => (
                <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {showRegionProvince && (
          <Select
            value={scope.provinceId ?? "_none"}
            onValueChange={v => {
              if (v === "_none") {
                onChange({ provinceId: null, provinceName: null, districtId: null, districtName: null, facilityId: null, facilityName: null });
              } else {
                const p = filteredProvinces.find(x => x.id === v);
                onChange({ provinceId: v, provinceName: p?.provinceName ?? null, provinceCode: p?.provinceCode ?? null, districtId: null, districtName: null, facilityId: null, facilityName: null });
              }
            }}
          >
            <SelectTrigger className="h-8 w-[200px] text-sm">
              <SelectValue placeholder="All Provinces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">All Provinces</SelectItem>
              {filteredProvinces.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.provinceName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={scope.districtId ?? "_none"}
          onValueChange={v => {
            if (v === "_none") {
              onChange({ districtId: null, districtName: null, facilityId: null, facilityName: null });
            } else {
              const d = districts.find(x => x.id === v);
              onChange({ districtId: v, districtName: d?.districtName ?? null, facilityId: null, facilityName: null });
            }
          }}
          disabled={showRegionProvince && !lookupProvinceId}
        >
          <SelectTrigger className="h-8 w-[190px] text-sm">
            <SelectValue placeholder={showRegionProvince && !lookupProvinceId ? "Select province first" : "All Districts"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">All Districts</SelectItem>
            {districts.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.districtName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={scope.facilityId ?? "_none"}
          onValueChange={v => {
            if (v === "_none") {
              onChange({ facilityId: null, facilityName: null });
            } else {
              const f = facList.find(x => x.id === v);
              onChange({ facilityId: v, facilityName: f?.facilityName ?? null });
            }
          }}
          disabled={!scope.districtId}
        >
          <SelectTrigger className="h-8 w-[190px] text-sm">
            <SelectValue placeholder={!scope.districtId ? "Select district first" : "All Facilities"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">All Facilities</SelectItem>
            {facList.map(f => (
              <SelectItem key={f.id} value={f.id}>{f.facilityName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasAnyScope && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => onChange(EMPTY_LOCATION)}
          >
            <X className="w-3 h-3 mr-1" /> Reset location
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Active Filter Strip ──────────────────────────────────────────────────────

function FilterStrip({ filters, onClear, total, filteredTotal, locationScope }: {
  filters: DashFilters;
  onClear: (key: keyof DashFilters | "all") => void;
  total: number;
  filteredTotal: number;
  locationScope?: LocationScope;
}) {
  const chips: { key: keyof DashFilters; label: string }[] = [];
  if (filters.status)       chips.push({ key: "status",       label: STATUS_LABELS[filters.status] ?? capitalize(filters.status) });
  if (filters.condition)    chips.push({ key: "condition",    label: CONDITION_LABELS[filters.condition] ?? capitalize(filters.condition) });
  if (filters.categoryName) chips.push({ key: "categoryName", label: filters.categoryName });
  if (filters.region)       chips.push({ key: "region",       label: `${filters.region} Region` });
  if (filters.provinceId)   chips.push({ key: "provinceId",   label: locationScope?.provinceName ?? "Province filter" });
  if (filters.districtId)   chips.push({ key: "districtId",   label: locationScope?.districtName ?? "District filter" });
  if (filters.facilityId)   chips.push({ key: "facilityId",   label: locationScope?.facilityName ?? "Facility filter" });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
      <Filter className="w-4 h-4 text-primary shrink-0" />
      <span className="text-sm text-muted-foreground">Filtering:</span>
      {chips.map(c => (
        <Badge key={c.key} variant="secondary" className="gap-1 cursor-pointer pr-1" onClick={() => onClear(c.key)}>
          {c.label}
          <X className="w-3 h-3 ml-0.5" />
        </Badge>
      ))}
      <span className="text-sm font-medium ml-2">
        {filteredTotal.toLocaleString()} of {total.toLocaleString()} assets match
      </span>
      <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => onClear("all")}>
        Clear all
      </Button>
    </div>
  );
}

// ─── Asset Detail Sheet ───────────────────────────────────────────────────────

interface AssetItem {
  id: string;
  assetTag: string;
  assetName: string;
  status: string;
  condition: string;
  purchaseCost?: string | null;
  createdAt: string;
  category?:  { categoryName?: string | null } | null;
  facility?:  { facilityName?: string | null } | null;
  district?:  { districtName?: string | null } | null;
  province?:  { provinceName?: string | null } | null;
}

interface DetailSheetProps {
  title: string;
  subtitle?: string;
  params: Record<string, string>;
  open: boolean;
  onClose: () => void;
}

function DetailSheet({ title, subtitle, params, open, onClose }: DetailSheetProps) {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);

  const qParams = new URLSearchParams({ ...params, page: String(page), limit: "15" }).toString();
  const { data, isLoading } = useQuery({
    queryKey: ["asset-detail-sheet", params, page],
    queryFn: () => apiFetchJson(`/api/v1/assets?${qParams}`),
    enabled: open,
  });

  type AssetResp = { items: AssetItem[]; pagination: { total: number } };
  const respData = data?.data as AssetResp | null;
  const items: AssetItem[] = respData?.items ?? [];
  const total: number = respData?.pagination?.total ?? 0;
  const pageCount = Math.ceil(total / 15);

  useEffect(() => { if (open) setPage(1); }, [open, params]);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">{title}</SheetTitle>
          {subtitle && <SheetDescription>{subtitle}</SheetDescription>}
        </SheetHeader>

        <div className="flex items-center justify-between text-sm text-muted-foreground mt-2">
          <span>{total.toLocaleString()} asset{total !== 1 ? "s" : ""}</span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <span>Page {page} / {pageCount}</span>
              <Button variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto mt-2">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Box className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No assets match this filter</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(asset => (
                  <TableRow
                    key={asset.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => { setLocation(`/assets/${asset.id}`); onClose(); }}
                  >
                    <TableCell className="font-mono text-xs">{asset.assetTag}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{asset.assetName}</div>
                      {asset.category?.categoryName && <div className="text-xs text-muted-foreground">{asset.category.categoryName}</div>}
                      {(asset.facility?.facilityName || asset.district?.districtName) && (
                        <div className="text-xs text-muted-foreground">
                          {[asset.facility?.facilityName, asset.district?.districtName].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: STATUS_COLORS[asset.status] ?? FALLBACK_STATUS_COLOR,
                          color: STATUS_TEXT_COLORS[asset.status] ?? FALLBACK_STATUS_TEXT_COLOR,
                        }}>
                        {STATUS_LABELS[asset.status] ?? capitalize(asset.status)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{asset.condition}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {asset.purchaseCost ? fmtKina(asset.purchaseCost) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Clickable Stat Card ──────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  description?: string;
  accent?: string;
  onClick?: () => void;
  active?: boolean;
  dim?: boolean;
  testId?: string;
}

function StatCard({ title, value, icon: Icon, description, accent, onClick, active, dim, testId }: StatCardProps) {
  return (
    <Card
      className={[
        "transition-all",
        onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 select-none" : "",
        active  ? "ring-2 ring-primary shadow-md"  : "",
        dim     ? "opacity-50"                      : "",
      ].join(" ")}
      onClick={onClick}
      data-testid={testId}
      aria-label={onClick ? `${title}: ${value}. Click to view details` : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="flex items-center gap-1">
          {onClick && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" style={accent ? { color: accent } : undefined}>{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Filter Chips ─────────────────────────────────────────────────────────────

interface ChipItem { name: string; label: string; value: number; fill?: string; id?: string }

function FilterChips({ items, activeKey, activeValue, onToggle, useId = false }: {
  items: ChipItem[];
  activeKey?: string | null;
  activeValue?: string | null;
  onToggle: (name: string) => void;
  useId?: boolean;
}) {
  const getActive = (item: ChipItem) => useId ? item.id === activeKey : item.name === activeValue;
  const anyActive = items.some(item => getActive(item));

  return (
    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t" aria-label="Filter options">
      {items.map(item => {
        const isActive = getActive(item);
        return (
          <button
            key={item.id ?? item.name}
            aria-pressed={isActive}
            aria-label={`Filter by ${item.label}: ${item.value} assets`}
            onClick={() => onToggle(useId ? (item.id ?? item.name) : item.name)}
            className={[
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all select-none",
              isActive
                ? "ring-2 ring-primary border-primary bg-primary/10 font-semibold"
                : anyActive
                ? "opacity-40 border-border hover:opacity-70 hover:bg-muted"
                : "border-border hover:bg-muted cursor-pointer",
            ].join(" ")}
          >
            {item.fill && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }} />}
            <span>{item.label}</span>
            <span className="text-muted-foreground ml-0.5">{item.value.toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Pivot Control ────────────────────────────────────────────────────────────

type Pivot = "status" | "condition" | "category" | "district";

function PivotControl({ value, onChange, includeDistrict = true }: {
  value: Pivot; onChange: (v: Pivot) => void; includeDistrict?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">View by</span>
      <ToggleGroup type="single" value={value} onValueChange={v => v && onChange(v as Pivot)} size="sm" variant="outline">
        <ToggleGroupItem value="status"    className="text-xs">Status</ToggleGroupItem>
        <ToggleGroupItem value="condition" className="text-xs">Condition</ToggleGroupItem>
        <ToggleGroupItem value="category"  className="text-xs">Category</ToggleGroupItem>
        {includeDistrict && <ToggleGroupItem value="district" className="text-xs">District</ToggleGroupItem>}
      </ToggleGroup>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; payload: { value: string } }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">{label ?? p.name}</p>
      <p className="text-muted-foreground">{p.value?.toLocaleString()} assets</p>
      {p.payload?.value && <p className="text-muted-foreground">{fmtKina(p.payload.value)}</p>}
    </div>
  );
};

// ═══════════════ ENTRY POINT ═══════════════

export default function Dashboard() {
  const { user } = useAuth();
  const isNational = user?.scope_level === "national";
  if (isNational) return <NationalDashboard />;
  return <ProvincialDashboard />;
}

// ═══════════════ NATIONAL DASHBOARD ═══════════════

type SortKey = "province_name" | "total_assets" | "missing_assets" | "total_value";
type SortDir = "asc" | "desc";

function SortableHead({ label, col, sortKey, sortDir, onSort, right }: { label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; right?: boolean }) {
  const active = sortKey === col;
  return (
    <TableHead className={right ? "text-right" : ""}>
      <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 font-medium" onClick={() => onSort(col)}>
        {label}
        {active ? (sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />) : <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />}
      </Button>
    </TableHead>
  );
}

interface NationalDashData {
  total_assets: number; active_assets: number; missing_assets: number;
  total_value: string; provinces_count: number;
  filtered_total: number; filtered_value: string; has_filters: boolean;
  assets_by_province: { province_id: string; province_name: string; province_code: string; flag_url: string; theme_accent_color: string; total_assets: number; total_value: string; missing_assets: number; active_assets: number }[];
  top_categories: { category_id: string; category_name: string | null; count: number; total_value: string }[];
  assets_by_condition: { condition: string; count: number; value: string }[];
  assets_by_status: { status: string; count: number; value: string }[];
  acquisition_trend: { month: string; month_key: string; count: number; total_value: string }[];
}

function NationalDashboard() {
  const [filters, setFilters] = useState<DashFilters>(EMPTY_FILTERS);
  const [locationScope, setLocationScope] = useState<LocationScope>(EMPTY_LOCATION);
  const [pivot, setPivot] = useState<Pivot>("status");
  const [sortKey, setSortKey] = useState<SortKey>("total_assets");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [drawer, setDrawer] = useState<{ title: string; subtitle?: string; params: Record<string, string> } | null>(null);

  const qKey = useMemo(() => ["national-dashboard", filters], [filters]);
  const { data: raw, isLoading } = useQuery({
    queryKey: qKey,
    queryFn:  () => apiFetchJson(`/api/v1/dashboard/national${buildParams(filters)}`),
    staleTime: 30_000,
  });
  const d = raw?.data as NationalDashData | undefined;

  const toggleFilter = useCallback((key: keyof DashFilters, value: string) => {
    setFilters(f => ({ ...f, [key]: f[key] === value ? null : value }));
  }, []);

  const clearFilter = useCallback((key: keyof DashFilters | "all") => {
    if (key === "all") {
      setFilters(EMPTY_FILTERS);
      setLocationScope(EMPTY_LOCATION);
    } else if (key === "region") {
      setFilters(f => ({ ...f, region: null, provinceId: null, districtId: null, facilityId: null }));
      setLocationScope(EMPTY_LOCATION);
    } else if (key === "provinceId") {
      setFilters(f => ({ ...f, provinceId: null, districtId: null, facilityId: null }));
      setLocationScope(s => ({ ...s, provinceId: null, provinceName: null, districtId: null, districtName: null, facilityId: null, facilityName: null }));
    } else if (key === "districtId") {
      setFilters(f => ({ ...f, districtId: null, facilityId: null }));
      setLocationScope(s => ({ ...s, districtId: null, districtName: null, facilityId: null, facilityName: null }));
    } else if (key === "facilityId") {
      setFilters(f => ({ ...f, facilityId: null }));
      setLocationScope(s => ({ ...s, facilityId: null, facilityName: null }));
    } else {
      setFilters(f => ({ ...f, [key]: null }));
    }
  }, []);

  const handleLocationChange = useCallback((patch: Partial<LocationScope> & Partial<DashFilters>) => {
    setLocationScope(s => ({ ...s, ...patch }));
    setFilters(f => ({
      ...f,
      ...(patch.region       !== undefined ? { region:     patch.region }       : {}),
      ...(patch.provinceId   !== undefined ? { provinceId: patch.provinceId }   : {}),
      ...(patch.districtId   !== undefined ? { districtId: patch.districtId }   : {}),
      ...(patch.facilityId   !== undefined ? { facilityId: patch.facilityId }   : {}),
    }));
  }, []);

  const openDetail = (title: string, params: Record<string, string>, subtitle?: string) => {
    setDrawer({ title, subtitle, params });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortedProvinces = useMemo(() => {
    return [...(d?.assets_by_province ?? [])].sort((a, b) => {
      const m = sortDir === "asc" ? 1 : -1;
      if (sortKey === "province_name") return m * (a.province_name ?? "").localeCompare(b.province_name ?? "");
      if (sortKey === "total_value")   return m * ((parseFloat(a.total_value ?? "0") || 0) - (parseFloat(b.total_value ?? "0") || 0));
      const av = (a as unknown as Record<string, number>)[sortKey] ?? 0;
      const bv = (b as unknown as Record<string, number>)[sortKey] ?? 0;
      return m * (av - bv);
    });
  }, [d?.assets_by_province, sortKey, sortDir]);

  // Chart data
  const statusData  = (d?.assets_by_status  ?? []).map(s => ({ name: s.status,    label: STATUS_LABELS[s.status] ?? capitalize(s.status),    value: s.count, fill: STATUS_COLORS[s.status]    ?? FALLBACK_STATUS_COLOR, raw: s.value }));
  const condData    = (d?.assets_by_condition ?? []).map(c => ({ name: c.condition, label: CONDITION_LABELS[c.condition] ?? capitalize(c.condition), value: c.count, fill: CONDITION_COLORS[c.condition] ?? FALLBACK_STATUS_COLOR, raw: c.value }));
  const catData     = (d?.top_categories     ?? []).filter(c => c.category_name).map((c, i) => ({ name: c.category_name!, value: c.count, fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length], raw: c.total_value }));
  const trendData   = d?.acquisition_trend  ?? [];

  const cellOpacity = (active: boolean | null, dim: boolean) =>
    dim ? 0.25 : 1;

  if (isLoading) return <DashboardSkeleton />;

  const drawerBaseParams: Record<string, string> = {};
  if (filters.status)       drawerBaseParams.status       = filters.status;
  if (filters.condition)    drawerBaseParams.condition    = filters.condition;
  if (filters.categoryName) drawerBaseParams.category_name = filters.categoryName;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={
          <img
            src="/flags/png_national.svg"
            alt="Papua New Guinea"
            className="w-10 h-10 object-cover rounded-md"
          />
        }
        title="National Overview"
        subtitle="Click any chart element or KPI card to cross-filter. Click again to deselect."
        breadcrumbs={[{ label: "Dashboard" }]}
      />

      {/* Location Filter Bar */}
      <LocationFilterBar
        scope={locationScope}
        onChange={handleLocationChange}
        showRegionProvince={true}
      />

      {/* Filter Strip */}
      <FilterStrip
        filters={filters}
        onClear={clearFilter}
        total={d?.total_assets ?? 0}
        filteredTotal={d?.filtered_total ?? d?.total_assets ?? 0}
        locationScope={locationScope}
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Assets" value={fmtNum(d?.total_assets)} icon={Box}
          description="Click to browse all assets" testId="kpi-total-assets"
          onClick={() => openDetail("All Assets", {}, `${d?.total_assets?.toLocaleString()} assets nationally`)}
        />
        <StatCard
          title="Active Assets" value={fmtNum(d?.active_assets)} icon={CheckCircle}
          description="In service — click to view list" accent="#22c55e" testId="kpi-active-assets"
          onClick={() => openDetail("Active Assets", { status: "active" }, "Assets currently in service")}
        />
        <StatCard
          title="Missing Assets" value={fmtNum(d?.missing_assets)} icon={AlertTriangle}
          description="Flagged as missing — click to view" accent={d?.missing_assets ? "#ef4444" : undefined} testId="kpi-missing-assets"
          onClick={() => openDetail("Missing Assets", { status: "missing" }, "Assets flagged as missing across all provinces")}
        />
        <StatCard
          title="Total Asset Value" value={fmtKina(d?.total_value)} icon={DollarSign}
          description="Estimated portfolio — click to browse" testId="kpi-total-value"
          onClick={() => openDetail("All Assets by Value", {}, "Full national portfolio")}
        />
      </div>

      {/* Interactive Map */}
      <DashboardMap
        assetsByProvince={d?.assets_by_province ?? []}
        selectedRegion={filters.region ?? undefined}
        selectedProvinceCode={locationScope.provinceCode ?? undefined}
        onProvinceClick={(code, name, id) => {
          if (code === "__clearRegion__") {
            handleLocationChange({ region: null, provinceId: null, districtId: null, facilityId: null,
              provinceCode: null, provinceName: null, districtName: null, facilityName: null });
          } else if (code === "__region__") {
            handleLocationChange({ region: name, provinceId: null, districtId: null, facilityId: null,
              provinceCode: null, provinceName: null, districtName: null, facilityName: null });
          } else {
            if (locationScope.provinceId === id) {
              handleLocationChange({ provinceId: null, provinceCode: null, provinceName: null,
                districtId: null, districtName: null, facilityId: null, facilityName: null });
            } else {
              handleLocationChange({ provinceId: id, provinceCode: code, provinceName: name,
                districtId: null, districtName: null, facilityId: null, facilityName: null });
            }
          }
        }}
      />

      {/* Pivot + Charts Row */}
      <div className="flex items-center justify-between">
        <PivotControl value={pivot} onChange={setPivot} includeDistrict={false} />
        {d?.has_filters && (
          <span className="text-sm text-primary font-medium">
            Showing {d.filtered_total?.toLocaleString()} filtered assets
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Primary pivot chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              {pivot === "status" ? "Assets by Status" : pivot === "condition" ? "Asset Condition" : "Assets by Category"}
              <span className="text-xs text-muted-foreground font-normal">Click to filter</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                {pivot === "status" ? (
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value"
                      cursor="pointer">
                      {statusData.map((e, i) => (
                        <Cell key={i} fill={e.fill}
                          opacity={filters.status && filters.status !== e.name ? 0.25 : 1}
                          strokeWidth={filters.status === e.name ? 2 : 0} stroke="#fff"
                          onClick={() => toggleFilter("status", e.name)} style={{ cursor: "pointer" }} />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { label: string; value: number; raw: string };
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium">{p.label}</p>
                          <p className="text-muted-foreground">{p.value.toLocaleString()} assets</p>
                          <p className="text-muted-foreground">{fmtKina(p.raw)}</p>
                        </div>
                      );
                    }} />
                    <Legend formatter={(v: string) => STATUS_LABELS[v] ?? capitalize(v)} />
                  </PieChart>
                ) : pivot === "condition" ? (
                  <BarChart data={condData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onClick={(e: { activePayload?: { payload: { name: string } }[] }) => { const n = e?.activePayload?.[0]?.payload?.name; if (n) toggleFilter("condition", n); }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { label: string; value: number; raw: string };
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium">{p.label}</p>
                          <p>{p.value.toLocaleString()} assets · {fmtKina(p.raw)}</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer"
                      onClick={(data: { name: string }) => toggleFilter("condition", data.name)}>
                      {condData.map((e, i) => (
                        <Cell key={i} fill={e.fill}
                          opacity={filters.condition && filters.condition !== e.name ? 0.25 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart data={catData} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                    onClick={(e: { activePayload?: { payload: { name: string } }[] }) => { const n = e?.activePayload?.[0]?.payload?.name; if (n) toggleFilter("categoryName", n); }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { name: string; value: number; raw: string };
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium">{p.name}</p>
                          <p>{p.value.toLocaleString()} assets · {fmtKina(p.raw)}</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer"
                      onClick={(data: { name: string }) => toggleFilter("categoryName", data.name)}>
                      {catData.map((e, i) => (
                        <Cell key={i} fill={e.fill}
                          opacity={filters.categoryName && filters.categoryName !== e.name ? 0.25 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            {/* Clickable filter chips — accessible fallback for SVG chart clicks */}
            {pivot === "status" && statusData.length > 0 && (
              <FilterChips
                items={statusData.map(s => ({ name: s.name, label: s.label, value: s.value, fill: s.fill }))}
                activeValue={filters.status}
                onToggle={name => toggleFilter("status", name)}
              />
            )}
            {pivot === "condition" && condData.length > 0 && (
              <FilterChips
                items={condData.map(c => ({ name: c.name, label: c.label, value: c.value, fill: c.fill }))}
                activeValue={filters.condition}
                onToggle={name => toggleFilter("condition", name)}
              />
            )}
            {pivot === "category" && catData.length > 0 && (
              <FilterChips
                items={catData.map(c => ({ name: c.name, label: c.name, value: c.value, fill: c.fill }))}
                activeValue={filters.categoryName}
                onToggle={name => toggleFilter("categoryName", name)}
              />
            )}
          </CardContent>
        </Card>

        {/* Secondary chart — always condition when pivot=status and vice versa */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              {pivot !== "condition" ? "Asset Condition" : "Assets by Status"}
              <span className="text-xs text-muted-foreground font-normal">Click to filter</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                {pivot !== "condition" ? (
                  <BarChart data={condData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onClick={(e: { activePayload?: { payload: { name: string } }[] }) => { const n = e?.activePayload?.[0]?.payload?.name; if (n) toggleFilter("condition", n); }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { label: string; value: number; raw: string };
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium">{p.label}</p>
                          <p>{p.value.toLocaleString()} assets · {fmtKina(p.raw)}</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer"
                      onClick={(data: { name: string }) => toggleFilter("condition", data.name)}>
                      {condData.map((e, i) => (
                        <Cell key={i} fill={e.fill}
                          opacity={filters.condition && filters.condition !== e.name ? 0.25 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value"
                      cursor="pointer">
                      {statusData.map((e, i) => (
                        <Cell key={i} fill={e.fill}
                          opacity={filters.status && filters.status !== e.name ? 0.25 : 1}
                          strokeWidth={filters.status === e.name ? 2 : 0} stroke="#fff"
                          onClick={() => toggleFilter("status", e.name)} style={{ cursor: "pointer" }} />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { label: string; value: number; raw: string };
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium">{p.label}</p>
                          <p>{p.value.toLocaleString()} assets · {fmtKina(p.raw)}</p>
                        </div>
                      );
                    }} />
                    <Legend formatter={(v: string) => STATUS_LABELS[v] ?? capitalize(v)} />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
            {/* Clickable filter chips for secondary chart */}
            {pivot !== "condition" ? (
              <FilterChips
                items={condData.map(c => ({ name: c.name, label: c.label, value: c.value, fill: c.fill }))}
                activeValue={filters.condition}
                onToggle={name => toggleFilter("condition", name)}
              />
            ) : (
              <FilterChips
                items={statusData.map(s => ({ name: s.name, label: s.label, value: s.value, fill: s.fill }))}
                activeValue={filters.status}
                onToggle={name => toggleFilter("status", name)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Acquisition Trend */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4" />Asset Acquisition Trend (Last 12 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="natTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString(), "Assets Added"]} />
                  <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#natTrend)" strokeWidth={2} dot={{ r: 3 }} name="Assets Added" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Province Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Map className="w-4 h-4" />
              Province Breakdown ({d?.provinces_count ?? 0} provinces)
            </div>
            <span className="text-xs text-muted-foreground font-normal">Click row to drill into province</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Province"     col="province_name"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableHead label="Total Assets" col="total_assets"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortableHead label="Missing"      col="missing_assets" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortableHead label="Total Value"  col="total_value"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <TableHead className="text-right">Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProvinces.map(p => {
                  const missingRate = p.total_assets ? ((p.missing_assets ?? 0) / p.total_assets) : 0;
                  const statusLabel   = missingRate > 0.05 ? "At Risk"  : missingRate > 0 ? "Monitor" : "Good";
                  const statusVariant = missingRate > 0.05 ? "destructive" : missingRate > 0 ? "secondary" : "outline";
                  return (
                    <TableRow key={p.province_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openDetail(
                        `${p.province_name} Assets`,
                        { ...drawerBaseParams, province_id: p.province_id },
                        `${p.total_assets?.toLocaleString()} assets · ${fmtKina(p.total_value)}`
                      )}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {p.flag_url && <img src={p.flag_url} alt="" className="w-6 h-4 object-cover rounded-sm border" />}
                          {p.province_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{p.total_assets?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="text-right text-destructive">{p.missing_assets?.toLocaleString() ?? "0"}</TableCell>
                      <TableCell className="text-right">{fmtKina(p.total_value)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={statusVariant as "destructive" | "secondary" | "outline"}>{statusLabel}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!sortedProvinces.length && (
                  <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No data</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      {drawer && (
        <DetailSheet
          open={!!drawer}
          title={drawer.title}
          subtitle={drawer.subtitle}
          params={drawer.params}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

// ═══════════════ PROVINCIAL DASHBOARD ═══════════════

interface ProvDashData {
  province?: { id?: string; provinceName?: string; flagUrl?: string; themeAccentColor?: string; flagColors?: string[]; capitalCity?: string; region?: string };
  agency?: { id?: string; agencyName?: string; agencyCode?: string; agencyType?: string; logoUrl?: string | null; themeAccentColor?: string | null; flagColors?: string[] };
  total_assets: number; active_assets: number; missing_assets: number;
  disposed_assets: number; maintenance_assets: number; total_value: string;
  filtered_total: number; filtered_value: string; has_filters: boolean;
  assets_by_category: { category_id: string; category_name: string | null; count: number; value: string }[];
  assets_by_condition: { condition: string; count: number; value: string }[];
  assets_by_status: { status: string; count: number; value: string }[];
  assets_by_district: { district_id: string; district_name: string; total_assets: number; missing_assets: number; active_assets: number; total_value: string }[];
  acquisition_trend: { month: string; month_key: string; count: number; total_value: string }[];
  recent_assets: { id: string; assetTag: string; assetName: string; status: string; condition: string; purchaseCost?: string; createdAt: string; categoryName?: string | null; facilityName?: string | null; districtName?: string | null }[];
}

function ProvincialDashboard() {
  const { applyBranding, branding } = useProvinceBranding();
  const { user } = useAuth();
  const isAgency = user?.scope_level === "agency";
  const [, setLocation] = useLocation();

  const [filters, setFilters] = useState<DashFilters>(EMPTY_FILTERS);
  const [locationScope, setLocationScope] = useState<LocationScope>(EMPTY_LOCATION);
  const [pivot, setPivot] = useState<Pivot>("status");
  const [drawer, setDrawer] = useState<{ title: string; subtitle?: string; params: Record<string, string> } | null>(null);

  const qKey = useMemo(() => ["provincial-dashboard", filters], [filters]);
  const { data: raw, isLoading } = useQuery({
    queryKey: qKey,
    queryFn:  () => apiFetchJson(`/api/v1/dashboard/provincial${buildParams(filters)}`),
    staleTime: 30_000,
  });
  const d = raw?.data as ProvDashData | undefined;

  const toggleFilter = useCallback((key: keyof DashFilters, value: string) => {
    setFilters(f => ({ ...f, [key]: f[key] === value ? null : value }));
  }, []);

  const clearFilter = useCallback((key: keyof DashFilters | "all") => {
    if (key === "all") {
      setFilters(EMPTY_FILTERS);
      setLocationScope(EMPTY_LOCATION);
    } else if (key === "districtId") {
      setFilters(f => ({ ...f, districtId: null, facilityId: null }));
      setLocationScope(s => ({ ...s, districtId: null, districtName: null, facilityId: null, facilityName: null }));
    } else if (key === "facilityId") {
      setFilters(f => ({ ...f, facilityId: null }));
      setLocationScope(s => ({ ...s, facilityId: null, facilityName: null }));
    } else {
      setFilters(f => ({ ...f, [key]: null }));
    }
  }, []);

  const handleLocationChange = useCallback((patch: Partial<LocationScope> & Partial<DashFilters>) => {
    setLocationScope(s => ({ ...s, ...patch }));
    setFilters(f => ({
      ...f,
      ...(patch.districtId !== undefined ? { districtId: patch.districtId } : {}),
      ...(patch.facilityId !== undefined ? { facilityId: patch.facilityId } : {}),
    }));
  }, []);

  useEffect(() => {
    if (d?.agency) {
      applyBranding({
        provinceName:     d.agency.agencyName        ?? null,
        flagUrl:          d.agency.logoUrl           ?? null,
        themeAccentColor: d.agency.themeAccentColor  ?? null,
        flagColors:       Array.isArray(d.agency.flagColors) ? d.agency.flagColors : [],
      });
    } else if (d?.province) {
      applyBranding({
        provinceName:     d.province.provinceName     ?? null,
        flagUrl:          d.province.flagUrl          ?? null,
        themeAccentColor: d.province.themeAccentColor ?? null,
        flagColors:       Array.isArray(d.province.flagColors) ? d.province.flagColors : [],
      });
    }
  }, [d?.province, d?.agency, applyBranding]);

  const openDetail = (title: string, params: Record<string, string>, subtitle?: string) => {
    setDrawer({ title, subtitle, params });
  };

  // Chart data
  const statusData  = (d?.assets_by_status    ?? []).map(s => ({ name: s.status,     label: STATUS_LABELS[s.status]        ?? capitalize(s.status),     value: s.count, fill: STATUS_COLORS[s.status]     ?? FALLBACK_STATUS_COLOR, raw: s.value }));
  const condData    = (d?.assets_by_condition  ?? []).map(c => ({ name: c.condition, label: CONDITION_LABELS[c.condition]   ?? capitalize(c.condition),  value: c.count, fill: CONDITION_COLORS[c.condition] ?? FALLBACK_STATUS_COLOR, raw: c.value }));
  const catData     = (d?.assets_by_category   ?? []).filter(c => c.category_name).map((c, i) => ({ name: c.category_name!, value: c.count, fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length], raw: c.value }));
  const distData    = (d?.assets_by_district   ?? []).map(dist => ({ name: dist.district_name, id: dist.district_id, assets: dist.total_assets, missing: dist.missing_assets, value: dist.total_value }));
  const trendData   = d?.acquisition_trend    ?? [];

  if (isLoading) {
    if (isAgency) {
      const userAgencyName = (user?.scope as { agency_name?: string } | undefined)?.agency_name ?? null;
      const agencyDisplayName = branding.provinceName ?? userAgencyName;
      return (
        <div className="space-y-6">
          <PageHeader
            title={agencyDisplayName ? `${agencyDisplayName} Dashboard` : "Agency Dashboard"}
            breadcrumbs={[{ label: "Dashboard" }]}
          />
          <DashboardSkeleton />
        </div>
      );
    }
    return <DashboardSkeleton />;
  }

  const drawerBaseParams: Record<string, string> = {};
  if (filters.status)       drawerBaseParams.status        = filters.status;
  if (filters.condition)    drawerBaseParams.condition     = filters.condition;
  if (filters.categoryName) drawerBaseParams.category_name = filters.categoryName;
  if (filters.districtId)   drawerBaseParams.district_id   = filters.districtId;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={
          d?.agency?.logoUrl ? (
            <img src={d.agency.logoUrl} alt={`${d.agency.agencyName ?? ""} logo`} className="h-10 w-10 object-contain bg-white rounded-md p-0.5 border" />
          ) : d?.province?.flagUrl ? (
            <img src={d.province.flagUrl} alt={`${d.province.provinceName ?? ""} flag`} className="h-7 w-10 object-cover rounded-sm border" />
          ) : undefined
        }
        title={
          d?.agency?.agencyName
            ? `${d.agency.agencyName} Dashboard`
            : isAgency
            ? branding.provinceName
              ? `${branding.provinceName} Dashboard`
              : (user?.scope as { agency_name?: string } | undefined)?.agency_name
                ? `${(user!.scope as { agency_name?: string }).agency_name} Dashboard`
                : "Agency Dashboard"
            : d?.province?.provinceName
            ? `${d.province.provinceName} Dashboard`
            : "Provincial Dashboard"
        }
        subtitle={
          d?.agency
            ? <>{d.agency.agencyType ? `${d.agency.agencyType.toUpperCase()} · ` : ""}{d.agency.agencyCode ?? ""} · Click any chart or card to cross-filter</>
            : <>{d?.province?.region ? `${d.province.region} Region` : ""}{d?.province?.capitalCity ? ` · ${d.province.capitalCity}` : ""} · Click any chart or card to cross-filter</>
        }
        breadcrumbs={[{ label: "Dashboard" }]}
      />

      {/* Location Filter Bar — districts/facilities only apply for province scope */}
      {!d?.agency && (
        <LocationFilterBar
          scope={locationScope}
          onChange={handleLocationChange}
          showRegionProvince={false}
          fixedProvinceId={d?.province?.id}
        />
      )}

      {/* Filter strip */}
      <FilterStrip
        filters={filters}
        onClear={clearFilter}
        total={d?.total_assets ?? 0}
        filteredTotal={d?.filtered_total ?? d?.total_assets ?? 0}
        locationScope={locationScope}
      />

      {/* Primary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Assets" value={fmtNum(d?.total_assets)} icon={Box}
          description="Click to browse all assets" testId="kpi-total-assets"
          onClick={() => openDetail("All Province Assets", {}, `${d?.total_assets?.toLocaleString()} total assets`)} />
        <StatCard title="Active Assets" value={fmtNum(d?.active_assets)} icon={CheckCircle}
          description="In service — click to view" accent="#22c55e" testId="kpi-active-assets"
          onClick={() => openDetail("Active Assets", { status: "active" }, "Assets currently in service")} />
        <StatCard title="Missing Assets" value={fmtNum(d?.missing_assets)} icon={AlertTriangle}
          description="Flagged as missing — click to view" accent={d?.missing_assets ? "#ef4444" : undefined} testId="kpi-missing-assets"
          onClick={() => openDetail("Missing Assets", { status: "missing" }, "Assets flagged as missing")} />
        <StatCard title="Portfolio Value" value={fmtKina(d?.total_value)} icon={DollarSign}
          description="Estimated portfolio — click to browse" testId="kpi-portfolio-value"
          onClick={() => openDetail("All Assets by Value", {}, "Full portfolio")} />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Under Maintenance" value={fmtNum(d?.maintenance_assets)} icon={Wrench}
          description="Being serviced — click to view" accent={d?.maintenance_assets ? "#f59e0b" : undefined}
          onClick={() => openDetail("Under Maintenance", { status: "under_maintenance" }, "Assets being serviced")} />
        <StatCard title="Disposed" value={fmtNum(d?.disposed_assets)} icon={XCircle}
          description="Decommissioned — click to view"
          onClick={() => openDetail("Disposed Assets", { status: "disposed" }, "Decommissioned assets")} />
        <StatCard title="Filtered View" value={d?.has_filters ? fmtNum(d.filtered_total) : "—"} icon={Filter}
          description={d?.has_filters ? `${fmtKina(d.filtered_value)} filtered value — click to browse` : "Apply filters via charts to see subset"}
          onClick={d?.has_filters ? () => openDetail("Filtered Assets", drawerBaseParams, "Assets matching active filters") : undefined}
          accent={d?.has_filters ? "hsl(var(--primary))" : undefined} />
      </div>

      {/* Pivot + Charts */}
      <div className="flex items-center justify-between">
        <PivotControl value={pivot} onChange={setPivot} />
        {d?.has_filters && (
          <span className="text-sm text-primary font-medium">
            Showing {d.filtered_total.toLocaleString()} of {d.total_assets.toLocaleString()} assets
          </span>
        )}
      </div>

      {/* Main chart */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              {pivot === "status" ? "Assets by Status" : pivot === "condition" ? "Asset Condition" : pivot === "category" ? "Assets by Category" : "District Breakdown"}
              <span className="text-xs text-muted-foreground font-normal">Click to cross-filter</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                {pivot === "status" ? (
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value"
                      cursor="pointer">
                      {statusData.map((e, i) => (
                        <Cell key={i} fill={e.fill}
                          opacity={filters.status && filters.status !== e.name ? 0.25 : 1}
                          strokeWidth={filters.status === e.name ? 2 : 0} stroke="#fff"
                          onClick={() => toggleFilter("status", e.name)} style={{ cursor: "pointer" }} />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { label: string; value: number; raw: string };
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium">{p.label}</p>
                          <p className="text-muted-foreground">{p.value.toLocaleString()} assets</p>
                          <p className="text-muted-foreground">{fmtKina(p.raw)}</p>
                          <p className="text-xs text-primary mt-1">Click to filter</p>
                        </div>
                      );
                    }} />
                    <Legend formatter={(v: string) => STATUS_LABELS[v] ?? capitalize(v)} />
                  </PieChart>
                ) : pivot === "condition" ? (
                  <BarChart data={condData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onClick={(e: { activePayload?: { payload: { name: string } }[] }) => { const n = e?.activePayload?.[0]?.payload?.name; if (n) toggleFilter("condition", n); }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { label: string; value: number; raw: string };
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium">{p.label}</p>
                          <p>{p.value.toLocaleString()} assets · {fmtKina(p.raw)}</p>
                          <p className="text-xs text-primary mt-1">Click to filter</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer"
                      onClick={(data: { name: string }) => toggleFilter("condition", data.name)}>
                      {condData.map((e, i) => (
                        <Cell key={i} fill={e.fill}
                          opacity={filters.condition && filters.condition !== e.name ? 0.25 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : pivot === "category" ? (
                  <BarChart data={catData} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                    onClick={(e: { activePayload?: { payload: { name: string } }[] }) => { const n = e?.activePayload?.[0]?.payload?.name; if (n) toggleFilter("categoryName", n); }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { name: string; value: number; raw: string };
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium">{p.name}</p>
                          <p>{p.value.toLocaleString()} assets · {fmtKina(p.raw)}</p>
                          <p className="text-xs text-primary mt-1">Click to filter</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer"
                      onClick={(data: { name: string }) => toggleFilter("categoryName", data.name)}>
                      {catData.map((e, i) => (
                        <Cell key={i} fill={e.fill}
                          opacity={filters.categoryName && filters.categoryName !== e.name ? 0.25 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart data={distData} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}
                    onClick={(e: { activePayload?: { payload: { id: string } }[] }) => { const id = e?.activePayload?.[0]?.payload?.id; if (id) toggleFilter("districtId", id); }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { name: string; assets: number; missing: number; value: string };
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium">{p.name}</p>
                          <p>{p.assets.toLocaleString()} total · {p.missing} missing</p>
                          <p className="text-muted-foreground">{fmtKina(p.value)}</p>
                          <p className="text-xs text-primary mt-1">Click to filter</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="assets" name="Total" radius={[4, 4, 0, 0]} cursor="pointer"
                      onClick={(data: { id: string }) => toggleFilter("districtId", data.id)}>
                      {distData.map((e, i) => (
                        <Cell key={i} fill="hsl(var(--primary))"
                          opacity={filters.districtId && filters.districtId !== e.id ? 0.25 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            {/* Clickable filter chips — accessible filter controls */}
            {pivot === "status" && statusData.length > 0 && (
              <FilterChips
                items={statusData.map(s => ({ name: s.name, label: s.label, value: s.value, fill: s.fill }))}
                activeValue={filters.status}
                onToggle={name => toggleFilter("status", name)}
              />
            )}
            {pivot === "condition" && condData.length > 0 && (
              <FilterChips
                items={condData.map(c => ({ name: c.name, label: c.label, value: c.value, fill: c.fill }))}
                activeValue={filters.condition}
                onToggle={name => toggleFilter("condition", name)}
              />
            )}
            {pivot === "category" && catData.length > 0 && (
              <FilterChips
                items={catData.map(c => ({ name: c.name, label: c.name, value: c.value, fill: c.fill }))}
                activeValue={filters.categoryName}
                onToggle={name => toggleFilter("categoryName", name)}
              />
            )}
            {pivot === "district" && distData.length > 0 && (
              <FilterChips
                items={distData.map(d => ({ name: d.id, label: d.name, value: d.assets, id: d.id }))}
                activeKey={filters.districtId}
                onToggle={id => toggleFilter("districtId", id)}
                useId
              />
            )}
          </CardContent>
        </Card>

        {/* Cross-filter secondary chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              {pivot === "status" ? "Asset Condition" : "Assets by Status"}
              <span className="text-xs text-muted-foreground font-normal">Click to cross-filter</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                {pivot !== "condition" ? (
                  <BarChart data={condData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onClick={(e: { activePayload?: { payload: { name: string } }[] }) => { const n = e?.activePayload?.[0]?.payload?.name; if (n) toggleFilter("condition", n); }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { label: string; value: number; raw: string };
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium">{p.label}</p>
                          <p>{p.value.toLocaleString()} assets · {fmtKina(p.raw)}</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer"
                      onClick={(data: { name: string }) => toggleFilter("condition", data.name)}>
                      {condData.map((e, i) => (
                        <Cell key={i} fill={e.fill}
                          opacity={filters.condition && filters.condition !== e.name ? 0.25 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value"
                      cursor="pointer">
                      {statusData.map((e, i) => (
                        <Cell key={i} fill={e.fill}
                          opacity={filters.status && filters.status !== e.name ? 0.25 : 1}
                          strokeWidth={filters.status === e.name ? 2 : 0} stroke="#fff"
                          onClick={() => toggleFilter("status", e.name)} style={{ cursor: "pointer" }} />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { label: string; value: number; raw: string };
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium">{p.label}</p>
                          <p>{p.value.toLocaleString()} assets · {fmtKina(p.raw)}</p>
                        </div>
                      );
                    }} />
                    <Legend formatter={(v: string) => STATUS_LABELS[v] ?? capitalize(v)} />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
            {/* Clickable filter chips for secondary chart */}
            {pivot !== "condition" ? (
              <FilterChips
                items={condData.map(c => ({ name: c.name, label: c.label, value: c.value, fill: c.fill }))}
                activeValue={filters.condition}
                onToggle={name => toggleFilter("condition", name)}
              />
            ) : (
              <FilterChips
                items={statusData.map(s => ({ name: s.name, label: s.label, value: s.value, fill: s.fill }))}
                activeValue={filters.status}
                onToggle={name => toggleFilter("status", name)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Acquisition Trend */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4" />Acquisition Trend (Last 12 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString(), "Assets Added"]} />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Assets Added" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent / Filtered Assets */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            {d?.has_filters ? "Matching Assets (Recent)" : "Recently Added Assets"}
            {d?.has_filters && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openDetail("Filtered Assets", drawerBaseParams)}>
                View all {d.filtered_total.toLocaleString()} <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d?.recent_assets?.map(asset => (
                <TableRow key={asset.id} className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setLocation(`/assets/${asset.id}`)}>
                  <TableCell className="font-mono text-xs">{asset.assetTag}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{asset.assetName}</div>
                    {asset.districtName && <div className="text-xs text-muted-foreground">{asset.districtName}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{asset.categoryName ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize text-xs">{asset.condition}</Badge></TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: STATUS_COLORS[asset.status] ?? FALLBACK_STATUS_COLOR,
                        color: STATUS_TEXT_COLORS[asset.status] ?? FALLBACK_STATUS_TEXT_COLOR,
                      }}>
                      {STATUS_LABELS[asset.status] ?? capitalize(asset.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm">{asset.purchaseCost ? fmtKina(asset.purchaseCost) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {asset.createdAt ? new Date(asset.createdAt).toLocaleDateString("en-PG", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!d?.recent_assets?.length && (
                <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">No assets</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      {drawer && (
        <DetailSheet
          open={!!drawer}
          title={drawer.title}
          subtitle={drawer.subtitle}
          params={drawer.params}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2"><Skeleton className="h-8 w-[260px]" /><Skeleton className="h-4 w-[200px]" /></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-[100px]" /></CardHeader><CardContent><Skeleton className="h-8 w-[60px]" /></CardContent></Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[320px] rounded-xl" />
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
      <Skeleton className="h-[220px] rounded-xl" />
    </div>
  );
}
