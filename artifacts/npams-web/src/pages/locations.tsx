import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetProvinces, getGetProvincesQueryKey, useGetDistrictsByProvince, getGetDistrictsByProvinceQueryKey, useGetFacilitiesByDistrict, getGetFacilitiesByDistrictQueryKey } from "@workspace/api-client-react";
import type { Province } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetchJson } from "@/lib/api-fetch";

interface District {
  id?: string;
  districtName?: string;
  districtCode?: string | null;
}

interface Facility {
  id?: string;
  facilityName?: string;
  facilityType?: string | null;
  address?: string | null;
}

export default function Locations() {
  const [selectedProvince, setSelectedProvince] = useState<string>("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");

  const [editProvince, setEditProvince] = useState<Province | null>(null);
  const [editProvinceForm, setEditProvinceForm] = useState({ flagUrl: "", themeAccentColor: "" });

  const [editDistrict, setEditDistrict] = useState<District | null>(null);
  const [editDistrictForm, setEditDistrictForm] = useState({ districtName: "", districtCode: "" });

  const [editFacility, setEditFacility] = useState<Facility | null>(null);
  const [editFacilityForm, setEditFacilityForm] = useState({ facilityName: "", facilityType: "" });

  const [saving, setSaving] = useState(false);

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

  const openEditProvince = (p: Province) => {
    setEditProvince(p);
    setEditProvinceForm({ flagUrl: p.flagUrl ?? "", themeAccentColor: p.themeAccentColor ?? "" });
  };

  const handleSaveProvince = async () => {
    if (!editProvince?.id) return;
    setSaving(true);
    const result = await apiFetchJson(`/api/v1/locations/provinces/${editProvince.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        flagUrl: editProvinceForm.flagUrl || null,
        themeAccentColor: editProvinceForm.themeAccentColor || null,
      }),
    });
    setSaving(false);
    if (result.ok) {
      toast({ title: "Province branding updated" });
      setEditProvince(null);
      queryClient.invalidateQueries({ queryKey: getGetProvincesQueryKey() });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const openEditDistrict = (d: District) => {
    setEditDistrict(d);
    setEditDistrictForm({ districtName: d.districtName ?? "", districtCode: d.districtCode ?? "" });
  };

  const handleSaveDistrict = async () => {
    if (!editDistrict?.id) return;
    setSaving(true);
    const result = await apiFetchJson(`/api/v1/locations/districts/${editDistrict.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        districtName: editDistrictForm.districtName || undefined,
        districtCode: editDistrictForm.districtCode || null,
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

  const openEditFacility = (f: Facility) => {
    setEditFacility(f);
    setEditFacilityForm({ facilityName: f.facilityName ?? "", facilityType: f.facilityType ?? "" });
  };

  const handleSaveFacility = async () => {
    if (!editFacility?.id) return;
    setSaving(true);
    const result = await apiFetchJson(`/api/v1/locations/facilities/${editFacility.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        facilityName: editFacilityForm.facilityName || undefined,
        facilityType: editFacilityForm.facilityType || null,
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Locations Explorer</h2>
        <p className="text-muted-foreground">Browse provinces, districts, and facilities{isSuperAdmin ? " — click Edit to update records" : ""}.</p>
      </div>

      <Tabs defaultValue="provinces" className="w-full">
        <TabsList>
          <TabsTrigger value="provinces">Provinces</TabsTrigger>
          <TabsTrigger value="districts">Districts</TabsTrigger>
          <TabsTrigger value="facilities">Facilities</TabsTrigger>
        </TabsList>

        <TabsContent value="provinces" className="mt-6">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flag</TableHead>
                  <TableHead>Province Name</TableHead>
                  <TableHead>Theme Color</TableHead>
                  {isSuperAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pLoading ? (
                  <TableRow><TableCell colSpan={isSuperAdmin ? 4 : 3} className="text-center py-4"><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                ) : (
                  provincesData?.data?.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>
                        {p.flagUrl
                          ? <img src={p.flagUrl} alt="flag" className="h-6 w-10 object-cover border rounded-sm" />
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="font-medium">{p.provinceName}</TableCell>
                      <TableCell>
                        {p.themeAccentColor ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: p.themeAccentColor }} />
                            <span className="text-xs text-muted-foreground">{p.themeAccentColor}</span>
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      {isSuperAdmin && (
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => openEditProvince(p)}>
                            <Pencil className="w-3 h-3 mr-1" /> Edit Branding
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="districts" className="mt-6 space-y-4">
          <Select onValueChange={(val) => { setSelectedProvince(val); setSelectedDistrict(""); }} value={selectedProvince}>
            <SelectTrigger className="w-[300px]"><SelectValue placeholder="Select Province first" /></SelectTrigger>
            <SelectContent>
              {provincesData?.data?.map(p => <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>)}
            </SelectContent>
          </Select>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>District Name</TableHead>
                  <TableHead>Code</TableHead>
                  {isSuperAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedProvince ? (
                  <TableRow><TableCell colSpan={isSuperAdmin ? 3 : 2} className="text-center py-8 text-muted-foreground">Select a province to view districts.</TableCell></TableRow>
                ) : dLoading ? (
                  <TableRow><TableCell colSpan={isSuperAdmin ? 3 : 2} className="text-center py-4">Loading...</TableCell></TableRow>
                ) : (
                  districtsData?.data?.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.districtName}</TableCell>
                      <TableCell>{d.districtCode ?? "—"}</TableCell>
                      {isSuperAdmin && (
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => openEditDistrict(d as District)}>
                            <Pencil className="w-3 h-3 mr-1" /> Edit
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="facilities" className="mt-6 space-y-4">
          <div className="flex gap-4 flex-wrap">
            <Select onValueChange={(val) => { setSelectedProvince(val); setSelectedDistrict(""); }} value={selectedProvince}>
              <SelectTrigger className="w-[300px]"><SelectValue placeholder="Select Province" /></SelectTrigger>
              <SelectContent>
                {provincesData?.data?.map(p => <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select onValueChange={setSelectedDistrict} value={selectedDistrict} disabled={!selectedProvince}>
              <SelectTrigger className="w-[300px]"><SelectValue placeholder="Select District" /></SelectTrigger>
              <SelectContent>
                {districtsData?.data?.map(d => <SelectItem key={d.id} value={d.id!}>{d.districtName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Address</TableHead>
                  {isSuperAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedDistrict ? (
                  <TableRow><TableCell colSpan={isSuperAdmin ? 4 : 3} className="text-center py-8 text-muted-foreground">Select a district to view facilities.</TableCell></TableRow>
                ) : fLoading ? (
                  <TableRow><TableCell colSpan={isSuperAdmin ? 4 : 3} className="text-center py-4">Loading...</TableCell></TableRow>
                ) : (
                  facilitiesData?.data?.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.facilityName}</TableCell>
                      <TableCell>{f.facilityType ?? "—"}</TableCell>
                      <TableCell>{f.address ?? "—"}</TableCell>
                      {isSuperAdmin && (
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => openEditFacility(f as Facility)}>
                            <Pencil className="w-3 h-3 mr-1" /> Edit
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {isSuperAdmin && editProvince && (
        <Dialog open={!!editProvince} onOpenChange={(open) => { if (!open) setEditProvince(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Branding — {editProvince.provinceName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="flagUrl">Flag URL</Label>
                <Input
                  id="flagUrl"
                  placeholder="https://example.com/flag.png"
                  value={editProvinceForm.flagUrl}
                  onChange={(e) => setEditProvinceForm(f => ({ ...f, flagUrl: e.target.value }))}
                />
                {editProvinceForm.flagUrl && (
                  <img src={editProvinceForm.flagUrl} alt="preview" className="h-8 w-12 object-cover border rounded-sm mt-1" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="themeColor">Theme Accent Color (hex)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="themeColor"
                    placeholder="#1a5276"
                    value={editProvinceForm.themeAccentColor}
                    onChange={(e) => setEditProvinceForm(f => ({ ...f, themeAccentColor: e.target.value }))}
                  />
                  {editProvinceForm.themeAccentColor && (
                    <div className="w-8 h-8 rounded border shrink-0" style={{ backgroundColor: editProvinceForm.themeAccentColor }} />
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditProvince(null)}>Cancel</Button>
              <Button onClick={handleSaveProvince} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isSuperAdmin && editDistrict && (
        <Dialog open={!!editDistrict} onOpenChange={(open) => { if (!open) setEditDistrict(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit District — {editDistrict.districtName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="districtName">District Name</Label>
                <Input
                  id="districtName"
                  value={editDistrictForm.districtName}
                  onChange={(e) => setEditDistrictForm(f => ({ ...f, districtName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="districtCode">District Code</Label>
                <Input
                  id="districtCode"
                  placeholder="e.g. MBE-01"
                  value={editDistrictForm.districtCode}
                  onChange={(e) => setEditDistrictForm(f => ({ ...f, districtCode: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDistrict(null)}>Cancel</Button>
              <Button onClick={handleSaveDistrict} disabled={saving || !editDistrictForm.districtName.trim()}>{saving ? "Saving..." : "Save Changes"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isSuperAdmin && editFacility && (
        <Dialog open={!!editFacility} onOpenChange={(open) => { if (!open) setEditFacility(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Facility — {editFacility.facilityName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="facilityName">Facility Name</Label>
                <Input
                  id="facilityName"
                  value={editFacilityForm.facilityName}
                  onChange={(e) => setEditFacilityForm(f => ({ ...f, facilityName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="facilityType">Facility Type</Label>
                <Input
                  id="facilityType"
                  placeholder="e.g. Hospital, School, Office"
                  value={editFacilityForm.facilityType}
                  onChange={(e) => setEditFacilityForm(f => ({ ...f, facilityType: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditFacility(null)}>Cancel</Button>
              <Button onClick={handleSaveFacility} disabled={saving || !editFacilityForm.facilityName.trim()}>{saving ? "Saving..." : "Save Changes"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
