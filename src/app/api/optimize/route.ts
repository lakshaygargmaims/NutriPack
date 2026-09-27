import { NextResponse } from 'next/server';
import { runAnalysis } from '@/lib/engine/pipeline';
import { engineContext } from '@/lib/server/context';
import { profileLabel, PROFILES } from '@/lib/engine/pipeline';

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.commodityId || !body?.priority) {
    return NextResponse.json({ ok: false, errors: ['commodityId and priority are required'] }, { status: 400 });
  }
  try {
    const result = runAnalysis(body, engineContext());
    const objectives = PROFILES.map((p) => {
      const top = result.recommendations[p][0];
      return {
        profile: p,
        label: profileLabel[p],
        materialName: top.material.name,
        costPerPackageInr: top.score.estimatedCostPerPackageInr,
        shelfLifeDays: top.score.estimatedShelfLifeDays,
        sustainabilityScore: top.score.sustainabilityScore,
        totalScore: top.score.total,
      };
    });
    return NextResponse.json({ ok: true, objectives });
  } catch (e: any) {
    return NextResponse.json({ ok: false, errors: [String(e.message ?? e)] }, { status: 400 });
  }
}
