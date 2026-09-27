'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, CartesianGrid, Legend,
} from 'recharts';
import type { AnalysisResult } from '@/lib/domain/types';

interface DemoScenario {
  id: string;
  title: string;
  blurb: string;
  result: AnalysisResult;
}

export default function Dashboard() {
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<{ id: string; name: string; versions: { label: string; createdAt: string; commodity: string }[]; updatedAt: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [demoRes, projRes] = await Promise.all([fetch('/api/demo'), fetch('/api/analysis')]);
        const demo = await demoRes.json();
        const proj = await projRes.json();
        if (demo.ok) setScenarios(demo.scenarios);
        if (proj.ok) setProjects(proj.projects);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const results = scenarios.map((s) => s.result);
  const kpis = {
    analyses: results.length + projects.reduce((a, p) => a + p.versions.length, 0),
    recommendations: results.length,
    avgShelfLife: results.length ? results.reduce((a, r) => a + (r.shelfLife.daysLow + r.shelfLife.daysHigh) / 2, 0) / results.length : 0,
    avgSustainability: results.length ? results.reduce((a, r) => a + r.sustainability.total, 0) / results.length : 0,
    avgCost: results.length ? results.reduce((a, r) => a + r.primary.score.estimatedCostPerPackageInr, 0) / results.length : 0,
  };

  const materialUsage = Object.values(
    results.reduce<Record<string, { name: string; count: number }>>((acc, r) => {
      const name = r.primary.material.name.split(' (')[0];
      acc[name] = acc[name] ?? { name, count: 0 };
      acc[name].count += 1;
      return acc;
    }, {}),
  );

  const costVsShelf = results.map((r) => ({
    name: r.commodity.name,
    cost: r.primary.score.estimatedCostPerPackageInr,
    shelf: (r.shelfLife.daysLow + r.shelfLife.daysHigh) / 2,
    sustainability: r.sustainability.total,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Dashboard</h1>
          <p className="text-sm text-ink-500">Decision-support overview across your packaging analyses.</p>
        </div>
        <Link href="/analyzer" className="btn-primary">+ Create New Packaging Analysis</Link>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card card-pad h-24 animate-pulse bg-ink-100" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-5 gap-4">
            {[
              ['Analyses', kpis.analyses, 'total runs'],
              ['Recommendations', kpis.recommendations, 'demo scenarios'],
              ['Avg Estimated Shelf Life', `${kpis.avgShelfLife.toFixed(1)} d`, 'model estimate'],
              ['Avg Sustainability', `${kpis.avgSustainability.toFixed(0)}/100`, 'estimated score'],
              ['Avg Packaging Cost', `₹${kpis.avgCost.toFixed(2)}`, 'per package'],
            ].map(([label, value, sub]) => (
              <div key={label as string} className="card card-pad">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</div>
                <div className="mt-1 text-2xl font-bold text-ink-900">{value as string}</div>
                <div className="text-xs text-ink-400 mt-1">{sub as string}</div>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card card-pad">
              <div className="section-title">Packaging material usage (demo scenarios)</div>
              {materialUsage.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={materialUsage}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} height={50} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-ink-400">Loading…</p>
              )}
            </div>

            <div className="card card-pad">
              <div className="section-title">Cost vs estimated shelf life</div>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="cost" name="Cost ₹/pack" type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="shelf" name="Shelf life (days)" type="number" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Legend />
                  <Scatter name="Demo analyses" data={costVsShelf} fill="#0ea5e9" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card card-pad">
            <div className="section-title">SIH demo scenarios — one click, full pipeline</div>
            <div className="grid md:grid-cols-2 gap-4">
              {scenarios.map((s) => (
                <Link
                  key={s.id}
                  href={{ pathname: '/analyzer', query: { demo: s.id } }}
                  className="rounded-xl border border-ink-200 hover:border-brand-400 hover:bg-brand-50/40 p-4 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink-800">{s.title}</span>
                    <span className="badge-green">{s.result.primary.score.total.toFixed(0)} / 100</span>
                  </div>
                  <p className="text-sm text-ink-500 mt-1">{s.blurb}</p>
                  <p className="text-xs text-ink-400 mt-2">
                    → {s.result.primary.material.name.split(' (')[0]} · est. {s.result.shelfLife.daysLow}–{s.result.shelfLife.daysHigh} days · ₹{s.result.primary.score.estimatedCostPerPackageInr}/pack
                  </p>
                </Link>
              ))}
              {!scenarios.length && <p className="text-sm text-ink-400">Loading scenarios…</p>}
            </div>
          </div>

          <div className="card card-pad">
            <div className="section-title">Saved packaging projects</div>
            {projects.length ? (
              <ul className="divide-y divide-ink-100">
                {projects.slice(0, 6).map((p) => (
                  <li key={p.id} className="py-3 flex items-center justify-between">
                    <div>
                      <Link href={`/projects?p=${p.id}`} className="font-medium text-ink-800 hover:text-brand-700">
                        {p.name}
                      </Link>
                      <div className="text-xs text-ink-400">
                        {p.versions.length} version(s) · updated {new Date(p.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <Link href={`/projects?p=${p.id}`} className="btn-ghost text-xs !py-1 !px-2">Open</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-400">No saved projects yet — run an analysis while signed in to save automatically.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
