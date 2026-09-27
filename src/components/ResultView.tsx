'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceArea,
  RadarChart, PolarGrid, PolarAngleAxis, Radar as RadarShape, PolarRadiusAxis,
} from 'recharts';
import Link from 'next/link';
import type { AnalysisResult, Recommendation } from '@/lib/domain/types';
import { MapSimulator } from './MapSimulator';

const profileNames: Record<string, string> = {
  cost: 'Cost Optimized',
  shelf: 'Shelf-Life Optimized',
  sustainability: 'Sustainability Optimized',
  transport: 'Transport-Durability Optimized',
  balanced: 'Balanced',
};

interface GeneratedStructure {
  id: string;
  name: string;
  layers: { material: string; purpose: string; barrierRole: string }[];
  rationale: string;
  tradeOffs: string[];
  estimatedCostCategory: string;
  recyclability: string;
  candidateStatus: string;
}

export function ResultView({ result }: { result: AnalysisResult }) {
  const [judgeMode, setJudgeMode] = useState(false);
  const [structures, setStructures] = useState<GeneratedStructure[]>([]);

  useEffect(() => {
    fetch('/api/structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commodityId: result.commodity.id, materialId: result.primary.material.id, priority: 'balanced' }),
    })
      .then((r) => r.json())
      .then((d) => d.ok && setStructures(d.structures))
      .catch(() => {});
  }, [result.commodity.id, result.primary.material.id]);

  const mapData = useMemo(
    () =>
      result.twin.mapState.map((p) => ({
        day: p.day,
        O2: p.o2Pct,
        CO2: p.co2Pct,
      })),
    [result],
  );

  const mapTargets = result.twin.mapState.length
    ? {
        o2Lo: Math.min(...result.twin.mapState.map((s) => 2)),
        co2Lo: 3,
        co2Hi: 10,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* PRIMARY RECOMMENDATION */}
      <div className="card card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">Recommended packaging</div>
            <h2 className="text-2xl font-bold text-ink-900 mt-1">{result.primary.material.name}</h2>
            <p className="text-sm text-ink-500 mt-1">
              {result.commodity.name} · {profileNames[result.primary.mode] ?? result.primary.mode} priority · score{' '}
              <b>{result.primary.score.total.toFixed(1)}/100</b>
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-ink-900">₹{result.primary.score.estimatedCostPerPackageInr.toFixed(2)}</div>
            <div className="text-xs text-ink-400">estimated cost / package</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['OTR', `${result.primary.material.otrCm3M2Day.value} cm³/m²·d`],
            ['WVTR', `${result.primary.material.wvtrGm2Day.value} g/m²·d`],
            ['Thickness', `${result.primary.material.thicknessUmRange[0]}–${result.primary.material.thicknessUmRange[1]} µm`],
            ['Sealable', result.primary.material.sealable ? 'Yes (heat-seal)' : 'No'],
            ['MAP suitability', result.primary.material.mapSuitable ? 'Suitable' : 'Not suitable'],
            ['Estimated shelf life', `${result.shelfLife.daysLow}–${result.shelfLife.daysHigh} days`],
            ['Sustainability', `${result.sustainability.total}/100 (est.)`],
            ['Transport fit', result.transport.suitability],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border border-ink-200 bg-ink-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{k}</div>
              <div className="text-sm font-semibold text-ink-800 mt-0.5">{v as string}</div>
            </div>
          ))}
        </div>

        {/* STRUCTURE VISUALIZER */}
        <div className="mt-5">
          <div className="section-title">Packaging structure (modelled)</div>
          <div className="space-y-1">
            {result.primary.structureLayers.map((l, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-ink-200 px-3 py-2" style={{ background: `rgba(22,163,74,${0.04 + i * 0.04})` }}>
                <span className="text-xs font-bold text-ink-400 w-24">{l.name}</span>
                <span className="text-sm font-medium text-ink-700 flex-1">{l.material}</span>
                <span className="text-xs text-ink-500">{l.thicknessUm ? `${l.thicknessUm} µm · ` : ''}{l.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* WHY THIS PACKAGING */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card card-pad">
          <div className="section-title">Why this packaging?</div>
          <ul className="space-y-2">
            {result.primary.reasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span>{r.verdict === 'pro' ? '✅' : '⚠️'}</span>
                <span className="text-ink-700">{r.text}</span>
              </li>
            ))}
          </ul>
          <div className="section-title mt-5">Why not the alternatives?</div>
          <ul className="space-y-2">
            {result.recommendations.balanced.slice(1, 4).map((r) => (
              <li key={r.material.id} className="text-sm">
                <span className="font-semibold text-ink-800">{r.material.name.split(' (')[0]}</span>
                <span className="text-ink-500"> — {r.reasons.find((x) => x.verdict === 'con')?.text ?? `scored ${r.score.total.toFixed(1)} vs ${result.primary.score.total.toFixed(1)}.`}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* REQUIRED PROPERTIES */}
        <div className="card card-pad">
          <div className="section-title">Required packaging properties (derived)</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ['OTR window', `${result.requirements.otrMin ?? '≤'} ${result.requirements.otrMax} cm³/m²·d`],
              ['WVTR max', `${result.requirements.wvtrMax} g/m²·d`],
              ['CO₂TR min', result.requirements.co2trMin ? `${result.requirements.co2trMin} cm³/m²·d` : 'n/a'],
              ['Moisture barrier ≥', `${Math.round(result.requirements.moistureBarrierMin * 100)}%`],
              ['O₂ barrier ≥', `${Math.round(result.requirements.oxygenBarrierMin * 100)}%`],
              ['Light barrier ≥', `${Math.round(result.requirements.lightBarrierMin * 100)}%`],
              ['Thickness', `${result.requirements.thicknessUmMin}–${result.requirements.thicknessUmMax} µm`],
              ['Sealability', result.requirements.sealabilityRequired ? 'Required' : 'Optional'],
              ['MAP', result.requirements.mapSuitability],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-ink-50 border border-ink-200 px-3 py-2">
                <div className="text-[10px] uppercase text-ink-400 font-semibold">{k}</div>
                <div className="text-ink-800 font-medium">{v as string}</div>
              </div>
            ))}
          </div>
          <div className="section-title mt-4">Derivation log</div>
          <ol className="space-y-1.5 text-xs text-ink-600 list-decimal list-inside">
            {result.requirements.derivation.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ol>
          {result.requirements.dataGaps.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <b>Data gaps / assumptions:</b> {result.requirements.dataGaps.join('; ')}
            </div>
          )}
        </div>
      </div>

      {/* STRUCTURE GENERATOR */}
      {structures.length > 0 && (
        <div className="card card-pad">
          <div className="section-title">Packaging structure generator — candidate structures (not universal claims)</div>
          <p className="text-xs text-ink-400 mb-3">
            Rule-composed multilayer candidates from the requirement profile. Each layer's job is explained; every structure
            requires pack-trial validation before use.
          </p>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {structures.map((s) => (
              <div key={s.id} className="rounded-xl border border-ink-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-ink-900">{s.name}</div>
                  <span className="badge badge-amber text-[10px]">{s.candidateStatus}</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {s.layers.map((l, i) => (
                    <div key={i} className="rounded-lg bg-ink-50 px-2.5 py-1.5">
                      <div className="text-xs font-bold text-brand-700">{l.material}</div>
                      <div className="text-[11px] text-ink-600">{l.purpose} · {l.barrierRole}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-600">{s.rationale}</p>
                <ul className="mt-1.5 text-[11px] text-ink-500 list-disc pl-4">
                  {s.tradeOffs.slice(0, 2).map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2 text-[10px] text-ink-400">
                  <span>cost: {s.estimatedCostCategory}</span>
                  <span>· recycling: {s.recyclability}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUITABILITY RADAR */}
      <div className="card card-pad">
        <div className="section-title">Packaging suitability profile (0–100, model estimates)</div>
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={[
              { axis: 'O₂ barrier', value: result.primary.score.breakdown.otrSuitability },
              { axis: 'Moisture', value: result.primary.score.breakdown.wvtrSuitability },
              { axis: 'Mechanical', value: result.primary.score.breakdown.thicknessSuitability },
              { axis: 'Transport', value: result.primary.score.breakdown.transportScore },
              { axis: 'Cost fit', value: result.primary.score.breakdown.costScore },
              { axis: 'Seal & temp', value: Math.round((result.primary.score.breakdown.sealability + result.primary.score.breakdown.temperatureCompatibility) / 2) },
              { axis: 'Sustainability', value: result.primary.score.breakdown.sustainabilityScore },
            ]}>
              <PolarGrid />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <RadarShape dataKey="value" stroke="#16a34a" fill="#16a34a" fillOpacity={0.35} name="Primary recommendation" />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
          <ul className="text-sm text-ink-600 space-y-1.5">
            <li>• Axes are the weighted multi-criteria score components for the primary recommendation ({result.primary.material.name.split(' (')[0]}).</li>
            <li>• A balanced polygon suggests a well-matched candidate; a spike/dip shows the limiting property.</li>
            <li>• Values are relative model scores for decision support — not certified measurements.</li>
          </ul>
        </div>
      </div>

      {/* MULTI-OBJECTIVE */}
      <div className="card card-pad">
        <div className="section-title">Multi-criteria recommendation (side-by-side, model estimates)</div>
        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
          {Object.entries(result.recommendations).map(([profile, recs]) => {
            const top = recs[0];
            return (
              <div key={profile} className={`rounded-xl border p-3 ${profile === result.primary.mode ? 'border-brand-500 bg-brand-50/50' : 'border-ink-200'}`}>
                <div className="text-xs font-bold uppercase tracking-wide text-ink-500">{profileNames[profile] ?? profile}</div>
                <div className="mt-2 font-semibold text-ink-800 text-sm">{top.material.name.split(' (')[0]}</div>
                <div className="mt-1 text-lg font-bold text-ink-900">₹{top.score.estimatedCostPerPackageInr.toFixed(2)}</div>
                <div className="text-xs text-ink-500">est. {top.score.estimatedShelfLifeDays[0]}–{top.score.estimatedShelfLifeDays[1]} days</div>
                <div className="text-xs text-ink-500">sustainability {top.score.sustainabilityScore}/100</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DIGITAL TWIN */}
      <div className="card card-pad">
        <div className="section-title">Packaging model snapshot (live simulator on the Packaging Model tab)</div>
        <div className="grid md:grid-cols-4 gap-3">
          {[
            ['Estimated shelf life', `${result.twin.estimatedShelfLife.daysLow}–${result.twin.estimatedShelfLife.daysHigh} days`, `${result.twin.estimatedShelfLife.confidence} confidence`],
            ['Oxygen risk', `${result.twin.oxygenRisk}/100`, 'model-based'],
            ['Moisture risk', `${result.twin.moistureRisk}/100`, 'model-based'],
            ['Spoilage risk', `${result.twin.spoilageRisk}/100`, 'model-based'],
            ['Transport risk', `${result.twin.transportRisk}/100`, result.transport.suitability],
            ['Cost / package', `₹${result.twin.costPerPackageInr.toFixed(2)}`, 'estimate'],
            ['Sustainability', `${result.twin.sustainabilityScore}/100`, 'estimate'],
            ['MAP points in target', `${result.twin.mapState.filter((m) => m.withinTarget).length}/${result.twin.mapState.length}`, 'simulation'],
          ].map(([k, v, sub]) => (
            <div key={k as string} className="rounded-lg border border-ink-200 p-3">
              <div className="text-[10px] uppercase font-semibold text-ink-400">{k}</div>
              <div className="text-lg font-bold text-ink-900">{v as string}</div>
              <div className="text-xs text-ink-400">{sub as string}</div>
            </div>
          ))}
        </div>
        {mapData.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-ink-500 mb-1">MAP atmosphere over time (model simulation)</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={mapData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <ReferenceArea y1={3} y2={10} fill="#22c55e" fillOpacity={0.08} ifOverflow="extendDomain" />
                <Line type="monotone" dataKey="O2" stroke="#0ea5e9" dot={false} />
                <Line type="monotone" dataKey="CO2" stroke="#f59e0b" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* SUSTAINABILITY + ECONOMICS + TRANSPORT */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card card-pad">
          <div className="section-title">Sustainability (estimated)</div>
          <div className="text-4xl font-bold text-ink-900">{result.sustainability.total}<span className="text-lg text-ink-400">/100</span></div>
          <div className="mt-3 space-y-2">
            {[
              ['Material impact', result.sustainability.materialImpact],
              ['Recyclability', result.sustainability.recyclability],
              ['Recycled/bio content', result.sustainability.recycledContent],
              ['Food-waste reduction potential', result.sustainability.foodWasteReduction],
              ['Transport efficiency', result.sustainability.transportEfficiency],
              ['End-of-life', result.sustainability.endOfLife],
            ].map(([k, v]) => (
              <div key={k as string}>
                <div className="flex justify-between text-xs text-ink-600">
                  <span>{k as string}</span>
                  <span>{v as number}</span>
                </div>
                <div className="h-1.5 rounded-full bg-ink-100">
                  <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${v as number}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-400">{result.sustainability.notes}</p>
        </div>

        <div className="card card-pad">
          <div className="section-title">Food waste vs packaging cost (estimates)</div>
          <table className="w-full text-sm">
            <tbody>
              {[
                ['Loss without optimized packaging', `${result.wasteEconomics.lossRateWithoutPct}%`],
                ['Loss with recommended packaging', `${result.wasteEconomics.lossRateWithPct}%`],
                ['Food value lost / pack', `₹${result.wasteEconomics.foodValueLostInr.toFixed(2)}`],
                ['Food value saved / pack', `₹${result.wasteEconomics.foodValueSavedInr.toFixed(2)}`],
                ['Additional packaging cost', `₹${result.wasteEconomics.additionalPackagingCostInr.toFixed(2)}`],
              ].map(([k, v]) => (
                <tr key={k as string}>
                  <td className="py-1.5 text-ink-600">{k as string}</td>
                  <td className="py-1.5 text-right font-semibold text-ink-800">{v as string}</td>
                </tr>
              ))}
              <tr className="border-t border-ink-200">
                <td className="py-2 font-semibold text-ink-800">Net potential economic impact</td>
                <td className="py-2 text-right font-bold text-brand-700">₹{result.wasteEconomics.netEconomicImpactInr.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ink-400">All values are model estimates based on reference loss rates, not measured data.</p>
        </div>

        <div className="card card-pad">
          <div className="section-title">Transport analysis</div>
          <div className="flex items-center gap-2">
            <span className={`badge ${result.transport.suitability === 'high' ? 'badge-green' : result.transport.suitability === 'medium' ? 'badge-amber' : 'badge-red'}`}>
              Suitability: {result.transport.suitability}
            </span>
            <span className="text-sm text-ink-500">risk {result.transport.riskScore}/100</span>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-ink-600 list-disc list-inside">
            {result.transport.explanations.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* JUDGE MODE */}
      <div className="card card-pad">
        <div className="flex items-center justify-between">
          <div className="section-title !mb-0">Explain Like I'm a Judge</div>
          <button className="btn-ghost text-xs" onClick={() => setJudgeMode(!judgeMode)}>
            {judgeMode ? 'Hide' : 'Show'} WHAT/WHY/HOW/DATA/LIMITATIONS/IMPACT
          </button>
        </div>
        {judgeMode && (
          <div className="mt-4 grid md:grid-cols-2 gap-3 text-sm">
            {[
              ['WHAT', result.judge.what],
              ['WHY', result.judge.why],
              ['HOW', result.judge.how],
              ['DATA', result.judge.data],
              ['LIMITATIONS', result.judge.limitations],
              ['IMPACT', result.judge.impact],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg border border-ink-200 bg-ink-50 p-3">
                <div className="text-xs font-bold text-brand-700">{k as string}</div>
                <p className="mt-1 text-ink-700">{v as string}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* COMPARISON + REPORT CTA */}
      <div className="card card-pad flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-ink-800">Next steps</div>
          <p className="text-sm text-ink-500">Compare alternatives in detail, simulate the digital twin live, or generate the PDF report.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/compare?commodity=${result.commodity.id}`} className="btn-ghost text-sm">Compare materials</Link>
          <Link href={`/twin?commodity=${result.commodity.id}`} className="btn-ghost text-sm">Open Packaging Model</Link>
          <Link href={`/report?commodity=${result.commodity.id}`} className="btn-primary text-sm">Generate report</Link>
        </div>
      </div>
    </div>
  );
}
