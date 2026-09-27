'use client';

import { useRef, useState } from 'react';

interface Detection {
  commodityId: string;
  name: string;
  confidencePct: number;
  provenance: string;
  disclaimer: string;
}

export function FoodImage({ onConfirm }: { onConfirm: (commodityId: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [detection, setDetection] = useState<Detection | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setDetection(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await fetch('/api/image-identify', { method: 'POST', body: form });
      const data = await res.json();
      if (data.ok) setDetection(data.detection);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 p-4">
      <div className="text-sm font-semibold text-ink-700">Optional: identify commodity from photo</div>
      <p className="text-xs text-ink-500 mt-1">
        Image recognition identifies the commodity only. It cannot determine pH, moisture, respiration or microbial load —
        enter measured values below for credible estimates.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <button type="button" className="btn-ghost text-xs" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Analyzing…' : '📷 Upload / take photo'}
        </button>
        {detection && (
          <span className="text-xs text-ink-600">
            Detected: <b>{detection.name}</b> ({detection.confidencePct}% · {detection.provenance})
          </span>
        )}
      </div>
      {detection && (
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="btn-primary text-xs" onClick={() => onConfirm(detection.commodityId)}>
            Use {detection.name}
          </button>
          <span className="text-xs text-ink-400">Not right? Pick the commodity manually below.</span>
        </div>
      )}
    </div>
  );
}
