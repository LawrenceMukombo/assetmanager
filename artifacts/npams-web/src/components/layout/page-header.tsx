import { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderCrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  breadcrumbs?: PageHeaderCrumb[];
  actions?: ReactNode;
  className?: string;
  badge?: ReactNode;
  /** Wrap the header in a rounded card "tile" container. Defaults to false (inline header). */
  tile?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  breadcrumbs,
  actions,
  badge,
  tile = false,
  className,
}: PageHeaderProps) {
  const inner = (
    <div className={cn("flex flex-col gap-3", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors inline-flex items-center">
            <Home className="w-3.5 h-3.5" />
          </Link>
          {breadcrumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              {c.href && i < breadcrumbs.length - 1 ? (
                <Link href={c.href} className="hover:text-foreground transition-colors">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground font-medium" aria-current={i === breadcrumbs.length - 1 ? "page" : undefined}>
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <div className="shrink-0 mt-0.5 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-accent text-accent-foreground">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-[1.75rem] font-semibold tracking-tight leading-tight">
                {title}
              </h1>
              {badge}
            </div>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1 max-w-prose">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
      </div>
    </div>
  );

  if (!tile) return inner;

  return (
    <div className="rounded-xl border border-card-border bg-card shadow-sm p-5 sm:p-6">
      {inner}
    </div>
  );
}
