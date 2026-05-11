import { useAuth } from "@/hooks/use-auth";
import { useProvinceBranding } from "@/hooks/use-province-branding";
import { apiFetchJson } from "@/lib/api-fetch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";

const profileSchema = z.object({
  full_name: z.string().min(1, "Name is required"),
  phone_number: z.string().optional(),
});

const passwordSchema = z
  .object({
    old_password: z.string().min(1, "Current password is required"),
    new_password: z.string().min(8, "New password must be at least 8 characters"),
    confirm_password: z.string().min(1, "Confirm password is required"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

const agencyBrandingSchema = z.object({
  agency_name: z.string().min(1, "Agency name is required"),
  logo_url: z.string().optional(),
  theme_accent_color: z.string().optional(),
  flag_colors: z.string().optional(),
});

export default function Settings() {
  const { user } = useAuth();
  const { branding, applyBranding } = useProvinceBranding();
  const { toast } = useToast();
  const [profileLoading, setProfileLoading] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [brandingLoading, setBrandingLoading] = useState(false);

  const isSuperAdmin = user?.role === "Super Admin";
  const isProvincialAdmin = user?.role === "Provincial Admin";
  const isAgencyAdmin = user?.role === "Agency Admin";
  const isNational = user?.scope_level === "national";
  const isAgency = user?.scope_level === "agency";

  const agencyBrandingForm = useForm<z.infer<typeof agencyBrandingSchema>>({
    resolver: zodResolver(agencyBrandingSchema),
    defaultValues: { agency_name: "", logo_url: "", theme_accent_color: "", flag_colors: "" },
  });

  useEffect(() => {
    if (!isAgency || !isAgencyAdmin) return;
    let cancelled = false;
    (async () => {
      const r = await apiFetchJson<{ data: { agencyName: string; logoUrl: string | null; themeAccentColor: string | null; flagColors: string[] } }>(
        "/api/v1/agency_branding",
      );
      if (cancelled || !r.ok || !r.data) return;
      const d = r.data.data;
      agencyBrandingForm.reset({
        agency_name: d.agencyName ?? "",
        logo_url: d.logoUrl ?? "",
        theme_accent_color: d.themeAccentColor ?? "",
        flag_colors: Array.isArray(d.flagColors) ? d.flagColors.join(", ") : "",
      });
    })();
    return () => { cancelled = true; };
  }, [isAgency, isAgencyAdmin, agencyBrandingForm]);

  const onAgencyBrandingSubmit = async (values: z.infer<typeof agencyBrandingSchema>) => {
    setBrandingLoading(true);
    const colors = (values.flag_colors ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const result = await apiFetchJson<{ data: { agencyName: string; logoUrl: string | null; themeAccentColor: string | null; flagColors: string[] } }>(
      "/api/v1/agency_branding",
      {
        method: "PATCH",
        body: JSON.stringify({
          agency_name: values.agency_name,
          logo_url: values.logo_url || null,
          theme_accent_color: values.theme_accent_color || null,
          flag_colors: colors,
        }),
      },
    );
    setBrandingLoading(false);
    if (result.ok && result.data) {
      const d = result.data.data;
      applyBranding({
        provinceName: d.agencyName,
        flagUrl: d.logoUrl,
        themeAccentColor: d.themeAccentColor,
        flagColors: Array.isArray(d.flagColors) ? d.flagColors : [],
      });
      toast({ title: "Agency branding updated" });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: user?.full_name || "", phone_number: "" },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { old_password: "", new_password: "", confirm_password: "" },
  });

  const onProfileSubmit = async (values: z.infer<typeof profileSchema>) => {
    setProfileLoading(true);
    const result = await apiFetchJson("/api/v1/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ full_name: values.full_name, phone_number: values.phone_number }),
    });
    setProfileLoading(false);
    if (result.ok) {
      toast({ title: "Profile updated successfully" });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const onPasswordSubmit = async (values: z.infer<typeof passwordSchema>) => {
    setPwdLoading(true);
    const result = await apiFetchJson("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password: values.old_password, new_password: values.new_password }),
    });
    setPwdLoading(false);
    if (result.ok) {
      toast({ title: "Password changed successfully" });
      passwordForm.reset();
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account and system preferences.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>My Profile</CardTitle>
              <CardDescription>Update your display name and phone number.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{user?.email}</p>
                </div>
                <Badge variant="outline" className="ml-auto">{user?.role}</Badge>
              </div>
              <Separator className="mb-4" />
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
                        <FormControl><Input placeholder="+675 xxx xxxx" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="pt-2">
                    <Button type="submit" disabled={profileLoading}>
                      {profileLoading ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Ensure your account stays secure with a strong password.</CardDescription>
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
                        <FormControl><Input type="password" autoComplete="current-password" {...field} /></FormControl>
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
                        <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
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
                        <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
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

      {isAgency && isAgencyAdmin && (
        <div className="space-y-4">
          <Separator />
          <div>
            <h3 className="text-lg font-semibold">Agency Branding</h3>
            <p className="text-sm text-muted-foreground">
              Customise how your agency appears across the portal — name, logo, accent colour and flag colours.
            </p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <Form {...agencyBrandingForm}>
                <form onSubmit={agencyBrandingForm.handleSubmit(onAgencyBrandingSubmit)} className="space-y-4">
                  <FormField
                    control={agencyBrandingForm.control}
                    name="agency_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agency Name</FormLabel>
                        <FormControl><Input {...field} placeholder="e.g. PNG Immigration & Citizenship Authority" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={agencyBrandingForm.control}
                    name="logo_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Logo URL</FormLabel>
                        <FormControl><Input {...field} placeholder="/agencies/your-logo.png or https://..." /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField
                      control={agencyBrandingForm.control}
                      name="theme_accent_color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Accent Colour</FormLabel>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <Input {...field} placeholder="#0D47A1" />
                            </FormControl>
                            {field.value && (
                              <div
                                className="w-9 h-9 rounded border shrink-0"
                                style={{ backgroundColor: field.value }}
                              />
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={agencyBrandingForm.control}
                      name="flag_colors"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Flag Colours (comma-separated)</FormLabel>
                          <FormControl><Input {...field} placeholder="#CE1126, #000000, #FCD116" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <Button type="submit" disabled={brandingLoading}>
                      {brandingLoading ? "Saving..." : "Save Branding"}
                    </Button>
                    {agencyBrandingForm.watch("logo_url") && (
                      <img
                        src={agencyBrandingForm.watch("logo_url")}
                        alt="Logo preview"
                        className="h-10 w-10 object-contain rounded border bg-white p-0.5"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Changes apply immediately. Other users in your agency will see the new branding next time they log in.
                  </p>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      )}

      {!isNational && !isAgency && isProvincialAdmin && branding.provinceName && (
        <div className="space-y-4">
          <Separator />
          <div>
            <h3 className="text-lg font-semibold">Provincial Branding</h3>
            <p className="text-sm text-muted-foreground">Your province identity as configured by the system.</p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                {branding.flagUrl && (
                  <img
                    src={branding.flagUrl}
                    alt={`${branding.provinceName} flag`}
                    className="h-12 w-20 object-contain rounded border bg-muted"
                  />
                )}
                <div>
                  <p className="font-semibold text-lg">{branding.provinceName}</p>
                  <p className="text-sm text-muted-foreground">Province</p>
                </div>
                {branding.themeAccentColor && (
                  <div className="ml-auto flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full border"
                      style={{ backgroundColor: branding.themeAccentColor }}
                    />
                    <span className="text-xs text-muted-foreground">Accent colour</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isSuperAdmin && (
        <div className="space-y-4">
          <Separator />
          <div>
            <h3 className="text-lg font-semibold">System Administration</h3>
            <p className="text-sm text-muted-foreground">Settings available only to Super Administrators.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Tenant Configuration</CardTitle>
                <CardDescription>Global platform settings for NPAMS.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Platform Name</p>
                  <p className="text-sm text-muted-foreground">National Public Asset Management System</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Country</p>
                  <p className="text-sm text-muted-foreground">Papua New Guinea</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Province Count</p>
                  <p className="text-sm text-muted-foreground">22 provinces</p>
                </div>
                <p className="text-xs text-muted-foreground pt-2">
                  Contact your system integrator to modify tenant-level configuration.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Session Policy</CardTitle>
                <CardDescription>Token and session configuration.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Access Token Expiry</p>
                  <p className="text-sm text-muted-foreground">8 hours</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Refresh Token Policy</p>
                  <p className="text-sm text-muted-foreground">Rotated on use (opaque)</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Password Policy</p>
                  <p className="text-sm text-muted-foreground">Minimum 8 characters required</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
