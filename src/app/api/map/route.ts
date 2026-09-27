import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/server/store';
import { simulateMap } from '@/lib/engine/map';
import { resolveProperties } from '@/lib/engine/pipeline';

const schema = z.object({
  commodityId: z.string(),
  materialId: z.string(),
  temperatureC: z.number().min(-25).max(55),
  rhPct: z.number().min(1).max(100),
  areaM2: z.number().min(0.01).max(2).optional(),
  headspaceMl: z.number().min(10).max(10000).optional(),
  thicknessUm: z.number().min(5).max(500).optional(),
  initialO2Pct: z.number().min(1).max(21).optional(),
  initialCo2Pct: z.number().min(0).max(30).optional(),
  days: z.number().int().min(1).max(60).optional(),
  perforations: z
    .object({
      count: z.number().int().min(0).max(200),
      diameterUm: z.number().min(20).max(1000),
    })
    .nullable()
    .optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, errors: ['Invalid MAP simulation request'] }, { status: 400 });
  const p = parsed.data;
  const db = getDb();
  const commodity = db.commodities.find((c) => c.id === p.commodityId);
  const material = db.materials.find((m) => m.id === p.materialId);
  if (!commodity || !material) return NextResponse.json({ ok: false, errors: ['Unknown commodity or material'] }, { status: 404 });

  const props = resolveProperties(commodity);
  const sim = simulateMap({
    props,
    storage: { temperatureC: p.temperatureC, rhPct: p.rhPct, targetShelfLifeDays: 0, environment: 'refrigerated' },
    material,
    areaM2: p.areaM2,
    headspaceMl: p.headspaceMl,
    thicknessUm: p.thicknessUm,
    initialO2Pct: p.initialO2Pct,
    initialCo2Pct: p.initialCo2Pct,
    days: p.days,
    perforations: p.perforations ?? null,
  });
  return NextResponse.json({ ok: true, ...sim, perforations: p.perforations ?? null, label: 'model simulation' });
}
