import { useState, useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronRight, Save } from "lucide-react";

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
  province_id: z.string().min(1, "Province is required"),
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
  
  const [step, setStep] = useState(1);

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
      onSuccess: () => {
        toast({ title: "Asset created successfully" });
        setLocation("/assets");
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
      asset_tag: `NPAMS-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
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
      province_id: user?.scope_level !== "national" ? user?.scope?.province_id || "" : "",
      district_id: "",
      facility_id: "",
      assigned_to_user: "",
    }
  });

  const selectedProvince = form.watch("province_id");
  const selectedDistrict = form.watch("district_id");

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
      const asset = assetData.data;
      form.reset({
        asset_name: asset.assetName || "",
        asset_tag: asset.assetTag || "",
        category_id: asset.category?.id || "",
        serial_number: asset.serialNumber || "",
        brand: asset.brand || "",
        model: asset.model || "",
        condition: (asset.condition as AssetFormValues["condition"]) ?? "good",
        status: (asset.status as AssetFormValues["status"]) ?? "active",
        purchase_date: asset.purchaseDate ? new Date(asset.purchaseDate).toISOString().split('T')[0] : "",
        purchase_cost: asset.purchaseCost ? Number(asset.purchaseCost) : undefined,
        supplier: asset.supplier || "",
        warranty_expiry: asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toISOString().split('T')[0] : "",
        useful_life_years: asset.usefulLifeYears || undefined,
        province_id: asset.province?.id || "",
        district_id: asset.district?.id || "",
        facility_id: asset.facility?.id || "",
        assigned_to_user: asset.assignedUser?.id || "",
      });
    }
  }, [isEdit, assetData, form]);

  const onSubmit = (values: AssetFormValues) => {
    if (isEdit) {
      const updateData: UpdateAssetRequest = {
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
        province_id: values.province_id,
        district_id: values.district_id,
        facility_id: values.facility_id,
        assigned_to_user: values.assigned_to_user,
      };
      updateMutation.mutate({ id: id!, data: updateData });
    } else {
      const createData: CreateAssetRequest = {
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
        province_id: values.province_id,
        district_id: values.district_id,
        facility_id: values.facility_id,
        assigned_to_user: values.assigned_to_user,
      };
      createMutation.mutate({ data: createData });
    }
  };

  const nextStep = async () => {
    const fieldsToValidate: (keyof AssetFormValues)[] =
      step === 1 ? ["asset_name", "asset_tag", "category_id", "condition", "status"] :
      step === 2 ? ["purchase_cost", "useful_life_years"] :
      step === 3 ? ["province_id"] :
      [];

    const isStepValid = await form.trigger(fieldsToValidate);
    if (isStepValid) setStep(s => s + 1);
  };

  if (isEdit && isAssetLoading) {
    return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation(isEdit ? `/assets/${id}` : "/assets")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">
          {isEdit ? "Edit Asset" : "Add New Asset"}
        </h2>
      </div>

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
                        <FormControl><Input {...field} /></FormControl>
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
                              <SelectItem key={c.id} value={c.id!}>{c.categoryName}</SelectItem>
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
                </div>
              </div>

              {/* Step 3: Location */}
              <div className={step === 3 ? 'block' : 'hidden'}>
                <h3 className="text-xl font-semibold mb-4">Location & Assignment</h3>
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
                          disabled={user?.scope_level !== "national"}
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
              </div>

              {/* Step 4: Review */}
              <div className={step === 4 ? 'block' : 'hidden'}>
                <h3 className="text-xl font-semibold mb-4">Review & Submit</h3>
                <div className="bg-muted p-4 rounded-lg space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><span className="font-semibold">Asset Name:</span> {form.getValues("asset_name")}</div>
                    <div><span className="font-semibold">Asset Tag:</span> {form.getValues("asset_tag")}</div>
                    <div><span className="font-semibold">Condition:</span> <span className="capitalize">{form.getValues("condition")}</span></div>
                    <div><span className="font-semibold">Status:</span> <span className="capitalize">{form.getValues("status")}</span></div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">Please review the details before saving. You can edit them later if needed.</p>
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