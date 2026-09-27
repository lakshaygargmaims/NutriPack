'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine,
} from 'recharts';
import type { AnalysisInput, SupplyChainLeg, SupplyChainResult } from '@/lib/domain/types';

interface ChainResponse {
  ok: boolean;
  supplyChain?: SupplyChainResult;
  material?: { id: string; name: string };
  errors?: string[];
}

const PRESETS: Record<string, { label: string; legs: SupplyChainLeg[] }> = {
  'india-fresh': {
    label: 'Tomato: Farm → Packhouse → Mandi → Retail',
    legs: [
      { name: 'Farm collection', mode: 'road', durationDays: 1, tempC: 30, rhPct: 60, coldChain: false },
      { name: 'Packhouse staging', mode: 'none', durationDays: 1, tempC: 25, rhPct: 70, coldChain: false },
      { name: 'Mandi / wholesale', mode: 'road', durationDays: 2, tempC: 28, rhPct: 65, coldChain: false },
      { name: 'Retail distribution', mode: 'road', durationDays: 1, tempC: 10, rhPct: 85, coldChain: true },
    ],
  },
  'coldchain': {
    label: 'Cold chain: Farm → Pre-cooler → Reefer → Retail',
    legs: [
      { name: 'Farm collection', mode: 'road', durationDays: 0.5, tempC: 25, rhPct: 70, coldChain: false },
      { name: 'Pre-cooler + staging', mode: 'none', durationDays: 0.5, tempC: 8, rhPct: 90, coldChain: true },
      { name: 'Reefer truck', mode: 'road', durationDays: 2, tempC: 8, rhPct: 90, coldChain: true },
      { name: 'Retail distribution', mode: 'road', durationDays: 1, tempC: 10, rhPct: 85, coldChain: true },
    ],
  },
  export: {
    label: 'Export: Farm → Pack → Port → Sea → EU DC',
    legs: [
      { name: 'Farm to packhouse', mode: 'road', durationDays: 1, tempC: 28, rhPct: 65, coldChain: false },
      { name: 'Pack + pre-cool', mode: 'none', durationDays: 1, tempC: 12, rhPct: 90, coldChain: true },
      { name: 'Port + container', mode: 'sea', durationDays: 18, tempC: 13, rhPct: 90, coldChain: true },
      { name: 'EU distribution', mode: 'road', durationDays: 2, tempC: 8, rhPct: 90, coldChain: true },
    ],
  },
};

