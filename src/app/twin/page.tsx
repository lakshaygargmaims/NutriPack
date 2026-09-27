'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceArea,
} from 'recharts';
import type { AnalysisInput, AnalysisResult, DigitalTwinState } from '@/lib/domain/types';
import { FailureLab } from '@/components/FailureLab';

function TwinInner() {
  const params = useSearchParams();
  const commodity = params.get('commodity') ?? 'tomato';
  const [tab, setTab] = useState<'twin' | 'failure'>('twin');
  const [baseInput, setBaseInput] = useState<AnalysisInput | null>(null);
  const [twin, setTwin] = useState<DigitalTwinState | null>(null);
  const [busy, setBusy] = useState(false);
  const [sliders, setSliders] = useState({ temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12 });

  useEffect(() => {
    (async () => {
      const demo = await (await fetch('/api/demo')).json();
      const s = demo.scenarios?.find((x: any) => x.id === 'tomato-delhi-jaipur');
      const input: AnalysisInput =
        s?.input ??
        ({
          commodityId: commodity,
          storage: { temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' },
          transport: { origin: 'Delhi', destination: 'Jaipur', distanceKm: 280, mode: 'road', durationDays: 1, expectedTempC: 20, expectedRhPct: 60, coldChain: false },
          business: { packageSizeGrams: 1000, productionVolumePerMonth: 10000 },
          priority: 'balanced',
        } as AnalysisInput);
      if (input.commodityId !== commodity) input.commodityId = commodity;
      setBaseInput(input);
      setSliders({
        temperatureC: input.storage.temperatureC ?? 8,
        rhPct: input.storage.rhPct ?? 85,
        targetShelfLifeDays: input.storage.targetShelfLifeDays ?? 12,
      });
      await simulate(input, { temperatureC: input.storage.temperatureC ?? 8, rhPct: input.storage.rhPct ?? 85, targetShelfLifeDays: input.storage.targetShelfLifeDays ?? 12 });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commodity]);

  async function simulate(input: AnalysisInput, changes: typeof sliders) {
    setBusy(true);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, changes }),
      });
      const data = await res.json();
      if (data.ok) setTwin(data.twin);
    } finally {
      setBusy(false);
    }
  }

  function onChange(patch: Partial<typeof sliders>) {
    const next = { ...sliders, ...patch };
    setSliders(next);
    if (baseInput) simulate(baseInput, next);
  }

  const mapData = (twin?.mapState ?? []).map((p) => ({ day: p.day, O2: p.o2Pct, CO2: p.co2Pct }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Packaging Simulation Model</h1>
        <p className="text-sm text-ink-500">
          A <b>Packaging Simulation Model</b> of food + packaging + environment + transport — not a sensor-connected
          Digital Twin yet. Change parameters and watch model estimates update live; the architecture is future-ready for
          IoT sensor integration. All values are model-based.
        </p>
      </div>

      <div className="flex gap-2">
        <button className={`btn text-sm ${tab === 'twin' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('twin')}>
          Live simulation
        </button>
        <button className={`btn text-sm ${tab === 'failure' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('failure')}>
          ⚠️ Failure Lab + Monte Carlo
        </button>
      </div>

      {tab === 'failure' && baseInput && <FailureLab baseInput={baseInput} />}

      {tab === 'twin' && (
      <div className="grid lg:grid-cols-3 gap-6">
        {/* SYSTEM DIAGRAM */}
        <div className="card card-pad">
          <div className="section-title">System</div>
          <div className="space-y-2 text-center text-sm">
            <div className="rounded-lg border-2 border-red-200 bg-red-50 p-3 font-semibold text-red-800">🍎 FOOD · {commodity}</div>
            <div className="text-ink-300">↕ gas & moisture exchange</div>
            <div className="rounded-lg border-2 border-brand-300 bg-brand-50 p-3 font-semibold text-brand-800">📦 PACKAGING · {twin ? `OTR ${twin.estimatedShelfLife.daysLow > 0 ? '' : ''}` : ''}active film</div>
            <div className="text-ink-300">↕ permeation & sealing</div>
            <div className="rounded-lg border-2 border-sky-200 bg-sky-50 p-3 font-semibold text-sky-800">
              🌡️ ENVIRONMENT · {sliders.temperatureC}°C · {sliders.rhPct}% RH
            </div>
            <div className="text-ink-300">↕ logistics exposure</div>
            <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-3 font-semibold text-amber-800">🚚 TRANSPORT · Delhi → Jaipur</div>
          </div>

          <div className="section-title mt-6">Controls</div>
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="tw-temp">Temperature: {sliders.temperatureC}°C</label>
              <input id="tw-temp" type="range" min={0} max={35} step={0.5} value={sliders.temperatureC} onChange={(e) => onChange({ temperatureC: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label" htmlFor="tw-rh">Humidity: {sliders.rhPct}%</label>
              <input id="tw-rh" type="range" min={20} max={100} step={1} value={sliders.rhPct} onChange={(e) => onChange({ rhPct: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label" htmlFor="tw-target">Target shelf life: {sliders.targetShelfLifeDays} days</label>
              <input id="tw-target" type="range" min={3} max={120} step={1} value={sliders.targetShelfLifeDays} onChange={(e) => onChange({ targetShelfLifeDays: Number(e.target.value) })} />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-ink-400">
            Estimates use ranges & confidence — never false precision. Example: “11.8–13.1 days, medium confidence”.
          </p>
        </div>

        {/* OUTPUTS */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            {[
              ['Estimated shelf life', twin ? `${twin.estimatedShelfLife.daysLow}–${twin.estimatedShelfLife.daysHigh} d` : '…', twin?.estimatedShelfLife.confidence],
              ['Oxygen risk', twin ? `${twin.oxygenRisk}/100` : '…', 'model'],
              ['Moisture risk', twin ? `${twin.moistureRisk}/100` : '…', 'model'],
              ['Spoilage risk', twin ? `${twin.spoilageRisk}/100` : '…', 'model'],
              ['Transport risk', twin ? `${twin.transportRisk}/100` : '…', 'model'],
              ['Cost / package', twin ? `₹${twin.costPerPackageInr.toFixed(2)}` : '…', 'estimate'],
              ['Sustainability', twin ? `${twin.sustainabilityScore}/100` : '…', 'estimate'],
              ['Limiting factor', twin ? twin.estimatedShelfLife.limitingFactor.split('(')[0].trim() : '…', 'explanation'],
            ].map(([k, v, sub]) => (
              <div key={k as string} className="card card-pad !p-3">
                <div className="text-[10px] uppercase font-semibold text-ink-400">{k as string}</div>
                <div className={`text-lg font-bold ${busy ? 'text-ink-300' : 'text-ink-900'}`}>{v as string}</div>
                <div className="text-[10px] text-ink-400">{sub as string}</div>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div className="section-title">MAP atmosphere over time (simulation)</div>
            {mapData.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={mapData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <ReferenceArea y1={2} y2={8} fill="#22c55e" fillOpacity={0.08} ifOverflow="extendDomain" />
                  <Line type="monotone" dataKey="O2" stroke="#0ea5e9" dot={false} />
                  <Line type="monotone" dataKey="CO2" stroke="#f59e0b" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-ink-400">No MAP simulation for this configuration.</p>
            )}
          </div>

          <div className="card card-pad">
            <div className="section-title">Interpretation</div>
            <p className="text-sm text-ink-600">
              {twin
                ? `At ${sliders.temperatureC}°C and ${sliders.rhPct}% RH, the model estimates ${twin.estimatedShelfLife.daysLow}–${twin.estimatedShelfLife.daysHigh} days of shelf life (confidence: ${twin.estimatedShelfLife.confidence}) with ${twin.estimatedShelfLife.limitingFactor}. Shelf-life estimates are model-based (Q10 + barrier fit) and must be experimentally validated.`
                : 'Running simulation…'}
            </p>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export default function TwinPage() {
  return (
    <Suspense fallback={<div className="card card-pad">Loading packaging model…</div>}>
      <TwinInner />
    </Suspense>
  );
}
