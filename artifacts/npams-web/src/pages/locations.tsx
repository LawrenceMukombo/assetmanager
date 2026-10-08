import { useEffect, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProvinces, getGetProvincesQueryKey,
  useGetDistrictsByProvince, getGetDistrictsByProvinceQueryKey,
  useGetFacilitiesByDistrict, getGetFacilitiesByDistrictQueryKey,
} from "@workspace/api-client-react";
import type { Province } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2, X, MapPin, Users, Ruler, Building2, Phone, Mail, Navigation, Upload, Download, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import { apiFetchJson } from "@/lib/api-fetch";
import { FlagColorPicker } from "@/components/flag-color-picker";
import { useOrganization } from "@/context/organization-context";
import { BulkUploadModal } from "@/components/bulk-upload-modal";
import { DataTablePagination } from "@/components/data-table-pagination";
import {
  ColumnVisibilityDropdown,
  SortableHeader,
  exportToCsv,
  type ColumnDefinition,
} from "@/components/table-column-visibility";

const FACILITY_COLUMNS: ColumnDefinition[] = [
  { id: "facility_name", label: "Facility / Location", alwaysVisible: true },
  { id: "type", label: "Facility Type" },
  { id: "contact", label: "Contact Info" },
  { id: "capacity", label: "Capacity" },
  { id: "assets", label: "Asset Count" },
  { id: "gps", label: "GPS Coordinates" },
  { id: "actions", label: "Actions", alwaysVisible: true },
];

interface District {
  id?: string;
  provinceId?: string;
  districtName?: string;
  districtCode?: string | null;
  population?: number | null;
  areaKm2?: string | null;
  description?: string | null;
  active?: boolean;
  facilityCount?: number;
  assetCount?: number;
}

interface Facility {
  id?: string;
  districtId?: string;
  facilityName?: string;
  facilityType?: string | null;
  address?: string | null;
  description?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  capacity?: number | null;
  gpsLatitude?: string | null;
  gpsLongitude?: string | null;
  active?: boolean;
  assetCount?: number;
}

const FACILITY_TYPES = [
  "Headquarters",
  "Corporate Office",
  "Regional Office / Hub",
  "Branch Office",
  "Store / Retail Outlet",
  "Warehouse / Storage",
  "Manufacturing / Plant",
  "Hospital / Clinic",
  "School / Campus",
  "Data Center / Server Room",
  "Government Office",
  "District / Field Office",
  "Border Post / Station",
  "Other",
];

const PNG_REGIONS = ["Highlands", "Momase", "Islands", "Southern", "National Capital District"];

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtArea(a: string | null | undefined): string {
  if (!a) return "—";
  return `${parseFloat(a).toLocaleString()} km²`;
}

