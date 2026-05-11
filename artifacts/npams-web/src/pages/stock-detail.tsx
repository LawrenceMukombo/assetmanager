import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-fetch";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES, OFFICER_ROLES } from "@/App";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowDown, ArrowUp, ArrowLeftRight, Plus, Boxes, Pencil } from "lucide-react";
import { format } from "date-fns";

type Movement = {
  id: string;
  movementType: "receive" | "issue" | "transfer" | "adjust";
  quantity: number;
  issuedToName: string | null;
  reference: string | null;
  reason: string | null;
  createdAt: string;
  actor: { id: string; fullName: string } | null;
};

type StockDetail = {
  id: string;
  itemCode: string;
  itemName: string;
  category: string | null;
  description: string | null;
  unitOfMeasure: string;
  onHandQuantity: number;
  reorderLevel: number;
  unitCost: string | null;
  supplier: string | null;
  notes: string | null;
  facility?: { id: string; facilityName: string } | null;
  balances?: Array<{ facilityId: string | null; facilityName: string | null; quantity: number }>;
  movements: Movement[];
};

type Facility = { id: string; facilityName: string; districtName: string | null };

const MOVEMENT_LABEL: Record<string, string> = {
  receive: "Receive",
  issue: "Issue",
  transfer: "Transfer",
  adjust: "Adjust",
};

function MovementBadge({ type }: { type: string }) {
  const cls =
    type === "receive" ? "bg-green-100 text-green-800 border-green-200"
    : type === "issue" ? "bg-blue-100 text-blue-800 border-blue-200"
    : type === "transfer" ? "bg-purple-100 text-purple-800 border-purple-200"
    : "bg-amber-100 text-amber-800 border-amber-200";
  return <Badge className={cls}>{MOVEMENT_LABEL[type] ?? type}</Badge>;
}

