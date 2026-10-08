import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES, OFFICER_ROLES } from "@/App";
import { apiFetchJson } from "@/lib/api-fetch";
import { useGetProvinces } from "@workspace/api-client-react";
import { useOrganization } from "@/context/organization-context";
import { format } from "date-fns";
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
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardList, Plus, ChevronRight, CalendarClock, CheckCircle2, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTablePagination, useClientPagination } from "@/components/data-table-pagination";

function PaginatedAuditGrid({
  list,
  onCardClick,
}: {
  list: AuditSession[];
  onCardClick: (s: AuditSession) => void;
}) {
  const { pageItems, paginationProps } = useClientPagination<AuditSession>(list, 12);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pageItems.map(s => (
          <Card
            key={s.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onCardClick(s)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base leading-tight">{s.name}</CardTitle>
                <Badge className={`text-xs shrink-0 ${STATUS_COLORS[s.status] ?? ""}`}>{statusLabel(s.status)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {s.description && <p className="text-sm text-muted-foreground line-clamp-2">{s.description}</p>}
              <div className="text-xs text-muted-foreground space-y-1">
                {s.provinceName && <p className="flex items-center gap-1"><CalendarClock className="w-3 h-3" />{s.provinceName}</p>}
                {s.startDate && <p>Start: {format(new Date(s.startDate), "dd MMM yyyy")}</p>}
                {s.endDate && <p>End: {format(new Date(s.endDate), "dd MMM yyyy")}</p>}
                <p>Created by {s.createdByName ?? "system"} · {format(new Date(s.createdAt), "dd MMM yyyy")}</p>
              </div>
              <div className="flex items-center gap-1 pt-1 text-primary text-sm font-medium">
                View Details <ChevronRight className="w-4 h-4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-3 rounded-lg border bg-card">
        <DataTablePagination {...paginationProps} label="sessions" pageSizeOptions={[6, 12, 24, 48]} />
      </div>
    </>
  );
}

interface AuditSession {
  id: string; name: string; description?: string; status: string;
  startDate?: string; endDate?: string; createdAt: string;
  provinceName?: string; provinceId?: string; createdByName?: string;
}

interface MyAssignment {
  id: string; sessionId: string; sessionName: string; sessionStatus: string;
  status: string; dueDate?: string; facilityName?: string;
  districtName?: string; provinceName?: string; createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-100 text-blue-800 border-blue-200",
  active: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-gray-100 text-gray-700 border-gray-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
};

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function Audit() {
  const { user } = useAuth();
  const { activeAgencyId } = useOrganization();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]) : false;
  const isOfficer = user?.role ? OFFICER_ROLES.includes(user.role as typeof OFFICER_ROLES[number]) : false;

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", provinceId: "", startDate: "", endDate: "" });

  const { data: sessions, isLoading } = useQuery<AuditSession[]>({
    queryKey: ["audit-sessions", activeAgencyId],
    queryFn: async () => {
      const r = await apiFetchJson<AuditSession[]>("/api/v1/audit/sessions");
      return r.data ?? [];
    },
  });

  const { data: myAssignments } = useQuery<MyAssignment[]>({
    queryKey: ["my-audit-assignments", activeAgencyId],
    queryFn: async () => {
      const r = await apiFetchJson<MyAssignment[]>("/api/v1/audit/assignments/mine");
      return r.data ?? [];
    },
    enabled: isOfficer,
  });

  const { data: provincesData } = useGetProvinces({ query: { enabled: isAdmin && user?.scope_level === "national" } });

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiFetchJson("/api/v1/audit/sessions", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          provinceId: form.provinceId || undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
        }),
      });
    },
    onSuccess: (res) => {
      if (!res.ok) { toast({ variant: "destructive", title: res.message }); return; }
      toast({ title: "Audit session created" });
      qc.invalidateQueries({ queryKey: ["audit-sessions"] });
      setShowCreate(false);
      setForm({ name: "", description: "", provinceId: "", startDate: "", endDate: "" });
    },
  });

  const activeSessions = sessions?.filter(s => s.status === "active") ?? [];
  const pendingAssignments = myAssignments?.filter(a => a.status !== "completed") ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ClipboardList className="w-5 h-5" />}
        title="Audit Sessions"
        subtitle="Create and manage physical asset verification campaigns."
        breadcrumbs={[{ label: "Audit Sessions" }]}
        actions={isAdmin && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New session
          </Button>
        )}
      />

      {isOfficer && pendingAssignments.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-400">
              <ClipboardCheck className="w-4 h-4" /> My Pending Assignments ({pendingAssignments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingAssignments.map(a => (
              <div
                key={a.id}
                className="flex items-center justify-between p-3 bg-white dark:bg-card rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setLocation(`/audit/verify/${a.id}`)}
              >
                <div>
                  <p className="font-medium text-sm">{a.sessionName}</p>
                  <p className="text-xs text-muted-foreground">{[a.provinceName, a.districtName, a.facilityName].filter(Boolean).join(" › ")}</p>
                  {a.dueDate && <p className="text-xs text-muted-foreground">Due: {format(new Date(a.dueDate), "dd MMM yyyy")}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${STATUS_COLORS[a.status] ?? ""}`}>{statusLabel(a.status)}</Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Sessions</TabsTrigger>
          <TabsTrigger value="active">Active ({activeSessions.length})</TabsTrigger>
        </TabsList>

        {(["all", "active"] as const).map(tab => (
          <TabsContent key={tab} value={tab} className="mt-4">
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
                ))}
              </div>
            ) : (
              (() => {
                const list = tab === "active" ? activeSessions : (sessions ?? []);
                return list.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No {tab === "active" ? "active " : ""}audit sessions</p>
                    {isAdmin && <p className="text-sm mt-1">Create a new session to begin auditing assets.</p>}
                  </div>
                ) : (
                  <PaginatedAuditGrid
                    list={list}
                    onCardClick={(s) => {
                      const ctx: Record<string, string> = {};
                      if (tab === "active") ctx.status = "active";
                      const nonce = Math.random().toString(36).slice(2, 10);
                      try {
                        sessionStorage.setItem(`npams_audit_sessions_list_ctx_${nonce}`, JSON.stringify(ctx));
                      } catch { /* ignore */ }
                      setLocation(`/audit/${s.id}?ctx=${nonce}`);
                    }}
                  />
                );
              })()
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Audit Session</DialogTitle>
            <DialogDescription>Create a new asset verification campaign for a province or region.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Session Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Q2 2026 Morobe Audit" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea placeholder="Optional details about the audit scope..." rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            {user?.scope_level === "national" && (
              <div className="space-y-1">
                <Label>Province Scope</Label>
                <Select value={form.provinceId} onValueChange={v => setForm(f => ({ ...f, provinceId: v }))}>
                  <SelectTrigger><SelectValue placeholder="All provinces (national)" /></SelectTrigger>
                  <SelectContent>
                    {provincesData?.data?.map(p => <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name.trim()}>
              {createMutation.isPending ? "Creating..." : "Create Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
