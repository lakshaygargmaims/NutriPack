import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAnalysis } from '@/lib/engine/pipeline';
import { engineContext } from '@/lib/server/context';
import type { AnalysisInput } from '@/lib/domain/types';

const schema = z.object({
  commodityId: z.string().min(1),
  priority: z.enum(['max_shelf_life', 'min_cost', 'max_sustainability', 'transport_durability', 'balanced']),
  storage: z.any().optional(),
  transport: z.any().optional(),
  business: z.any().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, errors: ['commodityId and priority are required'] }, { status: 400 });
  const input = parsed.data as AnalysisInput;
  try {
    const result = runAnalysis(input, engineContext());
    return NextResponse.json({
      ok: true,
      primary: result.primary,
      requirements: result.requirements,
      shelfLife: result.shelfLife,
      alternatives: result.alternativesComparison,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, errors: [String(e.message ?? e)] }, { status: 400 });
  }
}
