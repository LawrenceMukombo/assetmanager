import { useParams, Link } from "wouter";
import { useGetAssetById, getGetAssetByIdQueryKey } from "@workspace/api-client-react";
import type { AssetDetail } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Edit, Printer, Download, Activity } from "lucide-react";
import { statusBadgeClass, conditionBadgeClass } from "@/lib/status";
import QRCode from "react-qr-code";
import { useRef } from "react";
import { format } from "date-fns";

function buildQRPayload(asset: AssetDetail): string {
  return JSON.stringify({ id: asset.id, tag: asset.assetTag });
}

export default function AssetDetail() {
  const { id } = useParams();
  const qrRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useGetAssetById(id!, {
    query: {
      queryKey: getGetAssetByIdQueryKey(id!),
      enabled: !!id,
    },
  });

  const asset = data?.data;

  const downloadQR = () => {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      ctx?.drawImage(img, 0, 0, 256, 256);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `QR-${asset?.assetTag || "asset"}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!asset) {
    return <div className="p-8 text-center text-muted-foreground">Asset not found.</div>;
  }

  const activityLogs = (asset as AssetDetail).activity_logs ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/assets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-3xl font-bold tracking-tight">{asset.assetName}</h2>
            <Badge variant="outline" className="text-sm font-mono">{asset.assetTag}</Badge>
            <Badge className={`capitalize ${statusBadgeClass(asset.status)}`}>{asset.status?.replace("_", " ")}</Badge>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/assets/${asset.id}/edit`}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Asset Information</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-y-4 gap-x-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Category</p>
                <p className="font-medium">{asset.category?.categoryName || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Condition</p>
                <Badge variant="secondary" className="capitalize">{asset.condition}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Brand</p>
                <p className="font-medium">{asset.brand || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Model</p>
                <p className="font-medium">{asset.model || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Serial Number</p>
                <p className="font-mono">{asset.serialNumber || "N/A"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Location & Assignment</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-y-4 gap-x-6">
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground mb-1">Location Path</p>
                <p className="font-medium flex items-center gap-2">
                  {asset.province?.provinceName ?? "N/A"}
                  <span className="text-muted-foreground">›</span>
                  {asset.district?.districtName ?? "N/A"}
                  <span className="text-muted-foreground">›</span>
                  {asset.facility?.facilityName ?? "N/A"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground mb-1">Assigned Custodian</p>
                <p className="font-medium">{asset.assignedUser?.fullName || "Unassigned"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Procurement Details</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-y-4 gap-x-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Purchase Date</p>
                <p className="font-medium">
                  {asset.purchaseDate ? format(new Date(asset.purchaseDate), "dd MMM yyyy") : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Purchase Cost</p>
                <p className="font-medium">{asset.purchaseCost ? `K ${asset.purchaseCost}` : "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Supplier</p>
                <p className="font-medium">{(asset as AssetDetail).supplier || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Warranty Expiry</p>
                <p className="font-medium">
                  {(asset as AssetDetail).warrantyExpiry
                    ? format(new Date((asset as AssetDetail).warrantyExpiry!), "dd MMM yyyy")
                    : "N/A"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Activity Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activityLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No activity recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {activityLogs.map((log) => (
                    <li key={log.id} className="flex gap-3 text-sm">
                      <div className="mt-1 w-2 h-2 rounded-full bg-primary shrink-0" />
                      <div>
                        <p className="font-medium capitalize">{log.actionType?.replace(/_/g, " ")}</p>
                        {log.description && (
                          <p className="text-muted-foreground">{log.description}</p>
                        )}
                        {log.createdAt && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm")}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Asset Tag QR</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-lg mb-4" ref={qrRef}>
                <QRCode value={buildQRPayload(asset as AssetDetail)} size={180} />
              </div>
              <p className="font-mono text-center font-semibold mb-4">{asset.assetTag}</p>

              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={downloadQR}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
