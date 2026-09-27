import { NextResponse } from 'next/server';
import { z } from 'zod';
import { audit } from '@/lib/server/store';
import { parseAuthHeader, verifyToken } from '@/lib/server/auth';
import type { AnalysisResult } from '@/lib/domain/types';

const schema = z.object({
  result: z.object({ commodity: z.object({ name: z.string() }).passthrough() }).passthrough(),
  projectId: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, errors: ['Invalid report payload'] }, { status: 400 });
  const { result, projectId } = parsed.data as unknown as { result: AnalysisResult; projectId?: string };

  const user = verifyToken(parseAuthHeader(req));
  const reportId = `r-${Date.now()}`;
  const sections = [
    'Food details', 'Environmental conditions', 'Packaging requirements', 'Recommended material', 'OTR/WVTR/Thickness/Sealability',
    'MAP suitability', 'Estimated shelf life', 'Cost', 'Sustainability', 'Transport analysis', 'Alternative materials',
    'Explanation', 'Assumptions & data gaps', 'Data sources', 'Validation status', 'Disclaimer',
  ];

  if (user) {
    audit(user.email, 'report.generate', `${reportId} project=${projectId ?? 'n/a'}`);
  }

  return NextResponse.json({ ok: true, reportId, sections, disclaimer: 'All quantitative outputs are model-based estimates and require experimental validation.' });
}
