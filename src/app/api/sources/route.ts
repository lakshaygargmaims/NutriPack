import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  return NextResponse.json({ ok: true, sources: db.sources });
}
