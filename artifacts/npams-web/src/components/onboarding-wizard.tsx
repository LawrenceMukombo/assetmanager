import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiFetchJson } from "@/lib/api-fetch";
import { useOrganization } from "@/context/organization-context";
import { LogoUploaderField, BrandColorPickerField } from "@/components/brand-fields";
import {
  Globe,
  Building2,
  CheckCircle2,
  MapPin,
  Layers,
  Sparkles,
  Shield,
  Coins,
  ArrowRight,
  Loader2,
  Sliders,
  ChevronRight,
  Info,
} from "lucide-react";

export const COUNTRY_TEMPLATES = [
  {
    code: "ZMB",
    name: "Zambia",
    currencyCode: "ZMW",
    currencySymbol: "K",
    lat: "-13.1339",
    lng: "27.8493",
    zoom: 6,
    level1: "Province",
    level1Plural: "Provinces",
    level2: "District",
    level2Plural: "Districts",
    level3: "Health Facility",
    level3Plural: "Health Facilities",
    primaryColor: "#198754",
    accentColor: "#FF8C00",
  },
  {
    code: "PNG",
    name: "Papua New Guinea",
    currencyCode: "PGK",
    currencySymbol: "K",
    lat: "-6.3150",
    lng: "143.9555",
    zoom: 6,
    level1: "Province",
    level1Plural: "Provinces",
    level2: "District",
    level2Plural: "Districts",
    level3: "Facility / Station",
    level3Plural: "Facilities / Stations",
    primaryColor: "#0F4C81",
    accentColor: "#E11D48",
  },
  {
    code: "KEN",
    name: "Kenya",
    currencyCode: "KES",
    currencySymbol: "KSh",
    lat: "-0.0236",
    lng: "37.9062",
    zoom: 6,
    level1: "County",
    level1Plural: "Counties",
    level2: "Sub-County",
    level2Plural: "Sub-Counties",
    level3: "Ward / Facility",
    level3Plural: "Wards / Facilities",
    primaryColor: "#0D5C3A",
    accentColor: "#BB1E10",
  },
  {
    code: "RWA",
    name: "Rwanda",
    currencyCode: "RWF",
    currencySymbol: "FRw",
    lat: "-1.9403",
    lng: "29.8739",
    zoom: 8,
    level1: "Province",
    level1Plural: "Provinces",
    level2: "District",
    level2Plural: "Districts",
    level3: "Sector / Center",
    level3Plural: "Sectors / Centers",
    primaryColor: "#0072BC",
    accentColor: "#FAD201",
  },
  {
    code: "GHA",
    name: "Ghana",
    currencyCode: "GHS",
    currencySymbol: "GH₵",
    lat: "7.9465",
    lng: "-1.0232",
    zoom: 6,
    level1: "Region",
    level1Plural: "Regions",
    level2: "District",
    level2Plural: "Districts",
    level3: "Sub-District / Facility",
    level3Plural: "Sub-Districts / Facilities",
    primaryColor: "#CE1126",
    accentColor: "#FCD116",
  },
  {
    code: "GLOBAL",
    name: "International / Sovereign",
    currencyCode: "USD",
    currencySymbol: "$",
    lat: "0.0",
    lng: "0.0",
    zoom: 2,
    level1: "Region / State",
    level1Plural: "Regions / States",
    level2: "District / County",
    level2Plural: "Districts / Counties",
    level3: "Facility / Site",
    level3Plural: "Facilities / Sites",
    primaryColor: "#1E3A8A",
    accentColor: "#3B82F6",
  },
];

