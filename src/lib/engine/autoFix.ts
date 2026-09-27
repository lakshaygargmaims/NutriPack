import type { AnalysisInput, AnalysisResult, FailureMode } from '../domain/types';
import { runAnalysis } from './pipeline';
import type { EngineContext } from './pipeline';
import { clamp, round } from './util';

/**
 * FAILURE → AI CORRECTION LOOP (prototype heuristic).
 * Reads the failure modes of a first-pass analysis, derives concrete packaging
 * modifications, re-runs the pipeline, and reports the delta. This is a
 * rule-based design assistant — explicitly NOT physical laboratory validation.
 */

export interface FixStep {
  problem: string; // failure mode id + summary
  cause: string;
  change: string; // human description of the applied modification
}

export interface AutoFixResult {
  original: AnalysisResult;
  fixed: AnalysisResult | null; // null if no fix applicable
  steps: FixStep[];
  comparison: {
    metric: string;
    before: string;
    after: string;
    better: boolean;
  }[];
  label: 'prototype simulation — not physical validation';
}

/** Deterministic "AI" fix policy: map each failure mode to a packaging change. */
function deriveFixes(modes: FailureMode[], base: AnalysisResult): FixStep[] {
  const steps: FixStep[] = [];
  const material = base.primary.material;

  const step = (m: FailureMode, change: string): FixStep => ({ problem: `${m.name} risk (${m.probability}%)`, cause: m.mechanism, change });

  for (const m of modes) {
    switch (m.id) {
      case 'anaerobic':
      case 'condensation':
        steps.push(step(m, 'Switch to a micro-perforated / higher-OTR structure so the package can breathe and purge condensation'));
        break;
      case 'moisture-gain':
        steps.push(step(m, `Increase film thickness to ~${clamp((material.thicknessUmRange[0] + material.thicknessUmRange[1]) / 2 + 15, 15, 200)} µm — barrier scales with thickness`));
        break;
      case 'oxidation':
        steps.push(step(m, 'Move to a lower-OTR laminate to slow oxygen ingress'));
        break;
      case 'physical':
        steps.push(step(m, `Raise film thickness to ~${clamp(material.thicknessUmRange[1] + 10, 20, 250)} µm for mechanical protection`));
        break;
      case 'thermal-abuse':
        steps.push(step(m, 'Thicker multilayer laminate buffers temperature swings better'));
        break;
      default:
        break; // chilling/freezing are storage decisions, not packaging fixes — honest no-op
    }
  }
  return steps;
}

export function runAutoFix(input: AnalysisInput, ctx: EngineContext): AutoFixResult {
  const original = runAnalysis(input, ctx);
  const steps = deriveFixes(original.failureModes ?? [], original);
  if (!steps.length) {
    return { original, fixed: null, steps: [], comparison: [], label: 'prototype simulation — not physical validation' };
  }

  // Fixed run: if any step calls for a lower-OTR / perforated structure, force the
  // micro-perforated film (the one concrete structure the rule engine can apply);
  // otherwise thickness advice is advisory and the re-run uses the same material.
  const wantsBreathable = steps.some((s) => /micro-perforated/.test(s.change));
  const wantsLowOtr = steps.some((s) => /lower-OTR|multilayer/.test(s.change));
  const fixedInput: AnalysisInput = {
    ...input,
    forcedMaterialId: wantsBreathable ? 'micro-perf-pp' : wantsLowOtr ? 'multi-3layer' : input.forcedMaterialId,
  };
  const fixed = runAnalysis(fixedInput, ctx);

  const mid = (x: AnalysisResult) => (x.shelfLife.daysLow + x.shelfLife.daysHigh) / 2;
  const worstRisk = (x: AnalysisResult) => Math.max(0, ...(x.failureModes ?? []).map((m) => m.probability));
  const comparison = [
    {
      metric: 'Modelled shelf life (mid)',
      before: `${round(mid(original), 1)} d`,
      after: `${round(mid(fixed), 1)} d`,
      better: mid(fixed) >= mid(original),
    },
    {
      metric: 'Worst failure-mode probability',
      before: `${worstRisk(original)}%`,
      after: `${worstRisk(fixed)}%`,
      better: worstRisk(fixed) <= worstRisk(original),
    },
    {
      metric: 'Est. cost per package',
      before: `₹${original.primary.score.estimatedCostPerPackageInr}`,
      after: `₹${fixed.primary.score.estimatedCostPerPackageInr}`,
      better: fixed.primary.score.estimatedCostPerPackageInr <= original.primary.score.estimatedCostPerPackageInr * 1.5, // small cost increase accepted for risk reduction
    },
    {
      metric: 'Sustainability (0–100, higher better)',
      before: String(original.sustainability.total),
      after: String(fixed.sustainability.total),
      better: fixed.sustainability.total >= original.sustainability.total - 5,
    },
  ];

  return {
    original,
    fixed,
    steps,
    comparison,
    label: 'prototype simulation — not physical validation',
  };
}
