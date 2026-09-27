'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Project, AnalysisResult } from '@/lib/domain/types';

function ProjectsInner() {
  const params = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [openId, setOpenId] = useState<string | null>(params.get('p'));
  const [compare, setCompare] = useState<string[]>([]);

  // List endpoint returns summaries; the detail view needs full results per version.
  const [project, setProject] = useState<Project | null>(null);

  function load() {
    fetch('/api/analysis')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setProjects(d.projects);
        }
      });
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openId) {
      setProject(null);
      return;
    }
    fetch(`/api/analysis/${openId}`)
      .then((r) => r.json())
      .then((d) => setProject(d.ok ? d.project : null))
      .catch(() => setProject(null));
  }, [openId]);

  async function remove(id: string) {
    const token = localStorage.getItem('nutripack.token');
    const res = await fetch(`/api/analysis/${id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) {
      setOpenId(null);
      load();
    }
  }

  const [a, b] = compare.map((id) => project?.versions.find((v) => v.result.createdAt === id)?.result).filter(Boolean) as AnalysisResult[];
  const compareRows = a && b ? [
    ['Material', a.primary.material.name.split(' (')[0], b.primary.material.name.split(' (')[0]],
    ['Est. shelf life (d)', `${a.shelfLife.daysLow}–${a.shelfLife.daysHigh}`, `${b.shelfLife.daysLow}–${b.shelfLife.daysHigh}`],
    ['Cost ₹/pack', a.primary.score.estimatedCostPerPackageInr.toFixed(2), b.primary.score.estimatedCostPerPackageInr.toFixed(2)],
    ['Sustainability', `${a.sustainability.total}/100`, `${b.sustainability.total}/100`],
    ['Transport risk', `${a.twin.transportRisk}/100`, `${b.twin.transportRisk}/100`],
    ['Score', a.primary.score.total.toFixed(1), b.primary.score.total.toFixed(1)],
  ] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Projects</h1>
        <p className="text-sm text-ink-500">Saved packaging analyses with versions. Run analyses while signed in to save automatically.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card card-pad">
          <div className="section-title">All projects</div>
          {projects.length ? (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <button
                    className={`flex-1 text-left rounded-lg border px-3 py-2 text-sm ${openId === p.id ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50'}`}
                    onClick={() => setOpenId(p.id)}
                  >
                    <div className="font-medium text-ink-800">{p.name}</div>
                    <div className="text-xs text-ink-400">{p.versions.length} version(s) · {new Date(p.updatedAt).toLocaleDateString()}</div>
                  </button>
                  <button className="btn-ghost !p-2 text-xs" onClick={() => remove(p.id)} aria-label="Delete project">🗑</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-400">No projects yet.</p>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {project ? (
            <>
              <div className="card card-pad">
                <div className="flex items-center justify-between">
                  <div className="section-title !mb-0">{project.name} — versions</div>
                  <Link href={`/report?p=${project.id}`} className="btn-primary text-xs">Generate report</Link>
                </div>
                <div className="mt-3 grid md:grid-cols-2 gap-3">
                  {project.versions.map((v) => {
                    const r = v.result;
                    return (
                      <label key={v.createdAt} className={`rounded-xl border p-3 cursor-pointer ${compare.includes(v.createdAt) ? 'border-brand-500 bg-brand-50/50' : 'border-ink-200'}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink-800">{v.label}</span>
                          <input
                            type="checkbox"
                            checked={compare.includes(v.createdAt)}
                            onChange={(e) =>
                              setCompare(e.target.checked ? [...compare, v.createdAt] : compare.filter((c) => c !== v.createdAt))
                            }
                          />
                        </div>
                        <div className="text-xs text-ink-500 mt-1">
                          {r.primary.material.name.split(' (')[0]} · est. {r.shelfLife.daysLow}–{r.shelfLife.daysHigh} d · ₹{r.primary.score.estimatedCostPerPackageInr.toFixed(2)} · {new Date(v.createdAt).toLocaleString()}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {compareRows && (
                <div className="card card-pad">
                  <div className="section-title">Version comparison</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="th">Metric</th>
                        <th className="th">Selection A</th>
                        <th className="th">Selection B</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareRows.map(([k, va, vb]) => (
                        <tr key={k as string}>
                          <td className="td font-medium text-ink-700">{k as string}</td>
                          <td className="td">{va as string}</td>
                          <td className="td">{vb as string}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="card card-pad py-16 text-center text-ink-400">
              Select a project. Analyses run while signed in are saved here with full version history.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="card card-pad">Loading projects…</div>}>
      <ProjectsInner />
    </Suspense>
  );
}
