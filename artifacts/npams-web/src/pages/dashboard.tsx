import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useProvinceBranding } from "@/hooks/use-province-branding";
import { useGetNationalDashboard, useGetProvincialDashboard, getGetNationalDashboardQueryKey, getGetProvincialDashboardQueryKey } from "@workspace/api-client-react";
import type { ProvinceAssetSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Box, AlertTriangle, Wrench, DollarSign, Map,
  ArrowUpDown, ArrowUp, ArrowDown, Activity, TrendingUp,
  CheckCircle, XCircle, Clock,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
  '#6366f1', '#f59e0b', '#10b981',
];

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  missing: '#ef4444',
  under_maintenance: '#f59e0b',
  disposed: '#94a3b8',
  transferred: '#6366f1',
};

const CONDITION_COLORS: Record<string, string> = {
  new: '#22c55e',
  good: '#84cc16',
  fair: '#f59e0b',
  poor: '#ef4444',
  unserviceable: '#94a3b8',
};

function fmt(n: number | string | null | undefined): string {
  if (n == null) return "0";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

function fmtKina(v: string | null | undefined): string {
  const n = parseFloat(v ?? "0");
  if (isNaN(n)) return "K 0";
  if (n >= 1_000_000) return `K ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `K ${(n / 1_000).toFixed(1)}K`;
  return `K ${n.toLocaleString()}`;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  description?: string;
  trend?: { value: number; label: string };
  accent?: string;
}

function StatCard({ title, value, icon: Icon, description, accent }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" style={accent ? { color: accent } : undefined}>{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isNational = user?.scope_level === "national";

  if (isNational) return <NationalDashboard />;
  return <ProvincialDashboard />;
}

// ═══════════════ NATIONAL DASHBOARD ═══════════════

type SortKey = "province_name" | "total_assets" | "missing_assets" | "total_value";
type SortDir = "asc" | "desc";

function SortableHeader({ label, col, sortKey, sortDir, onSort, right }: { label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; right?: boolean }) {
  const active = sortKey === col;
  return (
    <TableHead className={right ? "text-right" : ""}>
      <Button variant="ghost" size="sm" className={`-ml-3 h-8 font-medium ${right ? "ml-auto flex-row-reverse" : ""}`} onClick={() => onSort(col)}>
        {label}
        {active ? (sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />) : <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />}
      </Button>
    </TableHead>
  );
}

function NationalDashboard() {
  const [sortKey, setSortKey] = useState<SortKey>("total_assets");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useGetNationalDashboard({ query: { queryKey: getGetNationalDashboardQueryKey() } });

  if (isLoading) return <DashboardSkeleton />;

  const dashData = data?.data as {
    total_assets: number;
    active_assets: number;
    missing_assets: number;
    total_value: string;
    provinces_count: number;
    assets_by_province: ProvinceAssetSummary[];
    top_categories: { category_name: string | null; count: number; total_value: string }[];
    assets_by_condition: { condition: string; count: number }[];
    assets_by_status: { status: string; count: number }[];
    acquisition_trend: { month: string; month_key: string; count: number; total_value: string }[];
  } | undefined;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortedProvinces = [...(dashData?.assets_by_province ?? [])].sort((a, b) => {
    const mult = sortDir === "asc" ? 1 : -1;
    if (sortKey === "province_name") return mult * (a.province_name ?? "").localeCompare(b.province_name ?? "");
    if (sortKey === "total_value") return mult * ((parseFloat(a.total_value ?? "0") || 0) - (parseFloat(b.total_value ?? "0") || 0));
    const aVal = (a[sortKey] ?? 0) as number;
    const bVal = (b[sortKey] ?? 0) as number;
    return mult * (aVal - bVal);
  });

  const statusData = (dashData?.assets_by_status ?? []).map(s => ({
    name: s.status?.replace(/_/g, " ") ?? "unknown",
    value: s.count,
    fill: STATUS_COLORS[s.status ?? ""] ?? "#94a3b8",
  }));

  const conditionData = (dashData?.assets_by_condition ?? []).map(c => ({
    name: c.condition ? (c.condition.charAt(0).toUpperCase() + c.condition.slice(1)) : "Unknown",
    value: c.count,
    fill: CONDITION_COLORS[c.condition ?? ""] ?? "#94a3b8",
  }));

  const categoryData = (dashData?.top_categories ?? []).filter(c => c.category_name).map(c => ({
    name: c.category_name ?? "Unknown",
    count: c.count,
    value: parseFloat(c.total_value ?? "0"),
  }));

  const trendData = dashData?.acquisition_trend ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full overflow-hidden border-2 flex-shrink-0" style={{ borderColor: "#CE1126" }}>
          <img src="/flags/png_national.svg" alt="Papua New Guinea" className="w-full h-full object-cover" />
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">National Overview</h2>
          <p className="text-muted-foreground">High-level view of all public assets across Papua New Guinea.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Assets" value={(dashData?.total_assets ?? 0).toLocaleString()} icon={Box} description="All provinces combined" />
        <StatCard title="Active Assets" value={(dashData?.active_assets ?? 0).toLocaleString()} icon={CheckCircle} description="In service" accent="#22c55e" />
        <StatCard title="Missing Assets" value={(dashData?.missing_assets ?? 0).toLocaleString()} icon={AlertTriangle} description="Flagged across all provinces" accent={dashData?.missing_assets ? "#ef4444" : undefined} />
        <StatCard title="Total Asset Value" value={fmtKina(dashData?.total_value)} icon={DollarSign} description="Estimated portfolio value" />
      </div>

      {/* Charts row 1: Status + Condition */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Assets by Status</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2} dataKey="value" label={({ name, value }) => `${value}`} labelLine={false}>
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v.toLocaleString(), name]} />
                  <Legend formatter={(v) => v.replace(/_/g, " ")} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Asset Condition</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conditionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {conditionData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Acquisition Trend */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4" />Asset Acquisition Trend (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString(), "Assets Added"]} />
                  <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#trendGrad)" strokeWidth={2} dot={{ r: 3 }} name="Assets Added" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Categories */}
      {categoryData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Assets by Category</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ top: 5, right: 80, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString(), "Assets"]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))">
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Province Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Map className="w-4 h-4" />Province Comparison ({dashData?.provinces_count ?? 0} provinces)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader label="Province" col="province_name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Total Assets" col="total_assets" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortableHeader label="Missing" col="missing_assets" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortableHeader label="Total Value" col="total_value" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProvinces.map((p: ProvinceAssetSummary) => {
                  const missingRate = p.total_assets ? ((p.missing_assets ?? 0) / p.total_assets) : 0;
                  const statusLabel = missingRate > 0.05 ? "At Risk" : missingRate > 0 ? "Monitor" : "Good";
                  const statusVariant = missingRate > 0.05 ? "destructive" : missingRate > 0 ? "secondary" : "outline";
                  return (
                    <TableRow key={p.province_id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {p.flag_url && <img src={p.flag_url} alt="" className="w-6 h-4 object-cover rounded-sm border" />}
                          {p.province_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{p.total_assets?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="text-right text-destructive">{p.missing_assets?.toLocaleString() ?? "0"}</TableCell>
                      <TableCell className="text-right">{fmtKina(p.total_value)}</TableCell>
                      <TableCell className="text-right"><Badge variant={statusVariant}>{statusLabel}</Badge></TableCell>
                    </TableRow>
                  );
                })}
                {!dashData?.assets_by_province?.length && (
                  <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No data available</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════ PROVINCIAL DASHBOARD ═══════════════

function ProvincialDashboard() {
  const { applyBranding } = useProvinceBranding();
  const { data, isLoading } = useGetProvincialDashboard(undefined, { query: { queryKey: getGetProvincialDashboardQueryKey() } });

  const dashData = data?.data as {
    province?: { provinceName?: string; flagUrl?: string; themeAccentColor?: string; flagColors?: string[]; capitalCity?: string; region?: string };
    total_assets: number;
    active_assets: number;
    missing_assets: number;
    disposed_assets: number;
    maintenance_assets: number;
    total_value: string;
    assets_by_category: { category_name: string | null; count: number; total_value: string }[];
    assets_by_condition: { condition: string; count: number }[];
    assets_by_status: { status: string; count: number }[];
    assets_by_district: { district_id: string; district_name: string; total_assets: number; missing_assets: number; total_value: string }[];
    acquisition_trend: { month: string; month_key: string; count: number; total_value: string }[];
    recent_assets: { id: string; assetTag: string; assetName: string; status: string; condition: string; createdAt: string; categoryName: string | null; facilityName: string | null }[];
  } | undefined;

  useEffect(() => {
    if (dashData?.province) {
      const province = dashData.province;
      applyBranding({
        provinceName: province.provinceName ?? null,
        flagUrl: province.flagUrl ?? null,
        themeAccentColor: province.themeAccentColor ?? null,
        flagColors: Array.isArray(province.flagColors) ? province.flagColors : [],
      });
    }
  }, [dashData?.province, applyBranding]);

  if (isLoading) return <DashboardSkeleton />;

  const conditionData = (dashData?.assets_by_condition ?? []).map(c => ({
    name: c.condition ? (c.condition.charAt(0).toUpperCase() + c.condition.slice(1)) : "Unknown",
    value: c.count,
    fill: CONDITION_COLORS[c.condition ?? ""] ?? "#94a3b8",
  }));

  const categoryData = (dashData?.assets_by_category ?? []).filter(c => c.category_name).map((c, i) => ({
    name: c.category_name ?? "Unknown",
    value: c.count,
    fill: COLORS[i % COLORS.length],
  }));

  const statusData = (dashData?.assets_by_status ?? []).map(s => ({
    name: s.status?.replace(/_/g, " ") ?? "unknown",
    value: s.count,
    fill: STATUS_COLORS[s.status ?? ""] ?? "#94a3b8",
  }));

  const districtData = (dashData?.assets_by_district ?? []).map(d => ({
    name: d.district_name,
    assets: d.total_assets,
    missing: d.missing_assets,
  }));

  const trendData = dashData?.acquisition_trend ?? [];
  const provinceName = dashData?.province?.provinceName;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {dashData?.province?.flagUrl && (
          <img src={dashData.province.flagUrl} alt={`${provinceName ?? ""} flag`} className="h-8 w-12 object-cover rounded-sm border" />
        )}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {provinceName ? `${provinceName} Dashboard` : "Provincial Dashboard"}
          </h2>
          <p className="text-muted-foreground">
            {dashData?.province?.region ? `${dashData.province.region} Region` : "Overview of assets in your jurisdiction."}
            {dashData?.province?.capitalCity ? ` · Capital: ${dashData.province.capitalCity}` : ""}
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Assets" value={(dashData?.total_assets ?? 0).toLocaleString()} icon={Box} description="All registered assets" />
        <StatCard title="Active" value={(dashData?.active_assets ?? 0).toLocaleString()} icon={CheckCircle} description="In service" accent="#22c55e" />
        <StatCard title="Missing" value={(dashData?.missing_assets ?? 0).toLocaleString()} icon={AlertTriangle} description="Flagged as missing" accent={dashData?.missing_assets ? "#ef4444" : undefined} />
        <StatCard title="Total Value" value={fmtKina(dashData?.total_value)} icon={DollarSign} description="Estimated portfolio" />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Under Maintenance" value={(dashData?.maintenance_assets ?? 0).toLocaleString()} icon={Wrench} description="Currently being serviced" accent={dashData?.maintenance_assets ? "#f59e0b" : undefined} />
        <StatCard title="Disposed" value={(dashData?.disposed_assets ?? 0).toLocaleString()} icon={XCircle} description="Decommissioned assets" />
        <StatCard title="Acquisition Trend" value={trendData.length > 0 ? `+${trendData[trendData.length - 1]?.count ?? 0} this month` : "—"} icon={Activity} description="Assets added in last recorded month" />
      </div>

      {/* Charts row 1: Condition bar + Status pie */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Asset Condition</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conditionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {conditionData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Assets by Category</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2} dataKey="value">
                    {categoryData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status donut */}
      {statusData.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Assets by Status</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} paddingAngle={2} dataKey="value">
                      {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [v, name.replace(/_/g, " ")]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => v.replace(/_/g, " ")} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Acquisition trend */}
          {trendData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4" />Acquisition Trend (12 Months)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [v, "Assets Added"]} />
                      <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Assets Added" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* District breakdown */}
      {districtData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>District Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={districtData} margin={{ top: 10, right: 10, left: -20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="assets" name="Total Assets" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="missing" name="Missing" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Assets */}
      <Card>
        <CardHeader><CardTitle>Recent Assets</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashData?.recent_assets?.map(asset => (
                <TableRow key={asset.id}>
                  <TableCell className="font-mono text-xs">{asset.assetTag}</TableCell>
                  <TableCell className="font-medium">{asset.assetName}</TableCell>
                  <TableCell>{asset.categoryName ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{asset.condition}</Badge></TableCell>
                  <TableCell><Badge className="capitalize" style={{ backgroundColor: STATUS_COLORS[asset.status ?? ""] ?? undefined }}>{asset.status?.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {asset.createdAt ? new Date(asset.createdAt).toLocaleDateString("en-PG", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!dashData?.recent_assets?.length && (
                <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No recent assets</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-[250px]" />
        <Skeleton className="h-4 w-[350px]" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-[100px]" /></CardHeader><CardContent><Skeleton className="h-8 w-[60px]" /></CardContent></Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[300px] w-full rounded-xl" />
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
      <Skeleton className="h-[240px] w-full rounded-xl" />
    </div>
  );
}
