import { haversineKm, findCity, type City } from '../engine/cities';
import { round } from '../engine/util';

/**
 * ROUTING CLIENT (Route Intelligence).
 * Primary: OSRM public demo server (open data, © OpenStreetMap contributors;
 * routing service is OSRM — OSM provides the map data, not the routing).
 * Fallback: great-circle distance + mode-typical speed assumption, clearly
 * labelled in the response so the UI never presents assumptions as router data.
 * No API key required; short timeout so the demo never hangs.
 */

export interface RouteMetrics {
  distanceKm: number | null;
  durationHours: number | null;
  geometry: [number, number][]; // [lat, lon] polyline for Leaflet
  source: 'osrm' | 'fallback';
  note: string;
}

const OSRM_BASE = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const TIMEOUT_MS = 2500;

export async function fetchRoute(from: City, to: City, mode: 'road' | 'rail' | 'air' | 'sea'): Promise<RouteMetrics> {
  if (from.id === to.id) {
    return { distanceKm: 0, durationHours: 0, geometry: [[from.lat, from.lon]], source: 'fallback', note: 'Origin and destination are the same city.' };
  }

  // Only road routing is served by OSRM profiles used here; other modes get
  // mode-typical assumptions from great-circle distance (clearly labelled).
  if (mode === 'road') {
    try {
      const url = `${OSRM_BASE}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=simplified&geometries=geojson`;
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) {
        const data = (await res.json()) as { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
        const r = data.routes?.[0];
        if (data.code === 'Ok' && r) {
          return {
            distanceKm: Math.round(r.distance / 1000),
            durationHours: round(r.duration / 3600, 1),
            geometry: r.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
            source: 'osrm',
            note: 'Road route via OSRM (open data © OpenStreetMap contributors). Durations are traffic-free estimates.',
          };
        }
      }
    } catch {
      // fall through to fallback — honest degradation, no fabricated router data
    }
  }

  const SPEED_KMH = { road: 40, rail: 50, air: 600, sea: 30 } as const;
  const km = haversineKm(from, to);
  const factor = mode === 'road' ? 1.25 : 1.1; // road distance > great-circle; rail/sea similar
  const distanceKm = Math.round(km * factor);
  return {
    distanceKm,
    durationHours: round(distanceKm / SPEED_KMH[mode], 1),
    geometry: [
      [from.lat, from.lon],
      [to.lat, to.lon],
    ],
    source: 'fallback',
    note: `OSRM unreachable or mode not routable — showing great-circle distance ×${factor} with an assumed ${SPEED_KMH[mode]} km/h average for ${mode}. Labelled as assumption, not router output.`,
  };
}

export { findCity };
