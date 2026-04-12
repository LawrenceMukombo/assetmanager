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
      return "bg-green-600 hover:bg-green-700 text-white";
    case "under_maintenance":
    case "maintenance":
      return "bg-amber-500 hover:bg-amber-600 text-white";
    case "disposed":
    case "retired":
      return "bg-gray-400 hover:bg-gray-500 text-white";
    case "missing":
    case "lost":
      return "bg-red-600 hover:bg-red-700 text-white";
    default:
      return "";
  }
}

export function conditionBadgeClass(condition?: string): string {
  switch (condition?.toLowerCase()) {
    case "excellent":
    case "good":
      return "bg-green-100 text-green-800 border-green-200";
    case "fair":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "poor":
    case "critical":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "";
  }
}
