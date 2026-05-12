import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  MapPin, Tag, Building2, User, Calendar, DollarSign,
  CheckCircle, AlertTriangle, Clock, PackageX, Wrench, FileText,
  Shield, AlertCircle,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  under_maintenance: "Under Maintenance",
  disposed: "Disposed",
  missing: "Missing",
  inactive: "Inactive",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  under_maintenance: "#f59e0b",
  disposed: "#64748b",
  missing: "#ef4444",
  inactive: "#94a3b8",
};

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  active: CheckCircle,
  under_maintenance: Wrench,
  disposed: PackageX,
  missing: AlertTriangle,
  inactive: Clock,
};

const CONDITION_LABELS: Record<string, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  beyond_repair: "Beyond Repair",
};

const CONDITION_COLORS: Record<string, string> = {
  new: "#22c55e",
  good: "#3b82f6",
  fair: "#f59e0b",
  poor: "#f97316",
  beyond_repair: "#ef4444",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PG", { year: "numeric", month: "long", day: "numeric" });
}

function fmtCost(v: string | null | undefined) {
  if (!v) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  return `K ${n.toLocaleString("en-PG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PublicAsset {
  id: string;
  assetTag: string;
  assetName: string;
  serialNumber?: string | null;
  brand?: string | null;
  model?: string | null;
  status: string;
  condition: string;
  purchaseDate?: string | null;
  purchaseCost?: string | null;
  warrantyExpiry?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  category?: { id: string; categoryName: string } | null;
  province?: { id: string; provinceName: string; flagUrl?: string | null; themeAccentColor?: string | null } | null;
  district?: { id: string; districtName: string } | null;
  facility?: { id: string; facilityName: string } | null;
  assignedUser?: { id: string; fullName: string } | null;
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

export default function PublicAsset() {
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<PublicAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/public/assets/${id}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data) {
          setAsset(json.data);
        } else {
          setError(json.message || "Asset not found");
        }
      })
      .catch(() => setError("Failed to load asset information."))
      .finally(() => setLoading(false));
  }, [id]);

  const StatusIcon = asset ? (STATUS_ICONS[asset.status] ?? FileText) : FileText;
  const statusColor = asset ? (STATUS_COLORS[asset.status] ?? "#94a3b8") : "#94a3b8";
  const accent = asset?.province?.themeAccentColor ?? "#0F4C81";

  const warrantyOk = asset?.warrantyExpiry ? new Date(asset.warrantyExpiry) > new Date() : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 to-background">
      {/* Top banner */}
      <div className="border-b bg-white shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/agencies/pngica.png" alt="ICSA" className="w-9 h-9 rounded-sm object-contain bg-white p-0.5 border" />
          <div>
            <p className="text-xs text-muted-foreground font-medium">ICSA · Papua New Guinea</p>
            <p className="text-[10px] text-muted-foreground">PNG Immigration &amp; Citizenship Authority</p>
          </div>
          {asset?.province?.flagUrl && (
            <img
              src={asset.province.flagUrl}
              alt={asset.province.provinceName}
              className="ml-auto w-8 h-8 rounded-full object-cover border"
              style={{ borderColor: accent }}
            />
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {loading && (
          <Card>
            <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
            <CardContent className="space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </CardContent>
          </Card>
        )}

        {error && !loading && (
          <Card className="border-destructive/50">
            <CardContent className="py-10 flex flex-col items-center text-center gap-3">
              <AlertCircle className="w-12 h-12 text-destructive/60" />
              <p className="font-semibold text-destructive">Asset Not Found</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        )}

        {asset && !loading && (
          <>
            {/* Photo */}
            {asset.photoUrl && (
              <div className="rounded-xl overflow-hidden border aspect-video bg-muted">
                <img src={asset.photoUrl} alt={asset.assetName} className="w-full h-full object-cover" />
              </div>
            )}

            {/* Main card */}
            <Card className="overflow-hidden">
              <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl leading-tight">{asset.assetName}</CardTitle>
                    <p className="text-sm text-muted-foreground font-mono mt-1">{asset.assetTag}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge
                      className="gap-1 px-2.5 py-1 text-white text-xs"
                      style={{ backgroundColor: statusColor }}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {STATUS_LABELS[asset.status] ?? asset.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs capitalize">
                      {CONDITION_LABELS[asset.condition] ?? asset.condition}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-1 pt-0">
                <Separator className="mb-3" />

                {/* Identity */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-1">Asset Identity</p>
                {asset.category?.categoryName && (
                  <InfoRow icon={Tag} label="Category" value={asset.category.categoryName} />
                )}
                {asset.serialNumber && (
                  <InfoRow icon={FileText} label="Serial Number" value={asset.serialNumber} />
                )}
                {(asset.brand || asset.model) && (
                  <InfoRow icon={Shield} label="Brand / Model" value={[asset.brand, asset.model].filter(Boolean).join(" · ")} />
                )}

                <Separator className="my-3" />

                {/* Location */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-1">Location</p>
                {asset.province?.provinceName && (
                  <InfoRow icon={MapPin} label="Province" value={asset.province.provinceName} />
                )}
                {asset.district?.districtName && (
                  <InfoRow icon={Building2} label="District" value={asset.district.districtName} />
                )}
                {asset.facility?.facilityName && (
                  <InfoRow icon={Building2} label="Facility" value={asset.facility.facilityName} />
                )}
                {asset.assignedUser?.fullName && (
                  <InfoRow icon={User} label="Assigned To" value={asset.assignedUser.fullName} />
                )}

                <Separator className="my-3" />

                {/* Financial */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-1">Financial</p>
                {asset.purchaseCost && (
                  <InfoRow icon={DollarSign} label="Purchase Cost" value={fmtCost(asset.purchaseCost)} />
                )}
                {asset.purchaseDate && (
                  <InfoRow icon={Calendar} label="Purchase Date" value={fmtDate(asset.purchaseDate)} />
                )}
                {asset.warrantyExpiry && (
                  <div className="flex items-start gap-3 py-2.5">
                    <div className="flex-shrink-0 mt-0.5">
                      <Shield className={`w-4 h-4 ${warrantyOk ? "text-green-500" : "text-destructive"}`} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Warranty</p>
                      <p className="text-sm font-medium">
                        {fmtDate(asset.warrantyExpiry)}
                        <span className={`ml-2 text-xs font-semibold ${warrantyOk ? "text-green-600" : "text-destructive"}`}>
                          {warrantyOk ? "· In Warranty" : "· Expired"}
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {asset.notes && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-1">Notes</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{asset.notes}</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Last updated */}
            {asset.updatedAt && (
              <p className="text-center text-xs text-muted-foreground">
                Last updated {fmtDate(asset.updatedAt)}
              </p>
            )}
          </>
        )}

        <div className="text-center pt-4 pb-8">
          <p className="text-[10px] text-muted-foreground">
            This record is publicly accessible via QR code scan. Managed by ICSA · Papua New Guinea.
          </p>
        </div>
      </div>
    </div>
  );
}
