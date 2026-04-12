import { useState } from "react";
import { useGetAssets, getGetAssetsQueryKey, useDeleteAsset } from "@workspace/api-client-react";
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
import { Plus, Search, MoreHorizontal, Eye, Edit, Trash } from "lucide-react";

export default function Assets() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useGetAssets(
    { page, limit: 10, search },
    { query: { queryKey: getGetAssetsQueryKey({ page, limit: 10, search }) } }
  );

  const deleteMutation = useDeleteAsset({
    mutation: {
      onSuccess: () => {
        toast({ title: "Asset deleted successfully" });
        refetch();
        setDeleteId(null);
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: "Failed to delete asset", description: error.message });
        setDeleteId(null);
      }
    }
  });

  const assets = data?.data?.items || [];
  const pagination = data?.data?.pagination;

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

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : assets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                      <Badge className="capitalize">{asset.status?.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell>{asset.province?.provinceName || "N/A"}</TableCell>
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
              Showing page {pagination.page} of {pagination.total_pages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === pagination.total_pages}
                onClick={() => setPage(p => p + 1)}
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