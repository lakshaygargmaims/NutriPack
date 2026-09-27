'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { CompletePackagingSolution, SolutionFailureRisk, LayerDetail } from '@/lib/engine/completeSolution';

interface SolutionResponse {
  ok: boolean;
  solutions?: CompletePackagingSolution[];
  shelfLife?: { daysLow: number; daysHigh: number; confidence: string };
  errors?: string[];
}

const FOODS = ['tomato', 'potato', 'onion', 'banana', 'mango', 'apple', 'rice', 'wheat', 'pulses', 'spices', 'biscuits', 'snacks', 'milk', 'mustard-oil', 'frozen-peas'];
const CITIES = ['Delhi', 'Mumbai', 'Jaipur', 'Kolkata', 'Bengaluru', 'Lucknow', 'Nashik', 'Ahmedabad', 'Chennai', 'Guwahati'];

const LEVEL_STYLE: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
  unknown: 'bg-ink-100 text-ink-600',
};
const LEVEL_ICON: Record<string, string> = { low: '🟢', medium: '🟡', high: '🔴', unknown: '⚪' };

const LAYER_ICON: Record<LayerDetail['level'], string> = {
  product: '🍅',
  primary: '📦',
  secondary: '🧰',
  tertiary: '🧺',
  transport: '🚚',
};

