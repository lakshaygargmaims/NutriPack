import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ValidationExperiment, ValidationObservation } from '@/lib/domain/types';
import { getDb, updateDb, audit } from '@/lib/server/store';
import { parseAuthHeader, verifyToken } from '@/lib/server/auth';

const obsSchema = z.object({
  experimentId: z.string(),
  day: z.number().int().min(0).max(3650),
  weightG: z.number().min(0).optional(),
  weightLossPct: z.number().min(0).max(100).optional(),
  ph: z.number().min(0).max(14).optional(),
  moisturePct: z.number().min(0).max(100).optional(),
  colorL: z.number().min(0).max(100).optional(),
  textureN: z.number().min(0).max(1000).optional(),
  spoilageScore: z.number().int().min(0).max(5).optional(),
  temperatureC: z.number().optional(),
  rhPct: z.number().optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(req: Request) {
  const db = getDb();
  const url = new URL(req.url);
  const id = url.searchParams.get('experimentId');
  const experiments = id ? db.experiments.filter((e) => e.id === id) : db.experiments;
  return NextResponse.json({ ok: true, experiments });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, errors: ['Invalid JSON'] }, { status: 400 });

  // create experiment — authenticated users only (audit trail integrity)
  if (body.kind === 'experiment') {
    const user = verifyToken(parseAuthHeader(req));
    if (!user) return NextResponse.json({ ok: false, errors: ['Sign in to create a validation experiment.'] }, { status: 401 });
    const exp: ValidationExperiment = {
      id: `exp-${Date.now()}`,
      projectId: body.projectId,
      commodityId: String(body.commodityId ?? 'tomato'),
      materialId: String(body.materialId ?? 'ldpe'),
      title: String(body.title ?? 'Validation run'),
      status: 'running',
      predictedShelfLife: [Number(body.predictedLow) || 8, Number(body.predictedHigh) || 12],
      observations: [],
      createdAt: new Date().toISOString(),
    };
    updateDb((db) => db.experiments.unshift(exp));
    audit(user.email, 'experiment.create', exp.id);
    return NextResponse.json({ ok: true, experiment: exp });
  }

  // add observation — authenticated users only (experiment data integrity)
  const user = verifyToken(parseAuthHeader(req));
  if (!user) return NextResponse.json({ ok: false, errors: ['Sign in to record observations.'] }, { status: 401 });
  const parsed = obsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  }
  const data = parsed.data;
  const obs: ValidationObservation = { ...data, id: `obs-${Date.now()}`, createdAt: new Date().toISOString() };

  const experiment = updateDb((db) => {
    const exp = db.experiments.find((e) => e.id === data.experimentId);
    if (!exp) return null;
    exp.observations.push(obs);
    exp.observations.sort((a, b) => a.day - b.day);
    return exp;
  });
  if (!experiment) return NextResponse.json({ ok: false, errors: ['Experiment not found'] }, { status: 404 });

  // closed-loop: compare against prediction when spoilage indicates endpoint
  let comparison = null;
  if ((obs.spoilageScore ?? 0) >= 4) {
    const actual = obs.day;
    const [low, high] = experiment.predictedShelfLife;
    const errorPct = Math.round(Math.abs(actual - (low + high) / 2) / Math.max((low + high) / 2, 1) * 100);
    comparison = {
      actualShelfLifeDays: actual,
      predictedShelfLifeDays: [low, high] as [number, number],
      predictionErrorPct: errorPct,
      note: 'Prediction error vs model estimate. Feeds future model calibration (closed loop).',
    };
    updateDb((db) => {
      const exp = db.experiments.find((e) => e.id === data.experimentId);
      if (exp) {
        exp.actualShelfLifeDays = actual;
        exp.status = 'completed';
      }
    });
    audit(user.email, 'experiment.complete', data.experimentId);
  }
  return NextResponse.json({ ok: true, observation: obs, comparison });
}
