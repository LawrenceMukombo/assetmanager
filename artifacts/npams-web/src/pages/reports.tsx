import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Printer, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
import { apiFetch } from "@/lib/api-fetch";
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
      const res = await apiFetch("/api/v1/reports/assets");
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
      const res = await apiFetch("/api/v1/reports/summary");
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
      const res = await apiFetch("/api/v1/reports/summary");
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
      const res = await apiFetch("/api/v1/reports/assets");
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
