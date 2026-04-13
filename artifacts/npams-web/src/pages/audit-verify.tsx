import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiFetchJson } from "@/lib/api-fetch";
import { format } from "date-fns";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, MapPin, Camera, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Clock, Crosshair, CheckSquare,
} from "lucide-react";

interface AuditItemDetail {
  id: string; assetId: string; assetTag: string; assetName: string;
  assetStatus: string; assetCondition: string;
  status: string; conditionObserved?: string; gpsLat?: string; gpsLon?: string;
  photoUrl?: string; notes?: string; verifiedAt?: string;
}

interface AssignmentDetail {
  id: string; sessionId: string; sessionName: string; status: string;
  facilityName?: string; districtName?: string; provinceName?: string;
  assignedTo?: string; assignedToName?: string; dueDate?: string;
  items: AuditItemDetail[];
}

const ITEM_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <Clock className="w-4 h-4" /> },
  verified: { label: "Verified", color: "bg-green-100 text-green-800 border-green-200", icon: <CheckCircle2 className="w-4 h-4 text-green-700" /> },
  not_found: { label: "Not Found", color: "bg-red-100 text-red-800 border-red-200", icon: <XCircle className="w-4 h-4 text-red-700" /> },
  damaged: { label: "Damaged", color: "bg-orange-100 text-orange-800 border-orange-200", icon: <AlertTriangle className="w-4 h-4 text-orange-700" /> },
};

const CONDITIONS = ["excellent", "good", "fair", "poor"];

