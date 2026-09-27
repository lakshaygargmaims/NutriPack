import type { FoodCommodity, FoodProperties, PackagingMaterial, StorageInput, SupplyChainLeg, SupplyChainLegResult, SupplyChainResult } from '../domain/types';
import { clamp, q10, round } from './util';
import { assessTransport } from './transport';

/**
 * MULTI-LEG SUPPLY-CHAIN TWIN.
 * Time–Temperature–Tolerance (TTT) style model: each leg consumes modelled
 * shelf life at a Q10-weighted rate, and risks accumulate across legs.
 * Fully explainable — per-leg breakdown with shelf-life accounting.
 */

export interface SupplyChainParams {
  commodity: FoodCommodity;
  props: FoodProperties;
  material: PackagingMaterial;
  legs: SupplyChainLeg[];
  /** total modelled shelf-life budget in days under ideal conditions (midpoint) */
  shelfLifeBudgetDays: number;
}

export function simulateSupplyChain(p: SupplyChainParams): SupplyChainResult {
  const legResults: SupplyChainLegResult[] = [];
  let shelfLifeUsed = 0;
  let cumulativeRisk = 0;

  for (const leg of p.legs) {
    // TTT: fraction of shelf life consumed, Q10-weighted by leg temperature
    const perishable = p.commodity.form === 'fresh' || (p.props.waterActivity ?? 1) > 0.92;
    const q10Factor = perishable ? 2.2 : 1.4;
    const refTemp = (p.commodity.storageTempRangeC[0] + p.commodity.storageTempRangeC[1]) / 2;
    const tempFactor = q10(refTemp, leg.tempC, q10Factor); // rate multiplier
    // Round per-leg consumption to 2dp and accumulate the ROUNDED value so the
    // legs sum exactly to the total (displayed = accounted) — no float drift.
    const consumed = round(leg.durationDays * clamp(tempFactor, 0.2, 6), 2);
    shelfLifeUsed += consumed;

    // Leg risk reuses the single-leg transport model with packaging mitigation
    const assessment = assessTransport(
      {
        origin: leg.name,
        destination: leg.name,
        distanceKm: leg.mode === 'air' ? 1500 : leg.mode === 'sea' ? 3000 : 300,
        mode: leg.mode,
        durationDays: leg.durationDays,
        expectedTempC: leg.tempC,
        expectedRhPct: leg.rhPct,
        coldChain: leg.coldChain,
      },
      p.commodity,
      p.props,
      p.material,
    );
    cumulativeRisk = clamp(cumulativeRisk + assessment.riskScore * 0.6, 2, 98);

    const explanations = [...assessment.explanations];
    explanations.push(
      `Shelf-life accounting: ${leg.durationDays} d at ${leg.tempC}°C consumes ≈${round(consumed, 2)} d of modelled budget (Q10 ×${round(tempFactor, 2)}).`,
    );
    if (leg.coldChain) explanations.push('Cold chain on this leg halves modelled thermal-abuse probability.');

    legResults.push({
      name: leg.name,
      riskScore: assessment.riskScore,
      suitability: assessment.suitability,
      tempC: leg.tempC,
      durationDays: leg.durationDays,
      shelfLifeUsedDays: consumed,
      explanations,
    });
  }

  const totalDuration = p.legs.reduce((a, l) => a + l.durationDays, 0);
  const remaining = Math.max(0, p.shelfLifeBudgetDays - shelfLifeUsed);
  const remainingRange: [number, number] | null = remaining > 0 ? [round(remaining * 0.82, 1), round(remaining * 1.18, 1)] : [0, 0];

  const verdict =
    remaining <= 0
      ? `FAILURE: cumulative exposure (${round(shelfLifeUsed, 1)} d) exceeds the modelled shelf-life budget (${p.shelfLifeBudgetDays} d) — product arrives past modelled shelf life. Intervene on the hottest legs first.`
      : remaining < p.shelfLifeBudgetDays * 0.25
        ? `MARGINAL: only ≈${round(remaining, 1)} d of modelled shelf life remains on arrival (${Math.round((remaining / p.shelfLifeBudgetDays) * 100)}% of budget). Small delays will push the product past its date.`
        : `VIABLE: ≈${round(remaining, 1)} d of modelled shelf life remains on arrival (${Math.round((remaining / p.shelfLifeBudgetDays) * 100)}% of budget) with ${legResults.filter((l) => l.suitability !== 'high').length} leg(s) below high suitability.`;

  return {
    legs: legResults,
    totalDurationDays: totalDuration,
    shelfLifeUsedDays: round(shelfLifeUsed, 2),
    remainingShelfLifeDays: remainingRange,
    cumulativeRisk: Math.round(cumulativeRisk),
    verdict,
  };
}

/** Default demo chain: farm → packhouse → mandi → retail (Indian context). */
export const DEFAULT_SUPPLY_CHAIN: SupplyChainLeg[] = [
  { name: 'Farm collection', mode: 'road', durationDays: 1, tempC: 30, rhPct: 60, coldChain: false },
  { name: 'Packhouse (ambient staging)', mode: 'none', durationDays: 1, tempC: 25, rhPct: 70, coldChain: false },
  { name: 'Mandi / wholesale', mode: 'road', durationDays: 2, tempC: 28, rhPct: 65, coldChain: false },
  { name: 'Retail distribution', mode: 'road', durationDays: 1, tempC: 10, rhPct: 85, coldChain: true },
];
