import type { AnalysisInput, AnalysisResult, FoodCommodity, PackagingMaterial } from '../domain/types';
import {
  PACKAGING_FORMATS, CLOSURES, SEALING_METHODS, SECONDARY_PACKAGING, TERTIARY_PACKAGING, INNER_COMPONENTS,
  type PackagingFormat, type Closure, type SealingMethod, type SecondaryPackaging, type TertiaryPackaging, type InnerComponent, type Level,
} from '../domain/packagingData';
import { runAnalysis } from './pipeline';
import type { EngineContext } from './pipeline';

/**
 * COMPLETE PACKAGING SOLUTION ENGINE.
 * Upgrades the material-only recommendation into a full configuration:
 * FOOD → requirements → FORMAT → MATERIAL → CLOSURE → SEAL → LINERS →
 * SECONDARY → TERTIARY → ROUTE/RISK → options.
 * Reuses the existing pipeline for material scoring + failure modes so nothing
 * that already works changes. Hard constraints are FILTERS (with rejection
 * reasons), never just scores. All knowledge is demo/reference data.
 */

export interface RouteSpec {
  origin: string;
  destination: string;
  mode: 'road' | 'rail' | 'air' | 'sea' | 'none';
  distanceKm: number;
  durationDays: number;
  coldChain: boolean;
  handlingPoints: number;
  source: 'router' | 'assumption';
}

export type SolutionPriority = 'balanced' | 'min_cost' | 'max_sustainability';

export interface SolutionFailureRisk {
  risk: string;
  level: Level;
  cause: string;
  impact: string;
  mitigation: string;
}

export interface LayerDetail {
  level: 'product' | 'primary' | 'secondary' | 'tertiary' | 'transport';
  name: string;
  material: string;
  purpose: string;
  protection: Level;
  riskNote: string;
  relativeCost: Level;
  sustainability: Level;
  source: string;
}

export interface CompletePackagingSolution {
  optionId: 'balanced' | 'low_cost' | 'sustainability';
  optionLabel: string;
  food: { id: string; name: string; category: string };
  quantityKg: number;
  primaryPackaging: { formatId: string; formatName: string; category: string; description: string };
  materialStructure: { materialId: string; materialName: string; structure: string; layers: { material: string; purpose: string; barrierRole: string }[] };
  thickness: { um: number; note: string } | null;
  closure: { id: string; name: string; resealable: boolean; tamperEvidence: boolean } | null;
  sealingMethod: { id: string; name: string; hermeticPotential: Level; equipment: string } | null;
  innerLiners: { id: string; name: string; purpose: string }[];
  secondaryPackaging: { id: string; name: string; material: string; protection: Level } | null;
  tertiaryPackaging: { id: string; name: string; temperatureProtection: Level; reusability: Level } | null;
  transportMode: string;
  storageCondition: string;
  temperatureCondition: string;
  humidityCondition: string;
  estimatedCostCategory: Level;
  sustainabilityIndicator: Level;
  transportRisk: Level;
  failureRisks: SolutionFailureRisk[];
  recommendationReasons: string[];
  tradeoffs: string[];
  rejectedCandidates: { name: string; because: string }[];
  confidence: 'high' | 'medium' | 'low';
  dataProvenance: { source: string; sourceType: 'demo' | 'reference'; note: string };
  hierarchy: LayerDetail[];
  score: number;
}

const LEVEL_ORDER: Record<Level, number> = { low: 0, medium: 1, high: 2, unknown: 1 };

