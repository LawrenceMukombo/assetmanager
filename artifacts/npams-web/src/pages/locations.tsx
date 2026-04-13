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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Plus, Trash2, X } from "lucide-react";
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
  const [editProvinceForm, setEditProvinceForm] = useState({ flagUrl: "", themeAccentColor: "", flagColors: [] as string[] });

  const [editDistrict, setEditDistrict] = useState<District | null>(null);
  const [editDistrictForm, setEditDistrictForm] = useState({ districtName: "", districtCode: "" });

  const [editFacility, setEditFacility] = useState<Facility | null>(null);
  const [editFacilityForm, setEditFacilityForm] = useState({ facilityName: "", facilityType: "" });

  const [showAddFacility, setShowAddFacility] = useState(false);
  const [addFacilityForm, setAddFacilityForm] = useState({ facilityName: "", facilityType: "", address: "" });

  const [deleteFacility, setDeleteFacility] = useState<Facility | null>(null);

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
    const existingColors = Array.isArray((p as unknown as { flagColors?: string[] }).flagColors)
      ? (p as unknown as { flagColors: string[] }).flagColors
      : [];
    setEditProvinceForm({ flagUrl: p.flagUrl ?? "", themeAccentColor: p.themeAccentColor ?? "", flagColors: existingColors });
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

  const handleAddFacility = async () => {
    if (!selectedDistrict) return;
    setSaving(true);
    const result = await apiFetchJson("/api/v1/locations/facilities", {
      method: "POST",
      body: JSON.stringify({
        districtId: selectedDistrict,
        facilityName: addFacilityForm.facilityName,
        facilityType: addFacilityForm.facilityType || null,
        address: addFacilityForm.address || null,
      }),
    });
    setSaving(false);
    if (result.ok) {
      toast({ title: "Facility created" });
      setShowAddFacility(false);
      setAddFacilityForm({ facilityName: "", facilityType: "", address: "" });
      queryClient.invalidateQueries({ queryKey: getGetFacilitiesByDistrictQueryKey(selectedDistrict) });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const handleDeleteFacility = async () => {
    if (!deleteFacility?.id) return;
    setSaving(true);
    const result = await apiFetchJson(`/api/v1/locations/facilities/${deleteFacility.id}`, {
      method: "DELETE",
    });
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
                  <TableHead>Flag Colors</TableHead>
                  {isSuperAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pLoading ? (
                  <TableRow><TableCell colSpan={isSuperAdmin ? 4 : 3} className="text-center py-4"><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                ) : (
                  provincesData?.data?.map(p => {
                    const colors: string[] = Array.isArray((p as unknown as { flagColors?: string[] }).flagColors)
                      ? (p as unknown as { flagColors: string[] }).flagColors
                      : p.themeAccentColor ? [p.themeAccentColor] : [];
                    return (
                      <TableRow
                        key={p.id}
                        className={isSuperAdmin ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
                        onClick={() => isSuperAdmin && openEditProvince(p)}
                      >
                        <TableCell>
                          {p.flagUrl
                            ? <img src={p.flagUrl} alt="flag" className="h-6 w-12 object-contain border rounded-sm bg-muted" />
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="font-medium">{p.provinceName}</TableCell>
                        <TableCell>
                          {colors.length > 0 ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {colors.map((c, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <div className="w-5 h-5 rounded-sm border shadow-sm" style={{ backgroundColor: c }} title={c} />
                                  <span className="text-xs text-muted-foreground font-mono hidden sm:inline">{c}</span>
                                </div>
                              ))}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        {isSuperAdmin && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => openEditProvince(p)}>
                              <Pencil className="w-3 h-3 mr-1" /> Edit Branding
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
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
                    <TableRow
                      key={d.id}
                      className={isSuperAdmin ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
                      onClick={() => isSuperAdmin && openEditDistrict(d as District)}
                    >
                      <TableCell className="font-medium">{d.districtName}</TableCell>
                      <TableCell>{d.districtCode ?? "—"}</TableCell>
                      {isSuperAdmin && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
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
          <div className="flex gap-4 flex-wrap items-center justify-between">
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
            {isSuperAdmin && selectedDistrict && (
              <Button onClick={() => { setAddFacilityForm({ facilityName: "", facilityType: "", address: "" }); setShowAddFacility(true); }}>
                <Plus className="w-4 h-4 mr-2" /> Add Facility
              </Button>
            )}
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
                ) : facilitiesData?.data?.length === 0 ? (
                  <TableRow><TableCell colSpan={isSuperAdmin ? 4 : 3} className="text-center py-8 text-muted-foreground">No facilities found in this district.</TableCell></TableRow>
                ) : (
                  facilitiesData?.data?.map(f => (
                    <TableRow
                      key={f.id}
                      className={isSuperAdmin ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
                      onClick={() => isSuperAdmin && openEditFacility(f as Facility)}
                    >
                      <TableCell className="font-medium">{f.facilityName}</TableCell>
                      <TableCell>{f.facilityType ?? "—"}</TableCell>
                      <TableCell>{f.address ?? "—"}</TableCell>
                      {isSuperAdmin && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditFacility(f as Facility)}>
                              <Pencil className="w-3 h-3 mr-1" /> Edit
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteFacility(f as Facility)}>
                              <Trash2 className="w-3 h-3 mr-1" /> Delete
                            </Button>
                          </div>
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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Branding — {editProvince.provinceName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="space-y-1">
                <Label htmlFor="flagUrl">Flag Image URL</Label>
                <Input
                  id="flagUrl"
                  placeholder="https://example.com/flag.png"
                  value={editProvinceForm.flagUrl}
                  onChange={(e) => setEditProvinceForm(f => ({ ...f, flagUrl: e.target.value }))}
                />
                {editProvinceForm.flagUrl && (
                  <img src={editProvinceForm.flagUrl} alt="preview" className="h-8 w-14 object-contain border rounded-sm mt-1 bg-muted" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Flag Colors</Label>
                  {editProvinceForm.flagColors.length < 8 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setEditProvinceForm(f => ({ ...f, flagColors: [...f.flagColors, "#000000"] }))}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add Color
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Add all colors that appear on the provincial flag. Up to 8 colors.</p>

                {editProvinceForm.flagColors.length === 0 ? (
                  <div className="border border-dashed rounded-lg p-4 text-center text-sm text-muted-foreground">
                    No colors set. Click "Add Color" to begin.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editProvinceForm.flagColors.map((color, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => {
                            const updated = [...editProvinceForm.flagColors];
                            updated[i] = e.target.value;
                            setEditProvinceForm(f => ({ ...f, flagColors: updated }));
                          }}
                          className="h-9 w-12 rounded border cursor-pointer bg-transparent p-0.5"
                        />
                        <Input
                          value={color}
                          placeholder="#000000"
                          maxLength={7}
                          className="font-mono text-sm flex-1"
                          onChange={(e) => {
                            const val = e.target.value;
                            const updated = [...editProvinceForm.flagColors];
                            updated[i] = val;
                            setEditProvinceForm(f => ({ ...f, flagColors: updated }));
                          }}
                        />
                        <div className="w-8 h-8 rounded border shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                          onClick={() => {
                            const updated = editProvinceForm.flagColors.filter((_, idx) => idx !== i);
                            setEditProvinceForm(f => ({ ...f, flagColors: updated }));
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {editProvinceForm.flagColors.length > 0 && (
                  <div className="flex items-center gap-1 pt-1">
                    <span className="text-xs text-muted-foreground mr-1">Preview:</span>
                    <div className="flex rounded overflow-hidden border h-6 flex-1">
                      {editProvinceForm.flagColors.map((c, i) => (
                        <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                )}
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

      {isSuperAdmin && showAddFacility && (
        <Dialog open={showAddFacility} onOpenChange={(open) => { if (!open) setShowAddFacility(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Facility</DialogTitle>
              <DialogDescription>
                Create a new facility in the selected district.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="newFacilityName">Facility Name <span className="text-destructive">*</span></Label>
                <Input
                  id="newFacilityName"
                  placeholder="e.g. District Government Office"
                  value={addFacilityForm.facilityName}
                  onChange={(e) => setAddFacilityForm(f => ({ ...f, facilityName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="newFacilityType">Facility Type</Label>
                <Input
                  id="newFacilityType"
                  placeholder="e.g. Hospital, School, Government Office"
                  value={addFacilityForm.facilityType}
                  onChange={(e) => setAddFacilityForm(f => ({ ...f, facilityType: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="newFacilityAddress">Address</Label>
                <Input
                  id="newFacilityAddress"
                  placeholder="e.g. Main Street, Town"
                  value={addFacilityForm.address}
                  onChange={(e) => setAddFacilityForm(f => ({ ...f, address: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddFacility(false)}>Cancel</Button>
              <Button onClick={handleAddFacility} disabled={saving || !addFacilityForm.facilityName.trim()}>{saving ? "Creating..." : "Create Facility"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isSuperAdmin && deleteFacility && (
        <Dialog open={!!deleteFacility} onOpenChange={(open) => { if (!open) setDeleteFacility(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Facility</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{deleteFacility.facilityName}</strong>? This action cannot be undone. Assets assigned to this facility will lose their facility assignment.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteFacility(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteFacility} disabled={saving}>{saving ? "Deleting..." : "Delete Facility"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
