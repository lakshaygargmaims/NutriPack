'use client';

import { useState } from 'react';

interface FarmerResponse {
  ok: boolean;
  simple?: {
    pack: string;
    packShort: string;
    cost: string;
    transportRisk: string;
    keep: string;
    why: string[];
  };
  route?: { from: string; to: string; distanceKm: number; days: number; overallRisk: string };
  estimatedShelfLifeDays?: { daysLow: number; daysHigh: number; confidence: string };
  errors?: string[];
}

const CROPS = ['tomato', 'potato', 'onion', 'banana', 'mango', 'rice', 'wheat', 'pulses', 'spices'];

export default function FarmerModePage() {
  const [commodityId, setCommodity] = useState('tomato');
  const [quantityKg, setQuantity] = useState(500);
  const [origin, setOrigin] = useState('Nashik');
  const [destination, setDestination] = useState('Delhi');
  const [days, setDays] = useState(2);
  const [res, setRes] = useState<FarmerResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch('/api/farmer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commodityId, quantityKg, origin, destination, days }),
      });
      setRes(await r.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Farmer Mode</h1>
        <p className="text-sm text-ink-500">Answer 4 simple questions. No technical words needed.</p>
      </div>

      <form onSubmit={submit} className="card card-pad space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">CROP</span>
            <select value={commodityId} onChange={(e) => setCommodity(e.target.value)} className="input">
              {CROPS.map((c) => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">QUANTITY (KG)</span>
            <input type="number" min={1} max={100000} value={quantityKg} onChange={(e) => setQuantity(+e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="label">FROM (CITY)</span>
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} className="input" placeholder="Village / city" />
          </label>
          <label className="block">
            <span className="label">GOING TO (CITY)</span>
            <input value={destination} onChange={(e) => setDestination(e.target.value)} className="input" placeholder="Market city" />
          </label>
        </div>
        <label className="block">
          <span className="label">TRAVEL TIME: {days} DAY(S)</span>
          <input type="range" min={1} max={7} value={days} onChange={(e) => setDays(+e.target.value)} className="w-full" />
        </label>
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Thinking…' : 'What packaging should I use?'}
        </button>
      </form>

      {res && !res.ok && <div className="card card-pad text-sm text-red-700">{res.errors?.[0]}</div>}

      {res?.ok && res.simple && (
        <div className="card card-pad space-y-4 border-2 border-green-600">
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Use this packaging</div>
            <div className="mt-1 text-2xl font-bold text-green-700">{res.simple.packShort}</div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-ink-50 p-3">
              <div className="text-xs text-ink-500">Cost</div>
              <div className="text-sm font-bold text-ink-900">{res.simple.cost}</div>
            </div>
            <div className="rounded-lg bg-ink-50 p-3">
              <div className="text-xs text-ink-500">Road risk</div>
              <div className="text-sm font-bold text-ink-900">{res.simple.transportRisk}</div>
            </div>
            {res.estimatedShelfLifeDays && (
              <div className="rounded-lg bg-ink-50 p-3">
                <div className="text-xs text-ink-500">Keeps fresh (est.)</div>
                <div className="text-sm font-bold text-ink-900">
                  {res.estimatedShelfLifeDays.daysLow}–{res.estimatedShelfLifeDays.daysHigh} d
                </div>
              </div>
            )}
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">💡 {res.simple.keep}</div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Why this pack</div>
            <ul className="mt-1 space-y-1 text-sm text-ink-700 list-disc pl-4">
              {res.simple.why.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-ink-400">
            {res.route?.from} → {res.route?.to} ≈ {res.route?.distanceKm} km, {res.route?.days} day(s) · Model estimate — try one sample pack before big orders.
          </p>
        </div>
      )}
    </div>
  );
}
