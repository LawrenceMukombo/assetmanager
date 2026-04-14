import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "@/hooks/use-auth";
import { useProvinceBranding } from "@/hooks/use-province-branding";
import { PNG_PROVINCES, PNG_CENTER, getPNGBounds } from "@/data/png-provinces";
import type { ProvinceProfile } from "@/data/png-provinces";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MapIcon,
  RotateCcw,
  Info,
  Building2,
  Globe,
  Layers,
} from "lucide-react";

// Maps DB province_code → PNG_PROVINCES id
const DB_CODE_TO_GIS_ID: Record<string, string> = {
  WS: "western", GU: "gulf", CP: "central", NCD: "ncd", MB: "milne-bay",
  NO: "oro", MO: "morobe", MD: "madang", ES: "east-sepik", SA: "sandaun",
  MA: "manus", NI: "new-ireland", ENB: "east-new-britain", WNB: "west-new-britain",
  AB: "bougainville", CH: "chimbu", EH: "eastern-highlands", WHP: "western-highlands",
  SH: "southern-highlands", EN: "enga", HE: "hela", JI: "jiwaka",
};

// Maps GADM NAME_1 → PNG_PROVINCES id
const GADM_TO_GIS_ID: Record<string, string> = {
  Bougainville: "bougainville",
  Central: "central",
  Chimbu: "chimbu",
  EastNewBritain: "east-new-britain",
  EastSepik: "east-sepik",
  EasternHighlands: "eastern-highlands",
  Enga: "enga",
  Gulf: "gulf",
  Hela: "hela",
  Jiwaka: "jiwaka",
  Madang: "madang",
  Manus: "manus",
  MilneBay: "milne-bay",
  Morobe: "morobe",
  NationalCapitalDistrict: "ncd",
  NewIreland: "new-ireland",
  Oro: "oro",
  Sandaun: "sandaun",
  SouthernHighlands: "southern-highlands",
  WestNewBritain: "west-new-britain",
  Western: "western",
  WesternHighlands: "western-highlands",
};

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const formatNumber = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}K`
    : n.toString();

const regionColors: Record<string, string> = {
  "Southern": "#1565C0",
  "Momase": "#2E7D32",
  "Highlands": "#6A1B9A",
  "Islands": "#B71C1C",
};

function getProvinceColor(prov: ProvinceProfile) {
  return regionColors[prov.region] ?? prov.color;
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3 text-center">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

export default function GISPage() {
  const { user } = useAuth();
  const { branding } = useProvinceBranding();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const circlesRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const districtMarkersRef = useRef<L.LayerGroup | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const selectedProvinceRef = useRef<ProvinceProfile | null>(null);
  const selectedRegionRef = useRef<string | null>(null);
  const baseLayers = useRef<Record<string, L.TileLayer>>({});
  const currentLayer = useRef<L.TileLayer | null>(null);

  const [selectedProvince, setSelectedProvince] = useState<ProvinceProfile | null>(null);
  const [showDistricts, setShowDistricts] = useState(true);
  const [mapStyle, setMapStyle] = useState<"osm" | "satellite" | "topo">("osm");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [geoReady, setGeoReady] = useState(false);

  const userProvince = useMemo(() => {
    if (user?.scope_level === "national") return null;
    const scope = user?.scope as { province_code?: string; province_name?: string } | null;

    if (scope?.province_code) {
      const gisId = DB_CODE_TO_GIS_ID[scope.province_code];
      if (gisId) return PNG_PROVINCES.find((p) => p.id === gisId) ?? null;
    }

    const scopeProvinceName = scope?.province_name ?? branding.provinceName;
    if (!scopeProvinceName) return null;
    return (
      PNG_PROVINCES.find(
        (p) =>
          p.name.toLowerCase() === scopeProvinceName.toLowerCase() ||
          p.name.toLowerCase().includes(scopeProvinceName.toLowerCase())
      ) ?? null
    );
  }, [user, branding.provinceName]);

  const visibleProvinceIds = useMemo(() => {
    if (user?.scope_level === "national") return new Set(PNG_PROVINCES.map((p) => p.id));
    return userProvince ? new Set([userProvince.id]) : new Set(PNG_PROVINCES.map((p) => p.id));
  }, [user, userProvince]);

  // Style a GeoJSON feature
  const getFeatureStyle = useCallback(
    (feature: GeoJSON.Feature | undefined, isSelected: boolean, isDimmed: boolean): L.PathOptions => {
      const gadmName = feature?.properties?.NAME_1 as string | undefined;
      const gisId = gadmName ? GADM_TO_GIS_ID[gadmName] : undefined;
      const prov = gisId ? PNG_PROVINCES.find((p) => p.id === gisId) : undefined;
      const color = prov ? getProvinceColor(prov) : "#64748b";
      const isVisible = gisId ? visibleProvinceIds.has(gisId) : false;

      if (!isVisible) return { fillOpacity: 0, opacity: 0, weight: 0 };

      return {
        fillColor: color,
        fillOpacity: isSelected ? 0.45 : isDimmed ? 0.05 : 0.2,
        color: isSelected ? color : isDimmed ? "#94a3b8" : "#ffffff",
        weight: isSelected ? 2.5 : isDimmed ? 0.5 : 1.2,
        opacity: isDimmed ? 0.3 : 1,
      };
    },
    [visibleProvinceIds]
  );

  // Refresh all polygon styles based on current selection + region filter
  const refreshGeoStyles = useCallback(() => {
    const layer = geoLayerRef.current;
    if (!layer) return;
    const selProv = selectedProvinceRef.current;
    const selRegion = selectedRegionRef.current;

    layer.eachLayer((l) => {
      const polyLayer = l as L.Path & { feature?: GeoJSON.Feature };
      const gadmName = polyLayer.feature?.properties?.NAME_1 as string | undefined;
      const gisId = gadmName ? GADM_TO_GIS_ID[gadmName] : undefined;
      const prov = gisId ? PNG_PROVINCES.find((p) => p.id === gisId) : undefined;
      const isSelected = !!(selProv && prov && selProv.id === prov.id);
      const isDimmed = !!(selRegion && prov && prov.region !== selRegion && !isSelected);
      polyLayer.setStyle(getFeatureStyle(polyLayer.feature, isSelected, isDimmed));
    });
  }, [getFeatureStyle]);

  function updateDistrictMarkers(prov: ProvinceProfile, group: L.LayerGroup) {
    group.clearLayers();
    prov.districts.forEach((d) => {
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: 7,
        fillColor: "#FCD116",
        color: "#000",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.95,
      });
      marker.bindTooltip(
        `<div style="font-weight:bold;font-size:12px">${d.name}</div>
         <div style="font-size:11px">Capital: ${d.capital}</div>`,
        { direction: "top", className: "leaflet-custom-tooltip" }
      );
      group.addLayer(marker);
    });
  }

  const selectProvince = useCallback(
    (prov: ProvinceProfile) => {
      selectedProvinceRef.current = prov;
      setSelectedProvince(prov);
      if (mapRef.current) {
        mapRef.current.setView([prov.lat, prov.lng], 8, { animate: true, duration: 0.7 });
      }
      if (districtMarkersRef.current) {
        updateDistrictMarkers(prov, districtMarkersRef.current);
        if (!showDistricts && mapRef.current) districtMarkersRef.current.addTo(mapRef.current);
        setShowDistricts(true);
      }
      refreshGeoStyles();
    },
    [refreshGeoStyles, showDistricts]
  );

  // Map initialisation
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: PNG_CENTER,
      zoom: 6,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    });
    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
        maxZoom: 19,
      }
    );
    const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      attribution: 'Map data: &copy; OpenStreetMap, SRTM | Style: &copy; OpenTopoMap',
      maxZoom: 17,
    });

    baseLayers.current = { osm, satellite, topo };
    osm.addTo(map);
    currentLayer.current = osm;

    const districtGroup = L.layerGroup().addTo(map);
    districtMarkersRef.current = districtGroup;

    // Fetch & render province boundaries GeoJSON
    fetch("/png-provinces.geojson")
      .then((r) => r.json())
      .then((geojsonData: GeoJSON.FeatureCollection) => {
        const geoLayer = L.geoJSON(geojsonData, {
          style: (feature) => {
            const gadmName = feature?.properties?.NAME_1 as string | undefined;
            const gisId = gadmName ? GADM_TO_GIS_ID[gadmName] : undefined;
            const prov = gisId ? PNG_PROVINCES.find((p) => p.id === gisId) : undefined;
            const color = prov ? getProvinceColor(prov) : "#64748b";
            const isVisible = gisId ? visibleProvinceIds.has(gisId) : false;
            if (!isVisible) return { fillOpacity: 0, opacity: 0, weight: 0, interactive: false };
            return {
              fillColor: color,
              fillOpacity: 0.2,
              color: "#ffffff",
              weight: 1.2,
              opacity: 1,
            };
          },
          onEachFeature: (feature, layer) => {
            const gadmName = feature.properties?.NAME_1 as string | undefined;
            const gisId = gadmName ? GADM_TO_GIS_ID[gadmName] : undefined;
            const prov = gisId ? PNG_PROVINCES.find((p) => p.id === gisId) : undefined;
            if (!prov || !visibleProvinceIds.has(prov.id)) return;

            const polyLayer = layer as L.Path;

            layer.bindTooltip(
              `<div style="font-weight:bold;font-size:13px">${prov.name}</div>
               <div style="font-size:11px">Capital: ${prov.capital}</div>
               <div style="font-size:11px">Pop: ${formatNumber(prov.population_2021_est)}</div>`,
              { sticky: true, className: "leaflet-custom-tooltip", direction: "top" }
            );

            layer.on("mouseover", () => {
              const isSelected = selectedProvinceRef.current?.id === prov.id;
              if (!isSelected) {
                polyLayer.setStyle({
                  fillOpacity: 0.38,
                  weight: 2,
                  color: getProvinceColor(prov),
                });
                (layer as L.Path & { bringToFront: () => void }).bringToFront();
              }
            });

            layer.on("mouseout", () => {
              const isSelected = selectedProvinceRef.current?.id === prov.id;
              const isRegionDimmed =
                selectedRegionRef.current !== null &&
                prov.region !== selectedRegionRef.current;
              if (!isSelected) {
                polyLayer.setStyle({
                  fillOpacity: isRegionDimmed ? 0.05 : 0.2,
                  weight: isRegionDimmed ? 0.5 : 1.2,
                  color: isRegionDimmed ? "#94a3b8" : "#ffffff",
                });
              }
            });

            layer.on("click", () => {
              selectedProvinceRef.current = prov;
              setSelectedProvince(prov);
              map.setView([prov.lat, prov.lng], 8, { animate: true, duration: 0.7 });
              updateDistrictMarkers(prov, districtGroup);
              if (!showDistricts) districtGroup.addTo(map);
              setShowDistricts(true);
              // Refresh styles for all polygons
              geoLayer.eachLayer((l) => {
                const fl = l as L.Path & { feature?: GeoJSON.Feature };
                const gn = fl.feature?.properties?.NAME_1 as string | undefined;
                const gi = gn ? GADM_TO_GIS_ID[gn] : undefined;
                const fp = gi ? PNG_PROVINCES.find((p) => p.id === gi) : undefined;
                if (!fp) return;
                const isSel = fp.id === prov.id;
                const isDim =
                  selectedRegionRef.current !== null &&
                  fp.region !== selectedRegionRef.current &&
                  !isSel;
                const c = getProvinceColor(fp);
                fl.setStyle({
                  fillColor: c,
                  fillOpacity: isSel ? 0.45 : isDim ? 0.05 : 0.2,
                  color: isSel ? c : isDim ? "#94a3b8" : "#ffffff",
                  weight: isSel ? 2.5 : isDim ? 0.5 : 1.2,
                  opacity: isDim ? 0.3 : 1,
                });
                if (isSel) (l as L.Path & { bringToFront: () => void }).bringToFront();
              });
            });
          },
        });

        geoLayer.addTo(map);
        geoLayerRef.current = geoLayer;
        setGeoReady(true);
      })
      .catch((err) => console.warn("GeoJSON load failed", err));

    // Population circle markers (rendered above polygons)
    const bounds = getPNGBounds();
    PNG_PROVINCES.forEach((prov) => {
      if (!visibleProvinceIds.has(prov.id)) return;
      const color = getProvinceColor(prov);

      const circle = L.circleMarker([prov.lat, prov.lng], {
        radius: Math.max(8, Math.min(20, prov.population_2021_est / 40000)),
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.88,
        zIndexOffset: 500,
      });

      circle.bindTooltip(
        `<div style="font-weight:bold;font-size:13px">${prov.name}</div>
         <div style="font-size:11px">Capital: ${prov.capital}</div>
         <div style="font-size:11px">Pop: ${formatNumber(prov.population_2021_est)}</div>`,
        { permanent: false, direction: "top", className: "leaflet-custom-tooltip" }
      );

      circle.on("click", () => {
        selectedProvinceRef.current = prov;
        setSelectedProvince(prov);
        map.setView([prov.lat, prov.lng], 8, { animate: true, duration: 0.8 });
        updateDistrictMarkers(prov, districtGroup);
      });

      circle.on("mouseover", function (this: L.CircleMarker) {
        if (selectedRegionRef.current && selectedRegionRef.current !== prov.region) return;
        this.setStyle({ weight: 3.5, fillOpacity: 1 });
      });
      circle.on("mouseout", function (this: L.CircleMarker) {
        if (selectedRegionRef.current && selectedRegionRef.current !== prov.region) return;
        this.setStyle({ weight: 2, fillOpacity: 0.88 });
      });

      circle.addTo(map);
      circlesRef.current.set(prov.id, circle);
    });

    if (userProvince) {
      map.setView([userProvince.lat, userProvince.lng], 8, { animate: false });
      selectedProvinceRef.current = userProvince;
      setSelectedProvince(userProvince);
      updateDistrictMarkers(userProvince, districtGroup);
    } else {
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      geoLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync selected province when userProvince resolves after async auth
  useEffect(() => {
    if (!userProvince || !mapRef.current) return;
    if (selectedProvinceRef.current?.id === userProvince.id) return;
    selectedProvinceRef.current = userProvince;
    setSelectedProvince(userProvince);
    mapRef.current.setView([userProvince.lat, userProvince.lng], 8, { animate: true });
    if (districtMarkersRef.current) {
      updateDistrictMarkers(userProvince, districtMarkersRef.current);
    }
    refreshGeoStyles();
  }, [userProvince, refreshGeoStyles]);

  // Refresh polygon styles when GeoJSON loads (might happen after selection is set)
  useEffect(() => {
    if (geoReady) refreshGeoStyles();
  }, [geoReady, refreshGeoStyles]);

  // Region filter effect
  useEffect(() => {
    selectedRegionRef.current = selectedRegion;

    circlesRef.current.forEach((circle, provId) => {
      const prov = PNG_PROVINCES.find((p) => p.id === provId);
      if (!prov) return;
      const dimmed = selectedRegion !== null && prov.region !== selectedRegion;
      circle.setStyle({
        fillOpacity: dimmed ? 0 : 0.88,
        weight: dimmed ? 0 : 2,
        opacity: dimmed ? 0 : 1,
      });
    });

    refreshGeoStyles();
  }, [selectedRegion, refreshGeoStyles]);

  const toggleRegionFilter = (region: string) => {
    setSelectedRegion((prev) => (prev === region ? null : region));
  };

  const switchBasemap = (style: "osm" | "satellite" | "topo") => {
    const map = mapRef.current;
    if (!map || !baseLayers.current[style]) return;
    if (currentLayer.current) map.removeLayer(currentLayer.current);
    baseLayers.current[style].addTo(map);
    currentLayer.current = baseLayers.current[style];
    setMapStyle(style);
  };

  const toggleDistricts = () => {
    const group = districtMarkersRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    if (showDistricts) {
      map.removeLayer(group);
    } else {
      group.addTo(map);
    }
    setShowDistricts(!showDistricts);
  };

  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    if (userProvince) {
      map.setView([userProvince.lat, userProvince.lng], 8, { animate: true });
    } else {
      map.fitBounds(getPNGBounds(), { padding: [20, 20], animate: true });
    }
  };

  const handleProvinceClick = (prov: ProvinceProfile) => {
    selectedProvinceRef.current = prov;
    setSelectedProvince(prov);
    const map = mapRef.current;
    if (map) {
      map.setView([prov.lat, prov.lng], 8, { animate: true, duration: 0.8 });
      if (districtMarkersRef.current) {
        updateDistrictMarkers(prov, districtMarkersRef.current);
        if (!showDistricts) districtMarkersRef.current.addTo(map);
        setShowDistricts(true);
      }
    }
    refreshGeoStyles();
  };

  const prov = selectedProvince;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -mt-0">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold leading-tight">GIS Province Map</h2>
            <p className="text-xs text-muted-foreground">Papua New Guinea — Interactive Geographic Information System</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden text-xs">
            {(["osm", "satellite", "topo"] as const).map((s) => (
              <button
                key={s}
                onClick={() => switchBasemap(s)}
                className={`px-2.5 py-1.5 capitalize transition-colors ${mapStyle === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {s === "osm" ? "Street" : s === "satellite" ? "Satellite" : "Topo"}
              </button>
            ))}
          </div>
          <Button
            variant={showDistricts ? "default" : "outline"}
            size="sm"
            onClick={toggleDistricts}
            className="text-xs"
          >
            <Layers className="w-3.5 h-3.5 mr-1" />
            Districts
          </Button>
          <Button variant="outline" size="sm" onClick={resetView} className="text-xs">
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Region legend */}
          <div className="absolute bottom-10 left-3 z-[1000] bg-background/90 backdrop-blur rounded-lg p-2 border text-xs shadow">
            <div className="flex items-center justify-between mb-1.5 gap-3">
              <p className="font-semibold text-xs">Regions</p>
              {selectedRegion && (
                <button
                  onClick={() => setSelectedRegion(null)}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {Object.entries(regionColors).map(([r, c]) => {
                const count = PNG_PROVINCES.filter((p) => p.region === r).length;
                const active = selectedRegion === r;
                const dimmed = selectedRegion !== null && !active;
                return (
                  <button
                    key={r}
                    onClick={() => toggleRegionFilter(r)}
                    className={`flex items-center gap-1.5 w-full px-1.5 py-1 rounded transition-all text-left ${
                      active
                        ? "bg-foreground/10 font-semibold"
                        : dimmed
                        ? "opacity-40"
                        : "hover:bg-foreground/5"
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-sm shrink-0 transition-all"
                      style={{
                        background: c,
                        outline: active ? `2px solid ${c}` : "none",
                        outlineOffset: "1px",
                        border: "1.5px solid rgba(255,255,255,0.5)",
                      }}
                    />
                    <span className="flex-1">{r}</span>
                    <span className={`text-[10px] ${active ? "text-foreground" : "text-muted-foreground"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t px-1.5">
              <div className="w-3 h-3 rounded-full border border-black shrink-0" style={{ background: "#FCD116" }} />
              <span className="text-muted-foreground">District capitals</span>
            </div>
          </div>

          {/* National stats overlay */}
          {user?.scope_level === "national" && (
            <div className="absolute top-3 left-3 z-[1000] bg-background/90 backdrop-blur rounded-lg px-3 py-2 border shadow text-xs text-muted-foreground">
              {selectedRegion ? (
                <>
                  <span className="font-semibold" style={{ color: regionColors[selectedRegion] }}>{selectedRegion} Region</span>
                  {" · "}
                  {PNG_PROVINCES.filter((p) => p.region === selectedRegion).length} provinces
                  {" · "}
                  {PNG_PROVINCES.filter((p) => p.region === selectedRegion).reduce((a, p) => a + p.num_districts, 0)} districts
                </>
              ) : (
                <>{PNG_PROVINCES.length} provinces · {PNG_PROVINCES.reduce((a, p) => a + p.num_districts, 0)} districts</>
              )}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-[360px] border-l flex flex-col overflow-hidden bg-background shrink-0">
          {user?.scope_level === "national" && (
            <div className="border-b px-3 py-2 bg-muted/30">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {selectedRegion ? `${selectedRegion} Region` : "All Provinces"}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {selectedRegion
                    ? PNG_PROVINCES.filter((p) => p.region === selectedRegion).length
                    : PNG_PROVINCES.length}{" "}
                  provinces
                </span>
              </div>
              <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
                {PNG_PROVINCES.filter((p) => !selectedRegion || p.region === selectedRegion).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProvinceClick(p)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center gap-2 ${
                      selectedProvince?.id === p.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: regionColors[p.region] ?? p.color }}
                    />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {prov ? (
              <div className="p-4 space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-base leading-tight">{prov.name}</h3>
                    <Badge
                      variant="outline"
                      className="text-xs shrink-0 mt-0.5"
                      style={{ borderColor: regionColors[prov.region], color: regionColors[prov.region] }}
                    >
                      {prov.region}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Capital: <span className="font-medium text-foreground">{prov.capital}</span></p>
                  <p className="text-xs text-muted-foreground">Province Code: <span className="font-mono font-medium text-foreground">{prov.code}</span> · Est. {prov.established}</p>
                </div>

                <Tabs defaultValue="profile">
                  <TabsList className="w-full text-xs h-8">
                    <TabsTrigger value="profile" className="flex-1 text-xs"><Info className="w-3 h-3 mr-1" />Profile</TabsTrigger>
                    <TabsTrigger value="districts" className="flex-1 text-xs"><Building2 className="w-3 h-3 mr-1" />Districts</TabsTrigger>
                    <TabsTrigger value="economy" className="flex-1 text-xs"><MapIcon className="w-3 h-3 mr-1" />Economy</TabsTrigger>
                  </TabsList>

                  <TabsContent value="profile" className="space-y-3 mt-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{prov.description}</p>

                    <div className="grid grid-cols-2 gap-2">
                      <StatBox label="Population (2021 est.)" value={formatNumber(prov.population_2021_est)} />
                      <StatBox label="Population (2011)" value={formatNumber(prov.population_2011)} />
                      <StatBox label="Area" value={`${prov.area_km2.toLocaleString()} km²`} />
                      <StatBox label="Pop. Density" value={`${prov.density_per_km2}/km²`} />
                      <StatBox label="Districts" value={prov.num_districts.toString()} />
                      <StatBox label="Region" value={prov.region} />
                    </div>

                    <div>
                      <p className="text-xs font-semibold mb-1.5">Languages</p>
                      <div className="flex flex-wrap gap-1">
                        {prov.languages.map((l) => (
                          <Badge key={l} variant="secondary" className="text-xs">{l}</Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold mb-1.5">Notable Facts</p>
                      <ul className="space-y-1">
                        {prov.notable_facts.map((f, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                            <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </TabsContent>

                  <TabsContent value="districts" className="mt-3">
                    <div className="space-y-1.5">
                      {prov.districts.map((d) => (
                        <div
                          key={d.name}
                          className="border rounded-lg px-3 py-2 text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            mapRef.current?.setView([d.lat, d.lng], 10, { animate: true });
                          }}
                        >
                          <p className="font-semibold">{d.name}</p>
                          <p className="text-muted-foreground">Capital: {d.capital}</p>
                          <p className="text-muted-foreground font-mono">
                            {d.lat.toFixed(3)}°S, {d.lng.toFixed(3)}°E
                          </p>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="economy" className="mt-3 space-y-3">
                    <div>
                      <p className="text-xs font-semibold mb-1.5">Main Industries</p>
                      <div className="flex flex-wrap gap-1">
                        {prov.main_industries.map((ind) => (
                          <Badge key={ind} variant="outline" className="text-xs">{ind}</Badge>
                        ))}
                      </div>
                    </div>

                    <div className="border rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold">Population Growth</p>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">2011 Census</p>
                          <div className="mt-1 h-4 bg-blue-200 rounded relative">
                            <div className="h-full bg-blue-500 rounded" style={{ width: "70%" }} />
                          </div>
                          <p className="text-xs font-mono mt-0.5">{formatNumber(prov.population_2011)}</p>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">2021 Estimate</p>
                          <div className="mt-1 h-4 bg-green-200 rounded relative">
                            <div className="h-full bg-green-500 rounded" style={{ width: "90%" }} />
                          </div>
                          <p className="text-xs font-mono mt-0.5">{formatNumber(prov.population_2021_est)}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Growth: +{((prov.population_2021_est - prov.population_2011) / prov.population_2011 * 100).toFixed(1)}% over ~10 years
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <StatBox label="Area" value={`${prov.area_km2.toLocaleString()} km²`} />
                      <StatBox label="Density" value={`${prov.density_per_km2} /km²`} />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Globe className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Click a province on the map to view its demographic profile</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .leaflet-custom-tooltip {
          background: rgba(0,0,0,0.82);
          border: none;
          color: white;
          border-radius: 6px;
          padding: 5px 8px;
          font-size: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .leaflet-custom-tooltip::before {
          border-top-color: rgba(0,0,0,0.82);
        }
        .leaflet-container {
          font-family: inherit;
          cursor: default;
        }
        .leaflet-interactive {
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
