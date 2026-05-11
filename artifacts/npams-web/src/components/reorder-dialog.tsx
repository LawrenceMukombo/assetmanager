import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ShieldCheck } from "lucide-react";

export type ReorderItem = {
  id: string;
  itemCode: string;
  itemName: string;
  unitOfMeasure: string;
  onHandQuantity: number;
  reorderLevel: number;
  supplier?: string | null;
  unitCost?: string | null;
};

interface Props {
  item: ReorderItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function suggestedQty(it: ReorderItem): number {
  const target = Math.max(it.reorderLevel * 2, it.reorderLevel + 1, 1);
  return Math.max(target - it.onHandQuantity, 1);
}

export function ReorderDialog({ item, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [quantity, setQuantity] = useState("");
  const [supplier, setSupplier] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [notes, setNotes] = useState("");
  const [signedName, setSignedName] = useState("");

  useEffect(() => {
    if (item && open) {
      setQuantity(String(suggestedQty(item)));
      setSupplier(item.supplier ?? "");
      setUnitCost(item.unitCost ?? "");
      setNotes("");
      setRequiredBy("");
      setSignedName(user?.full_name ?? "");
    }
  }, [item, open, user?.full_name]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("No item");
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Enter a valid quantity");
      if (signedName.trim().length < 2) throw new Error("Type your full name to sign this request");
      const r = await apiFetchJson("/api/v1/purchase-requests", {
        method: "POST",
        body: JSON.stringify({
          stock_item_id: item.id,
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
      toast({ title: "Purchase request submitted", description: "Routed to admins for approval." });
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Could not submit request", description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reorder {item?.itemName}</DialogTitle>
          <DialogDescription>
            Raise a purchase request. It will be routed to an Agency Admin for approval.
          </DialogDescription>
        </DialogHeader>
        {item && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              <span className="font-mono">{item.itemCode}</span> — on hand {item.onHandQuantity} {item.unitOfMeasure},
              reorder level {item.reorderLevel}.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-1">
                <Label>Quantity to order *</Label>
                <Input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))} />
              </div>
              <div className="col-span-1">
                <Label>Unit cost (PGK)</Label>
                <Input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Supplier</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" />
              </div>
              <div className="col-span-2">
                <Label>Required by</Label>
                <Input type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Justification, urgency, delivery instructions…" />
              </div>
              <div className="col-span-2 rounded-md border bg-blue-50/50 p-3">
                <Label className="flex items-center gap-1.5 text-blue-900">
                  <ShieldCheck className="w-4 h-4" /> Digital signature *
                </Label>
                <Input
                  className="mt-1 bg-white font-serif italic"
                  value={signedName}
                  onChange={(e) => setSignedName(e.target.value)}
                  placeholder="Type your full name"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Typing your name here records a SHA-256 signature on this request.
                </p>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !quantity || Number(quantity) <= 0 || signedName.trim().length < 2}>
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
