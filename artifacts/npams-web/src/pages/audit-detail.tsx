import { useCallback, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { NeighborsNav, useNeighbors } from "@/components/neighbors-nav";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES } from "@/App";
import { apiFetchJson } from "@/lib/api-fetch";
import { useGetProvinces, useGetDistrictsByProvince, useGetFacilitiesByDistrict } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, ChevronRight, CheckCircle2, ClipboardList, Play, CheckSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

interface Assignment {
  id: string; status: string; dueDate?: string; createdAt: string;
  provinceId?: string; districtId?: string; facilityId?: string;
  provinceName?: string; districtName?: string; facilityName?: string;
  assignedTo?: string; assignedToName?: string; itemCount: number;
}

interface AuditSessionDetail {
  id: string; name: string; description?: string; status: string;
  startDate?: string; endDate?: string; createdAt: string;
  provinceName?: string; provinceId?: string; createdByName?: string;
  assignments: Assignment[];
}

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-100 text-blue-800 border-blue-200",
  active: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-gray-100 text-gray-700 border-gray-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
};

function cap(s: string) { return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

const NATIONAL_SCOPES = ["national"];

export default function AuditDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]) : false;

  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({
    provinceId: "", districtId: "", facilityId: "", assignedTo: "", dueDate: "",
  });

  const { data: neighbors, loading: neighborsLoading, ctxNonce } = useNeighbors(
    id ? `/api/v1/audit/sessions/${id}/neighbors` : null,
    "npams_audit_sessions_list_ctx",
  );
  const goToNeighbor = useCallback(
    (nid: string) => setLocation(`/audit/${nid}${ctxNonce ? `?ctx=${ctxNonce}` : ""}`),
    [setLocation, ctxNonce],
  );

  const { data: session, isLoading } = useQuery<AuditSessionDetail>({
    queryKey: ["audit-session", id],
    queryFn: async () => {
      const r = await apiFetchJson<AuditSessionDetail>(`/api/v1/audit/sessions/${id}`);
      if (!r.ok) throw new Error(r.message);
      return r.data!;
    },
  });

  const { data: provincesData } = useGetProvinces({ query: { enabled: showAssign } });
  const { data: districtsData } = useGetDistrictsByProvince(
    assignForm.provinceId,
    { query: { enabled: showAssign && !!assignForm.provinceId } }
  );
  const { data: facilitiesData } = useGetFacilitiesByDistrict(
    assignForm.districtId,
    { query: { enabled: showAssign && !!assignForm.districtId } }
  );

  const officersQuery = useQuery<{ id: string; fullName: string }[]>({
    queryKey: ["officers-list"],
    queryFn: async () => {
      const r = await apiFetchJson<{ id: string; fullName: string }[]>("/api/v1/users?limit=200");
      return r.data ?? [];
    },
    enabled: showAssign,
  });

  const patchSession = useMutation({
    mutationFn: (status: string) => apiFetchJson(`/api/v1/audit/sessions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: (res) => {
      if (!res.ok) { toast({ variant: "destructive", title: res.message }); return; }
      toast({ title: "Session status updated" });
      qc.invalidateQueries({ queryKey: ["audit-session", id] });
      qc.invalidateQueries({ queryKey: ["audit-sessions"] });
    },
  });

  const createAssignment = useMutation({
    mutationFn: () => apiFetchJson(`/api/v1/audit/sessions/${id}/assignments`, {
      method: "POST",
      body: JSON.stringify({
        provinceId: assignForm.provinceId || undefined,
        districtId: assignForm.districtId || undefined,
        facilityId: assignForm.facilityId || undefined,
        assignedTo: assignForm.assignedTo || undefined,
        dueDate: assignForm.dueDate || undefined,
      }),
    }),
    onSuccess: (res) => {
      if (!res.ok) { toast({ variant: "destructive", title: res.message }); return; }
      toast({ title: "Assignment created" });
      qc.invalidateQueries({ queryKey: ["audit-session", id] });
      setShowAssign(false);
      setAssignForm({ provinceId: "", districtId: "", facilityId: "", assignedTo: "", dueDate: "" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Session not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/audit")}>Back to Audit</Button>
      </div>
    );
  }

  const completedCount = session.assignments.filter(a => a.status === "completed").length;
  const totalCount = session.assignments.length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ClipboardList className="w-5 h-5" />}
        title={session.name}
        subtitle={
          <>
            {session.description && <span className="block">{session.description}</span>}
            <span className="flex items-center gap-4 mt-1 flex-wrap">
              {session.provinceName && <span>Province: {session.provinceName}</span>}
              {session.startDate && <span>Start: {format(new Date(session.startDate), "dd MMM yyyy")}</span>}
              {session.endDate && <span>End: {format(new Date(session.endDate), "dd MMM yyyy")}</span>}
              <span>By {session.createdByName ?? "system"}</span>
            </span>
          </>
        }
        breadcrumbs={[
          { label: "Audit Sessions", href: "/audit" },
          { label: session.name },
        ]}
        badge={<Badge className={`${STATUS_COLORS[session.status] ?? ""} text-sm`}>{cap(session.status)}</Badge>}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/audit")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            {isAdmin && session.status === "planned" && (
              <Button onClick={() => patchSession.mutate("active")} disabled={patchSession.isPending}>
                <Play className="w-4 h-4 mr-2" /> Start Session
              </Button>
            )}
            {isAdmin && session.status === "active" && (
              <Button variant="outline" onClick={() => patchSession.mutate("completed")} disabled={patchSession.isPending}>
                <CheckSquare className="w-4 h-4 mr-2" /> Complete Session
              </Button>
            )}
            {isAdmin && session.status === "active" && (
              <Button onClick={() => setShowAssign(true)}>
                <Plus className="w-4 h-4 mr-2" /> Add Assignment
              </Button>
            )}
          </>
        }
      />

      <NeighborsNav
        data={neighbors}
        loading={neighborsLoading}
        onNavigate={goToNeighbor}
        noun="audit session"
      />

      {totalCount > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{totalCount}</p>
              <p className="text-sm text-muted-foreground">Total Assignments</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-700">{completedCount}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-600">{totalCount - completedCount}</p>
              <p className="text-sm text-muted-foreground">Pending / In Progress</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Assignments ({totalCount})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Assets</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.assignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      No assignments yet. {isAdmin && session.status === "active" ? "Click \"Add Assignment\" to begin." : ""}
                    </TableCell>
                  </TableRow>
                ) : session.assignments.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="text-sm">
                        {[a.provinceName, a.districtName, a.facilityName].filter(Boolean).join(" › ") || "Not specified"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{a.assignedToName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell className="text-sm">{a.itemCount} asset{a.itemCount !== 1 ? "s" : ""}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_COLORS[a.status] ?? ""}`}>{cap(a.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.dueDate ? format(new Date(a.dueDate), "dd MMM yyyy") : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setLocation(`/audit/verify/${a.id}`)}
                      >
                        {a.status === "completed" ? <><CheckCircle2 className="w-3 h-3 mr-1 text-green-600" /> View</> : <><ChevronRight className="w-3 h-3 mr-1" /> Verify</>}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Assignment</DialogTitle>
            <DialogDescription>Assign an officer to verify assets at a specific location.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Province</Label>
              <Select value={assignForm.provinceId} onValueChange={v => setAssignForm(f => ({ ...f, provinceId: v, districtId: "", facilityId: "" }))}>
                <SelectTrigger><SelectValue placeholder="Select province" /></SelectTrigger>
                <SelectContent>
                  {provincesData?.data?.map(p => <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>District</Label>
              <Select value={assignForm.districtId} onValueChange={v => setAssignForm(f => ({ ...f, districtId: v, facilityId: "" }))} disabled={!assignForm.provinceId}>
                <SelectTrigger><SelectValue placeholder="Select district (optional)" /></SelectTrigger>
                <SelectContent>
                  {districtsData?.data?.map(d => <SelectItem key={d.id} value={d.id!}>{d.districtName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Facility</Label>
              <Select value={assignForm.facilityId} onValueChange={v => setAssignForm(f => ({ ...f, facilityId: v }))} disabled={!assignForm.districtId}>
                <SelectTrigger><SelectValue placeholder="Select facility (optional)" /></SelectTrigger>
                <SelectContent>
                  {facilitiesData?.data?.map(f => <SelectItem key={f.id} value={f.id!}>{f.facilityName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Assign To Officer</Label>
              <Select value={assignForm.assignedTo} onValueChange={v => setAssignForm(f => ({ ...f, assignedTo: v }))}>
                <SelectTrigger><SelectValue placeholder="Select officer (optional)" /></SelectTrigger>
                <SelectContent>
                  {(officersQuery.data ?? []).map(u => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" value={assignForm.dueDate} onChange={e => setAssignForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button onClick={() => createAssignment.mutate()} disabled={createAssignment.isPending}>
              {createAssignment.isPending ? "Creating..." : "Create Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
