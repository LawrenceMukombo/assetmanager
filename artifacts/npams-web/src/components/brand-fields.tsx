import { useState, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetchJson } from "@/lib/api-fetch";
import { Upload, Image as ImageIcon, Pipette, X } from "lucide-react";

export const PRESET_BRAND_COLORS = [
  { name: "Corporate Navy", hex: "#0F4C81" },
  { name: "Royal Blue", hex: "#2563EB" },
  { name: "Emerald Green", hex: "#059669" },
  { name: "Forest Green", hex: "#15803D" },
  { name: "Royal Purple", hex: "#7C3AED" },
  { name: "Deep Plum", hex: "#5B2C6F" },
  { name: "Crimson Red", hex: "#B91C1C" },
  { name: "Warm Amber", hex: "#D97706" },
  { name: "Dark Slate", hex: "#334155" },
];

export interface LogoUploaderFieldProps {
  id?: string;
  label?: string;
  description?: string;
  value: string;
  onChange: (url: string) => void;
}

export function LogoUploaderField({
  id = "logo-upload",
  label = "Organization Logo",
  description = "PNG, JPG, SVG, WebP (up to 10MB)",
  value,
  onChange,
}: LogoUploaderFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File Too Large",
        description: "Please select an image smaller than 10MB.",
      });
      return;
    }

    setIsUploading(true);
    try {
      let finalUrl = "";
      try {
        const res = await apiFetchJson<{ uploadURL: string; objectPath: string }>("/api/storage/uploads/request-url", {
          method: "POST",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });

        if (res.ok && res.data?.uploadURL) {
          const uploadRes = await fetch(res.data.uploadURL, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });

          if (uploadRes.ok) {
            finalUrl = `/api/storage${res.data.objectPath}`;
          }
        }
      } catch {
        // network or storage endpoint fallback
      }

      if (!finalUrl) {
        finalUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
      }

      onChange(finalUrl);
      toast({
        title: "Logo Loaded",
        description: `Successfully loaded '${file.name}'.`,
      });
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: err instanceof Error ? err.message : "Failed to process logo file.",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs font-semibold">
          {label}
        </Label>
        <button
          type="button"
          onClick={() => setShowManualUrl(!showManualUrl)}
          className="text-[11px] text-primary hover:underline font-medium"
        >
          {showManualUrl ? "Upload file" : "Enter URL instead"}
        </button>
      </div>

      {showManualUrl ? (
        <Input
          id={id}
          placeholder="/agencies/your-logo.png or https://..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="flex items-center gap-3">
          {value ? (
            <div className="relative group shrink-0">
              <img
                src={value}
                alt="Logo preview"
                className="w-12 h-12 object-contain rounded-md bg-white p-1 border shadow-xs"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <button
                type="button"
                onClick={() => onChange("")}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px] shadow-sm hover:scale-110 transition-transform"
                title="Remove logo"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : (
            <div className="w-12 h-12 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30 text-muted-foreground shrink-0">
              <ImageIcon className="w-5 h-5 opacity-50" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              className="hidden"
              id={id}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="h-8 text-xs font-medium w-full flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              {isUploading ? "Uploading..." : value ? "Change Logo File" : "Upload from Computer"}
            </Button>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export interface BrandColorPickerFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (hex: string) => void;
}

export function BrandColorPickerField({
  id = "color-picker",
  label = "Primary Brand Color",
  value,
  onChange,
}: BrandColorPickerFieldProps) {
  const normalizedColor = value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#0F4C81";

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <input
            type="color"
            id={id}
            value={normalizedColor}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
            title="Click to open color picker"
          />
          <div
            className="w-9 h-9 rounded-md border shadow-xs cursor-pointer flex items-center justify-center transition-transform hover:scale-105"
            style={{ backgroundColor: value || "#0F4C81" }}
          >
            <Pipette className="w-3.5 h-3.5 text-white/90 drop-shadow-sm pointer-events-none" />
          </div>
        </div>

        <Input
          placeholder="#0F4C81"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs uppercase"
          maxLength={7}
        />
      </div>

      <div className="flex items-center gap-1.5 pt-0.5">
        <span className="text-[10px] text-muted-foreground mr-1">Presets:</span>
        <div className="flex flex-wrap items-center gap-1">
          {PRESET_BRAND_COLORS.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              onClick={() => onChange(preset.hex)}
              className="w-4 h-4 rounded-full border border-black/10 hover:scale-125 transition-transform shrink-0 relative"
              style={{ backgroundColor: preset.hex }}
              title={`${preset.name} (${preset.hex})`}
            >
              {value?.toUpperCase() === preset.hex && (
                <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-bold leading-none">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
