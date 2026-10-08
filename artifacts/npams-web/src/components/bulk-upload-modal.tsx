import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetchJson } from "@/lib/api-fetch";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useOrganization } from "@/context/organization-context";

export type BulkUploadEntityType = "assets" | "categories" | "locations" | "users";

interface BulkUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: BulkUploadEntityType;
  onSuccess?: () => void;
}

interface TemplateConfig {
  title: string;
  description: string;
  filename: string;
  endpoint: string;
  headers: string[];
  sampleRows: string[][];
  helpText: string;
}

const TEMPLATES: Record<BulkUploadEntityType, TemplateConfig> = {
  assets: {
    title: "Batch Upload Assets",
    description: "Upload multiple assets at once from a CSV file. Existing asset tags will be safely updated (upsert).",
    filename: "assets-template.csv",
    endpoint: "/api/v1/assets/bulk",
    headers: [
      "asset_tag",
      "asset_name",
      "category_code",
      "brand",
      "model",
      "serial_number",
      "purchase_cost",
      "purchase_date",
      "useful_life_years",
      "status",
      "condition",
      "facility_name",
      "supplier",
      "notes",
    ],
    sampleRows: [
      [
        "MED-XRAY-001",
        "Digital X-Ray Diagnostic Unit",
        "MED",
        "Siemens Healthineers",
        "Multix Impact",
        "SN-XRAY-88392",
        "65000",
        "2023-03-15",
        "10",
        "active",
        "excellent",
        "University Teaching Hospital",
        "Siemens Africa",
        "Main Radiology Department Wing B",
      ],
      [
        "VEH-AMB-004",
        "Toyota Land Cruiser 4x4 Ambulance",
        "VEH",
        "Toyota",
        "HZJ78 Hardtop",
        "JTEBZ71J80012345",
        "82000",
        "2022-11-20",
        "8",
        "active",
        "good",
        "Lusaka District Health Hub",
        "Toyota Zambia",
        "Rapid emergency response vehicle",
      ],
      [
        "ICT-SRV-012",
        "Health Information System Server",
        "ICT",
        "Dell",
        "PowerEdge R750",
        "DL-SRV-99120",
        "18500",
        "2023-01-10",
        "6",
        "active",
        "excellent",
        "National Health Data Centre",
        "Dell Technologies",
        "Primary Electronic Health Record server",
      ],
    ],
    helpText: "Asset tags must be unique. Categories can be specified by category code (e.g. MED, VEH, ICT) or category name.",
  },
  categories: {
    title: "Batch Upload Asset Categories",
    description: "Import asset categories and classifications with industry sector tags.",
    filename: "categories-template.csv",
    endpoint: "/api/v1/categories/bulk",
    headers: ["category_name", "category_code", "industry", "description", "accent_color"],
    sampleRows: [
      ["Medical & Laboratory Equipment", "MED", "Healthcare & Medical Services", "Diagnostic instruments, surgical units, analyzers", "#10B981"],
      ["Pharmaceutical Cold Chain Units", "COLD", "Healthcare & Medical Services", "Vaccine refrigerators, cold boxes, temperature loggers", "#06B6D4"],
      ["Patient Transport & Ambulances", "AMB", "Healthcare & Medical Services", "Emergency ambulances, mobile clinic vehicles", "#3B82F6"],
      ["Office Computing & Workstations", "ICT", "Technology & Telecommunications", "Laptops, desktop computers, monitors, accessories", "#6366F1"],
    ],
    helpText: "Category codes should be 2 to 5 uppercase letters. Industry sectors help group related assets.",
  },
  locations: {
    title: "Batch Upload Facilities & Sites",
    description: "Import operational facilities, hospitals, clinics, and offices linked to provinces and districts.",
    filename: "facilities-template.csv",
    endpoint: "/api/v1/locations/facilities/bulk",
    headers: ["facility_name", "facility_type", "province_name", "district_name", "address", "contact_phone", "contact_email"],
    sampleRows: [
      ["University Teaching Hospital", "Referral Hospital", "Lusaka", "Lusaka Central", "Nationalist Road, Ridgeway, Lusaka", "+260 211 254113", "admin@uth.gov.zm"],
      ["Levy Mwanawasa University Hospital", "General Hospital", "Lusaka", "Lusaka East", "Great East Road, Lusaka", "+260 211 281001", "info@levyhospital.gov.zm"],
      ["Ndola Teaching Hospital", "Referral Hospital", "Copperbelt", "Ndola", "Broadway Avenue, Ndola", "+260 212 611555", "admin@nth.gov.zm"],
      ["Choma General Hospital", "District Hospital", "Southern", "Choma", "Livingstone Road, Choma", "+260 213 220021", "choma.hosp@moh.gov.zm"],
    ],
    helpText: "Province name and district name will automatically associate the facility with the territorial hierarchy.",
  },
  users: {
    title: "Batch Upload Users & Staff",
    description: "Import user accounts, personnel profiles, and assign administrative or operational roles.",
    filename: "users-template.csv",
    endpoint: "/api/v1/users/bulk",
    headers: ["full_name", "email", "role_name", "job_title", "department", "phone_number", "password"],
    sampleRows: [
      ["Dr. Florence Mwansa", "florence.mwansa@moh.gov.zm", "Asset Manager", "Chief Biomedical Engineer", "Clinical Engineering", "+260 977 123456", "AssetManager2026!"],
      ["Kelvin Chilufya", "kelvin.chilufya@moh.gov.zm", "Logistics Officer", "Supply Chain Specialist", "Procurement & Supplies", "+260 966 234567", "AssetManager2026!"],
      ["Chileshe Phiri", "chileshe.phiri@moh.gov.zm", "Facility Focal", "Hospital Administrator", "Administration", "+260 955 345678", "AssetManager2026!"],
      ["Audrey Banda", "audrey.banda@moh.gov.zm", "Auditor", "Internal Asset Auditor", "Internal Audit Directorate", "+260 971 456789", "AssetManager2026!"],
    ],
    helpText: "Roles available: Super Admin, Province Director, Asset Manager, Logistics Officer, Facility Focal, Auditor, Viewer.",
  },
};

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export function BulkUploadModal({ open, onOpenChange, entityType, onSuccess }: BulkUploadModalProps) {
  const { toast } = useToast();
  const { activeAgencyId, organization } = useOrganization();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [rawText, setRawText] = useState("");
  const [parsedItems, setParsedItems] = useState<Record<string, string>[]>([]);
  const [headersFound, setHeadersFound] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");

  const config = TEMPLATES[entityType];

  const handleDownloadTemplate = () => {
    const csvContent = [
      config.headers.join(","),
      ...config.sampleRows.map((r) => r.map((val) => `"${val.replace(/"/g, '""')}"`).join(",")),
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", config.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const processCsvText = (content: string) => {
    setRawText(content);
    const { headers, rows } = parseCsv(content);
    setHeadersFound(headers);

    const items: Record<string, string>[] = [];
    for (const row of rows) {
      if (row.every((cell) => cell === "")) continue;
      const item: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        item[headers[i]] = row[i] ?? "";
      }
      items.push(item);
    }
    setParsedItems(items);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result ?? "");
      processCsvText(text);
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    setRawText("");
    setParsedItems([]);
    setHeadersFound([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (parsedItems.length === 0) {
      toast({
        variant: "destructive",
        title: "No records to upload",
        description: "Please select or paste valid CSV records first.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: { items: Record<string, string>[]; agency_id?: string } = {
        items: parsedItems,
        ...(activeAgencyId && activeAgencyId !== "all" ? { agency_id: activeAgencyId } : {}),
      };

      const res = await apiFetchJson<{
        total: number;
        created: number;
        updated: number;
        failed: number;
        errors?: { row: number; error: string }[];
      }>(config.endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.ok && res.data) {
        toast({
          title: "Import Complete",
          description: `Successfully processed ${res.data.created} created, ${res.data.updated} updated${
            res.data.failed > 0 ? ` (${res.data.failed} failed)` : ""
          }.`,
        });
        handleClear();
        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        toast({
          variant: "destructive",
          title: "Import Error",
          description: res.message || "Failed to process bulk upload.",
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Network Error",
        description: err.message || "Failed to reach server.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">{config.title}</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {config.description}
                </DialogDescription>
              </div>
            </div>
            {activeAgencyId && activeAgencyId !== "all" && (
              <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                Target: {organization.organizationName}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Quick Action Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-lg border">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Format rule:</span> {config.helpText}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="gap-1.5 h-8 text-xs font-medium"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              Download Sample CSV
            </Button>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-2 border-b pb-2">
            <Button
              type="button"
              size="sm"
              variant={activeTab === "file" ? "default" : "ghost"}
              onClick={() => setActiveTab("file")}
              className="h-8 text-xs gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload CSV File
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeTab === "paste" ? "default" : "ghost"}
              onClick={() => setActiveTab("paste")}
              className="h-8 text-xs gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Paste CSV Text
            </Button>
          </div>

          {activeTab === "file" ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 hover:bg-accent/40 cursor-pointer transition-all duration-200"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="text-sm font-semibold">
                  Click to select CSV file or drag and drop here
                </div>
                <div className="text-xs text-muted-foreground">
                  Supports UTF-8 formatted CSV files with column headers
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                rows={6}
                value={rawText}
                onChange={(e) => processCsvText(e.target.value)}
                placeholder={`Paste your CSV content here, including headers. For example:\n${config.headers.join(",")}\n...`}
                className="font-mono text-xs"
              />
            </div>
          )}

          {/* Live Preview Table */}
          {parsedItems.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">Preview Parsed Records</span>
                  <Badge variant="secondary" className="text-xs">
                    {parsedItems.length} record{parsedItems.length === 1 ? "" : "s"} detected
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    ({headersFound.length} columns recognized)
                  </span>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={handleClear} className="h-7 text-xs text-muted-foreground">
                  Clear
                </Button>
              </div>

              <div className="rounded-md border overflow-x-auto max-h-60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12 text-xs">#</TableHead>
                      {headersFound.slice(0, 6).map((h) => (
                        <TableHead key={h} className="text-xs font-semibold capitalize">
                          {h.replace(/_/g, " ")}
                        </TableHead>
                      ))}
                      {headersFound.length > 6 && <TableHead className="text-xs">+{headersFound.length - 6} more</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedItems.slice(0, 5).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-mono text-muted-foreground">{idx + 1}</TableCell>
                        {headersFound.slice(0, 6).map((h) => (
                          <TableCell key={h} className="text-xs truncate max-w-48">
                            {row[h] || <span className="text-muted-foreground italic">empty</span>}
                          </TableCell>
                        ))}
                        {headersFound.length > 6 && (
                          <TableCell className="text-xs text-muted-foreground">...</TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsedItems.length > 5 && (
                <div className="text-[11px] text-muted-foreground text-center">
                  Showing first 5 of {parsedItems.length} records in preview. All records will be imported.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 border-t pt-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={parsedItems.length === 0 || isSubmitting}
            className="gap-2 min-w-32"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Import {parsedItems.length > 0 ? `${parsedItems.length} Records` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
