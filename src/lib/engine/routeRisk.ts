import type { FoodCommodity } from '../domain/types';
import { clamp, round } from './util';

/**
 * ROUTE INTELLIGENCE ENGINE.
 * Turns a route (origin → destination, mode, duration, handling points) into
 * transport-exposure metrics that feed the packaging recommendation. Road
 * distance/duration come from an OSRM-class router when reachable; everything
 * here is a prototype exposure model, not measured road telemetry.
 */

export interface RouteInput {
  origin: string;
  destination: string;
  /** road distance in km — resolved upstream (OSRM router or labelled fallback) */
  distanceKm: number;
  /** transit duration in hours — resolved upstream (router estimate or speed assumption) */
  durationHours: number;
  /** provenance of the metrics above, echoed in explanations */
  distanceSource?: 'router' | 'fallback';
  mode: 'road' | 'rail' | 'air' | 'sea';
  /** average in-transit temperature assumption (°C) — DEMO ASSUMPTION, not forecast data */
  assumedTempC: number;
  /** average in-transit RH assumption (%) — DEMO ASSUMPTION */
  assumedRhPct: number;
  handlingPoints: number;
  coldChain: boolean;
}

export interface RouteAnalysis {
  distanceKm: number;
  distanceSource: 'router' | 'fallback';
  durationHours: number;
  tempExposure: 'low' | 'medium' | 'high';
  humidityExposure: 'low' | 'medium' | 'high';
  handlingRisk: 'low' | 'medium' | 'high';
  coldChainRequired: boolean;
  overallRisk: 'low' | 'medium' | 'high';
  riskScore: number; // 0–100 model proxy
  explanations: string[];
}

function level(score: number): 'low' | 'medium' | 'high' {
  return score < 34 ? 'low' : score < 67 ? 'medium' : 'high';
}

export function analyzeRoute(r: RouteInput): RouteAnalysis {
  const explanations: string[] = [];

  // Duration is resolved upstream; this engine only turns it into exposure.
  const days = r.durationHours / 24;
  const router = r.distanceSource !== 'fallback';

  // Temperature exposure: assumed in-transit temp vs an 8–22 °C comfort band for fresh food.
  // Calibrated so a warm unrefrigerated leg (30 °C) lands in MEDIUM and 40 °C+ in HIGH.
  const t = r.assumedTempC;
  const tempScore = r.coldChain ? clamp(Math.abs(t - 8) * 2.5, 0, 60) : clamp(25 + Math.max(0, t - 22) * 3 + Math.max(0, 8 - t) * 4, 0, 100);
  const tempExposure = level(tempScore);

  // Humidity exposure: distance from the 60–85% band
  const h = r.assumedRhPct;
  const humidityScore = clamp(30 + Math.max(0, h - 85) * 2.5 + Math.max(0, 60 - h) * 1.8, 0, 100);
  const humidityExposure = level(humidityScore);

  // Handling: transshipment points and mode roughness
  const modeFactor = r.mode === 'road' ? 6 : r.mode === 'rail' ? 5 : r.mode === 'sea' ? 8 : 3;
  const handlingScore = clamp(r.handlingPoints * 14 + modeFactor + days * 2, 0, 100);
  const handlingRisk = level(handlingScore);

  // Cold-chain requirement: fresh perishables on long/warm legs (>~30 h without cooling)
  const coldChainRequired = !r.coldChain && days >= 1.25 && t >= 22;

  // Overall: weighted mix of the three exposures + duration
  const riskScore = Math.round(clamp(0.4 * tempScore + 0.25 * humidityScore + 0.25 * handlingScore + 0.1 * clamp(days * 9, 0, 100), 0, 100));
  const overallRisk = level(riskScore);

  explanations.push(`Route distance ${r.distanceKm} km (source: ${r.distanceSource ?? 'router'}).`);
  explanations.push(`Duration ${round(r.durationHours, 1)} h — longer duration increases exposure to environmental and mechanical conditions, raising the importance of protective packaging.`);
  explanations.push(`In-transit temperature assumed ${t} °C, RH ${h}% — DEMO ASSUMPTION, no live weather/telemetry data.`);
  explanations.push(`${r.handlingPoints} handling/transshipment point(s) — each transfer adds drop/impact probability (model proxy).`);
  if (r.coldChain) explanations.push('Cold-chain transport selected: temperature-controlled packaging requirements apply.');
  else if (coldChainRequired) explanations.push('Model suggests cold chain for this duration/temperature combination — packaging alone cannot hold quality on this leg.');

  return {
    distanceKm: r.distanceKm,
    distanceSource: r.distanceSource ?? 'router',
    durationHours: r.durationHours,
    tempExposure,
    humidityExposure,
    handlingRisk,
    coldChainRequired,
    overallRisk,
    riskScore,
    explanations,
  };
}

/** Exposure metrics → additional packaging requirements fed into scoring. */
export interface RoutePackagingDelta {
  mechanicalBoost: number; // 0–1 extra weight on mechanical protection
  moistureBoost: number;
  insulationMatters: boolean;
  notes: string[];
}

export function routePackagingDelta(a: RouteAnalysis, commodity: FoodCommodity): RoutePackagingDelta {
  const notes: string[] = [];
  const mech = { low: 0, medium: 0.15, high: 0.3 }[a.handlingRisk];
  const moist = { low: 0, medium: 0.1, high: 0.2 }[a.humidityExposure];
  if (mech > 0) notes.push(`Handling risk ${a.handlingRisk} → mechanical-protection weight increased for route exposure.`);
  if (moist > 0) notes.push(`Humidity exposure ${a.humidityExposure} → moisture-barrier weight increased.`);
  if (a.coldChainRequired && (commodity.form === 'fresh' || (commodity.storageTempRangeC?.[1] ?? 30) <= 15)) {
    notes.push('Long warm leg for a perishable — insulated/temperature-tolerant structures favoured.');
    return { mechanicalBoost: mech, moistureBoost: moist, insulationMatters: true, notes };
  }
  return { mechanicalBoost: mech, moistureBoost: moist, insulationMatters: false, notes };
}


