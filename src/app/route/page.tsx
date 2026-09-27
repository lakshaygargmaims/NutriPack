'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { RouteAnalysis, RoutePackagingDelta } from '@/lib/engine/routeRisk';
import type { City } from '@/lib/engine/cities';

const RouteMap = dynamic(() => import('@/components/RouteMap'), {
  ssr: false,
  loading: () => <div className="card card-pad h-[380px] animate-pulse bg-ink-100" />,
});

interface RouteResponse {
  ok: boolean;
  origin: City;
  destination: City;
  metrics: { distanceKm: number | null; durationHours: number | null; geometry: [number, number][]; source: string; note: string };
  analysis: RouteAnalysis;
  deltas: RoutePackagingDelta | null;
  label: string;
  errors?: string[];
}

const LEVEL_STYLE: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
};

export default function RouteIntelPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [origin, setOrigin] = useState('delhi');
  const [destination, setDestination] = useState('mumbai');
  const [mode, setMode] = useState<'road' | 'rail' | 'air' | 'sea'>('road');
  const [tempC, setTempC] = useState(30);
  const [rh, setRh] = useState(65);
  const [handling, setHandling] = useState(2);
  const [coldChain, setColdChain] = useState(false);
  const [data, setData] = useState<RouteResponse | null>(null);
  const [compare, setCompare] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/route-intel')
      .then((r) => r.json())
      .then((d) => d.ok && setCities(d.cities))
      .catch(() => {});
  }, []);

  const run = useCallback(
    async (dest = destination) => {
      setLoading(true);
      try {
        const res = await fetch('/api/route-intel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, destination: dest, mode, assumedTempC: tempC, assumedRhPct: rh, handlingPoints: handling, coldChain }),
        });
        const json: RouteResponse = await res.json();
        if (dest === destination) setData(json.ok ? json : null);
        else setCompare(json.ok ? json : null);
      } finally {
        setLoading(false);
      }
    },
    [origin, destination, mode, tempC, rh, handling, coldChain],
  );

  useEffect(() => {
    if (cities.length) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities.length]);

  const risk = data?.analysis.overallRisk ?? 'medium';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Route Intelligence</h1>
        <p className="text-sm text-ink-500">
          Where the food travels changes what packaging it needs. Map data © OpenStreetMap contributors, road routing by OSRM.
          In-transit temperature/humidity are <strong>demo assumptions</strong> — no live weather data.
        </p>
      </div>

      <div className="card card-pad space-y-4">
        <div className="grid md:grid-cols-4 gap-3">
          <label className="block">
            <span className="label">ORIGIN</span>
            <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="input">
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">DESTINATION</span>
            <select value={destination} onChange={(e) => setDestination(e.target.value)} className="input">
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">TRANSPORT MODE</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="input">
              <option value="road">Truck (road)</option>
              <option value="rail">Rail</option>
              <option value="air">Air</option>
              <option value="sea">Sea</option>
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={coldChain} onChange={(e) => setColdChain(e.target.checked)} className="h-4 w-4" />
            <span className="text-sm font-medium text-ink-700">Cold chain (refrigerated)</span>
          </label>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <label className="block">
            <span className="label">ASSUMED IN-TRANSIT TEMP: {tempC}°C</span>
            <input type="range" min={0} max={50} value={tempC} onChange={(e) => setTempC(+e.target.value)} className="w-full" />
          </label>
          <label className="block">
            <span className="label">ASSUMED IN-TRANSIT RH: {rh}%</span>
            <input type="range" min={20} max={100} value={rh} onChange={(e) => setRh(+e.target.value)} className="w-full" />
          </label>
          <label className="block">
            <span className="label">HANDLING POINTS: {handling}</span>
            <input type="range" min={0} max={6} value={handling} onChange={(e) => setHandling(+e.target.value)} className="w-full" />
          </label>
        </div>
      </div>

      {loading && !data ? (
        <div className="card card-pad h-[380px] animate-pulse bg-ink-100" />
      ) : data ? (
        <>
          <div className="card overflow-hidden">
            <RouteMap origin={data.origin} destination={data.destination} geometry={data.metrics.geometry} />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="card card-pad">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Distance</div>
              <div className="mt-1 text-2xl font-bold text-ink-900">{data.analysis.distanceKm} km</div>
              <div className="text-xs text-ink-400 mt-1">{data.metrics.source === 'osrm' ? 'OSRM road route' : data.metrics.note.slice(0, 80)}</div>
            </div>
            <div className="card card-pad">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Est. duration</div>
              <div className="mt-1 text-2xl font-bold text-ink-900">{Math.round(data.analysis.durationHours)} h</div>
              <div className="text-xs text-ink-400 mt-1">{data.metrics.source === 'osrm' ? 'router estimate' : 'speed assumption'}</div>
            </div>
            <div className="card card-pad">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Overall transport risk</div>
              <div className={`mt-1 inline-block rounded-full px-3 py-1 text-lg font-bold ${LEVEL_STYLE[risk]}`}>{risk.toUpperCase()}</div>
              <div className="text-xs text-ink-400 mt-1">model score {data.analysis.riskScore}/100</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card card-pad">
              <div className="section-title">Exposure breakdown</div>
              <div className="space-y-2 mt-2">
                {[
                  ['Temperature exposure', data.analysis.tempExposure],
                  ['Humidity exposure', data.analysis.humidityExposure],
                  ['Handling risk', data.analysis.handlingRisk],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex items-center justify-between">
                    <span className="text-sm text-ink-700">{k}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_STYLE[v as string]}`}>{String(v).toUpperCase()}</span>
                  </div>
                ))}
                {data.analysis.coldChainRequired && (
                  <div className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                    ⛄ Cold-chain recommended for this leg — packaging alone cannot hold quality.
                  </div>
                )}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-ink-700">How this was calculated</summary>
                <ul className="mt-2 space-y-1 text-xs text-ink-500 list-disc pl-4">
                  {data.analysis.explanations.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            </div>

            <div className="card card-pad">
              <div className="section-title">How the route changes packaging needs</div>
              {data.deltas ? (
                <ul className="mt-2 space-y-2 text-sm text-ink-700 list-disc pl-4">
                  {data.deltas.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                  {data.deltas.insulationMatters && <li>Insulated liners / temperature-tolerant structures become relevant.</li>}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-400">Select a commodity in the Food Analyzer to link route risk into packaging scoring.</p>
              )}
              <p className="mt-3 text-xs text-ink-400">{data.label}</p>
            </div>
          </div>

          <div className="card card-pad">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="section-title mb-0">What if the destination changes?</div>
              <button className="btn-secondary" onClick={() => run(destination === 'jaipur' ? 'mumbai' : 'jaipur')} disabled={loading}>
                {loading ? 'Recalculating…' : `Compare with Delhi → ${destination === 'jaipur' ? 'Mumbai' : 'Jaipur'}`}
              </button>
            </div>
            {compare && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-ink-400 border-b">
                      <th className="py-2">Metric</th>
                      <th className="py-2">{data.origin.name} → {data.destination.name}</th>
                      <th className="py-2">{data.origin.name} → {compare.destination.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Distance', `${data.analysis.distanceKm} km`, `${compare.analysis.distanceKm} km`],
                      ['Duration', `${Math.round(data.analysis.durationHours)} h`, `${Math.round(compare.analysis.durationHours)} h`],
                      ['Transport risk', `${data.analysis.overallRisk.toUpperCase()} (${data.analysis.riskScore})`, `${compare.analysis.overallRisk.toUpperCase()} (${compare.analysis.riskScore})`],
                      ['Cold chain advised', data.analysis.coldChainRequired ? 'Yes' : 'No', compare.analysis.coldChainRequired ? 'Yes' : 'No'],
                    ].map(([k, a, b]) => (
                      <tr key={k as string} className="border-b last:border-0">
                        <td className="py-2 text-ink-700">{k}</td>
                        <td className="py-2 font-medium">{a}</td>
                        <td className="py-2 font-medium">{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-ink-400">
                  Longer transport duration increases exposure to environmental and mechanical conditions — the system increases the importance of protective packaging accordingly.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card card-pad text-sm text-ink-500">Pick a route and run the analysis.</div>
      )}
    </div>
  );
}
