import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useGetCategories, 
  useCreateCategory, 
  useUpdateCategory, 
  useDeleteCategory,
  getGetCategoriesQueryKey
} from "@workspace/api-client-react";
import type { AssetCategory } from "@workspace/api-client-react";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Trash, Tags } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getCategoryMeta } from "@/lib/category";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES } from "@/App";
import { Redirect } from "wouter";
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

const categorySchema = z.object({
  category_name: z.string().min(1, "Category name is required"),
  category_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/u, "Code must be 2-5 letters"),
  description: z.string().optional(),
});

export default function Categories() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role as typeof ADMIN_ROLES[number]);
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useGetCategories({
    query: { queryKey: getGetCategoriesQueryKey() }
  });

  const createMutation = useCreateCategory({
    mutation: {
      onSuccess: () => {
        toast({ title: "Category created" });
        refetch();
        setIsModalOpen(false);
      },
      onError: (err: Error) => {
        toast({ variant: "destructive", title: "Failed to create category", description: err.message });
      },
    }
  });

  const updateMutation = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        toast({ title: "Category updated" });
        refetch();
        setIsModalOpen(false);
      },
      onError: (err: Error) => {
        toast({ variant: "destructive", title: "Failed to update category", description: err.message });
      },
    }
  });

  const deleteMutation = useDeleteCategory({
    mutation: {
      onSuccess: () => {
        toast({ title: "Category deleted" });
        refetch();
        setDeleteId(null);
      },
      onError: (err: Error) => {
        toast({ variant: "destructive", title: "Failed to delete category", description: err.message });
      },
    }
  });

  const form = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: { category_name: "", category_code: "", description: "" }
  });

  if (!isAdmin) return <Redirect to="/dashboard" />;

  const openCreate = () => {
    form.reset({ category_name: "", category_code: "", description: "" });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (category: AssetCategory) => {
    form.reset({
      category_name: category.categoryName ?? "",
      category_code: category.categoryCode ?? "",
      description: category.description ?? "",
    });
    setEditingId(category.id ?? null);
    setIsModalOpen(true);
  };

  const onSubmit = (values: z.infer<typeof categorySchema>) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: values });
    } else {
      createMutation.mutate({ data: values });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Tags className="w-5 h-5" />}
        title="Categories"
        subtitle="Manage asset classifications."
        breadcrumbs={[{ label: "Assets", href: "/assets" }, { label: "Categories" }]}
        actions={<Button onClick={openCreate}><Plus className="w-4 h-4" /> Add category</Button>}
      />

      <div className="bg-card border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category Name</TableHead>
              <TableHead className="w-[100px]">Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[120px] text-right">Asset Count</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-64" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No categories found.</TableCell>
              </TableRow>
            ) : data?.data?.map((cat) => (
              <TableRow
                key={cat.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openEdit(cat)}
              >
                <TableCell className="font-medium">
                  {(() => {
                    const meta = getCategoryMeta(cat.categoryName, cat.categoryCode);
                    const Icon = meta.icon;
                    return (
                      <span className="inline-flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${meta.chipClass}`} aria-hidden>
                          <Icon className="w-4 h-4" />
                        </span>
                        <span>{cat.categoryName}</span>
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell className="font-mono text-sm">{cat.categoryCode || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{cat.description || "-"}</TableCell>
                <TableCell className="text-right font-mono text-sm">{cat.assetCount ?? 0}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(cat.id!)}>
                      <Trash className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="category_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        maxLength={5}
                        placeholder="e.g. ICT"
                        className="font-mono uppercase"
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>Save</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}