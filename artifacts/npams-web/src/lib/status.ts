import type { BadgeProps } from "@/components/ui/badge";

export type AssetStatus = "active" | "inactive" | "under_maintenance" | "disposed" | "missing" | string;

export function statusBadgeVariant(status?: string): BadgeProps["variant"] {
  switch (status?.toLowerCase()) {
    case "active":
    case "operational":
      return "default";
    case "under_maintenance":
    case "maintenance":
      return "secondary";
    case "disposed":
    case "retired":
      return "outline";
    case "missing":
    case "lost":
      return "destructive";
    default:
      return "secondary";
  }
}

export function statusBadgeClass(status?: string): string {
  switch (status?.toLowerCase()) {
    case "active":
    case "operational":
      return "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.9)] text-[hsl(var(--success-foreground))]";
    case "under_maintenance":
    case "maintenance":
      return "bg-[hsl(var(--warning))] hover:bg-[hsl(var(--warning)/0.9)] text-[hsl(var(--warning-foreground))]";
    case "disposed":
    case "retired":
      return "bg-muted hover:bg-muted/80 text-muted-foreground";
    case "missing":
    case "lost":
      return "bg-destructive hover:bg-destructive/90 text-destructive-foreground";
    default:
      return "";
  }
}

export function conditionBadgeClass(condition?: string): string {
  switch (condition?.toLowerCase()) {
    case "excellent":
    case "good":
      return "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.3)]";
    case "fair":
      return "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.3)]";
    case "poor":
    case "critical":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "";
  }
}

/**
 * Shared CSS-variable color map for chart fills and inline status indicators.
 * Returning `hsl(var(--token))` strings keeps the values theme-aware so they
 * automatically adapt to dark mode.
 */
export const STATUS_COLOR_MAP: Record<string, string> = {
  active:            "hsl(var(--success))",
  operational:       "hsl(var(--success))",
  missing:           "hsl(var(--destructive))",
  lost:              "hsl(var(--destructive))",
  under_maintenance: "hsl(var(--warning))",
  maintenance:       "hsl(var(--warning))",
  disposed:          "hsl(var(--muted-foreground))",
  retired:           "hsl(var(--muted-foreground))",
  transferred:       "hsl(var(--info))",
};

export const CONDITION_COLOR_MAP: Record<string, string> = {
  new:           "hsl(var(--success))",
  excellent:     "hsl(var(--success))",
  good:          "hsl(var(--success))",
  fair:          "hsl(var(--warning))",
  poor:          "hsl(var(--destructive))",
  critical:      "hsl(var(--destructive))",
  unserviceable: "hsl(var(--muted-foreground))",
};

export const FALLBACK_STATUS_COLOR = "hsl(var(--muted-foreground))";

/**
 * Foreground color paired with each entry in STATUS_COLOR_MAP. Use these
 * together when rendering inline status pills via inline `style` so the text
 * keeps proper contrast against the (theme-aware) background in both modes.
 */
export const STATUS_TEXT_COLOR_MAP: Record<string, string> = {
  active:            "hsl(var(--success-foreground))",
  operational:       "hsl(var(--success-foreground))",
  missing:           "hsl(var(--destructive-foreground))",
  lost:              "hsl(var(--destructive-foreground))",
  under_maintenance: "hsl(var(--warning-foreground))",
  maintenance:       "hsl(var(--warning-foreground))",
  disposed:          "hsl(var(--background))",
  retired:           "hsl(var(--background))",
  transferred:       "hsl(var(--info-foreground))",
};

export const FALLBACK_STATUS_TEXT_COLOR = "hsl(var(--background))";