export default function Locations() {
  const { hierarchy, organization } = useOrganization();
  const [selectedProvince, setSelectedProvince] = useState<string>("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Province edit state
  const [editProvince, setEditProvince] = useState<Province | null>(null);
  const [editProvinceForm, setEditProvinceForm] = useState({
    flagUrl: "", themeAccentColor: "", flagColors: [] as string[],
    provinceName: "", region: "", capitalCity: "", population: "", areaKm2: "", description: "",
  });

  // District states
  const [editDistrict, setEditDistrict] = useState<District | null>(null);
  const [editDistrictForm, setEditDistrictForm] = useState({
    districtName: "", districtCode: "", population: "", areaKm2: "", description: "",
  });
  const [showAddDistrict, setShowAddDistrict] = useState(false);
  const [addDistrictForm, setAddDistrictForm] = useState({
    districtName: "", districtCode: "", population: "", areaKm2: "", description: "",
  });
  const [deleteDistrict, setDeleteDistrict] = useState<District | null>(null);

  // Facility states
  const [editFacility, setEditFacility] = useState<Facility | null>(null);
  const [editFacilityForm, setEditFacilityForm] = useState({
    facilityName: "", facilityType: "", address: "", description: "",
    contactPhone: "", contactEmail: "", capacity: "", gpsLatitude: "", gpsLongitude: "",
  });
  const [showAddFacility, setShowAddFacility] = useState(false);
  const [addFacilityForm, setAddFacilityForm] = useState({
    facilityName: "", facilityType: "", address: "", description: "",
    contactPhone: "", contactEmail: "", capacity: "", gpsLatitude: "", gpsLongitude: "",
  });
  const [deleteFacility, setDeleteFacility] = useState<Facility | null>(null);

  // Table Rule 24 states for Facilities
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [facilitySearch, setFacilitySearch] = useState("");
  const [facilitySortField, setFacilitySortField] = useState("facility_name");
  const [facilitySortDir, setFacilitySortDir] = useState<"asc" | "desc">("asc");
  const [facilityPage, setFacilityPage] = useState(1);
  const [facilityPageSize, setFacilityPageSize] = useState(25);
  const [facilityVisibleColumns, setFacilityVisibleColumns] = useState<Record<string, boolean>>({
    facility_name: true,
    type: true,
    contact: true,
    capacity: true,
    assets: true,
    gps: true,
    actions: true,
  });

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isSuperAdmin = user?.role === "Super Admin";

  const { data: provincesData, isLoading: pLoading } = useGetProvinces({ query: { queryKey: getGetProvincesQueryKey() } });
  const { data: districtsData, isLoading: dLoading } = useGetDistrictsByProvince(selectedProvince, {
    query: { enabled: !!selectedProvince, queryKey: getGetDistrictsByProvinceQueryKey(selectedProvince) }
  });
  const { data: facilitiesData, isLoading: fLoading } = useGetFacilitiesByDistrict(selectedDistrict, {
    query: { enabled: !!selectedDistrict, queryKey: getGetFacilitiesByDistrictQueryKey(selectedDistrict) }
  });

  const toggleFacilitySort = (field: string) => {
    if (facilitySortField === field) {
      setFacilitySortDir(facilitySortDir === "asc" ? "desc" : "asc");
    } else {
      setFacilitySortField(field);
      setFacilitySortDir("asc");
    }
  };

  const filteredFacilities = useMemo(() => {
    let list = (facilitiesData?.data ?? []) as unknown as Facility[];
    if (facilitySearch.trim()) {
      const q = facilitySearch.toLowerCase();
      list = list.filter((f) =>
        f.facilityName?.toLowerCase().includes(q) ||
        f.facilityType?.toLowerCase().includes(q) ||
        f.address?.toLowerCase().includes(q) ||
        f.contactPhone?.toLowerCase().includes(q) ||
        f.contactEmail?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let valA: string | number = "";
      let valB: string | number = "";
      if (facilitySortField === "facility_name") {
        valA = a.facilityName ?? "";
        valB = b.facilityName ?? "";
      } else if (facilitySortField === "type") {
        valA = a.facilityType ?? "";
        valB = b.facilityType ?? "";
      } else if (facilitySortField === "capacity") {
        valA = a.capacity ?? 0;
        valB = b.capacity ?? 0;
      } else if (facilitySortField === "assets") {
        valA = a.assetCount ?? 0;
        valB = b.assetCount ?? 0;
      }
      if (valA < valB) return facilitySortDir === "asc" ? -1 : 1;
      if (valA > valB) return facilitySortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [facilitiesData?.data, facilitySearch, facilitySortField, facilitySortDir]);

  const paginatedFacilities = useMemo(() => {
    const start = (facilityPage - 1) * facilityPageSize;
    return filteredFacilities.slice(start, start + facilityPageSize);
  }, [filteredFacilities, facilityPage, facilityPageSize]);

  const handleExportFacilities = () => {
    const headers = ["Facility Name", "Type", "Address", "Phone", "Email", "Capacity", "Assets", "GPS Lat", "GPS Lng"];
    const rows = filteredFacilities.map((f) => [
      f.facilityName ?? "",
      f.facilityType ?? "",
      f.address ?? "",
      f.contactPhone ?? "",
      f.contactEmail ?? "",
      f.capacity ?? 0,
      f.assetCount ?? 0,
      f.gpsLatitude ?? "",
      f.gpsLongitude ?? "",
    ]);
    exportToCsv("facilities_export.csv", headers, rows);
  };

  // Prefill the district code when the New District dialog opens. Looks up the
  // latest existing district code in the selected province that matches
  // `[PREFIX]-[NNN]` and increments the numeric suffix while preserving its
  // zero-padding width. Falls back to `[PROVINCE_CODE]-001` when no numbered
  // district exists yet. The user can override the prefilled value, and a 409
  // from the API surfaces via the existing toast.
  useEffect(() => {
    if (!showAddDistrict || !selectedProvince) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetchJson<{ latestCode: string | null; provinceCode: string | null }>(
          `/api/v1/locations/districts/latest-code?provinceId=${encodeURIComponent(selectedProvince)}`,
        );
        if (cancelled || !r.ok) return;
        const latest = r.data?.latestCode ?? null;
        const provinceCode = r.data?.provinceCode ?? null;
        let nextCode = "";
        if (latest) {
          const m = latest.match(/^([A-Z0-9]+)-(\d+)$/);
          if (m) {
            const prefix = m[1];
            const num = m[2];
            const next = String(Number(num) + 1).padStart(num.length, "0");
            nextCode = `${prefix}-${next}`;
          }
        } else if (provinceCode) {
          nextCode = `${provinceCode}-001`;
        }
        if (!nextCode) return;
        setAddDistrictForm(f => (f.districtCode ? f : { ...f, districtCode: nextCode }));
      } catch {
        // Leave the field as-is on failure; user can type a code manually.
      }
    })();
    return () => { cancelled = true; };
  }, [showAddDistrict, selectedProvince]);

  // ── Province helpers ──
  const openEditProvince = (p: Province) => {
    const pExt = p as unknown as { flagColors?: string[]; region?: string; capitalCity?: string; population?: number; areaKm2?: string; description?: string };
    setEditProvince(p);
    setEditProvinceForm({
      flagUrl: p.flagUrl ?? "",
      themeAccentColor: p.themeAccentColor ?? "",
      flagColors: Array.isArray(pExt.flagColors) ? pExt.flagColors : [],
      provinceName: p.provinceName ?? "",
      region: pExt.region ?? "",
      capitalCity: pExt.capitalCity ?? "",
      population: pExt.population != null ? String(pExt.population) : "",
      areaKm2: pExt.areaKm2 ?? "",
      description: pExt.description ?? "",
    });
  };

  const handleSaveProvince = async () => {
    if (!editProvince?.id) return;
    setSaving(true);
    const result = await apiFetchJson(`/api/v1/locations/provinces/${editProvince.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        flagUrl: editProvinceForm.flagUrl || null,
        themeAccentColor: editProvinceForm.flagColors[0] || editProvinceForm.themeAccentColor || null,
        flagColors: editProvinceForm.flagColors,
        provinceName: editProvinceForm.provinceName || undefined,
        region: editProvinceForm.region || null,
        capitalCity: editProvinceForm.capitalCity || null,
        population: editProvinceForm.population ? parseInt(editProvinceForm.population) : null,
        areaKm2: editProvinceForm.areaKm2 || null,
        description: editProvinceForm.description || null,
      }),
    });
    setSaving(false);
    if (result.ok) {
      toast({ title: "Province updated" });
      setEditProvince(null);
      queryClient.invalidateQueries({ queryKey: getGetProvincesQueryKey() });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  // ── District helpers ──
  const openEditDistrict = (d: District) => {
    setEditDistrict(d);
    setEditDistrictForm({
      districtName: d.districtName ?? "",
      districtCode: d.districtCode ?? "",
      population: d.population != null ? String(d.population) : "",
      areaKm2: d.areaKm2 ?? "",
      description: d.description ?? "",
    });
  };

  const handleSaveDistrict = async () => {
    if (!editDistrict?.id) return;
    setSaving(true);
    const result = await apiFetchJson(`/api/v1/locations/districts/${editDistrict.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        districtName: editDistrictForm.districtName || undefined,
        districtCode: editDistrictForm.districtCode || null,
        population: editDistrictForm.population ? parseInt(editDistrictForm.population) : null,
        areaKm2: editDistrictForm.areaKm2 || null,
        description: editDistrictForm.description || null,
      }),
    });
    setSaving(false);
    if (result.ok) {
      toast({ title: "District updated" });
      setEditDistrict(null);
      queryClient.invalidateQueries({ queryKey: getGetDistrictsByProvinceQueryKey(selectedProvince) });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const handleAddDistrict = async () => {
    if (!selectedProvince || !addDistrictForm.districtName) return;
    setSaving(true);
    const result = await apiFetchJson("/api/v1/locations/districts", {
      method: "POST",
      body: JSON.stringify({
        provinceId: selectedProvince,
        districtName: addDistrictForm.districtName,
        districtCode: addDistrictForm.districtCode || null,
        population: addDistrictForm.population ? parseInt(addDistrictForm.population) : null,
        areaKm2: addDistrictForm.areaKm2 || null,
        description: addDistrictForm.description || null,
      }),
    });
    setSaving(false);
    if (result.ok) {
      toast({ title: "District created" });
      setShowAddDistrict(false);
      setAddDistrictForm({ districtName: "", districtCode: "", population: "", areaKm2: "", description: "" });
      queryClient.invalidateQueries({ queryKey: getGetDistrictsByProvinceQueryKey(selectedProvince) });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const handleDeleteDistrict = async () => {
    if (!deleteDistrict?.id) return;
    setSaving(true);
    const result = await apiFetchJson(`/api/v1/locations/districts/${deleteDistrict.id}`, { method: "DELETE" });
    setSaving(false);
    if (result.ok) {
      toast({ title: "District deleted" });
      setDeleteDistrict(null);
      setSelectedDistrict("");
      queryClient.invalidateQueries({ queryKey: getGetDistrictsByProvinceQueryKey(selectedProvince) });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  // ── Facility helpers ──
  const openEditFacility = (f: Facility) => {
    setEditFacility(f);
    setEditFacilityForm({
      facilityName: f.facilityName ?? "",
      facilityType: f.facilityType ?? "",
      address: f.address ?? "",
      description: f.description ?? "",
      contactPhone: f.contactPhone ?? "",
      contactEmail: f.contactEmail ?? "",
      capacity: f.capacity != null ? String(f.capacity) : "",
      gpsLatitude: f.gpsLatitude ?? "",
      gpsLongitude: f.gpsLongitude ?? "",
    });
  };

  const handleSaveFacility = async () => {
    if (!editFacility?.id) return;
    setSaving(true);
    const result = await apiFetchJson(`/api/v1/locations/facilities/${editFacility.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        facilityName: editFacilityForm.facilityName || undefined,
        facilityType: editFacilityForm.facilityType || null,
        address: editFacilityForm.address || null,
        description: editFacilityForm.description || null,
        contactPhone: editFacilityForm.contactPhone || null,
        contactEmail: editFacilityForm.contactEmail || null,
        capacity: editFacilityForm.capacity ? parseInt(editFacilityForm.capacity) : null,
        gpsLatitude: editFacilityForm.gpsLatitude || null,
        gpsLongitude: editFacilityForm.gpsLongitude || null,
      }),
    });
    setSaving(false);
    if (result.ok) {
      toast({ title: "Facility updated" });
      setEditFacility(null);
      queryClient.invalidateQueries({ queryKey: getGetFacilitiesByDistrictQueryKey(selectedDistrict) });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const handleAddFacility = async () => {
    if (!selectedDistrict || !addFacilityForm.facilityName) return;
    setSaving(true);
    const result = await apiFetchJson("/api/v1/locations/facilities", {
      method: "POST",
      body: JSON.stringify({
        districtId: selectedDistrict,
        facilityName: addFacilityForm.facilityName,
        facilityType: addFacilityForm.facilityType || null,
        address: addFacilityForm.address || null,
        description: addFacilityForm.description || null,
        contactPhone: addFacilityForm.contactPhone || null,
        contactEmail: addFacilityForm.contactEmail || null,
        capacity: addFacilityForm.capacity ? parseInt(addFacilityForm.capacity) : null,
        gpsLatitude: addFacilityForm.gpsLatitude || null,
        gpsLongitude: addFacilityForm.gpsLongitude || null,
      }),
    });
    setSaving(false);
    if (result.ok) {
      toast({ title: "Facility created" });
      setShowAddFacility(false);
      setAddFacilityForm({ facilityName: "", facilityType: "", address: "", description: "", contactPhone: "", contactEmail: "", capacity: "", gpsLatitude: "", gpsLongitude: "" });
      queryClient.invalidateQueries({ queryKey: getGetFacilitiesByDistrictQueryKey(selectedDistrict) });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const handleDeleteFacility = async () => {
    if (!deleteFacility?.id) return;
    setSaving(true);
    const result = await apiFetchJson(`/api/v1/locations/facilities/${deleteFacility.id}`, { method: "DELETE" });
    setSaving(false);
    if (result.ok) {
      toast({ title: "Facility deleted" });
      setDeleteFacility(null);
      queryClient.invalidateQueries({ queryKey: getGetFacilitiesByDistrictQueryKey(selectedDistrict) });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<MapPin className="w-5 h-5" />}
        title="Locations &amp; Hierarchy"
        subtitle={<>Manage {hierarchy.level1Plural.toLowerCase()}, {hierarchy.level2Plural.toLowerCase()}, and {hierarchy.level3Plural.toLowerCase()} for {organization.organizationName}.{isSuperAdmin ? " As Administrator you can create, edit, and delete records." : ""}</>}
        breadcrumbs={[{ label: "Locations" }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsBulkUploadOpen(true)}>
              <Upload className="w-4 h-4 mr-1.5" /> Batch Upload
            </Button>
            <Button variant="outline" onClick={handleExportFacilities} disabled={filteredFacilities.length === 0}>
              <Download className="w-4 h-4 mr-1.5" /> Export Facilities
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="provinces" className="w-full">
        <TabsList>
          <TabsTrigger value="provinces">{hierarchy.level1Plural}</TabsTrigger>
          <TabsTrigger value="districts">{hierarchy.level2Plural}</TabsTrigger>
          <TabsTrigger value="facilities">{hierarchy.level3Plural}</TabsTrigger>
        </TabsList>

        {/* ── PROVINCES TAB ── */}
        <TabsContent value="provinces" className="mt-6">
          <Card>
            <CardHeader><CardTitle>All {hierarchy.level1Plural} ({provincesData?.data?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flag / Icon</TableHead>
                      <TableHead>{hierarchy.level1}</TableHead>
                      <TableHead>Region / Group</TableHead>
                      <TableHead>Capital / Hub</TableHead>
                      <TableHead className="text-right">Population</TableHead>
                      <TableHead className="text-right">Area</TableHead>
                      <TableHead>Colors</TableHead>
                      {isSuperAdmin && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={isSuperAdmin ? 8 : 7}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                      ))
                    ) : provincesData?.data?.map(p => {
                      const pExt = p as unknown as { flagColors?: string[]; region?: string; capitalCity?: string; population?: number; areaKm2?: string };
                      const colors: string[] = Array.isArray(pExt.flagColors) ? pExt.flagColors : p.themeAccentColor ? [p.themeAccentColor] : [];
                      return (
                        <TableRow key={p.id} className={isSuperAdmin ? "cursor-pointer hover:bg-muted/50" : ""} onClick={() => isSuperAdmin && openEditProvince(p)}>
                          <TableCell>
                            {p.flagUrl
                              ? <img src={p.flagUrl} alt="flag" className="h-6 w-12 object-contain border rounded-sm bg-muted" />
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="font-medium">{p.provinceName}</TableCell>
                          <TableCell>
                            {pExt.region
                              ? <Badge variant="outline" className="text-xs">{pExt.region}</Badge>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-sm">{pExt.capitalCity ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right text-sm">{pExt.population != null ? pExt.population.toLocaleString() : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right text-sm">{pExt.areaKm2 ? `${parseFloat(pExt.areaKm2).toLocaleString()} km²` : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell>
                            {colors.length > 0 ? (
                              <div className="flex gap-1">
                                {colors.slice(0, 6).map((c, i) => (
                                  <div key={i} className="w-4 h-4 rounded-sm border" style={{ backgroundColor: c }} title={c} />
                                ))}
                              </div>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" onClick={() => openEditProvince(p)}>
                                <Pencil className="w-3 h-3 mr-1" /> Edit
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DISTRICTS TAB ── */}
        <TabsContent value="districts" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <Select onValueChange={val => { setSelectedProvince(val); setSelectedDistrict(""); }} value={selectedProvince}>
              <SelectTrigger className="w-full sm:w-[300px]"><SelectValue placeholder={`Select ${hierarchy.level1}`} /></SelectTrigger>
              <SelectContent>{provincesData?.data?.map(p => <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>)}</SelectContent>
            </Select>
            {isSuperAdmin && selectedProvince && (
              <Button onClick={() => { setAddDistrictForm({ districtName: "", districtCode: "", population: "", areaKm2: "", description: "" }); setShowAddDistrict(true); }}>
                <Plus className="w-4 h-4 mr-2" /> Add {hierarchy.level2}
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{hierarchy.level2}</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">Population</TableHead>
                      <TableHead className="text-right">Area</TableHead>
                      <TableHead className="text-right">{hierarchy.level3Plural}</TableHead>
                      <TableHead className="text-right">Assets</TableHead>
                      {isSuperAdmin && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!selectedProvince ? (
                      <TableRow><TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-10 text-muted-foreground">Select a {hierarchy.level1.toLowerCase()} to view {hierarchy.level2Plural.toLowerCase()}.</TableCell></TableRow>
                    ) : dLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={isSuperAdmin ? 7 : 6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                      ))
                    ) : districtsData?.data?.length === 0 ? (
                      <TableRow><TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-10 text-muted-foreground">No {hierarchy.level2Plural.toLowerCase()} found.</TableCell></TableRow>
                    ) : districtsData?.data?.map(d => {
                      const dExt = d as unknown as District;
                      return (
                        <TableRow key={d.id} className={isSuperAdmin ? "cursor-pointer hover:bg-muted/50" : ""} onClick={() => isSuperAdmin && openEditDistrict(dExt)}>
                          <TableCell className="font-medium">
                            <div>{d.districtName}</div>
                            {dExt.description && <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{dExt.description}</div>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{d.districtCode ?? "—"}</TableCell>
                          <TableCell className="text-right">{fmt(dExt.population)}</TableCell>
                          <TableCell className="text-right">{fmtArea(dExt.areaKm2)}</TableCell>
                          <TableCell className="text-right">{dExt.facilityCount ?? 0}</TableCell>
                          <TableCell className="text-right">{dExt.assetCount ?? 0}</TableCell>
                          {isSuperAdmin && (
                            <TableCell onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openEditDistrict(dExt)}>
                                  <Pencil className="w-3 h-3 mr-1" /> Edit
                                </Button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteDistrict(dExt)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FACILITIES TAB (ENTERPRISE RULE 24) ── */}
        <TabsContent value="facilities" className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <Select onValueChange={val => { setSelectedProvince(val); setSelectedDistrict(""); setFacilityPage(1); }} value={selectedProvince}>
                <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder={`Select ${hierarchy.level1}`} /></SelectTrigger>
                <SelectContent>{provincesData?.data?.map(p => <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>)}</SelectContent>
              </Select>
              <Select onValueChange={(val) => { setSelectedDistrict(val); setFacilityPage(1); }} value={selectedDistrict} disabled={!selectedProvince}>
                <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder={`Select ${hierarchy.level2}`} /></SelectTrigger>
                <SelectContent>{districtsData?.data?.map(d => <SelectItem key={d.id} value={d.id!}>{d.districtName}</SelectItem>)}</SelectContent>
              </Select>

              {selectedDistrict && (
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search facilities..."
                    value={facilitySearch}
                    onChange={(e) => {
                      setFacilitySearch(e.target.value);
                      setFacilityPage(1);
                    }}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {selectedDistrict && (
                <ColumnVisibilityDropdown
                  columns={FACILITY_COLUMNS}
                  visibleColumns={facilityVisibleColumns}
                  onChange={setFacilityVisibleColumns}
                />
              )}
              {isSuperAdmin && selectedDistrict && (
                <Button onClick={() => { setAddFacilityForm({ facilityName: "", facilityType: "", address: "", description: "", contactPhone: "", contactEmail: "", capacity: "", gpsLatitude: "", gpsLongitude: "" }); setShowAddFacility(true); }}>
                  <Plus className="w-4 h-4 mr-1.5" /> Add {hierarchy.level3}
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {facilityVisibleColumns.facility_name && (
                        <SortableHeader
                          label={hierarchy.level3}
                          field="facility_name"
                          currentSortField={facilitySortField}
                          currentSortDir={facilitySortDir}
                          onSort={toggleFacilitySort}
                        />
                      )}
                      {facilityVisibleColumns.type && (
                        <SortableHeader
                          label="Type"
                          field="type"
                          currentSortField={facilitySortField}
                          currentSortDir={facilitySortDir}
                          onSort={toggleFacilitySort}
                          className="w-36"
                        />
                      )}
                      {facilityVisibleColumns.contact && <TableHead>Contact</TableHead>}
                      {facilityVisibleColumns.capacity && (
                        <SortableHeader
                          label="Capacity"
                          field="capacity"
                          currentSortField={facilitySortField}
                          currentSortDir={facilitySortDir}
                          onSort={toggleFacilitySort}
                          className="w-28 text-right"
                        />
                      )}
                      {facilityVisibleColumns.assets && (
                        <SortableHeader
                          label="Assets"
                          field="assets"
                          currentSortField={facilitySortField}
                          currentSortDir={facilitySortDir}
                          onSort={toggleFacilitySort}
                          className="w-24 text-right"
                        />
                      )}
                      {facilityVisibleColumns.gps && <TableHead>GPS</TableHead>}
                      {facilityVisibleColumns.actions && isSuperAdmin && <TableHead className="w-20" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!selectedDistrict ? (
                      <TableRow><TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-10 text-muted-foreground">Select a {hierarchy.level2.toLowerCase()} to view {hierarchy.level3Plural.toLowerCase()}.</TableCell></TableRow>
                    ) : fLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={isSuperAdmin ? 7 : 6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                      ))
                    ) : paginatedFacilities.length === 0 ? (
                      <TableRow><TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-10 text-muted-foreground">No {hierarchy.level3Plural.toLowerCase()} found.</TableCell></TableRow>
                    ) : paginatedFacilities.map((f: Facility) => {
                      return (
                        <TableRow key={f.id} className={isSuperAdmin ? "cursor-pointer hover:bg-muted/50" : ""} onClick={() => isSuperAdmin && openEditFacility(f)}>
                          {facilityVisibleColumns.facility_name && (
                            <TableCell>
                              <div className="font-medium">{f.facilityName}</div>
                              {f.address && <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />{f.address}</div>}
                            </TableCell>
                          )}
                          {facilityVisibleColumns.type && (
                            <TableCell>
                              {f.facilityType
                                ? <Badge variant="secondary" className="text-xs">{f.facilityType}</Badge>
                                : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                          )}
                          {facilityVisibleColumns.contact && (
                            <TableCell>
                              <div className="text-xs space-y-0.5">
                                {f.contactPhone && <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-muted-foreground" />{f.contactPhone}</div>}
                                {f.contactEmail && <div className="flex items-center gap-1"><Mail className="w-3 h-3 text-muted-foreground" />{f.contactEmail}</div>}
                                {!f.contactPhone && !f.contactEmail && <span className="text-muted-foreground">—</span>}
                              </div>
                            </TableCell>
                          )}
                          {facilityVisibleColumns.capacity && (
                            <TableCell className="text-right">{f.capacity != null ? f.capacity.toLocaleString() : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                          )}
                          {facilityVisibleColumns.assets && (
                            <TableCell className="text-right">{f.assetCount ?? 0}</TableCell>
                          )}
                          {facilityVisibleColumns.gps && (
                            <TableCell>
                              {f.gpsLatitude && f.gpsLongitude
                                ? <div className="text-xs text-muted-foreground font-mono">{parseFloat(f.gpsLatitude).toFixed(4)}, {parseFloat(f.gpsLongitude).toFixed(4)}</div>
                                : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                          )}
                          {facilityVisibleColumns.actions && isSuperAdmin && (
                            <TableCell onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openEditFacility(f)}>
                                  <Pencil className="w-3 h-3 mr-1" /> Edit
                                </Button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteFacility(f)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Table Rule 24 Pagination */}
              {selectedDistrict && (
                <DataTablePagination
                  page={facilityPage}
                  pageSize={facilityPageSize}
                  total={filteredFacilities.length}
                  onPageChange={setFacilityPage}
                  onPageSizeChange={(newSize) => {
                    setFacilityPageSize(newSize);
                    setFacilityPage(1);
                  }}
                  pageSizeOptions={[10, 25, 50, 100]}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Batch Upload Modal for Locations / Facilities */}
      <BulkUploadModal
        open={isBulkUploadOpen}
        onOpenChange={setIsBulkUploadOpen}
        entityType="locations"
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: getGetProvincesQueryKey() });
          if (selectedProvince) {
            queryClient.invalidateQueries({ queryKey: getGetDistrictsByProvinceQueryKey(selectedProvince) });
          }
          if (selectedDistrict) {
            queryClient.invalidateQueries({ queryKey: getGetFacilitiesByDistrictQueryKey(selectedDistrict) });
          }
        }}
      />

      {/* ═══════════════ DIALOGS ═══════════════ */}

      {/* Edit Province */}
      {isSuperAdmin && editProvince && (
        <Dialog open onOpenChange={open => { if (!open) setEditProvince(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit {hierarchy.level1} — {editProvince.provinceName}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto pr-1 space-y-5 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>{hierarchy.level1} Name</Label>
                  <Input value={editProvinceForm.provinceName} onChange={e => setEditProvinceForm(f => ({ ...f, provinceName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Region / Division</Label>
                  <Select value={editProvinceForm.region || "_none"} onValueChange={v => setEditProvinceForm(f => ({ ...f, region: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {PNG_REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Capital / Main City</Label>
                  <Input placeholder="e.g. Headquarters / Capital" value={editProvinceForm.capitalCity} onChange={e => setEditProvinceForm(f => ({ ...f, capitalCity: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Population</Label>
                  <Input type="number" placeholder="e.g. 312000" value={editProvinceForm.population} onChange={e => setEditProvinceForm(f => ({ ...f, population: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Area (km²)</Label>
                  <Input type="number" placeholder="e.g. 29500.5" value={editProvinceForm.areaKm2} onChange={e => setEditProvinceForm(f => ({ ...f, areaKm2: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Flag / Emblem URL</Label>
                  <Input placeholder="/flags/province.svg" value={editProvinceForm.flagUrl} onChange={e => setEditProvinceForm(f => ({ ...f, flagUrl: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea rows={3} placeholder={`Brief description of the ${hierarchy.level1.toLowerCase()}...`} value={editProvinceForm.description} onChange={e => setEditProvinceForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              {editProvinceForm.flagUrl && (
                <FlagColorPicker flagUrl={editProvinceForm.flagUrl} currentCount={editProvinceForm.flagColors.length} maxColors={8} onColorPicked={hex => { if (editProvinceForm.flagColors.length < 8) setEditProvinceForm(f => ({ ...f, flagColors: [...f.flagColors, hex] })); }} />
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Emblem / Theme Colors</Label>
                  {editProvinceForm.flagColors.length < 8 && (
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditProvinceForm(f => ({ ...f, flagColors: [...f.flagColors, "#000000"] }))}>
                      <Plus className="w-3 h-3 mr-1" /> Add Color
                    </Button>
                  )}
                </div>
                {editProvinceForm.flagColors.length > 0 ? (
                  <div className="space-y-2">
                    {editProvinceForm.flagColors.map((color, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="color" value={color} onChange={e => { const u = [...editProvinceForm.flagColors]; u[i] = e.target.value; setEditProvinceForm(f => ({ ...f, flagColors: u })); }} className="h-9 w-12 rounded border cursor-pointer bg-transparent p-0.5" />
                        <Input value={color} maxLength={7} className="font-mono text-sm flex-1" onChange={e => { const u = [...editProvinceForm.flagColors]; u[i] = e.target.value; setEditProvinceForm(f => ({ ...f, flagColors: u })); }} />
                        <div className="w-8 h-8 rounded border shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => setEditProvinceForm(f => ({ ...f, flagColors: f.flagColors.filter((_, idx) => idx !== i) }))}><X className="w-4 h-4" /></Button>
                      </div>
                    ))}
                    <div className="flex items-center gap-1 pt-1">
                      <span className="text-xs text-muted-foreground mr-1">Preview:</span>
                      <div className="flex rounded overflow-hidden border h-6 flex-1">{editProvinceForm.flagColors.map((c, i) => <div key={i} className="flex-1" style={{ backgroundColor: c }} />)}</div>
                    </div>
                  </div>
                ) : <p className="text-xs text-muted-foreground">Click the emblem image above to sample colors.</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditProvince(null)}>Cancel</Button>
              <Button onClick={handleSaveProvince} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit District */}
      {isSuperAdmin && editDistrict && (
        <Dialog open onOpenChange={open => { if (!open) setEditDistrict(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit {hierarchy.level2} — {editDistrict.districtName}</DialogTitle></DialogHeader>
            <DistrictForm form={editDistrictForm} setForm={setEditDistrictForm} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDistrict(null)}>Cancel</Button>
              <Button onClick={handleSaveDistrict} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add District */}
      {isSuperAdmin && showAddDistrict && (
        <Dialog open onOpenChange={open => { if (!open) setShowAddDistrict(false); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add New {hierarchy.level2}</DialogTitle></DialogHeader>
            <DistrictForm form={addDistrictForm} setForm={setAddDistrictForm} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDistrict(false)}>Cancel</Button>
              <Button onClick={handleAddDistrict} disabled={saving || !addDistrictForm.districtName}>{saving ? "Creating…" : `Create ${hierarchy.level2}`}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete District */}
      {isSuperAdmin && deleteDistrict && (
        <Dialog open onOpenChange={open => { if (!open) setDeleteDistrict(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {hierarchy.level2}</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{deleteDistrict.districtName}</strong>?
                {(deleteDistrict.facilityCount ?? 0) > 0 && ` This ${hierarchy.level2.toLowerCase()} has ${deleteDistrict.facilityCount} ${hierarchy.level3Plural.toLowerCase()} — delete them first.`}
                {(deleteDistrict.assetCount ?? 0) > 0 && ` There are ${deleteDistrict.assetCount} assets linked to it — reassign them first.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDistrict(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteDistrict} disabled={saving || (deleteDistrict.facilityCount ?? 0) > 0 || (deleteDistrict.assetCount ?? 0) > 0}>
                {saving ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Facility */}
      {isSuperAdmin && editFacility && (
        <Dialog open onOpenChange={open => { if (!open) setEditFacility(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader><DialogTitle>Edit {hierarchy.level3} — {editFacility.facilityName}</DialogTitle></DialogHeader>
            <div className="overflow-y-auto pr-1">
              <FacilityForm form={editFacilityForm} setForm={setEditFacilityForm} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditFacility(null)}>Cancel</Button>
              <Button onClick={handleSaveFacility} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Facility */}
      {isSuperAdmin && showAddFacility && (
        <Dialog open onOpenChange={open => { if (!open) setShowAddFacility(false); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader><DialogTitle>Add New {hierarchy.level3}</DialogTitle></DialogHeader>
            <div className="overflow-y-auto pr-1">
              <FacilityForm form={addFacilityForm} setForm={setAddFacilityForm} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddFacility(false)}>Cancel</Button>
              <Button onClick={handleAddFacility} disabled={saving || !addFacilityForm.facilityName}>{saving ? "Creating…" : `Create ${hierarchy.level3}`}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Facility */}
      {isSuperAdmin && deleteFacility && (
        <Dialog open onOpenChange={open => { if (!open) setDeleteFacility(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {hierarchy.level3}</DialogTitle>
              <DialogDescription>Delete <strong>{deleteFacility.facilityName}</strong>? Any assets assigned to it will be unlinked (not deleted).</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteFacility(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteFacility} disabled={saving}>{saving ? "Deleting…" : "Delete"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Sub-forms ───────────────────────────────────────────────────────────────

type DistrictFormState = { districtName: string; districtCode: string; population: string; areaKm2: string; description: string };

function DistrictForm({ form, setForm }: { form: DistrictFormState; setForm: React.Dispatch<React.SetStateAction<DistrictFormState>> }) {
  const { hierarchy } = useOrganization();
  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>{hierarchy.level2} Name <span className="text-destructive">*</span></Label>
          <Input value={form.districtName} onChange={e => setForm(f => ({ ...f, districtName: e.target.value }))} placeholder={`e.g. Central ${hierarchy.level2}`} />
        </div>
        <div className="space-y-1">
          <Label>{hierarchy.level2} Code</Label>
          <Input value={form.districtCode} onChange={e => setForm(f => ({ ...f, districtCode: e.target.value }))} placeholder="e.g. DIV-01" />
        </div>
        <div className="space-y-1">
          <Label><Users className="inline w-3 h-3 mr-1" />Population</Label>
          <Input type="number" value={form.population} onChange={e => setForm(f => ({ ...f, population: e.target.value }))} placeholder="e.g. 80000" />
        </div>
        <div className="space-y-1">
          <Label><Ruler className="inline w-3 h-3 mr-1" />Area (km²)</Label>
          <Input type="number" value={form.areaKm2} onChange={e => setForm(f => ({ ...f, areaKm2: e.target.value }))} placeholder="e.g. 3100.5" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={`Brief description of the ${hierarchy.level2.toLowerCase()}...`} />
      </div>
    </div>
  );
}

type FacilityFormState = { facilityName: string; facilityType: string; address: string; description: string; contactPhone: string; contactEmail: string; capacity: string; gpsLatitude: string; gpsLongitude: string };

function FacilityForm({ form, setForm }: { form: FacilityFormState; setForm: React.Dispatch<React.SetStateAction<FacilityFormState>> }) {
  const { hierarchy } = useOrganization();
  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1">
          <Label>{hierarchy.level3} Name <span className="text-destructive">*</span></Label>
          <Input value={form.facilityName} onChange={e => setForm(f => ({ ...f, facilityName: e.target.value }))} placeholder={`e.g. Main ${hierarchy.level3} Office`} />
        </div>
        <div className="space-y-1">
          <Label><Building2 className="inline w-3 h-3 mr-1" />{hierarchy.level3} Type</Label>
          <Select value={form.facilityType || "_none"} onValueChange={v => setForm(f => ({ ...f, facilityType: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— None —</SelectItem>
              {FACILITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Capacity</Label>
          <Input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="e.g. 250" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label><MapPin className="inline w-3 h-3 mr-1" />Address</Label>
          <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="e.g. 123 Business Avenue" />
        </div>
        <div className="space-y-1">
          <Label><Phone className="inline w-3 h-3 mr-1" />Contact Phone</Label>
          <Input value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="+1 xxx xxx xxxx" />
        </div>
        <div className="space-y-1">
          <Label><Mail className="inline w-3 h-3 mr-1" />Contact Email</Label>
          <Input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="contact@organization.org" />
        </div>
        <div className="space-y-1">
          <Label><Navigation className="inline w-3 h-3 mr-1" />GPS Latitude</Label>
          <Input type="number" value={form.gpsLatitude} onChange={e => setForm(f => ({ ...f, gpsLatitude: e.target.value }))} placeholder="e.g. -6.7248" step="0.0001" />
        </div>
        <div className="space-y-1">
          <Label><Navigation className="inline w-3 h-3 mr-1" />GPS Longitude</Label>
          <Input type="number" value={form.gpsLongitude} onChange={e => setForm(f => ({ ...f, gpsLongitude: e.target.value }))} placeholder="e.g. 146.9943" step="0.0001" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={`Brief description of the ${hierarchy.level3.toLowerCase()}...`} />
      </div>
    </div>
  );
}
