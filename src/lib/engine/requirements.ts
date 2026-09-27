import type {
  FoodCommodity,
  FoodProperties,
  PackagingRequirements,
  StorageInput,
  TransportInput,
  TransportMode,
} from '../domain/types';
import { clamp, q10, round } from './util';

/**
 * RULE-BASED food-science constraints → packaging requirements.
 * Derivations are transparent: every rule appends a human-readable derivation
 * line so the UI (and the report) can show HOW requirements were obtained.
 */

const respirationClass = (rate: number) =>
  rate < 5 ? 'very-low' : rate < 15 ? 'low' : rate < 30 ? 'moderate' : rate < 60 ? 'high' : 'very-high';

export function deriveRequirements(
  commodity: FoodCommodity,
  props: FoodProperties,
  storage: StorageInput,
  transport?: Partial<TransportInput>,
  /** kg of product per m² of film surface (default 1 kg / 0.06 m² ≈ 16.7 kg/m²) */
  massAreaRatioKgPerM2: number = 16.7,
): PackagingRequirements {
  const derivation: string[] = [];
  const dataGaps: string[] = [];

  // ---- Moisture: aw-driven WVTR requirement (permeance per m² per day) ----
  const aw = props.waterActivity ?? 0.9;
  if (props.waterActivity === undefined) {
    dataGaps.push('water activity — assumed aw≈0.90 (medium moisture sensitivity); provide measured aw for better estimates');
  }
  const envVpd = Math.max(0.1, (100 - storage.rhPct) / 100); // simplified vapour-pressure proxy
  const dryProduct = aw < 0.65;
  const moistProduct = aw > 0.95;
  let wvtrMax: number;
  if (dryProduct) {
    // dry products must not gain moisture
    wvtrMax = round(3 / Math.max(envVpd, 0.05), 1);
    derivation.push(
      `Low-aw product (aw≈${aw}) → moisture GAIN is the risk; required WVTR ≤ ${wvtrMax} g/m²·day at ${storage.rhPct}% RH (rule: dry-food moisture barrier).`,
    );
  } else if (moistProduct) {
    // fresh high-aw produce must not lose water; film must retain humidity but vent excess
    wvtrMax = round(6 + storage.temperatureC * 0.4, 1);
    derivation.push(
      `High-aw fresh product (aw≈${aw}) → moisture LOSS is the risk; antifog/high-RH film with WVTR ≤ ${wvtrMax} g/m²·day tolerated; condensation managed via perforation/MAP.`,
    );
  } else {
    wvtrMax = round(10 / Math.max(envVpd, 0.05) / 10, 1);
    derivation.push(
      `Intermediate-aw product (aw≈${aw}) → balanced moisture barrier; required WVTR ≤ ${wvtrMax} g/m²·day.`,
    );
  }
  const moistureBarrierMin = clamp(
    dryProduct ? 0.75 + props.moistureSensitivity * 0.04 : moistProduct ? 0.3 : 0.45 + props.moistureSensitivity * 0.05,
  );

  // ---- Oxygen: sensitivity + respiration ----
  const resp = props.respirationRateMgCo2KgH ?? 0;
  const respiring = resp > 0.5;
  const oxygenBarrierMin = clamp(
    props.oxygenSensitivity >= 4 ? 0.75 : props.oxygenSensitivity >= 2 ? 0.45 : 0.1,
  );
  let otrMax: number;
  let otrMin: number | undefined;
  if (respiring) {
    // Fresh produce: film OTR must match O2 consumption to avoid anaerobic respiration.
    const q10Factor = 2.2;
    const rateAtTemp = resp * q10(10, storage.temperatureC, q10Factor);
    // Mass→area coupling: rate[kg-based] ÷ kg-per-m² × 24 h × 0.56 ml/mg (STP, RQ≈1).
    const o2DemandCm3M2Day = round((rateAtTemp / massAreaRatioKgPerM2) * 24 * 0.56, 1);
    otrMin = round(o2DemandCm3M2Day * 0.5, 1); // avoid anaerobic conditions
    otrMax = round(o2DemandCm3M2Day * 3, 1);
    derivation.push(
      `Respiring produce (class: ${respirationClass(resp)}, ${resp} mg CO₂/kg·h at 10°C) → at ${storage.temperatureC}°C modelled O₂ demand ≈ ${o2DemandCm3M2Day} cm³/m²·day; required film OTR window ≈ [${otrMin}, ${otrMax}] cm³/m²·day (rule: O₂ balance for MAP of fresh produce).`,
    );
    if (props.oxygenSensitivity >= 3) {
      derivation.push('Cut fruit/high-sensitivity produce: anoxic risk flagged — micro-perforation or high-OTR film recommended.');
    }
  } else if (props.oxygenSensitivity >= 4) {
    otrMax = 8;
    derivation.push(
      `Very high oxygen sensitivity (oxidation-dominant) → required OTR ≤ ${otrMax} cm³/m²·day (rule: oxidation control).`,
    );
  } else if (props.oxygenSensitivity >= 2) {
    otrMax = 120;
    derivation.push(`Moderate oxygen sensitivity → required OTR ≤ ${otrMax} cm³/m²·day.`);
  } else {
    otrMax = 8000;
    derivation.push('Low oxygen sensitivity → weak O₂ barrier acceptable; film chosen on other criteria.');
  }

  // ---- CO2 management for produce ----
  const co2trMin = respiring ? round(otrMax * 1.6, 0) : undefined;
  if (respiring) {
    derivation.push(`CO₂ must vent ≈1.6× O₂ entry (respiratory quotient ≈1) → required CO₂TR ≥ ${co2trMin} cm³/m²·day.`);
  }

  // ---- Light ----
  const lightBarrierMin = clamp(props.lightSensitivity >= 4 ? 0.8 : props.lightSensitivity >= 2 ? 0.4 : 0.05);

  // ---- Thickness & sealability ----
  const thicknessUmMin = respiring ? 20 : dryProduct ? 40 : 30;
  const thicknessUmMax = respiring ? 40 : 120;
  const sealabilityRequired = props.moistureSensitivity >= 2 || respiring || props.oxygenSensitivity >= 3;
  if (sealabilityRequired) {
    derivation.push('Sealability required: hermetic seal needed for moisture/oxidation control or MAP.');
  } else {
    derivation.push('Sealability optional: no hermetic requirement derived.');
  }

  // ---- Temperature compatibility ----
  let tempMinC = storage.temperatureC;
  if (transport?.expectedTempC !== undefined) tempMinC = Math.min(tempMinC, transport.expectedTempC);
  tempMinC = Math.min(tempMinC, -10); // tolerate cold chain defaults

  // ---- MAP suitability ----
  let mapSuitability: PackagingRequirements['mapSuitability'];
  if (respiring && props.oxygenSensitivity >= 2) {
    mapSuitability = 'required';
    derivation.push('MAP REQUIRED: high/sensitive respiration — active atmosphere management is the primary shelf-life lever.');
  } else if (respiring) {
    mapSuitability = 'recommended';
  } else if (props.oxygenSensitivity >= 3) {
    mapSuitability = 'recommended';
  } else {
    mapSuitability = 'optional';
  }

  // ---- Transport stress adds barrier/durability requirements ----
  if (transport && transport.mode && transport.mode !== 'none') {
    const rough = transport.mode === 'sea' || (transport.distanceKm ?? 0) > 800;
    if (rough) {
      derivation.push(
        `Long-haul ${transport.mode} transport (${transport.distanceKm ?? 0} km) → higher tensile strength and seal integrity required.`,
      );
    }
  }

  if (dataGaps.length) {
    derivation.push(`Data gaps (assumptions used): ${dataGaps.join('; ')}.`);
  }

  return {
    otrMax,
    otrMin,
    wvtrMax,
    co2trMin,
    moistureBarrierMin,
    oxygenBarrierMin,
    lightBarrierMin,
    thicknessUmMin,
    thicknessUmMax,
    sealabilityRequired,
    tempMinC,
    mapSuitability,
    derivation,
    dataGaps,
  };
}

export const transportModeLabel: Record<TransportMode, string> = {
  road: 'Road',
  rail: 'Rail',
  air: 'Air',
  sea: 'Sea',
  none: 'No transport step',
};
