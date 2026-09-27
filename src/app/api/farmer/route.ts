import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAnalysis } from '@/lib/engine/pipeline';
import { engineContext } from '@/lib/server/context';
import { findCity, haversineKm } from '@/lib/engine/cities';
import { analyzeRoute } from '@/lib/engine/routeRisk';
import { round } from '@/lib/engine/util';
import type { AnalysisInput } from '@/lib/domain/types';

export const dynamic = 'force-dynamic';

const schema = z.object({
  commodityId: z.string().min(1),
  quantityKg: z.number().min(1).max(100000),
  origin: z.string().min(1),
  destination: z.string().min(1),
  days: z.number().min(0.5).max(30).default(2),
});

function costBand(r: number): string {
  if (r < 0.75) return '₹0.5–1 per pack (economy)';
  if (r < 1.5) return '₹1–2 per pack (standard)';
  return '₹2–4 per pack (premium protection)';
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: ['Need: commodityId, quantityKg, origin, destination (days optional)'] }, { status: 400 });
  }
  const p = parsed.data;
  const from = findCity(p.origin);
  const to = findCity(p.destination);
  if (!from || !to) {
    return NextResponse.json({ ok: false, errors: [`Unknown city. Try: Delhi, Jaipur, Mumbai, Lucknow, Bengaluru, …`] }, { status: 400 });
  }

  const analysis = analyzeRoute({
    origin: from.name,
    destination: to.name,
    distanceKm: haversineKm(from, to) * 1.25, // road-factor estimate; farmer mode skips the router call
    durationHours: p.days * 24,
    mode: 'road',
    assumedTempC: 30,
    assumedRhPct: 65,
    handlingPoints: p.days >= 2 ? 3 : 1,
    coldChain: false,
  });

  const input: AnalysisInput = {
    commodityId: p.commodityId,
    storage: { temperatureC: 8, rhPct: 85, targetShelfLifeDays: Math.max(3, Math.round(p.days + 5)), environment: 'refrigerated' },
    transport: { origin: from.name, destination: to.name, distanceKm: analysis.distanceKm, mode: 'road', durationDays: p.days, expectedTempC: 30, expectedRhPct: 65, coldChain: false },
    business: { packageSizeGrams: 1000, productionVolumePerMonth: Math.max(1000, Math.round(p.quantityKg)) },
    priority: 'balanced',
  };

  try {
    const result = runAnalysis(input, engineContext());
    const m = result.primary.material;
    return NextResponse.json({
      ok: true,
      simple: {
        pack: `${m.name.split(' (')[0]} — sell in sealed bags or crates lined with this material`,
        packShort: m.name.split(' (')[0],
        cost: costBand(result.primary.score.estimatedCostPerPackageInr),
        transportRisk: result.transport.suitability === 'high' ? 'LOW' : result.transport.suitability === 'medium' ? 'MEDIUM' : 'HIGH',
        keep: 'Keep loads cool and shaded; avoid leaving packs in the sun at the mandi',
        why: result.primary.reasons.filter((r) => r.verdict === 'pro').slice(0, 3).map((r) => r.text),
      },
      route: { from: from.name, to: to.name, distanceKm: analysis.distanceKm, days: p.days, overallRisk: analysis.overallRisk },
      estimatedShelfLifeDays: result.shelfLife,
      material: m,
      label: 'model estimate — try a sample pack before large orders',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, errors: [String(e.message ?? e)] }, { status: 400 });
  }
}
