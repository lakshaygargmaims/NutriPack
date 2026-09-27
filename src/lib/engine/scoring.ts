import type {
  FoodCommodity,
  FoodProperties,
  PackagingMaterial,
  PackagingRequirements,
  ScoreBreakdown,
  StorageInput,
  TransportInput,
} from '../domain/types';
import { DEFAULT_WEIGHTS } from '../domain/referenceData';
import { clamp, higherIsBetterScore, lowerIsBetterScore, round } from './util';

export type ScoreWeights = typeof DEFAULT_WEIGHTS;

/**
 * MATERIAL SCORING — rule-based food-science constraints produce a 0..100
 * score per material plus a list of hard infeasibilities. Fully transparent:
 * every sub-score is exposed for the UI and explanations.
 */

export function scoreMaterial(
  material: PackagingMaterial,
  commodity: FoodCommodity,
  props: FoodProperties,
  requirements: PackagingRequirements,
  storage: StorageInput,
  transport?: Partial<TransportInput>,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
  opts: { mode?: 'cost' | 'shelf' | 'sustainability' | 'transport' | 'balanced'; budgetInr?: number } = {},
): { total: number; breakdown: ScoreBreakdown; infeasible: string[] } {
  const infeasible: string[] = [];

  // --- hard filters ---
  if (!material.foodContactSafe) infeasible.push('not food-contact safe');
  if (storage.temperatureC < material.tempRangeC[0] || storage.temperatureC > material.tempRangeC[1]) {
    infeasible.push(`temperature range ${material.tempRangeC[0]}..${material.tempRangeC[1]}°C excludes storage at ${storage.temperatureC}°C`);
  }
  if (requirements.sealabilityRequired && !material.sealable) {
    infeasible.push('not sealable but hermetic seal required');
  }
  // Anaerobic veto: film OTR below ~half of modelled respiration demand suffocates produce.
  if (requirements.otrMin !== undefined && material.otrCm3M2Day.value < requirements.otrMin / 2) {
    infeasible.push(
      `OTR ${material.otrCm3M2Day.value} far below modelled respiration demand (${requirements.otrMin}) — anaerobic respiration risk`,
    );
  }
  if (props.lightSensitivity >= 4 && material.lightBarrier < requirements.lightBarrierMin) {
    infeasible.push('insufficient light protection for light-sensitive commodity');
  }

  // --- sub-scores (0..1) ---
  const foodCompatibility = clamp(
    0.5 +
      0.1 * (5 - props.oxygenSensitivity) * (material.oxygenBarrier >= requirements.oxygenBarrierMin ? 1 : 0.3) +
      0.1 * (5 - props.moistureSensitivity) * (material.moistureBarrier >= requirements.moistureBarrierMin ? 1 : 0.4),
    0, 1,
  );

  // OTR suitability: for respiring produce we want OTR within [otrMin, otrMax];
  // for barriers we want OTR ≤ otrMax.
  const otrScore = requirements.otrMin
    ? windowScoreOTR(material.otrCm3M2Day.value, requirements.otrMin, requirements.otrMax)
    : lowerIsBetterScore(material.otrCm3M2Day.value, requirements.otrMax, 6);

  const wvtrScore = lowerIsBetterScore(material.wvtrGm2Day.value, requirements.wvtrMax, 6);

  const midThickness = (requirements.thicknessUmMin + requirements.thicknessUmMax) / 2;
  const thicknessScore = clamp(
    1 - Math.min(1, Math.abs((material.thicknessUmRange[0] + material.thicknessUmRange[1]) / 2 - midThickness) / Math.max(midThickness, 1)),
    0.05,
    1,
  );

  const sealability = requirements.sealabilityRequired ? (material.sealable ? 1 : 0) : 0.7;

  const tempMid = (material.tempRangeC[0] + material.tempRangeC[1]) / 2;
  const temperatureCompatibility = clamp(
    0.4 + 0.6 * (material.tempRangeC[0] <= storage.temperatureC ? 0.6 : 0) + (tempMid > storage.temperatureC ? 0.1 : 0),
    0, 1,
  );

  const shelfLifeCapability = clamp(
    0.35 * otrScore + 0.35 * wvtrScore + 0.2 * temperatureCompatibility + 0.1 * (material.mapSuitable ? 1 : 0.3),
    0, 1,
  );

  const costPerM2 = material.costInrPerM2.value;
  const costScore = clamp(1 - Math.log10(Math.max(costPerM2, 1) / 3.5) / Math.log10(8), 0.05, 1);

  const sustainabilityScore = clamp(
    0.35 * recyclabilityScore(material) +
      0.2 * clamp(material.recycledContentPct / 100 + (material.category === 'paper' || material.category === 'bioplastic' || material.category === 'compostable' ? 0.3 : 0)) +
      0.25 * clamp(1 - Math.log10(Math.max(material.carbonKgCo2ePerM2.value, 0.05) / 0.2) / Math.log10(6)) +
      0.2 * clamp(0.5 + (material.category === 'paper' ? 0.3 : material.category === 'plastic' ? 0 : -0.1)),
    0, 1,
  );

  const transportScore = transport ? transportDurabilityScore(material, transport) : 0.7;

  const mode = opts.mode ?? 'balanced';
  const w = applyModeWeights(weights, mode, {
    respiring: (props.respirationRateMgCo2KgH ?? 0) > 0.5,
    budgetInr: opts.budgetInr,
    costPerM2,
  });

  const total = round(
    100 *
      (w.foodCompatibility * foodCompatibility +
        w.otrSuitability * otrScore +
        w.wvtrSuitability * wvtrScore +
        w.thicknessSuitability * thicknessScore +
        w.sealability * sealability +
        w.temperatureCompatibility * temperatureCompatibility +
        w.shelfLifeCapability * shelfLifeCapability +
        w.costScore * costScore +
        w.sustainabilityScore * sustainabilityScore +
        w.transportScore * transportScore),
    1,
  );

  const breakdown: ScoreBreakdown = {
    foodCompatibility: round(foodCompatibility * 100, 0),
    otrSuitability: round(otrScore * 100, 0),
    wvtrSuitability: round(wvtrScore * 100, 0),
    thicknessSuitability: round(thicknessScore * 100, 0),
    sealability: round(sealability * 100, 0),
    temperatureCompatibility: round(temperatureCompatibility * 100, 0),
    shelfLifeCapability: round(shelfLifeCapability * 100, 0),
    costScore: round(costScore * 100, 0),
    sustainabilityScore: round(sustainabilityScore * 100, 0),
    transportScore: round(transportScore * 100, 0),
  };

  return { total, breakdown, infeasible };

}

