import { NextResponse } from 'next/server';
import { runAutoFix } from '@/lib/engine/autoFix';
import { engineContext } from '@/lib/server/context';
import type { AnalysisInput } from '@/lib/domain/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.input) return NextResponse.json({ ok: false, errors: ['input (AnalysisInput) required'] }, { status: 400 });
  try {
    const result = runAutoFix(body.input as AnalysisInput, engineContext());
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, errors: [String(e.message ?? e)] }, { status: 400 });
  }
}
