import type { FailureMode, FoodCommodity, FoodProperties, PackagingMaterial, RiskTimelinePoint, StorageInput } from '../domain/types';
import { clamp, q10 } from './util';

/**
 * FAILURE-MODE ENGINE (Failure Lab).
 * For a given material+food+environment combination, classify the model-based
 * failure hypotheses, their probability proxies, onset days, and a daily risk
 * timeline. Deterministic and explainable — every mode carries its mechanism.
 */

export function classifyFailureModes(
  material: PackagingMaterial,
  commodity: FoodCommodity,
  props: FoodProperties,
  storage: StorageInput,
  requiredOtrMin?: number,
  requiredWvtrMax?: number,
  massAreaRatioKgPerM2 = 16.7,
): FailureMode[] {
  const modes: FailureMode[] = [];
  const respiring = (props.respirationRateMgCo2KgH ?? 0) > 0.5;

  // ---- Anaerobic collapse (respiring produce + low-OTR film) ----
  if (respiring && requiredOtrMin !== undefined) {
    const rate = (props.respirationRateMgCo2KgH ?? 0) * q10(10, storage.temperatureC, 2.2);
    const demand = (rate / massAreaRatioKgPerM2) * 24 * 0.56;
    const ratio = material.otrCm3M2Day.value / Math.max(demand, 0.01);
    if (ratio < 1.2) {
      const probability = Math.round(clamp(1 - ratio / 1.2, 0, 1) * 100);
      const onset = Math.max(1, Math.round(3 * clamp(ratio / 1.2, 0.1, 1)));
      modes.push({
        id: 'anaerobic',
        name: 'Anaerobic respiration & off-odour spoilage',
        severity: probability > 60 ? 'high' : 'medium',
        probability,
        onsetDays: onset,
        mechanism: `Film OTR (${material.otrCm3M2Day.value}) ≈ ${Math.round(ratio * 100)}% of modelled O₂ demand (${demand.toFixed(1)} cm³/m²·day). Headspace O₂ depletes; tissue switches to fermentation.`,
        explanation: 'Low-OTR films (foil, MET-PET, high-barrier laminates) are designed to KEEP oxygen out — the opposite of what respiring produce needs. O₂ falls below ~1–2%, CO₂ spikes, and anaerobic respiration produces ethanol and off-odours.',
        mitigation: 'Use a film whose OTR matches respiration demand, or add micro-perforations; reduce fill mass per pack or increase pack surface area.',
      });
    }
  }

  // ---- Moisture gain (dry foods + permeable film) ----
  if (requiredWvtrMax !== undefined && (props.waterActivity ?? 1) < 0.65 && material.wvtrGm2Day.value > requiredWvtrMax) {
    const ratio = material.wvtrGm2Day.value / Math.max(requiredWvtrMax, 0.01);
    modes.push({
      id: 'moisture-gain',
      name: 'Moisture gain → texture loss / caking',
      severity: ratio > 3 ? 'high' : 'medium',
      probability: Math.round(clamp(Math.log10(ratio) / Math.log10(30), 0.1, 0.95) * 100),
      onsetDays: Math.max(2, Math.round(10 / ratio)),
      mechanism: `Film WVTR ${material.wvtrGm2Day.value} exceeds the ${requiredWvtrMax} g/m²·day ceiling derived for aw≈${props.waterActivity} at ${storage.rhPct}% RH.`,
      explanation: 'Low-aw foods are hygroscopic: water vapour migrates inward whenever the film is more permeable than the requirement, driving stale/caking failure long before microbial spoilage.',
      mitigation: 'Switch to a high-moisture-barrier structure (e.g. PP, MET-PET, foil laminate) or add a secondary liner.',
    });
  }

  // ---- Oxidation (O₂-sensitive + high-OTR film) ----
  if (props.oxygenSensitivity >= 3 && !respiring && material.otrCm3M2Day.value > 100) {
    const ratio = material.otrCm3M2Day.value / 100;
    modes.push({
      id: 'oxidation',
      name: 'Oxidative rancidity / nutrient loss',
      severity: ratio > 15 ? 'high' : 'medium',
      probability: Math.round(clamp(Math.log10(ratio) / Math.log10(50), 0.1, 0.95) * 100),
      onsetDays: Math.max(3, Math.round(30 / Math.log10(ratio + 1) / 2)),
      mechanism: `Film OTR ${material.otrCm3M2Day.value} cm³/m²·day vs ≤100 required for sensitivity level ${props.oxygenSensitivity}.`,
      explanation: 'O₂ ingress drives fat oxidation (rancid odours) and vitamin degradation in oxygen-sensitive, non-respiring foods.',
      mitigation: 'Use high-barrier laminate (MET-PET/foil) and/or oxygen scavenger; minimize headspace.',
    });
  }

  // ---- Condensation (fresh produce, high RH, film temperature swings) ----
  if (respiring && storage.rhPct >= 80 && props.waterActivity !== undefined && (props.waterActivity ?? 0) > 0.95) {
    modes.push({
      id: 'condensation',
      name: 'In-pack condensation & rot',
      severity: 'medium',
      probability: Math.round(clamp(0.3 + (storage.rhPct - 80) / 50 + (material.wvtrGm2Day.value < 5 ? 0.2 : 0), 0.2, 0.9) * 100),
      onsetDays: 4,
      mechanism: `Storage RH ${storage.rhPct}% with a low-WVTR film (${material.wvtrGm2Day.value} g/m²·day) traps transpired water; film is coldest at the product contact surface.`,
      explanation: 'When temperature fluctuates, water condenses on the inner film surface. Free water enables bacterial soft-rot and mould even when the atmosphere is correct.',
      mitigation: 'Antifog coating, higher-WVTR film or micro-perforation, absorbent pads, and stable temperature.',
    });
  }

  // ---- Temperature abuse (chilling injury / heat) ----
  const [tLo, tHi] = commodity.storageTempRangeC;
  if (storage.temperatureC < tLo - 1) {
    modes.push({
      id: 'chilling',
      name: 'Chilling injury',
      severity: storage.temperatureC < tLo - 4 ? 'high' : 'medium',
      probability: Math.round(clamp((tLo - storage.temperatureC) / 8, 0.15, 0.95) * 100),
      onsetDays: Math.max(2, Math.round(8 - (tLo - storage.temperatureC))),
      mechanism: `Storage at ${storage.temperatureC}°C is below the commodity floor (${tLo}°C).`,
      explanation: 'Tropical/subtropical produce develops pitting, discoloration and failure to ripen below their threshold — packaging cannot prevent this, only transport and storage choices can.',
      mitigation: 'Raise storage temperature above the commodity floor; packaging selection cannot compensate.',
    });
  } else if (storage.temperatureC > tHi + 8) {
    modes.push({
      id: 'thermal-abuse',
      name: 'Accelerated senescence / microbial growth',
      severity: 'high',
      probability: Math.round(clamp((storage.temperatureC - tHi) / 15, 0.3, 0.95) * 100),
      onsetDays: Math.max(1, Math.round(4 - (storage.temperatureC - tHi) / 10)),
      mechanism: `Storage at ${storage.temperatureC}°C far exceeds the recommended ${tLo}–${tHi}°C band.`,
      explanation: 'Q10 ≈ 2.2 means each 10°C rise roughly doubles metabolic and microbial rates — shelf life collapses regardless of film choice.',
      mitigation: 'Restore cold chain; the model already discounts estimated shelf life via the Q10 correction.',
    });
  }

  // ---- Physical failure (thin film, long-haul) ----
  if (material.thicknessUmRange[1] < 35 && material.tensileStrengthMpa.value < 100) {
    modes.push({
      id: 'physical',
      name: 'Film puncture / seal failure in transit',
      severity: 'low',
      probability: 25,
      onsetDays: null,
      mechanism: `Thin flexible film (${material.thicknessUmRange[0]}–${material.thicknessUmRange[1]} µm, tensile ${material.tensileStrengthMpa.value} MPa) with no secondary packaging.`,
      explanation: 'Sharp produce edges or rough handling can puncture thin films; a broken seal converts the pack from MAP to open air instantly.',
      mitigation: 'Increase gauge, add secondary corrugated packaging, or use a laminate with higher tensile strength.',
    });
  }

  return modes;
}

