import { describe, expect, it } from 'vitest';
import { runAnalysis, validateInput, EngineValidationError, PROFILES } from '../src/lib/engine/pipeline';
import { COMMODITIES, MATERIALS } from '../src/lib/domain/referenceData';
import { deriveRequirements } from '../src/lib/engine/requirements';
import { simulateMap } from '../src/lib/engine/map';
import { assessTransport } from '../src/lib/engine/transport';
import { assessSustainability, estimateWasteEconomics } from '../src/lib/engine/sustainability';

const ctx = { commodities: COMMODITIES, materials: MATERIALS };

const tomatoInput = {
  commodityId: 'tomato',
  storage: { temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' as const },
  transport: { origin: 'Delhi', destination: 'Jaipur', distanceKm: 280, mode: 'road' as const, durationDays: 1, expectedTempC: 20, expectedRhPct: 60, coldChain: false },
  business: { packageSizeGrams: 1000, productionVolumePerMonth: 10000 },
  priority: 'balanced' as const,
};

describe('input validation', () => {
  // Contract: valid input accepted; impossible values and unknown ids rejected
  // with a reason; missing data is a WARNING, never silently invented.
  it.each([
    ['valid tomato', tomatoInput, { ok: true, mentions: null }],
    ['impossible temperature', { ...tomatoInput, storage: { ...tomatoInput.storage, temperatureC: 999 } }, { ok: false, mentions: 'temperatureC' }],
    ['unknown commodity', { ...tomatoInput, commodityId: 'unicorn' }, { ok: false, mentions: null }],
  ])('%s', (_name, input, expected) => {
    const v = validateInput(input as any, COMMODITIES);
    expect(v.ok).toBe(expected.ok);
    if (expected.mentions) expect(v.errors.join(' ')).toMatch(new RegExp(expected.mentions, 'i'));
  });

  it('missing storage/business are warnings, not errors (§35 honesty)', () => {
    const v = validateInput({ commodityId: 'tomato', storage: {}, business: {}, priority: 'balanced' } as any, COMMODITIES);
    expect(v.ok).toBe(true);
    expect(v.warnings.length).toBeGreaterThan(0);
  });
});

describe('requirement translator', () => {
  // Contract: food properties → barrier/gas-exchange requirements, with data gaps named.
  const storage = { temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' as const };

  it.each([
    ['respiring produce gets an OTR window + MAP', 'tomato', (r: any) => r.otrMin > 0 && r.otrMax > r.otrMin && r.mapSuitability === 'required'],
    ['oxidation-dominant snacks get a tight O₂ ceiling', 'snacks', (r: any) => r.oxygenBarrierMin >= 0.75 && r.otrMax <= 8],
  ])('%s', (_n, id, check) => {
    const c = COMMODITIES.find((x) => x.id === id)!;
    expect(check(deriveRequirements(c, c.properties, storage))).toBe(true);
  });

  it('names data gaps instead of guessing', () => {
    const t = JSON.parse(JSON.stringify(COMMODITIES.find((c) => c.id === 'tomato')!));
    delete t.properties.waterActivity;
    expect(deriveRequirements(t, t.properties, storage).dataGaps.join(' ')).toMatch(/water activity/i);
  });
});

describe('recommendation pipeline', () => {
  const result = runAnalysis(tomatoInput as any, ctx);

  it('ranks feasible candidates for every profile with explanations', () => {
    for (const p of PROFILES) {
      expect(result.recommendations[p].length).toBeGreaterThan(0);
      expect(result.recommendations[p][0].reasons.length).toBeGreaterThan(0);
    }
    expect(result.primary.score.infeasible).toHaveLength(0);
    expect(result.primary.structureLayers.length).toBeGreaterThan(1);
    expect(result.judge.what).toMatch(/Recommended packaging/);
  });

  it('shelf life is a range with confidence and a model-based disclaimer', () => {
    expect(result.shelfLife.daysHigh).toBeGreaterThanOrEqual(result.shelfLife.daysLow);
    expect(['low', 'medium', 'high']).toContain(result.shelfLife.confidence);
    expect(result.shelfLife.disclaimer).toMatch(/model-based/i);
  });

  it('profiles optimize for different objectives: cost top-pick ≤ shelf top-pick cost', () => {
    const cost = result.recommendations.cost[0].score.estimatedCostPerPackageInr;
    const shelf = result.recommendations.shelf[0].score.estimatedCostPerPackageInr;
    expect(cost).toBeLessThanOrEqual(shelf);
  });

  it('alternatives comparison carries barrier + MAP columns', () => {
    expect(result.alternativesComparison.length).toBeGreaterThan(2);
    expect(result.alternativesComparison[0]).toHaveProperty('otr');
    expect(result.alternativesComparison[0]).toHaveProperty('wvtr');
    expect(result.alternativesComparison[0]).toHaveProperty('mapSuitability');
  });

  it('estimated-labelled engines (sustainability, waste economics) stay labelled', () => {
    expect(result.sustainability.label).toBe('estimated');
    expect(result.wasteEconomics.label).toBe('estimated');
    expect(result.wasteEconomics.foodValueSavedInr).toBeGreaterThanOrEqual(0);
  });
});

describe('physical sanity boundaries', () => {
  // One table, one physical law each — these are the model's hard invariants.
  const storage = (t: number) => ({ temperatureC: t, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' as const });

  it.each([
    ['Q10: hotter storage shortens estimated shelf life', 25, 5],
  ])('%s', (_n, hot, cool) => {
    const mid = (r: any) => (r.shelfLife.daysLow + r.shelfLife.daysHigh) / 2;
    expect(mid(runAnalysis({ ...tomatoInput, storage: storage(hot) } as any, ctx))).toBeLessThan(mid(runAnalysis({ ...tomatoInput, storage: storage(cool) } as any, ctx)));
  });

  it('cold-chain transport is modelled as lower-risk than warm transport', () => {
    const tomato = COMMODITIES.find((c) => c.id === 'tomato')!;
    const leg = { origin: 'Delhi', destination: 'Jaipur', distanceKm: 280, mode: 'road' as const, durationDays: 1 };
    const warm = assessTransport({ ...leg, expectedTempC: 35, expectedRhPct: 40, coldChain: false }, tomato, tomato.properties);
    const cool = assessTransport({ ...leg, expectedTempC: 10, expectedRhPct: 85, coldChain: true }, tomato, tomato.properties);
    expect(warm.riskScore).toBeGreaterThan(cool.riskScore);
  });

  it('sustainability ranks paper above foil laminate (relative indicator)', () => {
    const tomato = COMMODITIES.find((c) => c.id === 'tomato')!;
    const shelf = { daysLow: 9, daysHigh: 12, risk: 'low' as const, confidence: 'medium' as const, limitingFactor: 'x', method: 'x', disclaimer: 'x' };
    const s = (id: string) => assessSustainability(MATERIALS.find((m) => m.id === id)!, 1000, shelf, tomato).total;
    expect(s('paper')).toBeGreaterThan(s('foil-lam'));
  });
});

describe('MAP simulation', () => {
  const storage = { temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' as const };

  it('respiring produce produces gas curves', () => {
    const c = COMMODITIES.find((x) => x.id === 'tomato')!;
    const sim = simulateMap({ props: c.properties, storage, material: MATERIALS.find((m) => m.id === 'ldpe')!, days: 10 });
    expect(sim.series).toHaveLength(10);
    expect(sim.series[0].o2Pct).toBeLessThan(21);
    expect(sim.series[0].co2Pct).toBeGreaterThan(0);
  });

  it('non-respiring foods are honestly out of scope', () => {
    const c = COMMODITIES.find((x) => x.id === 'rice')!;
    const sim = simulateMap({ props: c.properties, storage: { temperatureC: 25, rhPct: 60, targetShelfLifeDays: 180, environment: 'ambient' }, material: MATERIALS.find((m) => m.id === 'foil-lam')!, days: 10 });
    expect(sim.series).toHaveLength(0);
    expect(sim.notes).toMatch(/not applicable/i);
  });
});

describe('honest failure handling', () => {
  it('unknown commodity throws instead of inventing data', () => {
    expect(() => runAnalysis({ ...tomatoInput, commodityId: 'dragon-fruit' } as any, ctx)).toThrow(EngineValidationError);
  });
});
