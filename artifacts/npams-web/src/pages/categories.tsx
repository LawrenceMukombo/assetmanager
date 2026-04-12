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
import { Plus, Edit, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
  description: z.string().optional(),
});

export default function Categories() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Super Admin" || user?.role === "Provincial Admin";
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
      }
    }
  });

  const updateMutation = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        toast({ title: "Category updated" });
        refetch();
        setIsModalOpen(false);
      }
    }
  });

  const deleteMutation = useDeleteCategory({
    mutation: {
      onSuccess: () => {
        toast({ title: "Category deleted" });
        refetch();
        setDeleteId(null);
      }
    }
  });

  const form = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: { category_name: "", description: "" }
  });

  if (!isAdmin) return <Redirect to="/dashboard" />;

  const openCreate = () => {
    form.reset({ category_name: "", description: "" });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (category: any) => {
    form.reset({ category_name: category.categoryName, description: category.description || "" });
    setEditingId(category.id);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Categories</h2>
          <p className="text-muted-foreground">Manage asset classifications.</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Category</Button>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-64" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                </TableRow>
              ))
            ) : data?.data?.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">{cat.categoryName}</TableCell>
                <TableCell className="text-muted-foreground">{cat.description || "-"}</TableCell>
                <TableCell>
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