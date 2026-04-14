import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapIcon, ZoomIn } from "lucide-react";

// Maps DB province_code → GADM NAME_1 (GeoJSON property)
const DB_CODE_TO_GADM: Record<string, string> = {
  WS: "Western", GU: "Gulf", CP: "Central", NCD: "NationalCapitalDistrict",
  MB: "MilneBay", NO: "Oro", MO: "Morobe", MD: "Madang",
  ES: "EastSepik", SA: "Sandaun", MA: "Manus", NI: "NewIreland",
  ENB: "EastNewBritain", WNB: "WestNewBritain", AB: "Bougainville",
  CH: "Chimbu", EH: "EasternHighlands", WHP: "WesternHighlands",
  SH: "SouthernHighlands", EN: "Enga", HE: "Hela", JI: "Jiwaka",
};

// Reverse: GADM NAME_1 → DB province_code
const GADM_TO_DB_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(DB_CODE_TO_GADM).map(([k, v]) => [v, k])
);

// Region color palette
const REGION_COLORS: Record<string, string> = {
  Southern: "#1565C0",
  Highlands: "#6A1B9A",
  Momase: "#2E7D32",
  Islands: "#B71C1C",
};

// DB province_code → region
const CODE_TO_REGION: Record<string, string> = {
  CP: "Southern", GU: "Southern", MB: "Southern", NCD: "Southern", NO: "Southern", WS: "Southern",
  CH: "Highlands", EH: "Highlands", EN: "Highlands", HE: "Highlands", JI: "Highlands", SH: "Highlands", WHP: "Highlands",
  ES: "Momase", MD: "Momase", MO: "Momase", SA: "Momase",
  AB: "Islands", ENB: "Islands", MA: "Islands", NI: "Islands", WNB: "Islands",
};

function getChoroColor(count: number, max: number): string {
  if (max === 0 || count === 0) return "#e2e8f0";
  const t = Math.sqrt(count / max);
  const r = Math.round(30 + (220 - 30) * (1 - t));
  const g = Math.round(100 + (220 - 100) * (1 - t));
  const b = Math.round(170 + (30 - 170) * t);
  return `rgb(${r},${g},${b})`;
}

export interface ProvinceAssetData {
  province_id: string;
  province_name: string;
  province_code: string;
  flag_url: string;
  theme_accent_color: string;
  total_assets: number;
  total_value: string;
  missing_assets: number;
  active_assets: number;
}

interface DashboardMapProps {
  assetsByProvince: ProvinceAssetData[];
  selectedRegion?: string | null;
  selectedProvinceCode?: string | null;
  onProvinceClick?: (provinceCode: string, provinceName: string, provinceId: string) => void;
  height?: number;
}

interface TooltipState {
  x: number;
  y: number;
  data: ProvinceAssetData | null;
  name: string;
  region: string;
}

const PNG_CENTER: [number, number] = [-6.5, 146.5];

