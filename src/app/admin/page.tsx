'use client';

import { useEffect, useState } from 'react';
import type { FoodCommodity, PackagingMaterial, ReferenceSource } from '@/lib/domain/types';

interface AdminData {
  ok: boolean;
  materials?: PackagingMaterial[];
  commodities?: FoodCommodity[];
  sources?: ReferenceSource[];
  auditLog?: { at: string; actor: string; action: string; detail?: string }[];
  counts?: { users: number; projects: number; experiments: number };
  errors?: string[];
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [msg, setMsg] = useState('');

  function load() {
    const token = localStorage.getItem('nutripack.token');
    fetch('/api/admin', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.json())
      .then(setData);
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function action(body: object) {
    const token = localStorage.getItem('nutripack.token');
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setMsg(d.ok ? 'Saved.' : d.errors?.[0] ?? 'Failed');
    load();
  }

  if (!data) return <div className="card card-pad">Loading admin…</div>;

  if (!data.ok) {
    return (
      <div className="card card-pad max-w-lg mx-auto mt-10 text-center">
        <h1 className="text-xl font-bold text-ink-900">Admin access required</h1>
        <p className="text-sm text-ink-500 mt-2">
          Sign in with the admin demo account (<code>admin@nutripack.demo</code> / <code>demo123</code>) to manage the food
          database, materials, sources and scoring weights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Admin / Data Management</h1>
        <p className="text-sm text-ink-500">
          {data.counts?.users} users · {data.counts?.projects} projects · {data.counts?.experiments} validation experiments
        </p>
        {msg && <p className="text-sm text-brand-700 mt-1">{msg}</p>}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card card-pad">
          <div className="section-title">Packaging materials ({data.materials?.length})</div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Status</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.materials?.map((m) => (
                  <tr key={m.id}>
                    <td className="td">{m.name}</td>
                    <td className="td"><span className={m.dataStatus === 'verified' ? 'badge-green' : 'badge-slate'}>{m.dataStatus}</span></td>
                    <td className="td space-x-2">
                      <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => action({ action: 'material.verify', id: m.id })}>Verify</button>
                      <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => action({ action: 'material.disable', id: m.id })}>Disable</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-title">Food commodities ({data.commodities?.length})</div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Category</th>
                  <th className="th">Respiration</th>
                </tr>
              </thead>
              <tbody>
                {data.commodities?.map((c) => (
                  <tr key={c.id}>
                    <td className="td">{c.name}</td>
                    <td className="td">{c.category}</td>
                    <td className="td">{c.properties.respirationRateMgCo2KgH ?? 0} mg/kg·h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-title">Reference sources ({data.sources?.length})</div>
          <ul className="space-y-2 text-sm">
            {data.sources?.map((s) => (
              <li key={s.id} className="rounded-lg border border-ink-200 p-2">
                <div className="font-medium text-ink-800">{s.title}</div>
                <div className="text-xs text-ink-500">{s.publisher} {s.year ? `· ${s.year}` : ''}</div>
                {s.notes && <div className="text-xs text-ink-400 mt-0.5">{s.notes}</div>}
              </li>
            ))}
          </ul>
        </div>

        <div className="card card-pad">
          <div className="section-title">Audit log (recent)</div>
          <div className="max-h-72 overflow-y-auto text-xs space-y-1">
            {data.auditLog?.map((a, i) => (
              <div key={i} className="flex justify-between gap-2 border-b border-ink-100 pb-1">
                <span className="text-ink-500">{new Date(a.at).toLocaleString()}</span>
                <span className="font-medium text-ink-700">{a.action}</span>
                <span className="text-ink-400">{a.actor}{a.detail ? ` · ${a.detail}` : ''}</span>
              </div>
            ))}
            {!data.auditLog?.length && <p className="text-ink-400">No activity yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
