import type { FoodCommodity, FoodProperties, PackagingMaterial, TransportAssessment, TransportInput } from '../domain/types';
import { clamp, q10 } from './util';

/**
 * TRANSPORT SIMULATOR — thermal/humidity exposure and suitability.
 * Transparent heuristics; every output line is explainable.
 */

export function assessTransport(
  t: TransportInput,
  commodity: FoodCommodity,
  props: FoodProperties,
  material?: PackagingMaterial,
): TransportAssessment {
  const explanations: string[] = [];
  let risk = 0;

  // Thermal exposure vs commodity comfort envelope
  const [tLo, tHi] = commodity.storageTempRangeC;
  const thermalExposureC = Math.max(0, t.expectedTempC - tHi) + Math.max(0, tLo - t.expectedTempC);
  if (thermalExposureC > 0) {
    const sev = clamp(thermalExposureC / 8, 0, 1);
    risk += 25 * sev + 10;
    explanations.push(
      `Transport temperature ${t.expectedTempC}°C is outside the commodity comfort envelope (${tLo}–${tHi}°C) — thermal stress contributes risk.`,
    );
  } else {
    explanations.push(`Transport temperature ${t.expectedTempC}°C is inside the commodity comfort envelope (${tLo}–${tHi}°C).`);
  }

  // Humidity exposure
  const [hLo, hHi] = commodity.storageRhRangePct;
  const humidityExposurePct = Math.max(0, hLo - t.expectedRhPct) + Math.max(0, t.expectedRhPct - hHi);
  if (humidityExposurePct > 15) {
    risk += 12;
    explanations.push(`Transport RH ${t.expectedRhPct}% deviates >15 points from ideal ${hLo}–${hHi}% — condensation or desiccation risk.`);
  }

  // Duration stress
  const durationStress = clamp((t.durationDays - 2) / 6, 0, 1);
  risk += 20 * durationStress;
  if (t.durationDays > 4) {
    explanations.push(`${t.durationDays}-day transit exceeds 4 days — cumulative exposure becomes significant for perishables.`);
  } else {
    explanations.push(`${t.durationDays}-day transit is within a manageable window for this commodity class.`);
  }

  // Cold chain
  if (!t.coldChain && commodity.form === 'fresh' && t.expectedTempC > tHi) {
    risk += 20;
    explanations.push('No cold chain on a fresh commodity with warm transport — spoilage risk rises sharply (model assumption).');
  } else if (t.coldChain) {
    explanations.push('Cold chain available — thermal abuse probability reduced.');
  }

  // Mode factor
  const modeStress = { sea: 0.12, road: 0.05, rail: 0.06, air: 0.02, none: 0 }[t.mode];
  risk += modeStress * 100;

  // Packaging mitigates
  if (material) {
    const strength = clamp(material.tensileStrengthMpa.value / 80, 0, 1);
    const mitigation = 0.15 + 0.25 * strength + (material.sealable ? 0.1 : 0);
    const before = risk;
    risk = Math.max(5, risk * (1 - mitigation));
    explanations.push(
      `Packaging (${material.name}) mitigates ≈${Math.round(((before - risk) / Math.max(before, 1)) * 100)}% of transport stress (tensile + seal model).`,
    );
  }

  risk = clamp(Math.round(risk), 2, 98);
  const suitability: TransportAssessment['suitability'] = risk < 30 ? 'high' : risk < 55 ? 'medium' : 'low';
  return {
    suitability,
    riskScore: risk,
    thermalExposureC: Math.round(thermalExposureC * 10) / 10,
    humidityExposurePct,
    durationDays: t.durationDays,
    explanations,
  };
}

export { q10 };
