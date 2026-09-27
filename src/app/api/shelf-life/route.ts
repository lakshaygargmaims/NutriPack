import { NextResponse } from 'next/server';
import { runAnalysis } from '@/lib/engine/pipeline';
import { engineContext } from '@/lib/server/context';

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.commodityId || !body?.priority) {
    return NextResponse.json({ ok: false, errors: ['commodityId and priority are required'] }, { status: 400 });
  }
  try {
    const result = runAnalysis(body, engineContext());
    return NextResponse.json({
      ok: true,
      shelfLife: result.shelfLife,
      risks: { oxygen: result.twin.oxygenRisk, moisture: result.twin.moistureRisk, spoilage: result.twin.spoilageRisk, transport: result.twin.transportRisk },
      disclaimer: result.shelfLife.disclaimer,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, errors: [String(e.message ?? e)] }, { status: 400 });
  }
}
