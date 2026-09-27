import { NextResponse } from 'next/server';
import { runAnalysis } from '@/lib/engine/pipeline';
import { engineContext, DEMO_SCENARIOS } from '@/lib/server/context';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = engineContext();
  const scenarios = DEMO_SCENARIOS.map((s) => {
    const result = runAnalysis(s.input, ctx);
    return {
      id: s.id,
      title: s.title,
      blurb: s.blurb,
      input: s.input,
      result,
    };
  });
  return NextResponse.json({ ok: true, scenarios });
}
