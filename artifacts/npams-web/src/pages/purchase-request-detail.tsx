import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { apiFetchJson } from "@/lib/api-fetch";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES } from "@/App";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  ArrowLeft, Check, X, PackageCheck, ShieldCheck, ClipboardList, FileText, Hash, User, Clock,
  PencilLine, CheckCircle2, XCircle, Truck, Package, CircleDashed,
} from "lucide-react";
import { SignaturePad } from "./purchase-requests";

interface PurchaseRequest {
  id: string;
  requestNumber: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "received" | "closed";
  quantity: number;
  receivedQuantity: number;
  supplier: string | null;
  unitCost: string | null;
  notes: string | null;
  rejectedReason: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  closedAt: string | null;
  requiredByDate: string | null;
  createdAt: string;
  stockItem: { id: string; itemCode: string; itemName: string; unitOfMeasure: string; onHandQuantity: number; reorderLevel: number };
  requester: { id: string; fullName: string } | null;
  agency?: { id: string; agencyName: string; agencyCode: string } | null;
  province?: { id: string; provinceName: string } | null;
  facility?: { id: string; facilityName: string } | null;
}

interface PrEvent {
  id: string;
  eventType: "submitted" | "approved" | "rejected" | "received" | "closed";
  actorRole: string | null;
  actorName: string | null;
  signedName: string | null;
  signedHash: string | null;
  signedAt: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

const STATUS_COLOR: Record<PurchaseRequest["status"], string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  received: "bg-emerald-100 text-emerald-800",
  closed: "bg-green-100 text-green-800",
};

const EVENT_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; bg: string; text: string }> = {
  submitted: { label: "Submitted", icon: PencilLine, bg: "bg-amber-100", text: "text-amber-700" },
  approved:  { label: "Approved", icon: CheckCircle2, bg: "bg-blue-100", text: "text-blue-700" },
  rejected:  { label: "Rejected", icon: XCircle, bg: "bg-red-100", text: "text-red-700" },
  received:  { label: "Goods received", icon: Truck, bg: "bg-emerald-100", text: "text-emerald-700" },
  closed:    { label: "Closed (fully received)", icon: Package, bg: "bg-green-100", text: "text-green-700" },
};

