import { describe, expect, it } from 'vitest';
import { buildCompleteSolutions } from '../src/lib/engine/completeSolution';
import { COMMODITIES, MATERIALS } from '../src/lib/domain/referenceData';

const ctx = { commodities: COMMODITIES, materials: MATERIALS };

const ROUTE = {
  origin: 'Nashik',
  destination: 'Delhi',
  mode: 'road' as const,
  distanceKm: 1200,
  durationDays: 2,
  coldChain: false,
  handlingPoints: 3,
  source: 'router' as const,
};

function input(commodityId: string, storage?: Record<string, unknown>) {
  return {
    commodityId,
    ...(storage ? { storage } : {}),
    transport: { origin: 'Nashik', destination: 'Delhi', mode: 'road', coldChain: false },
    business: { packageSizeGrams: 1000, productionVolumePerMonth: 10000 },
    priority: 'balanced',
  } as any;
}

function build(commodityId: string, storage?: Record<string, unknown>) {
  return buildCompleteSolutions(input(commodityId, storage), ROUTE, 500, ctx).solutions;
}

describe('complete solution shape', () => {
  it('produces 3 options, each a complete configuration with provenance', () => {
    const solutions = build('tomato');
    expect(solutions.map((s) => s.optionId)).toEqual(['balanced', 'low_cost', 'sustainability']);
    for (const s of solutions) {
      expect(s.primaryPackaging.formatId).toBeTruthy();
      expect(s.materialStructure.materialId).toBeTruthy();
      expect(s.dataProvenance.sourceType).toBe('demo');
      expect(s.confidence).toMatch(/^(high|medium|low)$/);
    }
  });

  it('priority options differ in configuration, not just labels', () => {
    const [bal, _cheap, green] = build('tomato');
    const differs =
      bal.primaryPackaging.formatId !== green.primaryPackaging.formatId ||
      bal.materialStructure.materialId !== green.materialStructure.materialId ||
      bal.secondaryPackaging?.id !== green.secondaryPackaging?.id;
    expect(differs).toBe(true);
  });

  it('hierarchy runs product → primary → (…→) transport, every layer sourced', () => {
    const s = build('tomato')[0];
    expect(s.hierarchy[0].level).toBe('product');
    expect(s.hierarchy.map((h) => h.level)).toContain('primary');
    expect(s.hierarchy.at(-1)!.level).toBe('transport');
    for (const h of s.hierarchy) expect(h.source.length).toBeGreaterThan(0);
  });

  it('failure risks always carry cause and mitigation', () => {
    for (const r of build('tomato')[0].failureRisks) {
      expect(r.cause.length).toBeGreaterThan(0);
      expect(r.mitigation.length).toBeGreaterThan(0);
    }
  });
});

describe('food-specificity (the engine must not return one generic package)', () => {
  // Contract: configuration follows the food, not the caller.
  const storageFor = (id: string) => {
    const env: Record<string, any> = {
      rice: { temperatureC: 25, rhPct: 60, targetShelfLifeDays: 180, environment: 'ambient' },
      biscuits: { temperatureC: 25, rhPct: 55, targetShelfLifeDays: 90, environment: 'ambient' },
    };
    return env[id];
  };
  const fmt = (id: string) => build(id, storageFor(id))[0].primaryPackaging.formatId;

  it('different foods get different primary formats', () => {
    expect(new Set([fmt('tomato'), fmt('rice'), fmt('biscuits')]).size).toBe(3);
  });

  it('rationale names the driving requirement', () => {
    expect(build('rice', storageFor('rice'))[0].recommendationReasons.join(' ')).toMatch(/moisture/i);
    expect(build('tomato')[0].recommendationReasons.join(' ')).toMatch(/ventilat|MAP|gas/i);
    expect(build('mustard-oil', { temperatureC: 25, rhPct: 50, targetShelfLifeDays: 180, environment: 'ambient' })[0].recommendationReasons.join(' ')).toMatch(/oxygen|light|oxidation|leak/i);
  });
});

describe('hard constraints are filters with reasons, not scores', () => {
  // Contract: a liquid NEVER gets a leaky format; every option shows rejections.
  it('milk: leak-proof format + hermetic sealing in all 3 options, leaky formats rejected', () => {
    const storage = { temperatureC: 4, rhPct: 60, targetShelfLifeDays: 7, environment: 'refrigerated' };
    const solutions = build('milk', storage);
    for (const s of solutions) {
      expect(['fmt-bottle', 'fmt-tub', 'fmt-can-tin', 'fmt-jar', 'fmt-insulated-box']).toContain(s.primaryPackaging.formatId);
      if (s.sealingMethod) expect(s.sealingMethod.hermeticPotential).toBe('high');
      expect(s.rejectedCandidates.some((r) => /leak|liquid/i.test(r.because))).toBe(true);
    }
  });
});

describe('journey scaling (what-if behaviour)', () => {
  it.each([
    ['long haul → secondary + tertiary present', { distanceKm: 1500, durationDays: 3 }, 5000, { secondary: true, tertiary: true }],
    ['tiny local load → secondary and tertiary skipped', { distanceKm: 30, durationDays: 0.3, handlingPoints: 1 }, 5, { secondary: false, tertiary: false }],
  ])('%s', (_n, routeOver, qty, exp) => {
    const s = buildCompleteSolutions(input('tomato'), { ...ROUTE, ...routeOver }, qty, ctx).solutions[0];
    if (exp.secondary) expect(s.secondaryPackaging).not.toBeNull();
    else expect(s.secondaryPackaging).toBeNull();
    if (exp.tertiary) expect(s.tertiaryPackaging).not.toBeNull();
    else expect(s.tertiaryPackaging).toBeNull();
  });
});
