import type { EngineContext } from '../engine/pipeline';
import type { AnalysisInput, AnalysisResult } from '../domain/types';
import { getDb } from './store';
import { defaultBusiness, defaultTransport } from '../engine/pipeline';

export function engineContext(): EngineContext {
  const db = getDb();
  return { commodities: db.commodities, materials: db.materials };
}

/**
 * SIH DEMO SCENARIOS — judge-ready preconfigured analyses (§34 of the brief).
 * Each returns a full AnalysisResult so the dashboard/demo mode can render
 * instantly without typing inputs.
 */
export const DEMO_SCENARIOS: { id: string; title: string; blurb: string; input: AnalysisInput }[] = [
  {
    id: 'tomato-delhi-jaipur',
    title: 'Tomato · Delhi → Jaipur',
    blurb: '8 °C, 85% RH, 12-day target, road, balanced priority',
    input: {
      commodityId: 'tomato',
      storage: { temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' },
      transport: { origin: 'Delhi', destination: 'Jaipur', distanceKm: 280, mode: 'road', durationDays: 1, expectedTempC: 20, expectedRhPct: 60, coldChain: false },
      business: { packageSizeGrams: 1000, productionVolumePerMonth: 10000 },
      priority: 'balanced',
    },
  },
  {
    id: 'rice-ambient',
    title: 'Rice · Ambient Storage',
    blurb: '25 °C, 60% RH, 180-day target',
    input: {
      commodityId: 'rice',
      storage: { temperatureC: 25, rhPct: 60, targetShelfLifeDays: 180, environment: 'ambient' },
      transport: { origin: 'Karnal', destination: 'Lucknow', distanceKm: 580, mode: 'road', durationDays: 2, expectedTempC: 30, expectedRhPct: 65, coldChain: false },
      business: { packageSizeGrams: 5000, productionVolumePerMonth: 50000 },
      priority: 'min_cost',
    },
  },
  {
    id: 'mango-coldchain',
    title: 'Mango · Cold-Chain Export Leg',
    blurb: '12 °C, 90% RH, 10-day target, cold chain on',
    input: {
      commodityId: 'mango',
      storage: { temperatureC: 12, rhPct: 90, targetShelfLifeDays: 10, environment: 'refrigerated' },
      transport: { origin: 'Lucknow', destination: 'Delhi Airport', distanceKm: 550, mode: 'road', durationDays: 1, expectedTempC: 12, expectedRhPct: 85, coldChain: true },
      business: { packageSizeGrams: 2000, productionVolumePerMonth: 20000 },
      priority: 'max_shelf_life',
    },
  },
  {
    id: 'biscuits-moisture',
    title: 'Biscuits · Moisture-Sensitive',
    blurb: '25 °C, 55% RH, 90-day target',
    input: {
      commodityId: 'biscuits',
      storage: { temperatureC: 25, rhPct: 55, targetShelfLifeDays: 90, environment: 'ambient' },
      transport: { origin: 'Kolkata', destination: 'Guwahati', distanceKm: 1020, mode: 'road', durationDays: 3, expectedTempC: 32, expectedRhPct: 75, coldChain: false },
      business: { packageSizeGrams: 200, productionVolumePerMonth: 200000 },
      priority: 'max_shelf_life',
    },
  },
];

export const defaults = { defaultBusiness, defaultTransport };
