import { useRef, useState, useEffect, useCallback } from "react";
import { Pipette, AlertCircle } from "lucide-react";

interface FlagColorPickerProps {
  flagUrl: string;
  onColorPicked: (hex: string) => void;
  maxColors?: number;
  currentCount?: number;
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function FlagColorPicker({ flagUrl, onColorPicked, maxColors = 8, currentCount = 0 }: FlagColorPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [corsError, setCorsError] = useState(false);
  const [isPickMode, setIsPickMode] = useState(false);

  const drawImage = useCallback((img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const drawW = img.naturalWidth * ratio;
    const drawH = img.naturalHeight * ratio;
    const offsetX = (canvas.width - drawW) / 2;
    const offsetY = (canvas.height - drawH) / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  }, []);

  useEffect(() => {
    if (!flagUrl) return;
    setLoaded(false);
    setCorsError(false);
    setHoverColor(null);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      drawImage(img);
      setLoaded(true);
      setCorsError(false);
    };
    img.onerror = () => {
      const img2 = new Image();
      img2.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const ratio = Math.min(canvas.width / img2.naturalWidth, canvas.height / img2.naturalHeight);
        const drawW = img2.naturalWidth * ratio;
        const drawH = img2.naturalHeight * ratio;
        const offsetX = (canvas.width - drawW) / 2;
        const offsetY = (canvas.height - drawH) / 2;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        try {
          ctx.drawImage(img2, offsetX, offsetY, drawW, drawH);
          setLoaded(true);
          setCorsError(true);
        } catch {
          setCorsError(true);
        }
      };
      img2.onerror = () => setCorsError(true);
      img2.src = flagUrl;
    };
    img.src = flagUrl;
  }, [flagUrl, drawImage]);

  const getColorAt = useCallback((e: React.MouseEvent<HTMLCanvasElement>): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    try {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      if (pixel[3] === 0) return null;
      return rgbToHex(pixel[0], pixel[1], pixel[2]);
    } catch {
      return null;
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPickMode) return;
    const color = getColorAt(e);
    if (color) {
      setHoverColor(color);
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, [isPickMode, getColorAt]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPickMode) return;
    if (corsError) return;
    if (currentCount >= maxColors) return;
    const color = getColorAt(e);
    if (color) {
      onColorPicked(color);
    }
  }, [isPickMode, corsError, currentCount, maxColors, getColorAt, onColorPicked]);

  const handleMouseLeave = useCallback(() => {
    setHoverColor(null);
    setHoverPos(null);
  }, []);

  if (!flagUrl) return null;

  const canAddMore = currentCount < maxColors;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Pipette className="w-3.5 h-3.5" />
          Pick from flag
        </span>
        {loaded && !corsError && canAddMore && (
          <button
            type="button"
            onClick={() => setIsPickMode((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors font-medium ${
              isPickMode
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
            }`}
          >
            {isPickMode ? "Picking — click flag" : "Enable Eyedropper"}
          </button>
        )}
        {!canAddMore && (
          <span className="text-xs text-muted-foreground">Max {maxColors} colors reached</span>
        )}
      </div>

      <div className="relative rounded-lg overflow-hidden border bg-muted/30">
        <canvas
          ref={canvasRef}
          width={480}
          height={180}
          className={`w-full h-36 block ${isPickMode && !corsError ? "cursor-crosshair" : "cursor-default"}`}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onMouseLeave={handleMouseLeave}
        />

        {isPickMode && !corsError && (
          <div className="absolute inset-0 pointer-events-none ring-2 ring-primary ring-inset rounded-lg">
            <div className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-[10px] font-medium px-2 py-0.5 rounded">
              Click to sample color
            </div>
          </div>
        )}

        {hoverColor && hoverPos && isPickMode && (
          <div
            className="absolute pointer-events-none z-10"
            style={{ left: Math.min(hoverPos.x + 12, 280), top: Math.max(hoverPos.y - 36, 4) }}
          >
            <div className="flex items-center gap-1.5 bg-popover border rounded-md shadow-lg px-2 py-1">
              <div className="w-4 h-4 rounded-sm border shrink-0" style={{ backgroundColor: hoverColor }} />
              <span className="text-xs font-mono font-medium">{hoverColor}</span>
            </div>
          </div>
        )}

        {!loaded && !corsError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/60 text-xs text-muted-foreground">
            Loading flag...
          </div>
        )}
      </div>

      {corsError && (
        <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-md p-2.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            The flag image cannot be sampled because the hosting server does not allow cross-origin access.
            Use the color pickers in the palette below instead.
          </span>
        </div>
      )}
    </div>
  );
}