export function buildCompleteSolutions(input: AnalysisInput, route: RouteSpec, quantityKg: number, ctx: EngineContext): { solutions: CompletePackagingSolution[]; base: AnalysisResult } {
  const base = runAnalysis(input, ctx);
  const commodity = base.commodity;
  const props = commodity.properties;
  const respiring = (props.respirationRateMgCo2KgH ?? 0) > 0.5;
  const liquid = /milk|oil|beverage|juice|liquid/i.test(commodity.notes ?? '') || commodity.category === 'beverage' || commodity.id === 'milk' || commodity.id === 'mustard-oil';
  const fragile = respiring && (commodity.category === 'fruit' || commodity.category === 'vegetable');
  const awLow = (props.waterActivity ?? 1) < 0.6;
  const moistureSensitive = props.moistureSensitivity >= 3;
  const oxygenSensitive = props.oxygenSensitivity >= 4;
  const lightSensitive = props.lightSensitivity >= 4;
  const frozen = commodity.typicalStorageEnv === 'frozen';
  const coldChain = route.coldChain || commodity.typicalStorageEnv === 'frozen' || commodity.typicalStorageEnv === 'refrigerated';
  const longHaul = route.distanceKm > 400 || route.durationDays >= 2;

  const linerFlags = { moistureSensitive, respiring, liquid, fragile, awLow };
  const innerLiners = INNER_COMPONENTS.filter((c) => c.whenRequired(linerFlags));

  // ——— FORMAT SELECTION (hard filters first) ———
  const formatRejections: { name: string; because: string }[] = [];
  const formatScores = new Map<string, number>();
  for (const f of PACKAGING_FORMATS) {
    // HARD constraints — violated formats are rejected, not down-scored
    if (liquid && (!f.liquidSuitable || f.leakResistance !== 'high')) {
      formatRejections.push({ name: f.name, because: f.liquidSuitable ? `Liquid food requires high leak resistance; ${f.name} rated ${f.leakResistance}.` : `${f.name} cannot hold a free-pouring liquid (not liquid-suitable).` });
      continue;
    }
    if (respiring && f.ventilationCapability === 'low' && f.category !== 'rigid') {
      formatRejections.push({ name: f.name, because: `Respiring produce needs gas exchange; fully sealed ${f.name} risks anaerobic collapse.` });
      continue;
    }
    if (f.foodCompatibility.length && !f.foodCompatibility.includes(commodity.category)) {
      formatRejections.push({ name: f.name, because: `Format's typical applications do not cover '${commodity.category}' foods.` });
      continue;
    }
    if (frozen && f.compatibleMaterialIds.every((m) => !['pp', 'ldpe', 'pet', 'pa', 'multi-3layer'].includes(m))) {
      formatRejections.push({ name: f.name, because: 'Frozen storage needs freezer-capable films (PP/PE/PET/PA).' });
      continue;
    }

    // SOFT scoring
    let s = 50;
    if (respiring && f.ventilationCapability === 'high') s += 30;
    if (respiring && f.id === 'fmt-map-pouch') s += 15;
    if (fragile && (f.id === 'fmt-clamshell' || f.id === 'fmt-ventilated-crate' || f.id === 'fmt-tray')) s += 15;
    if (moistureSensitive && f.leakResistance === 'high') s += 10;
    if (oxygenSensitive && f.leakResistance === 'high') s += 10;
    if (lightSensitive && ['fmt-can-tin', 'fmt-bottle'].includes(f.id)) s += 8;
    if (liquid && f.liquidSuitable) s += 20;
    if (frozen && ['fmt-bag-frozen', 'fmt-pillow-pouch', 'fmt-woven-bag'].includes(f.id)) s += 10;
    if (longHaul && f.stackability === 'high') s += 8;
    if (quantityKg > 100 && ['fmt-woven-bag', 'fmt-bulk-bag', 'fmt-ventilated-crate'].includes(f.id)) s += 15;
    if (quantityKg <= 10 && ['fmt-sachet', 'fmt-pillow-pouch', 'fmt-standup-pouch', 'fmt-clamshell'].includes(f.id)) s += 10;
    formatScores.set(f.id, s);
  }

  function bestFormatFor(priority: SolutionPriority): { fmt: PackagingFormat; rejected: { name: string; because: string }[] } {
    const ranked = PACKAGING_FORMATS.filter((f) => formatScores.has(f.id)).sort((a, b) => (formatScores.get(b.id)! - formatScores.get(a.id)!));
    if (priority === 'min_cost') {
      const cheap = ranked.filter((f) => f.category === 'flexible');
      if (cheap.length) return { fmt: cheap[0], rejected: formatRejections };
    }
    if (priority === 'max_sustainability') {
      const paperish = ranked.filter((f) => f.compatibleMaterialIds.some((m) => ['paper', 'pla', 'biodeg-starch', 'jute'].includes(m)));
      if (paperish.length) return { fmt: paperish[0], rejected: formatRejections };
    }
    return { fmt: ranked[0], rejected: formatRejections };
  }

  function pickMaterial(fmt: PackagingFormat, priority: SolutionPriority): PackagingMaterial {
    const compatible = fmt.compatibleMaterialIds.map((id) => ctx.materials.find((m) => m.id === id)).filter(Boolean) as PackagingMaterial[];
    // Score compatible materials with the EXISTING engine logic (balanced profile)
    const scored = compatible
      .map((m) => {
        const rec = base.recommendations.balanced.find((r) => r.material.id === m.id);
        return { m, score: rec ? rec.score.total : 40 };
      })
      .sort((a, b) => b.score - a.score);
    if (priority === 'max_sustainability') {
      const greenFirst = scored.find((x) => ['paper', 'pla', 'jute', 'biodeg-starch', 'glass'].includes(x.m.id));
      if (greenFirst) return greenFirst.m;
    }
    if (priority === 'min_cost') {
      const cheap = [...scored].sort((a, b) => a.m.costInrPerM2.value - b.m.costInrPerM2.value);
      if (cheap.length && cheap[0].m.costInrPerM2.value <= scored[0].m.costInrPerM2.value * 1.3) return cheap[0].m;
    }
    return scored[0]?.m ?? ctx.materials[0];
  }

  function pickClosure(fmt: PackagingFormat, material: PackagingMaterial): Closure | null {
    const cands = CLOSURES.filter(
      (c) => c.compatibleFormatIds.includes(fmt.id) && (c.compatibleMaterialIds.length === 0 || c.compatibleMaterialIds.includes(material.id)),
    );
    if (!cands.length) return null;
    const ranked = [...cands].sort((a, b) => {
      let sa = 0, sb = 0;
      if (liquid) { sa += LEVEL_ORDER[a.leakResistance]; sb += LEVEL_ORDER[b.leakResistance]; }
      if (moistureSensitive) { sa += a.resealable ? 1 : 0; sb += b.resealable ? 1 : 0; }
      sa += a.tamperEvidence ? 0.5 : 0; sb += b.tamperEvidence ? 0.5 : 0;
      return sb - sa;
    });
    return ranked[0];
  }

  function pickSealing(fmt: PackagingFormat, material: PackagingMaterial): SealingMethod | null {
    const cands = SEALING_METHODS.filter(
      (s) => (s.compatibleMaterialIds.length === 0 || s.compatibleMaterialIds.includes(material.id)) && (s.compatibleFormatIds.length === 0 || s.compatibleFormatIds.includes(fmt.id)),
    );
    if (!cands.length) return null;
    const ranked = [...cands].sort((a, b) => {
      let sa = 0, sb = 0;
      if (liquid) { sa += LEVEL_ORDER[a.hermeticPotential]; sb += LEVEL_ORDER[b.hermeticPotential]; }
      if (oxygenSensitive) { sa += LEVEL_ORDER[a.hermeticPotential] * 0.5; sb += LEVEL_ORDER[b.hermeticPotential] * 0.5; }
      return sb - sa;
    });
    return ranked[0];
  }

  function pickSecondary(fmt: PackagingFormat, priority: SolutionPriority): SecondaryPackaging | null {
    // Local tiny-quantity deliveries may skip secondary entirely
    if (quantityKg <= 5 && !longHaul && fmt.category !== 'flexible') return null;
    const cands = SECONDARY_PACKAGING.filter((s) => {
      if (coldChain && s.id === 'sec-insulated-liner') return true;
      if (fmt.category === 'flexible') return ['sec-corrugated', 'sec-folding-carton', 'sec-shrink-wrap', 'sec-multipack', 'sec-crate-plastic'].includes(s.id);
      return ['sec-corrugated', 'sec-dividers', 'sec-crate-plastic', 'sec-crate-wood', 'sec-tray-board'].includes(s.id);
    });
    const ranked = [...cands].sort((a, b) => {
      let sa = 0, sb = 0;
      sa += LEVEL_ORDER[a.protection] * 2 + LEVEL_ORDER[a.stackability] * (longHaul ? 2 : 1) + LEVEL_ORDER[a.moistureResistance] * (moistureSensitive ? 1 : 0);
      sb += LEVEL_ORDER[b.protection] * 2 + LEVEL_ORDER[b.stackability] * (longHaul ? 2 : 1) + LEVEL_ORDER[b.moistureResistance] * (moistureSensitive ? 1 : 0);
      if (priority === 'max_sustainability') { sa += LEVEL_ORDER[a.reusePotential]; sb += LEVEL_ORDER[b.reusePotential]; }
      if (fragile && a.id === 'sec-dividers') sa += 3;
      if (fragile && b.id === 'sec-dividers') sb += 3;
      return sb - sa;
    });
    return ranked[0] ?? null;
  }

  function pickTertiary(priority: SolutionPriority): TertiaryPackaging | null {
    if (!longHaul && quantityKg <= 20) return null;
    const cands = TERTIARY_PACKAGING.filter((t) => {
      if (coldChain) return t.coldChainSuitable;
      return true;
    });
    const ranked = [...cands].sort((a, b) => {
      let sa = 0, sb = 0;
      sa += LEVEL_ORDER[a.mechanicalProtection] + LEVEL_ORDER[a.stackability] * (longHaul ? 1.5 : 0.5) + LEVEL_ORDER[a.temperatureProtection] * (coldChain ? 2 : 0);
      sb += LEVEL_ORDER[b.mechanicalProtection] + LEVEL_ORDER[b.stackability] * (longHaul ? 1.5 : 0.5) + LEVEL_ORDER[b.temperatureProtection] * (coldChain ? 2 : 0);
      if (priority === 'max_sustainability') { sa += LEVEL_ORDER[a.reusability] * 1.5; sb += LEVEL_ORDER[b.reusability] * 1.5; }
      return sb - sa;
    });
    return ranked[0] ?? null;
  }

  function buildOption(priority: SolutionPriority): CompletePackagingSolution {
    const { fmt, rejected } = bestFormatFor(priority);
    const material = pickMaterial(fmt, priority);
    const closure = pickClosure(fmt, material);
    const sealing = pickSealing(fmt, material);
    const secondary = pickSecondary(fmt, priority);
    const tertiary = pickTertiary(priority);

    const reasons: string[] = [];
    reasons.push(`Format: ${fmt.name} — ${fmt.description}`);
    if (respiring) reasons.push(fmt.ventilationCapability === 'high' ? 'High ventilation matches the produce\'s respiration-driven gas-exchange requirement.' : 'Sealed format chosen with MAP-compatible film (OTR window), not ventilation.');
    if (liquid) reasons.push('High leak resistance format + hermetic sealing because the food is a liquid.');
    if (moistureSensitive) reasons.push('Moisture-barrier capability prioritised: the food is hygroscopic/moisture-sensitive.');
    if (oxygenSensitive) reasons.push('High oxygen-barrier candidate selected (fat-rich/oxidation-sensitive food).');
    if (lightSensitive) reasons.push('Opaque/protective format preferred because the food is light-sensitive.');
    if (coldChain) reasons.push('Cold-chain-compatible components selected for this storage/transport temperature.');
    if (secondary) reasons.push(`Secondary: ${secondary.name} — ${secondary.description}`);
    if (tertiary) reasons.push(`Tertiary: ${tertiary.name} — ${tertiary.description}`);
    for (const l of innerLiners) reasons.push(`Inner: ${l.name} — ${l.purpose}`);

    const matRec = base.recommendations.balanced.find((r) => r.material.id === material.id);
    const tradeoffs: string[] = [];
    if (material.limitations?.length) tradeoffs.push(`${material.name.split(' (')[0]}: ${material.limitations[0].toLowerCase()}.`);
    if (fmt.resealability === 'low') tradeoffs.push(`${fmt.name} is single-use (low resealability) — portioning happens at opening.`);
    if (fmt.ventilationCapability === 'high') tradeoffs.push('Ventilated formats offer little barrier against external moisture/odours.');
    if (priority === 'min_cost') tradeoffs.push('Cost-optimised: protection margin is thinner than the balanced option — validate with a trial shipment.');
    if (priority === 'max_sustainability') tradeoffs.push('Sustainability-first: barrier/performance may be lower than plastic laminates; shelf-life impact should be validated.');
    if (matRec?.score.infeasible.length) tradeoffs.push(`Known infeasibilities: ${matRec.score.infeasible.join('; ')}.`);

    // Failure risks on the COMPLETE configuration (model proxies)
    const failureRisks: SolutionFailureRisk[] = [];
    for (const fm of base.failureModes ?? []) {
      failureRisks.push({ risk: fm.name, level: fm.severity, cause: fm.mechanism, impact: fm.explanation, mitigation: fm.mitigation });
    }
    if (secondary && LEVEL_ORDER[secondary.moistureResistance] === 0 && moistureSensitive && !innerLiners.some((l) => l.id === 'inner-moisture-barrier')) {
      failureRisks.push({ risk: 'Secondary-pack moisture pickup', level: 'medium', cause: `${secondary.name} has low moisture resistance (paper-based).`, impact: 'Carton softening can crush primary packs in humid transit.', mitigation: 'Pallet wrap or PE-lined carton; keep off wet floors.' });
    }
    if (longHaul && fmt.stackability === 'low') {
      failureRisks.push({ risk: 'Stacking failure in transit', level: 'medium', cause: 'Primary format does not stack and the journey is long.', impact: 'Units at the bottom of loose loads can deform.', mitigation: 'Use a stacking secondary (crate/carton) and palletise.' });
    }
    if (coldChain && !route.coldChain && !frozen) {
      failureRisks.push({ risk: 'Cold-chain gap', level: 'medium', cause: 'Food needs refrigerated storage but the route leg is not cold-chain.', impact: 'Shelf life consumed faster than the model assumes.', mitigation: 'Choose reefer transport or an insulated tertiary option.' });
    }

    // Cost & sustainability: aggregate across layers (relative, demo logic)
    const costPoints =
      (fmt.category === 'rigid' ? 2 : fmt.category === 'specialized' ? 1 : 0) +
      (['glass', 'aluminium', 'steel', 'multi-3layer', 'foil-lam'].includes(material.id) ? 2 : ['pet', 'pp', 'pa'].includes(material.id) ? 1 : 0) +
      (closure?.id === 'clo-induction' || closure?.id === 'clo-screw-cap' ? 1 : 0) +
      (secondary ? 1 : 0) + (tertiary ? 1 : 0) + innerLiners.length * 0.5;
    const estimatedCostCategory: Level = costPoints >= 5 ? 'high' : costPoints >= 3 ? 'medium' : 'low';

    const sustainPoints =
      (['paper', 'pla', 'jute', 'biodeg-starch', 'glass'].includes(material.id) ? 3 : ['hdpe', 'pp', 'ldpe'].includes(material.id) ? 1.5 : 0) +
      (material.recyclability === 'widely' ? 2 : material.recyclability === 'limited' ? 0.5 : 0) +
      (secondary?.reusePotential === 'high' ? 1 : 0) + (tertiary?.reusability === 'high' ? 1 : 0) +
      (fmt.category === 'flexible' && material.recyclability !== 'widely' ? -1 : 0);
    // Plastic-film primaries cap the indicator at MEDIUM unless the material is
    // genuinely green (paper/PLA/jute/biodegradable) — honest relative labelling.
    const greenMaterial = ['paper', 'pla', 'jute', 'biodeg-starch', 'glass'].includes(material.id);
    const sustainabilityIndicator: Level =
      sustainPoints >= 5 && greenMaterial ? 'high' : sustainPoints >= 2.5 ? 'medium' : 'low';

    const transportRisk: Level = route.source === 'assumption' && route.distanceKm > 800 ? 'medium' : route.durationDays >= 3 ? 'high' : route.durationDays >= 1.5 || route.handlingPoints >= 3 ? 'medium' : 'low';

    const confidence: 'high' | 'medium' | 'low' = !matRec || matRec.score.infeasible.length ? 'low' : Object.values(props).filter((v) => v === undefined).length > 2 ? 'medium' : matRec.score.total > 70 ? 'high' : 'medium';

    const hierarchy: LayerDetail[] = [
      { level: 'product', name: commodity.name, material: '—', purpose: 'The food being protected', protection: 'low', riskNote: commodity.notes ?? '', relativeCost: 'low', sustainability: 'medium', source: 'Commodity database' },
      { level: 'primary', name: fmt.name, material: material.name.split(' (')[0] + (closure ? ` + ${closure.name}` : ''), purpose: fmt.description, protection: fmt.leakResistance === 'high' ? 'high' : fmt.leakResistance, riskNote: fmt.ventilationCapability === 'high' ? 'Ventilated: watch external moisture.' : 'Sealed: verify OTR/moisture fit for this food.', relativeCost: fmt.category === 'rigid' ? 'high' : 'medium', sustainability: ['fmt-woven-bag', 'fmt-jar', 'fmt-tray'].includes(fmt.id) ? 'medium' : 'medium', source: `${fmt.source}` },
      ...(secondary ? [{ level: 'secondary' as const, name: secondary.name, material: secondary.material, purpose: secondary.description, protection: secondary.protection, riskNote: LEVEL_ORDER[secondary.moistureResistance] === 0 ? 'Paper-based: moisture pickup in humid transit.' : 'Standard transit protection.', relativeCost: 'medium' as Level, sustainability: secondary.reusePotential === 'high' ? ('high' as Level) : ('medium' as Level), source: secondary.source }] : []),
      ...(tertiary ? [{ level: 'tertiary' as const, name: tertiary.name, material: tertiary.material, purpose: tertiary.description, protection: tertiary.mechanicalProtection, riskNote: coldChain ? 'Cold-chain suitable selection.' : 'Not temperature-protective by itself.', relativeCost: 'medium' as Level, sustainability: tertiary.reusability === 'high' ? ('high' as Level) : ('low' as Level), source: tertiary.source }] : []),
      { level: 'transport', name: route.coldChain ? 'Refrigerated transport (reefer)' : modeLabel(route.mode), material: '—', purpose: `${route.origin} → ${route.destination}, ${route.distanceKm} km, ~${route.durationDays} d`, protection: transportRisk === 'high' ? 'low' : transportRisk === 'medium' ? 'medium' : 'high', riskNote: route.source === 'assumption' ? 'Route metrics are demo assumptions (router unavailable).' : 'Router-derived route metrics (OSRM).', relativeCost: route.coldChain ? 'high' : 'medium', sustainability: route.mode === 'sea' ? 'high' : route.mode === 'air' ? 'low' : 'medium', source: 'Route Intelligence engine' },
    ];

    const score = (matRec?.score.total ?? 50) + (sustainabilityIndicator === 'high' ? 2 : 0) - (estimatedCostCategory === 'high' && priority === 'min_cost' ? 2 : 0);

    return {
      optionId: priority === 'min_cost' ? 'low_cost' : priority === 'max_sustainability' ? 'sustainability' : 'balanced',
      optionLabel: priority === 'balanced' ? 'OPTION 1 — Balanced' : priority === 'min_cost' ? 'OPTION 2 — Low Cost' : 'OPTION 3 — Sustainability Focused',
      food: { id: commodity.id, name: commodity.name, category: commodity.category },
      quantityKg,
      primaryPackaging: { formatId: fmt.id, formatName: fmt.name, category: fmt.category, description: fmt.description },
      materialStructure: {
        materialId: material.id,
        materialName: material.name,
        structure: structureLabel(material),
        layers: structureLayers(material),
      },
      thickness: material.thicknessUmRange ? { um: Math.round((material.thicknessUmRange[0] + material.thicknessUmRange[1]) / 2), note: `Typical range ${material.thicknessUmRange[0]}–${material.thicknessUmRange[1]} µm (reference data)` } : null,
      closure: closure ? { id: closure.id, name: closure.name, resealable: closure.resealable, tamperEvidence: closure.tamperEvidence } : null,
      sealingMethod: sealing ? { id: sealing.id, name: sealing.name, hermeticPotential: sealing.hermeticPotential, equipment: sealing.equipmentRequirement } : null,
      innerLiners: innerLiners.map((l) => ({ id: l.id, name: l.name, purpose: l.purpose })),
      secondaryPackaging: secondary ? { id: secondary.id, name: secondary.name, material: secondary.material, protection: secondary.protection } : null,
      tertiaryPackaging: tertiary ? { id: tertiary.id, name: tertiary.name, temperatureProtection: tertiary.temperatureProtection, reusability: tertiary.reusability } : null,
      transportMode: route.coldChain ? 'Refrigerated truck (reefer)' : modeLabel(route.mode),
      storageCondition: `${commodity.typicalStorageEnv} · ${commodity.storageTempRangeC[0]}–${commodity.storageTempRangeC[1]} °C · ${commodity.storageRhRangePct[0]}–${commodity.storageRhRangePct[1]}% RH`,
      temperatureCondition: `${commodity.storageTempRangeC[0]}–${commodity.storageTempRangeC[1]} °C`,
      humidityCondition: `${commodity.storageRhRangePct[0]}–${commodity.storageRhRangePct[1]}% RH`,
      estimatedCostCategory,
      sustainabilityIndicator,
      transportRisk,
      failureRisks,
      recommendationReasons: reasons,
      tradeoffs,
      rejectedCandidates: rejected.slice(0, 6),
      confidence,
      dataProvenance: { source: 'NutriPack demo/reference databases + existing material engine', sourceType: 'demo', note: 'All compatibility knowledge is demo data; material figures are reference values. Validate with pack trials.' },
      hierarchy,
      score: Math.round(score * 10) / 10,
    };
  }

  return {
    solutions: [buildOption('balanced'), buildOption('min_cost'), buildOption('max_sustainability')],
    base,
  };
}