export default function AuditVerify() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeItem, setActiveItem] = useState<AuditItemDetail | null>(null);
  const [verifyStatus, setVerifyStatus] = useState("verified");
  const [verifyCondition, setVerifyCondition] = useState("good");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");

  const { data: assignment, isLoading } = useQuery<AssignmentDetail>({
    queryKey: ["audit-assignment", id],
    queryFn: async () => {
      const r = await apiFetchJson<AssignmentDetail>(`/api/v1/audit/assignments/${id}`);
      if (!r.ok) throw new Error(r.message);
      return r.data!;
    },
  });

  const captureGPS = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "GPS not supported on this device" });
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGpsLoading(false);
        toast({ title: "GPS captured", description: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` });
      },
      (err) => {
        setGpsLoading(false);
        toast({ variant: "destructive", title: "GPS error", description: err.message });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [toast]);

  const verifyMutation = useMutation({
    mutationFn: (itemId: string) => apiFetchJson(`/api/v1/audit/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: verifyStatus,
        conditionObserved: verifyStatus === "verified" ? verifyCondition : undefined,
        gpsLat: gpsCoords?.lat,
        gpsLon: gpsCoords?.lon,
        notes: verifyNotes.trim() || undefined,
      }),
    }),
    onSuccess: (res) => {
      if (!res.ok) { toast({ variant: "destructive", title: res.message }); return; }
      toast({ title: "Asset verified" });
      qc.invalidateQueries({ queryKey: ["audit-assignment", id] });
      setActiveItem(null);
      setGpsCoords(null);
      setVerifyNotes("");
      setVerifyStatus("verified");
      setVerifyCondition("good");
    },
  });

  function openVerify(item: AuditItemDetail) {
    setActiveItem(item);
    setGpsCoords(null);
    setVerifyStatus(item.status !== "pending" ? item.status : "verified");
    setVerifyCondition(item.conditionObserved ?? "good");
    setVerifyNotes(item.notes ?? "");
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-lg mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="text-center py-20 text-muted-foreground max-w-lg mx-auto">
        <p>Assignment not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/audit")}>Back</Button>
      </div>
    );
  }

  const items = assignment.items ?? [];
  const verifiedCount = items.filter(i => i.status !== "pending").length;
  const progress = items.length > 0 ? (verifiedCount / items.length) * 100 : 0;

  const filtered = filter === "pending"
    ? items.filter(i => i.status === "pending")
    : filter === "done"
    ? items.filter(i => i.status !== "pending")
    : items;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation(`/audit/${assignment.sessionId}`)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{assignment.sessionName}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {[assignment.provinceName, assignment.districtName, assignment.facilityName].filter(Boolean).join(" › ")}
          </p>
          {assignment.dueDate && (
            <p className="text-xs text-muted-foreground">Due: {format(new Date(assignment.dueDate), "dd MMM yyyy")}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Progress value={progress} className="flex-1 h-2" />
            <span className="text-sm font-medium shrink-0">{verifiedCount}/{items.length}</span>
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="text-green-700 font-medium">{items.filter(i => i.status === "verified").length} verified</span>
            <span>·</span>
            <span className="text-red-700 font-medium">{items.filter(i => i.status === "not_found").length} not found</span>
            <span>·</span>
            <span className="text-orange-700 font-medium">{items.filter(i => i.status === "damaged").length} damaged</span>
            <span>·</span>
            <span>{items.filter(i => i.status === "pending").length} pending</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {(["all", "pending", "done"] as const).map(f => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "pending" ? "Pending" : "Done"}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            {filter === "pending" ? (
              <>
                <CheckSquare className="w-10 h-10 mx-auto mb-2 text-green-600 opacity-70" />
                <p className="font-medium text-green-700">All assets verified!</p>
              </>
            ) : (
              <p>No items in this view.</p>
            )}
          </div>
        ) : filtered.map(item => {
          const cfg = ITEM_STATUS_CONFIG[item.status] ?? ITEM_STATUS_CONFIG.pending;
          return (
            <Card
              key={item.id}
              className={`cursor-pointer hover:shadow-sm transition-shadow ${item.status !== "pending" ? "opacity-80" : ""}`}
              onClick={() => openVerify(item)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold">{item.assetTag}</span>
                      <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                        <span className="flex items-center gap-1">{cfg.icon} {cfg.label}</span>
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{item.assetName}</p>
                    {item.conditionObserved && (
                      <p className="text-xs text-muted-foreground capitalize">Condition: {item.conditionObserved}</p>
                    )}
                    {item.gpsLat && item.gpsLon && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {parseFloat(item.gpsLat).toFixed(5)}, {parseFloat(item.gpsLon).toFixed(5)}
                      </p>
                    )}
                    {item.notes && <p className="text-xs text-muted-foreground italic mt-1">"{item.notes}"</p>}
                  </div>
                  <div className="text-muted-foreground shrink-0">{cfg.icon}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {activeItem && (
        <Dialog open={!!activeItem} onOpenChange={(open) => { if (!open) setActiveItem(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-mono">{activeItem.assetTag}</DialogTitle>
              <p className="text-sm text-muted-foreground">{activeItem.assetName}</p>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Verification Status</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: "verified", label: "Verified", cls: "border-green-500 bg-green-50 text-green-800" },
                    { val: "not_found", label: "Not Found", cls: "border-red-500 bg-red-50 text-red-800" },
                    { val: "damaged", label: "Damaged", cls: "border-orange-500 bg-orange-50 text-orange-800" },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setVerifyStatus(opt.val)}
                      className={`rounded-lg border-2 p-2 text-xs font-medium transition-colors ${verifyStatus === opt.val ? opt.cls : "border-border"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {verifyStatus === "verified" && (
                <div className="space-y-1">
                  <Label>Observed Condition</Label>
                  <Select value={verifyCondition} onValueChange={setVerifyCondition}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label>GPS Location</Label>
                <div className="flex gap-2 items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={captureGPS}
                    disabled={gpsLoading}
                  >
                    {gpsLoading
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Locating...</>
                      : <><Crosshair className="w-4 h-4 mr-2" /> {gpsCoords ? "Re-capture GPS" : "Capture GPS"}</>
                    }
                  </Button>
                  {gpsCoords && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {gpsCoords.lat.toFixed(4)}, {gpsCoords.lon.toFixed(4)}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  placeholder="Optional notes about this asset..."
                  value={verifyNotes}
                  onChange={e => setVerifyNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActiveItem(null)}>Cancel</Button>
              <Button
                onClick={() => verifyMutation.mutate(activeItem.id)}
                disabled={verifyMutation.isPending}
                className={verifyStatus === "verified" ? "bg-green-700 hover:bg-green-800" : verifyStatus === "not_found" ? "bg-destructive hover:bg-destructive/90" : "bg-orange-600 hover:bg-orange-700"}
              >
                {verifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {verifyMutation.isPending ? "Saving..." : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