export const INDUSTRY_SECTORS = [
  {
    id: "healthcare",
    name: "Healthcare & Medical Services",
    preset: "health",
    level1: "Directorate",
    level1Plural: "Directorates",
    level2: "Provincial Health Office",
    level2Plural: "Provincial Health Offices",
    level3: "Hospital / Health Center",
    level3Plural: "Hospitals & Health Centers",
    primaryColor: "#0D9488",
    accentColor: "#14B8A6",
  },
  {
    id: "finance",
    name: "Finance, Banking & Revenue Authority",
    preset: "finance",
    level1: "Division",
    level1Plural: "Divisions",
    level2: "Department",
    level2Plural: "Departments",
    level3: "Branch / Operational Office",
    level3Plural: "Branches / Offices",
    primaryColor: "#1E3A8A",
    accentColor: "#3B82F6",
  },
  {
    id: "border_control",
    name: "Immigration, Customs & Homeland Security",
    preset: "public_sector",
    level1: "Command Division",
    level1Plural: "Command Divisions",
    level2: "Regional Command",
    level2Plural: "Regional Commands",
    level3: "Port of Entry / Border Post",
    level3Plural: "Ports of Entry & Border Posts",
    primaryColor: "#0F4C81",
    accentColor: "#DC2626",
  },
  {
    id: "transport",
    name: "Transportation, Fleet & Logistics",
    preset: "logistics",
    level1: "Logistics Hub",
    level1Plural: "Logistics Hubs",
    level2: "Regional Depot",
    level2Plural: "Regional Depots",
    level3: "Fleet Station / Bay",
    level3Plural: "Fleet Stations & Bays",
    primaryColor: "#4338CA",
    accentColor: "#6366F1",
  },
  {
    id: "education",
    name: "Education, Universities & Research",
    preset: "education",
    level1: "Campus",
    level1Plural: "Campuses",
    level2: "Faculty / School",
    level2Plural: "Faculties & Schools",
    level3: "Department / Laboratory",
    level3Plural: "Departments & Labs",
    primaryColor: "#7C3AED",
    accentColor: "#A855F7",
  },
  {
    id: "corporate",
    name: "Corporate Enterprise & Commercial",
    preset: "corporate",
    level1: "Division",
    level1Plural: "Divisions",
    level2: "Department",
    level2Plural: "Departments",
    level3: "Site / Branch / Room",
    level3Plural: "Sites / Branches / Rooms",
    primaryColor: "#0F172A",
    accentColor: "#0284C7",
  },
];

interface OnboardingWizardProps {
  onSuccess?: () => void;
}

