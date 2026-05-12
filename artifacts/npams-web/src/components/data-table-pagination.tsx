import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  label?: string;
}

function buildPageList(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < totalPages - 1) out.push("…");
  out.push(totalPages);
  return out;
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className,
  label = "items",
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  const pages = useMemo(() => buildPageList(safePage, totalPages), [safePage, totalPages]);

  if (total === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-4 py-3 border-t bg-card sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from.toLocaleString()}</span>–
        <span className="font-medium text-foreground">{to.toLocaleString()}</span> of{" "}
        <span className="font-medium text-foreground">{total.toLocaleString()}</span> {label}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                onPageSizeChange(Number(v));
                onPageChange(1);
              }}
            >
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(1)}
            disabled={safePage === 1}
            aria-label="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage === 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {pages.map((p, idx) =>
            p === "…" ? (
              <span
                key={`gap-${idx}`}
                className="px-2 text-sm text-muted-foreground select-none"
                aria-hidden
              >
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === safePage ? "default" : "outline"}
                size="sm"
                className="h-8 min-w-8 px-2"
                onClick={() => onPageChange(p as number)}
                aria-current={p === safePage ? "page" : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </Button>
            ),
          )}

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage === totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(totalPages)}
            disabled={safePage === totalPages}
            aria-label="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for client-side pagination over an in-memory array.
 * Returns the slice for the current page plus the props you can spread
 * into <DataTablePagination />.
 */
export function useClientPagination<T>(
  items: T[] | undefined | null,
  initialPageSize = 20,
) {
  const list = items ?? [];
  return useClientPaginationInternal(list, initialPageSize);
}

import { useEffect, useState } from "react";

function useClientPaginationInternal<T>(items: T[], initialPageSize: number) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Reset to page 1 if the underlying list shrinks past the current page
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    if (page > totalPages) setPage(1);
  }, [items.length, pageSize, page]);

  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);

  return {
    pageItems: slice,
    paginationProps: {
      page,
      pageSize,
      total: items.length,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
    } as const,
    setPage,
    setPageSize,
  };
}
