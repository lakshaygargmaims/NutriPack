'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AnalysisInput, AnalysisResult, FoodCommodity } from '@/lib/domain/types';
import { ResultView } from '@/components/ResultView';
import { FoodImage } from '@/components/FoodImage';

function AnalyzerInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [foods, setFoods] = useState<FoodCommodity[]>([]);
  const [commodityId, setCommodityId] = useState('');
  const [form, setForm] = useState({
    temperatureC: 8,
    rhPct: 85,
    targetShelfLifeDays: 12,
    environment: 'refrigerated' as 'ambient' | 'refrigerated' | 'frozen' | 'controlled',
    origin: 'Delhi',
    destination: 'Jaipur',
    distanceKm: 280,
    mode: 'road' as 'road' | 'rail' | 'air' | 'sea' | 'none',
    durationDays: 1,
    expectedTempC: 20,
    expectedRhPct: 60,
    coldChain: false,
    budgetPerPackageInr: undefined as number | undefined,
    packageSizeGrams: 1000,
    productionVolumePerMonth: 10000,
    priority: 'balanced' as AnalysisInput['priority'],
    propertyOverrides: {} as Record<string, number | undefined>,
  });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/foods')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setFoods(d.foods);
          if (!commodityId) setCommodityId(d.foods[0]?.id ?? '');
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SIH demo mode: prefill from a demo scenario and run instantly
  useEffect(() => {
    const demo = params.get('demo');
    if (!demo || !foods.length) return;
    (async () => {
      const res = await fetch('/api/demo');
      const data = await res.json();
      const scenario = data.scenarios?.find((s: any) => s.id === demo);
      if (data.ok && scenario) {
        const i = scenario.input;
        setCommodityId(i.commodityId);
        setForm((f) => ({
          ...f,
          temperatureC: i.storage.temperatureC ?? f.temperatureC,
          rhPct: i.storage.rhPct ?? f.rhPct,
          targetShelfLifeDays: i.storage.targetShelfLifeDays ?? f.targetShelfLifeDays,
          environment: i.storage.environment ?? f.environment,
          origin: i.transport?.origin ?? f.origin,
          destination: i.transport?.destination ?? f.destination,
          distanceKm: i.transport?.distanceKm ?? f.distanceKm,
          mode: i.transport?.mode ?? f.mode,
          durationDays: i.transport?.durationDays ?? f.durationDays,
          expectedTempC: i.transport?.expectedTempC ?? f.expectedTempC,
          expectedRhPct: i.transport?.expectedRhPct ?? f.expectedRhPct,
          coldChain: i.transport?.coldChain ?? f.coldChain,
          packageSizeGrams: i.business?.packageSizeGrams ?? f.packageSizeGrams,
          productionVolumePerMonth: i.business?.productionVolumePerMonth ?? f.productionVolumePerMonth,
          priority: i.priority,
        }));
        run(scenario.input);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, foods.length]);

  function buildInput(): AnalysisInput {
    const po: Record<string, number> = {};
    for (const [k, v] of Object.entries(form.propertyOverrides)) {
      if (v !== undefined && v !== null && !Number.isNaN(v)) po[k] = Number(v);
    }
    return {
      commodityId,
      propertyOverrides: Object.keys(po).length ? (po as any) : undefined,
      storage: {
        temperatureC: form.temperatureC,
        rhPct: form.rhPct,
        targetShelfLifeDays: form.targetShelfLifeDays,
        environment: form.environment,
      },
      transport: {
        origin: form.origin,
        destination: form.destination,
        distanceKm: form.distanceKm,
        mode: form.mode,
        durationDays: form.durationDays,
        expectedTempC: form.expectedTempC,
        expectedRhPct: form.expectedRhPct,
        coldChain: form.coldChain,
      },
      business: {
        budgetPerPackageInr: form.budgetPerPackageInr,
        packageSizeGrams: form.packageSizeGrams,
        productionVolumePerMonth: form.productionVolumePerMonth,
      },
      priority: form.priority,
    };
  }

  async function run(inputOverride?: AnalysisInput) {
    setBusy(true);
    setErrors([]);
    setWarnings([]);
    try {
      const input = inputOverride ?? buildInput();
      const res = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrors(data.errors ?? ['Analysis failed']);
        return;
      }
      setResult(data.result);
      setWarnings(data.result.requirements.dataGaps ?? []);
      router.replace(`/analyzer?commodity=${data.result.commodity.id}`);
    } catch (e: any) {
      setErrors([String(e.message ?? e)]);
    } finally {
      setBusy(false);
    }
  }

  const selected = foods.find((f) => f.id === commodityId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">New Packaging Analysis</h1>
          <p className="text-sm text-ink-500">Food → properties → requirements → AI recommendation → digital twin.</p>
        </div>
        <button className="btn-primary" onClick={() => run()} disabled={busy || !commodityId}>
          {busy ? 'Generating…' : '⚡ Generate Recommendation'}
        </button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <b>No recommendation generated.</b>
          <ul className="list-disc list-inside mt-1">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* FORM */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card card-pad space-y-4">
            <div className="section-title">1 · Commodity</div>
            <FoodImage onConfirm={(id) => setCommodityId(id)} />
            <div>
              <label className="label" htmlFor="commodity">Commodity</label>
              <select id="commodity" className="input" value={commodityId} onChange={(e) => setCommodityId(e.target.value)}>
                {foods.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.category}, {f.form})
                  </option>
                ))}
              </select>
              {selected && (
                <p className="mt-1 text-xs text-ink-500">
                  Reference storage: {selected.storageTempRangeC[0]}–{selected.storageTempRangeC[1]}°C, {selected.storageRhRangePct[0]}–{selected.storageRhRangePct[1]}% RH ·
                  indicative shelf life ≈ {selected.indicativeShelfLifeDays.value} days (provenance: {selected.indicativeShelfLifeDays.provenance})
                </p>
              )}
            </div>
          </div>

          <div className="card card-pad space-y-3">
            <div className="section-title">2 · Storage</div>
            {([
              ['temperatureC', 'Storage temperature (°C)', -25, 55, 0.5],
              ['rhPct', 'Relative humidity (%)', 1, 100, 1],
              ['targetShelfLifeDays', 'Target shelf life (days)', 1, 365, 1],
            ] as const).map(([key, label, min, max, step]) => (
              <div key={key}>
                <label className="label" htmlFor={`st-${key}`}>{label}</label>
                <input
                  id={`st-${key}`}
                  type="number"
                  className="input"
                  min={min}
                  max={max}
                  step={step}
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
                />
              </div>
            ))}
            <div>
              <label className="label" htmlFor="env">Storage environment</label>
              <select id="env" className="input" value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value as any })}>
                <option value="ambient">Ambient</option>
                <option value="refrigerated">Refrigerated</option>
                <option value="frozen">Frozen</option>
                <option value="controlled">Controlled atmosphere</option>
              </select>
            </div>
          </div>

          <div className="card card-pad space-y-3">
            <div className="section-title">3 · Transport</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="origin">Origin</label>
                <input id="origin" className="input" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="destination">Destination</label>
                <input id="destination" className="input" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="distanceKm">Distance (km)</label>
                <input id="distanceKm" type="number" className="input" value={form.distanceKm} onChange={(e) => setForm({ ...form, distanceKm: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label" htmlFor="mode">Mode</label>
                <select id="mode" className="input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as any })}>
                  <option value="road">Road</option>
                  <option value="rail">Rail</option>
                  <option value="air">Air</option>
                  <option value="sea">Sea</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="durationDays">Duration (days)</label>
                <input id="durationDays" type="number" className="input" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label" htmlFor="expectedTempC">Expected temp (°C)</label>
                <input id="expectedTempC" type="number" className="input" value={form.expectedTempC} onChange={(e) => setForm({ ...form, expectedTempC: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label" htmlFor="expectedRhPct">Expected RH (%)</label>
                <input id="expectedRhPct" type="number" className="input" value={form.expectedRhPct} onChange={(e) => setForm({ ...form, expectedRhPct: Number(e.target.value) })} />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-700 mt-5">
                <input type="checkbox" checked={form.coldChain} onChange={(e) => setForm({ ...form, coldChain: e.target.checked })} />
                Cold chain available
              </label>
            </div>
          </div>

          <div className="card card-pad space-y-3">
            <div className="section-title">4 · Business & priority</div>
            <div>
              <label className="label" htmlFor="packageSizeGrams">Package size (g)</label>
              <input id="packageSizeGrams" type="number" className="input" value={form.packageSizeGrams} onChange={(e) => setForm({ ...form, packageSizeGrams: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label" htmlFor="productionVolumePerMonth">Production volume / month</label>
              <input id="productionVolumePerMonth" type="number" className="input" value={form.productionVolumePerMonth} onChange={(e) => setForm({ ...form, productionVolumePerMonth: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label" htmlFor="budgetPerPackageInr">Budget per package (₹, optional)</label>
              <input id="budgetPerPackageInr" type="number" className="input" value={form.budgetPerPackageInr ?? ''} onChange={(e) => setForm({ ...form, budgetPerPackageInr: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <label className="label">Optimization priority</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['max_shelf_life', 'Max shelf life'],
                  ['min_cost', 'Min cost'],
                  ['max_sustainability', 'Max sustainability'],
                  ['transport_durability', 'Transport durability'],
                  ['balanced', 'Balanced'],
                ] as const).map(([v, label]) => (
                  <label key={v} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${form.priority === v ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-ink-200'}`}>
                    <input type="radio" name="priority" checked={form.priority === v} onChange={() => setForm({ ...form, priority: v })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="card card-pad space-y-2">
            <div className="section-title">5 · Property overrides (optional)</div>
            <p className="text-xs text-ink-500">Leave blank to use reference values. Values you enter are provenance-tagged as "user".</p>
            {([
              ['moistureContentPct', 'Moisture content (%)'],
              ['ph', 'pH'],
              ['waterActivity', 'Water activity (aw)'],
              ['respirationRateMgCo2KgH', 'Respiration (mg CO₂/kg·h)'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="label" htmlFor={`po-${key}`}>{label}</label>
                <input
                  id={`po-${key}`}
                  type="number"
                  step="any"
                  className="input"
                  placeholder="reference"
                  value={(form.propertyOverrides as any)[key] ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      propertyOverrides: { ...form.propertyOverrides, [key]: e.target.value === '' ? undefined : Number(e.target.value) },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {/* RESULTS */}
        <div className="lg:col-span-2">
          {busy && (
            <div className="card card-pad animate-pulse space-y-3">
              <div className="h-6 bg-ink-100 rounded w-1/2" />
              <div className="h-4 bg-ink-100 rounded w-3/4" />
              <div className="h-32 bg-ink-100 rounded" />
              <div className="h-4 bg-ink-100 rounded w-2/3" />
            </div>
          )}
          {!busy && result && <ResultView result={result} />}
          {!busy && !result && (
            <div className="card card-pad text-center py-16">
              <p className="text-ink-400">Configure the analysis and press <b>Generate Recommendation</b> — or pick a demo scenario from the Dashboard.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnalyzerPage() {
  return (
    <Suspense fallback={<div className="card card-pad">Loading analyzer…</div>}>
      <AnalyzerInner />
    </Suspense>
  );
}
