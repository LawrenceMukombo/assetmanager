import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Printer, RefreshCw, FileDown, MapPin, X, TrendingDown, AlertTriangle, Wrench, Boxes, ShoppingCart, MapPinned, Activity, FileBarChart } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
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

let crestDataUrlCache: string | null = null;
async function loadCrestDataUrl(): Promise<string | null> {
  if (crestDataUrlCache) return crestDataUrlCache;
  try {
    const base = import.meta.env.BASE_URL ?? "/";
    const res = await fetch(`${base}agencies/pngica.svg`);
    if (!res.ok) return null;
    const svgText = await res.text();
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("no 2d context"));
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = svgUrl;
    });
    crestDataUrlCache = dataUrl;
    return dataUrl;
  } catch {
    return null;
  }
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

  const fetchAndExportGeneric = async (endpoint: string, filename: string, label: string) => {
    try {
      const res = await apiFetch(`/api/v1/reports/${endpoint}${locationParams}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to fetch");
      const items: Record<string, unknown>[] = body.data?.items ?? body.data ?? [];
      if (!Array.isArray(items) || items.length === 0) {
        toast({ title: `No ${label.toLowerCase()} data` });
        return;
      }
      downloadCSV(items, filename);
      toast({ title: `${label} exported`, description: `${items.length} rows` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast({ variant: "destructive", title: `${label} export failed`, description: msg });
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

  const buildAssetRegisterPdf = async (items: AssetReportRow[]): Promise<jsPDF> => {
    const crestDataUrl = await loadCrestDataUrl();

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const generatedLine = `Generated: ${new Date().toLocaleDateString("en-PG", { year: "numeric", month: "long", day: "numeric" })}${user?.full_name ? `   |   Prepared by: ${user.full_name}` : ""}`;

    autoTable(doc, {
      startY: 90,
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
      headStyles: { fillColor: [15, 76, 129], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [240, 246, 252] },
      margin: { left: 30, right: 30, top: 90, bottom: 50 },
      didDrawPage: () => {
        if (crestDataUrl) {
          try { doc.addImage(crestDataUrl, "PNG", 30, 22, 48, 48); } catch { /* ignore */ }
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(15, 76, 129);
        doc.text("ICSA — Asset Register", pageWidth / 2, 44, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(generatedLine, pageWidth / 2, 62, { align: "center" });
        doc.setTextColor(0);

        const pageCount = doc.getNumberOfPages();
        const pageNum = doc.getCurrentPageInfo().pageNumber;
        doc.setDrawColor(15, 76, 129);
        doc.setLineWidth(0.5);
        doc.line(30, pageHeight - 30, pageWidth - 30, pageHeight - 30);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text("ICSA — Immigration & Citizenship Service Authority", 30, pageHeight - 18);
        doc.text(`Page ${pageNum} of ${pageCount}`, pageWidth - 30, pageHeight - 18, { align: "right" });
        doc.setTextColor(0);
      },
    });

    // Re-stamp page numbers now that totals are known
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFillColor(255, 255, 255);
      doc.rect(pageWidth - 110, pageHeight - 28, 80, 14, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - 30, pageHeight - 18, { align: "right" });
      doc.setTextColor(0);
    }

    return doc;
  };

  const handlePrint = async () => {
    setLoadingAssets(true);
    try {
      // Use the data already loaded in the print preview if available; otherwise fetch.
      let items = reportData ?? null;
      if (!items) {
        const res = await apiFetch(`/api/v1/reports/assets${locationParams}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Failed to fetch");
        items = body.data?.items ?? body.data ?? [];
      }
      if (!items || items.length === 0) {
        toast({ title: "No assets to print" });
        return;
      }

      const doc = await buildAssetRegisterPdf(items);
      doc.autoPrint();

      // Open the branded PDF in a new tab and trigger the print dialog.
      // This guarantees the printout matches the PDF (crest, footer, page numbers).
      const blobUrl = doc.output("bloburl");
      const win = window.open(blobUrl, "_blank");
      if (!win) {
        toast({
          variant: "destructive",
          title: "Popup blocked",
          description: "Allow pop-ups for this site to open the print preview.",
        });
        return;
      }
      toast({ title: "Print preview opened", description: `${items.length} assets` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Print failed";
      toast({ variant: "destructive", title: "Print failed", description: msg });
    } finally {
      setLoadingAssets(false);
    }
  };

  const downloadPDF = async () => {
    setLoadingAssets(true);
    try {
      const res = await apiFetch(`/api/v1/reports/assets${locationParams}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to fetch");
      const items: AssetReportRow[] = body.data?.items ?? body.data ?? [];
      if (items.length === 0) { toast({ title: "No assets found" }); return; }

      const doc = await buildAssetRegisterPdf(items);
      doc.save("ICSA_Asset_Register.pdf");
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
      <PageHeader
        icon={<FileBarChart className="w-5 h-5" />}
        title="Reports & Exports"
        subtitle="Generate, preview, and download asset reports."
        breadcrumbs={[{ label: "Reports" }]}
      />

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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Asset Condition Summary
            </CardTitle>
            <CardDescription>Counts and value broken down by condition and status.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full justify-start" onClick={() => fetchAndExportGeneric("condition-summary", "asset_condition_summary.csv", "Condition summary")}>
              <Download className="w-4 h-4 mr-2" /> Export Condition Summary (CSV)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-primary" /> Depreciation Schedule
            </CardTitle>
            <CardDescription>Per-asset book value and accumulated depreciation (straight-line).</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full justify-start" onClick={() => fetchAndExportGeneric("depreciation", "asset_depreciation.csv", "Depreciation report")}>
              <Download className="w-4 h-4 mr-2" /> Export Depreciation (CSV)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-primary" /> Stock On Hand
            </CardTitle>
            <CardDescription>Current quantities and value by item × location.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full justify-start" onClick={() => fetchAndExportGeneric("stock-on-hand", "stock_on_hand.csv", "Stock on hand")}>
              <Download className="w-4 h-4 mr-2" /> Export Stock On Hand (CSV)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-primary" /> Low-Stock Alerts
            </CardTitle>
            <CardDescription>Items at or below their reorder threshold by location.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full justify-start" onClick={() => fetchAndExportGeneric("low-stock", "low_stock_alerts.csv", "Low-stock report")}>
              <Download className="w-4 h-4 mr-2" /> Export Low-Stock (CSV)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" /> Purchase Requests
            </CardTitle>
            <CardDescription>Status breakdown of all purchase requests in your scope.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full justify-start" onClick={() => fetchAndExportGeneric("purchase-requests-status", "purchase_requests_status.csv", "Purchase requests")}>
              <Download className="w-4 h-4 mr-2" /> Export PR Status (CSV)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-primary" /> Maintenance Due
            </CardTitle>
            <CardDescription>Assets under maintenance or with warranty expiring in the next 90 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full justify-start" onClick={() => fetchAndExportGeneric("maintenance-due", "maintenance_due.csv", "Maintenance due")}>
              <Download className="w-4 h-4 mr-2" /> Export Maintenance Due (CSV)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="w-5 h-5 text-primary" /> Assets by Location
            </CardTitle>
            <CardDescription>Asset counts and value grouped by facility, with GPS coordinates.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full justify-start" onClick={() => fetchAndExportGeneric("assets-by-location", "assets_by_location.csv", "Assets by location")}>
              <Download className="w-4 h-4 mr-2" /> Export Locations (CSV)
            </Button>
          </CardContent>
        </Card>
      </div>

      {reportData !== null && (
        <div className="space-y-4">
          <div className="flex items-center justify-between print:hidden">
            <h3 className="text-lg font-semibold">Asset Register Preview</h3>
            <span className="text-sm text-muted-foreground">{reportData.length} assets</span>
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
      )}

    </div>
  );
}
