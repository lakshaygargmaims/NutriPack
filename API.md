# NutriPack — API

Base URL: `http://localhost:3100`. All bodies are JSON. Errors return
`{ "ok": false, "errors": string[] }` with 400/401/403/404/500.

Auth: `Authorization: Bearer <token>` from `POST /api/auth`
(`action: 'login' | 'register'`). Demo: `analyst@nutripack.demo` / `demo123`,
admin: `admin@nutripack.demo` / `demo123`.

## Core decision APIs

### `POST /api/analysis`
Runs the full pipeline and (if authenticated) auto-saves a project version.

```json
{
  "commodityId": "tomato",
  "propertyOverrides": { "waterActivity": 0.97 },
  "storage": { "temperatureC": 8, "rhPct": 85, "targetShelfLifeDays": 12, "environment": "refrigerated" },
  "transport": { "origin": "Delhi", "destination": "Jaipur", "distanceKm": 280, "mode": "road",
                 "durationDays": 1, "expectedTempC": 20, "expectedRhPct": 60, "coldChain": false },
  "business": { "budgetPerPackageInr": 2, "packageSizeGrams": 1000, "productionVolumePerMonth": 10000 },
  "priority": "balanced"
}
```
Response: `{ ok, projectId, result }` where `result` = full `AnalysisResult`
(commodity, requirements + derivation log, recommendations keyed by the 5 profiles,
primary recommendation with reasons/structure/mapAdvice, shelfLife range,
sustainability, wasteEconomics, transport, twin state, judge explanation,
alternativesComparison). Missing `storage`/`transport`/`business` sections fall
back to commodity-typical defaults and are flagged as warnings — never invented
silently.

### `GET /api/analysis` — list saved projects (id, name, version summaries)
### `GET /api/analysis/:id` — full project with all versions
### `DELETE /api/analysis/:id` — delete (auth required)

### `POST /api/recommendation`
Recommendation-only, no persistence. Returns `{ primary, requirements, shelfLife, alternatives }`.

### `POST /api/optimize`
Multi-objective side-by-side:
`{ objectives: [{ profile, label, materialName, costPerPackageInr, shelfLifeDays, sustainabilityScore, totalScore }] }`
for `cost | shelf | sustainability | transport | balanced`.

### `POST /api/simulate`
Digital-twin what-if: `{ input: AnalysisInput, changes: { temperatureC?, rhPct?, targetShelfLifeDays?, thicknessUm?, storageDays?, materialId? } }`.
`changes.materialId` forces a material (Failure Lab). Returns the recomputed
`twin` state (shelf life, oxygen/moisture/spoilage/transport risks, cost,
sustainability, MAP series) plus `failureModes`, `riskTimeline`,
`forcedMaterialId` and `forcedMaterialName` for the forced-material view.

### `POST /api/shelf-life`
Standalone estimator. `{ shelfLife: { daysLow, daysHigh, risk, confidence, limitingFactor, method, disclaimer }, risks }`.

### `POST /api/map`
MAP simulation with explicit parameters:
`{ commodityId, materialId, temperatureC, rhPct, areaM2?, headspaceMl?, thicknessUm?, initialO2Pct?, initialCo2Pct?, days?, perforations?: { count, diameterUm } | null }`
→ `{ series: [{ day, o2Pct, co2Pct, withinTarget }], suitable, notes, targetO2, targetCo2, effective: { filmOtr, perfOtr, totalOtr }, perforations }`.
Micro-perforations add orifice conductance (Yam model) independent of the film
barrier; `effective` breaks down film vs perforation vs total exchange.

### `POST /api/compare`
Balanced-profile comparison rows for the table/Pareto UI:
`{ rows: [{ materialId, name, otr, wvtr, thicknessUm, estimatedShelfLifeDays, costPerPackageInr, sustainability, recyclability, transportSuitability, mapSuitability, totalScore }] }`.

### `POST /api/transport`
Standalone transport assessment (commodity + transport leg) → `{ assessment }`.

### `POST /api/sustainability`
Sustainability breakdown + waste economics for an input → `{ sustainability, wasteEconomics }`.

## Complete Packaging Solution

### `GET /api/complete-solution`
Returns the component databases: `formats` (16), `closures` (10), `sealingMethods` (8),
`secondary` (10), `tertiary` (10), `innerComponents` — each entry provenance-tagged
(`dataType: 'demo'|'reference'`).

### `POST /api/complete-solution`
`{ input: AnalysisInput, quantityKg, route?: { origin, destination, mode, distanceKm,
durationDays, coldChain, handlingPoints, source: 'router'|'assumption' } }` →
`{ solutions: CompletePackagingSolution[3] (balanced / low_cost / sustainability), shelfLife }`.
Each solution: `primaryPackaging` (format), `materialStructure` (material + layer
breakdown), `thickness`, `closure`, `sealingMethod`, `innerLiners`,
`secondaryPackaging`, `tertiaryPackaging`, `transportMode`, storage/temperature/
humidity conditions, `estimatedCostCategory`, `sustainabilityIndicator`,
`transportRisk`, `failureRisks[]` (risk/level/cause/impact/mitigation),
`recommendationReasons`, `tradeoffs`, `rejectedCandidates[]` (with reasons),
`confidence`, `dataProvenance`, clickable `hierarchy[]` (product→primary→…→transport).
Hard constraints are filters: incompatible combos are returned in
`rejectedCandidates` with the violating rule, never recommended.

