import type {
  AnalysisInput,
  AnalysisResult,
  ComparisonRow,
  DigitalTwinState,
  FoodCommodity,
  FoodProperties,
  JudgeExplanation,
  MapAdvice,
  PackagingMaterial,
  PackagingRequirements,
  Recommendation,
  RecommendationReason,
  StorageInput,
  StructureLayer,
  TransportInput,
} from '../domain/types';
import { COMMODITIES, MATERIALS } from '../domain/referenceData';
import { deriveRequirements } from './requirements';
import { applyModeWeights, scoreMaterial, type ScoreWeights } from './scoring';
import { estimateShelfLife } from './shelfLife';
import { simulateMap } from './map';
import { assessTransport } from './transport';
import { assessSustainability, estimateWasteEconomics } from './sustainability';
import { classifyFailureModes, buildRiskTimeline } from './failureModes';
import { clamp, round } from './util';

/**
 * AI RECOMMENDATION PIPELINE
 * INPUT → validate → property analysis → requirement generation → candidate
 * filtering → weighted scoring → multi-objective optimization → explanation.
 *
 * The LLM plays NO role in producing scientific values. Recommendations
 * originate from structured data + rules + scoring + optimization only.
 */

export interface EngineContext {
  commodities: FoodCommodity[];
  materials: PackagingMaterial[];
  weights?: ScoreWeights;
}

export const PROFILES = ['cost', 'shelf', 'sustainability', 'transport', 'balanced'] as const;
export type ProfileKey = (typeof PROFILES)[number];

export const profileLabel: Record<ProfileKey, string> = {
  cost: 'Cost Optimized',
  shelf: 'Shelf-Life Optimized',
  sustainability: 'Sustainability Optimized',
  transport: 'Transport-Durability Optimized',
  balanced: 'Balanced',
};

export const priorityToProfile: Record<AnalysisInput['priority'], ProfileKey> = {
  max_shelf_life: 'shelf',
  min_cost: 'cost',
  max_sustainability: 'sustainability',
  transport_durability: 'transport',
  balanced: 'balanced',
};

export function resolveProperties(commodity: FoodCommodity, overrides?: Partial<FoodProperties>): FoodProperties {
  const p = { ...commodity.properties, ...(overrides ?? {}) };
  return p;
}

export function defaultStorage(commodity: FoodCommodity): StorageInput {
  const [tLo, tHi] = commodity.storageTempRangeC;
  const [rLo, rHi] = commodity.storageRhRangePct;
  return {
    temperatureC: (tLo + tHi) / 2,
    rhPct: (rLo + rHi) / 2,
    targetShelfLifeDays: Math.max(7, Math.round(commodity.indicativeShelfLifeDays.value * 1.2)),
    environment: commodity.typicalStorageEnv,
  };
}

export function defaultTransport(): Partial<TransportInput> {
  return {
    origin: 'Delhi',
    destination: 'Jaipur',
    distanceKm: 280,
    mode: 'road',
    durationDays: 1,
    expectedTempC: 20,
    expectedRhPct: 60,
    coldChain: false,
  };
}

export function defaultBusiness(): AnalysisInput['business'] {
  return { packageSizeGrams: 1000, productionVolumePerMonth: 10000 };
}

/** Validate input; never invent missing scientific data — flag gaps instead. */
export function validateInput(input: AnalysisInput, commodities: FoodCommodity[]): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const storage = input.storage ?? {};
  const business = input.business ?? {};
  if (!input.commodityId) errors.push('commodityId is required');
  const commodity = commodities.find((c) => c.id === input.commodityId);
  if (!commodity) {
    errors.push(`Unknown commodity '${input.commodityId}'. Pick one from /api/foods.`);
    return { ok: false, errors, warnings };
  }
  if (storage.temperatureC !== undefined && (storage.temperatureC < -25 || storage.temperatureC > 55)) {
    errors.push('storage.temperatureC must be between -25 and 55 °C');
  }
  if (storage.rhPct !== undefined && (storage.rhPct < 1 || storage.rhPct > 100)) {
    errors.push('storage.rhPct must be between 1 and 100 %');
  }
  if (storage.targetShelfLifeDays !== undefined && (storage.targetShelfLifeDays < 1 || storage.targetShelfLifeDays > 1095)) {
    errors.push('storage.targetShelfLifeDays must be 1..1095');
  }
  if (business.packageSizeGrams !== undefined && (business.packageSizeGrams <= 0 || business.packageSizeGrams > 100000)) {
    errors.push('business.packageSizeGrams must be 1..100000 g');
  }
  if (storage.temperatureC === undefined) warnings.push('Storage temperature not provided — commodity typical midpoint used; provide a measured value for better estimates.');
  if (storage.rhPct === undefined) warnings.push('Relative humidity not provided — typical midpoint used.');
  if (commodity.properties.waterActivity === undefined) warnings.push('Water activity unknown — aw≈0.90 assumed for requirement derivation.');
  return { ok: errors.length === 0, errors, warnings };
}

