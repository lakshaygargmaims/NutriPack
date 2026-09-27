import { describe, expect, it } from 'vitest';
import { CITIES, findCity, haversineKm } from '../src/lib/engine/cities';
import { analyzeRoute, routePackagingDelta } from '../src/lib/engine/routeRisk';
import { generateStructures } from '../src/lib/engine/structureGenerator';
import { runAutoFix } from '../src/lib/engine/autoFix';
import { runAnalysis } from '../src/lib/engine/pipeline';
import { COMMODITIES, MATERIALS } from '../src/lib/domain/referenceData';

const ctx = { commodities: COMMODITIES, materials: MATERIALS };
const commodity = (id: string) => COMMODITIES.find((c) => c.id === id)!;
const material = (id: string) => MATERIALS.find((m) => m.id === id)!;
const tomato = commodity('tomato');

describe('city gazetteer', () => {
  it('has unique Indian cities within India bounds and looks up by id or name', () => {
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
    for (const c of CITIES) {
      expect(c.lat).toBeGreaterThan(6);
      expect(c.lat).toBeLessThan(36);
      expect(c.lon).toBeGreaterThan(68);
      expect(c.lon).toBeLessThan(98);
    }
    expect(findCity('delhi')!.name).toBe('Delhi');
    expect(findCity('MUMBAI')!.id).toBe('mumbai');
    expect(findCity('atlantis')).toBeUndefined();
  });

  it('great-circle Delhi→Mumbai ≈ 1100–1400 km', () => {
    const d = haversineKm(findCity('delhi')!, findCity('mumbai')!);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1400);
  });
});

describe('route risk engine', () => {
  const base = {
    origin: 'Delhi',
    destination: 'Mumbai',
    distanceKm: 1400,
    durationHours: 35,
    mode: 'road' as const,
    assumedTempC: 30,
    assumedRhPct: 65,
    handlingPoints: 2,
    coldChain: false,
  };

  // Boundary table: each row pins one regime of the exposure model.
  it.each([
    ['long hot unrefrigerated leg → MEDIUM (spec example) + cold chain advised', base, { overall: 'medium', coldChainRequired: true }],
    ['40°C+ multi-day leg → HIGH', { ...base, assumedTempC: 42, durationHours: 24 * 7, handlingPoints: 4 }, { overall: 'high' }],
    ['short cold-chain leg → not HIGH, no cold-chain flag', { ...base, durationHours: 8, distanceKm: 280, assumedTempC: 8, coldChain: true, handlingPoints: 1 }, { overall: '!high', coldChainRequired: false }],
  ])('%s', (_n, route, exp) => {
    const a = analyzeRoute(route);
    if (String(exp.overall).startsWith('!')) expect(a.overallRisk).not.toBe('high');
    else expect(a.overallRisk).toBe(exp.overall);
    if ('coldChainRequired' in exp) expect(a.coldChainRequired).toBe(exp.coldChainRequired);
  });

  it('explanations label demo assumptions; more handling points raise risk monotonically', () => {
    const a = analyzeRoute(base);
    expect(a.explanations.some((e) => e.includes('DEMO ASSUMPTION'))).toBe(true);
    expect(analyzeRoute({ ...base, handlingPoints: 5 }).riskScore).toBeGreaterThan(analyzeRoute({ ...base, handlingPoints: 0 }).riskScore);
  });

  it('rough routes boost mechanical protection; fragile produce on long warm legs flags insulation', () => {
    const d = routePackagingDelta(analyzeRoute(base), tomato);
    expect(d.mechanicalBoost).toBeGreaterThan(0);
    expect(d.notes.length).toBeGreaterThan(0);
    const banana = commodity('banana');
    expect(routePackagingDelta(analyzeRoute({ ...base, coldChainRequired: true } as any), banana).insulationMatters).toBe(true);
  });
});

describe('structure generator', () => {
  const needs = { oxygen: 'high' as const, moisture: 'medium' as const, light: 'high' as const, mechanical: 'high' as const, needsSeal: true, respiring: false };

  it('foil-core candidate explains each layer and is stamped "requires validation"', () => {
    const foil = generateStructures(material('multi-3layer'), tomato, needs).find((x) => x.name === 'PET/AL/PE')!;
    expect(foil.layers.map((l) => l.material)).toEqual(['PET', 'AL', 'PE']);
    expect(foil.layers[0].purpose).toMatch(/mechanical/i);
    expect(foil.layers[1].purpose).toMatch(/barrier/i);
    expect(foil.layers[2].purpose).toMatch(/seal|contact/i);
    expect(foil.candidateStatus).toBe('requires validation');
  });

  it('respiring produce gets a micro-perforated candidate with gas-exchange rationale', () => {
    const perf = generateStructures(material('multi-3layer'), tomato, { ...needs, respiring: true }).find((x) => x.id === 'micro-perf')!;
    expect(perf.rationale).toMatch(/respir|gas exchange/i);
  });

  it('every candidate carries the honesty label + trade-offs', () => {
    for (const x of generateStructures(material('multi-3layer'), tomato, needs)) {
      expect(x.candidateStatus).toBe('requires validation');
      expect(x.tradeOffs.length).toBeGreaterThan(0);
    }
  });
});

describe('auto-fix correction loop', () => {
  const foilTomato = {
    commodityId: 'tomato',
    storage: { temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' as const },
    transport: {},
    business: {},
    priority: 'balanced' as const,
    forcedMaterialId: 'foil-lam',
  };

  it('detects anaerobic failure on foil-on-tomato, proposes a fix, re-simulates with less risk', () => {
    const fix = runAutoFix(foilTomato as any, ctx);
    expect(fix.original.failureModes!.some((m) => m.id === 'anaerobic')).toBe(true);
    expect(fix.steps.some((s) => /micro-perforat|OTR/i.test(s.change))).toBe(true);
    expect(fix.fixed).not.toBeNull();
    expect(fix.comparison).toHaveLength(4);
    expect(fix.label).toMatch(/not physical validation/i);
    const before = fix.original.failureModes!.find((m) => m.id === 'anaerobic')!;
    const after = fix.fixed!.failureModes!.find((m) => m.id === 'anaerobic');
    expect(after === undefined || after.probability < before.probability).toBe(true);
  });

  it('returns no fix when the primary has no failure modes', () => {
    const clean = { ...foilTomato, forcedMaterialId: undefined } as any;
    const fix = runAutoFix(clean, ctx);
    if (!fix.original.failureModes!.length) expect(fix.fixed).toBeNull();
  });
});

describe('pipeline stays consistent after integration', () => {
  it('baseline analysis still works with failure modes attached', () => {
    const r = runAnalysis({ commodityId: 'tomato', storage: { temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' }, transport: {}, business: {}, priority: 'balanced' } as any, ctx);
    expect(r.primary.score.total).toBeGreaterThan(0);
    expect(Array.isArray(r.failureModes)).toBe(true);
  });
});
