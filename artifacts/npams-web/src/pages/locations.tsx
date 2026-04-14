import { useState } from "react";
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
import { Pencil, Plus, Trash2, X, MapPin, Users, Ruler, Building2, Phone, Mail, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetchJson } from "@/lib/api-fetch";
import { FlagColorPicker } from "@/components/flag-color-picker";

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
  "Government Office", "Hospital", "Health Centre", "School", "University",
  "Police Station", "Court House", "Jail / Correctional", "Road / Infrastructure",
  "Port / Jetty", "Airport", "Power Station", "Water Treatment",
  "Community Hall", "Market", "Warehouse", "Other",
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
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Locations</h2>
        <p className="text-muted-foreground">
          Manage provinces, districts, and facilities across Papua New Guinea.
          {isSuperAdmin ? " As Super Admin you can create, edit, and delete records." : ""}
        </p>
      </div>

      <Tabs defaultValue="provinces" className="w-full">
        <TabsList>
          <TabsTrigger value="provinces">Provinces</TabsTrigger>
          <TabsTrigger value="districts">Districts</TabsTrigger>
          <TabsTrigger value="facilities">Facilities</TabsTrigger>
        </TabsList>

        {/* ── PROVINCES TAB ── */}
        <TabsContent value="provinces" className="mt-6">
          <Card>
            <CardHeader><CardTitle>All Provinces ({provincesData?.data?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flag</TableHead>
                      <TableHead>Province</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Capital</TableHead>
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
              <SelectTrigger className="w-full sm:w-[300px]"><SelectValue placeholder="Select Province" /></SelectTrigger>
              <SelectContent>{provincesData?.data?.map(p => <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>)}</SelectContent>
            </Select>
            {isSuperAdmin && selectedProvince && (
              <Button onClick={() => { setAddDistrictForm({ districtName: "", districtCode: "", population: "", areaKm2: "", description: "" }); setShowAddDistrict(true); }}>
                <Plus className="w-4 h-4 mr-2" /> Add District
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>District</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">Population</TableHead>
                      <TableHead className="text-right">Area</TableHead>
                      <TableHead className="text-right">Facilities</TableHead>
                      <TableHead className="text-right">Assets</TableHead>
                      {isSuperAdmin && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!selectedProvince ? (
                      <TableRow><TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-10 text-muted-foreground">Select a province to view its districts.</TableCell></TableRow>
                    ) : dLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={isSuperAdmin ? 7 : 6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                      ))
                    ) : districtsData?.data?.length === 0 ? (
                      <TableRow><TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-10 text-muted-foreground">No districts found.</TableCell></TableRow>
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

        {/* ── FACILITIES TAB ── */}
        <TabsContent value="facilities" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex flex-wrap gap-3">
              <Select onValueChange={val => { setSelectedProvince(val); setSelectedDistrict(""); }} value={selectedProvince}>
                <SelectTrigger className="w-full sm:w-[260px]"><SelectValue placeholder="Select Province" /></SelectTrigger>
                <SelectContent>{provincesData?.data?.map(p => <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>)}</SelectContent>
              </Select>
              <Select onValueChange={setSelectedDistrict} value={selectedDistrict} disabled={!selectedProvince}>
                <SelectTrigger className="w-full sm:w-[260px]"><SelectValue placeholder="Select District" /></SelectTrigger>
                <SelectContent>{districtsData?.data?.map(d => <SelectItem key={d.id} value={d.id!}>{d.districtName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {isSuperAdmin && selectedDistrict && (
              <Button onClick={() => { setAddFacilityForm({ facilityName: "", facilityType: "", address: "", description: "", contactPhone: "", contactEmail: "", capacity: "", gpsLatitude: "", gpsLongitude: "" }); setShowAddFacility(true); }}>
                <Plus className="w-4 h-4 mr-2" /> Add Facility
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Facility</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead className="text-right">Capacity</TableHead>
                      <TableHead className="text-right">Assets</TableHead>
                      <TableHead>GPS</TableHead>
                      {isSuperAdmin && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!selectedDistrict ? (
                      <TableRow><TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-10 text-muted-foreground">Select a district to view facilities.</TableCell></TableRow>
                    ) : fLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={isSuperAdmin ? 7 : 6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                      ))
                    ) : facilitiesData?.data?.length === 0 ? (
                      <TableRow><TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-10 text-muted-foreground">No facilities found.</TableCell></TableRow>
                    ) : facilitiesData?.data?.map(f => {
                      const fExt = f as unknown as Facility;
                      return (
                        <TableRow key={f.id} className={isSuperAdmin ? "cursor-pointer hover:bg-muted/50" : ""} onClick={() => isSuperAdmin && openEditFacility(fExt)}>
                          <TableCell>
                            <div className="font-medium">{f.facilityName}</div>
                            {fExt.address && <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />{fExt.address}</div>}
                          </TableCell>
                          <TableCell>
                            {f.facilityType
                              ? <Badge variant="secondary" className="text-xs">{f.facilityType}</Badge>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs space-y-0.5">
                              {fExt.contactPhone && <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-muted-foreground" />{fExt.contactPhone}</div>}
                              {fExt.contactEmail && <div className="flex items-center gap-1"><Mail className="w-3 h-3 text-muted-foreground" />{fExt.contactEmail}</div>}
                              {!fExt.contactPhone && !fExt.contactEmail && <span className="text-muted-foreground">—</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{fExt.capacity != null ? fExt.capacity.toLocaleString() : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                          <TableCell className="text-right">{fExt.assetCount ?? 0}</TableCell>
                          <TableCell>
                            {fExt.gpsLatitude && fExt.gpsLongitude
                              ? <div className="text-xs text-muted-foreground font-mono">{parseFloat(fExt.gpsLatitude).toFixed(4)}, {parseFloat(fExt.gpsLongitude).toFixed(4)}</div>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openEditFacility(fExt)}>
                                  <Pencil className="w-3 h-3 mr-1" /> Edit
                                </Button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteFacility(fExt)}>
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
      </Tabs>

      {/* ═══════════════ DIALOGS ═══════════════ */}

      {/* Edit Province */}
      {isSuperAdmin && editProvince && (
        <Dialog open onOpenChange={open => { if (!open) setEditProvince(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit Province — {editProvince.provinceName}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto pr-1 space-y-5 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Province Name</Label>
                  <Input value={editProvinceForm.provinceName} onChange={e => setEditProvinceForm(f => ({ ...f, provinceName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Region</Label>
                  <Select value={editProvinceForm.region || "_none"} onValueChange={v => setEditProvinceForm(f => ({ ...f, region: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {PNG_REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Capital City</Label>
                  <Input placeholder="e.g. Port Moresby" value={editProvinceForm.capitalCity} onChange={e => setEditProvinceForm(f => ({ ...f, capitalCity: e.target.value }))} />
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
                  <Label>Flag Image URL</Label>
                  <Input placeholder="/flags/province.svg" value={editProvinceForm.flagUrl} onChange={e => setEditProvinceForm(f => ({ ...f, flagUrl: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea rows={3} placeholder="Brief description of the province..." value={editProvinceForm.description} onChange={e => setEditProvinceForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              {editProvinceForm.flagUrl && (
                <FlagColorPicker flagUrl={editProvinceForm.flagUrl} currentCount={editProvinceForm.flagColors.length} maxColors={8} onColorPicked={hex => { if (editProvinceForm.flagColors.length < 8) setEditProvinceForm(f => ({ ...f, flagColors: [...f.flagColors, hex] })); }} />
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Flag Colors</Label>
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
                ) : <p className="text-xs text-muted-foreground">Click the flag image above to sample colors.</p>}
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
            <DialogHeader><DialogTitle>Edit District — {editDistrict.districtName}</DialogTitle></DialogHeader>
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
            <DialogHeader><DialogTitle>Add New District</DialogTitle></DialogHeader>
            <DistrictForm form={addDistrictForm} setForm={setAddDistrictForm} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDistrict(false)}>Cancel</Button>
              <Button onClick={handleAddDistrict} disabled={saving || !addDistrictForm.districtName}>{saving ? "Creating…" : "Create District"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete District */}
      {isSuperAdmin && deleteDistrict && (
        <Dialog open onOpenChange={open => { if (!open) setDeleteDistrict(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete District</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{deleteDistrict.districtName}</strong>?
                {(deleteDistrict.facilityCount ?? 0) > 0 && ` This district has ${deleteDistrict.facilityCount} facilities — delete them first.`}
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
            <DialogHeader><DialogTitle>Edit Facility — {editFacility.facilityName}</DialogTitle></DialogHeader>
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
            <DialogHeader><DialogTitle>Add New Facility</DialogTitle></DialogHeader>
            <div className="overflow-y-auto pr-1">
              <FacilityForm form={addFacilityForm} setForm={setAddFacilityForm} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddFacility(false)}>Cancel</Button>
              <Button onClick={handleAddFacility} disabled={saving || !addFacilityForm.facilityName}>{saving ? "Creating…" : "Create Facility"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Facility */}
      {isSuperAdmin && deleteFacility && (
        <Dialog open onOpenChange={open => { if (!open) setDeleteFacility(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Facility</DialogTitle>
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
  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>District Name <span className="text-destructive">*</span></Label>
          <Input value={form.districtName} onChange={e => setForm(f => ({ ...f, districtName: e.target.value }))} placeholder="e.g. Lae District" />
        </div>
        <div className="space-y-1">
          <Label>District Code</Label>
          <Input value={form.districtCode} onChange={e => setForm(f => ({ ...f, districtCode: e.target.value }))} placeholder="e.g. MO-LAE" />
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
        <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the district..." />
      </div>
    </div>
  );
}

type FacilityFormState = { facilityName: string; facilityType: string; address: string; description: string; contactPhone: string; contactEmail: string; capacity: string; gpsLatitude: string; gpsLongitude: string };

function FacilityForm({ form, setForm }: { form: FacilityFormState; setForm: React.Dispatch<React.SetStateAction<FacilityFormState>> }) {
  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1">
          <Label>Facility Name <span className="text-destructive">*</span></Label>
          <Input value={form.facilityName} onChange={e => setForm(f => ({ ...f, facilityName: e.target.value }))} placeholder="e.g. Lae General Hospital" />
        </div>
        <div className="space-y-1">
          <Label><Building2 className="inline w-3 h-3 mr-1" />Facility Type</Label>
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
          <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="e.g. Milfordhaven Road, Lae" />
        </div>
        <div className="space-y-1">
          <Label><Phone className="inline w-3 h-3 mr-1" />Contact Phone</Label>
          <Input value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="+675 xxx xxxx" />
        </div>
        <div className="space-y-1">
          <Label><Mail className="inline w-3 h-3 mr-1" />Contact Email</Label>
          <Input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="contact@facility.gov.pg" />
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
        <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the facility..." />
      </div>
    </div>
  );
}
