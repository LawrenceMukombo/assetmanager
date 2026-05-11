import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useGetAssetById, 
  useCreateAsset, 
  useUpdateAsset,
  useGetCategories,
  useGetProvinces,
  useGetDistrictsByProvince,
  useGetFacilitiesByDistrict,
  useGetUsers,
  getGetAssetByIdQueryKey,
  getGetCategoriesQueryKey,
  getGetProvincesQueryKey,
  getGetDistrictsByProvinceQueryKey,
  getGetFacilitiesByDistrictQueryKey,
  getGetUsersQueryKey,
  CreateAssetRequestCondition,
  CreateAssetRequestStatus,
} from "@workspace/api-client-react";
import type { CreateAssetRequest, UpdateAssetRequest } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiFetchJson } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronRight, Save, Upload, X, Image, Package } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

const assetSchema = z.object({
  asset_name: z.string().min(1, "Asset name is required"),
  asset_tag: z.string().min(1, "Asset tag is required"),
  category_id: z.string().min(1, "Category is required"),
  serial_number: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  condition: z.enum(["excellent", "good", "fair", "poor"]),
  status: z.enum(["active", "missing", "disposed", "under_maintenance"]).default("active"),
  purchase_date: z.string().optional(),
  purchase_cost: z.coerce.number().optional(),
  supplier: z.string().optional(),
  warranty_expiry: z.string().optional(),
  useful_life_years: z.coerce.number().optional(),
  depreciation_method: z.enum(["none", "straight_line", "declining_balance"]).default("none"),
  salvage_value: z.coerce.number().optional(),
  notes: z.string().optional(),
  photo_url: z.string().optional(),
  province_id: z.string().optional(),
  district_id: z.string().optional(),
  facility_id: z.string().optional(),
  assigned_to_user: z.string().optional(),
});

type AssetFormValues = z.infer<typeof assetSchema>;

