import { useParams, Link } from "wouter";
import { useGetAssetById, getGetAssetByIdQueryKey } from "@workspace/api-client-react";
import type { AssetDetail } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit, Printer, Download, Activity, ArrowRight, TrendingDown, ImageIcon, FileText, Wrench, CheckCircle, AlertTriangle, Trash2 } from "lucide-react";
import { statusBadgeClass } from "@/lib/status";
import QRCode from "react-qr-code";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetchJson, apiFetch } from "@/lib/api-fetch";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  useGetProvinces,
  useGetDistrictsByProvince,
  useGetFacilitiesByDistrict,
  getGetProvincesQueryKey,
  getGetDistrictsByProvinceQueryKey,
  getGetFacilitiesByDistrictQueryKey,
} from "@workspace/api-client-react";

type DepreciationData = {
  method: string;
  original_cost: number;
  salvage_value: number;
  useful_life_years: number;
  years_elapsed: number;
  annual_depreciation: number;
  current_value: number;
  depreciated_amount: number;
  percent_depreciated: number;
};

type TransferRecord = {
  id: string;
  fromProvince?: string | null;
  fromFacility?: string | null;
  toProvince?: string;
  toFacility?: string | null;
  transferredBy?: string | null;
  reason?: string | null;
  transferredAt: string;
};

type AssetStatus = "active" | "under_maintenance" | "disposed" | "missing";

type WorkflowAction = {
  label: string;
  targetStatus: AssetStatus;
  icon: React.ReactNode;
  variant: "default" | "outline" | "destructive" | "secondary";
  confirmTitle: string;
  confirmDescription: string;
};

function buildQRPayload(asset: AssetDetail): string {
  return `${window.location.origin}/public/asset/${asset.id}`;
}

const ADMIN_ROLES = ["Super Admin", "National Asset Controller", "Provincial Admin", "Provincial Asset Officer"];

function getWorkflowActions(currentStatus: string | undefined | null): WorkflowAction[] {
  const actions: WorkflowAction[] = [];

  if (currentStatus !== "active") {
    actions.push({
      label: "Mark as Active",
      targetStatus: "active",
      icon: <CheckCircle className="w-4 h-4 mr-2" />,
      variant: "default",
      confirmTitle: "Mark Asset as Active",
      confirmDescription: "This will set the asset status to Active, indicating it is operational and in use.",
    });
  }

  if (currentStatus !== "under_maintenance") {
    actions.push({
      label: "Mark as Under Maintenance",
      targetStatus: "under_maintenance",
      icon: <Wrench className="w-4 h-4 mr-2" />,
      variant: "outline",
      confirmTitle: "Mark Asset as Under Maintenance",
      confirmDescription: "This will set the asset status to Under Maintenance. The asset will be temporarily unavailable until returned to active status.",
    });
  }

  if (currentStatus !== "missing") {
    actions.push({
      label: "Report Missing",
      targetStatus: "missing",
      icon: <AlertTriangle className="w-4 h-4 mr-2" />,
      variant: "outline",
      confirmTitle: "Report Asset as Missing",
      confirmDescription: "This will flag the asset as Missing. Please document all known details about the last known location and circumstances.",
    });
  }

  if (currentStatus !== "disposed") {
    actions.push({
      label: "Mark as Disposed",
      targetStatus: "disposed",
      icon: <Trash2 className="w-4 h-4 mr-2" />,
      variant: "destructive",
      confirmTitle: "Mark Asset as Disposed",
      confirmDescription: "This will permanently mark the asset as Disposed. This indicates the asset has been decommissioned, sold, or written off.",
    });
  }

  return actions;
}