export function OnboardingWizard({ onSuccess }: OnboardingWizardProps) {
  const { toast } = useToast();
  const { refreshOrganization, setActiveAgencyId } = useOrganization();
  const [onboardingMode, setOnboardingMode] = useState<"country" | "organization">("country");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Country Form State
  const [countryForm, setCountryForm] = useState({
    countryName: "",
    countryCode: "",
    currencyCode: "USD",
    currencySymbol: "$",
    defaultLatitude: "-13.1339",
    defaultLongitude: "27.8493",
    defaultZoom: "6",
    logoUrl: "",
    primaryColor: "#198754",
    accentColor: "#FF8C00",
    hierarchyPreset: "sovereign",
    level1Label: "Province",
    level1Plural: "Provinces",
    level2Label: "District",
    level2Plural: "Districts",
    level3Label: "Facility",
    level3Plural: "Facilities",
    adminFullName: "",
    adminEmail: "",
    adminPassword: "",
    adminJobTitle: "National Administrator",
  });

  // Organization Form State
  const [orgForm, setOrgForm] = useState({
    countryCode: "ZMB",
    organizationName: "",
    shortCode: "",
    industry: "healthcare",
    organizationType: "Healthcare & Medical Services",
    description: "",
    logoUrl: "",
    primaryColor: "#0D9488",
    accentColor: "#14B8A6",
    currencyCode: "ZMW",
    currencySymbol: "K",
    defaultLatitude: "-13.1339",
    defaultLongitude: "27.8493",
    defaultZoom: "6",
    hierarchyPreset: "health",
    level1Label: "Directorate",
    level1Plural: "Directorates",
    level2Label: "Provincial Health Office",
    level2Plural: "Provincial Health Offices",
    level3Label: "Hospital / Health Center",
    level3Plural: "Hospitals & Health Centers",
    adminFullName: "",
    adminEmail: "",
    adminPassword: "",
    adminJobTitle: "Lead Administrator",
    adminDepartment: "Operations & Assets",
  });

  // Interactive Mini Map
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const activeLat = Number(onboardingMode === "country" ? countryForm.defaultLatitude : orgForm.defaultLatitude) || -13.1339;
  const activeLng = Number(onboardingMode === "country" ? countryForm.defaultLongitude : orgForm.defaultLongitude) || 27.8493;
  const activeZoom = Number(onboardingMode === "country" ? countryForm.defaultZoom : orgForm.defaultZoom) || 6;

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([activeLat, activeLng], activeZoom);
      if (markerRef.current) {
        markerRef.current.setLatLng([activeLat, activeLng]);
      }
      return;
    }

    const map = L.map(mapContainerRef.current, {
      center: [activeLat, activeLng],
      zoom: activeZoom,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    const marker = L.marker([activeLat, activeLng], { draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      const latStr = pos.lat.toFixed(4);
      const lngStr = pos.lng.toFixed(4);
      if (onboardingMode === "country") {
        setCountryForm((f) => ({ ...f, defaultLatitude: latStr, defaultLongitude: lngStr }));
      } else {
        setOrgForm((f) => ({ ...f, defaultLatitude: latStr, defaultLongitude: lngStr }));
      }
    });

    map.on("click", (e) => {
      marker.setLatLng(e.latlng);
      const latStr = e.latlng.lat.toFixed(4);
      const lngStr = e.latlng.lng.toFixed(4);
      if (onboardingMode === "country") {
        setCountryForm((f) => ({ ...f, defaultLatitude: latStr, defaultLongitude: lngStr }));
      } else {
        setOrgForm((f) => ({ ...f, defaultLatitude: latStr, defaultLongitude: lngStr }));
      }
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [onboardingMode, activeLat, activeLng, activeZoom]);

  const applyCountryPreset = (template: typeof COUNTRY_TEMPLATES[0]) => {
    setCountryForm((prev) => ({
      ...prev,
      countryName: template.name,
      countryCode: template.code,
      currencyCode: template.currencyCode,
      currencySymbol: template.currencySymbol,
      defaultLatitude: template.lat,
      defaultLongitude: template.lng,
      defaultZoom: String(template.zoom),
      level1Label: template.level1,
      level1Plural: template.level1Plural,
      level2Label: template.level2,
      level2Plural: template.level2Plural,
      level3Label: template.level3,
      level3Plural: template.level3Plural,
      primaryColor: template.primaryColor,
      accentColor: template.accentColor,
    }));
  };

  const applyIndustryPreset = (sector: typeof INDUSTRY_SECTORS[0]) => {
    setOrgForm((prev) => ({
      ...prev,
      industry: sector.id,
      organizationType: sector.name,
      hierarchyPreset: sector.preset,
      level1Label: sector.level1,
      level1Plural: sector.level1Plural,
      level2Label: sector.level2,
      level2Plural: sector.level2Plural,
      level3Label: sector.level3,
      level3Plural: sector.level3Plural,
      primaryColor: sector.primaryColor,
      accentColor: sector.accentColor,
    }));
  };

  const handleCountrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!countryForm.countryName.trim() || !countryForm.countryCode.trim()) {
      toast({ variant: "destructive", title: "Missing Information", description: "Country Name and Code are required." });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetchJson<any>("/api/v1/onboarding/country", {
        method: "POST",
        body: JSON.stringify({
          countryName: countryForm.countryName,
          countryCode: countryForm.countryCode,
          currencyCode: countryForm.currencyCode,
          currencySymbol: countryForm.currencySymbol,
          defaultLatitude: countryForm.defaultLatitude,
          defaultLongitude: countryForm.defaultLongitude,
          defaultZoom: countryForm.defaultZoom,
          logoUrl: countryForm.logoUrl || null,
          primaryColor: countryForm.primaryColor,
          accentColor: countryForm.accentColor,
          hierarchyPreset: countryForm.hierarchyPreset,
          level1Label: countryForm.level1Label,
          level1Plural: countryForm.level1Plural,
          level2Label: countryForm.level2Label,
          level2Plural: countryForm.level2Plural,
          level3Label: countryForm.level3Label,
          level3Plural: countryForm.level3Plural,
          adminUser: countryForm.adminEmail.trim()
            ? {
                fullName: countryForm.adminFullName,
                email: countryForm.adminEmail,
                password: countryForm.adminPassword,
                jobTitle: countryForm.adminJobTitle,
              }
            : undefined,
        }),
      });

      if (res.ok) {
        toast({
          title: "Country Onboarded Successfully",
          description: `Sovereign container for ${countryForm.countryName} (${countryForm.countryCode}) has been established.`,
        });
        await refreshOrganization();
        onSuccess?.();
      } else {
        toast({
          variant: "destructive",
          title: "Onboarding Failed",
          description: res.message || "Failed to onboard country.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Network Error",
        description: err instanceof Error ? err.message : "Failed to connect to server.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOrgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgForm.organizationName.trim() || !orgForm.shortCode.trim()) {
      toast({ variant: "destructive", title: "Missing Information", description: "Organization Name and Code are required." });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetchJson<any>("/api/v1/onboarding/organization", {
        method: "POST",
        body: JSON.stringify({
          countryCode: orgForm.countryCode,
          organizationName: orgForm.organizationName,
          shortCode: orgForm.shortCode,
          industry: orgForm.industry,
          organizationType: orgForm.organizationType,
          description: orgForm.description,
          logoUrl: orgForm.logoUrl || null,
          primaryColor: orgForm.primaryColor,
          accentColor: orgForm.accentColor,
          currencyCode: orgForm.currencyCode,
          currencySymbol: orgForm.currencySymbol,
          defaultLatitude: orgForm.defaultLatitude,
          defaultLongitude: orgForm.defaultLongitude,
          defaultZoom: orgForm.defaultZoom,
          hierarchyPreset: orgForm.hierarchyPreset,
          level1Label: orgForm.level1Label,
          level1Plural: orgForm.level1Plural,
          level2Label: orgForm.level2Label,
          level2Plural: orgForm.level2Plural,
          level3Label: orgForm.level3Label,
          level3Plural: orgForm.level3Plural,
          adminUser: orgForm.adminEmail.trim()
            ? {
                fullName: orgForm.adminFullName,
                email: orgForm.adminEmail,
                password: orgForm.adminPassword,
                jobTitle: orgForm.adminJobTitle,
                department: orgForm.adminDepartment,
              }
            : undefined,
        }),
      });

      if (res.ok) {
        toast({
          title: "Organization Onboarded Successfully",
          description: `${orgForm.organizationName} is now live and configured.`,
        });
        const createdAgencyId = res.data?.agency?.id;
        await refreshOrganization();
        if (createdAgencyId) {
          setActiveAgencyId(createdAgencyId);
        }
        onSuccess?.();
      } else {
        toast({
          variant: "destructive",
          title: "Onboarding Failed",
          description: res.message || "Failed to onboard organization.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Network Error",
        description: err instanceof Error ? err.message : "Failed to connect to server.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border bg-gradient-to-r from-primary/10 via-primary/5 to-muted p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 uppercase text-[10px] tracking-wider font-semibold">
              <Sparkles className="w-3 h-3 mr-1" /> Enterprise Onboarding Engine
            </Badge>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Onboarding Hub & Sovereign Setup</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Register new sovereign country domains or deploy ministry, agency, and enterprise tenants with specialized administrative levels, maps, and branding.
          </p>
        </div>

        {/* Mode Selector Pill */}
        <div className="flex items-center bg-card border rounded-lg p-1 shadow-xs">
          <Button
            type="button"
            variant={onboardingMode === "country" ? "default" : "ghost"}
            size="sm"
            onClick={() => setOnboardingMode("country")}
            className="text-xs font-semibold gap-1.5 h-8"
          >
            <Globe className="w-3.5 h-3.5" /> Onboard Country
          </Button>
          <Button
            type="button"
            variant={onboardingMode === "organization" ? "default" : "ghost"}
            size="sm"
            onClick={() => setOnboardingMode("organization")}
            className="text-xs font-semibold gap-1.5 h-8"
          >
            <Building2 className="w-3.5 h-3.5" /> Onboard Organization
          </Button>
        </div>
      </div>

      {/* Main Grid: Form on Left, Interactive Map & Live Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Container (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {onboardingMode === "country" ? (
            /* =========================================================================
               MODE 1: ONBOARD A SOVEREIGN COUNTRY
               ========================================================================= */
            <form onSubmit={handleCountrySubmit} className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" /> Sovereign Country Identity
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs">Sovereign Tier</Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Quick-start by picking a national template or fill in custom sovereign attributes.
                  </CardDescription>

                  {/* Quick-fill template chips */}
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    <span className="text-[11px] text-muted-foreground font-medium self-center mr-1">Presets:</span>
                    {COUNTRY_TEMPLATES.map((t) => (
                      <Button
                        key={t.code}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => applyCountryPreset(t)}
                        className={`h-7 text-xs px-2.5 rounded-full ${countryForm.countryCode === t.code ? "border-primary bg-primary/10 text-primary font-semibold" : ""}`}
                      >
                        {t.name} ({t.code})
                      </Button>
                    ))}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1.5">
                      <Label className="text-xs font-semibold">Country Name *</Label>
                      <Input
                        placeholder="e.g. Zambia, Papua New Guinea, Kenya"
                        value={countryForm.countryName}
                        onChange={(e) => setCountryForm({ ...countryForm, countryName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">ISO-3 Code *</Label>
                      <Input
                        placeholder="e.g. ZMB, PNG"
                        value={countryForm.countryCode}
                        onChange={(e) => setCountryForm({ ...countryForm, countryCode: e.target.value.toUpperCase() })}
                        maxLength={6}
                        required
                        className="font-mono uppercase"
                      />
                    </div>
                  </div>

                  {/* Sovereign Currency */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Coins className="w-3.5 h-3.5 text-muted-foreground" /> Currency Code
                      </Label>
                      <Input
                        placeholder="e.g. ZMW, PGK, USD"
                        value={countryForm.currencyCode}
                        onChange={(e) => setCountryForm({ ...countryForm, currencyCode: e.target.value.toUpperCase() })}
                        className="font-mono uppercase text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Currency Symbol</Label>
                      <Input
                        placeholder="e.g. K, $, €"
                        value={countryForm.currencySymbol}
                        onChange={(e) => setCountryForm({ ...countryForm, currencySymbol: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  {/* National Flag / Crest & Theme Colors */}
                  <div className="pt-2 border-t space-y-4">
                    <LogoUploaderField
                      label="National Coat of Arms / Crest Logo"
                      description="Upload country emblem from local machine"
                      value={countryForm.logoUrl}
                      onChange={(url) => setCountryForm({ ...countryForm, logoUrl: url })}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <BrandColorPickerField
                        label="Primary Sovereign Color"
                        value={countryForm.primaryColor}
                        onChange={(color) => setCountryForm({ ...countryForm, primaryColor: color })}
                      />
                      <BrandColorPickerField
                        label="Secondary / Accent Color"
                        value={countryForm.accentColor}
                        onChange={(color) => setCountryForm({ ...countryForm, accentColor: color })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Administrative Hierarchy Levels */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" /> Administrative Hierarchy Levels
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Define the sovereign territorial divisions for reporting, assets, and geospatial clustering.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Level 1 (Singular)</Label>
                      <Input
                        value={countryForm.level1Label}
                        onChange={(e) => setCountryForm({ ...countryForm, level1Label: e.target.value })}
                        placeholder="e.g. Province, State"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Level 1 (Plural)</Label>
                      <Input
                        value={countryForm.level1Plural}
                        onChange={(e) => setCountryForm({ ...countryForm, level1Plural: e.target.value })}
                        placeholder="e.g. Provinces, States"
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Level 2 (Singular)</Label>
                      <Input
                        value={countryForm.level2Label}
                        onChange={(e) => setCountryForm({ ...countryForm, level2Label: e.target.value })}
                        placeholder="e.g. District, County"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Level 2 (Plural)</Label>
                      <Input
                        value={countryForm.level2Plural}
                        onChange={(e) => setCountryForm({ ...countryForm, level2Plural: e.target.value })}
                        placeholder="e.g. Districts, Counties"
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Level 3 (Singular)</Label>
                      <Input
                        value={countryForm.level3Label}
                        onChange={(e) => setCountryForm({ ...countryForm, level3Label: e.target.value })}
                        placeholder="e.g. Facility, Post, Station"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Level 3 (Plural)</Label>
                      <Input
                        value={countryForm.level3Plural}
                        onChange={(e) => setCountryForm({ ...countryForm, level3Plural: e.target.value })}
                        placeholder="e.g. Facilities, Posts, Stations"
                        className="text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Optional Country Admin User */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" /> Initial Country Administrator (Optional)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Create the primary national controller account for this sovereign container.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Full Name</Label>
                      <Input
                        value={countryForm.adminFullName}
                        onChange={(e) => setCountryForm({ ...countryForm, adminFullName: e.target.value })}
                        placeholder="e.g. Dr. Mwamba Chileshe"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Official Email</Label>
                      <Input
                        type="email"
                        value={countryForm.adminEmail}
                        onChange={(e) => setCountryForm({ ...countryForm, adminEmail: e.target.value })}
                        placeholder="mwamba@moh.gov.zm"
                        className="text-xs"
                      />
                    </div>
                  </div>

                  {countryForm.adminEmail && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Initial Password</Label>
                      <Input
                        type="password"
                        value={countryForm.adminPassword}
                        onChange={(e) => setCountryForm({ ...countryForm, adminPassword: e.target.value })}
                        placeholder="Minimum 8 characters"
                        className="text-xs"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isSubmitting} className="min-w-44 font-semibold">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Provisioning Country...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Establish Sovereign Country
                    </>
                  )}
                </Button>
              </div>
            </form>
          ) : (
            /* =========================================================================
               MODE 2: ONBOARD AN ORGANIZATION / AGENCY / MINISTRY
               ========================================================================= */
            <form onSubmit={handleOrgSubmit} className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary" /> Organization & Sector Profile
                    </CardTitle>
                    <Badge variant="outline" className="text-xs border-primary/40 text-primary">Operating Tenant</Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Choose industry archetype to automatically cascade relevant organizational hierarchy levels and colors.
                  </CardDescription>

                  {/* Industry Archetype Selector */}
                  <div className="pt-2">
                    <Label className="text-xs font-semibold mb-1.5 block">Industry & Sector Archetype</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {INDUSTRY_SECTORS.map((sec) => (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => applyIndustryPreset(sec)}
                          className={`p-2.5 rounded-lg border text-left transition-all hover:border-primary/60 ${orgForm.industry === sec.id ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30" : "bg-card"}`}
                        >
                          <p className="text-xs font-bold truncate">{sec.name.split("&")[0]}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{sec.level1} → {sec.level3}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Host Country</Label>
                      <Select
                        value={orgForm.countryCode}
                        onValueChange={(code) => {
                          const t = COUNTRY_TEMPLATES.find((c) => c.code === code);
                          setOrgForm((prev) => ({
                            ...prev,
                            countryCode: code,
                            currencyCode: t?.currencyCode || prev.currencyCode,
                            currencySymbol: t?.currencySymbol || prev.currencySymbol,
                            defaultLatitude: t?.lat || prev.defaultLatitude,
                            defaultLongitude: t?.lng || prev.defaultLongitude,
                            defaultZoom: String(t?.zoom || prev.defaultZoom),
                          }));
                        }}
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Select Country" />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRY_TEMPLATES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.name} ({c.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="sm:col-span-2 space-y-1.5">
                      <Label className="text-xs font-semibold">Organization Name *</Label>
                      <Input
                        placeholder="e.g. Ministry of Health Zambia"
                        value={orgForm.organizationName}
                        onChange={(e) => setOrgForm({ ...orgForm, organizationName: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Short Code / Acronym *</Label>
                      <Input
                        placeholder="e.g. MOH-ZM, PNGICA"
                        value={orgForm.shortCode}
                        onChange={(e) => setOrgForm({ ...orgForm, shortCode: e.target.value.toUpperCase() })}
                        className="font-mono uppercase"
                        maxLength={12}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Currency Code</Label>
                      <Input
                        value={orgForm.currencyCode}
                        onChange={(e) => setOrgForm({ ...orgForm, currencyCode: e.target.value.toUpperCase() })}
                        className="font-mono text-xs uppercase"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Currency Symbol</Label>
                      <Input
                        value={orgForm.currencySymbol}
                        onChange={(e) => setOrgForm({ ...orgForm, currencySymbol: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  {/* Branding: Logo and Colors */}
                  <div className="pt-2 border-t space-y-4">
                    <LogoUploaderField
                      label="Organization Logo"
                      description="Upload official seal or badge from your machine"
                      value={orgForm.logoUrl}
                      onChange={(url) => setOrgForm({ ...orgForm, logoUrl: url })}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <BrandColorPickerField
                        label="Primary Brand Color"
                        value={orgForm.primaryColor}
                        onChange={(c) => setOrgForm({ ...orgForm, primaryColor: c })}
                      />
                      <BrandColorPickerField
                        label="Accent Brand Color"
                        value={orgForm.accentColor}
                        onChange={(c) => setOrgForm({ ...orgForm, accentColor: c })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Organizational Hierarchy Levels */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" /> Sector Hierarchy Architecture
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Custom titles for organizational tiers according to industry standards.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Tier 1 (Singular)</Label>
                      <Input
                        value={orgForm.level1Label}
                        onChange={(e) => setOrgForm({ ...orgForm, level1Label: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Tier 1 (Plural)</Label>
                      <Input
                        value={orgForm.level1Plural}
                        onChange={(e) => setOrgForm({ ...orgForm, level1Plural: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Tier 2 (Singular)</Label>
                      <Input
                        value={orgForm.level2Label}
                        onChange={(e) => setOrgForm({ ...orgForm, level2Label: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Tier 2 (Plural)</Label>
                      <Input
                        value={orgForm.level2Plural}
                        onChange={(e) => setOrgForm({ ...orgForm, level2Plural: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Tier 3 (Singular)</Label>
                      <Input
                        value={orgForm.level3Label}
                        onChange={(e) => setOrgForm({ ...orgForm, level3Label: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Tier 3 (Plural)</Label>
                      <Input
                        value={orgForm.level3Plural}
                        onChange={(e) => setOrgForm({ ...orgForm, level3Plural: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Organization Lead Administrator */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" /> Agency Admin Account (Optional)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Assign a dedicated Agency Admin user to manage this organization.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Full Name</Label>
                      <Input
                        value={orgForm.adminFullName}
                        onChange={(e) => setOrgForm({ ...orgForm, adminFullName: e.target.value })}
                        placeholder="e.g. Kondwani Phiri"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Work Email</Label>
                      <Input
                        type="email"
                        value={orgForm.adminEmail}
                        onChange={(e) => setOrgForm({ ...orgForm, adminEmail: e.target.value })}
                        placeholder="kondwani@moh.gov.zm"
                        className="text-xs"
                      />
                    </div>
                  </div>

                  {orgForm.adminEmail && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Password</Label>
                      <Input
                        type="password"
                        value={orgForm.adminPassword}
                        onChange={(e) => setOrgForm({ ...orgForm, adminPassword: e.target.value })}
                        placeholder="Minimum 8 characters"
                        className="text-xs"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isSubmitting} className="min-w-44 font-semibold">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Provisioning Agency...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Deploy Organization
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Right Side (5 cols): Interactive GIS Center Map & Live Tenant Card Preview */}
        <div className="lg:col-span-5 space-y-6">
          {/* Interactive GIS Map Coordinate Picker */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-primary" /> GIS Anchor & Map Center
                </CardTitle>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {activeLat}, {activeLng}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Drag the pin or click on the map to set the initial GIS camera coordinates and focal region.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div ref={mapContainerRef} className="h-64 w-full z-0 border-y" />
              <div className="p-3 bg-muted/30 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Latitude</Label>
                  <Input
                    value={onboardingMode === "country" ? countryForm.defaultLatitude : orgForm.defaultLatitude}
                    onChange={(e) => {
                      if (onboardingMode === "country") {
                        setCountryForm({ ...countryForm, defaultLatitude: e.target.value });
                      } else {
                        setOrgForm({ ...orgForm, defaultLatitude: e.target.value });
                      }
                    }}
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Longitude</Label>
                  <Input
                    value={onboardingMode === "country" ? countryForm.defaultLongitude : orgForm.defaultLongitude}
                    onChange={(e) => {
                      if (onboardingMode === "country") {
                        setCountryForm({ ...countryForm, defaultLongitude: e.target.value });
                      } else {
                        setOrgForm({ ...orgForm, defaultLongitude: e.target.value });
                      }
                    }}
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Zoom Level</Label>
                  <Select
                    value={onboardingMode === "country" ? countryForm.defaultZoom : orgForm.defaultZoom}
                    onValueChange={(z) => {
                      if (onboardingMode === "country") {
                        setCountryForm({ ...countryForm, defaultZoom: z });
                      } else {
                        setOrgForm({ ...orgForm, defaultZoom: z });
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 4, 6, 8, 10, 12].map((lvl) => (
                        <SelectItem key={lvl} value={String(lvl)}>
                          {lvl}x Zoom
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Identity Preview Card */}
          <Card className="border-t-4" style={{ borderTopColor: onboardingMode === "country" ? countryForm.primaryColor : orgForm.primaryColor }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Live Deployment Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg border bg-white p-1 flex items-center justify-center shrink-0 shadow-xs">
                  {(onboardingMode === "country" ? countryForm.logoUrl : orgForm.logoUrl) ? (
                    <img
                      src={onboardingMode === "country" ? countryForm.logoUrl : orgForm.logoUrl}
                      alt="Logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Building2 className="w-6 h-6 text-muted-foreground/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-base font-bold truncate">
                      {onboardingMode === "country"
                        ? countryForm.countryName || "Sovereign Country Name"
                        : orgForm.organizationName || "Enterprise / Ministry Name"}
                    </h3>
                    <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                      {onboardingMode === "country" ? countryForm.countryCode || "CODE" : orgForm.shortCode || "CODE"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {onboardingMode === "country"
                      ? `National Container · Currency: ${countryForm.currencyCode} (${countryForm.currencySymbol})`
                      : `${orgForm.organizationType} · Currency: ${orgForm.currencyCode} (${orgForm.currencySymbol})`}
                  </p>
                </div>
              </div>

              {/* Hierarchy Cascade Preview */}
              <div className="p-3 rounded-lg bg-muted/40 space-y-1.5 text-xs">
                <span className="text-[11px] font-semibold text-muted-foreground block">
                  Configured Hierarchy Cascade:
                </span>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {onboardingMode === "country" ? countryForm.level1Label : orgForm.level1Label}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {onboardingMode === "country" ? countryForm.level2Label : orgForm.level2Label}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {onboardingMode === "country" ? countryForm.level3Label : orgForm.level3Label}
                  </span>
                </div>
              </div>

              {/* Color Scheme Sample */}
              <div className="flex items-center justify-between text-xs pt-1 border-t">
                <span className="text-muted-foreground">Brand Palette</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-[11px] font-mono">
                    <span
                      className="w-3.5 h-3.5 rounded-full border"
                      style={{ backgroundColor: onboardingMode === "country" ? countryForm.primaryColor : orgForm.primaryColor }}
                    />
                    {onboardingMode === "country" ? countryForm.primaryColor : orgForm.primaryColor}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-mono">
                    <span
                      className="w-3.5 h-3.5 rounded-full border"
                      style={{ backgroundColor: onboardingMode === "country" ? countryForm.accentColor : orgForm.accentColor }}
                    />
                    {onboardingMode === "country" ? countryForm.accentColor : orgForm.accentColor}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