export default function AssetForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAgencyUser = user?.scope_level === "agency";
  const isNationalUser = user?.scope_level === "national";
  const agencyName = (user as { scope?: { agency_name?: string } } | null | undefined)?.scope?.agency_name
    || (user as { agency_name?: string } | null | undefined)?.agency_name
    || "your agency";

  const [step, setStep] = useState(1);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (file: File) => {
    setIsUploadingPhoto(true);
    try {
      const res = await apiFetchJson<{ uploadURL: string; objectPath: string }>("/api/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!res.ok || !res.data) throw new Error(res.message || "Failed to get upload URL");
      await fetch(res.data.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      form.setValue("photo_url", `/api/storage${res.data.objectPath}`, { shouldValidate: true, shouldDirty: true });
      toast({ title: "Photo uploaded successfully" });
    } catch {
      toast({ variant: "destructive", title: "Photo upload failed", description: "Please try again." });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Queries
  const { data: assetData, isLoading: isAssetLoading } = useGetAssetById(id!, {
    query: {
      enabled: isEdit,
      queryKey: getGetAssetByIdQueryKey(id!)
    }
  });

  const { data: categoriesData } = useGetCategories({ query: { queryKey: getGetCategoriesQueryKey() } });
  const { data: provincesData } = useGetProvinces({ query: { queryKey: getGetProvincesQueryKey() } });
  const { data: usersData } = useGetUsers({ query: { queryKey: getGetUsersQueryKey() } });

  // Mutations
  const createMutation = useCreateAsset({
    mutation: {
      onSuccess: (response) => {
        toast({ title: "Asset created successfully" });
        const newAsset = response.data as { id?: string } | null;
        if (newAsset?.id) {
          setLocation(`/assets/${newAsset.id}`);
        } else {
          setLocation("/assets");
        }
      },
      onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message })
    }
  });

  const updateMutation = useUpdateAsset({
    mutation: {
      onSuccess: () => {
        toast({ title: "Asset updated successfully" });
        setLocation(`/assets/${id}`);
      },
      onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message })
    }
  });

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      asset_name: "",
      asset_tag: "",
      category_id: "",
      serial_number: "",
      brand: "",
      model: "",
      condition: "good",
      status: "active",
      purchase_date: "",
      purchase_cost: undefined,
      supplier: "",
      warranty_expiry: "",
      useful_life_years: undefined,
      depreciation_method: "none",
      salvage_value: undefined,
      notes: "",
      photo_url: "",
      province_id: isAgencyUser ? "" : (!isNationalUser ? user?.scope?.province_id || "" : ""),
      district_id: "",
      facility_id: "",
      assigned_to_user: "",
    }
  });

  const selectedProvince = form.watch("province_id");
  const selectedDistrict = form.watch("district_id");
  const selectedCategoryId = form.watch("category_id");

  // Use the explicit `categoryCode` stored on each asset_category row as the
  // [TYPE] portion of `[AGENCY]-[TYPE]-[NNN]` asset tags. Fall back to the
  // first letters of the category name only if the code is missing (legacy).
  const resolveTypeCode = (cat?: { categoryCode?: string | null; categoryName?: string | null } | null): string | null => {
    const code = (cat?.categoryCode ?? "").toUpperCase().trim();
    if (/^[A-Z]{2,5}$/.test(code)) return code;
    const name = cat?.categoryName ?? "";
    const letters = name.replace(/[^A-Za-z]/g, "").toUpperCase();
    return letters.length >= 2 ? letters.slice(0, 3) : null;
  };

  // Track whether the user has manually edited the asset tag so we don't
  // clobber their value when the category changes again.
  const [tagUserEdited, setTagUserEdited] = useState(false);
  const lastPrefilledTagRef = useRef<string>("");

  // When the selected category changes (and we're creating, not editing),
  // prefill the asset tag with the next code in the user's scope.
  useEffect(() => {
    if (isEdit) return;
    const cat = categoriesData?.data?.find((c) => c.id === selectedCategoryId);
    const type = resolveTypeCode(cat);
    if (!type) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetchJson<{ latestCode: string | null; agencyCode: string | null; type: string }>(
          `/api/v1/assets/latest-code?type=${encodeURIComponent(type)}`,
        );
        if (cancelled || !r.ok) return;
        const latest = r.data?.latestCode ?? null;
        const agencyCode = r.data?.agencyCode ?? null;
        let nextCode = "";
        if (latest) {
          const m = latest.match(new RegExp(`^([A-Z0-9]+)-${type}-(\\d+)$`));
          if (m) {
            const prefix = m[1];
            const num = m[2];
            const next = String(Number(num) + 1).padStart(num.length, "0");
            nextCode = `${prefix}-${type}-${next}`;
          }
        } else if (agencyCode) {
          nextCode = `${agencyCode}-${type}-001`;
        }
        if (!nextCode) return;
        const current = form.getValues("asset_tag");
        // Only overwrite when the field is empty or still holds a value we
        // previously prefilled (i.e. the user hasn't typed anything custom).
        if (!current || (!tagUserEdited && current === lastPrefilledTagRef.current)) {
          lastPrefilledTagRef.current = nextCode;
          form.setValue("asset_tag", nextCode, { shouldValidate: true, shouldDirty: false });
        }
      } catch {
        // Leave the field as-is on failure; user can type a code manually.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId, categoriesData, isEdit]);

  const { data: districtsData } = useGetDistrictsByProvince(selectedProvince, {
    query: {
      enabled: !!selectedProvince,
      queryKey: getGetDistrictsByProvinceQueryKey(selectedProvince)
    }
  });

  const { data: facilitiesData } = useGetFacilitiesByDistrict(selectedDistrict || "", {
    query: {
      enabled: !!selectedDistrict,
      queryKey: getGetFacilitiesByDistrictQueryKey(selectedDistrict || "")
    }
  });

  useEffect(() => {
    if (isEdit && assetData?.data) {
      const asset = assetData.data as AssetFormValues & { assetName?: string; assetTag?: string; serialNumber?: string; purchaseDate?: string; purchaseCost?: string; warrantyExpiry?: string; usefulLifeYears?: number; depreciationMethod?: string; salvageValue?: string; photoUrl?: string; category?: { id?: string }; province?: { id?: string }; district?: { id?: string }; facility?: { id?: string }; assignedUser?: { id?: string } };
      form.reset({
        asset_name: (asset as { assetName?: string }).assetName || "",
        asset_tag: (asset as { assetTag?: string }).assetTag || "",
        category_id: (asset as { category?: { id?: string } }).category?.id || "",
        serial_number: (asset as { serialNumber?: string }).serialNumber || "",
        brand: (asset as { brand?: string }).brand || "",
        model: (asset as { model?: string }).model || "",
        condition: ((asset as { condition?: string }).condition as AssetFormValues["condition"]) ?? "good",
        status: ((asset as { status?: string }).status as AssetFormValues["status"]) ?? "active",
        purchase_date: (asset as { purchaseDate?: string }).purchaseDate ? new Date((asset as { purchaseDate: string }).purchaseDate).toISOString().split('T')[0] : "",
        purchase_cost: (asset as { purchaseCost?: string }).purchaseCost ? Number((asset as { purchaseCost: string }).purchaseCost) : undefined,
        supplier: (asset as { supplier?: string }).supplier || "",
        warranty_expiry: (asset as { warrantyExpiry?: string }).warrantyExpiry ? new Date((asset as { warrantyExpiry: string }).warrantyExpiry).toISOString().split('T')[0] : "",
        useful_life_years: (asset as { usefulLifeYears?: number }).usefulLifeYears || undefined,
        depreciation_method: ((asset as { depreciationMethod?: string }).depreciationMethod as AssetFormValues["depreciation_method"]) ?? "none",
        salvage_value: (asset as { salvageValue?: string }).salvageValue ? Number((asset as { salvageValue: string }).salvageValue) : undefined,
        notes: (asset as { notes?: string }).notes || "",
        photo_url: (asset as { photoUrl?: string }).photoUrl || "",
        province_id: (asset as { province?: { id?: string } }).province?.id || "",
        district_id: (asset as { district?: { id?: string } }).district?.id || "",
        facility_id: (asset as { facility?: { id?: string } }).facility?.id || "",
        assigned_to_user: (asset as { assignedUser?: { id?: string } }).assignedUser?.id || "",
      });
    }
  }, [isEdit, assetData, form]);

  const onSubmit = (values: AssetFormValues) => {
    if (isEdit) {
      const updateData = {
        asset_name: values.asset_name,
        category_id: values.category_id,
        serial_number: values.serial_number,
        brand: values.brand,
        model: values.model,
        condition: values.condition as UpdateAssetRequest["condition"],
        status: values.status as UpdateAssetRequest["status"],
        purchase_date: values.purchase_date,
        purchase_cost: values.purchase_cost,
        supplier: values.supplier,
        warranty_expiry: values.warranty_expiry,
        useful_life_years: values.useful_life_years,
        depreciation_method: values.depreciation_method,
        salvage_value: values.salvage_value,
        notes: values.notes,
        photo_url: values.photo_url,
        province_id: values.province_id,
        district_id: values.district_id,
        facility_id: values.facility_id,
        assigned_to_user: values.assigned_to_user,
      };
      updateMutation.mutate({ id: id!, data: updateData as UpdateAssetRequest });
    } else {
      const createData = {
        asset_name: values.asset_name,
        asset_tag: values.asset_tag,
        category_id: values.category_id,
        serial_number: values.serial_number,
        brand: values.brand,
        model: values.model,
        condition: values.condition as CreateAssetRequestCondition,
        status: values.status as CreateAssetRequestStatus,
        purchase_date: values.purchase_date,
        purchase_cost: values.purchase_cost,
        supplier: values.supplier,
        warranty_expiry: values.warranty_expiry,
        useful_life_years: values.useful_life_years,
        depreciation_method: values.depreciation_method,
        salvage_value: values.salvage_value,
        notes: values.notes,
        photo_url: values.photo_url,
        province_id: values.province_id,
        district_id: values.district_id,
        facility_id: values.facility_id,
        assigned_to_user: values.assigned_to_user,
      };
      createMutation.mutate({ data: createData as CreateAssetRequest });
    }
  };

  const nextStep = async () => {
    const fieldsToValidate: (keyof AssetFormValues)[] =
      step === 1 ? ["asset_name", "asset_tag", "category_id", "condition", "status"] :
      step === 2 ? ["purchase_cost", "useful_life_years"] :
      step === 3 ? (isAgencyUser ? [] : ["province_id"]) :
      [];

    if (step === 3 && !isAgencyUser) {
      const provinceId = form.getValues("province_id");
      if (!provinceId) {
        form.setError("province_id", { type: "manual", message: "Province is required" });
        return;
      }
    }

    const isStepValid = await form.trigger(fieldsToValidate);
    if (isStepValid) setStep(s => s + 1);
  };

  if (isEdit && isAssetLoading) {
    return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        icon={<Package className="w-5 h-5" />}
        title={isEdit ? "Edit Asset" : "Add New Asset"}
        subtitle={isEdit ? "Update the details of an existing asset record." : "Register a new asset into the national register."}
        breadcrumbs={[
          { label: "Asset Register", href: "/assets" },
          ...(isEdit && id ? [{ label: "Asset", href: `/assets/${id}` }] : []),
          { label: isEdit ? "Edit" : "New" },
        ]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => setLocation(isEdit ? `/assets/${id}` : "/assets")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        }
      />

      <div className="flex items-center justify-between mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${step >= i ? 'border-primary bg-primary text-primary-foreground' : 'border-muted text-muted-foreground'}`}>
              {i}
            </div>
            {i < 4 && <div className={`h-1 flex-1 mx-2 rounded ${step > i ? 'bg-primary' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              {/* Step 1: Basic Details */}
              <div className={step === 1 ? 'block' : 'hidden'}>
                <h3 className="text-xl font-semibold mb-4">Basic Details</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="asset_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Asset Name *</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="asset_tag"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Asset Tag *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={isEdit ? "" : "Pick a category to auto-fill"}
                            onChange={(e) => {
                              field.onChange(e);
                              if (!isEdit && e.target.value !== lastPrefilledTagRef.current) {
                                setTagUserEdited(true);
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {categoriesData?.data?.map(c => (
                              <SelectItem key={c.id} value={c.id!}>
                                {c.categoryName}{c.categoryCode ? ` (${c.categoryCode})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="condition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Condition *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="excellent">Excellent</SelectItem>
                            <SelectItem value="good">Good</SelectItem>
                            <SelectItem value="fair">Fair</SelectItem>
                            <SelectItem value="poor">Poor</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="missing">Missing</SelectItem>
                            <SelectItem value="disposed">Disposed</SelectItem>
                            <SelectItem value="under_maintenance">Under Maintenance</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="serial_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Serial Number</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Step 2: Procurement */}
              <div className={step === 2 ? 'block' : 'hidden'}>
                <h3 className="text-xl font-semibold mb-4">Procurement Details</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="purchase_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purchase Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="purchase_cost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purchase Cost (K)</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="supplier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Supplier</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="warranty_expiry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warranty Expiry</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="useful_life_years"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Useful Life (Years)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="depreciation_method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Depreciation Method</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="straight_line">Straight Line</SelectItem>
                            <SelectItem value="declining_balance">Declining Balance</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="salvage_value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salvage Value (K)</FormLabel>
                        <FormControl><Input type="number" step="0.01" placeholder="Residual value at end of life" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Notes</FormLabel>
                        <FormControl><Textarea placeholder="Additional details, remarks, or maintenance history notes..." {...field} rows={3} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name="photo_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Asset Photo</FormLabel>
                          <div className="space-y-2">
                            {field.value && (
                              <div className="relative w-32 h-32 rounded-lg border overflow-hidden">
                                <img src={field.value} alt="Asset" className="w-full h-full object-cover" />
                                <button type="button" onClick={() => field.onChange("")} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <input
                                ref={photoInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handlePhotoUpload(file);
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => photoInputRef.current?.click()}
                                disabled={isUploadingPhoto}
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                {isUploadingPhoto ? "Uploading..." : "Upload Photo"}
                              </Button>
                              {!field.value && (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Image className="w-4 h-4" /> No photo added
                                </div>
                              )}
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Step 3: Location */}
              <div className={step === 3 ? 'block' : 'hidden'}>
                <h3 className="text-xl font-semibold mb-4">
                  {isAgencyUser ? "Custodian & Assignment" : "Location & Assignment"}
                </h3>
                {isAgencyUser ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-muted/40 p-4">
                      <div className="text-sm text-muted-foreground">Owning Agency</div>
                      <div className="text-base font-semibold">{agencyName}</div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Agency-owned assets are not tied to a province, district or facility.
                      </p>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="assigned_to_user"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Assign Custodian</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || undefined}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {usersData?.data?.map(u => (
                                  <SelectItem key={u.id} value={u.id!}>{u.fullName}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="province_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Province *</FormLabel>
                          <Select
                            onValueChange={(val) => { field.onChange(val); form.setValue("district_id", ""); form.setValue("facility_id", ""); }}
                            value={field.value || undefined}
                            disabled={!isNationalUser}
                          >
                            <FormControl><SelectTrigger><SelectValue placeholder="Select province" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {provincesData?.data?.map(p => (
                                <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="district_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>District</FormLabel>
                          <Select
                            onValueChange={(val) => { field.onChange(val); form.setValue("facility_id", ""); }}
                            value={field.value || undefined}
                            disabled={!selectedProvince}
                          >
                            <FormControl><SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {districtsData?.data?.map(d => (
                                <SelectItem key={d.id} value={d.id!}>{d.districtName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="facility_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Facility</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined} disabled={!selectedDistrict}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {facilitiesData?.data?.map(f => (
                                <SelectItem key={f.id} value={f.id!}>{f.facilityName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="assigned_to_user"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assign Custodian</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {usersData?.data?.map(u => (
                                <SelectItem key={u.id} value={u.id!}>{u.fullName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>

              {/* Step 4: Review */}
              <div className={step === 4 ? 'block' : 'hidden'}>
                <h3 className="text-xl font-semibold mb-4">Review & Submit</h3>
                <div className="bg-muted p-4 rounded-lg space-y-4">
                  <div className="flex gap-4">
                    {form.watch("photo_url") && (
                      <div className="w-24 h-24 rounded-lg border overflow-hidden flex-shrink-0">
                        <img src={form.watch("photo_url")} alt="Asset" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 flex-1">
                      <div><span className="font-semibold">Asset Name:</span> {form.getValues("asset_name")}</div>
                      <div><span className="font-semibold">Asset Tag:</span> {form.getValues("asset_tag")}</div>
                      <div><span className="font-semibold">Condition:</span> <span className="capitalize">{form.getValues("condition")}</span></div>
                      <div><span className="font-semibold">Status:</span> <span className="capitalize">{form.getValues("status").replace(/_/g, " ")}</span></div>
                      {form.getValues("brand") && <div><span className="font-semibold">Brand:</span> {form.getValues("brand")}</div>}
                      {form.getValues("model") && <div><span className="font-semibold">Model:</span> {form.getValues("model")}</div>}
                      {form.getValues("purchase_date") && <div><span className="font-semibold">Purchase Date:</span> {form.getValues("purchase_date")}</div>}
                      {form.getValues("purchase_cost") && <div><span className="font-semibold">Cost (K):</span> {Number(form.getValues("purchase_cost")).toLocaleString()}</div>}
                      {form.getValues("warranty_expiry") && <div><span className="font-semibold">Warranty Expires:</span> {form.getValues("warranty_expiry")}</div>}
                      {(() => { const cat = categoriesData?.data?.find(c => c.id === form.getValues("category_id")); return cat ? <div><span className="font-semibold">Category:</span> {cat.categoryName}</div> : null; })()}
                      {isAgencyUser
                        ? <div><span className="font-semibold">Agency:</span> {agencyName}</div>
                        : (() => { const prov = provincesData?.data?.find(p => p.id === form.getValues("province_id")); return prov ? <div><span className="font-semibold">Province:</span> {(prov as { provinceName?: string }).provinceName}</div> : null; })()
                      }
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Please review the details before saving. You can edit them later if needed.</p>
                </div>
              </div>

              <div className="flex justify-between pt-6 border-t">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setStep(s => s - 1)}
                  disabled={step === 1 || isSaving}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                
                {step < 4 ? (
                  <Button type="button" onClick={nextStep}>
                    Next <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={isSaving}>
                    <Save className="w-4 h-4 mr-2" /> 
                    {isSaving ? "Saving..." : "Save Asset"}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}