export default function StockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isOfficer = user?.role ? OFFICER_ROLES.includes(user.role as typeof OFFICER_ROLES[number]) : false;
  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]) : false;

  const [showMovement, setShowMovement] = useState(false);
  const [movementType, setMovementType] = useState<"receive" | "issue" | "transfer" | "adjust">("receive");
  const [movementForm, setMovementForm] = useState({
    quantity: "",
    issued_to_name: "",
    reference: "",
    reason: "",
    to_facility_id: "",
  });

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    item_name: "",
    category: "",
    unit_of_measure: "",
    reorder_level: "",
    unit_cost: "",
    supplier: "",
    notes: "",
  });

  const { data, isLoading } = useQuery<StockDetail>({
    queryKey: ["stock", id],
    queryFn: async () => {
      const r = await apiFetchJson<StockDetail>(`/api/v1/stock/${id}`);
      return r.data!;
    },
  });

  const { data: facilities } = useQuery<Facility[]>({
    queryKey: ["facilities-flat"],
    queryFn: async () => {
      const r = await apiFetchJson<Facility[]>("/api/v1/locations/facilities");
      return r.data ?? [];
    },
    enabled: showMovement && movementType === "transfer",
  });

  const movementMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        movement_type: movementType,
        quantity: Number(movementForm.quantity),
        issued_to_name: movementForm.issued_to_name || undefined,
        reference: movementForm.reference || undefined,
        reason: movementForm.reason || undefined,
      };
      if (movementType === "transfer") {
        if (!movementForm.to_facility_id) throw new Error("Destination facility is required for transfers");
        payload.to_facility_id = movementForm.to_facility_id;
        if (data?.facility?.id) payload.from_facility_id = data.facility.id;
      }
      const r = await apiFetchJson(`/api/v1/stock/${id}/movements`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(r.message);
      return r.data;
    },
    onSuccess: () => {
      toast({ title: "Movement recorded" });
      setShowMovement(false);
      setMovementForm({ quantity: "", issued_to_name: "", reference: "", reason: "", to_facility_id: "" });
      qc.invalidateQueries({ queryKey: ["stock", id] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Failed", description: (e as Error).message }),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetchJson(`/api/v1/stock/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          item_name: editForm.item_name,
          category: editForm.category || null,
          unit_of_measure: editForm.unit_of_measure,
          reorder_level: editForm.reorder_level === "" ? null : Number(editForm.reorder_level),
          unit_cost: editForm.unit_cost || null,
          supplier: editForm.supplier || null,
          notes: editForm.notes || null,
        }),
      });
      if (!r.ok) throw new Error(r.message);
      return r.data;
    },
    onSuccess: () => {
      toast({ title: "Stock item updated" });
      setShowEdit(false);
      qc.invalidateQueries({ queryKey: ["stock", id] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Update failed", description: (e as Error).message }),
  });

  const openEdit = () => {
    if (!data) return;
    setEditForm({
      item_name: data.itemName,
      category: data.category ?? "",
      unit_of_measure: data.unitOfMeasure,
      reorder_level: String(data.reorderLevel),
      unit_cost: data.unitCost ?? "",
      supplier: data.supplier ?? "",
      notes: data.notes ?? "",
    });
    setShowEdit(true);
  };

  if (isLoading || !data) {
    return <div className="p-6"><Skeleton className="h-40 w-full" /></div>;
  }

  const low = data.onHandQuantity <= data.reorderLevel;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/stock"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Stock</Button></Link>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Boxes className="w-6 h-6" /> {data.itemName}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">{data.itemCode}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <Button variant="outline" onClick={openEdit}>
              <Pencil className="w-4 h-4 mr-1" /> Edit item
            </Button>
          )}
          {isOfficer && (
            <>
              <Button variant="outline" onClick={() => { setMovementType("receive"); setShowMovement(true); }}>
                <ArrowDown className="w-4 h-4 mr-1" /> Receive
              </Button>
              <Button variant="outline" onClick={() => { setMovementType("issue"); setShowMovement(true); }}>
                <ArrowUp className="w-4 h-4 mr-1" /> Issue
              </Button>
              <Button variant="outline" onClick={() => { setMovementType("transfer"); setShowMovement(true); }}>
                <ArrowLeftRight className="w-4 h-4 mr-1" /> Transfer
              </Button>
              <Button variant="outline" onClick={() => { setMovementType("adjust"); setShowMovement(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Adjust
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">On hand</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold">{data.onHandQuantity.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">{data.unitOfMeasure}</span>
              {low && <Badge className="bg-amber-100 text-amber-800 border-amber-200 ml-2">Low stock</Badge>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Reorder level</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{data.reorderLevel.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Unit cost</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{data.unitCost ? `K ${data.unitCost}` : "—"}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Item details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Category:</span> {data.category ?? "—"}</div>
          <div><span className="text-muted-foreground">Supplier:</span> {data.supplier ?? "—"}</div>
          <div><span className="text-muted-foreground">Current location:</span> {data.facility?.facilityName ?? "—"}</div>
          {data.notes && <div className="md:col-span-2"><span className="text-muted-foreground">Notes:</span> {data.notes}</div>}
        </CardContent>
      </Card>

      {data.balances && data.balances.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Balances by location</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.balances.map((b, i) => (
                  <TableRow key={b.facilityId ?? `unassigned-${i}`}>
                    <TableCell>{b.facilityName ?? "Unassigned / Agency reserve"}</TableCell>
                    <TableCell className="text-right font-mono">{b.quantity.toLocaleString()} {data.unitOfMeasure}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Movement history</CardTitle></CardHeader>
        <CardContent className="p-0">
          {data.movements.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No movements recorded yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Issued to / Reason</TableHead>
                  <TableHead>Recorded by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{format(new Date(m.createdAt), "dd MMM yyyy, HH:mm")}</TableCell>
                    <TableCell><MovementBadge type={m.movementType} /></TableCell>
                    <TableCell className="text-right font-mono">{m.quantity.toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{m.reference ?? "—"}</TableCell>
                    <TableCell className="text-sm">{m.issuedToName ?? m.reason ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.actor?.fullName ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showMovement} onOpenChange={setShowMovement}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record stock movement</DialogTitle>
            <DialogDescription>{MOVEMENT_LABEL[movementType]} — {data.itemName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Movement type</Label>
              <Select value={movementType} onValueChange={(v) => setMovementType(v as typeof movementType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receive">Receive (add stock)</SelectItem>
                  <SelectItem value="issue">Issue (remove stock)</SelectItem>
                  <SelectItem value="transfer">Transfer (move between locations)</SelectItem>
                  <SelectItem value="adjust">Adjust (correction)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input type="number" min="1" value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })} />
            </div>
            {movementType === "transfer" && (
              <div>
                <Label>Destination facility *</Label>
                <Select value={movementForm.to_facility_id} onValueChange={(v) => setMovementForm({ ...movementForm, to_facility_id: v })}>
                  <SelectTrigger><SelectValue placeholder={facilities ? "Select destination" : "Loading…"} /></SelectTrigger>
                  <SelectContent>
                    {(facilities ?? []).filter((f) => f.id !== data.facility?.id).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.facilityName}{f.districtName ? ` · ${f.districtName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {data.facility?.facilityName && (
                  <p className="text-xs text-muted-foreground mt-1">Source: {data.facility.facilityName}</p>
                )}
              </div>
            )}
            {movementType === "issue" && (
              <div>
                <Label>Issued to (name)</Label>
                <Input value={movementForm.issued_to_name} onChange={(e) => setMovementForm({ ...movementForm, issued_to_name: e.target.value })} />
              </div>
            )}
            <div>
              <Label>Reference (PO / requisition #)</Label>
              <Input value={movementForm.reference} onChange={(e) => setMovementForm({ ...movementForm, reference: e.target.value })} />
            </div>
            <div>
              <Label>Reason / notes</Label>
              <Textarea rows={2} value={movementForm.reason} onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMovement(false)}>Cancel</Button>
            <Button
              onClick={() => movementMutation.mutate()}
              disabled={
                !movementForm.quantity ||
                Number(movementForm.quantity) <= 0 ||
                (movementType === "transfer" && !movementForm.to_facility_id) ||
                movementMutation.isPending
              }
            >
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit stock item</DialogTitle>
            <DialogDescription>Update item details and reorder threshold.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Item name</Label>
              <Input value={editForm.item_name} onChange={(e) => setEditForm({ ...editForm, item_name: e.target.value })} />
            </div>
            <div className="col-span-1">
              <Label>Category</Label>
              <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
            </div>
            <div className="col-span-1">
              <Label>Unit of measure</Label>
              <Input value={editForm.unit_of_measure} onChange={(e) => setEditForm({ ...editForm, unit_of_measure: e.target.value })} />
            </div>
            <div className="col-span-1">
              <Label>Reorder level</Label>
              <Input type="number" min="0" value={editForm.reorder_level} onChange={(e) => setEditForm({ ...editForm, reorder_level: e.target.value })} />
            </div>
            <div className="col-span-1">
              <Label>Unit cost (PGK)</Label>
              <Input value={editForm.unit_cost} onChange={(e) => setEditForm({ ...editForm, unit_cost: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Supplier</Label>
              <Input value={editForm.supplier} onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={!editForm.item_name || editMutation.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