export default function DashboardMap({
  assetsByProvince,
  selectedRegion,
  selectedProvinceCode,
  onProvinceClick,
  height = 380,
}: DashboardMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Always-current ref for the callback so Leaflet event handlers are never stale
  const onProvinceClickRef = useRef(onProvinceClick);
  useEffect(() => { onProvinceClickRef.current = onProvinceClick; }, [onProvinceClick]);

  // Build lookup: province_code → data row
  const assetMap = new Map<string, ProvinceAssetData>(
    assetsByProvince.map(p => [p.province_code, p])
  );
  const maxAssets = Math.max(1, ...assetsByProvince.map(p => p.total_assets));

  // Load GeoJSON once
  useEffect(() => {
    fetch("/png-provinces.geojson")
      .then(r => r.json())
      .then(setGeoData)
      .catch(console.error);
  }, []);

  // Init map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: PNG_CENTER,
      zoom: 5,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      opacity: 0.3,
    }).addTo(map);
    mapRef.current = map;
    setMapReady(true);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render GeoJSON layer whenever data or filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geoData || !mapReady) return;

    if (geoLayerRef.current) {
      geoLayerRef.current.remove();
      geoLayerRef.current = null;
    }

    const layer = L.geoJSON(geoData, {
      style: (feature) => {
        if (!feature) return {};
        const gadmName = feature.properties?.NAME_1 as string;
        const dbCode = GADM_TO_DB_CODE[gadmName];
        const row = dbCode ? assetMap.get(dbCode) : undefined;
        const count = row?.total_assets ?? 0;
        const region = dbCode ? CODE_TO_REGION[dbCode] : null;

        const isSelectedProv = dbCode && selectedProvinceCode &&
          dbCode === selectedProvinceCode;
        const isSelectedRegion = region && selectedRegion &&
          region === selectedRegion && !selectedProvinceCode;
        const isFiltered = selectedRegion || selectedProvinceCode;

        let fillColor = getChoroColor(count, maxAssets);
        let fillOpacity = 0.75;
        let weight = 1;
        let color = "#ffffff";

        if (isSelectedProv) {
          fillColor = REGION_COLORS[region ?? ""] ?? "#CE1126";
          fillOpacity = 0.9;
          weight = 3;
          color = "#fff";
        } else if (isSelectedRegion) {
          fillColor = REGION_COLORS[region] ?? fillColor;
          fillOpacity = 0.8;
          weight = 2.5;
          color = "#fff";
        } else if (isFiltered) {
          fillOpacity = 0.25;
          weight = 0.5;
        }

        return { fillColor, fillOpacity, weight, color, opacity: 1 };
      },
      onEachFeature: (feature, fl) => {
        const gadmName = feature.properties?.NAME_1 as string;
        const dbCode = GADM_TO_DB_CODE[gadmName];
        const row = dbCode ? assetMap.get(dbCode) : undefined;
        const region = dbCode ? CODE_TO_REGION[dbCode] : "Unknown";

        fl.on("mouseover", (e) => {
          const path = e.target as L.Path;
          path.setStyle({ weight: 2.5, color: "#fff", fillOpacity: 0.95 });
          (path as L.Path & { bringToFront(): void }).bringToFront();

          const containerEl = mapContainerRef.current;
          if (!containerEl) return;
          const rect = containerEl.getBoundingClientRect();
          const latlng = e.latlng as L.LatLng;
          const point = map.latLngToContainerPoint(latlng);

          setTooltip({
            x: point.x,
            y: point.y,
            data: row ?? null,
            name: row?.province_name ?? gadmName.replace(/([A-Z])/g, " $1").trim(),
            region: region ?? "Unknown",
          });
        });

        fl.on("mouseout", (e) => {
          layer.resetStyle(e.target as L.Path);
          setTooltip(null);
        });

        fl.on("click", () => {
          if (!dbCode || !row) return;
          onProvinceClickRef.current?.(dbCode, row.province_name, row.province_id);
        });
      },
    });

    layer.addTo(map);
    geoLayerRef.current = layer;
  }, [geoData, assetsByProvince, selectedRegion, selectedProvinceCode, mapReady, maxAssets]);

  // Fly to selected province
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geoLayerRef.current || !mapReady) return;
    if (!selectedProvinceCode && !selectedRegion) {
      map.flyTo(PNG_CENTER, 5, { duration: 0.8 });
      return;
    }
    const bounds: L.LatLngBounds[] = [];
    geoLayerRef.current.eachLayer((fl) => {
      const feature = (fl as L.GeoJSON & { feature: GeoJSON.Feature }).feature;
      if (!feature) return;
      const gadmName = feature.properties?.NAME_1 as string;
      const dbCode = GADM_TO_DB_CODE[gadmName];
      if (!dbCode) return;

      const matchProv = selectedProvinceCode && dbCode === selectedProvinceCode;
      const matchRegion = !selectedProvinceCode && selectedRegion && CODE_TO_REGION[dbCode] === selectedRegion;
      if (matchProv || matchRegion) {
        bounds.push((fl as L.Path & { getBounds(): L.LatLngBounds }).getBounds());
      }
    });
    if (bounds.length > 0) {
      const combined = bounds.reduce((acc, b) => acc.extend(b), bounds[0]);
      map.flyToBounds(combined, { padding: [20, 20], maxZoom: 8, duration: 0.8 });
    }
  }, [selectedProvinceCode, selectedRegion, mapReady]);

  const regionBreakdown = Array.from(
    assetsByProvince.reduce((acc, p) => {
      const r = CODE_TO_REGION[p.province_code] ?? "Other";
      acc.set(r, (acc.get(r) ?? 0) + p.total_assets);
      return acc;
    }, new Map<string, number>())
  ).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-primary" />
            Geographic Asset Distribution
          </span>
          <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
            <ZoomIn className="w-3 h-3" /> Click a province to filter
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-3">
        <div className="relative mx-3 rounded-lg overflow-hidden border" style={{ height }}>
          {/* Leaflet map */}
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute z-[1000] pointer-events-none bg-popover border rounded-lg shadow-lg p-3 text-sm min-w-[180px]"
              style={{
                left: tooltip.x + 12,
                top: tooltip.y - 40,
                transform: tooltip.x > (mapContainerRef.current?.offsetWidth ?? 400) - 220
                  ? "translateX(-110%)" : undefined,
              }}
            >
              <p className="font-semibold leading-tight">{tooltip.name}</p>
              <p className="text-xs text-muted-foreground mb-2">{tooltip.region} Region</p>
              {tooltip.data ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Total assets</span>
                    <span className="font-medium">{tooltip.data.total_assets}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Active</span>
                    <span className="font-medium text-green-600">{tooltip.data.active_assets}</span>
                  </div>
                  {tooltip.data.missing_assets > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Missing</span>
                      <span className="font-medium text-red-500">{tooltip.data.missing_assets}</span>
                    </div>
                  )}
                  {tooltip.data.total_value && parseFloat(tooltip.data.total_value) > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Value</span>
                      <span className="font-medium">K {parseFloat(tooltip.data.total_value).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No asset data</p>
              )}
            </div>
          )}

          {/* Choropleth legend */}
          <div className="absolute bottom-3 left-3 z-[999] bg-background/90 border rounded-md px-3 py-2 text-xs space-y-1.5 shadow">
            <p className="font-semibold text-muted-foreground mb-1">Assets</p>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#e2e8f0" }} />
              <span>0</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getChoroColor(Math.round(maxAssets * 0.25), maxAssets) }} />
              <span>Low</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getChoroColor(Math.round(maxAssets * 0.6), maxAssets) }} />
              <span>Mid</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getChoroColor(maxAssets, maxAssets) }} />
              <span>{maxAssets}+</span>
            </div>
          </div>
        </div>

        {/* Region summary badges */}
        {regionBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 mt-3">
            {regionBreakdown.map(([region, count]) => (
              <Badge
                key={region}
                variant={selectedRegion === region ? "default" : "outline"}
                className="gap-1.5 cursor-pointer text-xs"
                style={selectedRegion === region ? { backgroundColor: REGION_COLORS[region], color: "#fff" } : {}}
                onClick={() => {
                  if (selectedRegion === region) {
                    onProvinceClick?.("__clearRegion__", "", "");
                  } else {
                    onProvinceClick?.("__region__", region, region);
                  }
                }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: REGION_COLORS[region] ?? "#94a3b8" }}
                />
                {region}: {count}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
