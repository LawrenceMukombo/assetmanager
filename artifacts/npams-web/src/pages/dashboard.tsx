import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useProvinceBranding } from "@/hooks/use-province-branding";
import { useGetNationalDashboard, useGetProvincialDashboard, getGetNationalDashboardQueryKey, getGetProvincialDashboardQueryKey } from "@workspace/api-client-react";
import type { ProvinceAssetSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Box, AlertTriangle, Wrench, DollarSign, Map, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  description?: string;
}

function StatCard({ title, value, icon: Icon, description }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isNational = user?.scope_level === "national";

  if (isNational) {
    return <NationalDashboard />;
  }
  return <ProvincialDashboard />;
}

type SortKey = "province_name" | "total_assets" | "missing_assets" | "total_value";
type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  right,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sortKey === col;
  return (
    <TableHead className={right ? "text-right" : ""}>
      <Button
        variant="ghost"
        size="sm"
        className={`-ml-3 h-8 font-medium ${right ? "ml-auto flex-row-reverse" : ""}`}
        onClick={() => onSort(col)}
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />
        ) : (
          <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />
        )}
      </Button>
    </TableHead>
  );
}

function NationalDashboard() {
  const [sortKey, setSortKey] = useState<SortKey>("total_assets");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useGetNationalDashboard({
    query: {
      queryKey: getGetNationalDashboardQueryKey()
    }
  });

  if (isLoading) return <DashboardSkeleton />;

  const dashData = data?.data;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedProvinces = [...(dashData?.assets_by_province ?? [])].sort((a, b) => {
    const mult = sortDir === "asc" ? 1 : -1;
    if (sortKey === "province_name") {
      return mult * (a.province_name ?? "").localeCompare(b.province_name ?? "");
    }
    if (sortKey === "total_value") {
      return mult * ((parseFloat(a.total_value ?? "0") || 0) - (parseFloat(b.total_value ?? "0") || 0));
    }
    const aVal = (a[sortKey] ?? 0) as number;
    const bVal = (b[sortKey] ?? 0) as number;
    return mult * (aVal - bVal);
  });

  const totalMissing = dashData?.assets_by_province?.reduce((sum, p) => sum + (p.missing_assets ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full overflow-hidden border-2 flex-shrink-0" style={{ borderColor: "#CE1126" }}>
          <img
            src="/flags/png_national.svg"
            alt="Papua New Guinea"
            className="w-full h-full object-cover"
          />
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">National Overview</h2>
          <p className="text-muted-foreground">High-level view of all public assets across Papua New Guinea.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Assets Nationally" value={dashData?.total_assets?.toLocaleString() ?? "0"} icon={Box} />
        <StatCard title="Total Provinces" value={dashData?.provinces_count ?? "0"} icon={Map} />
        <StatCard title="Missing Assets (All Provinces)" value={totalMissing.toLocaleString()} icon={AlertTriangle} />
        <StatCard title="Total Asset Value" value={`K ${dashData?.total_value ?? "0"}`} icon={DollarSign} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Province Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader label="Province" col="province_name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Total Assets" col="total_assets" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortableHeader label="Missing" col="missing_assets" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortableHeader label="Total Value (K)" col="total_value" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
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
                          {p.flag_url && <img src={p.flag_url} alt="" className="w-6 h-4 object-cover rounded-sm" />}
                          {p.province_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{p.total_assets?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="text-right text-destructive">{p.missing_assets?.toLocaleString() ?? "0"}</TableCell>
                      <TableCell className="text-right">K {p.total_value ?? "0"}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={statusVariant}>{statusLabel}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!dashData?.assets_by_province?.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No data available</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProvincialDashboard() {
  const { applyBranding } = useProvinceBranding();
  const { data, isLoading } = useGetProvincialDashboard(undefined, {
    query: {
      queryKey: getGetProvincialDashboardQueryKey()
    }
  });

  const dashData = data?.data;

  useEffect(() => {
    if (dashData?.province) {
      const province = dashData.province as typeof dashData.province & { flagColors?: string[] };
      applyBranding({
        provinceName: province.provinceName ?? null,
        flagUrl: province.flagUrl ?? null,
        themeAccentColor: province.themeAccentColor ?? null,
        flagColors: Array.isArray(province.flagColors) ? province.flagColors : [],
      });
    }
  }, [dashData?.province, applyBranding]);

  if (isLoading) return <DashboardSkeleton />;
  
  // Format data for charts
  const conditionData = dashData?.assets_by_condition?.map(c => ({
    name: c.condition,
    value: c.count
  })) || [];

  const categoryData = dashData?.assets_by_category?.map(c => ({
    name: c.category_name,
    value: c.count
  })) || [];

  const provinceName = dashData?.province?.provinceName;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {dashData?.province?.flagUrl && (
          <img
            src={dashData.province.flagUrl}
            alt={`${provinceName ?? "Province"} flag`}
            className="h-8 w-12 object-cover rounded-sm border"
          />
        )}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {provinceName ? `${provinceName} Dashboard` : "Provincial Dashboard"}
          </h2>
          <p className="text-muted-foreground">Overview of assets in your jurisdiction.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Assets" value={dashData?.total_assets?.toLocaleString() ?? "0"} icon={Box} />
        <StatCard title="Active Assets" value={dashData?.active_assets?.toLocaleString() ?? "0"} icon={Wrench} />
        <StatCard title="Missing Assets" value={dashData?.missing_assets?.toLocaleString() ?? "0"} icon={AlertTriangle} />
        <StatCard title="Total Value" value={`K ${dashData?.total_value ?? "0"}`} icon={DollarSign} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-dashed border-muted-foreground/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assets Due for Service</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">—</div>
            <p className="text-xs text-muted-foreground mt-1">Maintenance scheduling coming soon</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Asset Condition</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conditionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assets by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashData?.recent_assets?.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-mono text-xs">{asset.assetTag}</TableCell>
                  <TableCell className="font-medium">{asset.assetName}</TableCell>
                  <TableCell>{asset.categoryName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{asset.condition}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="capitalize">{asset.status?.replace(/_/g, ' ')}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {asset.createdAt ? new Date(asset.createdAt).toLocaleDateString("en-PG", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!dashData?.recent_assets?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No recent assets</TableCell>
                </TableRow>
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
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-4 w-[100px]" /></CardHeader>
            <CardContent><Skeleton className="h-8 w-[60px]" /></CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[350px] w-full rounded-xl" />
        <Skeleton className="h-[350px] w-full rounded-xl" />
      </div>
    </div>
  );
}