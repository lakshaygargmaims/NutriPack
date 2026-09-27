import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAnalysis } from '@/lib/engine/pipeline';
import { engineContext } from '@/lib/server/context';
import { runMonteCarlo } from '@/lib/engine/monteCarlo';
import type { AnalysisInput } from '@/lib/domain/types';

const schema = z.object({
  input: z.any(),
  materialId: z.string().optional(),
  draws: z.number().int().min(200).max(20000).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, errors: ['Invalid Monte Carlo request'] }, { status: 400 });
  const { input, materialId, draws } = parsed.data as { input: AnalysisInput; materialId?: string; draws?: number };

  try {
    // Run the (deterministic) pipeline first; forced material supported here too.
    const analysis = runAnalysis(materialId ? { ...input, forcedMaterialId: materialId } : input, engineContext());

    const mc = runMonteCarlo({
      commodity: analysis.commodity,
      props: analysis.input.resolvedProperties,
      storage: {
        temperatureC: analysis.twin.temperatureC,
        rhPct: analysis.twin.rhPct,
        targetShelfLifeDays: analysis.twin.targetShelfLifeDays,
        environment: analysis.input.storage.environment ?? 'ambient',
      },
      material: analysis.primary.material,
      oxygenFit: analysis.primary.score.breakdown.otrSuitability / 100,
      moistureFit: analysis.primary.score.breakdown.wvtrSuitability / 100,
      targetShelfLifeDays: analysis.twin.targetShelfLifeDays,
      draws,
    });

    return NextResponse.json({
      ok: true,
      monteCarlo: mc,
      material: { id: analysis.primary.material.id, name: analysis.primary.material.name },
      deterministic: {
        daysLow: analysis.shelfLife.daysLow,
        daysHigh: analysis.shelfLife.daysHigh,
        confidence: analysis.shelfLife.confidence,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, errors: [String(e.message ?? e)] }, { status: 400 });
  }
}
