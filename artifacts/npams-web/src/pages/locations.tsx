import { useState } from "react";
import { useGetProvinces, getGetProvincesQueryKey, useGetDistrictsByProvince, getGetDistrictsByProvinceQueryKey, useGetFacilitiesByDistrict, getGetFacilitiesByDistrictQueryKey } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Locations() {
  const [selectedProvince, setSelectedProvince] = useState<string>("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");

  const { data: provincesData, isLoading: pLoading } = useGetProvinces({ query: { queryKey: getGetProvincesQueryKey() } });
  
  const { data: districtsData, isLoading: dLoading } = useGetDistrictsByProvince(selectedProvince, {
    query: { enabled: !!selectedProvince, queryKey: getGetDistrictsByProvinceQueryKey(selectedProvince) }
  });

  const { data: facilitiesData, isLoading: fLoading } = useGetFacilitiesByDistrict(selectedDistrict, {
    query: { enabled: !!selectedDistrict, queryKey: getGetFacilitiesByDistrictQueryKey(selectedDistrict) }
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Locations Explorer</h2>
        <p className="text-muted-foreground">Browse provinces, districts, and facilities.</p>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {pLoading ? <TableRow><TableCell colSpan={3} className="text-center py-4">Loading...</TableCell></TableRow> : 
                  provincesData?.data?.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{p.flagUrl ? <img src={p.flagUrl} alt="flag" className="h-6 w-10 object-cover border" /> : "-"}</TableCell>
                      <TableCell className="font-medium">{p.provinceName}</TableCell>
                      <TableCell>
                        {p.themeAccentColor ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: `hsl(${p.themeAccentColor})` }} />
                            <span className="text-xs text-muted-foreground">{p.themeAccentColor}</span>
                          </div>
                        ) : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                }
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedProvince ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">Select a province to view districts.</TableCell></TableRow>
                ) : dLoading ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-4">Loading...</TableCell></TableRow>
                ) : districtsData?.data?.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.districtName}</TableCell>
                      <TableCell>{d.districtCode || "-"}</TableCell>
                    </TableRow>
                  ))
                }
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="facilities" className="mt-6 space-y-4">
          <div className="flex gap-4">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedDistrict ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Select a district to view facilities.</TableCell></TableRow>
                ) : fLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-4">Loading...</TableCell></TableRow>
                ) : facilitiesData?.data?.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.facilityName}</TableCell>
                      <TableCell>{f.facilityType || "-"}</TableCell>
                      <TableCell>{f.address || "-"}</TableCell>
                    </TableRow>
                  ))
                }
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}