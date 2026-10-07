import { useAuth } from "@/hooks/use-auth";
import { useProvinceBranding } from "@/hooks/use-province-branding";
import { useOrganization } from "@/context/organization-context";
import { apiFetchJson } from "@/lib/api-fetch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Building2, Layers, DollarSign, Palette, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { LogoUploaderField, BrandColorPickerField } from "@/components/brand-fields";

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

const organizationSchema = z.object({
  organizationName: z.string().min(1, "Organization name is required"),
  shortCode: z.string().min(1, "Short code is required"),
  organizationType: z.string().min(1, "Organization type is required"),
  systemTitle: z.string().min(1, "System title is required"),
  tagline: z.string().optional(),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  currencyCode: z.string().min(1, "Currency code is required"),
  currencySymbol: z.string().min(1, "Currency symbol is required"),
  hierarchyPreset: z.string().optional(),
  level1Label: z.string().min(1, "Level 1 label is required"),
  level1Plural: z.string().min(1, "Level 1 plural is required"),
  level2Label: z.string().min(1, "Level 2 label is required"),
  level2Plural: z.string().min(1, "Level 2 plural is required"),
  level3Label: z.string().min(1, "Level 3 label is required"),
  level3Plural: z.string().min(1, "Level 3 plural is required"),
});

