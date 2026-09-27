import type { FoodCommodity, FoodProperties, MonteCarloResult, PackagingMaterial, StorageInput } from '../domain/types';
import { estimateShelfLife } from './shelfLife';
import { meanTemp } from './shelfLife';

/**
 * MONTE CARLO SHELF-LIFE UNCERTAINTY.
 * Samples the three dominant uncertainty sources and re-runs the deterministic
 * shelf-life model per draw. The output is a distribution — replacing an
 * asserted range with an *earned* one.
 *
 *  - temperature: Normal(T, 1.5°C) storage fluctuation
 *  - respiration: LogNormal around the reference value (×/÷ 1.4)
 *  - barrier:     LogNormal around film OTR (×/÷ 1.6, real film spread)
 *
 * Seedless LCG for deterministic, auditable runs (same input → same histogram).
 */

export interface MonteCarloParams {
  commodity: FoodCommodity;
  props: FoodProperties;
  storage: StorageInput;
  material: PackagingMaterial;
  oxygenFit: number;
  moistureFit: number;
  targetShelfLifeDays: number;
  draws?: number; // default 4000
  seed?: number; // default 42
}

// Deterministic PRNG (mulberry32)
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller normal
function normal(rand: () => number, mu: number, sigma: number): number {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Lognormal via multiplicative noise
function lognormal(rand: () => number, median: number, sigma: number): number {
  return median * Math.exp(sigma * normal(rand, 0, 1));
}

export function runMonteCarlo(p: MonteCarloParams): MonteCarloResult {
  const n = p.draws ?? 4000;
  const rand = rng(p.seed ?? 42);
  const samples: number[] = [];

  const respMedian = p.props.respirationRateMgCo2KgH ?? 0;
  const perishable = p.commodity.form === 'fresh' || (p.props.waterActivity ?? 1) > 0.92;
  const targetLow = p.targetShelfLifeDays;
  const respiring = respMedian > 0.5;

  // anaerobic proxy: film OTR below half the modelled respiration O₂ demand
  const massArea = 16.7; // kg per m² (demo geometry)
  const rateAtTemp = respiring ? respMedian * Math.pow(2.2, (p.storage.temperatureC - 10) / 10) : 0;
  const o2Demand = respiring ? (rateAtTemp / massArea) * 24 * 0.56 : 0;

  for (let i = 0; i < n; i++) {
    const tempDraw = Math.max(-25, Math.min(55, normal(rand, p.storage.temperatureC, 1.5)));
    const respDraw = respiring ? Math.max(0.1, lognormal(rand, respMedian, 0.35)) : respMedian;
    const otrDraw = Math.max(0.05, lognormal(rand, p.material.otrCm3M2Day.value, 0.47)); // ×/÷ 1.6

    const shelf = estimateShelfLife({
      commodity: p.commodity,
      props: { ...p.props, respirationRateMgCo2KgH: respDraw },
      storage: { ...p.storage, temperatureC: tempDraw },
      material: p.material,
      oxygenFit: p.oxygenFit,
      moistureFit: p.moistureFit,
      materialOtr: otrDraw,
      requiredOtrMax: Math.max(1, o2Demand * 3),
      requiredOtrMin: respiring ? Math.max(0.1, o2Demand * 0.5) : undefined,
      materialWvtr: p.material.wvtrGm2Day.value,
      requiredWvtrMax: Math.max(0.5, p.material.wvtrGm2Day.value), // neutral: WVTR not sampled
    });

    // anaerobic draw check (per-sample, OTR vs sampled demand)
    const demandDraw = respiring ? ((respDraw * Math.pow(2.2, (tempDraw - 10) / 10)) / massArea) * 24 * 0.56 : 0;
    if (respiring && otrDraw < demandDraw / 2) {
      // anaerobic failure → shelf life collapses to ~2 days
      samples.push(Math.min(shelf.daysLow, 2));
    } else {
      samples.push((shelf.daysLow + shelf.daysHigh) / 2);
    }
  }

  samples.sort((a, b) => a - b);
  const q = (pct: number) => samples[Math.min(n - 1, Math.max(0, Math.floor(pct * (n - 1))))];
  const m = mean(samples);
  const sd = Math.sqrt(mean(samples.map((s) => (s - m) ** 2)));

  // Histogram: ~18 bins across p1..p99
  const lo = q(0.01);
  const hi = Math.max(q(0.99), lo + 1);
  const binCount = 18;
  const width = (hi - lo) / binCount;
  const histogram = Array.from({ length: binCount }, (_, i) => ({
    binStart: round2(lo + i * width),
    binEnd: round2(lo + (i + 1) * width),
    count: 0,
  }));
  for (const s of samples) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((s - lo) / width)));
    histogram[idx].count++;
  }

  const probTargetMet = samples.filter((s) => s >= targetLow).length / n;
  const probAnaerobic = respiring ? samples.filter((s) => s <= 2.5).length / n : 0;

  const assumptions = [
    `Temperature ~ Normal(${p.storage.temperatureC}°C, σ=1.5°C) storage fluctuation`,
    respiring ? `Respiration ~ LogNormal(median ${respMedian} mg CO₂/kg·h, σ=0.35)` : 'Respiration: non-respiring commodity (not sampled)',
    `Film OTR ~ LogNormal(median ${p.material.otrCm3M2Day.value}, σ=0.47 ≈ ×/÷1.6 manufacturing spread)`,
    'WVTR and commodity baseline held fixed per draw (conservative simplification)',
  ];

  return {
    n,
    p5: round1(q(0.05)),
    p25: round1(q(0.25)),
    p50: round1(q(0.5)),
    p75: round1(q(0.75)),
    p95: round1(q(0.95)),
    mean: round1(m),
    sd: round1(sd),
    histogram,
    probTargetMet: Math.round(probTargetMet * 100),
    probAnaerobic: Math.round(probAnaerobic * 100),
    assumptions,
    method: 'Monte Carlo over Q10 × barrier-fit model (4000 draws, LCG-seeded, deterministic)',
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