interface CandidateScore {
  material: PackagingMaterial;
  total: number;
  breakdown: ReturnType<typeof scoreMaterial>['breakdown'];
  infeasible: string[];
}

/** Build a full Recommendation (shelf life, cost, sustainability, transport, reasons) for one candidate. */
function buildRecommendation(
  cand: CandidateScore,
  commodity: FoodCommodity,
  props: FoodProperties,
  requirements: PackagingRequirements,
  storage: StorageInput,
  transport: Partial<TransportInput>,
  packageSizeGrams: number,
  profile: ProfileKey,
): Recommendation {
  const shelfLife = estimateShelfLife({
    commodity, props, storage, material: cand.material,
    oxygenFit: cand.breakdown.otrSuitability / 100,
    moistureFit: cand.breakdown.wvtrSuitability / 100,
    materialOtr: cand.material.otrCm3M2Day.value,
    requiredOtrMax: requirements.otrMax,
    requiredOtrMin: requirements.otrMin,
    materialWvtr: cand.material.wvtrGm2Day.value,
    requiredWvtrMax: requirements.wvtrMax,
  });

  // Cost model: area × cost/m² + conversion overhead, thickness-sensitive
  const areaM2 = Math.max(0.02, (packageSizeGrams / 1000) * 0.06);
  const midThickness = (cand.material.thicknessUmRange[0] + cand.material.thicknessUmRange[1]) / 2;
  const costPerPackage = round(
    cand.material.costInrPerM2.value * areaM2 * (0.8 + 0.4 * (midThickness / 50)) + 0.35,
    2,
  );
  const sustainability = assessSustainability(cand.material, packageSizeGrams, shelfLife, commodity);
  const transportAssessment = assessTransport(
    { origin: transport.origin!, destination: transport.destination!, distanceKm: transport.distanceKm!, mode: transport.mode!, durationDays: transport.durationDays!, expectedTempC: transport.expectedTempC!, expectedRhPct: transport.expectedRhPct!, coldChain: transport.coldChain! },
    commodity, props, cand.material,
  );

  return {
    rank: 0,
    mode: profile,
    material: cand.material,
    score: {
      materialId: cand.material.id,
      total: cand.total,
      breakdown: cand.breakdown,
      infeasible: cand.infeasible ?? [],
      estimatedShelfLifeDays: [shelfLife.daysLow, shelfLife.daysHigh],
      estimatedCostPerPackageInr: costPerPackage,
      sustainabilityScore: sustainability.total,
      transportSuitability: transportAssessment.suitability,
      mapSuitable: cand.material.mapSuitable,
    },
    reasons: buildReasons(cand.material, requirements, storage, shelfLife, cand),
    structureLayers: buildStructure(cand.material, requirements),
    mapAdvice: mapAdviceFor(props, cand.material, requirements, storage),
  };
}

function scoreAll(
  ctx: EngineContext,
  commodity: FoodCommodity,
  props: FoodProperties,
  requirements: PackagingRequirements,
  storage: StorageInput,
  transport: Partial<TransportInput>,
  profile: ProfileKey,
  budgetInr?: number,
): CandidateScore[] {
  return ctx.materials
    .map((material) => {
      const r = scoreMaterial(material, commodity, props, requirements, storage, transport, ctx.weights, { mode: profile, budgetInr });
      return { material, total: r.total, breakdown: r.breakdown, infeasible: r.infeasible };
    })
    .sort((a, b) => b.total - a.total);
}

