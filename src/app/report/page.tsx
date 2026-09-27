'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { jsPDF } from 'jspdf';
import type { AnalysisResult } from '@/lib/domain/types';

function ReportInner() {
  const params = useSearchParams();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [source, setSource] = useState<string>('');

  useEffect(() => {
    (async () => {
      // Prefer an explicit saved result passed via sessionStorage (from ResultView flow),
      // else use demo scenario, else latest project version.
      const cached = sessionStorage.getItem('nutripack.lastResult');
      if (cached) {
        setResult(JSON.parse(cached));
        setSource('Current session analysis');
        return;
      }
      const p = params.get('p');
      if (p) {
        const proj = await (await fetch(`/api/analysis/${p}`)).json();
        if (proj.ok) {
          setResult(proj.project.versions.at(-1).result);
          setSource(`Project: ${proj.project.name}`);
          return;
        }
      }
      const demo = await (await fetch('/api/demo')).json();
      const s = demo.scenarios?.[0];
      if (s) {
        setResult(s.result);
        setSource(`Demo scenario: ${s.title}`);
      }
    })();
  }, [params]);

  if (!result) return <div className="card card-pad">Loading report data…</div>;

  const r = result;

  function exportPdf() {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let y = 40;
    const line = (text: string, opts: { bold?: boolean; size?: number; gap?: number } = {}) => {
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.setFontSize(opts.size ?? 10);
      const lines = doc.splitTextToSize(text, 515) as string[];
      for (const l of lines) {
        if (y > 780) {
          doc.addPage();
          y = 40;
        }
        doc.text(l, 40, y);
        y += opts.gap ?? 14;
      }
      y += (opts.gap ?? 14) - 14 + 2;
    };

    doc.setFontSize(16);
    doc.text('NutriPack — Packaging Analysis Report', 40, y);
    y += 20;
    line(`Generated: ${new Date().toLocaleString()}   ·   ${source}`, { size: 9 });
    y += 4;

    line('1. FOOD DETAILS', { bold: true, size: 12 });
    line(`Commodity: ${r.commodity.name} (${r.commodity.category}, ${r.commodity.form})`);
    line(`Properties: moisture ${r.input.resolvedProperties.moistureContentPct ?? '—'}%, pH ${r.input.resolvedProperties.ph ?? '—'}, aw ${r.input.resolvedProperties.waterActivity ?? '—'}, respiration ${r.input.resolvedProperties.respirationRateMgCo2KgH ?? 0} mg CO2/kg·h`);
    line(`Sensitivities (0-5): O2 ${r.input.resolvedProperties.oxygenSensitivity}, moisture ${r.input.resolvedProperties.moistureSensitivity}, light ${r.input.resolvedProperties.lightSensitivity}, temperature ${r.input.resolvedProperties.temperatureSensitivity}`);

    line('2. ENVIRONMENTAL CONDITIONS', { bold: true, size: 12 });
    line(`Storage: ${r.input.storage.temperatureC}°C, ${r.input.storage.rhPct}% RH, target ${r.input.storage.targetShelfLifeDays} days (${r.input.storage.environment})`);
    line(`Transport: ${r.input.transport?.origin ?? '—'} → ${r.input.transport?.destination ?? '—'}, ${r.input.transport?.distanceKm ?? 0} km, ${r.input.transport?.mode ?? '—'}, ${r.input.transport?.durationDays ?? 0} d, ${r.input.transport?.expectedTempC ?? '—'}°C, cold chain: ${r.input.transport?.coldChain ? 'yes' : 'no'}`);

    line('3. DERIVED PACKAGING REQUIREMENTS', { bold: true, size: 12 });
    line(`OTR window: ${r.requirements.otrMin ?? '≤'} ${r.requirements.otrMax} cm³/m²·day; WVTR ≤ ${r.requirements.wvtrMax} g/m²·day`);
    line(`Barriers: moisture ≥ ${Math.round(r.requirements.moistureBarrierMin * 100)}%, O2 ≥ ${Math.round(r.requirements.oxygenBarrierMin * 100)}%, light ≥ ${Math.round(r.requirements.lightBarrierMin * 100)}%`);
    line(`Thickness: ${r.requirements.thicknessUmMin}–${r.requirements.thicknessUmMax} µm; sealability ${r.requirements.sealabilityRequired ? 'required' : 'optional'}; MAP ${r.requirements.mapSuitability}`);
    r.requirements.derivation.forEach((d) => line(`• ${d}`, { size: 9 }));

    line('4. RECOMMENDED MATERIAL', { bold: true, size: 12 });
    line(`${r.primary.material.name} — score ${r.primary.score.total}/100`);
    line(`OTR ${r.primary.material.otrCm3M2Day.value} cm³/m²·day · WVTR ${r.primary.material.wvtrGm2Day.value} g/m²·day · thickness ${r.primary.material.thicknessUmRange[0]}–${r.primary.material.thicknessUmRange[1]} µm · sealable: ${r.primary.material.sealable ? 'yes' : 'no'} · MAP suitable: ${r.primary.material.mapSuitable ? 'yes' : 'no'}`);
    line(`Estimated cost: ₹${r.primary.score.estimatedCostPerPackageInr.toFixed(2)} per package (model estimate)`);

    line('5. ESTIMATED SHELF LIFE', { bold: true, size: 12 });
    line(`${r.shelfLife.daysLow}–${r.shelfLife.daysHigh} days (risk: ${r.shelfLife.risk}, confidence: ${r.shelfLife.confidence})`);
    line(`Limiting factor: ${r.shelfLife.limitingFactor}`);
    line(`Method: ${r.shelfLife.method}`);

    line('6. SUSTAINABILITY (ESTIMATED)', { bold: true, size: 12 });
    line(`Total ${r.sustainability.total}/100 — material ${r.sustainability.materialImpact}, recyclability ${r.sustainability.recyclability}, recycled/bio ${r.sustainability.recycledContent}, food-waste ${r.sustainability.foodWasteReduction}, transport ${r.sustainability.transportEfficiency}, end-of-life ${r.sustainability.endOfLife}`);

    line('7. WASTE ECONOMICS (ESTIMATED)', { bold: true, size: 12 });
    line(`Loss without optimized packaging ${r.wasteEconomics.lossRateWithoutPct}% → with ${r.wasteEconomics.lossRateWithPct}%`);
    line(`Food value saved ₹${r.wasteEconomics.foodValueSavedInr.toFixed(2)}/pack vs additional packaging cost ₹${r.wasteEconomics.additionalPackagingCostInr.toFixed(2)} → net impact ₹${r.wasteEconomics.netEconomicImpactInr.toFixed(2)}/pack`);

    line('8. TRANSPORT ANALYSIS', { bold: true, size: 12 });
    line(`Suitability: ${r.transport.suitability} (risk ${r.transport.riskScore}/100)`);
    r.transport.explanations.forEach((e) => line(`• ${e}`, { size: 9 }));

    line('9. ALTERNATIVE MATERIALS', { bold: true, size: 12 });
    r.alternativesComparison.slice(0, 5).forEach((alt) =>
      line(`${alt.name}: OTR ${alt.otr}, WVTR ${alt.wvtr}, est. ${alt.estimatedShelfLifeDays[0]}–${alt.estimatedShelfLifeDays[1]} d, ₹${alt.costPerPackageInr.toFixed(2)}, sustainability ${alt.sustainability}, score ${alt.totalScore}`, { size: 9 }),
    );

    line('10. EXPLANATION (WHY THIS PACKAGING)', { bold: true, size: 12 });
    r.primary.reasons.forEach((x) => line(`${x.verdict === 'pro' ? '[+]' : '[!]'} ${x.text}`, { size: 9 }));

    line('11. ASSUMPTIONS & DATA GAPS', { bold: true, size: 12 });
    (r.requirements.dataGaps.length ? r.requirements.dataGaps : ['No explicit data gaps flagged; reference dataset assumed.']).forEach((g) => line(`• ${g}`, { size: 9 }));

    line('12. DATA SOURCES & VALIDATION STATUS', { bold: true, size: 12 });
    line('Reference dataset (demo, non-certified): src-demo, src-postharvest, src-film-data, src-lca. Provenance: reference/estimated. No laboratory validation has been performed on these estimates.');
    line('Validation status: NOT experimentally validated. Use the Validation Lab to record trials and close the loop.');

    line('13. DISCLAIMER', { bold: true, size: 12 });
    line('All quantitative outputs of this report are model-based estimates derived from reference data and simplified food-science heuristics. They are NOT laboratory-certified measurements and MUST be validated experimentally before commercial or regulatory decisions. NutriPack provides decision support, not certification.', { size: 9 });

    doc.save(`nutripack-report-${r.commodity.id}-${Date.now()}.pdf`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Packaging Analysis Report</h1>
          <p className="text-sm text-ink-500">{source}</p>
        </div>
        <button className="btn-primary" onClick={exportPdf}>⬇ Export as PDF</button>
      </div>

      <div className="card card-pad space-y-4 text-sm">
        <section>
          <h2 className="section-title">1–2 · Food & environment</h2>
          <p className="text-ink-700">
            {r.commodity.name} ({r.commodity.category}) at {r.input.storage.temperatureC}°C / {r.input.storage.rhPct}% RH, target {r.input.storage.targetShelfLifeDays} days.
            Transport: {r.input.transport?.origin ?? '—'} → {r.input.transport?.destination ?? '—'} ({r.input.transport?.mode}).
          </p>
        </section>
        <section>
          <h2 className="section-title">3 · Requirements</h2>
          <p className="text-ink-700">
            OTR {r.requirements.otrMin ?? '≤'}{r.requirements.otrMax} · WVTR ≤{r.requirements.wvtrMax} · thickness {r.requirements.thicknessUmMin}–{r.requirements.thicknessUmMax} µm · MAP {r.requirements.mapSuitability}
          </p>
        </section>
        <section>
          <h2 className="section-title">4–5 · Recommendation & shelf life</h2>
          <p className="text-ink-700">
            {r.primary.material.name} — ₹{r.primary.score.estimatedCostPerPackageInr.toFixed(2)}/pack, estimated shelf life {r.shelfLife.daysLow}–{r.shelfLife.daysHigh} days ({r.shelfLife.confidence} confidence).
          </p>
        </section>
        <section>
          <h2 className="section-title">6–8 · Sustainability, economics, transport</h2>
          <p className="text-ink-700">
            Sustainability {r.sustainability.total}/100 (est.) · net economic impact ₹{r.wasteEconomics.netEconomicImpactInr.toFixed(2)}/pack (est.) · transport {r.transport.suitability} ({r.transport.riskScore}/100).
          </p>
        </section>
        <section className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          <b>Disclaimer:</b> all quantitative outputs are model-based estimates from reference data and simplified food-science
          heuristics. Not laboratory-certified. Must be experimentally validated before commercial decisions.
        </section>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="card card-pad">Loading report…</div>}>
      <ReportInner />
    </Suspense>
  );
}
