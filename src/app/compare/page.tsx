'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, ZAxis, Legend } from 'recharts';
import type { ComparisonRow } from '@/lib/domain/types';

function CompareInner() {
  const params = useSearchParams();
  const commodity = params.get('commodity') ?? 'tomato';
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [sortKey, setSortKey] = useState<keyof ComparisonRow>('totalScore');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commodityId: commodity, priority: 'balanced' }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setRows(d.rows);
      })
      .finally(() => setBusy(false));
  }, [commodity]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') return vb - va;
      return String(vb).localeCompare(String(va));
    });
    return copy;
  }, [rows, sortKey]);

  const paretoData = rows.map((r) => ({
    name: r.name.split(' (')[0],
    cost: r.costPerPackageInr,
    shelf: (r.estimatedShelfLifeDays[0] + r.estimatedShelfLifeDays[1]) / 2,
    score: r.totalScore,
  }));

  const COLUMNS: { key: keyof ComparisonRow; label: string; render?: (r: ComparisonRow) => string }[] = [
    { key: 'name', label: 'Material' },
    { key: 'otr', label: 'OTR' },
    { key: 'wvtr', label: 'WVTR' },
    { key: 'thicknessUm', label: 'Thickness µm' },
    { key: 'estimatedShelfLifeDays', label: 'Est. shelf life (d)', render: (r) => `${r.estimatedShelfLifeDays[0]}–${r.estimatedShelfLifeDays[1]}` },
    { key: 'costPerPackageInr', label: 'Cost ₹/pack', render: (r) => `₹${r.costPerPackageInr.toFixed(2)}` },
    { key: 'sustainability', label: 'Sustainability' },
    { key: 'recyclability', label: 'Recyclability' },
    { key: 'transportSuitability', label: 'Transport' },
    { key: 'mapSuitability', label: 'MAP', render: (r) => (r.mapSuitability ? 'Yes' : 'No') },
    { key: 'totalScore', label: 'Score' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Packaging Comparison</h1>
        <p className="text-sm text-ink-500">Balanced-profile comparison for <b>{commodity}</b>. All figures are model estimates.</p>
      </div>

      {busy ? (
        <div className="card card-pad h-64 animate-pulse bg-ink-100" />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key as string} className="th cursor-pointer hover:text-ink-800" onClick={() => setSortKey(c.key)}>
                      {c.label} {sortKey === c.key ? '↓' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.materialId} className={r.totalScore === Math.max(...rows.map((x) => x.totalScore)) ? 'bg-brand-50/60' : ''}>
                    {COLUMNS.map((c) => (
                      <td key={c.key as string} className="td">
                        {c.render ? c.render(r) : String(r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card card-pad">
              <div className="section-title">Cost vs estimated shelf life (Pareto view)</div>
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="cost" name="₹/pack" type="number" domain={['auto', 'auto']} />
                  <YAxis dataKey="shelf" name="days" type="number" />
                  <ZAxis dataKey="score" range={[60, 400]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Legend />
                  <Scatter name="Materials" data={paretoData} fill="#16a34a" />
                </ScatterChart>
              </ResponsiveContainer>
              <p className="text-xs text-ink-400 mt-1">Bubble size = balanced score. Lower-left frontier = cheaper + longer modelled shelf life.</p>
            </div>
            <div className="card card-pad">
              <div className="section-title">Sustainability vs performance</div>
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sustainability" name="sustainability" type="number" domain={[0, 100]} />
                  <YAxis dataKey="score" name="score" type="number" domain={[0, 100]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Legend />
                  <Scatter name="Materials" data={rows.map((r) => ({ sustainability: r.sustainability, score: r.totalScore, name: r.name.split(' (')[0] }))} fill="#0ea5e9" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="card card-pad">Loading comparison…</div>}>
      <CompareInner />
    </Suspense>
  );
}