export default function Settings() {
  const { user } = useAuth();
  const { branding, applyBranding } = useProvinceBranding();
  const { organization, updateOrganization } = useOrganization();
  const { toast } = useToast();
  const [profileLoading, setProfileLoading] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [orgLoading, setOrgLoading] = useState(false);

  const isSuperAdmin = user?.role === "Super Admin";
  const isProvincialAdmin = user?.role === "Provincial Admin";
  const isAgencyAdmin = user?.role === "Agency Admin";
  const isNational = user?.scope_level === "national";
  const isAgency = user?.scope_level === "agency";

  const orgForm = useForm<z.infer<typeof organizationSchema>>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      organizationName: organization.organizationName || "",
      shortCode: organization.shortCode || "",
      organizationType: organization.organizationType || "enterprise",
      systemTitle: organization.systemTitle || "Asset Management System",
      tagline: organization.tagline || "",
      logoUrl: organization.logoUrl || "",
      faviconUrl: organization.faviconUrl || "",
      primaryColor: organization.primaryColor || "#0F4C81",
      accentColor: organization.accentColor || "#3B82F6",
      currencyCode: organization.currencyCode || "USD",
      currencySymbol: organization.currencySymbol || "$",
      hierarchyPreset: organization.hierarchyPreset || "corporate",
      level1Label: organization.level1Label || "Division",
      level1Plural: organization.level1Plural || "Divisions",
      level2Label: organization.level2Label || "Department",
      level2Plural: organization.level2Plural || "Departments",
      level3Label: organization.level3Label || "Site / Room",
      level3Plural: organization.level3Plural || "Sites / Rooms",
    },
  });

  useEffect(() => {
    orgForm.reset({
      organizationName: organization.organizationName || "",
      shortCode: organization.shortCode || "",
      organizationType: organization.organizationType || "enterprise",
      systemTitle: organization.systemTitle || "Asset Management System",
      tagline: organization.tagline || "",
      logoUrl: organization.logoUrl || "",
      faviconUrl: organization.faviconUrl || "",
      primaryColor: organization.primaryColor || "#0F4C81",
      accentColor: organization.accentColor || "#3B82F6",
      currencyCode: organization.currencyCode || "USD",
      currencySymbol: organization.currencySymbol || "$",
      hierarchyPreset: organization.hierarchyPreset || "corporate",
      level1Label: organization.level1Label || "Division",
      level1Plural: organization.level1Plural || "Divisions",
      level2Label: organization.level2Label || "Department",
      level2Plural: organization.level2Plural || "Departments",
      level3Label: organization.level3Label || "Site / Room",
      level3Plural: organization.level3Plural || "Sites / Rooms",
    });
  }, [organization, orgForm]);

  const handlePresetChange = (preset: string) => {
    orgForm.setValue("hierarchyPreset", preset);
    if (preset === "corporate") {
      orgForm.setValue("level1Label", "Division");
      orgForm.setValue("level1Plural", "Divisions");
      orgForm.setValue("level2Label", "Department");
      orgForm.setValue("level2Plural", "Departments");
      orgForm.setValue("level3Label", "Site / Room");
      orgForm.setValue("level3Plural", "Sites / Rooms");
    } else if (preset === "regional") {
      orgForm.setValue("level1Label", "Region");
      orgForm.setValue("level1Plural", "Regions");
      orgForm.setValue("level2Label", "Branch");
      orgForm.setValue("level2Plural", "Branches");
      orgForm.setValue("level3Label", "Facility / Office");
      orgForm.setValue("level3Plural", "Facilities / Offices");
    } else if (preset === "governmental") {
      orgForm.setValue("level1Label", "State / Province");
      orgForm.setValue("level1Plural", "States / Provinces");
      orgForm.setValue("level2Label", "District / County");
      orgForm.setValue("level2Plural", "Districts / Counties");
      orgForm.setValue("level3Label", "Facility / Station");
      orgForm.setValue("level3Plural", "Facilities / Stations");
    }
  };

  const onOrganizationSubmit = async (values: z.infer<typeof organizationSchema>) => {
    setOrgLoading(true);
    const result = await updateOrganization(values);
    setOrgLoading(false);
    if (result.ok) {
      toast({
        title: "Organization Profile Updated",
        description: "All system titles, branding, currency, and hierarchy labels have been saved.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: result.message || "Failed to update organization settings.",
      });
    }
  };

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
      <PageHeader
        icon={<SettingsIcon className="w-5 h-5" />}
        title="Settings"
        subtitle="Manage your account and system preferences."
        breadcrumbs={[{ label: "Settings" }]}
      />

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
                        <FormControl>
                          <LogoUploaderField
                            id="agency-logo-upload"
                            label="Agency Logo"
                            description="PNG, JPG, SVG, WebP (up to 10MB)"
                            value={field.value || ""}
                            onChange={field.onChange}
                          />
                        </FormControl>
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
                          <FormControl>
                            <BrandColorPickerField
                              id="agency-accent-color"
                              label="Accent Colour"
                              value={field.value || "#0D47A1"}
                              onChange={field.onChange}
                            />
                          </FormControl>
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

      {(isSuperAdmin || isAgencyAdmin) && (
        <div className="space-y-4">
          <Separator />
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Organization Profile &amp; System Settings
            </h3>
            <p className="text-sm text-muted-foreground">
              Configure your organization identity, branding, currency, and location hierarchy terminology.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Organization &amp; Deployment Configuration</CardTitle>
              <CardDescription>
                Customize this deployment for your enterprise, business, or government agency. Changes take effect across all portal pages immediately.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...orgForm}>
                <form onSubmit={orgForm.handleSubmit(onOrganizationSubmit)} className="space-y-6">
                  {/* Basic Profile */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Building2 className="w-4 h-4" /> Organization Details
                    </h4>
                    <div className="grid md:grid-cols-3 gap-4">
                      <FormField
                        control={orgForm.control}
                        name="organizationName"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Organization / Company Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. Lamton Investments / Acme Corp / Ministry of Health" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={orgForm.control}
                        name="shortCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Short Code / Acronym</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. LAMTON / ACME / MOH" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={orgForm.control}
                        name="organizationType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organization Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select organization type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="enterprise">Private Business / Corporate Enterprise</SelectItem>
                                <SelectItem value="government">Government Department / Public Agency</SelectItem>
                                <SelectItem value="healthcare">Healthcare &amp; Hospital Network</SelectItem>
                                <SelectItem value="education">University / Educational Institution</SelectItem>
                                <SelectItem value="ngo">Non-Profit / NGO / Foundation</SelectItem>
                                <SelectItem value="other">Other / Custom</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={orgForm.control}
                        name="systemTitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>System Title</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. Asset Management System" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={orgForm.control}
                      name="tagline"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tagline / Subtitle</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g. Enterprise Asset & Inventory Management" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator />

                  {/* Visual Identity & Theme */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Palette className="w-4 h-4" /> Branding &amp; Visual Identity
                    </h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={orgForm.control}
                        name="logoUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <LogoUploaderField
                                id="org-logo-upload"
                                label="Organization Logo"
                                description="PNG, JPG, SVG, WebP (up to 10MB) — auto-applies as site icon"
                                value={field.value || ""}
                                onChange={(val) => {
                                  field.onChange(val);
                                  // Auto-sync faviconUrl if it was empty or matched previous logo
                                  const currentFavicon = orgForm.getValues("faviconUrl");
                                  if (!currentFavicon || currentFavicon === field.value) {
                                    orgForm.setValue("faviconUrl", val);
                                  }
                                }}
                              />
                            </FormControl>
                            <FormDescription>Shown in the header, login page, and report exports.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={orgForm.control}
                        name="faviconUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <LogoUploaderField
                                id="org-favicon-upload"
                                label="Favicon / Site Icon"
                                description="Browser tab icon (SVG, PNG, ICO, JPG)"
                                value={field.value || ""}
                                onChange={field.onChange}
                              />
                            </FormControl>
                            <FormDescription>Browser tab icon URL.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField
                        control={orgForm.control}
                        name="primaryColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <BrandColorPickerField
                                id="org-primary-color"
                                label="Primary Brand Color"
                                value={field.value || "#0F4C81"}
                                onChange={field.onChange}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={orgForm.control}
                        name="accentColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <BrandColorPickerField
                                id="org-accent-color"
                                label="Secondary Accent Color"
                                value={field.value || "#3B82F6"}
                                onChange={field.onChange}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Financial & Currency */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4" /> Currency &amp; Valuation
                    </h4>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField
                        control={orgForm.control}
                        name="currencySymbol"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Currency Symbol</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. $, €, £, K, ZMW" />
                            </FormControl>
                            <FormDescription>Prepended to asset costs, stock valuation, and purchase requests.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={orgForm.control}
                        name="currencyCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Currency ISO Code</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. USD, EUR, GBP, PGK, ZMW" />
                            </FormControl>
                            <FormDescription>3-letter ISO code for financial reports.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Hierarchy & Nomenclature */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Layers className="w-4 h-4" /> Location &amp; Department Hierarchy
                      </h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Choose how your physical and organizational locations are structured and labeled throughout the system.
                    </p>

                    <FormField
                      control={orgForm.control}
                      name="hierarchyPreset"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hierarchy Preset</FormLabel>
                          <Select
                            onValueChange={(val) => handlePresetChange(val)}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select hierarchy structure" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="corporate">Corporate / Enterprise (Division → Department → Site / Room)</SelectItem>
                              <SelectItem value="regional">Regional Business (Region → Branch → Facility / Office)</SelectItem>
                              <SelectItem value="governmental">Government / Public Sector (State / Province → District → Facility / Station)</SelectItem>
                              <SelectItem value="custom">Custom Hierarchy</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid md:grid-cols-3 gap-4 pt-2">
                      <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                        <span className="text-xs font-semibold text-primary">Level 1 (Top Level)</span>
                        <FormField
                          control={orgForm.control}
                          name="level1Label"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Singular</FormLabel>
                              <FormControl><Input {...field} placeholder="e.g. Division / Region" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={orgForm.control}
                          name="level1Plural"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Plural</FormLabel>
                              <FormControl><Input {...field} placeholder="e.g. Divisions / Regions" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                        <span className="text-xs font-semibold text-primary">Level 2 (Mid Level)</span>
                        <FormField
                          control={orgForm.control}
                          name="level2Label"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Singular</FormLabel>
                              <FormControl><Input {...field} placeholder="e.g. Department / Branch" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={orgForm.control}
                          name="level2Plural"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Plural</FormLabel>
                              <FormControl><Input {...field} placeholder="e.g. Departments / Branches" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                        <span className="text-xs font-semibold text-primary">Level 3 (Facility / Room Level)</span>
                        <FormField
                          control={orgForm.control}
                          name="level3Label"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Singular</FormLabel>
                              <FormControl><Input {...field} placeholder="e.g. Site / Room / Office" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={orgForm.control}
                          name="level3Plural"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Plural</FormLabel>
                              <FormControl><Input {...field} placeholder="e.g. Sites / Rooms / Offices" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-4 border-t">
                    <Button type="submit" disabled={orgLoading} className="min-w-36">
                      {orgLoading ? "Saving..." : "Save Organization Profile"}
                    </Button>
                    {orgForm.watch("logoUrl") && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                        <span>Logo preview:</span>
                        <img
                          src={orgForm.watch("logoUrl")}
                          alt="Logo preview"
                          className="h-9 w-9 object-contain rounded border bg-white p-0.5"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                    )}
                  </div>
                </form>
              </Form>
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
      )}
    </div>
  );
}
