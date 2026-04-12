import { useState } from "react";
import {
  useGetAssets,
  getGetAssetsQueryKey,
  useDeleteAsset,
  useGetCategories,
  useGetProvinces,
  useGetDistrictsByProvince,
  getGetDistrictsByProvinceQueryKey,
  GetAssetsStatus,
  GetAssetsCondition,
} from "@workspace/api-client-react";
import type { GetAssetsParams } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
import { Plus, Search, MoreHorizontal, Eye, Edit, Trash, X } from "lucide-react";
import { statusBadgeClass } from "@/lib/status";

const ALL = "__all__";

export default function Assets() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [provinceId, setProvinceId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<GetAssetsParams["status"] | "">("");
  const [condition, setCondition] = useState<GetAssetsParams["condition"] | "">("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const isNational = user?.scope_level === "national";

  const filters: GetAssetsParams = {
    page,
    limit: 10,
    ...(search ? { search } : {}),
    ...(provinceId ? { province_id: provinceId } : {}),
    ...(districtId ? { district_id: districtId } : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(status ? { status: status as GetAssetsParams["status"] } : {}),
    ...(condition ? { condition: condition as GetAssetsParams["condition"] } : {}),
  };

  const { data, isLoading, refetch } = useGetAssets(filters, {
    query: { queryKey: getGetAssetsQueryKey(filters) },
  });

  const { data: categoriesData } = useGetCategories();
  const { data: provincesData } = useGetProvinces();
  const { data: districtsData } = useGetDistrictsByProvince(provinceId, {
    query: { enabled: !!provinceId, queryKey: getGetDistrictsByProvinceQueryKey(provinceId) },
  });

  const deleteMutation = useDeleteAsset({
    mutation: {
      onSuccess: () => {
        toast({ title: "Asset deleted successfully" });
        refetch();
        setDeleteId(null);
      },
      onError: (error: Error) => {
        toast({ variant: "destructive", title: "Failed to delete asset", description: error.message });
        setDeleteId(null);
      },
    },
  });

  const assets = data?.data?.items || [];
  const pagination = data?.data?.pagination;

  const hasActiveFilters = !!(provinceId || districtId || categoryId || status || condition);

  const clearFilters = () => {
    setProvinceId("");
    setDistrictId("");
    setCategoryId("");
    setStatus("");
    setCondition("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Asset Register</h2>
          <p className="text-muted-foreground">Manage and track all public assets.</p>
        </div>
        <Button onClick={() => setLocation("/assets/new")}>
          <Plus className="w-4 h-4 mr-2" />
          Add Asset
        </Button>
      </div>

      <div className="bg-card p-4 rounded-lg border space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, tag, serial..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4 mr-1" /> Clear filters
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {isNational && (
            <Select
              value={provinceId || ALL}
              onValueChange={(v) => {
                const newVal = v === ALL ? "" : v;
                setProvinceId(newVal);
                setDistrictId("");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Provinces" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Provinces</SelectItem>
                {provincesData?.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {provinceId && (
            <Select
              value={districtId || ALL}
              onValueChange={(v) => { setDistrictId(v === ALL ? "" : v); setPage(1); }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Districts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Districts</SelectItem>
                {districtsData?.data?.map((d) => (
                  <SelectItem key={d.id} value={d.id!}>{d.districtName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={categoryId || ALL}
            onValueChange={(v) => { setCategoryId(v === ALL ? "" : v); setPage(1); }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Categories</SelectItem>
              {categoriesData?.data?.map((c) => (
                <SelectItem key={c.id} value={c.id!}>{c.categoryName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={status || ALL}
            onValueChange={(v) => { setStatus(v === ALL ? "" : v as GetAssetsParams["status"]); setPage(1); }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Statuses</SelectItem>
              <SelectItem value={GetAssetsStatus.active}>Active</SelectItem>
              <SelectItem value={GetAssetsStatus.disposed}>Disposed</SelectItem>
              <SelectItem value={GetAssetsStatus.missing}>Missing</SelectItem>
              <SelectItem value={GetAssetsStatus.under_maintenance}>Under Maintenance</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={condition || ALL}
            onValueChange={(v) => { setCondition(v === ALL ? "" : v as GetAssetsParams["condition"]); setPage(1); }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Conditions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Conditions</SelectItem>
              <SelectItem value={GetAssetsCondition.excellent}>Excellent</SelectItem>
              <SelectItem value={GetAssetsCondition.good}>Good</SelectItem>
              <SelectItem value={GetAssetsCondition.fair}>Fair</SelectItem>
              <SelectItem value={GetAssetsCondition.poor}>Poor</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : assets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No assets found.
                  </TableCell>
                </TableRow>
              ) : (
                assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-mono text-xs">{asset.assetTag}</TableCell>
                    <TableCell className="font-medium">{asset.assetName}</TableCell>
                    <TableCell>{asset.category?.categoryName || "N/A"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{asset.condition}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`capitalize ${statusBadgeClass(asset.status)}`}>{asset.status?.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>{asset.province?.provinceName || "N/A"}</TableCell>
                    <TableCell>{asset.facility?.facilityName || "N/A"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setLocation(`/assets/${asset.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLocation(`/assets/${asset.id}/edit`)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteId(asset.id!)}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {pagination && pagination.total_pages && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-sm text-muted-foreground">
              Showing page {pagination.page} of {pagination.total_pages} ({pagination.total} total)
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
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

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the asset record.
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
