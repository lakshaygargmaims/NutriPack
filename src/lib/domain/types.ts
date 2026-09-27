/**
 * NutriPack — Core domain types.
 *
 * Scientific-integrity rule: every value representing a physical/scientific
 * quantity carries provenance. Values are never presented as experimentally
 * verified unless provenance is 'experimental'/'reference' AND linked to a
 * ReferenceSource id.
 */

export type Provenance = 'reference' | 'user' | 'experimental' | 'estimated';

export interface ReferenceSource {
  id: string;
  title: string;
  publisher: string;
  year?: number;
  url?: string;
  notes?: string;
}

/** A quantity with provenance attached. */
export interface Sourced<T> {
  value: T;
  provenance: Provenance;
  sourceId?: string;
}

export type FoodCategory =
  | 'vegetable'
  | 'fruit'
  | 'cereal'
  | 'pulse'
  | 'spice'
  | 'bakery'
  | 'snack'
  | 'dairy'
  | 'beverage'
  | 'processed';

export type StorageEnvironment = 'ambient' | 'refrigerated' | 'frozen' | 'controlled';

export type TransportMode = 'road' | 'rail' | 'air' | 'sea' | 'none';

export type OptimizationPriority =
  | 'max_shelf_life'
  | 'min_cost'
  | 'max_sustainability'
  | 'transport_durability'
  | 'balanced';

