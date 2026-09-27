import { NextResponse } from 'next/server';
import { getDb, updateDb, audit } from '@/lib/server/store';
import { parseAuthHeader, verifyToken } from '@/lib/server/auth';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const project = db.projects.find((p) => p.id === params.id);
  if (!project) return NextResponse.json({ ok: false, errors: ['Project not found'] }, { status: 404 });
  return NextResponse.json({ ok: true, project });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = verifyToken(parseAuthHeader(req));
  if (!user) return NextResponse.json({ ok: false, errors: ['Authentication required'] }, { status: 401 });
  const removed = updateDb((db) => {
    const idx = db.projects.findIndex((p) => p.id === params.id);
    if (idx >= 0) {
      db.projects.splice(idx, 1);
      return true;
    }
    return false;
  });
  if (removed) audit(user.email, 'project.delete', params.id);
  return NextResponse.json({ ok: removed, errors: removed ? [] : ['Project not found'] }, { status: removed ? 200 : 404 });
}
