import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAnalysis } from '@/lib/engine/pipeline';
import { engineContext } from '@/lib/server/context';
import type { DigitalTwinState } from '@/lib/domain/types';

const schema = z.object({
  input: z.any(), // full AnalysisInput
  changes: z.object({
    temperatureC: z.number().min(-25).max(55).optional(),
    rhPct: z.number().min(1).max(100).optional(),
    targetShelfLifeDays: z.number().int().min(1).max(1095).optional(),
    thicknessUm: z.number().min(5).max(500).optional(),
    storageDays: z.number().min(1).max(3650).optional(),
    materialId: z.string().optional(), // force material (Failure Lab)
  }),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, errors: ['Invalid simulation request'] }, { status: 400 });
  const { input, changes } = parsed.data as { input: any; changes: any };

  // Apply what-if changes to storage conditions (+ optional forced material), then re-run.
  const modified = {
    ...input,
    storage: {
      ...input.storage,
      ...(changes.temperatureC !== undefined ? { temperatureC: changes.temperatureC } : {}),
      ...(changes.rhPct !== undefined ? { rhPct: changes.rhPct } : {}),
      ...(changes.targetShelfLifeDays !== undefined ? { targetShelfLifeDays: changes.targetShelfLifeDays } : {}),
    },
    ...(changes.materialId ? { forcedMaterialId: changes.materialId } : {}),
  };
  const result = runAnalysis(modified, engineContext());
  const twin: DigitalTwinState = result.twin;
  return NextResponse.json({
    ok: true,
    twin,
    shelfLife: result.shelfLife,
    map: { series: twin.mapState },
    failureModes: result.failureModes,
    riskTimeline: result.riskTimeline,
    forcedMaterialId: result.forcedMaterialId,
    forcedMaterialName: result.primary.material.name,
  });
}