function barrierFitFor(material: PackagingMaterial, requirements: PackagingRequirements): number {
  const oFit = requirements.otrMin
    ? (material.otrCm3M2Day.value >= requirements.otrMin && material.otrCm3M2Day.value <= requirements.otrMax ? 1 : material.otrCm3M2Day.value > requirements.otrMax ? 0.4 : 0.15)
    : clamp(1 - Math.log10(Math.max(material.otrCm3M2Day.value, 0.5) / requirements.otrMax) / 3, 0.05, 1);
  const mFit = clamp(1 - Math.log10(Math.max(material.wvtrGm2Day.value, 0.1) / requirements.wvtrMax) / 3, 0.05, 1);
  return clamp(0.55 * oFit + 0.45 * mFit);
}

function buildReasons(
  material: PackagingMaterial,
  requirements: PackagingRequirements,
  storage: StorageInput,
  shelfLife: { daysLow: number; daysHigh: number },
  score: CandidateScore,
): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  const push = (verdict: 'pro' | 'con', text: string) => reasons.push({ verdict, text });

  if (material.moistureBarrier >= requirements.moistureBarrierMin) {
    push('pro', `Suitable moisture barrier (${Math.round(material.moistureBarrier * 100)}% ≥ required ${Math.round(requirements.moistureBarrierMin * 100)}%).`);
  } else push('con', `Moisture barrier below derived requirement for ${storage.rhPct}% RH conditions.`);

  const otrOk = requirements.otrMin
    ? material.otrCm3M2Day.value >= requirements.otrMin
    : material.otrCm3M2Day.value <= requirements.otrMax;
  if (otrOk) {
    push('pro', requirements.otrMin ? `Gas exchange within MAP window (OTR ${material.otrCm3M2Day.value} cm³/m²·day ∈ [${requirements.otrMin}, ${requirements.otrMax}]).` : `Sufficient O₂ barrier (OTR ${material.otrCm3M2Day.value} ≤ ${requirements.otrMax} cm³/m²·day).`);
  } else {
    push('con', requirements.otrMin ? `Gas exchange below respiration demand — anaerobic risk.` : `O₂ ingress too high for this oxygen-sensitive product.`);
  }

  if (shelfLife.daysHigh >= storage.targetShelfLifeDays) {
    push('pro', `Target shelf life (${storage.targetShelfLifeDays} days) achievable: model estimates ${shelfLife.daysLow}–${shelfLife.daysHigh} days under selected conditions.`);
  } else if (shelfLife.daysLow >= storage.targetShelfLifeDays * 0.8) {
    push('con', `Model estimates ${shelfLife.daysLow}–${shelfLife.daysHigh} days — near but below the ${storage.targetShelfLifeDays}-day target; consider MAP or temperature reduction.`);
  } else {
    push('con', `Model estimates ${shelfLife.daysLow}–${shelfLife.daysHigh} days — below the ${storage.targetShelfLifeDays}-day target even with this material; revise temperature/atmosphere strategy.`);
  }

  if (storage.temperatureC >= material.tempRangeC[0] && storage.temperatureC <= material.tempRangeC[1]) {
    push('pro', `Compatible with storage temperature (${material.tempRangeC[0]}…${material.tempRangeC[1]}°C).`);
  } else push('con', `Storage temperature outside material service range.`);

  if (material.sealable) push('pro', 'Heat-sealable — supports hermetic sealing.');
  if (material.recyclability === 'widely') push('pro', 'Widely recyclable material stream.');
  if (material.recyclability === 'rare' || material.recyclability === 'not') {
    push('con', 'End-of-life: limited recycling pathways (model assumption).');
  }
  if (score.infeasible.length) push('con', `Hard constraints: ${score.infeasible.join('; ')}.`);
  return reasons;
}

