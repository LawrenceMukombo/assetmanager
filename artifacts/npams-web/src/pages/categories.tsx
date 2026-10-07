import { useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash, Tags, Check, ChevronDown, Layers } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getCategoryMeta } from "@/lib/category";
import { ICON_OPTIONS, COLOR_OPTIONS, getIconByName } from "@/lib/category-options";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES } from "@/App";
import { Redirect } from "wouter";
import { cn } from "@/lib/utils";
import { INDUSTRY_SECTORS } from "@/lib/industries";
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
  industry: z.string().optional(),
  description: z.string().optional(),
  // Free-form so admin choices outside the curated palette (e.g. legacy
  // values set via API) are preserved on edit; the picker UI still
  // constrains new selections to the curated set.
  icon_name: z.string().nullable().optional(),
  accent_color: z.string().nullable().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

const DEFAULTS: CategoryFormValues = {
  category_name: "",
  category_code: "",
  industry: "",
  description: "",
  icon_name: null,
  accent_color: null,
};

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

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: DEFAULTS,
  });

  if (!isAdmin) return <Redirect to="/dashboard" />;

  const openCreate = () => {
    form.reset(DEFAULTS);
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (category: AssetCategory) => {
    form.reset({
      category_name: category.categoryName ?? "",
      category_code: category.categoryCode ?? "",
      industry: category.industry ?? "",
      description: category.description ?? "",
      icon_name: category.iconName ?? null,
      accent_color: category.accentColor ?? null,
    });
    setEditingId(category.id ?? null);
    setIsModalOpen(true);
  };

  const onSubmit = (values: CategoryFormValues) => {
    const payload = {
      ...values,
      industry: values.industry?.trim() || null,
      icon_name: values.icon_name ?? null,
      accent_color: values.accent_color ?? null,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const [industryFilter, setIndustryFilter] = useState<string>("ALL");

  const availableIndustries = useMemo(() => {
    const set = new Set<string>();
    for (const s of INDUSTRY_SECTORS) set.add(s);
    for (const c of data?.data ?? []) {
      if (c.industry) set.add(c.industry);
    }
    return Array.from(set);
  }, [data?.data]);

  const filteredCategories = useMemo(() => {
    const list = data?.data ?? [];
    if (industryFilter === "ALL") return list;
    return list.filter((c) => c.industry === industryFilter);
  }, [data?.data, industryFilter]);

  const watchedName = form.watch("category_name");
  const watchedCode = form.watch("category_code");
  const watchedIcon = form.watch("icon_name");
  const watchedColor = form.watch("accent_color");
  const previewMeta = getCategoryMeta(watchedName, watchedCode, watchedIcon, watchedColor);
  const PreviewIcon = previewMeta.icon;
  const SelectedIcon = getIconByName(watchedIcon ?? undefined);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Tags className="w-5 h-5" />}
        title="Categories"
        subtitle="Manage multi-industry asset classifications."
        breadcrumbs={[{ label: "Assets", href: "/assets" }, { label: "Categories" }]}
        actions={<Button onClick={openCreate}><Plus className="w-4 h-4" /> Add category</Button>}
      />

      {/* Filter by Industry */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Sector:</span>
          <Select value={industryFilter} onValueChange={setIndustryFilter}>
            <SelectTrigger className="w-[280px] h-9">
              <SelectValue placeholder="Filter by sector" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">
                🌐 All Sectors ({data?.data?.length ?? 0})
              </SelectItem>
              {availableIndustries.map((ind) => {
                const count = (data?.data ?? []).filter((c) => c.industry === ind).length;
                return (
                  <SelectItem key={ind} value={ind}>
                    {ind} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category Name</TableHead>
              <TableHead className="w-[80px]">Code</TableHead>
              <TableHead className="w-[200px]">Sector</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[100px] text-right">Asset Count</TableHead>
              <TableHead className="w-[90px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-64" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                </TableRow>
              ))
            ) : filteredCategories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No categories found in this sector.
                </TableCell>
              </TableRow>
            ) : filteredCategories.map((cat) => (
              <TableRow
                key={cat.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openEdit(cat)}
              >
                <TableCell className="font-medium">
                  {(() => {
                    const meta = getCategoryMeta(cat.categoryName, cat.categoryCode, cat.iconName, cat.accentColor);
                    const Icon = meta.icon;
                    return (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${meta.chipClass}`}
                          style={meta.chipStyle}
                          aria-hidden
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <span>{cat.categoryName}</span>
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell className="font-mono text-sm">{cat.categoryCode || "-"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs font-normal">
                    {cat.industry || "General"}
                  </Badge>
                </TableCell>
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
              <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                <span
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-md shrink-0 ${previewMeta.chipClass}`}
                  style={previewMeta.chipStyle}
                  aria-hidden
                >
                  <PreviewIcon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{watchedName || "Preview"}</div>
                  <div className="text-xs text-muted-foreground">How this category will appear.</div>
                </div>
              </div>

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
                name="industry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Industry / Sector</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select industry sector" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INDUSTRY_SECTORS.map((sec) => (
                          <SelectItem key={sec} value={sec}>
                            {sec}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="icon_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Icon</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between font-normal"
                          >
                            <span className="inline-flex items-center gap-2">
                              {SelectedIcon ? (
                                <SelectedIcon className="w-4 h-4" />
                              ) : (
                                <span className="text-muted-foreground text-sm">Default</span>
                              )}
                              {SelectedIcon && (
                                <span className="text-sm">
                                  {ICON_OPTIONS.find((o) => o.name === field.value)?.label}
                                </span>
                              )}
                            </span>
                            <ChevronDown className="w-4 h-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-2" align="start">
                          <div className="flex items-center justify-between px-2 pb-2">
                            <span className="text-xs font-medium text-muted-foreground">Pick an icon</span>
                            {field.value && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => field.onChange(null)}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-6 gap-1 max-h-64 overflow-y-auto">
                            {ICON_OPTIONS.map((opt) => {
                              const Icon = opt.icon;
                              const selected = field.value === opt.name;
                              return (
                                <button
                                  type="button"
                                  key={opt.name}
                                  title={opt.label}
                                  aria-label={opt.label}
                                  onClick={() => field.onChange(opt.name)}
                                  className={cn(
                                    "inline-flex items-center justify-center w-9 h-9 rounded-md border transition-colors",
                                    selected
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-transparent hover:bg-muted",
                                  )}
                                >
                                  <Icon className="w-4 h-4" />
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accent_color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Accent color</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between font-normal"
                          >
                            <span className="inline-flex items-center gap-2">
                              {field.value ? (
                                <>
                                  <span
                                    className="w-4 h-4 rounded-full border"
                                    style={{ backgroundColor: field.value }}
                                    aria-hidden
                                  />
                                  <span className="text-sm">
                                    {COLOR_OPTIONS.find((o) => o.value === field.value)?.label}
                                  </span>
                                </>
                              ) : (
                                <span className="text-muted-foreground text-sm">Default</span>
                              )}
                            </span>
                            <ChevronDown className="w-4 h-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2" align="start">
                          <div className="flex items-center justify-between px-2 pb-2">
                            <span className="text-xs font-medium text-muted-foreground">Pick a color</span>
                            {field.value && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => field.onChange(null)}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-6 gap-2">
                            {COLOR_OPTIONS.map((opt) => {
                              const selected = field.value === opt.value;
                              return (
                                <button
                                  type="button"
                                  key={opt.value}
                                  title={opt.label}
                                  aria-label={opt.label}
                                  onClick={() => field.onChange(opt.value)}
                                  className={cn(
                                    "relative inline-flex items-center justify-center w-8 h-8 rounded-full border transition-transform",
                                    selected ? "ring-2 ring-offset-2 ring-primary scale-105" : "hover:scale-105",
                                  )}
                                  style={{ backgroundColor: opt.value }}
                                >
                                  {selected && <Check className="w-4 h-4 text-white drop-shadow" />}
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
