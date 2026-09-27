import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const db = getDb();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').toLowerCase();
  const category = url.searchParams.get('category');

  let materials = db.materials;
  if (q) {
    materials = materials.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.category.includes(q) ||
        m.typicalApplications.some((a) => a.toLowerCase().includes(q)),
    );
  }
  if (category) materials = materials.filter((m) => m.category === category);

  return NextResponse.json({ ok: true, materials, count: materials.length });
}
