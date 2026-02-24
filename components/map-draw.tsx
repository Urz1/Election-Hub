"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Circle, Pentagon, RectangleHorizontal, Crosshair, Trash2,
  LocateFixed, Pencil, X, Check, Search, MapPin,
} from "lucide-react";

export interface DrawnRegion {
  name: string;
  geometry: string;
  bufferMeters: number;
}

interface MapDrawProps {
  regions: DrawnRegion[];
  onRegionsChange: (regions: DrawnRegion[]) => void;
}

type DrawMode = "none" | "circle" | "polygon" | "rectangle" | "exact-radius";

// ── Helpers ──

function formatArea(sqMeters: number): string {
  if (sqMeters >= 1_000_000) return `${(sqMeters / 1_000_000).toFixed(2)} km²`;
  return `${Math.round(sqMeters).toLocaleString()} m²`;
}

function formatDist(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function polygonArea(latlngs: L.LatLng[]): number {
  if (latlngs.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < latlngs.length; i++) {
    const j = (i + 1) % latlngs.length;
    area += latlngs[i].lng * latlngs[j].lat;
    area -= latlngs[j].lng * latlngs[i].lat;
  }
  const avgLat = latlngs.reduce((s, p) => s + p.lat, 0) / latlngs.length;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((avgLat * Math.PI) / 180);
  return Math.abs(area / 2) * mPerDegLat * mPerDegLng;
}

function polygonPerimeter(latlngs: L.LatLng[]): number {
  let p = 0;
  for (let i = 0; i < latlngs.length; i++) {
    p += latlngs[i].distanceTo(latlngs[(i + 1) % latlngs.length]);
  }
  return p;
}

const REGION_STYLE: L.PathOptions = { color: "#3b82f6", fillOpacity: 0.18, weight: 2 };
const DRAWING_STYLE: L.PathOptions = { color: "#ef4444", fillOpacity: 0.15, weight: 2, dashArray: "6 4" };
const EDIT_STYLE: L.PathOptions = { color: "#f97316", fillOpacity: 0.2, weight: 2 };

const USER_ICON = L.divIcon({
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 8px rgba(59,130,246,0.6);"></div>',
  iconSize: [14, 14],
  className: "",
});

const VERTEX_ICON = L.divIcon({
  html: '<div style="width:10px;height:10px;border-radius:50%;background:#f97316;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:grab;"></div>',
  iconSize: [10, 10],
  className: "",
});

// ── Tile Layers ──

function createTileLayers() {
  const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  });
  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "&copy; Esri", maxZoom: 19 }
  );
  const terrain = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  });
  return { "Street": street, "Satellite": satellite, "Terrain": terrain };
}

// ── Measurement tooltip ──

function createMeasurementTooltip(map: L.Map) {
  const el = document.createElement("div");
  el.className = "leaflet-measurement-tooltip";
  el.style.cssText =
    "position:absolute;z-index:1000;pointer-events:none;background:rgba(0,0,0,0.75);color:#fff;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:500;white-space:nowrap;transform:translate(12px,-50%);display:none;";
  map.getContainer().appendChild(el);

  return {
    show(text: string, point: L.Point) {
      el.textContent = text;
      el.style.left = `${point.x}px`;
      el.style.top = `${point.y}px`;
      el.style.display = "block";
    },
    hide() {
      el.style.display = "none";
    },
    remove() {
      el.remove();
    },
  };
}

// ── Component ──

