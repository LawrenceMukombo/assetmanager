import { useAuth } from "@/hooks/use-auth";
import { useUpdateUser } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const profileSchema = z.object({
  full_name: z.string().min(1, "Name is required"),
  phone_number: z.string().optional(),
});

const passwordSchema = z.object({
  old_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(6, "New password must be at least 6 characters"),
  confirm_password: z.string().min(1, "Confirm password is required"),
}).refine(data => data.new_password === data.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"]
});

export default function Settings() {
  const { user, province } = useAuth();
  const { toast } = useToast();
  const [pwdLoading, setPwdLoading] = useState(false);

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: user?.full_name || "",
      phone_number: "", // Assuming user model might have phone later
    }
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { old_password: "", new_password: "", confirm_password: "" }
  });

  const updateProfileMutation = useUpdateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "Profile updated successfully" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    }
  });

  const onProfileSubmit = (values: z.infer<typeof profileSchema>) => {
    if (user?.id) {
      updateProfileMutation.mutate({ id: user.id, data: values });
    }
  };

  const onPasswordSubmit = async (values: z.infer<typeof passwordSchema>) => {
    setPwdLoading(true);
    try {
      // POST to standard change password endpoint (assuming /api/v1/auth/change-password exists)
      // The API spec doesn't explicitly expose a generated hook for this, using customFetch.
      const token = localStorage.getItem("npams_token");
      const resp = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ old_password: values.old_password, new_password: values.new_password })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).message || "Failed to change password");
      }
      toast({ title: "Password changed successfully" });
      passwordForm.reset();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to change password" });
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account preferences.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>My Profile</CardTitle>
              <CardDescription>Update your personal information.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                  <FormField
                    control={profileForm.control}
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
                    control={profileForm.control}
                    name="phone_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="pt-2">
                    <Button type="submit" disabled={updateProfileMutation.isPending}>
                      {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          {province && (
            <Card>
              <CardHeader>
                <CardTitle>Provincial Branding</CardTitle>
                <CardDescription>Branding applied to your view.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {province.flagUrl && (
                  <div>
                    <span className="text-sm font-medium mb-2 block">Flag</span>
                    <img src={province.flagUrl} alt="Flag" className="h-16 w-auto border rounded shadow-sm object-cover" />
                  </div>
                )}
                {province.themeAccentColor && (
                  <div>
                    <span className="text-sm font-medium mb-2 block">Theme Accent</span>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full border" style={{ backgroundColor: `hsl(${province.themeAccentColor})` }} />
                      <code className="text-xs bg-muted px-2 py-1 rounded">hsl({province.themeAccentColor})</code>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Ensure your account stays secure.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                  <FormField
                    control={passwordForm.control}
                    name="old_password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Password</FormLabel>
                        <FormControl><Input type="password" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="new_password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl><Input type="password" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="confirm_password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl><Input type="password" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="pt-2">
                    <Button type="submit" variant="secondary" disabled={pwdLoading}>
                      {pwdLoading ? "Updating..." : "Update Password"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}