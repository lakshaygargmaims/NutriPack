import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { AnalysisInput, AnalysisResult, FoodProperties } from '@/lib/domain/types';
import { runAnalysis, EngineValidationError } from '@/lib/engine/pipeline';
import { engineContext } from '@/lib/server/context';
import { audit, getDb, updateDb } from '@/lib/server/store';
import { parseAuthHeader, verifyToken } from '@/lib/server/auth';

const foodPropsSchema = z.object({
  moistureContentPct: z.number().min(0).max(100).optional(),
  ph: z.number().min(0).max(14).optional(),
  fatPct: z.number().min(0).max(100).optional(),
  proteinPct: z.number().min(0).max(100).optional(),
  waterActivity: z.number().min(0).max(1).optional(),
  respirationRateMgCo2KgH: z.number().min(0).max(500).optional(),
  oxygenSensitivity: z.number().int().min(0).max(5),
  moistureSensitivity: z.number().int().min(0).max(5),
  lightSensitivity: z.number().int().min(0).max(5),
  temperatureSensitivity: z.number().int().min(0).max(5),
});

const analysisSchema = z.object({
  commodityId: z.string().min(1),
  propertyOverrides: foodPropsSchema.partial().optional(),
  storage: z
    .object({
      temperatureC: z.number().min(-25).max(55).optional(),
      rhPct: z.number().min(1).max(100).optional(),
      targetShelfLifeDays: z.number().int().min(1).max(1095).optional(),
      environment: z.enum(['ambient', 'refrigerated', 'frozen', 'controlled']).optional(),
    })
    .optional(),
  transport: z
    .object({
      origin: z.string().optional(),
      destination: z.string().optional(),
      distanceKm: z.number().min(0).max(30000).optional(),
      mode: z.enum(['road', 'rail', 'air', 'sea', 'none']).optional(),
      durationDays: z.number().min(0).max(60).optional(),
      expectedTempC: z.number().min(-30).max(60).optional(),
      expectedRhPct: z.number().min(1).max(100).optional(),
      coldChain: z.boolean().optional(),
    })
    .optional(),
  business: z
    .object({
      budgetPerPackageInr: z.number().min(0).optional(),
      packageSizeGrams: z.number().min(1).max(100000).optional(),
      productionVolumePerMonth: z.number().min(0).optional(),
    })
    .optional(),
  priority: z.enum(['max_shelf_life', 'min_cost', 'max_sustainability', 'transport_durability', 'balanced']),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = analysisSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
    }
    const input = parsed.data as AnalysisInput;

    const result = runAnalysis(input, engineContext());

    // persist as a new project version if authenticated
    const user = verifyToken(parseAuthHeader(req));
    let projectId: string | null = null;
    if (user) {
      const commodityName = result.commodity.name;
      const route = input.transport?.origin && input.transport?.destination ? `${input.transport.origin} → ${input.transport.destination}` : 'No transport leg';
      projectId = updateDb((db) => {
        const existing = db.projects.find((p) => p.name === `${commodityName} · ${route}`);
        const versionLabel = `V${(existing?.versions.length ?? 0) + 1}`;
        if (existing) {
          existing.versions.push({ label: versionLabel, result, createdAt: result.createdAt });
          // Bound store growth: full results are ~75 KB each — keep the latest
          // 10 versions per project (the report/compare flows use recent ones).
          if (existing.versions.length > 10) existing.versions = existing.versions.slice(-10);
          existing.updatedAt = new Date().toISOString();
          return existing.id;
        }
        const id = `p-${Date.now()}`;
        db.projects.unshift({
          id,
          name: `${commodityName} · ${route}`,
          versions: [{ label: versionLabel, result, createdAt: result.createdAt }],
          createdAt: result.createdAt,
          updatedAt: result.createdAt,
        });
        return id;
      });
      audit(user.email, 'analysis.run', `project=${projectId} commodity=${input.commodityId}`);
    }

    return NextResponse.json({ ok: true, projectId, result });
  } catch (err) {
    if (err instanceof EngineValidationError) {
      return NextResponse.json({ ok: false, errors: [err.message] }, { status: 400 });
    }
    console.error('analysis error', err);
    return NextResponse.json({ ok: false, errors: ['Internal error during analysis'] }, { status: 500 });
  }
}

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    ok: true,
    projects: db.projects.map((p) => ({
      id: p.id,
      name: p.name,
      versions: p.versions.map((v) => ({ label: v.label, createdAt: v.createdAt, commodity: v.result.commodity.name })),
      updatedAt: p.updatedAt,
    })),
  });
}

export type { AnalysisResult };