export default function MapDraw({ regions, onRegionsChange }: MapDrawProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tooltipRef = useRef<ReturnType<typeof createMeasurementTooltip> | null>(null);

  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [regionName, setRegionName] = useState("");
  const [buffer, setBuffer] = useState(20);
  const [exactRadius, setExactRadius] = useState(50);
  const [locating, setLocating] = useState(true);
  const [measurement, setMeasurement] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ label: string; x: number; y: number }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  const userMarkerRef = useRef<L.Marker | null>(null);
  const drawPointsRef = useRef<L.LatLng[]>([]);
  const editLayersRef = useRef<L.Layer[]>([]);
  const editOriginalRef = useRef<DrawnRegion | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync regions to map layers ──
  const syncRegionsToMap = useCallback((regionsToSync: DrawnRegion[], skipIndex?: number) => {
    const lg = layerGroupRef.current;
    if (!lg) return;
    lg.clearLayers();
    regionsToSync.forEach((r, i) => {
      if (i === skipIndex) return;
      const geo = JSON.parse(r.geometry);
      if (geo.type === "circle") {
        L.circle([geo.center[1], geo.center[0]], { ...REGION_STYLE, radius: geo.radius })
          .bindPopup(`<strong>${r.name}</strong><br/>Radius: ${formatDist(geo.radius)}<br/>Buffer: +${r.bufferMeters}m`)
          .addTo(lg);
      } else if (geo.type === "polygon" || geo.type === "rectangle") {
        const latlngs = geo.coordinates[0].map((c: number[]) => [c[1], c[0]] as L.LatLngTuple);
        L.polygon(latlngs, REGION_STYLE)
          .bindPopup(`<strong>${r.name}</strong><br/>Type: ${geo.type}<br/>Buffer: +${r.bufferMeters}m`)
          .addTo(lg);
      }
    });
  }, []);

  // ── Init map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const tiles = createTileLayers();
    const map = L.map(containerRef.current, {
      layers: [tiles["Street"]],
      zoomControl: false,
    }).setView([33.6844, 73.0479], 13);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.layers(tiles, undefined, { position: "topright" }).addTo(map);

    const lg = L.layerGroup().addTo(map);
    layerGroupRef.current = lg;
    mapRef.current = map;

    tooltipRef.current = createMeasurementTooltip(map);

    syncRegionsToMap(regions);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mapRef.current) return;
          const { latitude, longitude } = pos.coords;
          try { mapRef.current.setView([latitude, longitude], 16); } catch { /* */ }
          userMarkerRef.current = L.marker([latitude, longitude], { icon: USER_ICON })
            .bindPopup("You are here")
            .addTo(mapRef.current);
          setLocating(false);
        },
        () => setLocating(false),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setLocating(false);
    }

    return () => {
      tooltipRef.current?.remove();
      tooltipRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drawing logic ──
  useEffect(() => {
    const map = mapRef.current;
    const tip = tooltipRef.current;
    if (!map) return;

    if (drawMode === "none") {
      map.off("click");
      map.off("mousemove");
      map.off("dblclick");
      map.dragging.enable();
      map.doubleClickZoom.enable();
      tip?.hide();
      setMeasurement("");
      return;
    }

    map.doubleClickZoom.disable();

    const finishRegion = (geo: string, name: string) => {
      const regionName2 = name || `Region ${regions.length + 1}`;
      onRegionsChange([...regions, { name: regionName2, geometry: geo, bufferMeters: buffer }]);
      map.off("click");
      map.off("mousemove");
      map.off("dblclick");
      map.dragging.enable();
      map.doubleClickZoom.enable();
      setDrawMode("none");
      setRegionName("");
      setMeasurement("");
      tip?.hide();
    };

    // ── Circle (freehand) ──
    if (drawMode === "circle") {
      let center: L.LatLng | null = null;
      let tempCircle: L.Circle | null = null;

      const onClick = (e: L.LeafletMouseEvent) => {
        if (!center) {
          center = e.latlng;
          tempCircle = L.circle(center, { ...DRAWING_STYLE, radius: 1 }).addTo(map);
          map.dragging.disable();
        } else {
          const radius = center.distanceTo(e.latlng);
          if (tempCircle) map.removeLayer(tempCircle);
          const geo = JSON.stringify({ type: "circle", center: [center.lng, center.lat], radius: Math.round(radius) });
          syncRegionsToMap([...regions, { name: regionName || `Region ${regions.length + 1}`, geometry: geo, bufferMeters: buffer }]);
          finishRegion(geo, regionName);
        }
      };

      const onMove = (e: L.LeafletMouseEvent) => {
        if (center && tempCircle) {
          const r = center.distanceTo(e.latlng);
          tempCircle.setRadius(r);
          const area = Math.PI * r * r;
          const text = `Radius: ${formatDist(r)} · Area: ${formatArea(area)}`;
          setMeasurement(text);
          tip?.show(text, map.latLngToContainerPoint(e.latlng));
        }
      };

      map.on("click", onClick);
      map.on("mousemove", onMove);
      return () => { map.off("click", onClick); map.off("mousemove", onMove); if (tempCircle) map.removeLayer(tempCircle); };
    }

    // ── Exact radius ──
    if (drawMode === "exact-radius") {
      map.dragging.disable();
      const onClick = (e: L.LeafletMouseEvent) => {
        const r = exactRadius;
        const geo = JSON.stringify({ type: "circle", center: [e.latlng.lng, e.latlng.lat], radius: r });
        syncRegionsToMap([...regions, { name: regionName || `Region ${regions.length + 1}`, geometry: geo, bufferMeters: buffer }]);
        finishRegion(geo, regionName);
      };

      const onMove = (e: L.LeafletMouseEvent) => {
        const text = `Click to place circle (${formatDist(exactRadius)} radius)`;
        tip?.show(text, map.latLngToContainerPoint(e.latlng));
      };

      map.on("click", onClick);
      map.on("mousemove", onMove);
      return () => { map.off("click", onClick); map.off("mousemove", onMove); };
    }

    // ── Polygon ──
    if (drawMode === "polygon") {
      drawPointsRef.current = [];
      let tempLine: L.Polyline | null = null;
      let tempPoly: L.Polygon | null = null;

      const onClick = (e: L.LeafletMouseEvent) => {
        drawPointsRef.current.push(e.latlng);
        if (tempLine) map.removeLayer(tempLine);
        if (tempPoly) map.removeLayer(tempPoly);

        const pts = drawPointsRef.current;
        if (pts.length >= 3) {
          tempPoly = L.polygon(pts.map(p => [p.lat, p.lng] as L.LatLngTuple), DRAWING_STYLE).addTo(map);
          const area = polygonArea(pts);
          const perim = polygonPerimeter(pts);
          setMeasurement(`Area: ${formatArea(area)} · Perimeter: ${formatDist(perim)} · ${pts.length} points`);
        } else {
          tempLine = L.polyline(pts.map(p => [p.lat, p.lng] as L.LatLngTuple), DRAWING_STYLE).addTo(map);
        }
      };

      const onMove = (e: L.LeafletMouseEvent) => {
        const pts = drawPointsRef.current;
        if (pts.length > 0) {
          const text = pts.length < 3
            ? `${pts.length} point${pts.length > 1 ? "s" : ""} — need ${3 - pts.length} more`
            : `Area: ${formatArea(polygonArea([...pts, e.latlng]))} — double-click to finish`;
          tip?.show(text, map.latLngToContainerPoint(e.latlng));
        }
      };

      const onDblClick = () => {
        const pts = drawPointsRef.current;
        if (pts.length < 3) return;
        if (tempLine) map.removeLayer(tempLine);
        if (tempPoly) map.removeLayer(tempPoly);

        const coords = pts.map(p => [p.lng, p.lat]);
        coords.push(coords[0]);
        const geo = JSON.stringify({ type: "polygon", coordinates: [coords] });
        syncRegionsToMap([...regions, { name: regionName || `Region ${regions.length + 1}`, geometry: geo, bufferMeters: buffer }]);
        finishRegion(geo, regionName);
      };

      map.dragging.disable();
      map.on("click", onClick);
      map.on("mousemove", onMove);
      map.on("dblclick", onDblClick);
      return () => {
        map.off("click", onClick); map.off("mousemove", onMove); map.off("dblclick", onDblClick);
        if (tempLine) map.removeLayer(tempLine);
        if (tempPoly) map.removeLayer(tempPoly);
      };
    }

    // ── Rectangle ──
    if (drawMode === "rectangle") {
      let corner1: L.LatLng | null = null;
      let tempRect: L.Rectangle | null = null;

      const onClick = (e: L.LeafletMouseEvent) => {
        if (!corner1) {
          corner1 = e.latlng;
          map.dragging.disable();
        } else {
          if (tempRect) map.removeLayer(tempRect);
          const bounds = L.latLngBounds(corner1, e.latlng);
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          const coords = [
            [sw.lng, sw.lat], [ne.lng, sw.lat], [ne.lng, ne.lat], [sw.lng, ne.lat], [sw.lng, sw.lat],
          ];
          const geo = JSON.stringify({ type: "rectangle", coordinates: [coords] });
          syncRegionsToMap([...regions, { name: regionName || `Region ${regions.length + 1}`, geometry: geo, bufferMeters: buffer }]);
          finishRegion(geo, regionName);
        }
      };

      const onMove = (e: L.LeafletMouseEvent) => {
        if (corner1) {
          if (tempRect) map.removeLayer(tempRect);
          const bounds = L.latLngBounds(corner1, e.latlng);
          tempRect = L.rectangle(bounds, DRAWING_STYLE).addTo(map);

          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          const w = L.latLng(ne.lat, sw.lng).distanceTo(ne);
          const h = sw.distanceTo(L.latLng(ne.lat, sw.lng));
          const text = `${formatDist(w)} × ${formatDist(h)} (${formatArea(w * h)})`;
          setMeasurement(text);
          tip?.show(text, map.latLngToContainerPoint(e.latlng));
        }
      };

      map.on("click", onClick);
      map.on("mousemove", onMove);
      return () => { map.off("click", onClick); map.off("mousemove", onMove); if (tempRect) map.removeLayer(tempRect); };
    }
  }, [drawMode, regionName, buffer, exactRadius, regions, onRegionsChange, syncRegionsToMap]);

  // ── Search (Nominatim) ──
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 3) { setSearchResults([]); return; }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      setSearchResults(
        data.map((d: { display_name: string; lon: string; lat: string }) => ({
          label: d.display_name,
          x: parseFloat(d.lon),
          y: parseFloat(d.lat),
        }))
      );
    } catch { setSearchResults([]); }
  }, []);

  const handleSearchInput = useCallback((val: string) => {
    setSearchQuery(val);
    setSearchOpen(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => doSearch(val), 400);
  }, [doSearch]);

  const handleSearchSelect = useCallback((result: { label: string; x: number; y: number }) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([result.y, result.x], 17, { duration: 1.5 });
    setSearchQuery(result.label.split(",")[0]);
    setSearchOpen(false);
    setSearchResults([]);
  }, []);

  // ── Edit region ──
  const startEdit = useCallback((index: number) => {
    const map = mapRef.current;
    if (!map) return;

    setEditIndex(index);
    setDrawMode("none");
    editOriginalRef.current = { ...regions[index] };

    syncRegionsToMap(regions, index);

    const region = regions[index];
    const geo = JSON.parse(region.geometry);

    if (geo.type === "circle") {
      const center = L.latLng(geo.center[1], geo.center[0]);
      let radius = geo.radius;

      const circle = L.circle(center, { ...EDIT_STYLE, radius }).addTo(map);
      const centerMarker = L.marker(center, { icon: VERTEX_ICON, draggable: true }).addTo(map);

      const edgeLat = center.lat;
      const edgeLng = center.lng + (radius / (111320 * Math.cos((center.lat * Math.PI) / 180)));
      const edgeMarker = L.marker([edgeLat, edgeLng], { icon: VERTEX_ICON, draggable: true }).addTo(map);

      centerMarker.on("drag", () => {
        const pos = centerMarker.getLatLng();
        circle.setLatLng(pos);
        const eLng = pos.lng + (radius / (111320 * Math.cos((pos.lat * Math.PI) / 180)));
        edgeMarker.setLatLng([pos.lat, eLng]);
      });

      edgeMarker.on("drag", () => {
        radius = centerMarker.getLatLng().distanceTo(edgeMarker.getLatLng());
        circle.setRadius(radius);
      });

      editLayersRef.current = [circle, centerMarker, edgeMarker];
    } else {
      const coords: number[][] = geo.coordinates[0].slice(0, -1);
      const latlngs = coords.map((c) => L.latLng(c[1], c[0]));
      const polygon = L.polygon(latlngs.map(p => [p.lat, p.lng] as L.LatLngTuple), EDIT_STYLE).addTo(map);

      const markers = latlngs.map((ll, i) => {
        const m = L.marker(ll, { icon: VERTEX_ICON, draggable: true }).addTo(map);
        m.on("drag", () => {
          const newLL = markers.map(mk => mk.getLatLng());
          polygon.setLatLngs(newLL.map(p => [p.lat, p.lng] as L.LatLngTuple));
        });
        return m;
      });

      editLayersRef.current = [polygon, ...markers];
    }

    map.fitBounds(L.featureGroup(editLayersRef.current.filter(l => l instanceof L.Path) as L.Path[]).getBounds().pad(0.3));
  }, [regions, syncRegionsToMap]);

  const saveEdit = useCallback(() => {
    if (editIndex === null) return;
    const layers = editLayersRef.current;
    const region = regions[editIndex];
    const geo = JSON.parse(region.geometry);

    let newGeo: string;
    if (geo.type === "circle") {
      const circle = layers[0] as L.Circle;
      const c = circle.getLatLng();
      newGeo = JSON.stringify({ type: "circle", center: [c.lng, c.lat], radius: Math.round(circle.getRadius()) });
    } else {
      const polygon = layers[0] as L.Polygon;
      const lls = (polygon.getLatLngs()[0] as L.LatLng[]);
      const coords = lls.map(p => [p.lng, p.lat]);
      coords.push(coords[0]);
      newGeo = JSON.stringify({ type: geo.type, coordinates: [coords] });
    }

    const updated = [...regions];
    updated[editIndex] = { ...region, geometry: newGeo };
    onRegionsChange(updated);

    layers.forEach(l => mapRef.current?.removeLayer(l));
    editLayersRef.current = [];
    editOriginalRef.current = null;
    setEditIndex(null);
    syncRegionsToMap(updated);
  }, [editIndex, regions, onRegionsChange, syncRegionsToMap]);

  const cancelEdit = useCallback(() => {
    editLayersRef.current.forEach(l => mapRef.current?.removeLayer(l));
    editLayersRef.current = [];
    editOriginalRef.current = null;
    setEditIndex(null);
    syncRegionsToMap(regions);
  }, [regions, syncRegionsToMap]);

  const removeRegion = useCallback((index: number) => {
    const updated = regions.filter((_, i) => i !== index);
    onRegionsChange(updated);
    syncRegionsToMap(updated);
  }, [regions, onRegionsChange, syncRegionsToMap]);

  function goToMyLocation() {
    if (!mapRef.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current?.flyTo([latitude, longitude], 17, { duration: 1 });
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([latitude, longitude]);
        } else if (mapRef.current) {
          userMarkerRef.current = L.marker([latitude, longitude], { icon: USER_ICON })
            .bindPopup("You are here")
            .addTo(mapRef.current);
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  const isDrawing = drawMode !== "none";
  const isEditing = editIndex !== null;

  const instructions: Record<DrawMode, string> = {
    none: "",
    circle: "Click to set center point, then click again to set the radius",
    "exact-radius": `Click anywhere to place a circle with ${exactRadius}m radius`,
    polygon: "Click to add vertices. Double-click to close the polygon (minimum 3 points)",
    rectangle: "Click to set first corner, then click opposite corner",
  };

  return (
    <div className="space-y-3">
      {/* ── Search bar ── */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for a location..."
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
              className="pl-9"
            />
          </div>
        </div>
        {searchOpen && searchResults.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-card border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {searchResults.map((r, i) => (
              <button
                key={i}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-start gap-2"
                onMouseDown={() => handleSearchSelect(r)}
              >
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="line-clamp-2">{r.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Toolbar row 1: Region name + buffer ── */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Region Name</label>
          <Input
            value={regionName}
            onChange={(e) => setRegionName(e.target.value)}
            placeholder={`Region ${regions.length + 1}`}
            className="w-44 h-9"
            disabled={isEditing}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Buffer (m)</label>
          <Input
            type="number"
            value={buffer}
            onChange={(e) => setBuffer(Number(e.target.value))}
            className="w-20 h-9"
            disabled={isEditing}
          />
        </div>
        {drawMode === "exact-radius" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Radius (m)</label>
            <Input
              type="number"
              value={exactRadius}
              onChange={(e) => setExactRadius(Math.max(1, Number(e.target.value)))}
              className="w-24 h-9"
              min={1}
            />
          </div>
        )}
      </div>

      {/* ── Toolbar row 2: Drawing tools ── */}
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={drawMode === "circle" ? "default" : "outline"}
          onClick={() => setDrawMode(drawMode === "circle" ? "none" : "circle")}
          disabled={isEditing}
        >
          <Circle className="h-4 w-4 mr-1.5" />
          Circle
        </Button>
        <Button
          type="button"
          size="sm"
          variant={drawMode === "exact-radius" ? "default" : "outline"}
          onClick={() => setDrawMode(drawMode === "exact-radius" ? "none" : "exact-radius")}
          disabled={isEditing}
        >
          <Crosshair className="h-4 w-4 mr-1.5" />
          Exact Radius
        </Button>
        <Button
          type="button"
          size="sm"
          variant={drawMode === "polygon" ? "default" : "outline"}
          onClick={() => setDrawMode(drawMode === "polygon" ? "none" : "polygon")}
          disabled={isEditing}
        >
          <Pentagon className="h-4 w-4 mr-1.5" />
          Polygon
        </Button>
        <Button
          type="button"
          size="sm"
          variant={drawMode === "rectangle" ? "default" : "outline"}
          onClick={() => setDrawMode(drawMode === "rectangle" ? "none" : "rectangle")}
          disabled={isEditing}
        >
          <RectangleHorizontal className="h-4 w-4 mr-1.5" />
          Rectangle
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => { onRegionsChange([]); syncRegionsToMap([]); setDrawMode("none"); }}
          disabled={isEditing || regions.length === 0}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Clear All
        </Button>
      </div>

      {/* ── Instruction banner ── */}
      {isDrawing && (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 shrink-0">
            {drawMode === "exact-radius" ? "Exact Radius" : drawMode.charAt(0).toUpperCase() + drawMode.slice(1)}
          </Badge>
          <span className="text-xs text-amber-800">{instructions[drawMode]}</span>
          {measurement && (
            <span className="ml-auto text-xs font-mono font-medium text-amber-900 shrink-0">{measurement}</span>
          )}
        </div>
      )}

      {isEditing && (
        <div className="flex items-center gap-2 rounded-md bg-orange-50 border border-orange-200 px-3 py-2">
          <Badge variant="secondary" className="bg-orange-100 text-orange-800">Editing</Badge>
          <span className="text-xs text-orange-800">Drag the orange handles to reshape. Save or cancel when done.</span>
          <div className="ml-auto flex gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
            <Button type="button" size="sm" onClick={saveEdit}>
              <Check className="h-3 w-3 mr-1" /> Save
            </Button>
          </div>
        </div>
      )}

      {locating && (
        <p className="text-xs text-blue-600 font-medium animate-pulse flex items-center gap-1.5">
          <LocateFixed className="h-3 w-3 animate-spin" />
          Detecting your location...
        </p>
      )}

      {/* ── Map container ── */}
      <div className="relative">
        <div ref={containerRef} className="h-[500px] rounded-lg border overflow-hidden" />
        <button
          type="button"
          onClick={goToMyLocation}
          className="absolute bottom-3 left-3 z-[1000] h-9 w-9 rounded-md bg-card border shadow-md flex items-center justify-center hover:bg-muted transition-colors"
          title="Go to my location"
        >
          <LocateFixed className="h-4 w-4 text-slate-700" />
        </button>
      </div>

      {/* ── Region list ── */}
      {regions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700">Regions ({regions.length})</h4>
          <div className="grid gap-2">
            {regions.map((r, i) => {
              const geo = JSON.parse(r.geometry);
              const isCircle = geo.type === "circle";
              const isRect = geo.type === "rectangle";
              let details = "";
              if (isCircle) {
                const area = Math.PI * geo.radius * geo.radius;
                details = `${formatDist(geo.radius)} radius · ${formatArea(area)}`;
              } else {
                const coords: number[][] = geo.coordinates[0].slice(0, -1);
                const latlngs = coords.map((c: number[]) => L.latLng(c[1], c[0]));
                const area = polygonArea(latlngs);
                details = isRect
                  ? `Rectangle · ${formatArea(area)}`
                  : `Polygon (${coords.length} pts) · ${formatArea(area)}`;
              }

              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    editIndex === i ? "border-orange-300 bg-orange-50 dark:bg-orange-950/30" : "bg-card hover:bg-muted"
                  }`}
                >
                  <div className="shrink-0">
                    {isCircle ? (
                      <Circle className="h-4 w-4 text-blue-500" />
                    ) : isRect ? (
                      <RectangleHorizontal className="h-4 w-4 text-blue-500" />
                    ) : (
                      <Pentagon className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{details} · +{r.bufferMeters}m buffer</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {editIndex !== i && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => startEdit(i)}
                          disabled={isEditing || isDrawing}
                          title="Edit region"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                          onClick={() => removeRegion(i)}
                          disabled={isEditing || isDrawing}
                          title="Remove region"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
