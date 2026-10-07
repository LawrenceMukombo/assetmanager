import type { CSSProperties } from "react";
import {
  Tag,
  Monitor,
  Car,
  Armchair,
  Building2,
  Radio,
  BookOpenCheck,
  Fingerprint,
  ShieldCheck,
  Shirt,
  Activity,
  Stethoscope,
  Syringe,
  CreditCard,
  Landmark,
  Key,
  Server,
  Wifi,
  Laptop,
  BatteryCharging,
  Video,
  Printer,
  Truck,
  Anchor,
  Zap,
  Flame,
  Factory,
  Wrench,
  GraduationCap,
  BookOpen,
  Wheat,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { getIconByName } from "./category-options";

export type CategoryMeta = {
  icon: LucideIcon;
  /** CSS color string for chart fills, dots, etc. (theme-aware where possible) */
  color: string;
  /** Tailwind classes for a tinted icon chip (background + foreground) */
  chipClass: string;
  /** Optional inline style for the chip when an arbitrary hex color is in use */
  chipStyle?: CSSProperties;
};

const FALLBACK_META: CategoryMeta = {
  icon: Tag,
  color: "hsl(var(--muted-foreground))",
  chipClass: "bg-muted text-muted-foreground",
};

const FALLBACK_PALETTE: CategoryMeta[] = [
  { icon: Tag, color: "hsl(var(--chart-1))", chipClass: "bg-[hsl(var(--chart-1)/0.15)] text-[hsl(var(--chart-1))]" },
  { icon: Tag, color: "hsl(var(--chart-2))", chipClass: "bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]" },
  { icon: Tag, color: "hsl(var(--chart-3))", chipClass: "bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))]" },
  { icon: Tag, color: "hsl(var(--chart-4))", chipClass: "bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))]" },
  { icon: Tag, color: "hsl(var(--chart-5))", chipClass: "bg-[hsl(var(--chart-5)/0.15)] text-[hsl(var(--chart-5))]" },
];

/**
 * Mapping keyed by category code (preferred) or normalised category name.
 * Add a new category here in one line and it will light up across the app.
 */
const META_BY_KEY: Record<string, CategoryMeta> = {
  // IT & Telecom
  ICT: { icon: Monitor, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },
  SRV: { icon: Server, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },
  NET: { icon: Wifi, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },
  CMP: { icon: Laptop, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },
  UPS: { icon: BatteryCharging, color: "hsl(var(--warning))", chipClass: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]" },
  AV:  { icon: Video, color: "hsl(var(--chart-2))", chipClass: "bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]" },
  PRN: { icon: Printer, color: "hsl(var(--muted-foreground))", chipClass: "bg-muted text-foreground/80" },

  // Healthcare & Medical
  IMG: { icon: Activity, color: "hsl(var(--chart-1))", chipClass: "bg-[hsl(var(--chart-1)/0.15)] text-[hsl(var(--chart-1))]" },
  LAB: { icon: Syringe, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },
  PCM: { icon: Stethoscope, color: "hsl(var(--success))", chipClass: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]" },
  SUR: { icon: Activity, color: "hsl(var(--destructive))", chipClass: "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]" },
  CLD: { icon: BatteryCharging, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },
  AMB: { icon: Truck, color: "hsl(var(--destructive))", chipClass: "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]" },

  // Banking & Finance
  ATM: { icon: Landmark, color: "hsl(var(--success))", chipClass: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]" },
  POS: { icon: CreditCard, color: "hsl(var(--success))", chipClass: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]" },
  VLT: { icon: Key, color: "hsl(var(--warning))", chipClass: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]" },
  BNK: { icon: Landmark, color: "hsl(var(--chart-3))", chipClass: "bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))]" },
  HSM: { icon: Key, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },

  // Transportation & Fleet
  VEH: { icon: Car, color: "hsl(var(--chart-3))", chipClass: "bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))]" },
  FLT: { icon: Car, color: "hsl(var(--chart-3))", chipClass: "bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))]" },
  TRK: { icon: Truck, color: "hsl(var(--chart-3))", chipClass: "bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))]" },
  WHS: { icon: Truck, color: "hsl(var(--chart-4))", chipClass: "bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))]" },
  MAR: { icon: Anchor, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },

  // Facilities & Infrastructure
  BLD: { icon: Building2, color: "hsl(var(--muted-foreground))", chipClass: "bg-muted text-foreground/80" },
  PWR: { icon: Zap, color: "hsl(var(--warning))", chipClass: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]" },
  HVC: { icon: Zap, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },
  WTR: { icon: Activity, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },
  FIR: { icon: Flame, color: "hsl(var(--destructive))", chipClass: "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]" },

  // Manufacturing & Mining
  MFG: { icon: Factory, color: "hsl(var(--chart-4))", chipClass: "bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))]" },
  HVY: { icon: Truck, color: "hsl(var(--warning))", chipClass: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]" },
  TLS: { icon: Wrench, color: "hsl(var(--muted-foreground))", chipClass: "bg-muted text-foreground/80" },

  // Education
  EDU: { icon: GraduationCap, color: "hsl(var(--chart-2))", chipClass: "bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]" },
  SCI: { icon: BookOpen, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },
  VOC: { icon: Wrench, color: "hsl(var(--chart-4))", chipClass: "bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))]" },

  // Agriculture
  AGR: { icon: Wheat, color: "hsl(var(--success))", chipClass: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]" },
  IRR: { icon: Wheat, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },
  PST: { icon: Wheat, color: "hsl(var(--warning))", chipClass: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]" },

  // Government & Public Safety
  PDP: { icon: BookOpenCheck, color: "hsl(var(--chart-1))", chipClass: "bg-[hsl(var(--chart-1)/0.15)] text-[hsl(var(--chart-1))]" },
  PAS: { icon: BookOpenCheck, color: "hsl(var(--chart-1))", chipClass: "bg-[hsl(var(--chart-1)/0.15)] text-[hsl(var(--chart-1))]" },
  BIO: { icon: Fingerprint, color: "hsl(var(--chart-5))", chipClass: "bg-[hsl(var(--chart-5)/0.15)] text-[hsl(var(--chart-5))]" },
  BRD: { icon: ShieldCheck, color: "hsl(var(--success))", chipClass: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]" },
  BDR: { icon: ShieldCheck, color: "hsl(var(--success))", chipClass: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]" },
  SEC: { icon: ShieldCheck, color: "hsl(var(--info))", chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]" },
  UNI: { icon: Shirt, color: "hsl(var(--warning))", chipClass: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]" },
  PPE: { icon: Shirt, color: "hsl(var(--warning))", chipClass: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]" },
  COM: { icon: Radio, color: "hsl(var(--chart-2))", chipClass: "bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]" },

  // Corporate & Hospitality
  OFF: { icon: Armchair, color: "hsl(var(--chart-4))", chipClass: "bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))]" },
  FF:  { icon: Armchair, color: "hsl(var(--chart-4))", chipClass: "bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))]" },
  KIT: { icon: UtensilsCrossed, color: "hsl(var(--warning))", chipClass: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]" },
};

const NAME_TO_CODE: Record<string, string> = {
  "ict equipment": "ICT",
  "ict & networking equipment": "ICT",
  "vehicles & transport": "VEH",
  "fleet vehicles & vessels": "VEH",
  "office furniture": "OFF",
  "office equipment & furniture": "OFF",
  "buildings & infrastructure": "BLD",
  "communication equipment": "COM",
  "passport & document production": "PAS",
  "biometric & identity capture": "BIO",
  "border control equipment": "BRD",
  "border & security screening": "BDR",
  "uniforms & accoutrements": "UNI",
  "uniforms & personal protective equipment": "PPE",
  "diagnostic & medical imaging": "IMG",
  "laboratory & pathology equipment": "LAB",
  "patient care & monitoring": "PCM",
  "surgical & operating theatre": "SUR",
  "cold chain & vaccine storage": "CLD",
  "mobile health & emergency response": "AMB",
  "atms & cash recyclers": "ATM",
  "point of sale & payment devices": "POS",
  "vault & cash processing systems": "VLT",
  "branch teller & counter stations": "BNK",
  "server & datacenter infrastructure": "SRV",
  "networking & telecommunications": "NET",
  "end-user computing & workstations": "CMP",
  "power backup & ups systems": "UPS",
  "passenger vehicles & light fleet": "FLT",
  "heavy commercial trucks & haulage": "TRK",
  "warehouse & material handling": "WHS",
  "power generation & solar plants": "PWR",
  "heavy earthmoving equipment": "HVY",
  "production & processing machinery": "MFG",
  "smart classroom & audio-visual": "EDU",
  "scientific & research laboratories": "SCI",
  "tractors & agricultural implements": "AGR",
  "irrigation & water distribution": "IRR",
  "medical equipment": "IMG",
  "heavy machinery": "HVY",
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function metaFromCustom(
  iconName: string | null | undefined,
  accentColor: string | null | undefined,
  base: CategoryMeta,
): CategoryMeta {
  const customIcon = getIconByName(iconName ?? undefined);
  if (!customIcon && !accentColor) return base;
  if (accentColor) {
    return {
      icon: customIcon ?? base.icon,
      color: accentColor,
      // Inline-style chip so any hex value works; tailwind classes can't see runtime values.
      chipClass: "",
      chipStyle: { backgroundColor: `${accentColor}26`, color: accentColor },
    };
  }
  return { ...base, icon: customIcon ?? base.icon };
}

export function getCategoryMeta(
  name?: string | null,
  code?: string | null,
  iconName?: string | null,
  accentColor?: string | null,
): CategoryMeta {
  let base: CategoryMeta = FALLBACK_META;
  if (code) {
    const m = META_BY_KEY[code.toUpperCase()];
    if (m) base = m;
  }
  if (base === FALLBACK_META && name) {
    const norm = name.trim().toLowerCase();
    const mapped = NAME_TO_CODE[norm];
    if (mapped && META_BY_KEY[mapped]) {
      base = META_BY_KEY[mapped];
    } else {
      base = FALLBACK_PALETTE[hashString(norm) % FALLBACK_PALETTE.length];
    }
  }
  if (iconName || accentColor) return metaFromCustom(iconName, accentColor, base);
  return base;
}

export function getCategoryColor(
  name?: string | null,
  code?: string | null,
  iconName?: string | null,
  accentColor?: string | null,
): string {
  return getCategoryMeta(name, code, iconName, accentColor).color;
}
