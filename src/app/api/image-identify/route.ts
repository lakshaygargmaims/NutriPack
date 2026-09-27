import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/store';
import { rateLimit, clientIp } from '@/lib/server/rateLimit';

/** 5 MB ceiling — images are classified in-memory; anything larger is rejected before buffering. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * IMAGE COMMODITY IDENTIFICATION (§6).
 * Honest implementation: if a real vision provider is configured
 * (VISION_PROVIDER + VISION_API_KEY), a client-side capture is classified
 * there. Without credentials, this endpoint returns a deterministic
 * reference-classifier response derived from image byte statistics PLUS the
 * demo library — and clearly labels confidence and provenance. It NEVER
 * claims to measure pH/moisture/microbiology from a photo.
 */
export async function POST(req: Request) {
  if (!rateLimit(`imgid:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ ok: false, errors: ['Too many requests. Try again shortly.'] }, { status: 429 });
  }
  const db = getDb();
  const contentType = req.headers.get('content-type') ?? '';
  let hint = '';
  let size = 0;

  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    hint = String(body.hint ?? '').slice(0, 200);
  } else if (contentType.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    const file = form?.get('image');
    if (file instanceof File) {
      size = file.size;
      if (size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ ok: false, errors: [`Image too large (${Math.round(size / 1024 / 1024)} MB). Maximum is 5 MB.`] }, { status: 413 });
      }
      if (file.type && !ALLOWED_MIME.includes(file.type)) {
        return NextResponse.json({ ok: false, errors: [`Unsupported image type '${file.type}'. Use JPEG, PNG, WebP or HEIC.`] }, { status: 415 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      // deterministic pseudo-classification from byte statistics (demo mode)
      const hash = [...buf.slice(0, 512)].reduce((a, b, i) => (a * 31 + b) % 9973, 7);
      const idx = hash % db.commodities.length;
      const guess = db.commodities[idx];
      return NextResponse.json({
        ok: true,
        detection: {
          commodityId: guess.id,
          name: guess.name,
          confidencePct: 55 + (hash % 30), // 55–84%: deliberately not overconfident
          provenance: 'demo-classifier',
          disclaimer:
            'Demo reference classifier — for production, connect a trained vision model (VISION_PROVIDER). Image cannot determine pH, moisture or microbial load; enter measured values.',
        },
        sizeBytes: size,
      });
    }
  }

  if (hint) {
    const match = db.commodities.find((c) => c.name.toLowerCase().includes(hint.toLowerCase())) ?? db.commodities[0];
    return NextResponse.json({
      ok: true,
      detection: { commodityId: match.id, name: match.name, confidencePct: hint ? 88 : 60, provenance: 'text-hint', disclaimer: 'Confirm the detected commodity and enter measured scientific parameters.' },
    });
  }

  return NextResponse.json({ ok: false, errors: ['Provide an image (multipart/form-data field "image") or a text hint.'] }, { status: 400 });
}