export default function PurchaseRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]) : false;

  const { data: req, isLoading } = useQuery<PurchaseRequest>({
    queryKey: ["purchase-request", id],
    queryFn: async () => {
      const r = await apiFetchJson<PurchaseRequest>(`/api/v1/purchase-requests/${id}`);
      if (!r.ok) throw new Error(r.message);
      return r.data!;
    },
  });

  const { data: events } = useQuery<PrEvent[]>({
    queryKey: ["purchase-request-events", id],
    queryFn: async () => {
      const r = await apiFetchJson<PrEvent[]>(`/api/v1/purchase-requests/${id}/events`);
      return r.data ?? [];
    },
  });

  const [approveOpen, setApproveOpen] = useState(false);
  const [approveSign, setApproveSign] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectSign, setRejectSign] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveSign, setReceiveSign] = useState("");
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveRef, setReceiveRef] = useState("");

  const approve = useMutation({
    mutationFn: async () => {
      const r = await apiFetchJson(`/api/v1/purchase-requests/${id}/approve`, {
        method: "POST", body: JSON.stringify({ signed_name: approveSign.trim() }),
      });
      if (!r.ok) throw new Error(r.message);
    },
    onSuccess: () => {
      toast({ title: "Approved" });
      setApproveOpen(false); setApproveSign("");
      qc.invalidateQueries({ queryKey: ["purchase-request", id] });
      qc.invalidateQueries({ queryKey: ["purchase-request-events", id] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Approval failed", description: (e as Error).message }),
  });

  const reject = useMutation({
    mutationFn: async () => {
      const r = await apiFetchJson(`/api/v1/purchase-requests/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason || undefined, signed_name: rejectSign.trim() }),
      });
      if (!r.ok) throw new Error(r.message);
    },
    onSuccess: () => {
      toast({ title: "Rejected" });
      setRejectOpen(false); setRejectSign(""); setRejectReason("");
      qc.invalidateQueries({ queryKey: ["purchase-request", id] });
      qc.invalidateQueries({ queryKey: ["purchase-request-events", id] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Reject failed", description: (e as Error).message }),
  });

  const receive = useMutation({
    mutationFn: async () => {
      const qty = Number(receiveQty);
      const r = await apiFetchJson(`/api/v1/purchase-requests/${id}/receive`, {
        method: "POST",
        body: JSON.stringify({ quantity: qty, reference: receiveRef || undefined, signed_name: receiveSign.trim() }),
      });
      if (!r.ok) throw new Error(r.message);
    },
    onSuccess: () => {
      toast({ title: "Receipt recorded" });
      setReceiveOpen(false); setReceiveSign(""); setReceiveQty(""); setReceiveRef("");
      qc.invalidateQueries({ queryKey: ["purchase-request", id] });
      qc.invalidateQueries({ queryKey: ["purchase-request-events", id] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Receive failed", description: (e as Error).message }),
  });

  const remaining = useMemo(() => req ? req.quantity - req.receivedQuantity : 0, [req]);

  if (isLoading || !req) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/purchase-requests" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to requests
        </Link>
      </div>

      <Card className="border-blue-200">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-violet-50 rounded-t-lg">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-blue-600" />
                <span className="font-mono text-base">{req.requestNumber}</span>
                <Badge className={STATUS_COLOR[req.status]}>{req.status}</Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Raised {format(new Date(req.createdAt), "dd MMM yyyy 'at' HH:mm")}
                {req.requester && <> by <span className="font-medium text-foreground">{req.requester.fullName}</span></>}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {isAdmin && req.status === "submitted" && (
                <>
                  <Button onClick={() => { setApproveOpen(true); setApproveSign(user?.full_name ?? ""); }} className="bg-blue-600 hover:bg-blue-700">
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <Button variant="destructive" onClick={() => { setRejectOpen(true); setRejectSign(user?.full_name ?? ""); }}>
                    <X className="w-4 h-4 mr-1" /> Reject
                  </Button>
                </>
              )}
              {isAdmin && (req.status === "approved" || req.status === "received") && remaining > 0 && (
                <Button onClick={() => { setReceiveOpen(true); setReceiveQty(String(remaining)); setReceiveSign(user?.full_name ?? ""); }} className="bg-emerald-600 hover:bg-emerald-700">
                  <PackageCheck className="w-4 h-4 mr-1" /> Receive goods
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Item" value={
            <span>
              <span className="font-medium">{req.stockItem.itemName}</span>
              <span className="text-xs text-muted-foreground font-mono ml-2">{req.stockItem.itemCode}</span>
            </span>
          } />
          <Field label="Quantity ordered" value={`${req.quantity.toLocaleString()} ${req.stockItem.unitOfMeasure}`} />
          <Field label="Quantity received" value={`${req.receivedQuantity.toLocaleString()} ${req.stockItem.unitOfMeasure}`} />
          <Field label="Supplier" value={req.supplier ?? "—"} />
          <Field label="Unit cost (PGK)" value={req.unitCost ?? "—"} />
          <Field label="Required by" value={req.requiredByDate ? format(new Date(req.requiredByDate), "dd MMM yyyy") : "—"} />
          <Field label="Agency" value={req.agency?.agencyName ?? "—"} />
          <Field label="Province" value={req.province?.provinceName ?? "—"} />
          <Field label="Facility" value={req.facility?.facilityName ?? "—"} />
          {req.notes && <Field className="md:col-span-2" label="Notes" value={req.notes} />}
          {req.rejectedReason && <Field className="md:col-span-2" label="Rejection reason" value={req.rejectedReason} />}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-violet-600" /> Approval timeline &amp; signatures
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative border-l-2 border-blue-200 ml-3 space-y-6">
            {(events ?? []).map((ev) => {
              const meta = EVENT_META[ev.eventType] ?? { label: ev.eventType, icon: CircleDashed, bg: "bg-gray-100", text: "text-gray-700" };
              const Icon = meta.icon;
              return (
                <li key={ev.id} className="ml-6">
                  <span className={`absolute -left-[14px] flex items-center justify-center w-7 h-7 rounded-full ring-2 ring-background ${meta.bg}`}>
                    <Icon className={`w-4 h-4 ${meta.text}`} />
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${meta.text}`}>{meta.label}</span>
                    {ev.actorRole && <Badge variant="outline" className="text-xs">{ev.actorRole}</Badge>}
                    <span className="text-xs text-muted-foreground">{format(new Date(ev.createdAt), "dd MMM yyyy 'at' HH:mm:ss")}</span>
                  </div>
                  {ev.signedName && (
                    <div className="mt-2 rounded-md border bg-blue-50/40 p-3 text-sm">
                      <div className="flex items-center gap-1.5 text-blue-900">
                        <ShieldCheck className="w-4 h-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Digitally signed</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-serif italic text-base">{ev.signedName}</span>
                      </div>
                      {ev.signedHash && (
                        <div className="mt-1 flex items-start gap-2 text-xs text-muted-foreground">
                          <Hash className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span className="font-mono break-all">SHA-256 {ev.signedHash.slice(0, 16)}…{ev.signedHash.slice(-12)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {ev.reason && (
                    <div className="mt-2 rounded-md border bg-red-50/40 p-2 text-sm">
                      <div className="flex items-start gap-1.5 text-red-900">
                        <FileText className="w-3.5 h-3.5 mt-0.5" />
                        <span>{ev.reason}</span>
                      </div>
                    </div>
                  )}
                  {ev.payload && Object.keys(ev.payload).length > 0 && (
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer hover:text-foreground">Details</summary>
                      <pre className="mt-1 rounded bg-muted/50 p-2 overflow-auto max-w-full">{JSON.stringify(ev.payload, null, 2)}</pre>
                    </details>
                  )}
                </li>
              );
            })}
            {(events ?? []).length === 0 && (
              <li className="ml-2 text-sm text-muted-foreground">No events yet.</li>
            )}
          </ol>
        </CardContent>
      </Card>

      {/* Approve dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {req.requestNumber}</DialogTitle>
            <DialogDescription>{req.stockItem.itemName} • {req.quantity} {req.stockItem.unitOfMeasure}</DialogDescription>
          </DialogHeader>
          <SignaturePad value={approveSign} onChange={setApproveSign} action="approve" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => approve.mutate()} disabled={approve.isPending || approveSign.trim().length < 2}>
              <ShieldCheck className="w-4 h-4 mr-1" /> Sign &amp; approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {req.requestNumber}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Reason</Label>
            <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <SignaturePad value={rejectSign} onChange={setRejectSign} action="reject" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending || rejectSign.trim().length < 2}>
              <ShieldCheck className="w-4 h-4 mr-1" /> Sign &amp; reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive dialog */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive against {req.requestNumber}</DialogTitle>
            <DialogDescription>{remaining} {req.stockItem.unitOfMeasure} remaining</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Quantity received *</Label>
              <Input type="number" min="1" step="1" value={receiveQty} onChange={(e) => setReceiveQty(e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
            <div>
              <Label>Delivery reference</Label>
              <Input value={receiveRef} onChange={(e) => setReceiveRef(e.target.value)} />
            </div>
            <SignaturePad value={receiveSign} onChange={setReceiveSign} action="receive" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => receive.mutate()} disabled={receive.isPending || receiveSign.trim().length < 2 || !receiveQty || Number(receiveQty) <= 0}>
              <ShieldCheck className="w-4 h-4 mr-1" /> Sign &amp; record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
