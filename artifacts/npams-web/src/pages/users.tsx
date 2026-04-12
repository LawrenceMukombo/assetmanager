import { useGetUsers, useCreateUser, useDeactivateUser, getGetUsersQueryKey, useGetProvinces, getGetProvincesQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
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
import { Plus, UserX, UserCheck } from "lucide-react";

// For demo purposes, we map standard role names to IDs here.
// In a real app, these would come from an API endpoint.
const ROLE_MAP: Record<string, string> = {
  "Super Admin": "role_super_admin",
  "National Asset Controller": "role_national_controller",
  "Provincial Admin": "role_provincial_admin",
  "Provincial Asset Officer": "role_provincial_officer",
  "Provincial Viewer": "role_provincial_viewer",
  "Facility Officer": "role_facility_officer"
};

const userSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role_id: z.string().min(1, "Role is required"),
  province_id: z.string().optional(),
});

export default function Users() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Super Admin" || user?.role === "Provincial Admin";
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data, isLoading, refetch } = useGetUsers({ query: { queryKey: getGetUsersQueryKey() } });
  const { data: provincesData } = useGetProvinces({ query: { queryKey: getGetProvincesQueryKey() } });

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User created successfully" });
        refetch();
        setIsAddOpen(false);
      }
    }
  });

  const deactivateMutation = useDeactivateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User status updated" });
        refetch();
      }
    }
  });

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: { full_name: "", email: "", password: "", role_id: "", province_id: "" }
  });

  if (!isAdmin) return <Redirect to="/dashboard" />;

  const onSubmit = (values: z.infer<typeof userSchema>) => {
    createMutation.mutate({ data: values });
  };

  const toggleStatus = (userId: string) => {
    deactivateMutation.mutate({ id: userId });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-muted-foreground">Manage system access and roles.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}><Plus className="w-4 h-4 mr-2" /> Add User</Button>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Full Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : data?.data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.fullName}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Badge variant="outline">{u.role?.roleName}</Badge></TableCell>
                <TableCell>{u.provinceName || "National"}</TableCell>
                <TableCell>
                  <Badge className={u.active ? "bg-green-500 hover:bg-green-600" : "bg-gray-500 hover:bg-gray-600"}>
                    {u.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch 
                    checked={u.active} 
                    onCheckedChange={() => toggleStatus(u.id!)}
                    disabled={deactivateMutation.isPending || u.id === user?.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
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
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
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
                    <FormControl><Input type="password" {...field} /></FormControl>
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {Object.entries(ROLE_MAP).map(([name, id]) => (
                          <SelectItem key={id} value={id}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="province_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Province Scope (Optional for National)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select province" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {provincesData?.data?.map(p => (
                          <SelectItem key={p.id} value={p.id!}>{p.provinceName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>Create User</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}