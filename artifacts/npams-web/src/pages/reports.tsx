import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";

export default function Reports() {
  const { user } = useAuth();
  const isNational = user?.scope_level === "national";
  const { toast } = useToast();


  // Simplified approach for button clicks
  const triggerExportAssets = async () => {
    try {
      toast({ title: "Generating CSV...", description: "Please wait." });
      const res = await fetch("/api/v1/reports/assets", { 
        headers: { "Authorization": `Bearer ${localStorage.getItem('npams_token')}` }
      });
      const data = await res.json();
      if(data.success && data.data?.items) {
        const csv = Papa.unparse(data.data.items);
        downloadFile(csv, "asset_register.csv", "text/csv");
        toast({ title: "Export complete" });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Export failed" });
    }
  };

  const triggerExportSummary = async () => {
    try {
      toast({ title: "Generating Summary CSV..." });
      const res = await fetch("/api/v1/reports/summary", { 
        headers: { "Authorization": `Bearer ${localStorage.getItem('npams_token')}` }
      });
      const data = await res.json();
      if(data.success && data.data) {
        const csv = Papa.unparse(data.data);
        downloadFile(csv, "asset_summary.csv", "text/csv");
        toast({ title: "Export complete" });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Export failed" });
    }
  };

  const downloadFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Reports & Exports</h2>
        <p className="text-muted-foreground">Generate and download asset reports.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Asset Register</CardTitle>
            <CardDescription>Full export of all accessible assets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start" onClick={triggerExportAssets}>
              <Download className="w-4 h-4 mr-2" /> Export to CSV
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" /> Print Summary
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Summary Report</CardTitle>
            <CardDescription>Aggregated metrics by category and status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start" onClick={triggerExportSummary}>
              <Download className="w-4 h-4 mr-2" /> Export Summary (CSV)
            </Button>
          </CardContent>
        </Card>

        {isNational && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Provincial Comparison</CardTitle>
              <CardDescription>Compare asset metrics across all provinces.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start" onClick={triggerExportSummary}>
                <Download className="w-4 h-4 mr-2" /> Export Comparison (CSV)
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      
      <div className="hidden print-area p-8">
        <h1 className="text-2xl font-bold mb-4">NPAMS Asset Summary Report</h1>
        <p>Generated on {new Date().toLocaleDateString()}</p>
        <p className="mt-4">Please download the CSV for the full data set.</p>
      </div>
    </div>
  );
}