function buildStructure(material: PackagingMaterial, requirements: PackagingRequirements): StructureLayer[] {
  if (material.category === 'multilayer' || material.category === 'foil-laminate' || material.category === 'metallized') {
    const t = material.thicknessUmRange[0];
    if (material.category === 'foil-laminate') {
      return [
        { name: 'Outer layer', material: 'PET (12 µm, printed)', thicknessUm: 12, role: 'Mechanical protection + print substrate' },
        { name: 'Barrier layer', material: 'Aluminium foil (9–12 µm)', thicknessUm: 10, role: 'Complete O₂/moisture/light barrier' },
        { name: 'Sealing layer', material: 'LDPE sealant', thicknessUm: t, role: 'Hermetic heat seal, food contact' },
        { name: 'FOOD', material: '—', thicknessUm: 0, role: 'Product contact surface' },
      ];
    }
    if (material.category === 'metallized') {
      return [
        { name: 'Outer layer', material: 'MET-PET (metallized)', thicknessUm: 12, role: 'Light block + high barrier' },
        { name: 'Sealing layer', material: 'LLDPE sealant', thicknessUm: t, role: 'Hermetic heat seal, food contact' },
        { name: 'FOOD', material: '—', thicknessUm: 0, role: 'Product contact surface' },
      ];
    }
    return [
      { name: 'Outer layer', material: 'PET', thicknessUm: 12, role: 'Strength + print' },
      { name: 'Barrier layer', material: 'PP/functional layer', thicknessUm: Math.round(t * 0.6), role: 'Moisture + O₂ barrier' },
      { name: 'Sealing layer', material: 'PP sealant', thicknessUm: Math.round(t * 0.4), role: 'Heat seal, food contact' },
      { name: 'FOOD', material: '—', thicknessUm: 0, role: 'Product contact surface' },
    ];
  }
  if (material.category === 'microperforated') {
    return [
      { name: 'Film layer', material: `${material.name} (perforation Ø≈80–200 µm)`, thicknessUm: material.thicknessUmRange[0], role: 'High gas exchange via perforations' },
      { name: 'FOOD', material: '—', thicknessUm: 0, role: 'Product contact surface' },
    ];
  }
  return [
    { name: 'Single film', material: material.name.split(' (')[0], thicknessUm: material.thicknessUmRange[0], role: material.sealable ? 'Barrier + heat seal' : 'Barrier (fold/wrap closure)' },
    { name: 'FOOD', material: '—', thicknessUm: 0, role: 'Product contact surface' },
  ];
}

function mapAdviceFor(props: FoodProperties, material: PackagingMaterial, requirements: PackagingRequirements, storage: StorageInput): MapAdvice | null {
  const respiring = (props.respirationRateMgCo2KgH ?? 0) > 0.5;
  if (!respiring) return null;
  const suitable = material.mapSuitable;
  const perfRecommended = material.category === 'microperforated' || (material.otrCm3M2Day.value < (requirements.otrMin ?? 0));
  return {
    suitable,
    initialO2Pct: 21,
    initialCo2Pct: 0,
    targetO2Pct: [2, 8],
    targetCo2Pct: [3, 10],
    perforationRecommended: perfRecommended,
    notes: suitable
      ? perfRecommended
        ? 'Micro-perforation recommended: film alone cannot match respiration demand without anoxic risk.'
        : 'Film permeability in modelled balance with respiration at the selected temperature.'
      : 'Material not MAP-suitable; consider MAP-capable films for active atmosphere management.',
  };
}

function buildJudgeExplanation(commodity: FoodCommodity, primary: Recommendation, shelfLife: { daysLow: number; daysHigh: number }): JudgeExplanation {
  return {
    what: `Recommended packaging: ${primary.material.name} at ${primary.score.estimatedCostPerPackageInr}/pack (model estimate) for ${commodity.name}.`,
    why: 'Material was selected because its barrier properties (OTR, WVTR), temperature range and structure match the packaging requirements derived from the food properties, storage and transport inputs.',
    how: 'Hybrid AI: rule engine derives requirements → material property filtering → weighted multi-criteria scoring → profile-based optimization. The LLM is used only to explain this structured output — never to invent values.',
    data: `Structured reference dataset (demo, non-certified): ${COMMODITIES.length} commodities, ${MATERIALS.length} materials, with provenance-tagged properties. Your inputs are the storage, transport and business parameters configured in the analyzer.`,
    limitations: `Shelf-life estimate ${shelfLife.daysLow}–${shelfLife.daysHigh} days is a model range (Q10 + barrier fit), medium confidence at best. Requires experimental validation before commercial decisions.`,
    impact: 'Potential reduction in packaging mismatch, food waste and cost via barrier-matched packaging; magnitude depends on real supply-chain conditions (estimate).',
  };
}