export default function SupplyChainPage() {
  const [baseInput, setBaseInput] = useState<AnalysisInput | null>(null);
  const [legs, setLegs] = useState<SupplyChainLeg[]>(PRESETS['india-fresh'].legs);
  const [preset, setPreset] = useState('india-fresh');
  const [res, setRes] = useState<ChainResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const demo = await (await fetch('/api/demo')).json();
      const s = demo.scenarios?.find((x: any) => x.id === 'tomato-delhi-jaipur');
      if (s) setBaseInput(s.input);
    })();
  }, []);

  async function run() {
    if (!baseInput) return;
    setBusy(true);
    try {
      const r = await fetch('/api/supply-chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: baseInput, legs }),
      });
      setRes(await r.json());
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (baseInput) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseInput]);

  function applyPreset(key: string) {
    setPreset(key);
    setLegs(PRESETS[key].legs.map((l) => ({ ...l })));
  }

  const tttData = (res?.supplyChain?.legs ?? []).map((l) => ({
    name: l.name,
    'Shelf-life used (d)': l.shelfLifeUsedDays,
    'Calendar days': l.durationDays,
  }));

  const verdictTone = res?.supplyChain?.verdict.startsWith('FAILURE')
    ? 'border-red-300 bg-red-50 text-red-800'
    : res?.supplyChain?.verdict.startsWith('MARGINAL')
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : 'border-brand-300 bg-brand-50 text-brand-800';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Supply-Chain Twin (multi-leg)</h1>
        <p className="text-sm text-ink-500">
          Time–Temperature–Tolerance model: each leg consumes modelled shelf life at a Q10-weighted rate. Edit legs or pick
          a preset — verdict updates from the engine.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(PRESETS).map(([k, p]) => (
          <button key={k} className={`btn text-xs ${preset === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => applyPreset(k)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <th className="th">Leg</th>
              <th className="th">Mode</th>
              <th className="th">Days</th>
              <th className="th">Temp °C</th>
              <th className="th">RH %</th>
              <th className="th">Cold chain</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg, i) => (
              <tr key={i}>
                <td className="td">
                  <input className="input !py-1" value={leg.name} onChange={(e) => setLegs(legs.map((l, j) => (j === i ? { ...l, name: e.target.value } : l)))} />
                </td>
                <td className="td">
                  <select className="input !py-1" value={leg.mode} onChange={(e) => setLegs(legs.map((l, j) => (j === i ? { ...l, mode: e.target.value as any } : l)))}>
                    {['road', 'rail', 'air', 'sea', 'none'].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td className="td">
                  <input className="input !py-1 !w-20" type="number" step="0.5" min="0.1" value={leg.durationDays} onChange={(e) => setLegs(legs.map((l, j) => (j === i ? { ...l, durationDays: Number(e.target.value) } : l)))} />
                </td>
                <td className="td">
                  <input className="input !py-1 !w-20" type="number" value={leg.tempC} onChange={(e) => setLegs(legs.map((l, j) => (j === i ? { ...l, tempC: Number(e.target.value) } : l)))} />
                </td>
                <td className="td">
                  <input className="input !py-1 !w-20" type="number" value={leg.rhPct} onChange={(e) => setLegs(legs.map((l, j) => (j === i ? { ...l, rhPct: Number(e.target.value) } : l)))} />
                </td>
                <td className="td">
                  <input type="checkbox" checked={leg.coldChain} onChange={(e) => setLegs(legs.map((l, j) => (j === i ? { ...l, coldChain: e.target.checked } : l)))} />
                </td>
                <td className="td">
                  <button className="btn-ghost !p-1 text-xs" onClick={() => setLegs(legs.filter((_, j) => j !== i))} aria-label="Remove leg">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-3 flex gap-2">
          <button
            className="btn-ghost text-xs"
            onClick={() => setLegs([...legs, { name: `Leg ${legs.length + 1}`, mode: 'road', durationDays: 1, tempC: 25, rhPct: 70, coldChain: false }])}
          >
            + Add leg
          </button>
          <button className="btn-primary text-xs" onClick={run} disabled={busy || !baseInput}>
            {busy ? 'Simulating…' : 'Run supply-chain simulation'}
          </button>
        </div>
      </div>

      {res?.ok && res.supplyChain && (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 font-medium ${verdictTone}`}>
            {res.supplyChain.verdict}
            <div className="text-xs mt-1 opacity-80">
              Material: {res.material?.name} · total transit {res.supplyChain.totalDurationDays} d · cumulative risk {res.supplyChain.cumulativeRisk}/100 (model)
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            {[
              ['Shelf-life budget', `≈${((res.supplyChain.remainingShelfLifeDays?.[0] ?? 0) + res.supplyChain.shelfLifeUsedDays).toFixed(1)} d`, 'model midpoint'],
              ['Consumed in transit', `${res.supplyChain.shelfLifeUsedDays} d`, 'TTT, Q10-weighted'],
              ['Remaining on arrival', res.supplyChain.remainingShelfLifeDays ? `${res.supplyChain.remainingShelfLifeDays[0]}–${res.supplyChain.remainingShelfLifeDays[1]} d` : '0 d', 'estimate range'],
              ['Cumulative risk', `${res.supplyChain.cumulativeRisk}/100`, 'across legs'],
            ].map(([k, v, sub]) => (
              <div key={k as string} className="card card-pad !p-3">
                <div className="text-[10px] uppercase font-semibold text-ink-400">{k as string}</div>
                <div className="text-lg font-bold text-ink-900">{v as string}</div>
                <div className="text-[10px] text-ink-400">{sub as string}</div>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div className="section-title">Shelf-life consumption by leg (TTT model)</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tttData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="Shelf-life used (d)" radius={[4, 4, 0, 0]}>
                  {tttData.map((d, i) => (
                    <Cell key={i} fill={d['Shelf-life used (d)'] > d['Calendar days'] * 1.5 ? '#dc2626' : d['Shelf-life used (d)'] > d['Calendar days'] ? '#d97706' : '#16a34a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-ink-400 mt-1">Red/orange legs burn shelf life faster than calendar time (hot legs). Cold-chain legs (blue-green) burn slowly.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {res.supplyChain.legs.map((l, i) => (
              <div key={i} className="card card-pad">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-ink-900">{l.name}</h4>
                  <span className={`badge ${l.suitability === 'high' ? 'badge-green' : l.suitability === 'medium' ? 'badge-amber' : 'badge-red'}`}>
                    {l.suitability} · risk {l.riskScore}
                  </span>
                </div>
                <p className="text-xs text-ink-500 mt-0.5">{l.durationDays} d at {l.tempC}°C → {l.shelfLifeUsedDays} d of budget consumed</p>
                <ul className="mt-2 space-y-1 text-xs text-ink-600 list-disc list-inside">
                  {l.explanations.slice(0, 3).map((e, j) => <li key={j}>{e}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {res && !res.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{res.errors?.[0]}</div>
      )}
    </div>
  );
}
