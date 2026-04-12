import {
  useGetUsers,
  useCreateUser,
  useDeactivateUser,
  getGetUsersQueryKey,
  useGetProvinces,
  useGetDistrictsByProvince,
  getGetProvincesQueryKey,
  getGetDistrictsByProvinceQueryKey,
} from "@workspace/api-client-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROLES } from "@/App";
import { Redirect } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

interface RoleItem {
  id: string;
  roleName: string;
  scopeLevel: string;
}

const NATIONAL_SCOPES = ["national"];

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
  role_id: z.string().min(1, "Role is required"),
  province_id: z.string().optional(),
  district_id: z.string().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

export default function Users() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role as typeof ADMIN_ROLES[number]);
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedProvinceId, setSelectedProvinceId] = useState("");
  const [selectedRoleScope, setSelectedRoleScope] = useState("");

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
    const token = localStorage.getItem("npams_token");
    try {
      const resp = await fetch(`/api/v1/users/${userId}/reactivate`, {
        method: "PATCH",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const body = await resp.json().catch(() => ({ message: "Unexpected error" }));
      if (!resp.ok) throw new Error((body as { message?: string }).message ?? "Reactivation failed");
      toast({ title: "User reactivated" });
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Reactivation failed";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { full_name: "", email: "", password: "", role_id: "", province_id: "", district_id: "" },
  });

  if (!isAdmin) return <Redirect to="/dashboard" />;

  const onSubmit = (values: UserFormValues) => {
    const payload: Record<string, string | undefined> = {
      full_name: values.full_name,
      email: values.email,
      password: values.password,
      role_id: values.role_id,
    };
    if (values.province_id) payload.province_id = values.province_id;
    if (values.district_id) payload.district_id = values.district_id;
    createMutation.mutate({ data: payload as UserFormValues });
  };

  const isNationalRole = NATIONAL_SCOPES.includes(selectedRoleScope);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-muted-foreground">Manage system access and roles.</p>
        </div>
        <Button onClick={() => { setIsAddOpen(true); setSelectedProvinceId(""); setSelectedRoleScope(""); }}>
          <Plus className="w-4 h-4 mr-2" /> Add User
        </Button>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Full Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Scope Level</TableHead>
              <TableHead>Province</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading users...</TableCell>
              </TableRow>
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No users found.</TableCell>
              </TableRow>
            ) : data?.data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.fullName}</TableCell>
                <TableCell className="text-sm">{u.email}</TableCell>
                <TableCell><Badge variant="outline">{u.role?.roleName}</Badge></TableCell>
                <TableCell className="capitalize text-sm">{u.role?.scopeLevel ?? "N/A"}</TableCell>
                <TableCell>{u.provinceName || "National"}</TableCell>
                <TableCell>
                  <Badge className={u.active ? "bg-green-600 hover:bg-green-700" : "bg-gray-500 hover:bg-gray-600"}>
                    {u.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
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
                  <FormItem>
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
                  <FormItem>
                    <FormLabel>Temporary Password</FormLabel>
                    <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
