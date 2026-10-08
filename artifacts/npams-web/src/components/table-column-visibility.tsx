import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ColumnDefinition {
  id: string;
  label: string;
  alwaysVisible?: boolean;
}

interface ColumnVisibilityDropdownProps {
  columns: ColumnDefinition[];
  visibleColumns: Record<string, boolean>;
  onChange: (visibleColumns: Record<string, boolean>) => void;
  className?: string;
}

export function ColumnVisibilityDropdown({
  columns,
  visibleColumns,
  onChange,
  className,
}: ColumnVisibilityDropdownProps) {
  const toggleColumn = (id: string) => {
    onChange({
      ...visibleColumns,
      [id]: !visibleColumns[id],
    });
  };

  const showAll = () => {
    const updated: Record<string, boolean> = {};
    for (const c of columns) updated[c.id] = true;
    onChange(updated);
  };

  const resetDefaults = () => {
    const updated: Record<string, boolean> = {};
    for (const c of columns) updated[c.id] = true;
    onChange(updated);
  };

  const visibleCount = columns.filter((c) => visibleColumns[c.id] !== false).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9 gap-2 text-xs font-medium", className)}>
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Columns</span>
          <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-semibold text-foreground">
            {visibleCount}/{columns.length}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1.5">
        <DropdownMenuLabel className="text-xs font-semibold px-2 py-1">Toggle Columns</DropdownMenuLabel>
        <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
          <button type="button" onClick={showAll} className="hover:text-primary transition-colors cursor-pointer">
            Show all
          </button>
          <button type="button" onClick={resetDefaults} className="hover:text-primary transition-colors cursor-pointer">
            Reset
          </button>
        </div>
        <DropdownMenuSeparator className="my-1" />
        <div className="max-h-60 overflow-y-auto space-y-0.5">
          {columns.map((col) => {
            const isChecked = visibleColumns[col.id] !== false;
            return (
              <DropdownMenuCheckboxItem
                key={col.id}
                checked={isChecked}
                onCheckedChange={() => !col.alwaysVisible && toggleColumn(col.id)}
                disabled={col.alwaysVisible}
                className="text-xs py-1.5 cursor-pointer"
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SortableHeaderProps {
  label: string;
  field: string;
  currentSortField?: string;
  currentSortDir?: "asc" | "desc";
  onSort: (field: string) => void;
  className?: string;
}

export function SortableHeader({
  label,
  field,
  currentSortField,
  currentSortDir,
  onSort,
  className,
}: SortableHeaderProps) {
  const isSorted = currentSortField === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        "group inline-flex items-center gap-1.5 text-xs font-semibold select-none hover:text-foreground transition-colors cursor-pointer text-left",
        isSorted ? "text-primary" : "text-muted-foreground",
        className,
      )}
      aria-sort={isSorted ? (currentSortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{label}</span>
      {isSorted ? (
        currentSortDir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 text-primary transition-transform" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 text-primary transition-transform" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}

/**
 * Universal client-side CSV download helper
 */
export function exportToCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const content = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) => {
          if (cell == null) return '""';
          const str = String(cell).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(","),
    ),
  ].join("\r\n");

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