## Route Intelligence, structures, auto-fix, farmer mode

### `GET /api/route-intel` — city gazetteer (20 Indian cities, OSM-derived coordinates)
### `POST /api/route-intel`
`{ origin, destination, mode: road|rail|air|sea, assumedTempC?, assumedRhPct?, handlingPoints?, coldChain?, commodityId? }`
→ `{ origin, destination, metrics: { distanceKm, durationHours, geometry (Leaflet polyline), source: 'osrm'|'fallback', note },
analysis: { tempExposure, humidityExposure, handlingRisk, coldChainRequired, overallRisk, riskScore, explanations },
deltas: { mechanicalBoost, moistureBoost, insulationMatters, notes } | null }`.
Road routing via OSRM (open data © OpenStreetMap contributors); fallback = great-circle × mode factor, always labelled.
In-transit temperature/RH are DEMO ASSUMPTIONS — the response says so.

### `POST /api/structure`
`{ commodityId, materialId?, priority? }` → rule-composed multilayer structure candidates
(`PET/PE`, `PET/AL/PE`, `PET/MetPET/PE`, `PET/EVOH/PE`, `Paper/PE`, micro-perforated) with per-layer
purpose/barrier/mechanical/seal roles, trade-offs and hard-coded `candidateStatus: 'requires validation'`.

### `POST /api/auto-fix`
`{ input: AnalysisInput }` → failure→correction loop: `{ steps: [{ problem, cause, change, field, value }],
comparison: [{ metric, before, after, better }], beforeAfter, label: 'prototype simulation — not physical validation' }`.

### `POST /api/farmer`
`{ commodityId, quantityKg, origin, destination, days }` → plain-language advice:
`{ simple: { pack, packShort, cost, transportRisk (LOW/MEDIUM/HIGH), keep, why: string[] }, route, estimatedShelfLifeDays }`.

## Failure Lab & supply-chain twin

### `POST /api/monte-carlo`
Uncertainty analysis over the deterministic result: `{ input: AnalysisInput,
materialId?, draws? (200–20000, default 4000) }`. Perturbs temperature
(σ=1.5 °C), respiration (lognormal σ=0.35) and film OTR (lognormal σ=0.47)
with a seeded LCG → fully deterministic distribution:
`{ monteCarlo: { p5, p25, p50, p75, p95, mean, stdDev, histogram (18 bins),
probTargetMet, probAnaerobic, n }, material, deterministic: { daysLow, daysHigh,
confidence } }`. `probAnaerobic` = P(modelled shelf life ≤ 2.5 d).

### `POST /api/supply-chain`
Multi-leg Time–Temperature–Tolerance (TTT) simulation:
`{ input: AnalysisInput, legs?: [{ name, mode: road|rail|air|sea|none,
durationDays, tempC, rhPct, coldChain }], materialId? }` — legs default to the
built-in 4-leg Indian chain (Farm → Packhouse → Mandi → Retail). Each leg
consumes shelf life at a Q10-weighted rate (`consumed = duration ×
clamp(Q10-rate, 0.2, 6)`); per-leg leg accounting sums exactly to the total.
Response: `{ supplyChain: { legs: [{ name, riskScore, suitability, tempC,
durationDays, shelfLifeUsedDays, explanations }], totalDurationDays,
shelfLifeUsedDays, remainingShelfLifeDays: [low, high] (±18%), cumulativeRisk,
verdict: VIABLE|MARGINAL|FAILURE… }, shelfLifeBudgetDays }`.

## Knowledge-base APIs

- `GET /api/foods` — commodities with properties, ranges, provenance.
- `GET /api/materials?q=&category=` — searchable materials database.
- `GET /api/sources` — reference-source registry (provenance backing).
- `GET /api/demo` — four precomputed SIH demo scenarios with full results.

## Validation Lab

- `GET /api/validation[?experimentId=]` — experiments with observations.
- `POST /api/validation` with `{ kind: 'experiment', title, commodityId, materialId, predictedLow, predictedHigh }`.
- `POST /api/validation` with `{ experimentId, day, weightLossPct?, ph?, moisturePct?, spoilageScore?, ... }`.
  When `spoilageScore ≥ 4` the trial closes and returns
  `{ comparison: { actualShelfLifeDays, predictedShelfLifeDays, predictionErrorPct } }` —
  the closed loop feeding model improvement.

## Platform

- `POST /api/auth` — login/register → `{ token, user }`. `GET /api/auth` — session check.
- `POST /api/reports` — registers a report generation (audit + section list); PDF is
  rendered client-side by jsPDF from the structured result.
- `POST /api/image-identify` — multipart `image` field or JSON `{ hint }` →
  `{ detection: { commodityId, name, confidencePct, provenance, disclaimer } }`.
  Demo reference classifier; never claims chemical measurement from photos.
- `GET /api/health` — liveness + dataset counts.
- `GET/POST /api/admin` — **admin role required** (403 otherwise). Actions:
  `material.upsert | material.verify | material.disable | food.upsert | source.add | weights.set`.
  GET returns materials, commodities, sources, audit log, counts.

## Validation & error semantics

- All POST bodies are zod-validated; range violations return structured 400s.
- Unknown commodity → 400 with guidance ("Pick one from /api/foods") — never a guess.
- Missing optional sections → defaults + warnings in the derivation log/data gaps.
- Engine-level impossibility (e.g. no material can meet constraints) is expressed as
  infeasibility reasons on candidates, not a fake success.
