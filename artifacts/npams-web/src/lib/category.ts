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
  type LucideIcon,
} from "lucide-react";

export type CategoryMeta = {
  icon: LucideIcon;
  /** CSS color string for chart fills, dots, etc. (theme-aware where possible) */
  color: string;
  /** Tailwind classes for a tinted icon chip (background + foreground) */
  chipClass: string;
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
  ICT: {
    icon: Monitor,
    color: "hsl(var(--info))",
    chipClass: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]",
  },
  VEH: {
    icon: Car,
    color: "hsl(var(--chart-3))",
    chipClass: "bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))]",
  },
  OFF: {
    icon: Armchair,
    color: "hsl(var(--chart-4))",
    chipClass: "bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))]",
  },
  BLD: {
    icon: Building2,
    color: "hsl(var(--muted-foreground))",
    chipClass: "bg-muted text-foreground/80",
  },
  COM: {
    icon: Radio,
    color: "hsl(var(--chart-2))",
    chipClass: "bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]",
  },
  PDP: {
    icon: BookOpenCheck,
    color: "hsl(var(--chart-1))",
    chipClass: "bg-[hsl(var(--chart-1)/0.15)] text-[hsl(var(--chart-1))]",
  },
  BIO: {
    icon: Fingerprint,
    color: "hsl(var(--chart-5))",
    chipClass: "bg-[hsl(var(--chart-5)/0.15)] text-[hsl(var(--chart-5))]",
  },
  BRD: {
    icon: ShieldCheck,
    color: "hsl(var(--success))",
    chipClass: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]",
  },
  UNI: {
    icon: Shirt,
    color: "hsl(var(--warning))",
    chipClass: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
  },
};

const NAME_TO_CODE: Record<string, string> = {
  "ict equipment": "ICT",
  "vehicles & transport": "VEH",
  "office furniture": "OFF",
  "buildings & infrastructure": "BLD",
  "communication equipment": "COM",
  "passport & document production": "PDP",
  "biometric & identity capture": "BIO",
  "border control equipment": "BRD",
  "uniforms & accoutrements": "UNI",
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getCategoryMeta(
  name?: string | null,
  code?: string | null,
): CategoryMeta {
  if (code) {
    const m = META_BY_KEY[code.toUpperCase()];
    if (m) return m;
  }
  if (name) {
    const norm = name.trim().toLowerCase();
    const mapped = NAME_TO_CODE[norm];
    if (mapped && META_BY_KEY[mapped]) return META_BY_KEY[mapped];
    return FALLBACK_PALETTE[hashString(norm) % FALLBACK_PALETTE.length];
  }
  return FALLBACK_META;
}

export function getCategoryColor(
  name?: string | null,
  code?: string | null,
): string {
  return getCategoryMeta(name, code).color;
}
