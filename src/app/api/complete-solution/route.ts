import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildCompleteSolutions } from '@/lib/engine/completeSolution';
import { engineContext } from '@/lib/server/context';
import { PACKAGING_FORMATS, CLOSURES, SEALING_METHODS, SECONDARY_PACKAGING, TERTIARY_PACKAGING, INNER_COMPONENTS } from '@/lib/domain/packagingData';

export const dynamic = 'force-dynamic';

const schema = z.object({
  input: z.record(z.any()), // AnalysisInput
  quantityKg: z.number().min(1).max(100000).default(500),
  route: z
    .object({
      origin: z.string().default('Farm'),
      destination: z.string().default('Delhi wholesale market'),
      mode: z.enum(['road', 'rail', 'air', 'sea', 'none']).default('road'),
      distanceKm: z.number().min(0).max(30000).default(280),
      durationDays: z.number().min(0.1).max(60).default(1),
      coldChain: z.boolean().default(false),
      handlingPoints: z.number().int().min(0).max(10).default(2),
      source: z.enum(['router', 'assumption']).default('assumption'),
    })
    .default({}),
});

export async function GET() {
  return NextResponse.json({
    ok: true,
    formats: PACKAGING_FORMATS,
    closures: CLOSURES,
    sealingMethods: SEALING_METHODS,
    secondary: SECONDARY_PACKAGING,
    tertiary: TERTIARY_PACKAGING,
    innerComponents: INNER_COMPONENTS.map(({ id, name, purpose, dataType }) => ({ id, name, purpose, dataType })),
    label: 'demo/reference data — qualitative compatibility knowledge, not lab specs',
  });
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, errors: ['Invalid complete-solution request: input.commodityId required'] }, { status: 400 });
  const body = parsed.data;
  const commodityId = body.input?.commodityId;
  if (!commodityId || typeof commodityId !== 'string') {
    return NextResponse.json({ ok: false, errors: ["input.commodityId required — pick one from /api/foods"] }, { status: 400 });
  }

  try {
    const { solutions, base } = buildCompleteSolutions(
      body.input as any,
      { ...body.route, source: body.route.source },
      body.quantityKg,
      engineContext(),
    );
    return NextResponse.json({
      ok: true,
      solutions,
      shelfLife: base.shelfLife,
      label: 'complete packaging configuration — model-based candidates requiring validation',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, errors: [String(e.message ?? e)] }, { status: 400 });
  }
}
