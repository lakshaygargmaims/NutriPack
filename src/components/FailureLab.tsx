'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar, Cell,
} from 'recharts';
import type { AnalysisInput, AnalysisResult, FailureMode, MonteCarloResult, RiskTimelinePoint } from '@/lib/domain/types';

interface SimResponse {
  ok: boolean;
  twin?: AnalysisResult['twin'];
  shelfLife?: AnalysisResult['shelfLife'];
  failureModes?: FailureMode[];
  riskTimeline?: RiskTimelinePoint[];
  forcedMaterialName?: string;
  errors?: string[];
}

const sevColor = (s: string) => (s === 'high' ? '#dc2626' : s === 'medium' ? '#d97706' : '#65a30d');

/**
 * FAILURE LAB — force-select any material and watch the model explain how,
 * when and why that packaging fails for this food. Includes the Monte Carlo
 * shelf-life distribution for the forced material.
 */
interface AutoFixResponse {
  ok: boolean;
  steps: { problem: string; cause: string; change: string }[];
  comparison: { metric: string; before: string; after: string; better: boolean }[];
  label: string;
  errors?: string[];
}

export function FailureLab({ baseInput, defaultMaterialId }: { baseInput: AnalysisInput; defaultMaterialId?: string }) {
  const [materials, setMaterials] = useState<{ id: string; name: string }[]>([]);
  const [materialId, setMaterialId] = useState(defaultMaterialId ?? 'foil-lam');
  const [sim, setSim] = useState<SimResponse | null>(null);
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [fix, setFix] = useState<AutoFixResponse | null>(null);

  useEffect(() => {
    fetch('/api/materials').then((r) => r.json()).then((d) => d.ok && setMaterials(d.materials.map((m: any) => ({ id: m.id, name: m.name }))));
  }, []);

  async function run(mid = materialId) {
    setBusy(true);
    try {
      const [simRes, mcRes] = await Promise.all([
        fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: baseInput, changes: { materialId: mid } }),
        }),
        fetch('/api/monte-carlo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: baseInput, materialId: mid }),
        }),
      ]);
      const simData: SimResponse = await simRes.json();
      const mcData = await mcRes.json();
      setSim(simData);
      setMc(mcData.ok ? mcData.monteCarlo : null);
    } finally {
      setBusy(false);
    }
  }

  async function runFix() {
    setBusy(true);
    try {
      const res = await fetch('/api/auto-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: baseInput }),
      });
      setFix(await res.json());
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (materials.length) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials.length]);

  const timelineData = useMemo(
    () =>
      (sim?.riskTimeline ?? []).map((p) => ({
        day: p.day,
        Anaerobic: p.anaerobic,
        Moisture: p.moisture,
        Oxidative: p.oxidative,
        Overall: p.overall,
      })),
    [sim],
  );

  const histData = useMemo(
    () =>
      (mc?.histogram ?? []).map((b) => ({
        bin: `${b.binStart}–${b.binEnd}`,
        count: b.count,
        fill: b.binEnd <= 2.5 ? '#dc2626' : b.binStart >= (baseInput.storage.targetShelfLifeDays ?? 12) ? '#16a34a' : '#0ea5e9',
      })),
    [mc, baseInput],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[260px]">
          <label className="label" htmlFor="fl-material">Force a material (try a deliberately wrong one)</label>
          <select id="fl-material" className="input" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={() => run()} disabled={busy}>
          {busy ? 'Simulating…' : '⚠️ Run failure analysis'}
        </button>
        <button className="btn-secondary" onClick={() => runFix()} disabled={busy}>
          {busy ? 'Working…' : '🛠 Auto-correct packaging'}
        </button>
      </div>

      {sim?.ok && (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="font-semibold text-red-800">
              Failure analysis: {sim.forcedMaterialName ?? 'material'} for {baseInput.commodityId}
            </div>
            {sim.failureModes?.length ? (
              <p className="text-sm text-red-700 mt-1">
                {sim.failureModes.length} model-based failure mode(s) identified — the model explains how and when this
                combination breaks.
              </p>
            ) : (
              <p className="text-sm text-red-700 mt-1">
                No specific failure mode triggered under model assumptions — material appears matched to these conditions.
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {sim.failureModes?.map((f) => (
              <div key={f.id} className="card card-pad" style={{ borderLeft: `4px solid ${sevColor(f.severity)}` }}>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-semibold text-ink-900">{f.name}</h4>
                  <span className={`badge ${f.severity === 'high' ? 'badge-red' : f.severity === 'medium' ? 'badge-amber' : 'badge-green'}`}>
                    {f.severity} · {f.probability}%
                  </span>
                </div>
                <p className="text-xs text-ink-500 mt-1">
                  {f.onsetDays !== null ? `Modelled onset: ~day ${f.onsetDays}` : 'No specific onset (contextual risk)'}
                </p>
                <p className="text-sm text-ink-700 mt-2">{f.explanation}</p>
                <details className="mt-2">
                  <summary className="text-xs font-semibold text-ink-500 cursor-pointer">Mechanism & mitigation</summary>
                  <p className="text-xs text-ink-600 mt-1">{f.mechanism}</p>
                  <p className="text-xs text-brand-700 mt-1"><b>Mitigation:</b> {f.mitigation}</p>
                </details>
              </div>
            ))}
          </div>

          {fix?.ok && fix.steps.length > 0 && (
            <div className="card card-pad border-2 border-green-500">
              <div className="section-title">🛠 AI correction loop — detected → modified → re-simulated</div>
              <p className="text-xs text-ink-400">{fix.label}</p>
              <div className="mt-3 grid md:grid-cols-2 gap-4">
                <div className="rounded-lg bg-red-50 p-3">
                  <div className="text-xs font-bold uppercase text-red-700 mb-2">Before — problems detected</div>
                  <ul className="space-y-2 text-sm text-red-800 list-disc pl-4">
                    {fix.steps.map((s, i) => (
                      <li key={i}>
                        <b>{s.problem}</b>
                        <div className="text-xs text-red-700 mt-0.5">AI change: {s.change}</div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg bg-green-50 p-3">
                  <div className="text-xs font-bold uppercase text-green-700 mb-2">After — new simulation</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {fix.comparison.map((c) => (
                        <tr key={c.metric} className="border-b last:border-0">
                          <td className="py-1.5 text-ink-600 text-xs">{c.metric}</td>
                          <td className="py-1.5 text-right pr-2 text-ink-500">{c.before}</td>
                          <td className={`py-1.5 text-right font-semibold ${c.better ? 'text-green-700' : 'text-amber-700'}`}>
                            {c.better ? '✓' : '≈'} {c.after}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {timelineData.length > 0 && (
            <div className="card card-pad">
              <div className="section-title">Modelled risk timeline (probability proxies per day)</div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="Overall" stroke="#dc2626" fill="#dc2626" fillOpacity={0.15} />
                  <Area type="monotone" dataKey="Anaerobic" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="Moisture" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="Oxidative" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {mc && (
        <div className="card card-pad">
          <div className="section-title">Monte Carlo shelf-life distribution (4000 draws)</div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={histData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bin" tick={{ fontSize: 9 }} interval={2} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {histData.map((b, i) => (
                      <Cell key={i} fill={b.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2 text-xs">
                <span className="badge-red">≤2.5 d (anaerobic collapse zone)</span>
                <span className="badge-slate">model distribution</span>
                <span className="badge-green">≥ target ({baseInput.storage.targetShelfLifeDays ?? 12} d)</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ['P5 (pessimistic)', `${mc.p5} d`],
                  ['P50 (median)', `${mc.p50} d`],
                  ['P95 (optimistic)', `${mc.p95} d`],
                  ['Std deviation', `${mc.sd} d`],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2">
                    <div className="text-[10px] uppercase font-semibold text-ink-400">{k as string}</div>
                    <div className="font-bold text-ink-800">{v as string}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-ink-200 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-600">P(modelled shelf life ≥ target {baseInput.storage.targetShelfLifeDays ?? 12} d)</span>
                  <b className={mc.probTargetMet >= 70 ? 'text-brand-700' : mc.probTargetMet >= 40 ? 'text-amber-600' : 'text-red-600'}>{mc.probTargetMet}%</b>
                </div>
                {mc.probAnaerobic > 0 && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-ink-600">P(anaerobic collapse ≤2.5 d)</span>
                    <b className={mc.probAnaerobic > 20 ? 'text-red-600' : 'text-amber-600'}>{mc.probAnaerobic}%</b>
                  </div>
                )}
              </div>
              <details>
                <summary className="text-xs font-semibold text-ink-500 cursor-pointer">Sampling assumptions</summary>
                <ul className="list-disc list-inside text-xs text-ink-500 mt-1">
                  {mc.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </details>
              <p className="text-[11px] text-ink-400">{mc.method}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
