'use client';

import { useEffect, useState } from 'react';

interface DB {
  formats: FormatRow[];
  closures: ClosureRow[];
  sealingMethods: SealRow[];
  secondary: GenRow[];
  tertiary: GenRow[];
  label: string;
}
interface FormatRow {
  id: string; name: string; category: string; ventilationCapability: string; leakResistance: string; resealability: string; stackability: string;
  typicalApplications: string[]; foodCompatibility: string[]; description: string; dataType: string; compatibleMaterialIds: string[];
}
interface ClosureRow {
  id: string; name: string; type: string; resealable: boolean; tamperEvidence: boolean; leakResistance: string; compatibleFormatIds: string[]; description: string; dataType: string;
}
interface SealRow {
  id: string; name: string; sealStrength: string; hermeticPotential: string; equipmentRequirement: string; description: string; dataType: string;
}
interface GenRow {
  id: string; name: string; material: string; protection?: string; stackability: string; description: string; dataType: string;
}

const PILL: Record<string, string> = {
  high: 'bg-green-100 text-green-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-ink-100 text-ink-600',
};

export default function FormatsPage() {
  const [db, setDb] = useState<DB | null>(null);
  const [tab, setTab] = useState<'formats' | 'closures' | 'sealing' | 'secondary' | 'tertiary'>('formats');

  useEffect(() => {
    fetch('/api/complete-solution').then((r) => r.json()).then((d) => d.ok && setDb(d));
  }, []);

  if (!db) return <div className="card card-pad h-40 animate-pulse bg-ink-100" />;

  const tabs = [
    ['formats', `Formats (${db.formats.length})`],
    ['closures', `Closures (${db.closures.length})`],
    ['sealing', `Sealing (${db.sealingMethods.length})`],
    ['secondary', `Secondary (${db.secondary.length})`],
    ['tertiary', `Tertiary (${db.tertiary.length})`],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Packaging Formats & Components</h1>
        <p className="text-sm text-ink-500">{db.label}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`btn text-sm ${tab === id ? 'btn-primary' : 'btn-ghost'}`}>{label}</button>
        ))}
      </div>

      {tab === 'formats' && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {db.formats.map((f) => (
            <div key={f.id} className="card card-pad">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink-900">{f.name}</h3>
                <span className="badge badge-amber text-[10px]">{f.dataType.toUpperCase()}</span>
              </div>
              <div className="text-xs uppercase text-ink-400 font-semibold mt-0.5">{f.category}</div>
              <p className="text-sm text-ink-600 mt-2">{f.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[['vent', f.ventilationCapability], ['leak', f.leakResistance], ['reseal', f.resealability], ['stack', f.stackability]].map(([k, v]) => (
                  <span key={k} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PILL[v]}`}>{k}: {v}</span>
                ))}
              </div>
              <div className="mt-2 text-xs text-ink-500"><b>Applications:</b> {f.typicalApplications.join(', ')}</div>
              <div className="text-xs text-ink-500"><b>Compatible materials:</b> {f.compatibleMaterialIds.join(', ')}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'closures' && (
        <div className="grid md:grid-cols-2 gap-4">
          {db.closures.map((c) => (
            <div key={c.id} className="card card-pad">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink-900">{c.name}</h3>
                <span className="badge badge-amber text-[10px]">{c.dataType.toUpperCase()}</span>
              </div>
              <p className="text-sm text-ink-600 mt-1">{c.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PILL[c.leakResistance]}`}>leak: {c.leakResistance}</span>
                {c.resealable && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-800">resealable</span>}
                {c.tamperEvidence && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800">tamper-evident</span>}
              </div>
              <div className="mt-2 text-xs text-ink-500"><b>Fits formats:</b> {c.compatibleFormatIds.length} in database</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'sealing' && (
        <div className="grid md:grid-cols-2 gap-4">
          {db.sealingMethods.map((s) => (
            <div key={s.id} className="card card-pad">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink-900">{s.name}</h3>
                <span className="badge badge-amber text-[10px]">{s.dataType.toUpperCase()}</span>
              </div>
              <p className="text-sm text-ink-600 mt-1">{s.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PILL[s.sealStrength]}`}>strength: {s.sealStrength}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PILL[s.hermeticPotential]}`}>hermetic: {s.hermeticPotential}</span>
              </div>
              <div className="mt-2 text-xs text-ink-500"><b>Equipment:</b> {s.equipmentRequirement}</div>
            </div>
          ))}
        </div>
      )}

      {(tab === 'secondary' || tab === 'tertiary') && (
        <div className="grid md:grid-cols-2 gap-4">
          {(tab === 'secondary' ? db.secondary : db.tertiary).map((s) => (
            <div key={s.id} className="card card-pad">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink-900">{s.name}</h3>
                <span className="badge badge-amber text-[10px]">{s.dataType.toUpperCase()}</span>
              </div>
              <div className="text-xs text-ink-400 mt-0.5">{s.material}</div>
              <p className="text-sm text-ink-600 mt-1">{s.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {'protection' in s && s.protection && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PILL[s.protection]}`}>protection: {s.protection}</span>}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PILL[s.stackability]}`}>stack: {s.stackability}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
