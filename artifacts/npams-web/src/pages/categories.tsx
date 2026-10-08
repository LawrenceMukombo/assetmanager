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
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash, Tags, Check, ChevronDown, Layers, Upload, Download, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getCategoryMeta } from "@/lib/category";
import { ICON_OPTIONS, COLOR_OPTIONS, getIconByName } from "@/lib/category-options";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES } from "@/App";
import { Redirect } from "wouter";
import { cn } from "@/lib/utils";
import { INDUSTRY_SECTORS } from "@/lib/industries";
import { BulkUploadModal } from "@/components/bulk-upload-modal";
import { DataTablePagination } from "@/components/data-table-pagination";
import {
  ColumnVisibilityDropdown,
  SortableHeader,
  exportToCsv,
  type ColumnDefinition,
} from "@/components/table-column-visibility";
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

const CATEGORY_COLUMNS: ColumnDefinition[] = [
  { id: "category_name", label: "Category Name", alwaysVisible: true },
  { id: "category_code", label: "Code" },
  { id: "industry", label: "Sector / Industry" },
  { id: "description", label: "Description" },
  { id: "asset_count", label: "Asset Count" },
  { id: "actions", label: "Actions", alwaysVisible: true },
];

const categorySchema = z.object({
  category_name: z.string().min(1, "Category name is required"),
  category_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/u, "Code must be 2-5 letters"),
  industry: z.string().optional(),
  description: z.string().optional(),
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
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Table Rule 24 States
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<string>("category_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    category_name: true,
    category_code: true,
    industry: true,
    description: true,
    asset_count: true,
    actions: true,
  });

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

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const availableIndustries = useMemo(() => {
    const set = new Set<string>();
    for (const s of INDUSTRY_SECTORS) set.add(s);
    for (const c of data?.data ?? []) {
      if (c.industry) set.add(c.industry);
    }
    return Array.from(set);
  }, [data?.data]);

  const filteredCategories = useMemo(() => {
    let list = data?.data ?? [];
    if (industryFilter !== "ALL") {
      list = list.filter((c) => c.industry === industryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.categoryName?.toLowerCase().includes(q) ||
          c.categoryCode?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.industry?.toLowerCase().includes(q)
      );
    }

    // Sort
    const sorted = [...list].sort((a, b) => {
      let valA: string | number = "";
      let valB: string | number = "";
      if (sortField === "category_name") {
        valA = a.categoryName ?? "";
        valB = b.categoryName ?? "";
      } else if (sortField === "category_code") {
        valA = a.categoryCode ?? "";
        valB = b.categoryCode ?? "";
      } else if (sortField === "industry") {
        valA = a.industry ?? "";
        valB = b.industry ?? "";
      } else if (sortField === "asset_count") {
        valA = a.assetCount ?? 0;
        valB = b.assetCount ?? 0;
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [data?.data, industryFilter, search, sortField, sortDir]);

  // Paginated records
  const paginatedCategories = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCategories.slice(start, start + pageSize);
  }, [filteredCategories, page, pageSize]);

  const handleExportCsv = () => {
    const headers = ["Category Name", "Code", "Sector", "Description", "Asset Count"];
    const rows = filteredCategories.map((c) => [
      c.categoryName ?? "",
      c.categoryCode ?? "",
      c.industry ?? "General",
      c.description ?? "",
      c.assetCount ?? 0,
    ]);
    exportToCsv("categories_export.csv", headers, rows);
  };

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
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsBulkUploadOpen(true)}>
              <Upload className="w-4 h-4 mr-1.5" /> Batch Upload
            </Button>
            <Button variant="outline" onClick={handleExportCsv}>
              <Download className="w-4 h-4 mr-1.5" /> Export CSV
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> Add category
            </Button>
          </div>
        }
      />

      {/* Enterprise Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search category, code..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8 h-9 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Sector:</span>
            <Select
              value={industryFilter}
              onValueChange={(val) => {
                setIndustryFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-56 h-9">
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

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <ColumnVisibilityDropdown
            columns={CATEGORY_COLUMNS}
            visibleColumns={visibleColumns}
            onChange={setVisibleColumns}
          />
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.category_name && (
                <SortableHeader
                  label="Category Name"
                  field="category_name"
                  currentSortField={sortField}
                  currentSortDir={sortDir}
                  onSort={toggleSort}
                />
              )}
              {visibleColumns.category_code && (
                <SortableHeader
                  label="Code"
                  field="category_code"
                  currentSortField={sortField}
                  currentSortDir={sortDir}
                  onSort={toggleSort}
                  className="w-24"
                />
              )}
              {visibleColumns.industry && (
                <SortableHeader
                  label="Sector"
                  field="industry"
                  currentSortField={sortField}
                  currentSortDir={sortDir}
                  onSort={toggleSort}
                  className="w-48"
                />
              )}
              {visibleColumns.description && <TableHead>Description</TableHead>}
              {visibleColumns.asset_count && (
                <SortableHeader
                  label="Asset Count"
                  field="asset_count"
                  currentSortField={sortField}
                  currentSortDir={sortDir}
                  onSort={toggleSort}
                  className="w-28 text-right"
                />
              )}
              {visibleColumns.actions && <TableHead className="w-20">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {visibleColumns.category_name && <TableCell><Skeleton className="h-4 w-32" /></TableCell>}
                  {visibleColumns.category_code && <TableCell><Skeleton className="h-4 w-12" /></TableCell>}
                  {visibleColumns.industry && <TableCell><Skeleton className="h-4 w-28" /></TableCell>}
                  {visibleColumns.description && <TableCell><Skeleton className="h-4 w-64" /></TableCell>}
                  {visibleColumns.asset_count && <TableCell><Skeleton className="h-4 w-12" /></TableCell>}
                  {visibleColumns.actions && <TableCell><Skeleton className="h-8 w-16" /></TableCell>}
                </TableRow>
              ))
            ) : paginatedCategories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Tags className="w-8 h-8 opacity-40" />
                    <p className="font-medium">No categories found</p>
                    <p className="text-xs text-muted-foreground">
                      Try resetting your sector filter or use batch upload to import categories.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : paginatedCategories.map((cat) => (
              <TableRow
                key={cat.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openEdit(cat)}
              >
                {visibleColumns.category_name && (
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
                )}
                {visibleColumns.category_code && (
                  <TableCell className="font-mono text-sm">{cat.categoryCode || "-"}</TableCell>
                )}
                {visibleColumns.industry && (
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-normal">
                      {cat.industry || "General"}
                    </Badge>
                  </TableCell>
                )}
                {visibleColumns.description && (
                  <TableCell className="text-muted-foreground max-w-xs truncate">{cat.description || "-"}</TableCell>
                )}
                {visibleColumns.asset_count && (
                  <TableCell className="text-right font-mono text-sm">{cat.assetCount ?? 0}</TableCell>
                )}
                {visibleColumns.actions && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(cat)} title="Edit Category">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(cat.id!)} title="Delete Category">
                        <Trash className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Enterprise Pagination Controls */}
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          total={filteredCategories.length}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      </div>

      {/* Batch Upload Modal */}
      <BulkUploadModal
        open={isBulkUploadOpen}
        onOpenChange={setIsBulkUploadOpen}
        entityType="categories"
        onSuccess={() => {
          refetch();
        }}
      />

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
