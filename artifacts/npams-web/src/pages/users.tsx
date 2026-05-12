import {
  useGetUsers,
  useCreateUser,
  useDeactivateUser,
  getGetUsersQueryKey,
  useGetProvinces,
  useGetDistrictsByProvince,
  useGetFacilitiesByDistrict,
  getGetProvincesQueryKey,
  getGetDistrictsByProvinceQueryKey,
  getGetFacilitiesByDistrictQueryKey,
} from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES } from "@/App";
import { apiFetchJson } from "@/lib/api-fetch";
import { Redirect } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, ShieldCheck, Users as UsersIcon, Trash2, Activity as ActivityIcon, Mail, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Label } from "@/components/ui/label";

interface RoleItem {
  id: string;
  roleName: string;
  scopeLevel: string;
}

const NATIONAL_SCOPES = ["national"];

const ROLE_PERMISSIONS: Record<string, { description: string; permissions: string[] }> = {
  "Super Admin": {
    description: "Full platform access — national scope. Manages all provinces, users, roles, and system configuration.",
    permissions: [
      "View, create, edit, and delete all assets across all provinces",
      "Manage all users — create, edit, deactivate, change roles",
      "Edit province branding (flag URL, theme colour)",
      "Create, edit, and delete districts and facilities",
      "View all reports and audit logs",
      "Configure system-wide settings",
      "Manage roles and permissions",
    ],
  },
  "National Asset Controller": {
    description: "Read/write access to all assets across all provinces. Cannot manage users or system settings.",
    permissions: [
      "View, create, and edit all assets across all provinces",
      "Transfer assets between provinces",
      "Run warranty and depreciation reports",
      "View all provincial data",
      "Cannot manage users or system settings",
    ],
  },
  "National Auditor": {
    description: "Read-only access to all data across all provinces. Audit and compliance role.",
    permissions: [
      "View all assets across all provinces (read-only)",
      "View all users and their scopes (read-only)",
      "View all reports and audit logs",
      "Cannot create, edit, or delete any records",
    ],
  },
  "Provincial Admin": {
    description: "Full access within their assigned province. Can manage provincial users and assets.",
    permissions: [
      "View, create, edit assets within their province",
      "Manage users within their province — create, edit, deactivate",
      "View provincial reports",
      "Cannot access other provinces' data",
      "Cannot create national-scope users",
    ],
  },
  "Provincial Asset Officer": {
    description: "Create and edit assets within their province. Limited user management.",
    permissions: [
      "View, create, and edit assets within their province",
      "Update asset status and condition",
      "View provincial reports",
      "Cannot manage users",
      "Cannot delete assets",
    ],
  },
  "Provincial Viewer": {
    description: "Read-only access within their assigned province.",
    permissions: [
      "View assets within their province (read-only)",
      "View provincial reports (read-only)",
      "Cannot create, edit, or delete any records",
    ],
  },
};

async function fetchRoles(token: string | null): Promise<RoleItem[]> {
  const res = await fetch("/api/v1/roles", {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const json = await res.json();
  return json.data ?? [];
}

const userSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone_number: z.string().optional(),
  department: z.string().optional(),
  job_title: z.string().optional(),
  gender: z.string().optional(),
  date_of_birth: z.string().optional(),
  role_id: z.string().min(1, "Role is required"),
  province_id: z.string().optional(),
  district_id: z.string().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

interface UserRow {
  id?: string;
  fullName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  active?: boolean | null;
  role?: { id?: string | null; roleName?: string | null; scopeLevel?: string | null } | null;
  scope?: { provinceId?: string | null; districtId?: string | null; facilityId?: string | null } | null;
  provinceName?: string | null;
}

const editUserSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  password: z.string().refine(v => v === "" || v.length >= 8, "Password must be at least 8 characters").optional(),
  phone_number: z.string().optional(),
  department: z.string().optional(),
  job_title: z.string().optional(),
  gender: z.string().optional(),
  date_of_birth: z.string().optional(),
  role_id: z.string().min(1, "Role is required"),
  province_id: z.string().optional(),
  district_id: z.string().optional(),
  facility_id: z.string().optional(),
});
type EditUserFormValues = z.infer<typeof editUserSchema>;

interface ActivityEntry {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  createdAt: string;
}

function formatActionType(action: string): string {
  return action
    .split(/[._-]/)
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ""))
    .join(" ");
}

