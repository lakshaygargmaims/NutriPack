import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAnalysis } from '@/lib/engine/pipeline';
import { engineContext } from '@/lib/server/context';
import { simulateSupplyChain, DEFAULT_SUPPLY_CHAIN } from '@/lib/engine/supplyChain';
import type { AnalysisInput } from '@/lib/domain/types';

const legSchema = z.object({
  name: z.string().min(1).max(80),
  mode: z.enum(['road', 'rail', 'air', 'sea', 'none']),
  durationDays: z.number().min(0.1).max(60),
  tempC: z.number().min(-30).max(60),
  rhPct: z.number().min(1).max(100),
  coldChain: z.boolean(),
});

const schema = z.object({
  input: z.any(),
  legs: z.array(legSchema).min(1).max(8).optional(),
  materialId: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, errors: ['Invalid supply-chain request'] }, { status: 400 });
  const { input, legs, materialId } = parsed.data as { input: AnalysisInput; legs?: any[]; materialId?: string };

  try {
    const analysis = runAnalysis(materialId ? { ...input, forcedMaterialId: materialId } : input, engineContext());
    const chain = simulateSupplyChain({
      commodity: analysis.commodity,
      props: analysis.input.resolvedProperties,
      material: analysis.primary.material,
      legs: (legs as any) ?? DEFAULT_SUPPLY_CHAIN,
      shelfLifeBudgetDays: (analysis.shelfLife.daysLow + analysis.shelfLife.daysHigh) / 2,
    });
    return NextResponse.json({
      ok: true,
      supplyChain: chain,
      material: { id: analysis.primary.material.id, name: analysis.primary.material.name },
      shelfLifeBudgetDays: analysis.shelfLife,
      label: 'model simulation (TTT)',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, errors: [String(e.message ?? e)] }, { status: 400 });
  }
}
