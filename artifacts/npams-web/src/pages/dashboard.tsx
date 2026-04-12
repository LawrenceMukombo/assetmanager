import type { ComponentType } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetNationalDashboard, useGetProvincialDashboard, getGetNationalDashboardQueryKey, getGetProvincialDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Box, AlertTriangle, Wrench, DollarSign, Map } from "lucide-react";
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

function NationalDashboard() {
  const { data, isLoading } = useGetNationalDashboard({
    query: {
      queryKey: getGetNationalDashboardQueryKey()
    }
  });

  if (isLoading) return <DashboardSkeleton />;

  const dashData = data?.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">National Overview</h2>
        <p className="text-muted-foreground">High-level view of all public assets across Papua New Guinea.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Total Assets Nationally" value={dashData?.total_assets?.toLocaleString() || "0"} icon={Box} />
        <StatCard title="Total Provinces" value={dashData?.provinces_count || "0"} icon={Map} />
        <StatCard title="Total Asset Value" value={`K ${dashData?.total_value || "0"}`} icon={DollarSign} />
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
                  <TableHead>Province</TableHead>
                  <TableHead className="text-right">Total Assets</TableHead>
                  <TableHead className="text-right">Missing Assets</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashData?.assets_by_province?.map((p) => (
                  <TableRow key={p.province_id}>
                    <TableCell className="font-medium flex items-center gap-2">
                      {p.flag_url && <img src={p.flag_url} alt="" className="w-6 h-4 object-cover rounded-sm" />}
                      {p.province_name}
                    </TableCell>
                    <TableCell className="text-right">{p.total_assets?.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-destructive">{p.missing_assets?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">K {p.total_value}</TableCell>
                  </TableRow>
                ))}
                {!dashData?.assets_by_province?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No data available</TableCell>
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
  const { data, isLoading } = useGetProvincialDashboard(undefined, {
    query: {
      queryKey: getGetProvincialDashboardQueryKey()
    }
  });

  if (isLoading) return <DashboardSkeleton />;

  const dashData = data?.data;
  
  // Format data for charts
  const conditionData = dashData?.assets_by_condition?.map(c => ({
    name: c.condition,
    value: c.count
  })) || [];

  const categoryData = dashData?.assets_by_category?.map(c => ({
    name: c.category_name,
    value: c.count
  })) || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Overview of assets in your jurisdiction.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Assets" value={dashData?.total_assets?.toLocaleString() ?? "0"} icon={Box} />
        <StatCard title="Active Assets" value={dashData?.active_assets?.toLocaleString() ?? "0"} icon={Wrench} />
        <StatCard title="Missing Assets" value={dashData?.missing_assets?.toLocaleString() ?? "0"} icon={AlertTriangle} />
        <StatCard title="Total Value" value={`K ${dashData?.total_value ?? "0"}`} icon={DollarSign} />
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashData?.recent_assets?.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-mono text-xs">{asset.assetTag}</TableCell>
                  <TableCell className="font-medium">{asset.assetName}</TableCell>
                  <TableCell>{asset.categoryName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{asset.condition}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="capitalize">{asset.status?.replace('_', ' ')}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!dashData?.recent_assets?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No recent assets</TableCell>
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