export default function Users() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role as typeof ADMIN_ROLES[number]);
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedProvinceId, setSelectedProvinceId] = useState("");
  const [selectedRoleScope, setSelectedRoleScope] = useState("");

  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editProvinceId, setEditProvinceId] = useState("");
  const [editDistrictId, setEditDistrictId] = useState("");
  const [editRoleScope, setEditRoleScope] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isSendingResetLink, setIsSendingResetLink] = useState(false);

  const handleSendResetLink = async () => {
    if (!editUser?.id) return;
    setIsSendingResetLink(true);
    const result = await apiFetchJson(`/api/v1/users/${editUser.id}/send-password-reset`, { method: "POST" });
    setIsSendingResetLink(false);
    if (result.ok) {
      toast({ title: "Password reset link sent", description: result.message });
    } else {
      toast({ variant: "destructive", title: "Could not send reset link", description: result.message });
    }
  };

  const isNationalAdmin = (user as { scope_level?: string } | null)?.scope_level === "national";

  const token = localStorage.getItem("npams_token");

  const { data, isLoading, refetch } = useGetUsers({
    query: { queryKey: getGetUsersQueryKey() },
  });
  const { data: provincesData } = useGetProvinces({
    query: { queryKey: getGetProvincesQueryKey() },
  });
  const { data: districtsData } = useGetDistrictsByProvince(selectedProvinceId, {
    query: {
      queryKey: getGetDistrictsByProvinceQueryKey(selectedProvinceId),
      enabled: !!selectedProvinceId,
    },
  });
  const { data: rolesData } = useQuery<RoleItem[]>({
    queryKey: ["/api/v1/roles"],
    queryFn: () => fetchRoles(token),
    enabled: isAdmin,
  });

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User created successfully" });
        refetch();
        setIsAddOpen(false);
        form.reset();
      },
      onError: (err: Error) => {
        toast({ variant: "destructive", title: "Failed to create user", description: err.message });
      },
    },
  });

  const deactivateMutation = useDeactivateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User deactivated" });
        refetch();
      },
      onError: (err: Error) => {
        toast({ variant: "destructive", title: "Failed to deactivate user", description: err.message });
      },
    },
  });

  const reactivateUser = async (userId: string) => {
    const result = await apiFetchJson(`/api/v1/users/${userId}/reactivate`, { method: "PATCH" });
    if (result.ok) {
      toast({ title: "User reactivated" });
      refetch();
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      full_name: "", email: "", password: "", phone_number: "",
      department: "", job_title: "", gender: "", date_of_birth: "",
      role_id: "", province_id: "", district_id: "",
    },
  });

  const editForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      full_name: "", password: "", phone_number: "",
      department: "", job_title: "", gender: "", date_of_birth: "",
      role_id: "", province_id: "", district_id: "", facility_id: "",
    },
  });

  const { data: editDistrictsData } = useGetDistrictsByProvince(editProvinceId, {
    query: {
      queryKey: getGetDistrictsByProvinceQueryKey(editProvinceId),
      enabled: !!editProvinceId,
    },
  });
  const { data: editFacilitiesData } = useGetFacilitiesByDistrict(editDistrictId, {
    query: {
      queryKey: getGetFacilitiesByDistrictQueryKey(editDistrictId),
      enabled: !!editDistrictId,
    },
  });

  const editUserId = editUser?.id ?? "";
  const { data: activityData, isLoading: isActivityLoading, isError: isActivityError } = useQuery<ActivityEntry[]>({
    queryKey: ["/api/v1/users", editUserId, "activity"],
    queryFn: async () => {
      const result = await apiFetchJson<ActivityEntry[]>(`/api/v1/users/${editUserId}/activity`);
      if (!result.ok) throw new Error(result.message);
      return result.data ?? [];
    },
    enabled: !!editUserId,
  });

  if (!isAdmin) return <Redirect to="/dashboard" />;

  const onSubmit = (values: UserFormValues) => {
    const payload: Record<string, string | undefined> = {
      full_name: values.full_name,
      email: values.email,
      password: values.password,
      role_id: values.role_id,
    };
    if (values.phone_number) payload.phone_number = values.phone_number;
    if (values.department) payload.department = values.department;
    if (values.job_title) payload.job_title = values.job_title;
    if (values.gender) payload.gender = values.gender;
    if (values.date_of_birth) payload.date_of_birth = values.date_of_birth;
    if (values.province_id) payload.province_id = values.province_id;
    if (values.district_id) payload.district_id = values.district_id;
    createMutation.mutate({ data: payload as UserFormValues });
  };

  const openEditUser = (u: UserRow) => {
    setEditUser(u);
    setEditError(null);
    const provinceId = u.scope?.provinceId ?? "";
    const districtId = u.scope?.districtId ?? "";
    setEditProvinceId(provinceId);
    setEditDistrictId(districtId);
    const role = rolesData?.find(r => r.id === u.role?.id);
    setEditRoleScope(role?.scopeLevel ?? u.role?.scopeLevel ?? "");
    editForm.reset({
      full_name: u.fullName ?? "",
      password: "",
      phone_number: u.phoneNumber ?? "",
      department: u.department ?? "",
      job_title: u.jobTitle ?? "",
      gender: u.gender ?? "",
      date_of_birth: u.dateOfBirth ?? "",
      role_id: u.role?.id ?? "",
      province_id: provinceId,
      district_id: districtId,
      facility_id: u.scope?.facilityId ?? "",
    });
  };

  const closeEditUser = () => {
    setEditUser(null);
    setEditError(null);
    editForm.reset();
  };

  const onSubmitEdit = async (values: EditUserFormValues) => {
    if (!editUser?.id) return;
    setIsSavingEdit(true);
    setEditError(null);
    const isNationalRole = NATIONAL_SCOPES.includes(editRoleScope);
    const body: Record<string, string | null | undefined> = {
      full_name: values.full_name,
      phone_number: values.phone_number || null,
      department: values.department || null,
      job_title: values.job_title || null,
      gender: values.gender || null,
      date_of_birth: values.date_of_birth || null,
      role_id: values.role_id,
    };
    if (values.password && values.password.length > 0) {
      body.password = values.password;
    }
    if (isNationalRole) {
      body.province_id = null;
      body.district_id = null;
      body.facility_id = null;
    } else {
      body.province_id = values.province_id || null;
      body.district_id = values.district_id || null;
      body.facility_id = values.facility_id || null;
    }

    const result = await apiFetchJson(`/api/v1/users/${editUser.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    setIsSavingEdit(false);
    if (result.ok) {
      toast({ title: "User updated successfully" });
      closeEditUser();
      refetch();
    } else {
      setEditError(result.message);
    }
  };

  const openDeleteUser = (u: UserRow) => {
    setDeleteUser(u);
    setDeleteError(null);
  };

  const handleDeleteUser = async () => {
    if (!deleteUser?.id) return;
    setIsDeleting(true);
    setDeleteError(null);
    const result = await apiFetchJson(`/api/v1/users/${deleteUser.id}`, { method: "DELETE" });
    setIsDeleting(false);
    if (result.ok) {
      toast({ title: "User deleted" });
      setDeleteUser(null);
      if (editUser?.id === deleteUser.id) closeEditUser();
      refetch();
    } else {
      setDeleteError(result.message);
    }
  };

  const isNationalRole = NATIONAL_SCOPES.includes(selectedRoleScope);
  const isEditNationalRole = NATIONAL_SCOPES.includes(editRoleScope);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<UsersIcon className="w-5 h-5" />}
        title="User Management"
        subtitle="Manage system access, roles, and permissions."
        breadcrumbs={[{ label: "Users" }]}
        actions={
          <Button onClick={() => { setIsAddOpen(true); setSelectedProvinceId(""); setSelectedRoleScope(""); }}>
            <Plus className="w-4 h-4" /> Add user
          </Button>
        }
      />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="permissions">
            <ShieldCheck className="w-4 h-4 mr-1" /> Roles & Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <div className="bg-card border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department / Title</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Province</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading users...</TableCell>
                  </TableRow>
                ) : (data?.data as UserRow[])?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No users found.</TableCell>
                  </TableRow>
                ) : (data?.data as UserRow[])?.map((u) => (
                  <TableRow
                    key={u.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => openEditUser(u)}
                  >
                    <TableCell>
                      <div className="font-medium">{u.fullName}</div>
                      {u.gender && <div className="text-xs text-muted-foreground capitalize">{u.gender}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      {u.department || u.jobTitle ? (
                        <div>
                          {u.department && <div className="text-sm font-medium">{u.department}</div>}
                          {u.jobTitle && <div className="text-xs text-muted-foreground">{u.jobTitle}</div>}
                        </div>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell><Badge variant="outline">{u.role?.roleName}</Badge></TableCell>
                    <TableCell>{u.provinceName || "National"}</TableCell>
                    <TableCell>
                      <Badge className={u.active ? "bg-green-600 hover:bg-green-700" : "bg-gray-500 hover:bg-gray-600"}>
                        {u.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={!!u.active}
                        onCheckedChange={() => {
                          if (u.active) {
                            deactivateMutation.mutate({ id: u.id! });
                          } else {
                            reactivateUser(u.id!);
                          }
                        }}
                        disabled={deactivateMutation.isPending || u.id === user?.id}
                      />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditUser(u)}>
                          <Pencil className="w-3 h-3 mr-1" /> Edit
                        </Button>
                        {isNationalAdmin && u.id !== user?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openDeleteUser(u)}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This panel describes the capabilities of each system role. Roles are assigned to users during creation or via the Edit Role action on the Users tab.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(ROLE_PERMISSIONS).map(([roleName, info]) => (
                <Card key={roleName}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      {roleName}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {info.permissions.map((perm, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          {perm}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto pr-1">
              <div className="space-y-4 py-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Account Details</p>
              <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Email Address</FormLabel>
                    <FormControl><Input type="email" autoComplete="off" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Temporary Password</FormLabel>
                    <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl><Input placeholder="+675 xxx xxxx" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select onValueChange={v => field.onChange(v === "_none" ? "" : v)} value={field.value || "_none"}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="_none">— Not specified —</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>

              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider pt-2">Professional Details</p>
              <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <FormControl><Input placeholder="e.g. Finance" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="job_title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title</FormLabel>
                    <FormControl><Input placeholder="e.g. Asset Officer" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>

              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider pt-2">System Access</p>
              <FormField
                control={form.control}
                name="role_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select
                      onValueChange={(val) => {
                        field.onChange(val);
                        const role = rolesData?.find((r) => r.id === val);
                        setSelectedRoleScope(role?.scopeLevel ?? "");
                        if (role?.scopeLevel === "national") {
                          form.setValue("province_id", "");
                          form.setValue("district_id", "");
                          setSelectedProvinceId("");
                        }
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {rolesData?.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.roleName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isNationalRole && (
                <FormField
                  control={form.control}
                  name="province_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Province Scope</FormLabel>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                          setSelectedProvinceId(val);
                          form.setValue("district_id", "");
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select province" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {provincesData?.data?.map((p) => (
                            <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {!isNationalRole && selectedProvinceId && (
                <FormField
                  control={form.control}
                  name="district_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>District Scope (optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select district (optional)" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {districtsData?.data?.map((d) => (
                            <SelectItem key={d.id} value={d.id!}>{d.districtName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {editUser && (
        <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) closeEditUser(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit User — {editUser.fullName}</DialogTitle>
              <DialogDescription>
                Update profile details, role, scope, or reset password.
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="flex-1 overflow-y-auto pr-1">
                <div className="space-y-4 py-2">
                  <div className="space-y-1">
                    <Label>Email (login identity)</Label>
                    <Input value={editUser.email ?? ""} readOnly disabled />
                    <p className="text-xs text-muted-foreground">Email is the user's login and cannot be changed.</p>
                  </div>

                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                      <ActivityIcon className="w-3 h-3" /> Recent Activity
                    </p>
                    <div className="rounded-md border bg-muted/30 max-h-56 overflow-y-auto">
                      {isActivityLoading ? (
                        <div className="p-3 text-xs text-muted-foreground">Loading activity…</div>
                      ) : isActivityError ? (
                        <div className="p-3 text-xs text-destructive">Couldn't load activity.</div>
                      ) : !activityData || activityData.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground">No recent activity recorded for this user.</div>
                      ) : (
                        <ul className="divide-y">
                          {activityData.map((entry) => (
                            <li key={entry.id} className="p-2.5 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-medium text-foreground">
                                    {formatActionType(entry.actionType)}
                                    {entry.entityType && (
                                      <span className="text-muted-foreground font-normal"> · {entry.entityType}</span>
                                    )}
                                  </div>
                                  {entry.description && (
                                    <div className="text-muted-foreground truncate">{entry.description}</div>
                                  )}
                                </div>
                                <div className="text-muted-foreground whitespace-nowrap shrink-0">
                                  {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider pt-2">Account Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={editForm.control}
                      name="full_name"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Full Name</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <div className="flex items-center justify-between gap-2">
                            <FormLabel>Reset Password (optional)</FormLabel>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={handleSendResetLink}
                              disabled={isSendingResetLink || !editUser?.active}
                              title={editUser?.active ? "Email a single-use reset link to the user" : "Reactivate the user before sending a reset link"}
                            >
                              {isSendingResetLink ? (
                                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending…</>
                              ) : (
                                <><Mail className="w-3 h-3 mr-1" /> Send reset link</>
                              )}
                            </Button>
                          </div>
                          <FormControl>
                            <Input type="password" autoComplete="new-password" placeholder="Leave blank to keep current password" {...field} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Set a password directly for offline accounts, or send a reset link so the user can choose their own. The link is single-use and expires in 1 hour.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="phone_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl><Input placeholder="+675 xxx xxxx" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select onValueChange={v => field.onChange(v === "_none" ? "" : v)} value={field.value || "_none"}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="_none">— Not specified —</SelectItem>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider pt-2">Professional Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={editForm.control}
                      name="department"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          <FormControl><Input placeholder="e.g. Finance" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="job_title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Job Title</FormLabel>
                          <FormControl><Input placeholder="e.g. Asset Officer" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="date_of_birth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider pt-2">System Access</p>
                  <FormField
                    control={editForm.control}
                    name="role_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            const role = rolesData?.find(r => r.id === val);
                            const scope = role?.scopeLevel ?? "";
                            setEditRoleScope(scope);
                            if (scope === "national") {
                              editForm.setValue("province_id", "");
                              editForm.setValue("district_id", "");
                              editForm.setValue("facility_id", "");
                              setEditProvinceId("");
                              setEditDistrictId("");
                            }
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {rolesData?.map(r => (
                              <SelectItem key={r.id} value={r.id}>{r.roleName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {field.value && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {ROLE_PERMISSIONS[rolesData?.find(r => r.id === field.value)?.roleName ?? ""]?.description ?? ""}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!isEditNationalRole && (
                    <FormField
                      control={editForm.control}
                      name="province_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Province Scope <span className="text-destructive">*</span></FormLabel>
                          <Select
                            onValueChange={(val) => {
                              field.onChange(val);
                              setEditProvinceId(val);
                              editForm.setValue("district_id", "");
                              editForm.setValue("facility_id", "");
                              setEditDistrictId("");
                            }}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Select province" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {provincesData?.data?.map(p => (
                                <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!field.value && (
                            <p className="text-xs text-destructive">Province is required for provincial roles.</p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {!isEditNationalRole && editProvinceId && (
                    <FormField
                      control={editForm.control}
                      name="district_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>District Scope (optional)</FormLabel>
                          <Select
                            onValueChange={(val) => {
                              field.onChange(val);
                              setEditDistrictId(val);
                              editForm.setValue("facility_id", "");
                            }}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Select district (optional)" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {editDistrictsData?.data?.map(d => (
                                <SelectItem key={d.id} value={d.id!}>{d.districtName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {!isEditNationalRole && editDistrictId && (
                    <FormField
                      control={editForm.control}
                      name="facility_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Facility Scope (optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Select facility (optional)" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {editFacilitiesData?.data?.map(f => (
                                <SelectItem key={f.id} value={f.id!}>{f.facilityName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {editError && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                      {editError}
                    </div>
                  )}
                </div>
                <DialogFooter className="pt-4 gap-2 sm:justify-between">
                  <div>
                    {isNationalAdmin && editUser.id !== user?.id && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => openDeleteUser(editUser)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Delete user
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={closeEditUser}>Cancel</Button>
                    <Button type="submit" disabled={isSavingEdit}>
                      {isSavingEdit ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={!!deleteUser} onOpenChange={(open) => { if (!open) { setDeleteUser(null); setDeleteError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-medium">{deleteUser?.fullName}</span> ({deleteUser?.email}) and their roles. This cannot be undone.
              If the user has historical records (audits, asset changes, purchase requests, etc.), deletion will be refused — deactivate them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {deleteError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleDeleteUser(); }}
            >
              {isDeleting ? "Deleting..." : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
