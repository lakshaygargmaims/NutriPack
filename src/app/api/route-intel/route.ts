import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CITIES, findCity, haversineKm } from '@/lib/engine/cities';
import { fetchRoute } from '@/lib/server/osrm';
import { analyzeRoute, routePackagingDelta } from '@/lib/engine/routeRisk';
import { getDb } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const schema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  mode: z.enum(['road', 'rail', 'air', 'sea']).default('road'),
  assumedTempC: z.number().min(-25).max(55).default(30),
  assumedRhPct: z.number().min(1).max(100).default(65),
  handlingPoints: z.number().int().min(0).max(10).default(2),
  coldChain: z.boolean().default(false),
  commodityId: z.string().optional(),
});

export async function GET() {
  return NextResponse.json({ ok: true, cities: CITIES });
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, errors: ['Invalid route request: origin, destination required'] }, { status: 400 });
  const p = parsed.data;

  const from = findCity(p.origin);
  const to = findCity(p.destination);
  if (!from || !to) {
    const known = CITIES.map((c) => c.name).join(', ');
    return NextResponse.json({ ok: false, errors: [`Unknown city. Known cities: ${known}`] }, { status: 400 });
  }

  const metrics = await fetchRoute(from, to, p.mode);
  const analysis = analyzeRoute({
    origin: from.name,
    destination: to.name,
    distanceKm: metrics.distanceKm ?? Math.round(haversineKm(from, to) * 1.25),
    durationHours: metrics.durationHours ?? 0,
    distanceSource: metrics.source === 'osrm' ? 'router' : 'fallback',
    
    mode: p.mode,
    assumedTempC: p.assumedTempC,
    assumedRhPct: p.assumedRhPct,
    handlingPoints: p.handlingPoints,
    coldChain: p.coldChain,
  });

  // Optional commodity context → packaging deltas
  let deltas = null;
  if (p.commodityId) {
    const commodity = getDb().commodities.find((c) => c.id === p.commodityId);
    if (commodity) deltas = routePackagingDelta(analysis, commodity);
  }

  return NextResponse.json({
    ok: true,
    origin: from,
    destination: to,
    mode: p.mode,
    metrics,
    analysis,
    deltas,
    label: 'prototype exposure model — assumptions labelled, not live telemetry',
  });
}
