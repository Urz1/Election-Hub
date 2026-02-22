import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon, type Position } from "@turf/helpers";

export interface GeoRegion {
  type: "polygon" | "circle" | "rectangle";
  coordinates?: Position[][];
  center?: [number, number]; // [lng, lat]
  radius?: number; // meters
}

export function isPointInRegion(
  lat: number,
  lng: number,
  geometry: GeoRegion,
  bufferMeters: number = 0
): boolean {
  const pt = point([lng, lat]);

  if (geometry.type === "circle" && geometry.center && geometry.radius) {
    const distance = haversineDistance(
      lat,
      lng,
      geometry.center[1],
      geometry.center[0]
    );
    return distance <= geometry.radius + bufferMeters;
  }

  if ((geometry.type === "polygon" || geometry.type === "rectangle") && geometry.coordinates) {
    const poly = polygon(geometry.coordinates);
    if (booleanPointInPolygon(pt, poly)) return true;

    if (bufferMeters > 0) {
      const coords = geometry.coordinates[0];
      for (let i = 0; i < coords.length - 1; i++) {
        const dist = distanceToSegment(
          lat,
          lng,
          coords[i][1],
          coords[i][0],
          coords[i + 1][1],
          coords[i + 1][0]
        );
        if (dist <= bufferMeters) return true;
      }
    }

    return false;
  }

  return false;
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function distanceToSegment(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const pa = haversineDistance(pLat, pLng, aLat, aLng);
  const pb = haversineDistance(pLat, pLng, bLat, bLng);
  const ab = haversineDistance(aLat, aLng, bLat, bLng);

  if (ab === 0) return pa;

  const t = Math.max(0, Math.min(1, ((pa ** 2 - pb ** 2 + ab ** 2) / (2 * ab ** 2))));
  const projLat = aLat + t * (bLat - aLat);
  const projLng = aLng + t * (bLng - aLng);

  return haversineDistance(pLat, pLng, projLat, projLng);
}
