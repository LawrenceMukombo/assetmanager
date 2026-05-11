import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES } from "@/App";
import { apiFetchJson } from "@/lib/api-fetch";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Check, X, PackageCheck } from "lucide-react";
import { format } from "date-fns";

type PurchaseRequest = {
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
  createdAt: string;
  stockItem: { id: string; itemCode: string; itemName: string; unitOfMeasure: string; onHandQuantity: number; reorderLevel: number };
  requester: { id: string; fullName: string } | null;
  agency?: { id: string; agencyName: string; agencyCode: string } | null;
  province?: { id: string; provinceName: string } | null;
  facility?: { id: string; facilityName: string } | null;
};

const STATUS_BADGE: Record<PurchaseRequest["status"], string> = {
  draft: "bg-gray-100 text-gray-800 border-gray-200",
  submitted: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  received: "bg-emerald-100 text-emerald-800 border-emerald-200",
  closed: "bg-green-100 text-green-800 border-green-200",
};

function StatusBadge({ status }: { status: PurchaseRequest["status"] }) {
  return <Badge className={STATUS_BADGE[status]}>{status}</Badge>;
}

export default function PurchaseRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]) : false;

  const [tab, setTab] = useState<"pending" | "mine" | "all">(isAdmin ? "pending" : "mine");
  const [rejectTarget, setRejectTarget] = useState<PurchaseRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [receiveTarget, setReceiveTarget] = useState<PurchaseRequest | null>(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveRef, setReceiveRef] = useState("");

  const { data: rows, isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ["purchase-requests", tab],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tab === "pending") params.set("pending", "true");
      if (tab === "mine") params.set("mine", "true");
      const r = await apiFetchJson<PurchaseRequest[]>(`/api/v1/purchase-requests?${params.toString()}`);
      return r.data ?? [];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiFetchJson(`/api/v1/purchase-requests/${id}/approve`, { method: "POST" });
      if (!r.ok) throw new Error(r.message);
    },
    onSuccess: () => {
      toast({ title: "Request approved" });
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Approval failed", description: (e as Error).message }),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!rejectTarget) throw new Error("No request selected");
      const r = await apiFetchJson(`/api/v1/purchase-requests/${rejectTarget.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      if (!r.ok) throw new Error(r.message);
    },
    onSuccess: () => {
      toast({ title: "Request rejected" });
      setRejectTarget(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Reject failed", description: (e as Error).message }),
  });

  const receive = useMutation({
    mutationFn: async () => {
      if (!receiveTarget) throw new Error("No request selected");
      const qty = Number(receiveQty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Enter a valid quantity");
      const r = await apiFetchJson(`/api/v1/purchase-requests/${receiveTarget.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ quantity: qty, reference: receiveRef || undefined }),
      });
      if (!r.ok) throw new Error(r.message);
    },
    onSuccess: () => {
      toast({ title: "Goods received" });
      setReceiveTarget(null);
      setReceiveQty("");
      setReceiveRef("");
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Receive failed", description: (e as Error).message }),
  });

  const renderTable = (items: PurchaseRequest[]) => {
    if (items.length === 0) {
      return <div className="p-12 text-center text-sm text-muted-foreground">No purchase requests in this view.</div>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Request #</TableHead>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Requested by</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => {
            const remaining = r.quantity - r.receivedQuantity;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.requestNumber}</TableCell>
                <TableCell>
                  <div className="font-medium">{r.stockItem.itemName}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.stockItem.itemCode}</div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.quantity.toLocaleString()} {r.stockItem.unitOfMeasure}
                  {r.receivedQuantity > 0 && r.receivedQuantity < r.quantity && (
                    <div className="text-xs text-muted-foreground">{r.receivedQuantity} received</div>
                  )}
                </TableCell>
                <TableCell className="text-sm">{r.supplier ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-sm">{r.requester?.fullName ?? "—"}</TableCell>
                <TableCell className="text-sm">{format(new Date(r.createdAt), "dd MMM yyyy")}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 flex-wrap">
                    {isAdmin && r.status === "submitted" && (
                      <>
                        <Button size="sm" variant="outline" disabled={approve.isPending}
                          onClick={() => approve.mutate(r.id)}>
                          <Check className="w-4 h-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive"
                          onClick={() => { setRejectTarget(r); setRejectReason(""); }}>
                          <X className="w-4 h-4 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {isAdmin && (r.status === "approved" || r.status === "received") && remaining > 0 && (
                      <Button size="sm" onClick={() => { setReceiveTarget(r); setReceiveQty(String(remaining)); setReceiveRef(""); }}>
                        <PackageCheck className="w-4 h-4 mr-1" /> Receive
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ClipboardList className="w-6 h-6" /> Purchase Requests
        </h1>
        <p className="text-sm text-muted-foreground">Reorder requests for low-stock items, routed to admins for approval.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          {isAdmin && <TabsTrigger value="pending">Pending approval</TabsTrigger>}
          <TabsTrigger value="mine">My requests</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {tab === "pending" ? "Awaiting your approval" : tab === "mine" ? "Requests you raised" : "All purchase requests"}
              </CardTitle>
              <CardDescription>{rows?.length ?? 0} request{(rows?.length ?? 0) === 1 ? "" : "s"}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
                renderTable(rows ?? [])
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject purchase request</DialogTitle>
            <DialogDescription>
              {rejectTarget && `${rejectTarget.requestNumber} — ${rejectTarget.stockItem.itemName}`}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Reason (sent to the requester)</Label>
            <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending}>
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiveTarget} onOpenChange={(o) => !o && setReceiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive against request</DialogTitle>
            <DialogDescription>
              {receiveTarget && `${receiveTarget.requestNumber} — ${receiveTarget.stockItem.itemName}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {receiveTarget && (
              <p className="text-sm text-muted-foreground">
                Ordered {receiveTarget.quantity} {receiveTarget.stockItem.unitOfMeasure}, already received {receiveTarget.receivedQuantity},
                {" "}{receiveTarget.quantity - receiveTarget.receivedQuantity} remaining.
              </p>
            )}
            <div>
              <Label>Quantity received *</Label>
              <Input type="number" min="1" step="1" value={receiveQty} onChange={(e) => setReceiveQty(e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
            <div>
              <Label>Delivery reference (e.g. invoice / GRN #)</Label>
              <Input value={receiveRef} onChange={(e) => setReceiveRef(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveTarget(null)}>Cancel</Button>
            <Button onClick={() => receive.mutate()} disabled={receive.isPending || !receiveQty || Number(receiveQty) <= 0}>
              Record receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
