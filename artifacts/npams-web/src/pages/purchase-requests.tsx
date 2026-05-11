import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES } from "@/App";
import { apiFetchJson } from "@/lib/api-fetch";
import { Link, useLocation } from "wouter";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, ColorfulTabsList, ColorfulTabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Check, X, PackageCheck, Plus, ShieldCheck, ChevronRight, Inbox, FileSpreadsheet, ListChecks, ShoppingCart,
} from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "@/components/layout/page-header";

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
  requiredByDate: string | null;
  createdAt: string;
  stockItem: { id: string; itemCode: string; itemName: string; unitOfMeasure: string; onHandQuantity: number; reorderLevel: number };
  requester: { id: string; fullName: string } | null;
  agency?: { id: string; agencyName: string; agencyCode: string } | null;
  province?: { id: string; provinceName: string } | null;
  facility?: { id: string; facilityName: string } | null;
};

type StockItem = {
  id: string;
  itemCode: string;
  itemName: string;
  unitOfMeasure: string;
  onHandQuantity: number;
  reorderLevel: number;
  unitCost: string | null;
  supplier: string | null;
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
  const [, setLocation] = useLocation();

  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]) : false;

  const [tab, setTab] = useState<"pending" | "mine" | "all">(isAdmin ? "pending" : "mine");

  const openDetail = (prId: string) => {
    const ctx: Record<string, string> = {};
    if (tab === "pending") ctx.pending = "true";
    if (tab === "mine") ctx.mine = "true";
    const nonce = Math.random().toString(36).slice(2, 10);
    try {
      sessionStorage.setItem(`npams_purchase_requests_list_ctx_${nonce}`, JSON.stringify(ctx));
    } catch { /* ignore */ }
    setLocation(`/purchase-requests/${prId}?ctx=${nonce}`);
  };
  const [rejectTarget, setRejectTarget] = useState<PurchaseRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSign, setRejectSign] = useState("");
  const [approveTarget, setApproveTarget] = useState<PurchaseRequest | null>(null);
  const [approveSign, setApproveSign] = useState("");
  const [receiveTarget, setReceiveTarget] = useState<PurchaseRequest | null>(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveRef, setReceiveRef] = useState("");
  const [receiveSign, setReceiveSign] = useState("");
  const [newOpen, setNewOpen] = useState(false);

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
    mutationFn: async () => {
      if (!approveTarget) throw new Error("No request selected");
      if (approveSign.trim().length < 2) throw new Error("Type your full name to sign this approval");
      const r = await apiFetchJson(`/api/v1/purchase-requests/${approveTarget.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ signed_name: approveSign.trim() }),
      });
      if (!r.ok) throw new Error(r.message);
    },
    onSuccess: () => {
      toast({ title: "Request approved" });
      setApproveTarget(null); setApproveSign("");
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Approval failed", description: (e as Error).message }),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!rejectTarget) throw new Error("No request selected");
      if (rejectSign.trim().length < 2) throw new Error("Type your full name to sign this rejection");
      const r = await apiFetchJson(`/api/v1/purchase-requests/${rejectTarget.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason || undefined, signed_name: rejectSign.trim() }),
      });
      if (!r.ok) throw new Error(r.message);
    },
    onSuccess: () => {
      toast({ title: "Request rejected" });
      setRejectTarget(null); setRejectReason(""); setRejectSign("");
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Reject failed", description: (e as Error).message }),
  });

  const receive = useMutation({
    mutationFn: async () => {
      if (!receiveTarget) throw new Error("No request selected");
      const qty = Number(receiveQty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Enter a valid quantity");
      if (receiveSign.trim().length < 2) throw new Error("Type your full name to sign this receipt");
      const r = await apiFetchJson(`/api/v1/purchase-requests/${receiveTarget.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ quantity: qty, reference: receiveRef || undefined, signed_name: receiveSign.trim() }),
      });
      if (!r.ok) throw new Error(r.message);
    },
    onSuccess: () => {
      toast({ title: "Goods received" });
      setReceiveTarget(null); setReceiveQty(""); setReceiveRef(""); setReceiveSign("");
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
            <TableHead>Required by</TableHead>
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
                <TableCell className="font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => openDetail(r.id)}
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {r.requestNumber} <ChevronRight className="w-3 h-3" />
                  </button>
                </TableCell>
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
                <TableCell className="text-sm">{r.requiredByDate ? format(new Date(r.requiredByDate), "dd MMM yyyy") : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-sm">{r.requester?.fullName ?? "—"}</TableCell>
                <TableCell className="text-sm">{format(new Date(r.createdAt), "dd MMM yyyy")}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 flex-wrap">
                    {isAdmin && r.status === "submitted" && (
                      <>
                        <Button size="sm" variant="outline"
                          onClick={() => { setApproveTarget(r); setApproveSign(user?.full_name ?? ""); }}>
                          <Check className="w-4 h-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive"
                          onClick={() => { setRejectTarget(r); setRejectReason(""); setRejectSign(user?.full_name ?? ""); }}>
                          <X className="w-4 h-4 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {isAdmin && (r.status === "approved" || r.status === "received") && remaining > 0 && (
                      <Button size="sm" onClick={() => { setReceiveTarget(r); setReceiveQty(String(remaining)); setReceiveRef(""); setReceiveSign(user?.full_name ?? ""); }}>
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
    <div className="space-y-6">
      <PageHeader
        icon={<ShoppingCart className="w-5 h-5" />}
        title="Purchase Requests"
        subtitle="Reorder requests for low-stock items, routed to admins for approval."
        breadcrumbs={[{ label: "Purchase Requests" }]}
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="w-4 h-4" /> New purchase request
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <ColorfulTabsList>
          {isAdmin && (
            <ColorfulTabsTrigger value="pending" tone="amber">
              <Inbox className="w-4 h-4" /> Pending approval
            </ColorfulTabsTrigger>
          )}
          <ColorfulTabsTrigger value="mine" tone="emerald">
            <FileSpreadsheet className="w-4 h-4" /> My requests
          </ColorfulTabsTrigger>
          <ColorfulTabsTrigger value="all" tone="violet">
            <ListChecks className="w-4 h-4" /> All
          </ColorfulTabsTrigger>
        </ColorfulTabsList>
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

      {/* Approve dialog with signature */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve purchase request</DialogTitle>
            <DialogDescription>
              {approveTarget && `${approveTarget.requestNumber} — ${approveTarget.stockItem.itemName} (${approveTarget.quantity} ${approveTarget.stockItem.unitOfMeasure})`}
            </DialogDescription>
          </DialogHeader>
          <SignaturePad value={approveSign} onChange={setApproveSign} action="approve" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => approve.mutate()} disabled={approve.isPending || approveSign.trim().length < 2}>
              <ShieldCheck className="w-4 h-4 mr-1" /> Sign &amp; approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog with signature */}
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
          <SignaturePad value={rejectSign} onChange={setRejectSign} action="reject" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending || rejectSign.trim().length < 2}>
              <ShieldCheck className="w-4 h-4 mr-1" /> Sign &amp; reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive dialog with signature */}
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
            <SignaturePad value={receiveSign} onChange={setReceiveSign} action="receive" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveTarget(null)}>Cancel</Button>
            <Button onClick={() => receive.mutate()} disabled={receive.isPending || !receiveQty || Number(receiveQty) <= 0 || receiveSign.trim().length < 2}>
              <ShieldCheck className="w-4 h-4 mr-1" /> Sign &amp; record receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewPurchaseRequestDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSubmitted={() => qc.invalidateQueries({ queryKey: ["purchase-requests"] })}
      />
    </div>
  );
}

// ─── Signature pad (typed name) ──────────────────────────────────────────────
export function SignaturePad({
  value, onChange, action,
}: { value: string; onChange: (v: string) => void; action: string }) {
  return (
    <div className="rounded-md border bg-blue-50/50 p-3">
      <Label className="flex items-center gap-1.5 text-blue-900">
        <ShieldCheck className="w-4 h-4" /> Digital signature *
      </Label>
      <Input
        className="mt-1 bg-white font-serif italic"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your full name"
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Typing your name records a SHA-256 signature on the {action} action.
      </p>
    </div>
  );
}

// ─── New PR dialog ───────────────────────────────────────────────────────────
function NewPurchaseRequestDialog({
  open, onOpenChange, onSubmitted,
}: { open: boolean; onOpenChange: (o: boolean) => void; onSubmitted: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stockItemId, setStockItemId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [supplier, setSupplier] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [notes, setNotes] = useState("");
  const [signedName, setSignedName] = useState("");
  const [search, setSearch] = useState("");

  const { data: items, isLoading: itemsLoading } = useQuery<StockItem[]>({
    queryKey: ["stock", "for-pr"],
    queryFn: async () => {
      const r = await apiFetchJson<StockItem[]>("/api/v1/stock");
      return r.data ?? [];
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items ?? [];
    return (items ?? []).filter((it) =>
      it.itemName.toLowerCase().includes(q) || it.itemCode.toLowerCase().includes(q),
    );
  }, [items, search]);

  const selected = useMemo(() => (items ?? []).find((it) => it.id === stockItemId) || null, [items, stockItemId]);

  function reset() {
    setStockItemId(""); setQuantity(""); setSupplier(""); setUnitCost("");
    setRequiredBy(""); setNotes(""); setSignedName(""); setSearch("");
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a stock item");
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Enter a valid quantity");
      if (signedName.trim().length < 2) throw new Error("Type your full name to sign this request");
      const r = await apiFetchJson("/api/v1/purchase-requests", {
        method: "POST",
        body: JSON.stringify({
          stock_item_id: selected.id,
          quantity: qty,
          supplier: supplier || undefined,
          unit_cost: unitCost || undefined,
          required_by_date: requiredBy || undefined,
          notes: notes || undefined,
          signed_name: signedName.trim(),
        }),
      });
      if (!r.ok) throw new Error(r.message);
      return r.data;
    },
    onSuccess: () => {
      toast({ title: "Purchase request submitted" });
      onOpenChange(false);
      reset();
      onSubmitted();
    },
    onError: (e) => toast({ variant: "destructive", title: "Could not submit", description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" /> New purchase request
          </DialogTitle>
          <DialogDescription>
            Pick a stock item from your scope and submit a request for approval.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Stock item *</Label>
            <Input
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2"
            />
            <Select value={stockItemId} onValueChange={(v) => {
              setStockItemId(v);
              const it = (items ?? []).find((x) => x.id === v);
              if (it) {
                setSupplier(it.supplier ?? "");
                setUnitCost(it.unitCost ?? "");
                if (!quantity) setQuantity(String(Math.max(it.reorderLevel * 2 - it.onHandQuantity, 1)));
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder={itemsLoading ? "Loading items…" : "Select an item"} />
              </SelectTrigger>
              <SelectContent>
                {filtered.length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">No items match.</div>
                )}
                {filtered.slice(0, 100).map((it) => (
                  <SelectItem key={it.id} value={it.id}>
                    <span className="font-medium">{it.itemName}</span>
                    <span className="text-xs text-muted-foreground font-mono ml-2">{it.itemCode}</span>
                    <span className="text-xs text-muted-foreground ml-2">on hand {it.onHandQuantity} {it.unitOfMeasure}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="mt-1 text-xs text-muted-foreground">
                On hand {selected.onHandQuantity} {selected.unitOfMeasure} • reorder level {selected.reorderLevel}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity *</Label>
              <Input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
            <div>
              <Label>Unit cost (PGK)</Label>
              <Input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Supplier</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Required by</Label>
              <Input type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <SignaturePad value={signedName} onChange={setSignedName} action="submit" />
          {!signedName && user?.full_name && (
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={() => setSignedName(user.full_name ?? "")}
            >
              Use my name ({user.full_name})
            </button>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !selected || !quantity || Number(quantity) <= 0 || signedName.trim().length < 2}
          >
            <ShieldCheck className="w-4 h-4 mr-1" /> Sign &amp; submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