export interface FoodProperties {
  moistureContentPct?: number; // % wet basis
  ph?: number;
  fatPct?: number;
  proteinPct?: number;
  waterActivity?: number; // aw 0..1
  /** mg CO2 / kg·h at reference 10°C for fresh produce; 0 for non-respiring */
  respirationRateMgCo2KgH?: number;
  oxygenSensitivity: 0 | 1 | 2 | 3 | 4 | 5; // 0 = insensitive
  moistureSensitivity: 0 | 1 | 2 | 3 | 4 | 5;
  lightSensitivity: 0 | 1 | 2 | 3 | 4 | 5;
  temperatureSensitivity: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface FoodCommodity {
  id: string;
  name: string;
  category: FoodCategory;
  form: 'fresh' | 'processed';
  typicalStorageEnv: StorageEnvironment;
  /** Typical storage temp range °C [min, max] */
  storageTempRangeC: [number, number];
  /** Typical RH range % [min, max] */
  storageRhRangePct: [number, number];
  /** Model-derived indicative unrefrigerated shelf life, days (reference estimate) */
  indicativeShelfLifeDays: Sourced<number>;
  properties: FoodProperties;
  /** USD-equivalent value per kg used for waste economics (demo/reference) */
  valuePerKgInr: Sourced<number>;
  notes?: string;
  sourceIds?: string[];
}

export interface PackagingMaterial {
  id: string;
  name: string;
  category: 'plastic' | 'bioplastic' | 'paper' | 'foil-laminate' | 'metallized' | 'multilayer' | 'microperforated' | 'compostable' | 'glass' | 'metal' | 'natural';
  /** O2 transmission rate cm³/m²·day @23°C, 1 atm (lower = better barrier) */
  otrCm3M2Day: Sourced<number>;
  /** Water vapour transmission rate g/m²·day @38°C/90% RH */
  wvtrGm2Day: Sourced<number>;
  /** CO2 transmission rate cm³/m²·day */
  co2trCm3M2Day: Sourced<number>;
  thicknessUmRange: [number, number];
  sealable: boolean;
  tensileStrengthMpa: Sourced<number>;
  /** Safe temperature range °C */
  tempRangeC: [number, number];
  /** 0..1 qualitative scores */
  moistureBarrier: number; // 0..1
  oxygenBarrier: number; // 0..1
  lightBarrier: number; // 0..1
  recyclability: 'widely' | 'limited' | 'rare' | 'not';
  recycledContentPct: number;
  /** kg CO2e per m² of film (demo reference estimates) */
  carbonKgCo2ePerM2: Sourced<number>;
  /** INR per m² (demo reference) */
  costInrPerM2: Sourced<number>;
  foodContactSafe: boolean;
  mapSuitable: boolean;
  advantages: string[];
  limitations: string[];
  typicalApplications: string[];
  sourceIds?: string[];
  /** Whether values are indicative reference data (default true) */
  dataStatus: 'reference' | 'verified';
}

export interface StorageInput {
  temperatureC: number;
  rhPct: number;
  targetShelfLifeDays: number;
  environment: StorageEnvironment;
}

export interface TransportInput {
  origin: string;
  destination: string;
  distanceKm: number;
  mode: TransportMode;
  durationDays: number;
  expectedTempC: number;
  expectedRhPct: number;
  coldChain: boolean;
}

export interface BusinessInput {
  budgetPerPackageInr?: number;
  packageSizeGrams: number;
  productionVolumePerMonth: number;
}

export interface AnalysisInput {
  commodityId: string;
  /** user-overrides of commodity properties (provenance: user) */
  propertyOverrides?: Partial<FoodProperties>;
  storage: Partial<StorageInput>;
  transport?: Partial<TransportInput>;
  business: Partial<BusinessInput>;
  priority: OptimizationPriority;
  /** Force a specific material for failure analysis (Failure Lab) */
  forcedMaterialId?: string;
}

export interface PackagingRequirements {
  /** Required OTR window: material OTR should be <= max (barrier) and >= min (respiration) */
  otrMax: number;
  otrMin?: number;
  wvtrMax: number;
  co2trMin?: number;
  moistureBarrierMin: number;
  oxygenBarrierMin: number;
  lightBarrierMin: number;
  thicknessUmMin: number;
  thicknessUmMax: number;
  sealabilityRequired: boolean;
  tempMinC: number;
  mapSuitability: 'required' | 'recommended' | 'optional' | 'not-applicable';
  /** Human-readable derivation summary */
  derivation: string[];
  dataGaps: string[];
}

export interface ScoreBreakdown {
  foodCompatibility: number;
  otrSuitability: number;
  wvtrSuitability: number;
  thicknessSuitability: number;
  sealability: number;
  temperatureCompatibility: number;
  shelfLifeCapability: number;
  costScore: number;
  sustainabilityScore: number;
  transportScore: number;
}

export interface MaterialScore {
  materialId: string;
  total: number; // 0..100
  breakdown: ScoreBreakdown;
  infeasible: string[];
  estimatedShelfLifeDays: [number, number];
  estimatedCostPerPackageInr: number;
  sustainabilityScore: number; // 0..100
  transportSuitability: 'low' | 'medium' | 'high';
  mapSuitable: boolean;
}

export interface RecommendationReason {
  verdict: 'pro' | 'con';
  text: string;
}

export interface Recommendation {
  rank: number;
  mode: string; // optimization profile name
  material: PackagingMaterial;
  score: MaterialScore;
  reasons: RecommendationReason[];
  structureLayers: StructureLayer[];
  mapAdvice: MapAdvice | null;
}

export interface StructureLayer {
  name: string;
  material: string;
  thicknessUm: number;
  role: string;
}

export interface MapAdvice {
  suitable: boolean;
  initialO2Pct: number;
  initialCo2Pct: number;
  targetO2Pct: [number, number];
  targetCo2Pct: [number, number];
  perforationRecommended: boolean;
  notes: string;
}

export interface ShelfLifeEstimate {
  daysLow: number;
  daysHigh: number;
  risk: 'low' | 'medium' | 'high';
  confidence: 'low' | 'medium' | 'high';
  limitingFactor: string;
  method: string;
  disclaimer: string;
}

export interface DigitalTwinState {
  temperatureC: number;
  rhPct: number;
  thicknessUm: number;
  storageDays: number;
  transportDays: number;
  targetShelfLifeDays: number;
  estimatedShelfLife: ShelfLifeEstimate;
  oxygenRisk: number; // 0..100
  moistureRisk: number; // 0..100
  spoilageRisk: number; // 0..100
  transportRisk: number; // 0..100
  costPerPackageInr: number;
  sustainabilityScore: number;
  mapState: MapSimulationPoint[];
}

export interface SustainabilityBreakdown {
  materialImpact: number; // 0..100 subscore
  recyclability: number;
  recycledContent: number;
  foodWasteReduction: number;
  transportEfficiency: number;
  endOfLife: number;
  total: number; // 0..100
  label: 'estimated';
  notes: string;
}

export interface WasteEconomics {
  packageSizeGrams: number;
  lossRateWithoutPct: number;
  lossRateWithPct: number;
  foodValueLostInr: number;
  foodValueSavedInr: number;
  additionalPackagingCostInr: number;
  netEconomicImpactInr: number;
  label: 'estimated';
}

export interface TransportAssessment {
  suitability: 'low' | 'medium' | 'high';
  riskScore: number; // 0..100
  thermalExposureC: number;
  humidityExposurePct: number;
  durationDays: number;
  explanations: string[];
}

export interface JudgeExplanation {
  what: string;
  why: string;
  how: string;
  data: string;
  limitations: string;
  impact: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  dataGaps: string[];
}

export interface AnalysisResult {
  input: AnalysisInput & { resolvedProperties: FoodProperties };
  commodity: FoodCommodity;
  requirements: PackagingRequirements;
  recommendations: Record<string, Recommendation[]>; // keyed by profile
  primary: Recommendation; // recommendation for requested priority
  shelfLife: ShelfLifeEstimate;
  sustainability: SustainabilityBreakdown;
  wasteEconomics: WasteEconomics;
  transport: TransportAssessment;
  twin: DigitalTwinState;
  judge: JudgeExplanation;
  alternativesComparison: ComparisonRow[];
  /** Model-based failure hypotheses for the selected material (Failure Lab) */
  failureModes: FailureMode[];
  riskTimeline: RiskTimelinePoint[];
  forcedMaterialId?: string;
  createdAt: string;
}

export interface FailureMode {
  id: string;
  name: string;
  severity: 'low' | 'medium' | 'high';
  /** 0..100 model-based probability proxy */
  probability: number;
  /** days until visible effect under model assumptions; null = not applicable */
  onsetDays: number | null;
  mechanism: string;
  explanation: string;
  mitigation: string;
}

export interface RiskTimelinePoint {
  day: number;
  anaerobic: number;
  moisture: number;
  oxidative: number;
  overall: number;
}

export interface MonteCarloResult {
  n: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  mean: number;
  sd: number;
  histogram: { binStart: number; binEnd: number; count: number }[];
  probTargetMet: number;
  probAnaerobic: number;
  assumptions: string[];
  method: string;
}

export interface SupplyChainLeg {
  name: string;
  mode: TransportMode;
  durationDays: number;
  tempC: number;
  rhPct: number;
  coldChain: boolean;
}

export interface SupplyChainLegResult {
  name: string;
  riskScore: number;
  suitability: 'low' | 'medium' | 'high';
  tempC: number;
  durationDays: number;
  /** modelled shelf-life days consumed by this leg (TTT, Q10-weighted) */
  shelfLifeUsedDays: number;
  explanations: string[];
}

export interface SupplyChainResult {
  legs: SupplyChainLegResult[];
  totalDurationDays: number;
  shelfLifeUsedDays: number;
  /** remaining shelf-life range on arrival at the final destination */
  remainingShelfLifeDays: [number, number] | null;
  cumulativeRisk: number;
  verdict: string;
}

export interface ComparisonRow {
  materialId: string;
  name: string;
  otr: number;
  wvtr: number;
  thicknessUm: number;
  estimatedShelfLifeDays: [number, number];
  costPerPackageInr: number;
  sustainability: number;
  recyclability: string;
  transportSuitability: string;
  mapSuitability: boolean;
  totalScore: number;
}

export interface MapSimulationPoint {
  day: number;
  o2Pct: number;
  co2Pct: number;
  withinTarget: boolean;
}

export interface ValidationObservation {
  id: string;
  experimentId: string;
  day: number;
  weightG?: number;
  weightLossPct?: number;
  ph?: number;
  moisturePct?: number;
  colorL?: number;
  textureN?: number;
  spoilageScore?: number; // 0..5
  temperatureC?: number;
  rhPct?: number;
  predictedShelfLifeAtDay?: [number, number];
  notes?: string;
  createdAt: string;
}

export interface ValidationExperiment {
  id: string;
  projectId?: string;
  commodityId: string;
  materialId: string;
  title: string;
  status: 'running' | 'completed';
  predictedShelfLife: [number, number];
  actualShelfLifeDays?: number;
  observations: ValidationObservation[];
  createdAt: string;
}

export interface ProjectVersion {
  label: string;
  result: AnalysisResult;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  versions: ProjectVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'analyst' | 'viewer';
  organization?: string;
  createdAt: string;
}

export interface DbShape {
  version: number;
  seededAt: string;
  users: StoredUser[];
  commodities: FoodCommodity[];
  materials: PackagingMaterial[];
  sources: ReferenceSource[];
  projects: Project[];
  experiments: ValidationExperiment[];
  auditLog: { at: string; actor: string; action: string; detail?: string }[];
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: StoredUser['role'];
}
