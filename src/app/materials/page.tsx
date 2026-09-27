'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PackagingMaterial } from '@/lib/domain/types';

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<PackagingMaterial[]>([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<PackagingMaterial | null>(null);

  useEffect(() => {
    fetch('/api/materials')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setMaterials(d.materials);
          setSelected(d.materials[0] ?? null);
        }
      });
  }, []);

  const filtered = useMemo(
    () =>
      materials.filter(
        (m) =>
          (!q || m.name.toLowerCase().includes(q.toLowerCase())) &&
          (!category || m.category === category),
      ),
    [materials, q, category],
  );

  const categories = Array.from(new Set(materials.map((m) => m.category)));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Packaging Material Explorer</h1>
        <p className="text-sm text-ink-500">
          Reference dataset (demo, non-certified). All values are provenance-tagged: reference / user / experimental / estimated.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search materials…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[180px]" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Material</th>
                <th className="th">OTR</th>
                <th className="th">WVTR</th>
                <th className="th">Cost ₹/m²</th>
                <th className="th">Recyclability</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className={`cursor-pointer hover:bg-ink-50 ${selected?.id === m.id ? 'bg-brand-50/60' : ''}`} onClick={() => setSelected(m)}>
                  <td className="td font-medium text-ink-800">{m.name}</td>
                  <td className="td">{m.otrCm3M2Day.value}</td>
                  <td className="td">{m.wvtrGm2Day.value}</td>
                  <td className="td">₹{m.costInrPerM2.value}</td>
                  <td className="td">{m.recyclability}</td>
                  <td className="td"><span className={m.dataStatus === 'verified' ? 'badge-green' : 'badge-slate'}>{m.dataStatus}</span></td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td className="td text-ink-400" colSpan={6}>No materials match your search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card card-pad">
          {selected ? (
            <div className="space-y-3">
              <div>
                <h2 className="font-bold text-ink-900">{selected.name}</h2>
                <span className="provenance-chip mt-1">{selected.category} · {selected.dataStatus} data</span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ['OTR (cm³/m²·d)', selected.otrCm3M2Day.value],
                  ['WVTR (g/m²·d)', selected.wvtrGm2Day.value],
                  ['CO₂TR (cm³/m²·d)', selected.co2trCm3M2Day.value],
                  ['Thickness (µm)', `${selected.thicknessUmRange[0]}–${selected.thicknessUmRange[1]}`],
                  ['Tensile (MPa)', selected.tensileStrengthMpa.value],
                  ['Temp range (°C)', `${selected.tempRangeC[0]}…${selected.tempRangeC[1]}`],
                  ['Moisture barrier', `${Math.round(selected.moistureBarrier * 100)}%`],
                  ['O₂ barrier', `${Math.round(selected.oxygenBarrier * 100)}%`],
                  ['Light barrier', `${Math.round(selected.lightBarrier * 100)}%`],
                  ['Sealable', selected.sealable ? 'Yes' : 'No'],
                  ['MAP suitable', selected.mapSuitable ? 'Yes' : 'No'],
                  ['CO₂e (kg/m²)', selected.carbonKgCo2ePerM2.value],
                  ['Recycled content', `${selected.recycledContentPct}%`],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg bg-ink-50 border border-ink-200 px-2 py-1.5">
                    <dt className="text-[10px] uppercase font-semibold text-ink-400">{k as string}</dt>
                    <dd className="text-ink-800 font-medium">{v as string}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <div className="text-xs font-bold text-ink-500 uppercase">Advantages</div>
                <ul className="list-disc list-inside text-sm text-ink-700">
                  {selected.advantages.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-xs font-bold text-ink-500 uppercase">Limitations</div>
                <ul className="list-disc list-inside text-sm text-ink-700">
                  {selected.limitations.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-xs font-bold text-ink-500 uppercase">Typical applications</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selected.typicalApplications.map((a) => <span key={a} className="badge-slate">{a}</span>)}
                </div>
              </div>
              {selected.sourceIds && (
                <p className="text-[11px] text-ink-400">Sources: {selected.sourceIds.join(', ')}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-400">Select a material.</p>
          )}
        </div>
      </div>
    </div>
  );
}
