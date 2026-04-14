import { useState, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Printer, RefreshCw, FileDown, MapPin, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { apiFetch, apiFetchJson } from "@/lib/api-fetch";
import { statusBadgeClass } from "@/lib/status";

interface AssetReportRow {
  asset_tag?: string;
  asset_name?: string;
  serial_number?: string;
  brand?: string;
  model?: string;
  status?: string;
  condition?: string;
  purchase_date?: string;
  purchase_cost?: string | number;
  supplier?: string;
  warranty_expiry?: string;
  useful_life_years?: number;
  created_at?: string;
  category_name?: string;
  province_name?: string;
  district_name?: string;
  facility_name?: string;
}

interface SummaryRow {
  province?: string;
  total_assets?: number;
  total_value?: number | string;
  active?: number;
  disposed?: number;
  missing?: number;
}

export default function Reports() {
  const { user } = useAuth();
  const isNational = user?.scope_level === "national";
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [reportData, setReportData] = useState<AssetReportRow[] | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryRow[] | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Location scope state (national users only)
  const [regionName, setRegionName] = useState("");
  const [provinceId, setProvinceId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [facilityId, setFacilityId] = useState("");

  const { data: regionsData } = useQuery({
    queryKey: ["regions-list"],
    queryFn: () => apiFetchJson("/api/v1/locations/regions"),
    staleTime: 600_000,
    enabled: isNational,
  });

  const { data: provincesData } = useQuery({
    queryKey: ["provinces-list"],
    queryFn: () => apiFetchJson("/api/v1/locations/provinces"),
    staleTime: 600_000,
    enabled: isNational,
  });

  const { data: districtsData } = useQuery({
    queryKey: ["districts-list", provinceId],
    queryFn: () => apiFetchJson(`/api/v1/locations/provinces/${provinceId}/districts`),
    staleTime: 600_000,
    enabled: !!provinceId,
  });

  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities-list", districtId],
    queryFn: () => apiFetchJson(`/api/v1/locations/districts/${districtId}/facilities`),
    staleTime: 600_000,
    enabled: !!districtId,
  });

  type RegionEntry = { name: string; provinces: { id: string; provinceName: string; provinceCode: string }[] };
  type ProvRow = { id: string; provinceName: string; provinceCode?: string };
  type DistRow = { id: string; districtName: string };
  type FacRow  = { id: string; facilityName: string };

  const regionsList: RegionEntry[] = (regionsData?.data as RegionEntry[]) ?? [];
  const allProvinces: ProvRow[] = (provincesData?.data as ProvRow[]) ?? [];
  const districtsList: DistRow[] = (districtsData?.data as DistRow[]) ?? [];
  const facilitiesList: FacRow[] = (facilitiesData?.data as FacRow[]) ?? [];

  const filteredProvinces = useMemo(() => {
    if (!regionName) return allProvinces;
    const rEntry = regionsList.find(r => r.name === regionName);
    if (!rEntry) return allProvinces;
    const codes = new Set(rEntry.provinces.map(p => p.provinceCode));
    return allProvinces.filter(p => codes.has(p.provinceCode ?? ""));
  }, [allProvinces, regionsList, regionName]);

  // Build location query string for API calls
  const locationParams = useMemo(() => {
    const p = new URLSearchParams();
    if (provinceId) p.set("province_id", provinceId);
    if (districtId) p.set("district_id", districtId);
    if (facilityId) p.set("facility_id", facilityId);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [provinceId, districtId, facilityId]);

  const hasLocationScope = !!(regionName || provinceId || districtId || facilityId);

  const resetLocation = () => {
    setRegionName(""); setProvinceId(""); setDistrictId(""); setFacilityId("");
  };


  const downloadCSV = (data: object[], filename: string) => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fetchAndExportAssets = async () => {
    setLoadingAssets(true);
    try {
      const res = await apiFetch(`/api/v1/reports/assets${locationParams}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to fetch");
      const items: AssetReportRow[] = body.data?.items ?? body.data ?? [];
      setReportData(items);
      if (items.length === 0) {
        toast({ title: "No assets found for export" });
        return;
      }
      downloadCSV(items, "asset_register.csv");
      toast({ title: "Asset register exported", description: `${items.length} assets` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast({ variant: "destructive", title: "Export failed", description: msg });
    } finally {
      setLoadingAssets(false);
    }
  };

  const fetchAndExportSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await apiFetch(`/api/v1/reports/summary${locationParams}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to fetch");
      const rows: SummaryRow[] = Array.isArray(body.data) ? body.data : [body.data];
      setSummaryData(rows);
      if (rows.length === 0) {
        toast({ title: "No summary data available" });
        return;
      }
      downloadCSV(rows, "asset_summary.csv");
      toast({ title: "Summary exported" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast({ variant: "destructive", title: "Export failed", description: msg });
    } finally {
      setLoadingSummary(false);
    }
  };

  const fetchAndExportProvinceComparison = async () => {
    setLoadingSummary(true);
    try {
      const res = await apiFetch(`/api/v1/reports/summary${locationParams}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to fetch");
      const rows: SummaryRow[] = Array.isArray(body.data) ? body.data : [body.data];
      setSummaryData(rows);
      if (rows.length === 0) {
        toast({ title: "No province data available" });
        return;
      }
      downloadCSV(rows, "province_comparison.csv");
      toast({ title: "Province comparison exported" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast({ variant: "destructive", title: "Export failed", description: msg });
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadPreviewData = async () => {
    setLoadingAssets(true);
    try {
      const res = await apiFetch(`/api/v1/reports/assets${locationParams}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to fetch");
      const items: AssetReportRow[] = body.data?.items ?? body.data ?? [];
      setReportData(items);
      toast({ title: "Preview loaded", description: `${items.length} assets` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Load failed";
      toast({ variant: "destructive", title: "Load failed", description: msg });
    } finally {
      setLoadingAssets(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const downloadPDF = async () => {
    setLoadingAssets(true);
    try {
      const res = await apiFetch(`/api/v1/reports/assets${locationParams}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to fetch");
      const items: AssetReportRow[] = body.data?.items ?? body.data ?? [];
      if (items.length === 0) { toast({ title: "No assets found" }); return; }

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("NPAMS — National Asset Register", pageWidth / 2, 40, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(
        `Generated: ${new Date().toLocaleDateString("en-PG", { year: "numeric", month: "long", day: "numeric" })}${user?.full_name ? `   |   Prepared by: ${user.full_name}` : ""}`,
        pageWidth / 2, 56, { align: "center" }
      );
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 70,
        head: [["Asset Name", "Tag", "Category", "Status", "Condition", "Province", "Facility", "Purchase Cost"]],
        body: items.map(row => [
          row.asset_name ?? "—",
          row.asset_tag ?? "—",
          row.category_name ?? "—",
          (row.status ?? "—").replace(/_/g, " "),
          row.condition ?? "—",
          row.province_name ?? "—",
          row.facility_name ?? row.district_name ?? "—",
          formatCurrency(row.purchase_cost),
        ]),
        styles: { fontSize: 7.5, cellPadding: 4 },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 255] },
        margin: { left: 30, right: 30 },
      });

      doc.save("NPAMS_Asset_Register.pdf");
      toast({ title: "PDF exported", description: `${items.length} assets` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast({ variant: "destructive", title: "PDF export failed", description: msg });
    } finally {
      setLoadingAssets(false);
    }
  };

  const formatCurrency = (val?: string | number) => {
    if (!val) return "—";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return val as string;
    return `PGK ${num.toLocaleString("en-PG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Reports & Exports</h2>
        <p className="text-muted-foreground">Generate, preview, and download asset reports.</p>
      </div>

      {/* Location Scope Filter — national users only */}
      {isNational && (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground shrink-0">
              <MapPin className="w-4 h-4" /> Report Scope
            </div>

            <Select value={regionName || "_none"} onValueChange={v => { if (v === "_none") { setRegionName(""); setProvinceId(""); setDistrictId(""); setFacilityId(""); } else { setRegionName(v); setProvinceId(""); setDistrictId(""); setFacilityId(""); } }}>
              <SelectTrigger className="h-8 w-[150px] text-sm"><SelectValue placeholder="All Regions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">All Regions</SelectItem>
                {regionsList.map(r => <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={provinceId || "_none"} onValueChange={v => { if (v === "_none") { setProvinceId(""); setDistrictId(""); setFacilityId(""); } else { setProvinceId(v); setDistrictId(""); setFacilityId(""); } }}>
              <SelectTrigger className="h-8 w-[190px] text-sm"><SelectValue placeholder="All Provinces" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">All Provinces</SelectItem>
                {filteredProvinces.map(p => <SelectItem key={p.id} value={p.id}>{p.provinceName}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={districtId || "_none"} onValueChange={v => { if (v === "_none") { setDistrictId(""); setFacilityId(""); } else { setDistrictId(v); setFacilityId(""); } }} disabled={!provinceId}>
              <SelectTrigger className="h-8 w-[180px] text-sm"><SelectValue placeholder={!provinceId ? "Select province first" : "All Districts"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">All Districts</SelectItem>
                {districtsList.map(d => <SelectItem key={d.id} value={d.id}>{d.districtName}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={facilityId || "_none"} onValueChange={v => { if (v === "_none") { setFacilityId(""); } else { setFacilityId(v); } }} disabled={!districtId}>
              <SelectTrigger className="h-8 w-[180px] text-sm"><SelectValue placeholder={!districtId ? "Select district first" : "All Facilities"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">All Facilities</SelectItem>
                {facilitiesList.map(f => <SelectItem key={f.id} value={f.id}>{f.facilityName}</SelectItem>)}
              </SelectContent>
            </Select>

            {hasLocationScope && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={resetLocation}>
                <X className="w-3 h-3 mr-1" /> Reset
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Asset Register
            </CardTitle>
            <CardDescription>Full export of all accessible assets with status and location.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start" onClick={fetchAndExportAssets} disabled={loadingAssets}>
              <Download className="w-4 h-4 mr-2" /> {loadingAssets ? "Exporting..." : "Export to CSV"}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={downloadPDF}
              disabled={loadingAssets}
            >
              <FileDown className="w-4 h-4 mr-2" />
              {loadingAssets ? "Generating..." : "Export to PDF"}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={loadPreviewData}
              disabled={loadingAssets}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingAssets ? "animate-spin" : ""}`} />
              {loadingAssets ? "Loading..." : "Load Print Preview"}
            </Button>
            {reportData !== null && (
              <Button variant="outline" className="w-full justify-start print:hidden" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" /> Print Report
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Summary Report
            </CardTitle>
            <CardDescription>Aggregated metrics by category, status, and location.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start" onClick={fetchAndExportSummary} disabled={loadingSummary}>
              <Download className="w-4 h-4 mr-2" /> {loadingSummary ? "Exporting..." : "Export Summary (CSV)"}
            </Button>
          </CardContent>
        </Card>

        {isNational && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" /> Province Comparison
              </CardTitle>
              <CardDescription>Compare asset metrics and values across all 22 provinces.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full justify-start"
                onClick={fetchAndExportProvinceComparison}
                disabled={loadingSummary}
              >
                <Download className="w-4 h-4 mr-2" />
                {loadingSummary ? "Exporting..." : "Export Comparison (CSV)"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {reportData !== null && (
        <div ref={printRef} className="space-y-4">
          <div className="flex items-center justify-between print:hidden">
            <h3 className="text-lg font-semibold">Asset Register Preview</h3>
            <span className="text-sm text-muted-foreground">{reportData.length} assets</span>
          </div>

          <div className="print-area">
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-bold">NPAMS — Asset Register Report</h1>
              <p className="text-sm text-muted-foreground">
                Generated: {new Date().toLocaleDateString("en-PG", { year: "numeric", month: "long", day: "numeric" })}
                {user?.full_name ? ` | Prepared by: ${user.full_name}` : ""}
              </p>
            </div>

            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset Name</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Province</TableHead>
                    <TableHead>Facility</TableHead>
                    <TableHead>Purchase Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No assets found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    reportData.map((row, i) => (
                      <TableRow key={row.asset_tag ?? i}>
                        <TableCell className="font-medium">{row.asset_name ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{row.asset_tag ?? "—"}</TableCell>
                        <TableCell>{row.category_name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge className={`capitalize ${statusBadgeClass(row.status)}`}>
                            {row.status?.replace("_", " ") ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>{row.province_name ?? "—"}</TableCell>
                        <TableCell>{row.facility_name ?? row.district_name ?? "—"}</TableCell>
                        <TableCell>{formatCurrency(row.purchase_cost)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body > * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: fixed; left: 0; top: 0; width: 100%; z-index: 9999; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
        }
      `}</style>
    </div>
  );
}
