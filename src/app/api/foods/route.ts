import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    ok: true,
    foods: db.commodities.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      form: c.form,
      typicalStorageEnv: c.typicalStorageEnv,
      storageTempRangeC: c.storageTempRangeC,
      storageRhRangePct: c.storageRhRangePct,
      indicativeShelfLifeDays: c.indicativeShelfLifeDays,
      properties: c.properties,
      notes: c.notes,
      sourceIds: c.sourceIds,
    })),
  });
}
