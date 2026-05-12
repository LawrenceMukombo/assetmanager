import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES } from "@/App";
import { apiFetchJson } from "@/lib/api-fetch";
import { useGetAssets, useGetProvinces } from "@workspace/api-client-react";
import { format, isPast, isWithinInterval, addDays } from "date-fns";
import {
  Card, CardContent, CardHeader, CardTitle,
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DataTablePagination, useClientPagination } from "@/components/data-table-pagination";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Wrench, Plus, CheckCircle2, AlertTriangle, Clock, X, Pencil } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

interface MaintenanceRecord {
  id: string; title: string; description?: string; status: string; priority: string;
  scheduledDate: string; completedDate?: string; estimatedCost?: string; actualCost?: string;
  notes?: string; completionNotes?: string; createdAt: string;
  assetId: string; assetTag?: string; assetName?: string; provinceName?: string;
  assignedTo?: string; assignedToName?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

function cap(s: string) { return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

const EMPTY_FORM = {
  assetId: "", title: "", description: "", priority: "medium",
  scheduledDate: "", assignedTo: "", estimatedCost: "", notes: "",
};

export default function Maintenance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]) : false;

  const [showCreate, setShowCreate] = useState(false);
  const [editRecord, setEditRecord] = useState<MaintenanceRecord | null>(null);
  const [completeRecord, setCompleteRecord] = useState<MaintenanceRecord | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assetSearch, setAssetSearch] = useState("");

  const { data: records, isLoading } = useQuery<MaintenanceRecord[]>({
    queryKey: ["maintenance"],
    queryFn: async () => {
      const r = await apiFetchJson<MaintenanceRecord[]>("/api/v1/maintenance");
      return r.data ?? [];
    },
    refetchInterval: 30000,
  });

  const { data: assetsData } = useGetAssets(
    { search: assetSearch, limit: 50 },
    { query: { enabled: showCreate || !!editRecord } }
  );

  const createMutation = useMutation({
    mutationFn: () => apiFetchJson("/api/v1/maintenance", {
      method: "POST",
      body: JSON.stringify({
        assetId: form.assetId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        scheduledDate: form.scheduledDate,
        assignedTo: form.assignedTo || undefined,
        estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : undefined,
        notes: form.notes.trim() || undefined,
      }),
    }),
    onSuccess: (res) => {
      if (!res.ok) { toast({ variant: "destructive", title: res.message }); return; }
      toast({ title: "Maintenance task scheduled" });
      qc.invalidateQueries({ queryKey: ["maintenance"] });
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      apiFetchJson(`/api/v1/maintenance/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: (res, vars) => {
      if (!res.ok) { toast({ variant: "destructive", title: res.message }); return; }
      const isComplete = (vars.patch.status as string) === "completed";
      toast({ title: isComplete ? "Maintenance marked complete" : "Record updated" });
      qc.invalidateQueries({ queryKey: ["maintenance"] });
      setCompleteRecord(null);
      setEditRecord(null);
      setCompletionNotes("");
      setActualCost("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetchJson(`/api/v1/maintenance/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (!res.ok) { toast({ variant: "destructive", title: res.message }); return; }
      toast({ title: "Record deleted" });
      qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });

  const filtered = (records ?? []).filter(r => statusFilter === "all" || r.status === statusFilter);
  const { pageItems: maintPageItems, paginationProps: maintPaginationProps } =
    useClientPagination<MaintenanceRecord>(filtered, 20);
  const overdue = (records ?? []).filter(r => r.status === "scheduled" && isPast(new Date(r.scheduledDate)));
  const dueSoon = (records ?? []).filter(r => r.status === "scheduled" && !isPast(new Date(r.scheduledDate)) &&
    isWithinInterval(new Date(r.scheduledDate), { start: new Date(), end: addDays(new Date(), 7) }));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Wrench className="w-5 h-5" />}
        title="Maintenance"
        subtitle="Schedule and track asset maintenance tasks."
        breadcrumbs={[{ label: "Maintenance" }]}
        actions={isAdmin && (
          <Button onClick={() => { setForm({ ...EMPTY_FORM }); setShowCreate(true); }}>
            <Plus className="w-4 h-4" /> Schedule maintenance
          </Button>
        )}
      />

      {(overdue.length > 0 || dueSoon.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {overdue.length > 0 && (
            <Card className="border-red-300 bg-red-50 dark:bg-red-950/20">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-600 shrink-0" />
                <div>
                  <p className="font-semibold text-red-800 dark:text-red-400">{overdue.length} Overdue Task{overdue.length > 1 ? "s" : ""}</p>
                  <p className="text-sm text-red-700 dark:text-red-500">Past scheduled date and not yet completed.</p>
                </div>
              </CardContent>
            </Card>
          )}
          {dueSoon.length > 0 && (
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="w-8 h-8 text-amber-600 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-400">{dueSoon.length} Due Within 7 Days</p>
                  <p className="text-sm text-amber-700 dark:text-amber-500">Upcoming maintenance needing attention.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all">All ({records?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
        <TabsContent value={statusFilter} className="mt-4">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Assigned To</TableHead>
                  {isAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: isAdmin ? 7 : 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}</TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-12 text-muted-foreground">
                      <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>No maintenance tasks found.</p>
                    </TableCell>
                  </TableRow>
                ) : maintPageItems.map(r => {
                  const isOverdue = r.status === "scheduled" && isPast(new Date(r.scheduledDate));
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{r.title}</p>
                          {r.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-mono text-sm">{r.assetTag}</p>
                          <p className="text-xs text-muted-foreground">{r.assetName}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize text-xs ${PRIORITY_COLORS[r.priority] ?? ""}`}>
                          {r.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLORS[r.status] ?? ""}`}>
                          {cap(r.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={isOverdue ? "text-destructive font-medium" : ""}>
                          {format(new Date(r.scheduledDate), "dd MMM yyyy")}
                          {isOverdue && " (Overdue)"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{r.assignedToName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {r.status !== "completed" && r.status !== "cancelled" && (
                              <Button
                                variant="ghost" size="sm"
                                className="text-green-700 hover:text-green-800"
                                onClick={() => { setCompleteRecord(r); setCompletionNotes(""); setActualCost(""); }}
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
                              </Button>
                            )}
                            {r.status !== "completed" && (
                              <Button variant="ghost" size="sm" onClick={() => {
                                setEditRecord(r);
                                setForm({
                                  assetId: r.assetId, title: r.title,
                                  description: r.description ?? "", priority: r.priority,
                                  scheduledDate: r.scheduledDate ? r.scheduledDate.slice(0, 10) : "",
                                  assignedTo: r.assignedTo ?? "", estimatedCost: r.estimatedCost ?? "",
                                  notes: r.notes ?? "",
                                });
                              }}>
                                <Pencil className="w-3 h-3 mr-1" /> Edit
                              </Button>
                            )}
                            <Button
                              variant="ghost" size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteMutation.mutate(r.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!isLoading && filtered.length > 0 && (
              <DataTablePagination {...maintPaginationProps} label="tasks" />
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showCreate || !!editRecord} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditRecord(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editRecord ? "Edit Maintenance Task" : "Schedule Maintenance"}</DialogTitle>
            <DialogDescription>
              {editRecord ? "Update the maintenance task details." : "Create a new maintenance task for an asset."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto pr-1 flex-1">
            {!editRecord && (
              <div className="space-y-1">
                <Label>Asset <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Search assets by name or tag..."
                  value={assetSearch}
                  onChange={e => { setAssetSearch(e.target.value); setForm(f => ({ ...f, assetId: "" })); }}
                />
                {assetSearch && (assetsData?.data?.items ?? []).length > 0 && !form.assetId && (
                  <div className="border rounded-md max-h-40 overflow-y-auto divide-y bg-background z-10">
                    {(assetsData?.data?.items ?? []).map((a) => (
                      <button
                        key={a.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2"
                        onClick={() => { setForm(f => ({ ...f, assetId: a.id! })); setAssetSearch(`${a.assetTag} — ${a.assetName}`); }}
                      >
                        <span className="font-mono text-xs">{a.assetTag}</span>
                        <span>{a.assetName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {editRecord && (
              <div className="p-3 bg-muted/40 rounded-lg text-sm">
                <span className="text-muted-foreground">Asset: </span>
                <span className="font-mono">{editRecord.assetTag}</span> — {editRecord.assetName}
              </div>
            )}
            <div className="space-y-1">
              <Label>Task Title <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Annual generator service" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} placeholder="What needs to be done?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["low", "medium", "high", "critical"].map(p => (
                      <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Scheduled Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Estimated Cost (K)</Label>
                <Input type="number" min="0" placeholder="0.00" value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Additional details..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditRecord(null); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (editRecord) {
                  updateMutation.mutate({ id: editRecord.id, patch: {
                    title: form.title.trim(), description: form.description.trim() || null,
                    priority: form.priority, scheduledDate: form.scheduledDate,
                    estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : null,
                    notes: form.notes.trim() || null,
                  }});
                } else {
                  createMutation.mutate();
                }
              }}
              disabled={createMutation.isPending || updateMutation.isPending || !form.title.trim() || !form.scheduledDate || (!editRecord && !form.assetId)}
            >
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editRecord ? "Save Changes" : "Schedule Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {completeRecord && (
        <Dialog open={!!completeRecord} onOpenChange={(open) => { if (!open) setCompleteRecord(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Complete Maintenance</DialogTitle>
              <DialogDescription>Mark "{completeRecord.title}" as completed.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Actual Cost (K)</Label>
                <Input type="number" min="0" placeholder="0.00" value={actualCost} onChange={e => setActualCost(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Completion Notes</Label>
                <Textarea rows={3} placeholder="What was done, any findings..." value={completionNotes} onChange={e => setCompletionNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCompleteRecord(null)}>Cancel</Button>
              <Button
                className="bg-green-700 hover:bg-green-800"
                onClick={() => updateMutation.mutate({ id: completeRecord.id, patch: {
                  status: "completed",
                  actualCost: actualCost ? parseFloat(actualCost) : null,
                  completionNotes: completionNotes.trim() || null,
                }})}
                disabled={updateMutation.isPending}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? "Saving..." : "Mark Complete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