export function runAnalysis(input: AnalysisInput, ctx: EngineContext): AnalysisResult {
  const validation = validateInput(input, ctx.commodities);
  if (!validation.ok) {
    throw new EngineValidationError(validation.errors.join(' '));
  }
  const commodity = ctx.commodities.find((c) => c.id === input.commodityId)!;
  const props = resolveProperties(commodity, input.propertyOverrides);

  const dflt = defaultStorage(commodity);
  const storage: StorageInput = {
    temperatureC: input.storage?.temperatureC ?? dflt.temperatureC,
    rhPct: input.storage?.rhPct ?? dflt.rhPct,
    targetShelfLifeDays: input.storage?.targetShelfLifeDays ?? dflt.targetShelfLifeDays,
    environment: input.storage?.environment ?? dflt.environment,
  };
  const transport: Partial<TransportInput> = { ...defaultTransport(), ...(input.transport ?? {}) };
  const business = { ...defaultBusiness(), ...input.business };
  const packageSizeGrams = business.packageSizeGrams ?? 1000;

  const requirements = deriveRequirements(commodity, props, storage, transport, 16.7 * (1000 / Math.max(packageSizeGrams, 50)));

  const byProfile: Record<string, Recommendation[]> = {};
  let primaryProfile = priorityToProfile[input.priority];

  for (const profile of PROFILES) {
    const candidates = scoreAll(ctx, commodity, props, requirements, storage, transport, profile, business.budgetPerPackageInr);

    const recs: Recommendation[] = [];
    let rank = 1;
    for (const cand of candidates) {
      recs.push(buildRecommendation(cand, commodity, props, requirements, storage, transport, packageSizeGrams, profile));
      // keep only the top few for display
      if (rank >= 5) break;
      rank++;
    }

    // re-rank: feasible first, then by score
    const feasibleRecs = recs.filter((r) => (r.score.infeasible ?? []).length === 0);
    const infeasibleRecs = recs.filter((r) => (r.score.infeasible ?? []).length > 0);
    const ordered = [...feasibleRecs.sort((a, b) => b.score.total - a.score.total), ...infeasibleRecs.sort((a, b) => b.score.total - a.score.total)];
    ordered.forEach((r, i) => (r.rank = i + 1));
    byProfile[profile] = ordered;
  }

  // PRIMARY: forced material (Failure Lab) if provided and valid, else top of requested profile
  let primary = byProfile[primaryProfile][0];
  if (input.forcedMaterialId) {
    const forced = ctx.materials.find((m) => m.id === input.forcedMaterialId);
    if (forced && forced.id !== primary.material.id) {
      // score the forced material under the balanced profile for a comparable record
      const scored = scoreMaterial(forced, commodity, props, requirements, storage, transport, ctx.weights, { mode: 'balanced' });
      const cand: CandidateScore = { material: forced, total: scored.total, breakdown: scored.breakdown, infeasible: scored.infeasible };
      const rec = buildRecommendation(cand, commodity, props, requirements, storage, transport, packageSizeGrams, 'balanced');
      rec.rank = 0;
      primary = rec;
    }
  }

  const shelfLife = estimateShelfLife({
    commodity, props, storage,
    material: primary.material,
    oxygenFit: primary.score.breakdown.otrSuitability / 100,
    moistureFit: primary.score.breakdown.wvtrSuitability / 100,
    materialOtr: primary.material.otrCm3M2Day.value,
    requiredOtrMax: requirements.otrMax,
    requiredOtrMin: requirements.otrMin,
    materialWvtr: primary.material.wvtrGm2Day.value,
    requiredWvtrMax: requirements.wvtrMax,
  });

  // FAILURE LAB: model-based failure hypotheses + risk timeline for the primary material
  const failureModes = classifyFailureModes(primary.material, commodity, props, storage, requirements.otrMin, requirements.wvtrMax, 16.7 * (1000 / Math.max(packageSizeGrams, 50)));
  const riskTimeline = buildRiskTimeline(failureModes, primary.material, props, storage, Math.max(14, Math.ceil(shelfLife.daysHigh) + 2));
  const sustainability = assessSustainability(primary.material, packageSizeGrams, shelfLife, commodity);
  const wasteEconomics = estimateWasteEconomics(commodity, packageSizeGrams, shelfLife, primary.score.estimatedCostPerPackageInr);
  const transportAssessment = assessTransport(
    { origin: transport.origin!, destination: transport.destination!, distanceKm: transport.distanceKm!, mode: transport.mode!, durationDays: transport.durationDays!, expectedTempC: transport.expectedTempC!, expectedRhPct: transport.expectedRhPct!, coldChain: transport.coldChain! },
    commodity, props, primary.material,
  );

  const mapSim = simulateMap({ props, storage, material: primary.material, thicknessUm: (primary.material.thicknessUmRange[0] + primary.material.thicknessUmRange[1]) / 2, days: Math.min(10, Math.max(5, Math.round(shelfLife.daysHigh))) });
  const twin: DigitalTwinState = {
    temperatureC: storage.temperatureC,
    rhPct: storage.rhPct,
    thicknessUm: (primary.material.thicknessUmRange[0] + primary.material.thicknessUmRange[1]) / 2,
    storageDays: shelfLife.daysHigh,
    transportDays: transport.durationDays ?? 1,
    targetShelfLifeDays: storage.targetShelfLifeDays,
    estimatedShelfLife: shelfLife,
    oxygenRisk: Math.round(100 - primary.score.breakdown.otrSuitability),
    moistureRisk: Math.round(100 - primary.score.breakdown.wvtrSuitability),
    spoilageRisk: Math.round(clamp((100 - primary.score.total) / 100 + 0.2, 0.05, 0.95) * 100),
    transportRisk: transportAssessment.riskScore,
    costPerPackageInr: primary.score.estimatedCostPerPackageInr,
    sustainabilityScore: sustainability.total,
    mapState: mapSim.series,
  };

  const alternativesComparison: ComparisonRow[] = byProfile.balanced.slice(0, 5).map((r) => ({
    materialId: r.material.id,
    name: r.material.name,
    otr: r.material.otrCm3M2Day.value,
    wvtr: r.material.wvtrGm2Day.value,
    thicknessUm: r.material.thicknessUmRange[0],
    estimatedShelfLifeDays: r.score.estimatedShelfLifeDays,
    costPerPackageInr: r.score.estimatedCostPerPackageInr,
    sustainability: r.score.sustainabilityScore,
    recyclability: r.material.recyclability,
    transportSuitability: r.score.transportSuitability,
    mapSuitability: r.material.mapSuitable,
    totalScore: r.score.total,
  }));

  return {
    input: { ...input, resolvedProperties: props },
    commodity,
    requirements,
    recommendations: byProfile,
    primary,
    shelfLife,
    sustainability,
    wasteEconomics,
    transport: transportAssessment,
    twin,
    judge: buildJudgeExplanation(commodity, primary, shelfLife),
    alternativesComparison,
    failureModes,
    riskTimeline,
    forcedMaterialId: input.forcedMaterialId,
    createdAt: new Date().toISOString(),
  };
}

export class EngineValidationError extends Error {}

/** Re-run analysis with modified twin parameters (digital twin sliders). */
export function simulateTwin(base: AnalysisResult, changes: Partial<Pick<StorageInput, 'temperatureC' | 'rhPct' | 'targetShelfLifeDays'> & { thicknessUm: number; storageDays: number }>, ctx: EngineContext): DigitalTwinState {
  const modified: AnalysisInput = {
    ...base.input,
    storage: {
      ...base.input.storage,
      temperatureC: changes.temperatureC ?? base.input.storage.temperatureC,
      rhPct: changes.rhPct ?? base.input.storage.rhPct,
      targetShelfLifeDays: changes.targetShelfLifeDays ?? base.input.storage.targetShelfLifeDays,
    },
  };
  const result = runAnalysis(modified, ctx);
  return result.twin;
}