/** Day-by-day risk accumulation for the Failure Lab timeline chart. */
export function buildRiskTimeline(
  modes: FailureMode[],
  material: PackagingMaterial,
  props: FoodProperties,
  storage: StorageInput,
  days = 14,
): RiskTimelinePoint[] {
  const respiring = (props.respirationRateMgCo2KgH ?? 0) > 0.5;
  const anaerobicMode = modes.find((m) => m.id === 'anaerobic');
  const moistureMode = modes.find((m) => m.id === 'moisture-gain');
  const oxidativeMode = modes.find((m) => m.id === 'oxidation');
  const condensationMode = modes.find((m) => m.id === 'condensation');

  const timeline: RiskTimelinePoint[] = [];
  for (let day = 1; day <= days; day++) {
    const sig = (onset: number) => clamp((day - onset + 2) / 4, 0, 1);

    const anaerobic = anaerobicMode ? Math.round(anaerobicMode.probability * sig(anaerobicMode.onsetDays ?? 3)) : 0;
    const moisture = moistureMode ? Math.round(moistureMode.probability * sig(moistureMode.onsetDays ?? 5)) : 0;
    const oxidative = oxidativeMode ? Math.round(oxidativeMode.probability * sig(oxidativeMode.onsetDays ?? 10)) : 0;
    const condensation = condensationMode ? Math.round(condensationMode.probability * sig(condensationMode.onsetDays ?? 4)) : 0;

    const overall = clamp(Math.max(anaerobic, moisture, oxidative) + 0.3 * condensation, 0, 100);
    timeline.push({ day, anaerobic, moisture, oxidative, overall });
  }
  return timeline;
}