function modeLabel(mode: RouteSpec['mode']): string {
  return { road: 'Truck (road)', rail: 'Rail', air: 'Air freight', sea: 'Sea freight', none: 'No transport (on-site)' }[mode];
}

function structureLabel(m: PackagingMaterial): string {
  if (m.id === 'multi-3layer') return 'PET/PP 3-layer laminate';
  if (m.id === 'foil-lam') return 'PET/AL/PE laminate';
  if (m.id === 'met-pet') return 'PET/MetPET/PE laminate';
  if (m.id === 'paper') return 'Paper (single layer)';
  if (m.id === 'glass') return 'Glass (monolithic)';
  if (m.id === 'aluminium' || m.id === 'steel') return 'Metal (monolithic)';
  if (m.id === 'jute') return 'Jute weave (+ liner if required)';
  return m.name.split(' (')[0];
}

function structureLayers(m: PackagingMaterial): { material: string; purpose: string; barrierRole: string }[] {
  switch (m.id) {
    case 'multi-3layer':
      return [
        { material: 'PET', purpose: 'mechanical support + print surface', barrierRole: 'moderate gas barrier' },
        { material: 'tie/adhesive', purpose: 'bonds dissimilar layers', barrierRole: '—' },
        { material: 'PP', purpose: 'seal + food-contact layer', barrierRole: 'moisture barrier' },
      ];
    case 'foil-lam':
      return [
        { material: 'PET', purpose: 'mechanical support', barrierRole: 'moderate' },
        { material: 'AL foil', purpose: 'barrier core', barrierRole: 'near-complete O₂/moisture/light' },
        { material: 'PE', purpose: 'seal/contact layer', barrierRole: 'moisture' },
      ];
    case 'met-pet':
      return [
        { material: 'PET', purpose: 'mechanical support', barrierRole: 'moderate' },
        { material: 'MetPET', purpose: 'barrier + light block', barrierRole: 'very high, opaque' },
        { material: 'PE', purpose: 'seal/contact layer', barrierRole: 'moisture' },
      ];
    case 'paper':
    case 'jute':
      return [{ material: m.id === 'paper' ? 'Paper' : 'Jute', purpose: 'structure + breathability', barrierRole: 'low — add liner for moisture-sensitive fills' }];
    case 'glass':
      return [{ material: 'Glass', purpose: 'rigid inert wall', barrierRole: 'near-perfect' }];
    case 'aluminium':
    case 'steel':
      return [{ material: m.id === 'steel' ? 'Tinplate steel' : 'Aluminium', purpose: 'rigid hermetic wall', barrierRole: 'complete' }];
    default:
      return [{ material: m.name.split(' (')[0], purpose: 'single-layer film', barrierRole: m.oxygenBarrier >= 0.8 ? 'high O₂ barrier' : m.oxygenBarrier >= 0.4 ? 'moderate' : 'low' }];
  }
}
