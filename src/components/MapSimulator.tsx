'use client';

import { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceArea } from 'recharts';

interface MapPoint {
  day: number;
  o2Pct: number;
  co2Pct: number;
  withinTarget: boolean;
}

interface SimResponse {
  ok: boolean;
  series?: MapPoint[];
  suitable?: boolean;
  notes?: string;
  targetO2?: [number, number];
  targetCo2?: [number, number];
  effective?: { filmOtr: number; perfOtr: number; totalOtr: number };
  errors?: string[];
}

export function MapSimulator({ commodityId, materialId }: { commodityId: string; materialId: string }) {
  const [temperatureC, setTemperatureC] = useState(8);
  const [rhPct, setRhPct] = useState(85);
  const [headspaceMl, setHeadspaceMl] = useState(250);
  const [thicknessUm, setThicknessUm] = useState(30);
  const [initialO2Pct, setInitialO2Pct] = useState(21);
  const [initialCo2Pct, setInitialCo2Pct] = useState(0);
  const [days, setDays] = useState(10);
  // Micro-perforation designer state
  const [perfEnabled, setPerfEnabled] = useState(false);
  const [perfCount, setPerfCount] = useState(6);
  const [perfDiameter, setPerfDiameter] = useState(100);
  const [res, setRes] = useState<SimResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commodityId, materialId, temperatureC, rhPct, headspaceMl, thicknessUm, initialO2Pct, initialCo2Pct, days,
          perforations: perfEnabled ? { count: perfCount, diameterUm: perfDiameter } : null,
        }),
      });
      setRes(await res.json());
    } finally {
      setBusy(false);
    }
  }

  const data = (res?.series ?? []).map((p) => ({ day: p.day, O2: p.o2Pct, CO2: p.co2Pct }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Temperature °C', temperatureC, setTemperatureC, 0, 30, 1],
          ['RH %', rhPct, setRhPct, 20, 95, 1],
          ['Headspace mL', headspaceMl, setHeadspaceMl, 50, 2000, 10],
          ['Film µm', thicknessUm, setThicknessUm, 10, 100, 1],
          ['Initial O₂ %', initialO2Pct, setInitialO2Pct, 1, 21, 1],
          ['Initial CO₂ %', initialCo2Pct, setInitialCo2Pct, 0, 30, 1],
          ['Days', days, setDays, 1, 30, 1],
        ].map(([label, value, setter, min, max, step]) => (
          <div key={label as string}>
            <label className="label">{label as string}: {value as number}</label>
            <input
              type="range"
              min={min as number}
              max={max as number}
              step={step as number}
              value={value as number}
              onChange={(e) => (setter as (v: number) => void)(Number(e.target.value))}
            />
          </div>
        ))}
        <div className="flex items-end">
          <button className="btn-primary w-full text-xs" onClick={run} disabled={busy}>
            {busy ? 'Simulating…' : 'Run MAP simulation'}
          </button>
        </div>
      </div>

      {/* MICRO-PERFORATION DESIGNER */}
      <div className="rounded-xl border border-ink-200 bg-ink-50 p-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-700 cursor-pointer">
            <input type="checkbox" checked={perfEnabled} onChange={(e) => setPerfEnabled(e.target.checked)} />
            Micro-perforation designer
          </label>
          {perfEnabled && (
            <span className="text-xs text-ink-500">each hole adds gas exchange independent of film thickness (orifice diffusion model)</span>
          )}
        </div>
        {perfEnabled && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
            <div>
              <label className="label">Holes: {perfCount}</label>
              <input type="range" min={1} max={40} step={1} value={perfCount} onChange={(e) => setPerfCount(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Diameter: {perfDiameter} µm</label>
              <input type="range" min={40} max={500} step={10} value={perfDiameter} onChange={(e) => setPerfDiameter(Number(e.target.value))} />
            </div>
            <div className="flex items-end">
              <div className="text-xs text-ink-500 w-full">
                Total hole area ≈ {((Math.PI * (perfDiameter / 2000) ** 2) * perfCount).toFixed(2)} mm² · holes dominate exchange when film is a good barrier
              </div>
            </div>
          </div>
        )}
      </div>

      {res?.ok && res.series && (
        <div>
          <div className={`badge ${res.suitable ? 'badge-green' : 'badge-amber'} mb-2`}>
            {res.suitable ? 'Atmosphere reaches target window (model)' : 'Drifts outside target window (model)'}
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <ReferenceArea y1={res.targetO2?.[0] ?? 2} y2={res.targetCo2?.[1] ?? 10} fill="#22c55e" fillOpacity={0.07} ifOverflow="extendDomain" />
              <Line type="monotone" dataKey="O2" stroke="#0ea5e9" dot={false} />
              <Line type="monotone" dataKey="CO2" stroke="#f59e0b" dot={false} />
            </LineChart>
          </ResponsiveContainer>
          {res.effective && (
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              <div className="rounded-lg bg-ink-50 border border-ink-200 px-2 py-1.5">
                <div className="uppercase font-semibold text-ink-400">Film exchange</div>
                <div className="font-bold text-ink-800">{Math.round(res.effective.filmOtr)} cm³/d</div>
              </div>
              <div className="rounded-lg bg-ink-50 border border-ink-200 px-2 py-1.5">
                <div className="uppercase font-semibold text-ink-400">Perforation exchange</div>
                <div className="font-bold text-ink-800">{Math.round(res.effective.perfOtr)} cm³/d</div>
              </div>
              <div className="rounded-lg bg-brand-50 border border-brand-200 px-2 py-1.5">
                <div className="uppercase font-semibold text-brand-600">Total pack exchange</div>
                <div className="font-bold text-brand-800">{Math.round(res.effective.totalOtr)} cm³/d</div>
              </div>
            </div>
          )}
          <p className="text-xs text-ink-500 mt-2">{res.notes}</p>
        </div>
      )}
      {!res?.ok && res?.errors && <p className="text-sm text-red-600">{res.errors[0]}</p>}
    </div>
  );
}