export default function AssetDetailPage() {
  const { id } = useParams();
  const qrRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferToProvinceId, setTransferToProvinceId] = useState("");
  const [transferToDistrictId, setTransferToDistrictId] = useState("");
  const [transferToFacilityId, setTransferToFacilityId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transfers, setTransfers] = useState<TransferRecord[] | null>(null);
  const [loadingTransfers, setLoadingTransfers] = useState(false);

  const [workflowAction, setWorkflowAction] = useState<WorkflowAction | null>(null);
  const [workflowNotes, setWorkflowNotes] = useState("");
  const [isWorkflowSaving, setIsWorkflowSaving] = useState(false);

  const { data, isLoading } = useGetAssetById(id!, {
    query: {
      queryKey: getGetAssetByIdQueryKey(id!),
      enabled: !!id,
    },
  });

  const { data: provincesData } = useGetProvinces({ query: { queryKey: getGetProvincesQueryKey() } });
  const { data: districtsData } = useGetDistrictsByProvince(transferToProvinceId, {
    query: { enabled: !!transferToProvinceId, queryKey: getGetDistrictsByProvinceQueryKey(transferToProvinceId) }
  });
  const { data: facilitiesData } = useGetFacilitiesByDistrict(transferToDistrictId, {
    query: { enabled: !!transferToDistrictId, queryKey: getGetFacilitiesByDistrictQueryKey(transferToDistrictId) }
  });

  const asset = data?.data;
  const depreciation = (asset as (AssetDetail & { depreciation?: DepreciationData }))?.depreciation ?? null;
  const activityLogs = (asset as AssetDetail & { activity_logs?: { id: string; actionType?: string; description?: string; createdAt?: string }[] })?.activity_logs ?? [];
  const isAdmin = ADMIN_ROLES.includes(user?.role || "");

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
      const a = document.createElement("a");
      a.download = `QR-${asset?.assetTag || "asset"}.png`;
      a.href = pngFile;
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const loadTransfers = async () => {
    if (transfers !== null) return;
    setLoadingTransfers(true);
    try {
      const res = await apiFetch(`/api/v1/assets/${id}/transfers`);
      const json = await res.json();
      setTransfers(json.data || []);
    } catch {
      setTransfers([]);
    } finally {
      setLoadingTransfers(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferToProvinceId) { toast({ variant: "destructive", title: "Please select a destination province" }); return; }
    setIsTransferring(true);
    try {
      const res = await apiFetchJson(`/api/v1/assets/${id}/transfer`, {
        method: "POST",
        body: JSON.stringify({
          to_province_id: transferToProvinceId,
          to_district_id: transferToDistrictId || undefined,
          to_facility_id: transferToFacilityId || undefined,
          reason: transferReason || undefined,
        }),
      });
      if (!res.ok) throw new Error(res.message || "Transfer failed");
      toast({ title: "Asset transferred successfully" });
      queryClient.invalidateQueries({ queryKey: getGetAssetByIdQueryKey(id!) });
      setTransfers(null);
      setShowTransferDialog(false);
      setTransferToProvinceId(""); setTransferToDistrictId(""); setTransferToFacilityId(""); setTransferReason("");
    } catch (err) {
      toast({ variant: "destructive", title: "Transfer failed", description: (err as Error).message });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleWorkflowTransition = async () => {
    if (!workflowAction || !asset?.id) return;
    setIsWorkflowSaving(true);
    try {
      const res = await apiFetchJson(`/api/v1/assets/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: workflowAction.targetStatus,
          notes: workflowNotes || undefined,
        }),
      });
      if (!res.ok) throw new Error(res.message || "Status update failed");
      toast({ title: "Asset status updated", description: `Status changed to ${workflowAction.targetStatus.replace("_", " ")}.` });
      queryClient.invalidateQueries({ queryKey: getGetAssetByIdQueryKey(id!) });
      setTransfers(null);
      setWorkflowAction(null);
      setWorkflowNotes("");
    } catch (err) {
      toast({ variant: "destructive", title: "Status update failed", description: (err as Error).message });
    } finally {
      setIsWorkflowSaving(false);
    }
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

  const assetAny = asset as AssetDetail & { supplier?: string; warrantyExpiry?: string; depreciationMethod?: string; salvageValue?: string; photoUrl?: string; notes?: string };
  const workflowActions = getWorkflowActions(asset.status);

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
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <Button variant="outline" onClick={() => setShowTransferDialog(true)}>
              <ArrowRight className="w-4 h-4 mr-2" />
              Transfer
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href={`/assets/${asset.id}/edit`}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Link>
          </Button>
        </div>
      </div>

      {isAdmin && workflowActions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" /> Workflow Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Current status: <span className="font-medium capitalize">{asset.status?.replace("_", " ")}</span>. Select an action to transition this asset to a new lifecycle state.
            </p>
            <div className="flex flex-wrap gap-2">
              {workflowActions.map((action) => (
                <Button
                  key={action.targetStatus}
                  variant={action.variant}
                  size="sm"
                  onClick={() => { setWorkflowAction(action); setWorkflowNotes(""); }}
                >
                  {action.icon}
                  {action.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Tabs defaultValue="details" onValueChange={(v) => v === "transfers" && loadTransfers()}>
            <TabsList className="mb-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="depreciation">Depreciation</TabsTrigger>
              <TabsTrigger value="transfers">Transfer History</TabsTrigger>
              <TabsTrigger value="activity">Activity Log</TabsTrigger>
              <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6">
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
                  {assetAny.notes && (
                    <div className="sm:col-span-2">
                      <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> Notes
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{assetAny.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {assetAny.photoUrl && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ImageIcon className="w-5 h-5" /> Asset Photo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <img
                      src={assetAny.photoUrl}
                      alt={asset.assetName || "Asset"}
                      className="max-h-64 rounded-lg border object-contain"
                    />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Location & Assignment</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-y-4 gap-x-6">
                  <div className="sm:col-span-2">
                    <p className="text-sm text-muted-foreground mb-1">{asset.agency ? "Agency / Location" : "Location Path"}</p>
                    <p className="font-medium flex items-center gap-2 flex-wrap">
                      {asset.agency ? (
                        <>
                          {asset.agency.logoUrl && (
                            <img src={asset.agency.logoUrl} alt="" className="h-5 w-5 object-contain" />
                          )}
                          <span>{asset.agency.agencyName}</span>
                          {asset.facility?.facilityName && (
                            <>
                              <span className="text-muted-foreground">›</span>
                              <span>{asset.facility.facilityName}</span>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {asset.province?.provinceName ?? "N/A"}
                          <span className="text-muted-foreground">›</span>
                          {asset.district?.districtName ?? "N/A"}
                          <span className="text-muted-foreground">›</span>
                          {asset.facility?.facilityName ?? "N/A"}
                        </>
                      )}
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
                    <p className="font-medium">{asset.purchaseCost ? `K ${Number(asset.purchaseCost).toLocaleString()}` : "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Supplier</p>
                    <p className="font-medium">{assetAny.supplier || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Warranty Expiry</p>
                    <p className="font-medium">
                      {assetAny.warrantyExpiry
                        ? format(new Date(assetAny.warrantyExpiry), "dd MMM yyyy")
                        : "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Useful Life</p>
                    <p className="font-medium">{asset.usefulLifeYears ? `${asset.usefulLifeYears} years` : "N/A"}</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="depreciation">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="w-5 h-5" /> Depreciation Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!depreciation ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <TrendingDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No depreciation configured</p>
                      <p className="text-sm mt-1">Set a depreciation method, purchase cost, useful life, and purchase date to track asset value over time.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="bg-muted/40 rounded-lg p-4">
                          <p className="text-sm text-muted-foreground">Original Cost</p>
                          <p className="text-xl font-bold">K {depreciation.original_cost.toLocaleString()}</p>
                        </div>
                        <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
                          <p className="text-sm text-muted-foreground">Current Value</p>
                          <p className="text-xl font-bold text-primary">K {depreciation.current_value.toLocaleString()}</p>
                        </div>
                        <div className="bg-muted/40 rounded-lg p-4">
                          <p className="text-sm text-muted-foreground">Depreciated</p>
                          <p className="text-xl font-bold">K {depreciation.depreciated_amount.toLocaleString()}</p>
                        </div>
                        <div className="bg-muted/40 rounded-lg p-4">
                          <p className="text-sm text-muted-foreground">Annual Depreciation</p>
                          <p className="text-lg font-semibold">K {depreciation.annual_depreciation.toLocaleString()}/yr</p>
                        </div>
                        <div className="bg-muted/40 rounded-lg p-4">
                          <p className="text-sm text-muted-foreground">Salvage Value</p>
                          <p className="text-lg font-semibold">K {depreciation.salvage_value.toLocaleString()}</p>
                        </div>
                        <div className="bg-muted/40 rounded-lg p-4">
                          <p className="text-sm text-muted-foreground">Years Elapsed</p>
                          <p className="text-lg font-semibold">{depreciation.years_elapsed} / {depreciation.useful_life_years} yrs</p>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Depreciation Progress</span>
                          <span className="font-medium">{depreciation.percent_depreciated}% depreciated</span>
                        </div>
                        <div className="h-3 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, depreciation.percent_depreciated)}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Method: <span className="font-medium capitalize">{depreciation.method.replace("_", " ")}</span>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transfers">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowRight className="w-5 h-5" /> Transfer History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingTransfers ? (
                    <div className="space-y-3">
                      {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                    </div>
                  ) : !transfers || transfers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No transfers recorded for this asset.</p>
                  ) : (
                    <ul className="space-y-3">
                      {transfers.map((t) => (
                        <li key={t.id} className="border rounded-lg p-4 text-sm">
                          <div className="flex items-center gap-2 font-medium mb-1">
                            <span>{t.fromProvince || "Unknown"}{t.fromFacility ? ` / ${t.fromFacility}` : ""}</span>
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                            <span>{t.toProvince || "Unknown"}{t.toFacility ? ` / ${t.toFacility}` : ""}</span>
                          </div>
                          {t.reason && <p className="text-muted-foreground">{t.reason}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            By {t.transferredBy || "Unknown"} &bull; {format(new Date(t.transferredAt), "dd MMM yyyy, HH:mm")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity">
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
            </TabsContent>

            <TabsContent value="lifecycle">
              <LifecycleTab assetId={id!} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="w-4 h-4" /> Asset Label
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Printable label — captured by qrRef for download */}
              <div
                ref={qrRef}
                className="border-2 border-dashed rounded-lg p-4 bg-white text-black space-y-3"
              >
                {/* Header */}
                <div className="text-center border-b pb-2 mb-2">
                  <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">NPAMS · Papua New Guinea</p>
                </div>

                {/* QR Code */}
                <div className="flex justify-center">
                  <QRCode value={buildQRPayload(asset as AssetDetail)} size={160} />
                </div>

                {/* Asset Tag */}
                <div className="text-center">
                  <p className="font-mono font-bold text-xl tracking-wider">{asset.assetTag}</p>
                  <p className="text-sm font-semibold mt-0.5 line-clamp-2">{asset.assetName}</p>
                </div>

                {/* Status + Condition row */}
                <div className="flex justify-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${statusBadgeClass(asset.status)}`}>
                    {asset.status?.replace(/_/g, " ")}
                  </span>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border border-gray-300 capitalize">
                    {asset.condition}
                  </span>
                </div>

                {/* Key Details Grid */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs border-t pt-2">
                  {asset.category?.categoryName && (
                    <>
                      <span className="text-gray-500 font-medium">Category</span>
                      <span className="font-medium">{asset.category.categoryName}</span>
                    </>
                  )}
                  {asset.brand && (
                    <>
                      <span className="text-gray-500 font-medium">Brand</span>
                      <span className="font-medium">{asset.brand}</span>
                    </>
                  )}
                  {asset.model && (
                    <>
                      <span className="text-gray-500 font-medium">Model</span>
                      <span className="font-medium">{asset.model}</span>
                    </>
                  )}
                  {asset.serialNumber && (
                    <>
                      <span className="text-gray-500 font-medium">Serial #</span>
                      <span className="font-mono text-[11px]">{asset.serialNumber}</span>
                    </>
                  )}
                </div>

                {/* Location */}
                <div className="text-xs border-t pt-2 space-y-0.5">
                  <p className="text-gray-500 font-medium">Location</p>
                  <p className="font-medium">
                    {asset.agency
                      ? [asset.agency.agencyName, asset.facility?.facilityName].filter(Boolean).join(" › ")
                      : [asset.province?.provinceName, asset.district?.districtName, asset.facility?.facilityName].filter(Boolean).join(" › ")}
                  </p>
                  {asset.assignedUser?.fullName && (
                    <p className="text-gray-500">Custodian: <span className="text-black font-medium">{asset.assignedUser.fullName}</span></p>
                  )}
                </div>

                {/* Financials */}
                <div className="text-xs border-t pt-2 space-y-0.5">
                  {asset.purchaseCost && (
                    <p className="text-gray-500">Purchase Cost: <span className="text-black font-medium">K {Number(asset.purchaseCost).toLocaleString()}</span></p>
                  )}
                  {asset.purchaseDate && (
                    <p className="text-gray-500">Purchase Date: <span className="text-black font-medium">{format(new Date(asset.purchaseDate), "dd MMM yyyy")}</span></p>
                  )}
                  {assetAny.warrantyExpiry && (
                    <p className="text-gray-500">Warranty Expires: <span className="text-black font-medium">{format(new Date(assetAny.warrantyExpiry), "dd MMM yyyy")}</span></p>
                  )}
                </div>

                {/* Footer */}
                <div className="text-center border-t pt-2">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">National Public Asset Management System</p>
                  <p className="text-[9px] text-gray-400">Scan QR to view full record</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={downloadQR}>
                  <Download className="w-4 h-4 mr-2" />
                  Download QR
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print Label
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Destination Province</Label>
              <Select value={transferToProvinceId} onValueChange={(v) => { setTransferToProvinceId(v); setTransferToDistrictId(""); setTransferToFacilityId(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select province" /></SelectTrigger>
                <SelectContent>
                  {provincesData?.data?.map(p => (
                    <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Destination District (optional)</Label>
              <Select value={transferToDistrictId} onValueChange={(v) => { setTransferToDistrictId(v); setTransferToFacilityId(""); }} disabled={!transferToProvinceId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select district" /></SelectTrigger>
                <SelectContent>
                  {districtsData?.data?.map(d => (
                    <SelectItem key={d.id} value={d.id!}>{d.districtName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Destination Facility (optional)</Label>
              <Select value={transferToFacilityId} onValueChange={setTransferToFacilityId} disabled={!transferToDistrictId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select facility" /></SelectTrigger>
                <SelectContent>
                  {facilitiesData?.data?.map(f => (
                    <SelectItem key={f.id} value={f.id!}>{f.facilityName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason for Transfer</Label>
              <Textarea
                className="mt-1"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Reallocation, maintenance, decommission..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={isTransferring || !transferToProvinceId}>
              {isTransferring ? "Transferring..." : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {workflowAction && (
        <Dialog open={!!workflowAction} onOpenChange={(open) => { if (!open) { setWorkflowAction(null); setWorkflowNotes(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{workflowAction.confirmTitle}</DialogTitle>
              <DialogDescription>{workflowAction.confirmDescription}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label htmlFor="workflowNotes">Notes (optional)</Label>
                <Textarea
                  id="workflowNotes"
                  className="mt-1"
                  value={workflowNotes}
                  onChange={(e) => setWorkflowNotes(e.target.value)}
                  placeholder="Add any relevant notes about this status change..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setWorkflowAction(null); setWorkflowNotes(""); }}>Cancel</Button>
              <Button
                variant={workflowAction.variant === "destructive" ? "destructive" : "default"}
                onClick={handleWorkflowTransition}
                disabled={isWorkflowSaving}
              >
                {workflowAction.icon}
                {isWorkflowSaving ? "Updating..." : workflowAction.label}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

type LifecycleEvent = {
  id: string;
  actionType: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorName: string | null;
};
type LifecycleData = {
  asset: { id: string; assetTag: string; assetName: string; currentStatus: string; createdAt: string };
  events: LifecycleEvent[];
};

function lifecycleIcon(actionType: string) {
  if (actionType === "CREATE") return <CheckCircle className="w-4 h-4 text-green-600" />;
  if (actionType === "TRANSFER") return <ArrowRight className="w-4 h-4 text-blue-600" />;
  if (actionType.startsWith("MAINTENANCE")) return <Wrench className="w-4 h-4 text-amber-600" />;
  if (actionType === "STATUS_DISPOSED") return <Trash2 className="w-4 h-4 text-red-600" />;
  if (actionType === "STATUS_REPORTED_MISSING") return <AlertTriangle className="w-4 h-4 text-orange-600" />;
  if (actionType === "STATUS_TO_MAINTENANCE") return <Wrench className="w-4 h-4 text-amber-600" />;
  if (actionType === "STATUS_ACTIVATED") return <CheckCircle className="w-4 h-4 text-green-600" />;
  return <Activity className="w-4 h-4 text-muted-foreground" />;
}

function LifecycleTab({ assetId }: { assetId: string }) {
  const [data, setData] = useState<LifecycleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetchJson<LifecycleData>(`/api/v1/assets/${assetId}/lifecycle`)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setData(r.data);
        else setError(r.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [assetId]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data || data.events.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No lifecycle events recorded yet.
        </CardContent>
      </Card>
    );
  }

  const events = [...data.events].reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Asset Lifecycle Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative border-l border-border ml-2 space-y-4">
          {events.map((ev) => (
            <li key={ev.id} className="ml-4">
              <span className="absolute -left-[9px] flex items-center justify-center w-4 h-4 rounded-full bg-background border border-border">
                {lifecycleIcon(ev.actionType)}
              </span>
              <div className="text-xs text-muted-foreground">
                {format(new Date(ev.createdAt), "dd MMM yyyy, HH:mm")}
                {ev.actorName ? ` · ${ev.actorName}` : ""}
              </div>
              <div className="text-sm font-medium capitalize">
                {ev.actionType.replace(/_/g, " ").toLowerCase()}
              </div>
              {ev.description && (
                <div className="text-sm text-muted-foreground">{ev.description}</div>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
