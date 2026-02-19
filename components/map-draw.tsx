"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface DrawnRegion {
  name: string;
  geometry: string;
  bufferMeters: number;
}

interface MapDrawProps {
  regions: DrawnRegion[];
  onRegionsChange: (regions: DrawnRegion[]) => void;
}

export default function MapDraw({ regions, onRegionsChange }: MapDrawProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [drawMode, setDrawMode] = useState<"none" | "circle" | "polygon">("none");
  const drawPointsRef = useRef<L.LatLng[]>([]);
  const tempLayerRef = useRef<L.Layer | null>(null);
  const [regionName, setRegionName] = useState("");
  const [buffer, setBuffer] = useState(20);
  const [locating, setLocating] = useState(true);
  const userMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([33.6844, 73.0479], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const lg = L.layerGroup().addTo(map);
    layerGroupRef.current = lg;
    mapRef.current = map;

    regions.forEach((r) => {
      const geo = JSON.parse(r.geometry);
      if (geo.type === "circle") {
        L.circle([geo.center[1], geo.center[0]], { radius: geo.radius, color: "#3b82f6", fillOpacity: 0.2 })
          .bindPopup(r.name)
          .addTo(lg);
      } else if (geo.type === "polygon") {
        const latlngs = geo.coordinates[0].map((c: number[]) => [c[1], c[0]] as L.LatLngTuple);
        L.polygon(latlngs, { color: "#3b82f6", fillOpacity: 0.2 })
          .bindPopup(r.name)
          .addTo(lg);
      }
    });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mapRef.current) return;
          const { latitude, longitude } = pos.coords;
          try {
            mapRef.current.setView([latitude, longitude], 16);
          } catch { /* map may have been removed */ }

          const icon = L.divIcon({
            html: '<div style="width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2px solid white;box-shadow:0 0 6px rgba(59,130,246,0.5);"></div>',
            iconSize: [12, 12],
            className: "",
          });
          userMarkerRef.current = L.marker([latitude, longitude], { icon })
            .bindPopup("You are here")
            .addTo(mapRef.current);

          setLocating(false);
        },
        () => {
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setLocating(false);
    }

    return () => {
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (drawMode === "none") {
      map.off("click");
      map.dragging.enable();
      return;
    }

    if (drawMode === "circle") {
      let startPoint: L.LatLng | null = null;
      let tempCircle: L.Circle | null = null;

      const onClick = (e: L.LeafletMouseEvent) => {
        if (!startPoint) {
          startPoint = e.latlng;
          tempCircle = L.circle(startPoint, { radius: 10, color: "#ef4444", fillOpacity: 0.2 }).addTo(map);
        } else {
          const radius = startPoint.distanceTo(e.latlng);
          if (tempCircle) map.removeLayer(tempCircle);

          const geo = JSON.stringify({
            type: "circle",
            center: [startPoint.lng, startPoint.lat],
            radius: Math.round(radius),
          });

          const name = regionName || `Region ${regions.length + 1}`;
          const newRegion = { name, geometry: geo, bufferMeters: buffer };
          onRegionsChange([...regions, newRegion]);

          L.circle(startPoint, { radius, color: "#3b82f6", fillOpacity: 0.2 })
            .bindPopup(name)
            .addTo(layerGroupRef.current!);

          map.off("click");
          map.off("mousemove");
          map.dragging.enable();
          setDrawMode("none");
          setRegionName("");
        }
      };

      const onMove = (e: L.LeafletMouseEvent) => {
        if (startPoint && tempCircle) {
          tempCircle.setRadius(startPoint.distanceTo(e.latlng));
        }
      };

      map.dragging.disable();
      map.on("click", onClick);
      map.on("mousemove", onMove);

      return () => {
        map.off("click", onClick);
        map.off("mousemove", onMove);
        if (tempCircle) map.removeLayer(tempCircle);
      };
    }

    if (drawMode === "polygon") {
      drawPointsRef.current = [];
      let tempPolyline: L.Polyline | null = null;

      const onClick = (e: L.LeafletMouseEvent) => {
        drawPointsRef.current.push(e.latlng);
        if (tempPolyline) map.removeLayer(tempPolyline);
        tempPolyline = L.polyline(
          drawPointsRef.current.map((p) => [p.lat, p.lng] as L.LatLngTuple),
          { color: "#ef4444" }
        ).addTo(map);
      };

      const onDblClick = () => {
        if (drawPointsRef.current.length < 3) return;

        if (tempPolyline) map.removeLayer(tempPolyline);

        const coords = drawPointsRef.current.map((p) => [p.lng, p.lat]);
        coords.push(coords[0]);

        const geo = JSON.stringify({
          type: "polygon",
          coordinates: [coords],
        });

        const name = regionName || `Region ${regions.length + 1}`;
        const newRegion = { name, geometry: geo, bufferMeters: buffer };
        onRegionsChange([...regions, newRegion]);

        const latlngs = drawPointsRef.current.map((p) => [p.lat, p.lng] as L.LatLngTuple);
        L.polygon(latlngs, { color: "#3b82f6", fillOpacity: 0.2 })
          .bindPopup(name)
          .addTo(layerGroupRef.current!);

        drawPointsRef.current = [];
        map.off("click");
        map.off("dblclick");
        map.dragging.enable();
        setDrawMode("none");
        setRegionName("");
      };

      map.dragging.disable();
      map.on("click", onClick);
      map.on("dblclick", onDblClick);

      return () => {
        map.off("click", onClick);
        map.off("dblclick", onDblClick);
        if (tempPolyline) map.removeLayer(tempPolyline);
      };
    }
  }, [drawMode, regionName, buffer, regions, onRegionsChange]);

  function clearAll() {
    layerGroupRef.current?.clearLayers();
    if (tempLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(tempLayerRef.current);
    }
    onRegionsChange([]);
    setDrawMode("none");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Region Name</label>
          <input
            type="text"
            value={regionName}
            onChange={(e) => setRegionName(e.target.value)}
            placeholder={`Region ${regions.length + 1}`}
            className="h-9 px-3 rounded-md border text-sm w-44"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Buffer (m)</label>
          <input
            type="number"
            value={buffer}
            onChange={(e) => setBuffer(Number(e.target.value))}
            className="h-9 px-3 rounded-md border text-sm w-20"
          />
        </div>
        <button
          type="button"
          onClick={() => setDrawMode("circle")}
          className={`h-9 px-3 rounded-md text-sm font-medium border ${
            drawMode === "circle" ? "bg-primary text-primary-foreground" : "bg-white hover:bg-slate-50"
          }`}
        >
          Draw Circle
        </button>
        <button
          type="button"
          onClick={() => setDrawMode("polygon")}
          className={`h-9 px-3 rounded-md text-sm font-medium border ${
            drawMode === "polygon" ? "bg-primary text-primary-foreground" : "bg-white hover:bg-slate-50"
          }`}
        >
          Draw Polygon
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="h-9 px-3 rounded-md text-sm font-medium border bg-white hover:bg-red-50 text-red-600"
        >
          Clear All
        </button>
      </div>
      {drawMode !== "none" && (
        <p className="text-xs text-amber-600 font-medium">
          {drawMode === "circle"
            ? "Click center point, then click again to set radius"
            : "Click to add points, double-click to finish polygon"}
        </p>
      )}
      {locating && (
        <p className="text-xs text-blue-600 font-medium animate-pulse">
          Detecting your location...
        </p>
      )}
      <div className="relative">
        <div ref={containerRef} className="h-[400px] rounded-lg border overflow-hidden" />
        <button
          type="button"
          onClick={() => {
            if (!mapRef.current || !navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const { latitude, longitude } = pos.coords;
                mapRef.current?.setView([latitude, longitude], 16);
                if (userMarkerRef.current) {
                  userMarkerRef.current.setLatLng([latitude, longitude]);
                } else {
                  const icon = L.divIcon({
                    html: '<div style="width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2px solid white;box-shadow:0 0 6px rgba(59,130,246,0.5);"></div>',
                    iconSize: [12, 12],
                    className: "",
                  });
                  userMarkerRef.current = L.marker([latitude, longitude], { icon })
                    .bindPopup("You are here")
                    .addTo(mapRef.current!);
                }
              },
              () => {},
              { enableHighAccuracy: true, timeout: 8000 }
            );
          }}
          className="absolute bottom-3 right-3 z-[1000] h-9 w-9 rounded-md bg-white border shadow-md flex items-center justify-center hover:bg-slate-50"
          title="Go to my location"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/></svg>
        </button>
      </div>
      {regions.length > 0 && (
        <div className="space-y-1">
          {regions.map((r, i) => {
            const geo = JSON.parse(r.geometry);
            return (
              <div key={i} className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-2 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground">
                  {geo.type === "circle" ? `Circle (${geo.radius}m radius)` : `Polygon (${geo.coordinates[0].length - 1} points)`}
                  {" · "}+{r.bufferMeters}m buffer
                </span>
                <button
                  type="button"
                  onClick={() => {
                    layerGroupRef.current?.clearLayers();
                    const updated = regions.filter((_, idx) => idx !== i);
                    onRegionsChange(updated);
                    updated.forEach((reg) => {
                      const g = JSON.parse(reg.geometry);
                      if (g.type === "circle") {
                        L.circle([g.center[1], g.center[0]], { radius: g.radius, color: "#3b82f6", fillOpacity: 0.2 })
                          .bindPopup(reg.name)
                          .addTo(layerGroupRef.current!);
                      } else {
                        const ll = g.coordinates[0].map((c: number[]) => [c[1], c[0]] as L.LatLngTuple);
                        L.polygon(ll, { color: "#3b82f6", fillOpacity: 0.2 })
                          .bindPopup(reg.name)
                          .addTo(layerGroupRef.current!);
                      }
                    });
                  }}
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
