import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/server/store';
import { resolveProperties } from '@/lib/engine/pipeline';
import { generateStructures } from '@/lib/engine/structureGenerator';

export const dynamic = 'force-dynamic';

const schema = z.object({
  commodityId: z.string().min(1),
  materialId: z.string().optional(),
  priority: z.enum(['max_shelf_life', 'min_cost', 'max_sustainability', 'transport_durability', 'balanced']).default('balanced'),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, errors: ['commodityId required'] }, { status: 400 });
  const p = parsed.data;
  const db = getDb();
  const commodity = db.commodities.find((c) => c.id === p.commodityId);
  if (!commodity) return NextResponse.json({ ok: false, errors: [`Unknown commodity '${p.commodityId}'. Pick one from /api/foods.`] }, { status: 400 });

  const material = p.materialId ? db.materials.find((m) => m.id === p.materialId) ?? db.materials[0] : db.materials[0];
  const props = resolveProperties(commodity);

  // Derive barrier needs from commodity properties (requirement-translation reuse)
  const needs = {
    oxygen: (props.oxygenSensitivity >= 4 ? 'high' : props.oxygenSensitivity >= 2 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
    moisture: (props.moistureSensitivity >= 4 ? 'high' : props.moistureSensitivity >= 2 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
    light: (props.lightSensitivity >= 4 ? 'high' : props.lightSensitivity >= 2 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
    mechanical: (commodity.form === 'fresh' ? 'high' : 'medium') as 'low' | 'medium' | 'high',
    needsSeal: true,
    respiring: (props.respirationRateMgCo2KgH ?? 0) > 0.5,
  };

  const structures = generateStructures(material, commodity, needs);
  return NextResponse.json({ ok: true, commodity: commodity.id, baseMaterial: material.id, needs, structures, label: 'rule-generated candidates — every structure requires pack validation' });
}
