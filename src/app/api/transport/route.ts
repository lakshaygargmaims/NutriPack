import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/server/store';
import { assessTransport } from '@/lib/engine/transport';
import { resolveProperties } from '@/lib/engine/pipeline';

const schema = z.object({
  commodityId: z.string(),
  transport: z.object({
    origin: z.string(),
    destination: z.string(),
    distanceKm: z.number(),
    mode: z.enum(['road', 'rail', 'air', 'sea', 'none']),
    durationDays: z.number(),
    expectedTempC: z.number(),
    expectedRhPct: z.number(),
    coldChain: z.boolean(),
  }),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, errors: ['Invalid transport assessment request'] }, { status: 400 });
  const { commodityId, transport } = parsed.data;
  const commodity = getDb().commodities.find((c) => c.id === commodityId);
  if (!commodity) return NextResponse.json({ ok: false, errors: ['Unknown commodity'] }, { status: 404 });
  const props = resolveProperties(commodity);
  return NextResponse.json({ ok: true, assessment: assessTransport(transport, commodity, props) });
}