function windowScoreOTR(value: number, min: number, max: number): number {
  if (value >= min && value <= max) return 1;
  if (value < min) {
    // Below the respiration demand: anaerobic risk — severe, asymmetric penalty.
    return value < min / 2 ? 0.05 : 0.35;
  }
  // Above the window: safe (air-like exchange) but no active MAP benefit —
  // moderate penalty with an asymptotic floor. Over-permeable ≠ catastrophic.
  return clamp(0.2 + 0.8 * (1 - Math.log10(value / max) / Math.log10(50)), 0.2, 0.95);
}

export function recyclabilityScore(m: PackagingMaterial): number {
  switch (m.recyclability) {
    case 'widely': return 1;
    case 'limited': return 0.5;
    case 'rare': return 0.2;
    case 'not': return 0.05;
  }
}

/** Heuristic durability for transport stress: tensile + seal + thickness. */
export function transportDurabilityScore(m: PackagingMaterial, t: Partial<TransportInput>): number {
  const stress = (t.distanceKm ?? 300) / 1000 + (t.mode === 'sea' ? 0.8 : t.mode === 'air' ? 0.2 : 0.3);
  const base = clamp(
    0.4 * clamp(m.tensileStrengthMpa.value / 100) + 0.3 * (m.sealable ? 1 : 0.2) + 0.3 * clamp(m.thicknessUmRange[1] / 100),
  );
  return clamp(base - 0.15 * clamp(stress - 0.5), 0.05, 1);
}

/** Optimization profiles re-weight the objective — transparent, documented. */
export function applyModeWeights(
  base: ScoreWeights,
  mode: 'cost' | 'shelf' | 'sustainability' | 'transport' | 'balanced',
  ctx: { respiring: boolean; budgetInr?: number; costPerM2: number },
): ScoreWeights {
  const w = { ...base };
  switch (mode) {
    case 'cost':
      w.costScore = 0.38;
      w.sustainabilityScore = 0.05;
      w.shelfLifeCapability = 0.05;
      break;
    case 'shelf':
      w.shelfLifeCapability = 0.35;
      w.otrSuitability = Math.max(w.otrSuitability, 0.18);
      w.wvtrSuitability = Math.max(w.wvtrSuitability, 0.18);
      w.costScore = 0.03;
      break;
    case 'sustainability':
      w.sustainabilityScore = 0.4;
      w.costScore = 0.04;
      break;
    case 'transport':
      w.transportScore = 0.35;
      w.sealability = Math.max(w.sealability, 0.12);
      break;
    case 'balanced':
    default:
      break;
  }
  // renormalize to 1
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(w) as (keyof ScoreWeights)[]) w[k] = w[k] / sum;
  return w;
}

export { higherIsBetterScore };
