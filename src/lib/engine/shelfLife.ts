import type { FoodCommodity, FoodProperties, PackagingMaterial, ShelfLifeEstimate, StorageInput } from '../domain/types';
import { clamp, q10, round } from './util';

/**
 * Model-based shelf-life estimator.
 *
 * Method: baseline indicative shelf life (reference data) modulated by
 *  - Q10 (Arrhenius-approximation) temperature correction for perishables,
 *  - barrier-fit factors: how well the material's OTR/WVTR match requirements,
 *  - MAP bonus for respiring produce in MAP-capable films.
 *
 * Output is a RANGE with confidence — explicitly a model estimate requiring
 * experimental validation. No claim of experimental accuracy is made.
 */

export interface ShelfLifeParams {
  commodity: FoodCommodity;
  props: FoodProperties;
  storage: StorageInput;
  material: PackagingMaterial;
  /** 0..1 fit of oxygen barrier to requirement */
  oxygenFit: number;
  /** 0..1 fit of moisture barrier to requirement */
  moistureFit: number;
  /** material OTR vs requirement, cm³/m²·day */
  materialOtr: number;
  requiredOtrMax: number;
  requiredOtrMin?: number;
  materialWvtr: number;
  requiredWvtrMax: number;
}

export function estimateShelfLife(p: ShelfLifeParams): ShelfLifeEstimate {
  const { commodity, props, storage, material } = p;
  const perishable = commodity.form === 'fresh' || (props.waterActivity ?? 1) > 0.92;
  const baseline = Math.max(1.5, commodity.indicativeShelfLifeDays.value);

  // Temperature correction via Q10 (fresh produce: 2.2; low-moisture: 1.4).
  // Q10 gives the REACTION-RATE multiplier; shelf life scales inversely.
  const q10Factor = perishable ? 2.2 : 1.4;
  const refTemp = meanTemp(commodity.storageTempRangeC);
  const tempFactor = 1 / q10(refTemp, storage.temperatureC, q10Factor);
  const tempAbusive = tempFactor < 0.25 || tempFactor > 3;

  // Barrier fit factors (combined 0.55–1.25 multiplier)
  const oFit = clamp(p.oxygenFit);
  const mFit = clamp(p.moistureFit);
  const barrierFactor = 0.55 + 0.7 * (0.6 * oFit + 0.4 * mFit);

  // MAP bonus for respiring produce when film is MAP-capable
  const respiring = (props.respirationRateMgCo2KgH ?? 0) > 0.5;
  const mapBonus = respiring && material.mapSuitable ? 1.15 : 1;

  const mid = baseline * tempFactor * barrierFactor * mapBonus;
  const uncertainty = perishable ? 0.18 : 0.12;
  const low = Math.max(1, mid * (1 - uncertainty));
  const high = mid * (1 + uncertainty);

  // Limiting factor analysis
  const factors: { name: string; penalty: number }[] = [
    { name: 'temperature regime (Q10 model)', penalty: tempAbusive ? 0.35 : 0 },
    { name: 'oxygen barrier fit', penalty: 1 - oFit },
    { name: 'moisture barrier fit', penalty: 1 - mFit },
  ];
  factors.sort((a, b) => b.penalty - a.penalty);
  const limitingFactor =
    factors[0].penalty > 0.08 ? factors[0].name : 'overall packaging-property match (no single dominant limiter)';

  // Risk: storage hotter/drier than the commodity's typical envelope ⇒ elevated risk
  const [tLo, tHi] = commodity.storageTempRangeC;
  const outOfEnvelope = storage.temperatureC < tLo - 2 || storage.temperatureC > tHi + 8;
  const risk: ShelfLifeEstimate['risk'] = tempAbusive || outOfEnvelope ? 'high' : oFit < 0.5 || mFit < 0.5 ? 'medium' : 'low';

  const missingData = props.waterActivity === undefined || props.respirationRateMgCo2KgH === undefined;
  const confidence: ShelfLifeEstimate['confidence'] = missingData ? 'low' : tempAbusive ? 'low' : 'medium';

  return {
    daysLow: round(low, 1),
    daysHigh: round(high, 1),
    risk,
    confidence,
    limitingFactor,
    method: 'Q10 temperature correction (shelf life ∝ 1/rate) × barrier-fit factor on reference baseline',
    disclaimer:
      'Estimate is model-based (Q10 + barrier-fit heuristics) and must be experimentally validated before commercial decisions.',
  };
}

const meanTemp = ([lo, hi]: [number, number]) => (lo + hi) / 2;

export { meanTemp };
