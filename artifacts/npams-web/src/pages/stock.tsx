import { useState } from "react";
import { Link } from "wouter";
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
import { Boxes, Plus, AlertTriangle, ArrowRight } from "lucide-react";

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

  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]) : false;

  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

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

  const lowCount = (items ?? []).filter((i) => i.onHandQuantity <= i.reorderLevel).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Boxes className="w-6 h-6" /> Stock & Inventory
          </h1>
          <p className="text-sm text-muted-foreground">Consumables, stationery, uniforms and other inventoried supplies.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Stock Item
          </Button>
        )}
      </div>

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
          <CardContent><div className="text-2xl font-semibold">{(items ?? []).reduce((s, i) => s + i.onHandQuantity, 0).toLocaleString()}</div></CardContent>
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
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reorder</TableHead>
                  <TableHead>UoM</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items?.map((it) => {
                  const low = it.onHandQuantity <= it.reorderLevel;
                  return (
                    <TableRow key={it.id} className="cursor-pointer hover:bg-muted/40" onClick={() => (window.location.href = `/stock/${it.id}`)}>
                      <TableCell className="font-mono text-xs">{it.itemCode}</TableCell>
                      <TableCell className="font-medium">{it.itemName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{it.category ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{it.onHandQuantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{it.reorderLevel.toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{it.unitOfMeasure}</TableCell>
                      <TableCell>
                        {low ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">Low</Badge>
                        ) : (
                          <Badge variant="outline">OK</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link href={`/stock/${it.id}`}>
                          <Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4" /></Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Stock Item</DialogTitle>
            <DialogDescription>Add a consumable or inventory item.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-1">
              <Label>Item code *</Label>
              <Input value={form.item_code} onChange={(e) => setForm({ ...form, item_code: e.target.value })} />
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
