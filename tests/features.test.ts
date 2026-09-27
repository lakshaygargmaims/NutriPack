import { describe, expect, it } from 'vitest';
import { runMonteCarlo } from '../src/lib/engine/monteCarlo';
import { classifyFailureModes, buildRiskTimeline } from '../src/lib/engine/failureModes';
import { effectiveOtr, simulateMap } from '../src/lib/engine/map';
import { simulateSupplyChain, DEFAULT_SUPPLY_CHAIN } from '../src/lib/engine/supplyChain';
import { runAnalysis } from '../src/lib/engine/pipeline';
import { COMMODITIES, MATERIALS } from '../src/lib/domain/referenceData';

const ctx = { commodities: COMMODITIES, materials: MATERIALS };
const commodity = (id: string) => COMMODITIES.find((c) => c.id === id)!;
const material = (id: string) => MATERIALS.find((m) => m.id === id)!;
const tomato = commodity('tomato');
const storage = { temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' as const };

describe('Monte Carlo engine', () => {
  const mcInput = { commodity: tomato, props: tomato.properties, storage, material: material('ldpe'), oxygenFit: 0.9, moistureFit: 0.8, targetShelfLifeDays: 12 };

  it('is deterministic: same inputs → identical distribution', () => {
    const a = runMonteCarlo(mcInput);
    expect(a.p50).toBe(runMonteCarlo(mcInput).p50);
    expect(a.n).toBe(4000);
  });

  it('percentiles are ordered and probability fields are 0–100', () => {
    const mc = runMonteCarlo(mcInput);
    expect(mc.p5).toBeLessThanOrEqual(mc.p25);
    expect(mc.p25).toBeLessThanOrEqual(mc.p50);
    expect(mc.p50).toBeLessThanOrEqual(mc.p75);
    expect(mc.p75).toBeLessThanOrEqual(mc.p95);
    expect(mc.probTargetMet).toBeGreaterThanOrEqual(0);
    expect(mc.probTargetMet).toBeLessThanOrEqual(100);
  });

  it('low-OTR film on respiring produce → high anaerobic probability; cold storage shifts distribution up', () => {
    const foilMc = runMonteCarlo({ ...mcInput, material: material('foil-lam'), oxygenFit: 0.1 });
    expect(foilMc.probAnaerobic).toBeGreaterThan(50);

    const cool = runMonteCarlo({ ...mcInput, storage: { ...storage, temperatureC: 5 } }).p50;
    const warm = runMonteCarlo({ ...mcInput, storage: { ...storage, temperatureC: 20 } }).p50;
    expect(cool).toBeGreaterThan(warm);
  });
});

describe('failure-mode classification', () => {
  // Contract: each food×material×environment hazard produces its mode with a
  // mechanism; a well-matched pair produces none of that hazard.
  const cases: [string, any, string][] = [
    ['foil on tomato → anaerobic collapse (high, early)', classifyFailureModes(material('foil-lam'), tomato, tomato.properties, storage, 3.4, 5), 'anaerobic'],
    ['paper on biscuits → moisture gain', classifyFailureModes(material('paper'), commodity('biscuits'), commodity('biscuits').properties, { temperatureC: 25, rhPct: 55, targetShelfLifeDays: 90, environment: 'ambient' }, undefined, 3), 'moisture-gain'],
    ['banana stored below its floor → chilling injury', classifyFailureModes(material('ldpe'), commodity('banana'), commodity('banana').properties, { ...storage, temperatureC: 5 }, 100, 10), 'chilling'],
    ['well-matched film on tomato → no anaerobic mode', classifyFailureModes(material('multi-3layer'), tomato, tomato.properties, storage, 3.4, 5), '!anaerobic'],
  ];

  it.each(cases)('%s', (_n, modes, target) => {
    const found = modes.find((m: any) => m.id === target.replace('!', ''));
    if (target.startsWith('!')) expect(found).toBeUndefined();
    else {
      expect(found).toBeDefined();
      expect(found.mechanism.length).toBeGreaterThan(0);
    }
  });

  it('anaerobic collapse is high-severity, early-onset, and mitigated by OTR/perforation', () => {
    const m = classifyFailureModes(material('foil-lam'), tomato, tomato.properties, storage, 3.4, 5).find((x) => x.id === 'anaerobic')!;
    expect(m.severity).toBe('high');
    expect(m.onsetDays!).toBeLessThanOrEqual(3);
    expect(m.mitigation).toMatch(/perforat|OTR/i);
  });

  it('risk timeline accumulates toward failure onset', () => {
    const modes = classifyFailureModes(material('foil-lam'), tomato, tomato.properties, storage, 3.4, 5);
    const timeline = buildRiskTimeline(modes, material('foil-lam'), tomato.properties, storage, 10);
    expect(timeline).toHaveLength(10);
    expect(timeline[8].overall).toBeGreaterThanOrEqual(timeline[1].overall);
  });
});

describe('micro-perforation physics', () => {
  const metPet = material('met-pet');
  const otr = (count: number, diameterUm: number) => effectiveOtr(metPet, 30, 0.06, { count, diameterUm }).perfOtr;

  it('perforations add exchange on top of the film barrier', () => {
    const filmOnly = effectiveOtr(metPet, 30, 0.06, null).totalOtr;
    expect(effectiveOtr(metPet, 30, 0.06, { count: 6, diameterUm: 100 }).totalOtr).toBeGreaterThan(filmOnly);
  });

  it('orifice conductance table: count scales linearly, diameter grows sub-quadratically (end-effect damped)', () => {
    expect(otr(4, 100) / otr(1, 100)).toBeCloseTo(4, 5);
    const ratio = otr(1, 100) / otr(1, 50);
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(4);
  });

  it('more perforations push the MAP atmosphere toward air', () => {
    const sim = (perf: any) => simulateMap({ props: tomato.properties, storage, material: metPet, days: 8, perforations: perf }).series.at(-1)!.o2Pct;
    expect(sim({ count: 10, diameterUm: 200 })).toBeGreaterThanOrEqual(sim(null));
  });
});

describe('supply-chain TTT engine', () => {
  const multi = material('multi-3layer');
  const budget = () => {
    const r = runAnalysis({ commodityId: 'tomato', storage, transport: {}, business: {}, priority: 'balanced' } as any, ctx);
    return (r.shelfLife.daysLow + r.shelfLife.daysHigh) / 2;
  };
  const leg = (name: string, durationDays: number, tempC: number, coldChain: boolean) => ({ name, mode: 'road' as const, durationDays, tempC, rhPct: 85, coldChain });

  it('hot chains consume more shelf life than cold chains over equal calendar days', () => {
    const hot = simulateSupplyChain({ commodity: tomato, props: tomato.properties, material: multi, legs: DEFAULT_SUPPLY_CHAIN, shelfLifeBudgetDays: budget() });
    const cold = simulateSupplyChain({ commodity: tomato, props: tomato.properties, material: multi, legs: [leg('cold', 5, 8, true)], shelfLifeBudgetDays: budget() });
    expect(hot.shelfLifeUsedDays).toBeGreaterThan(cold.shelfLifeUsedDays);
  });

  it('verdict boundary table', () => {
    const b = budget();
    // quick cold run → VIABLE; hot multi-day chain → FAILURE with no budget left
    const viable = simulateSupplyChain({ commodity: tomato, props: tomato.properties, material: multi, legs: [leg('quick', 1, 8, true)], shelfLifeBudgetDays: b });
    expect(viable.verdict).toMatch(/VIABLE/);
    const failure = simulateSupplyChain({ commodity: tomato, props: tomato.properties, material: multi, legs: [leg('hot week', 7, 35, false)], shelfLifeBudgetDays: b });
    expect(failure.verdict).toMatch(/FAILURE/);
    expect(failure.remainingShelfLifeDays![0]).toBe(0);
  });

  it('per-leg accounting sums exactly to the reported total', () => {
    const r = simulateSupplyChain({ commodity: tomato, props: tomato.properties, material: multi, legs: DEFAULT_SUPPLY_CHAIN, shelfLifeBudgetDays: 15 });
    expect(r.legs.reduce((a, l) => a + l.shelfLifeUsedDays, 0)).toBeCloseTo(r.shelfLifeUsedDays, 2);
  });
});

describe('forced-material pipeline (Failure Lab backend)', () => {
  it('forced infeasible material becomes primary with anoxic veto + failure modes', () => {
    const r = runAnalysis({ commodityId: 'tomato', storage, transport: {}, business: {}, priority: 'balanced', forcedMaterialId: 'foil-lam' } as any, ctx);
    expect(r.primary.material.id).toBe('foil-lam');
    expect(r.primary.score.infeasible.length).toBeGreaterThan(0);
    expect(r.failureModes.length).toBeGreaterThan(0);
    expect(r.riskTimeline.length).toBeGreaterThanOrEqual(14);
  });
});
