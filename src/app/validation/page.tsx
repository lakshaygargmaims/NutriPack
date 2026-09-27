'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceArea,
} from 'recharts';
import type { ValidationExperiment } from '@/lib/domain/types';

export default function ValidationPage() {
  const [experiments, setExperiments] = useState<ValidationExperiment[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // new observation form
  const [obs, setObs] = useState({
    day: 1,
    weightG: '',
    weightLossPct: '',
    ph: '',
    moisturePct: '',
    colorL: '',
    textureN: '',
    spoilageScore: '',
    temperatureC: '',
    rhPct: '',
    notes: '',
  });

  // new experiment form
  const [exp, setExp] = useState({ title: '', commodityId: 'tomato', materialId: 'ldpe', predictedLow: 8, predictedHigh: 12 });

  function load() {
    fetch('/api/validation')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setExperiments(d.experiments);
          if (!selected && d.experiments.length) setSelected(d.experiments[0].id);
        }
      });
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const experiment = experiments.find((e) => e.id === selected);

  const chartData = useMemo(
    () =>
      (experiment?.observations ?? []).map((o) => ({
        day: o.day,
        'Weight loss %': o.weightLossPct ?? null,
        'Spoilage score': o.spoilageScore ?? null,
        pH: o.ph ?? null,
      })),
    [experiment],
  );

  async function createExperiment() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/validation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'experiment', ...exp, title: exp.title || 'Tomato shelf-life validation' }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(data.experiment.id);
        setMsg('Experiment created. Add observations below as the trial runs.');
        load();
      } else setMsg(data.errors?.[0] ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function addObservation() {
    if (!experiment) return;
    setBusy(true);
    setMsg('');
    try {
      const payload: any = { experimentId: experiment.id };
      for (const [k, v] of Object.entries(obs)) {
        if (v === '') continue;
        payload[k] = k === 'notes' ? v : Number(v);
      }
      const res = await fetch('/api/validation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg(data.comparison ? `Trial endpoint recorded: actual ${data.comparison.actualShelfLifeDays} days vs predicted ${data.comparison.predictedShelfLifeDays[0]}–${data.comparison.predictedShelfLifeDays[1]} days (error ${data.comparison.predictionErrorPct}%).` : 'Observation saved.');
        setObs({ day: obs.day + 1, weightG: '', weightLossPct: '', ph: '', moisturePct: '', colorL: '', textureN: '', spoilageScore: '', temperatureC: '', rhPct: '', notes: '' });
        load();
      } else setMsg(data.errors?.[0] ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Validation Lab</h1>
        <p className="text-sm text-ink-500">
          Enter real experimental observations and compare them with the AI prediction — the closed loop:
          prediction → experiment → actual → model improvement.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="card card-pad">
            <div className="section-title">Experiments</div>
            {experiments.length ? (
              <ul className="space-y-2">
                {experiments.map((e) => (
                  <li key={e.id}>
                    <button
                      className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${selected === e.id ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50'}`}
                      onClick={() => setSelected(e.id)}
                    >
                      <div className="font-medium text-ink-800">{e.title}</div>
                      <div className="text-xs text-ink-400">
                        {e.commodityId} · {e.materialId} · predicted {e.predictedShelfLife[0]}–{e.predictedShelfLife[1]} d · {e.status}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-400">No experiments yet — create one below.</p>
            )}
          </div>

          <div className="card card-pad space-y-2">
            <div className="section-title">New experiment</div>
            <input className="input" placeholder="Title" value={exp.title} onChange={(e) => setExp({ ...exp, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Commodity id (tomato)" value={exp.commodityId} onChange={(e) => setExp({ ...exp, commodityId: e.target.value })} />
              <input className="input" placeholder="Material id (ldpe)" value={exp.materialId} onChange={(e) => setExp({ ...exp, materialId: e.target.value })} />
              <input className="input" type="number" placeholder="Predicted low (d)" value={exp.predictedLow} onChange={(e) => setExp({ ...exp, predictedLow: Number(e.target.value) })} />
              <input className="input" type="number" placeholder="Predicted high (d)" value={exp.predictedHigh} onChange={(e) => setExp({ ...exp, predictedHigh: Number(e.target.value) })} />
            </div>
            <button className="btn-primary w-full text-sm" onClick={createExperiment} disabled={busy}>
              Create experiment
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {experiment ? (
            <>
              <div className="card card-pad">
                <div className="section-title">Add observation — {experiment.title}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {([
                    ['day', 'Day'],
                    ['weightG', 'Weight (g)'],
                    ['weightLossPct', 'Weight loss (%)'],
                    ['ph', 'pH'],
                    ['moisturePct', 'Moisture (%)'],
                    ['colorL', 'Color L*'],
                    ['textureN', 'Texture (N)'],
                    ['spoilageScore', 'Spoilage 0–5'],
                    ['temperatureC', 'Temp (°C)'],
                    ['rhPct', 'RH (%)'],
                  ] as const).map(([k, label]) => (
                    <div key={k}>
                      <label className="label">{label}</label>
                      <input className="input" type="number" step="any" value={(obs as any)[k]} onChange={(e) => setObs({ ...obs, [k]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <input className="input mt-2" placeholder="Notes (optional)" value={obs.notes} onChange={(e) => setObs({ ...obs, notes: e.target.value })} />
                <button className="btn-primary mt-3 text-sm" onClick={addObservation} disabled={busy}>
                  Save observation
                </button>
                {msg && <p className="mt-2 text-sm text-brand-700">{msg}</p>}
                <p className="mt-2 text-xs text-ink-400">
                  Tip: recording spoilage score ≥ 4 closes the trial and computes prediction error automatically.
                </p>
              </div>

              <div className="card card-pad">
                <div className="section-title">Prediction vs actual</div>
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <ReferenceArea y1={4} y2={5.2} fill="#ef4444" fillOpacity={0.08} ifOverflow="extendDomain" />
                      <Line type="monotone" dataKey="Weight loss %" stroke="#0ea5e9" dot />
                      <Line type="monotone" dataKey="Spoilage score" stroke="#ef4444" dot />
                      <Line type="monotone" dataKey="pH" stroke="#16a34a" dot />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-ink-400">No observations yet.</p>
                )}
                {experiment.actualShelfLifeDays && (
                  <div className="mt-3 rounded-lg bg-ink-50 border border-ink-200 p-3 text-sm">
                    <b>Closed loop result:</b> predicted {experiment.predictedShelfLife[0]}–{experiment.predictedShelfLife[1]} days ·
                    actual {experiment.actualShelfLifeDays} days ·{' '}
                    {experiment.status}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card card-pad py-16 text-center text-ink-400">
              Create an experiment to begin validation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
