import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";

interface District {
  id?: string;
  districtName?: string;
}

interface DistrictPickerProps {
  districts: District[];
  selectedId: string;
  onSelect: (id: string) => void;
  visible: boolean;
}

export function DistrictPicker({ districts, selectedId, onSelect, visible }: DistrictPickerProps) {
  return (
    <div
      className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        visible ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
      )}
    >
      <div className="pt-2 pb-1">
        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          Select District
        </p>
        <div className="flex flex-wrap gap-1.5">
          {districts.map((d) => {
            const isSelected = selectedId === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelect(isSelected ? "" : d.id!)}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-all duration-150",
                  "hover:scale-105 active:scale-95 cursor-pointer select-none",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-accent"
                )}
              >
                {d.districtName}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
