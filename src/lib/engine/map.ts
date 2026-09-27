import type { FoodProperties, MapSimulationPoint, PackagingMaterial, StorageInput } from '../domain/types';
import { round } from './util';

/**
 * MAP SIMULATION — model-based O₂/CO₂ evolution.
 *
 * One-compartment model: product respiration consumes O₂ and releases CO₂ at
 * RQ≈1; film permeation + micro-perforation counter it; headspace dilutes.
 * Clearly labelled a simulation — not a substitute for pack trials.
 */

export interface MapParams {
  props: FoodProperties;
  storage: StorageInput;
  material: PackagingMaterial;
  areaM2: number; // film area per pack
  headspaceMl: number;
  thicknessUm: number;
  initialO2Pct: number; // normally 21 (air)
  initialCo2Pct: number; // normally 0
  days: number;
  /** Micro-perforation design (Yam et al. conductance model) */
  perforations?: {
    count: number; // number of holes
    diameterUm: number; // hole diameter
  } | null;
}

const DEFAULTS: Omit<MapParams, 'props' | 'storage' | 'material'> = {
  areaM2: 0.06, // ~24×25 cm pouch
  headspaceMl: 250,
  thicknessUm: 30,
  initialO2Pct: 21,
  initialCo2Pct: 0,
  days: 10,
  perforations: null,
};

/** Effective OTR combining film permeation and perforation gas exchange. */
export function effectiveOtr(
  material: PackagingMaterial,
  thicknessUm: number,
  areaM2: number,
  perforations?: MapParams['perforations'],
  headspaceMl = 250,
): { filmOtr: number; perfOtr: number; totalOtr: number } {
  // Film permeation scales inversely with thickness relative to reference thickness
  const refThickness = material.thicknessUmRange[0];
  const thicknessScalar = Math.max(0.2, refThickness / Math.max(thicknessUm, 1));
  const filmOtr = material.otrCm3M2Day.value * thicknessScalar * areaM2; // cm³/day for the pack

  if (!perforations || perforations.count <= 0 || perforations.diameterUm <= 0) {
    return { filmOtr, perfOtr: 0, totalOtr: filmOtr };
  }

  // Perforation conductance (Yam et al.): each hole behaves as a diffusion
  //+viscous-flow orifice; area-driven, independent of film thickness.
  // O2 diffusivity in air ≈ 0.2 cm²/s at 20°C → per-hole conductance
  // G ≈ (D·A)/(L) with L ≈ film thickness + 2·r (end-effect correction).
  const D = 0.2; // cm²/s O2 in air
  const r = perforations.diameterUm / 20000; // cm radius
  const A = Math.PI * r * r; // cm² per hole
  const L = thicknessUm / 10000 + 2 * r; // cm effective path
  const secondsPerDay = 86400;
  // RAW conductance (full-atmosphere Δ); caller applies driving-force fractions.
  const perfOtr = perforations.count * ((D * A) / L) * secondsPerDay; // cm³ O2/day

  return { filmOtr, perfOtr, totalOtr: filmOtr + perfOtr };
}

export function simulateMap(params: Partial<MapParams>): {
  series: MapSimulationPoint[];
  suitable: boolean;
  notes: string;
  targetO2: [number, number];
  targetCo2: [number, number];
  effective?: { filmOtr: number; perfOtr: number; totalOtr: number };
} {
  // Strip explicit-undefined keys so `{ ...DEFAULTS, ...params }` keeps its
  // defaults (a spread copies undefined values too → NaN downstream).
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Partial<MapParams>;
  const p: MapParams = { ...DEFAULTS, ...clean } as MapParams;
  const respiring = (p.props.respirationRateMgCo2KgH ?? 0) > 0.5;

  const targetO2: [number, number] = [2, 8];
  const targetCo2: [number, number] = [3, 10];

  if (!respiring) {
    return {
      series: [],
      suitable: false,
      notes: 'Not applicable: no respiration data/model for this commodity — MAP is not the active shelf-life lever.',
      targetO2,
      targetCo2,
    };
  }

  // Respiration at storage temperature (Q10 = 2.2 around 10°C reference)
  const resp = (p.props.respirationRateMgCo2KgH ?? 0) * Math.pow(2.2, (p.storage.temperatureC - 10) / 10); // mg CO2/kg·h

  // Approximate 1 kg product per pack (demo assumption)
  const massKg = 1;

  // Daily O2 consumed (ml at STP): mg CO2/kg·h × 24 h × kg × ≈0.56 ml CO2 per mg
  const o2PerDayMl = resp * 24 * massKg * 0.56;
  const co2PerDayMl = o2PerDayMl; // RQ ≈ 1

  // Effective exchange capability (film + perforations), RAW cm³/day at full-atmosphere Δ
  const eff = effectiveOtr(p.material, p.thicknessUm, p.areaM2, p.perforations, p.headspaceMl);

  // Driving-force fractions: O₂ entry scales with the O₂ deficit (mean ≈16% of
  // 1 atm over the 21%→~5% window); CO₂ exit with CO₂ load (mean ≈6%).
  const o2EntryPerDayMl = eff.totalOtr * 0.16;
  const co2OutPerDayMl = eff.totalOtr * (p.material.co2trCm3M2Day.value / p.material.otrCm3M2Day.value) * 0.06;

  const gasVolumeMl = p.headspaceMl;

  const series: MapSimulationPoint[] = [];
  let o2 = p.initialO2Pct;
  let co2 = p.initialCo2Pct;

  for (let day = 1; day <= p.days; day++) {
    o2 = o2 - (o2PerDayMl / gasVolumeMl) * 100 + (o2EntryPerDayMl / gasVolumeMl) * 100;
    co2 = co2 + (co2PerDayMl / gasVolumeMl) * 100 - (co2OutPerDayMl / gasVolumeMl) * 100;
    o2 = Math.max(1, Math.min(21, o2));
    co2 = Math.max(0, Math.min(30, co2));
    const withinTarget =
      o2 >= targetO2[0] && o2 <= targetO2[1] && co2 >= targetCo2[0] && co2 <= targetCo2[1];
    series.push({ day, o2Pct: round(o2, 1), co2Pct: round(co2, 1), withinTarget });
  }

  const withinCount = series.filter((s) => s.withinTarget).length;
  const suitable = withinCount / series.length >= 0.5;
  const perfNote = p.perforations && p.perforations.count > 0
    ? ` Perforation design: ${p.perforations.count} × Ø${p.perforations.diameterUm} µm contributes ${Math.round(eff.perfOtr)} cm³/day vs film ${Math.round(eff.filmOtr)} cm³/day.`
    : '';
  const notes =
    (suitable
      ? `Model: atmosphere stabilizes within/near target (O₂ ${targetO2[0]}–${targetO2[1]}%, CO₂ ${targetCo2[0]}–${targetCo2[1]}%) over ${p.days} days. Validate with pack trials.`
      : 'Model: atmosphere drifts outside the target window — adjust film permeability, perforation design or headspace. Validate with pack trials.') + perfNote;

  return { series, suitable, notes, targetO2, targetCo2, effective: eff };
}
