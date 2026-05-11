import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Boxes, Plus, AlertTriangle, ArrowRight, ShoppingCart } from "lucide-react";
import { ReorderDialog, type ReorderItem } from "@/components/reorder-dialog";
import { PageHeader } from "@/components/layout/page-header";

type StockBalanceSummary = {
  facilityId: string | null;
  facilityName: string | null;
  quantity: number;
  reorderLevel: number;
};

type StockItem = {
  id: string;
  itemCode: string;
  itemName: string;
  category: string | null;
  unitOfMeasure: string;
  onHandQuantity: number;
  reorderLevel: number;
  unitCost: string | null;
  supplier: string | null;
  notes: string | null;
  agency?: { id: string; agencyName: string; agencyCode: string } | null;
  province?: { id: string; provinceName: string } | null;
  facility?: { id: string; facilityName: string } | null;
  balances?: StockBalanceSummary[];
  totalQuantity?: number;
  lowLocationCount?: number;
};

const EMPTY_FORM = {
  item_code: "",
  item_name: "",
  category: "",
  unit_of_measure: "each",
  on_hand_quantity: "0",
  reorder_level: "0",
  unit_cost: "",
  supplier: "",
  notes: "",
};

export default function StockPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]) : false;

  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const openDetail = (stockId: string) => {
    const ctx: Record<string, string> = {};
    if (search) ctx.search = search;
    if (lowOnly) ctx.low_stock = "true";
    const nonce = Math.random().toString(36).slice(2, 10);
    try {
      sessionStorage.setItem(`npams_stock_list_ctx_${nonce}`, JSON.stringify(ctx));
    } catch { /* ignore */ }
    setLocation(`/stock/${stockId}?ctx=${nonce}`);
  };
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [reorderItem, setReorderItem] = useState<ReorderItem | null>(null);

  const { data: items, isLoading } = useQuery<StockItem[]>({
    queryKey: ["stock", { search, lowOnly }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (lowOnly) params.set("low_stock", "true");
      const r = await apiFetchJson<StockItem[]>(`/api/v1/stock?${params.toString()}`);
      return r.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetchJson("/api/v1/stock", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error(r.message);
      return r.data;
    },
    onSuccess: () => {
      toast({ title: "Stock item created" });
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Create failed", description: (e as Error).message }),
  });

  const lowCount = (items ?? []).filter((i) => (i.lowLocationCount ?? 0) > 0).length;

  // Prefill the item code from the latest existing item in the user's scope
  // when the New Stock Item dialog opens. Format: `[AGENCY]-STK-[NNN]` with
  // the numeric suffix incremented while preserving its zero-padding width.
  // Falls back to `[AGENCY]-STK-001` when no items exist yet, or leaves the
  // field blank when the latest code doesn't match the expected pattern.
  const [codeHint, setCodeHint] = useState<string>("");
  useEffect(() => {
    if (!showCreate) {
      // Reset on close so the next open recomputes from the latest sequence
      // rather than retaining a stale value from a previous open.
      setCodeHint("");
      setForm((f) => ({ ...f, item_code: "" }));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetchJson<{ latestCode: string | null; agencyCode: string | null }>(
          "/api/v1/stock/latest-code",
        );
        if (cancelled || !r.ok) return;
        const latest = r.data?.latestCode ?? null;
        const agencyCode = r.data?.agencyCode ?? null;
        let nextCode = "";
        if (latest) {
          const m = latest.match(/^([A-Z0-9]+)-STK-(\d+)$/);
          if (m) {
            const prefix = m[1];
            const num = m[2];
            const next = String(Number(num) + 1).padStart(num.length, "0");
            nextCode = `${prefix}-STK-${next}`;
          }
        } else if (agencyCode) {
          nextCode = `${agencyCode}-STK-001`;
        }
        setCodeHint(nextCode);
        setForm((f) => (f.item_code ? f : { ...f, item_code: nextCode }));
      } catch {
        // Leave the field as-is on failure; user can type a code manually.
      }
    })();
    return () => { cancelled = true; };
  }, [showCreate]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Boxes className="w-5 h-5" />}
        title="Stock & Inventory"
        subtitle="Consumables, stationery, uniforms and other inventoried supplies."
        breadcrumbs={[{ label: "Stock & Inventory" }]}
        actions={isAdmin && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New stock item
          </Button>
        )}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total items</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{items?.length ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Below reorder level</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold flex items-center gap-2">
              {lowCount}
              {lowCount > 0 && <AlertTriangle className="w-5 h-5 text-amber-600" />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total quantity on hand</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{(items ?? []).reduce((s, i) => s + (i.totalQuantity ?? i.onHandQuantity), 0).toLocaleString()}</div></CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search by name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button variant={lowOnly ? "default" : "outline"} size="sm" onClick={() => setLowOnly((v) => !v)}>
          {lowOnly ? "Showing low stock" : "Show low stock only"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (items?.length ?? 0) === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No stock items found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Locations</TableHead>
                  <TableHead className="text-right">Total on hand</TableHead>
                  <TableHead>UoM</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items?.map((it) => {
                  const balances = it.balances ?? [];
                  const total = it.totalQuantity ?? it.onHandQuantity;
                  const lowLocs = it.lowLocationCount ?? 0;
                  const low = lowLocs > 0;
                  return (
                    <TableRow key={it.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openDetail(it.id)}>
                      <TableCell className="font-mono text-xs">{it.itemCode}</TableCell>
                      <TableCell className="font-medium">{it.itemName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{it.category ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {balances.length === 0 ? (
                          <span className="text-muted-foreground">No balance rows</span>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="text-xs font-medium">{balances.length} location{balances.length === 1 ? "" : "s"}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                              {balances.slice(0, 3).map((b) => `${b.facilityName ?? "Reserve"} (${b.quantity})`).join(", ")}
                              {balances.length > 3 ? ` +${balances.length - 3}` : ""}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{total.toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{it.unitOfMeasure}</TableCell>
                      <TableCell>
                        {low ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">Low at {lowLocs}</Badge>
                        ) : (
                          <Badge variant="outline">OK</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {low && (
                            <Button variant="outline" size="sm" onClick={() => setReorderItem({
                              id: it.id, itemCode: it.itemCode, itemName: it.itemName, unitOfMeasure: it.unitOfMeasure,
                              onHandQuantity: it.onHandQuantity, reorderLevel: it.reorderLevel,
                              supplier: it.supplier, unitCost: it.unitCost,
                            })}>
                              <ShoppingCart className="w-4 h-4 mr-1" /> Reorder
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openDetail(it.id)}>
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ReorderDialog item={reorderItem} open={!!reorderItem} onOpenChange={(o) => !o && setReorderItem(null)} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Stock Item</DialogTitle>
            <DialogDescription>Add a consumable or inventory item.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-1">
              <Label>Item code *</Label>
              <Input
                value={form.item_code}
                placeholder={codeHint || "AGENCY-STK-001"}
                onChange={(e) => setForm({ ...form, item_code: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Suggested next code in the [AGENCY]-STK-[NNN] sequence. Editable.
              </p>
            </div>
            <div className="col-span-1">
              <Label>Unit of measure</Label>
              <Input value={form.unit_of_measure} onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Item name *</Label>
              <Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="col-span-1">
              <Label>Initial quantity</Label>
              <Input type="number" value={form.on_hand_quantity} onChange={(e) => setForm({ ...form, on_hand_quantity: e.target.value })} />
            </div>
            <div className="col-span-1">
              <Label>Reorder level</Label>
              <Input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
            </div>
            <div className="col-span-1">
              <Label>Unit cost (PGK)</Label>
              <Input value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
            </div>
            <div className="col-span-1">
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.item_code || !form.item_name || createMutation.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