export default function CompleteSolutionPage() {
  const [commodityId, setCommodity] = useState('tomato');
  const [quantityKg, setQuantity] = useState(500);
  const [origin, setOrigin] = useState('Nashik');
  const [destination, setDestination] = useState('Delhi');
  const [mode, setMode] = useState<'road' | 'rail' | 'air' | 'sea'>('road');
  const [coldChain, setColdChain] = useState(false);
  const [active, setActive] = useState<'balanced' | 'low_cost' | 'sustainability'>('balanced');
  const [solutions, setSolutions] = useState<CompletePackagingSolution[]>([]);
  const [shelfLife, setShelfLife] = useState<SolutionResponse['shelfLife']>();
  const [openLayer, setOpenLayer] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Route metrics: try the router, fall back to assumption (labelled)
      let route: { origin: string; destination: string; mode: string; distanceKm: number; durationDays: number; coldChain: boolean; handlingPoints: number; source: 'router' | 'assumption' } = {
        origin, destination, mode, distanceKm: 280, durationDays: 1, coldChain, handlingPoints: 2, source: 'assumption',
      };
      try {
        const r = await fetch('/api/route-intel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, destination, mode, coldChain, commodityId }),
        });
        const rd = await r.json();
        if (rd.ok) {
          route = {
            origin, destination, mode,
            distanceKm: rd.analysis.distanceKm,
            durationDays: Math.max(0.3, Math.round((rd.analysis.durationHours / 24) * 10) / 10),
            coldChain: coldChain || rd.analysis.coldChainRequired,
            handlingPoints: 2,
            source: rd.metrics.source === 'osrm' ? 'router' : 'assumption',
          };
        }
      } catch { /* keep assumption route */ }

      const storageEnv = commodityId === 'frozen-peas' ? 'frozen' : commodityId === 'milk' ? 'refrigerated' : commodityId === 'mustard-oil' ? 'ambient' : undefined;
      const res = await fetch('/api/complete-solution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            commodityId,
            ...(storageEnv
              ? { storage: { environment: storageEnv, temperatureC: storageEnv === 'frozen' ? -18 : storageEnv === 'refrigerated' ? 4 : 25, rhPct: 60, targetShelfLifeDays: 12 } }
              : {}),
            transport: { origin, destination, mode, coldChain },
            business: { packageSizeGrams: 1000, productionVolumePerMonth: 10000 },
            priority: 'balanced',
          },
          quantityKg,
          route,
        }),
      });
      const data: SolutionResponse = await res.json();
      if (data.ok && data.solutions) {
        setSolutions(data.solutions);
        setShelfLife(data.shelfLife);
      } else {
        setError(data.errors?.[0] ?? 'Could not build a solution.');
      }
    } finally {
      setLoading(false);
    }
  }, [commodityId, quantityKg, origin, destination, mode, coldChain]);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sol = solutions.find((s) => s.optionId === active) ?? solutions[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Complete Packaging Solution</h1>
        <p className="text-sm text-ink-500">
          Not just a material — the full configuration: format, material, closure, sealing, liners, secondary, tertiary and
          transport packaging, chosen by compatibility filters and multi-criteria scoring.
        </p>
      </div>

      {/* INPUTS */}
      <div className="card card-pad grid md:grid-cols-6 gap-3 items-end">
        <label className="block md:col-span-2">
          <span className="label">FOOD</span>
          <select value={commodityId} onChange={(e) => setCommodity(e.target.value)} className="input capitalize">
            {FOODS.map((f) => <option key={f} value={f} className="capitalize">{f.replace('-', ' ')}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">QUANTITY (KG)</span>
          <input type="number" min={1} max={100000} value={quantityKg} onChange={(e) => setQuantity(+e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="label">FROM</span>
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="input">
            {CITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">TO</span>
          <select value={destination} onChange={(e) => setDestination(e.target.value)} className="input">
            {CITIES.filter((c) => c !== origin).map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">TRANSPORT</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="input">
            <option value="road">Truck</option>
            <option value="rail">Rail</option>
            <option value="air">Air</option>
            <option value="sea">Sea</option>
          </select>
        </label>
        <label className="flex items-center gap-2 md:col-span-2">
          <input type="checkbox" checked={coldChain} onChange={(e) => setColdChain(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm font-medium text-ink-700">Cold chain</span>
        </label>
        <button className="btn-primary md:col-span-2" onClick={() => void run()} disabled={loading}>
          {loading ? 'Building configuration…' : 'Build complete solution'}
        </button>
      </div>

      {error && <div className="card card-pad text-sm text-red-700">{error}</div>}

      {sol && (
        <>
          {/* OPTION TABS */}
          <div className="flex flex-wrap gap-2">
            {solutions.map((s) => (
              <button
                key={s.optionId}
                onClick={() => setActive(s.optionId)}
                className={`btn text-sm ${s.optionId === active ? 'btn-primary' : 'btn-ghost'}`}
              >
                {s.optionLabel} · {s.primaryPackaging.formatName}
              </button>
            ))}
          </div>

          {/* HIERARCHY VISUAL */}
          <div className="card card-pad">
            <div className="section-title">Packaging hierarchy — click a layer for detail</div>
            <div className="mt-3 space-y-1">
              {sol.hierarchy.map((layer, i) => (
                <div key={layer.level}>
                  <button
                    className={`w-full text-left rounded-xl border px-4 py-3 flex items-center justify-between transition ${
                      openLayer === i ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50'
                    }`}
                    onClick={() => setOpenLayer(openLayer === i ? null : i)}
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-2xl">{LAYER_ICON[layer.level]}</span>
                      <span>
                        <span className="block text-[10px] uppercase font-bold tracking-wide text-ink-400">{layer.level} packaging</span>
                        <span className="block font-semibold text-ink-900">{layer.name}</span>
                      </span>
                    </span>
                    <span className="text-right text-xs text-ink-500">
                      <span className="block">{layer.material}</span>
                      <span className={`inline-block mt-1 rounded-full px-2 py-0.5 font-semibold ${LEVEL_STYLE[layer.protection]}`}>protection: {layer.protection}</span>
                    </span>
                  </button>
                  {openLayer === i && (
                    <div className="mx-4 my-2 rounded-lg bg-ink-50 border border-ink-200 p-3 text-sm space-y-1">
                      <div><b>Purpose:</b> {layer.purpose}</div>
                      <div><b>Material:</b> {layer.material}</div>
                      <div><b>Risk note:</b> {layer.riskNote}</div>
                      <div className="flex gap-3 text-xs text-ink-500">
                        <span>Cost: {layer.relativeCost}</span>
                        <span>Sustainability: {layer.sustainability}</span>
                        <span>Source: {layer.source}</span>
                      </div>
                    </div>
                  )}
                  {i < sol.hierarchy.length - 1 && <div className="text-center text-ink-300">↓</div>}
                </div>
              ))}
            </div>
          </div>

          {/* SOLUTION CARD */}
          <div className="card card-pad border-2 border-brand-500 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-ink-900">COMPLETE PACKAGING SOLUTION — {sol.optionLabel}</h2>
              <span className="badge badge-amber">{sol.dataProvenance.sourceType === 'demo' ? 'DEMO DATA' : 'REFERENCE DATA'}</span>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              {[
                ['FOOD', `${sol.food.name} (${sol.quantityKg} kg)`],
                ['PRIMARY PACKAGE', sol.primaryPackaging.formatName],
                ['MATERIAL / STRUCTURE', `${sol.materialStructure.materialName.split(' (')[0]} — ${sol.materialStructure.structure}`],
                ['CLOSURE', sol.closure?.name ?? 'Not applicable (sealed single-use)'],
                ['SEALING', sol.sealingMethod?.name ?? 'Not applicable'],
                ['INNER LINERS', sol.innerLiners.length ? sol.innerLiners.map((l) => l.name).join(' + ') : 'None required'],
                ['SECONDARY', sol.secondaryPackaging?.name ?? 'Not required (local, small)'],
                ['TERTIARY', sol.tertiaryPackaging?.name ?? 'Not required (local, small)'],
                ['TRANSPORT', `${sol.transportMode} · ${sol.hierarchy.at(-1)?.purpose}`],
                ['STORAGE', sol.storageCondition],
                ['EST. SHELF LIFE', shelfLife ? `${shelfLife.daysLow}–${shelfLife.daysHigh} d (${shelfLife.confidence})` : '—'],
                ['THICKNESS', sol.thickness ? `${sol.thickness.um} µm — ${sol.thickness.note}` : 'Data unavailable'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-ink-50 border border-ink-200 px-3 py-2">
                  <div className="text-[10px] uppercase font-bold tracking-wide text-ink-400">{k}</div>
                  <div className="text-sm font-medium text-ink-800">{v}</div>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-4 gap-3">
              {([
                ['TRANSPORT RISK', sol.transportRisk],
                ['COST', sol.estimatedCostCategory],
                ['SUSTAINABILITY', sol.sustainabilityIndicator],
                ['CONFIDENCE', sol.confidence],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-ink-200 px-3 py-2 text-center">
                  <div className="text-[10px] uppercase font-bold text-ink-400">{k}</div>
                  <div className={`mt-1 inline-block rounded-full px-3 py-1 text-sm font-bold ${LEVEL_STYLE[v] ?? 'bg-ink-100'}`}>
                    {LEVEL_ICON[v] ?? ''} {v.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="section-title">Failure risks (model proxies)</div>
              {sol.failureRisks.length ? (
                <div className="grid md:grid-cols-2 gap-2">
                  {sol.failureRisks.map((f, i) => (
                    <FailureRiskRow key={i} risk={f} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-green-700">No specific failure modes triggered under model assumptions.</p>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="section-title">Why this?</div>
                <ul className="space-y-1.5 text-sm text-ink-700 list-disc pl-4">
                  {sol.recommendationReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
              <div>
                <div className="section-title">Trade-offs & rejections</div>
                <ul className="space-y-1.5 text-sm text-amber-800 list-disc pl-4">
                  {sol.tradeoffs.map((t, i) => <li key={i}>⚠ {t}</li>)}
                </ul>
                {sol.rejectedCandidates.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-ink-500">Rejected candidates ({sol.rejectedCandidates.length})</summary>
                    <ul className="mt-1 space-y-1 text-xs text-ink-500 list-disc pl-4">
                      {sol.rejectedCandidates.map((r, i) => <li key={i}><b>{r.name}</b> — {r.because}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            </div>

            <p className="text-xs text-ink-400">{sol.dataProvenance.note}</p>
          </div>

          {/* OPTION COMPARISON */}
          {solutions.length === 3 && (
            <div className="card card-pad">
              <div className="section-title">Compare the three complete options</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-ink-400 border-b">
                      <th className="py-2">Attribute</th>
                      {solutions.map((s) => <th key={s.optionId} className="py-2">{s.optionLabel}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['Primary format', (s: CompletePackagingSolution) => s.primaryPackaging.formatName],
                      ['Material', (s: CompletePackagingSolution) => s.materialStructure.materialName.split(' (')[0]],
                      ['Closure', (s: CompletePackagingSolution) => s.closure?.name ?? '—'],
                      ['Sealing', (s: CompletePackagingSolution) => s.sealingMethod?.name ?? '—'],
                      ['Secondary', (s: CompletePackagingSolution) => s.secondaryPackaging?.name ?? '—'],
                      ['Tertiary', (s: CompletePackagingSolution) => s.tertiaryPackaging?.name ?? '—'],
                      ['Cost', (s: CompletePackagingSolution) => s.estimatedCostCategory.toUpperCase()],
                      ['Sustainability', (s: CompletePackagingSolution) => s.sustainabilityIndicator.toUpperCase()],
                      ['Confidence', (s: CompletePackagingSolution) => s.confidence.toUpperCase()],
                    ] as [string, (s: CompletePackagingSolution) => string][]).map(([label, get]) => (
                      <tr key={label} className="border-b last:border-0">
                        <td className="py-2 text-ink-600">{label}</td>
                        {solutions.map((s) => <td key={s.optionId} className="py-2 font-medium">{get(s)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-sm text-ink-500">
            Need the material-level deep dive (OTR/WVTR windows, MAP simulation, Monte Carlo)? Open the{' '}
            <Link href={`/result?commodity=${sol.food.id}`} className="text-brand-700 font-medium">analysis result view</Link> —
            this page builds on the same engine.
          </p>
        </>
      )}
    </div>
  );
}

function FailureRiskRow({ risk }: { risk: SolutionFailureRisk }) {
  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <div className="flex items-center justify-between">
        <b className="text-sm text-ink-900">{risk.risk}</b>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL_STYLE[risk.level]}`}>{risk.level.toUpperCase()}</span>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs font-semibold text-ink-500">Cause · Impact · Mitigation</summary>
        <p className="text-xs text-ink-600 mt-1"><b>Cause:</b> {risk.cause}</p>
        <p className="text-xs text-ink-600"><b>Impact:</b> {risk.impact}</p>
        <p className="text-xs text-brand-700"><b>Mitigation:</b> {risk.mitigation}</p>
      </details>
    </div>
  );
}
