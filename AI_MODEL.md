# NutriPack — AI & Model Documentation

The "AI" in NutriPack is a **transparent hybrid pipeline**. No black boxes, no LLM in
the science path. Every formula below is implemented in `src/lib/engine/` and unit-tested.

```
INPUT → validate → property analysis → REQUIREMENT GENERATION (rules)
      → CANDIDATE FILTERING (hard constraints) → WEIGHTED SCORING
      → MULTI-OBJECTIVE OPTIMIZATION (profile re-weighting)
      → SHELF-LIFE / COST / SUSTAINABILITY / TRANSPORT MODELS
      → EXPLANATION (deterministic, from the scoring trace)
```

---

## 1. Requirement generation (`requirements.ts`)

### 1.1 Moisture (WVTR requirement)
Water activity `aw` drives the direction of risk:
- **Dry product** (`aw < 0.65`): moisture **gain** is the risk.
  `WVTR_max = 3 / max(envVPD, 0.05)` where `envVPD = (100 − RH)/100` (simplified
  vapour-pressure proxy). Rule label: dry-food moisture barrier.
- **High-aw fresh** (`aw > 0.95`): moisture **loss** risk; antifog/high-RH strategy,
  `WVTR_max = 6 + 0.4 × T`.
- **Intermediate**: `WVTR_max = 10 / envVPD / 10`.

Minimum moisture-barrier score: rises with `moistureSensitivity` (0–5), 0.30 for
high-aw produce (which needs exchange, not sealing).

### 1.2 Oxygen (OTR window)
Non-respiring: ceiling from `oxygenSensitivity` — ≥4 → OTR ≤ 8 (oxidation control);
2–3 → ≤ 120; 0–1 → ≤ 8000.

Respiring produce — O₂ balance for MAP:
```
rate(T)      = respirationRate(10°C) × 2.2^((T − 10)/10)        [mg CO₂/kg·h]
O₂ demand    = rate(T) / massAreaRatio × 24 h × 0.56 ml/mg      [cm³/m²·day]
OTR window   = [0.5 × demand, 3 × demand]                        (RQ ≈ 1)
```
`massAreaRatio` = kg of product per m² of film (default pack geometry: 1 kg per
0.06 m² → 16.7 kg/m²; scaled by package size in the pipeline). The window is the
physically meaningful region: **below it the pack suffocates (anaerobic), far above
it MAP never engages**. CO₂ venting requirement: `CO₂TR_min = 1.6 × OTR_max`.

### 1.3 Light, thickness, sealability, MAP
- Light barrier minimum: 0.8 (sensitivity ≥4), 0.4 (≥2), 0.05.
- Thickness: produce 20–40 µm (exchange), dry foods 40–120 µm (barrier).
- Sealability required when moisture/oxidation control or MAP needs a hermetic seal.
- MAP suitability: **required** for respiring + O₂-sensitive produce; **recommended**
  for respiring-only or sensitivity ≥3.

Every rule appends a human-readable line to `requirements.derivation` — shown in the
UI and exported to the report.

---

## 2. Material scoring (`scoring.ts`)

### 2.1 Hard filters (infeasibility, not scores)
- not food-contact safe
- storage temperature outside material service range
- not sealable when hermetic seal required
- **anaerobic veto**: respiring produce and `OTR_material < OTR_min / 2` → infeasible
  ("far below modelled respiration demand")
- insufficient light protection for sensitivity ≥ 4

Infeasible materials are demoted below all feasible ones, and the reason string is
surfaced in "Why not the alternatives?".

### 2.2 Ten weighted sub-scores (0–1)
| Criterion | Model |
|---|---|
| foodCompatibility | barrier-vs-sensitivity match heuristic |
| otrSuitability | respiring: window score (inside=1, below=0.05–0.35 asymmetric, above=0.2–0.95 asymptotic); barrier: `lowerIsBetterScore` log decay |
| wvtrSuitability | `lowerIsBetterScore(WVTR, WVTR_max, 6 decades)` |
| thicknessSuitability | 1 − normalized distance of material range midpoint from requirement midpoint |
| sealability | 1 if sealable & required; 0 if not sealable & required; 0.7 if optional |
| temperatureCompatibility | material range covers storage temperature |
| shelfLifeCapability | 0.35·OTR + 0.35·WVTR + 0.2·temp + 0.1·MAP |
| costScore | log decay anchored at ₹3.5/m², 8-decade span |
| sustainabilityScore | 0.35·recyclability + 0.2·recycled/bio + 0.25·carbon log decay + 0.2·category prior |
| transportScore | 0.4·tensile + 0.3·seal + 0.3·thickness, penalized by distance/mode stress |

### 2.3 Multi-objective optimization (profile re-weighting)
Each objective re-weights the criteria, then renormalizes to sum 1:
- **cost**: costScore→0.38, shelf→0.05, sustainability→0.05
- **shelf**: shelfLife→0.35, OTR/WVTR ≥0.18 each, cost→0.03
- **sustainability**: sustainability→0.4, cost→0.04
- **transport**: transport→0.35, sealability ≥0.12
- **balanced**: the base weights (food 0.20, OTR 0.15, WVTR 0.15, thickness 0.05,
  seal 0.05, temp 0.10, shelf 0.10, cost 0.08, sust 0.07, transport 0.05)

Weights are data (`DEFAULT_WEIGHTS`); the admin weights API stores deployment-level
overrides. This is deliberate multi-criteria decision analysis, not a black-box
optimizer — every ranking is reproducible and auditable.

---

## 3. Shelf-life estimation (`shelfLife.ts`)

```
perishable     = fresh form OR aw > 0.92
Q10            = 2.2 (perishable) | 1.4 (low-moisture)
tempFactor     = 1 / Q10^((T − T_ref)/10)      ← shelf life ∝ 1/reaction-rate
T_ref          = midpoint of commodity storage range
barrierFactor  = 0.55 + 0.7 × (0.6·O₂fit + 0.4·moistureFit)
MAP bonus      = ×1.15 for respiring produce in MAP-capable film
mid            = baseline × tempFactor × barrierFactor × mapBonus
range          = mid × (1 ∓ uncertainty)        uncertainty 0.18 | 0.12
```
- Limiting factor: argmax penalty among temperature abuse, O₂ fit, moisture fit.
- Risk: high if Q10 factor is abusive or storage is outside the commodity envelope;
  medium if either barrier fit < 0.5; else low.
- Confidence: **low** if aw or respiration data was missing, or under abusive
  temperatures; otherwise medium. (The system never reports high confidence —
  that requires experimental validation.)

**Worked example (tomato demo):** baseline 10 d, T_ref 9.5°C, storage 8°C →
tempFactor ≈ 1.09; multi-layer laminate fits well (barrierFactor ≈ 1.17); MAP bonus
1.15 → mid ≈ 14.9 → reported **12.9–18.6 days, medium confidence**. At 25°C,
tempFactor ≈ 0.31 → the twin shows the drop immediately.

## 4. MAP simulation (`map.ts`)
One-compartment daily balance for respiring produce:
```
O₂(t+1) = O₂(t) − resp(T)·24·kg·0.56/V·100 + OTR·A·0.16/V·100
CO₂(t+1) = CO₂(t) + resp(T)·24·kg·0.56/V·100 − CO₂TR·A·0.06/V·100
```
with headspace V (ml), film area A (m²), thickness-scaled permeance, clamped to
physical bounds. Target window O₂ 2–8%, CO₂ 3–10% (generic produce MAP guidance).
`withinTarget` fraction ≥ 50% → "suitable (model)". Explicitly labelled a
simulation; pack trials still required.

### 4a. Micro-perforation physics (`effectiveOtr`)
Optional perforations add orifice conductance independent of the film barrier
(Yam et al. model):
```
G_per_hole = (D · A_hole) / L,   D = 0.2 cm²/s (O₂ in air),
A_hole = π·r²,   L = t + 2r (end-effect correction),
perfOtr = count · G · 86400 (cm³/day, RAW full-atmosphere Δ)
```
`effectiveOtr()` returns RAW cm³/day; `simulateMap` applies the driving-force
fractions (O₂ entry ×0.16, CO₂ exit ×0.06·CO₂TR/OTR). The end-effect correction
means conductance scales sub-quadratically with hole diameter for micro-holes —
physically correct, and covered by an explicit unit test.

## 5. Transport model (`transport.ts`)
Additive risk (0–100): thermal excursion beyond commodity envelope (+35 max),
humidity deviation >15 points (+12), duration stress (+20 max), missing cold chain
on fresh warm transport (+20), mode factor (sea 12, road 5, rail 6, air 2), minus
packaging mitigation (up to ~50% by tensile strength + sealability). Suitability:
<30 high, <55 medium, else low. Every contributing rule is returned as an
explanation line.

## 6. Sustainability (`sustainability.ts`)
`total = 100 × (0.25·material + 0.2·recyclability + 0.1·recycled/bio + 0.25·foodWaste
+ 0.1·transportEfficiency + 0.1·endOfLife)` where material impact is a log decay of
cradle-to-gate CO₂e per pack (simplified factors, **comparative only** — not an ISO
14040 LCA) and foodWaste reflects modelled shelf-life extension vs baseline.
Waste economics: baseline loss 18% → reduced up to 70% in proportion to shelf-life
extension; net impact = food value saved − additional packaging cost. Both are
labelled `estimated` end-to-end.

## 7. Failure-mode classification (`failureModes.ts`)
Rule-based, mechanism-driven detection of how a chosen food+material+environment
combination breaks. Each mode carries `probabilityPct`, modelled `onsetDays`,
the physical `mechanism`, and a concrete `mitigation`:

| Mode | Trigger (model) |
|---|---|
| Anaerobic respiration | material OTR < ½ of produce O₂ demand window → O₂ <1–2%, CO₂ spike, ethanol/off-odour |
| Moisture gain | waterActivity < 0.6 and RH high vs WVTR fit → sogginess |
| Oxidation (rancidity) | fat-rich commodity + high OTR fit → peroxide development |
| In-pack condensation | RH ≥ 90% with temperature fluctuation → free water, soft-rot |
| Chilling injury | storage below commodity floor temp → pitting/uneven ripening |
| Thermal abuse | transport temp above envelope → accelerated respiration |
| Physical damage | low tensile strength vs heavy/handled produce → bruising |

`buildRiskTimeline()` converts modes into a per-day 0–100 overall + per-mode risk
series over the modelled shelf life (used for the Failure Lab area chart). All
outputs are labelled model-based probability proxies, not measured rates.

## 8. Monte Carlo uncertainty (`monteCarlo.ts`)
Shelf-life estimates are ranges; Monte Carlo quantifies the distribution behind
them. Over `draws` (default 4000) samples it perturbs the deterministic inputs:
temperature ~ N(T, 1.5 °C), respiration × lognormal(σ=0.35), film OTR ×
lognormal(σ=0.47) — then re-runs the Q10 × barrier-fit shelf-life model per draw.
Randomness comes from a seeded LCG, so identical inputs → identical percentiles
(demonstrable determinism for judges). Outputs: p5/p25/p50/p75/p95, mean, stdDev,
an 18-bin histogram, `probTargetMet` = P(life ≥ target) and `probAnaerobic` =
P(life ≤ 2.5 d) for the anaerobic-collapse zone. Percentiles are estimates from a
propagated-input model — they widen honestly where data is uncertain.

## 9. Supply-chain TTT (`supplyChain.ts`)
Time–Temperature–Tolerance multi-leg simulation. Each leg consumes modelled shelf
life at a Q10-weighted rate:
```
consumed = durationDays × clamp(Q10(refT, legTemp, q), 0.2, 6)
q = 2.2 fresh/high-a_w · 1.4 shelf-stable
```
Leg risk reuses the single-leg transport model; risk accumulates (clamped 2–98).
Remaining life on arrival gets a ±18% uncertainty band. Verdict thresholds:
remaining < 0 → FAILURE; < 25% of budget → MARGINAL; else VIABLE. Per-leg
`shelfLifeUsedDays` values are rounded to 2 dp and accumulated as-rounded, so the
legs sum exactly to the reported total (auditable accounting). Ships with a
default 4-leg Indian chain: Farm collection (30 °C) → Packhouse staging (25 °C)
→ Mandi (28 °C) → Retail distribution (10 °C, cold chain).

## 10. Forced-material pipeline (Failure Lab backend)
`AnalysisInput.forcedMaterialId` short-circuits ranking: the pipeline still scores
every material under the balanced profile (so veto reasons remain visible), but
the forced material becomes the primary recommendation with `rank 0` and its full
failure-mode set + risk timeline attached. This is what lets judges pick a
deliberately wrong material (e.g. foil laminate for tomato) and watch the model
explain exactly how and when it fails.

## 10a. Complete Packaging Solution engine (`completeSolution.ts`)
Upgrades material-only recommendation into a full configuration. Selection order:
FOOD → requirements → **format** (hard filters: liquid⇒leak-proof, respiring⇒
ventilated/MAP, food-category compatibility; soft score: quantity, journey length,
sensitivity matches) → **material** (reuses existing pipeline scores restricted to
format-compatible materials) → **closure** (format+material compatibility, then
leak/reseal/tamper preferences) → **sealing** (material+format compatibility, then
hermetic potential when liquid/O₂-sensitive) → **inner liners** (conditional:
moisture-barrier liner only for hygroscopic low-a_w fills, absorbent pads, cushioning,
dividers) → **secondary** (skipped for tiny local loads; crate/carton by protection +
stackability + fragility) → **tertiary** (pallet/stretch/insulated/reefer; cold-chain
filter). Outputs 3 complete options (balanced / low-cost / sustainability) + failure
risks over the whole configuration + rejected-candidates-with-reasons + per-layer
hierarchy with provenance. Cost/sustainability are relative LOW/MEDIUM/HIGH
aggregates across layers — plastic-film primaries cap sustainability at MEDIUM
unless the material is genuinely green. All component knowledge is demo data.

## 11. Route Intelligence (`routeRisk.ts` + `osrm.ts`)
Road distance/duration come from OSRM (routing service over OpenStreetMap data;
OSM itself is not the router) with a 2.5 s timeout; when unreachable the engine
falls back to great-circle distance × 1.25 with a mode-typical speed assumption —
every metric carries a `source` field (`router` vs `fallback`) so the UI never
presents an assumption as router output. Exposure model: temperature score
(assumed in-transit temp vs 8–22 °C band; calibrated so 30 °C ≈ MEDIUM, 40 °C+ ≈
HIGH), humidity deviation, handling points ×14 + mode factor, duration. Overall
risk = 0.4·temp + 0.25·humidity + 0.25·handling + 0.1·duration. `routePackagingDelta`
converts exposure into scoring-weight boosts (mechanical, moisture, insulation)
that feed the recommendation; `routeMaterialFit` grades a material against a
route. In-transit climate values are DEMO ASSUMPTIONS — no fabricated weather data.

## 12. Structure generator (`structureGenerator.ts`)
Rule-composed multilayer candidates driven by the requirement profile: baseline
monolayer, PET/PE (seal + barrier), PET/AL/PE (high O₂/light), PET/MetPET/PE,
PET/EVOH/PE (transparent barrier), Paper/PE (sustainability-leaning),
micro-perforated variant (respiring produce). Each layer gets a qualitative role
(purpose/barrier/mechanical/seal) from industry-typical knowledge — no fabricated
permeability numbers. Every candidate carries `candidateStatus: 'requires validation'`.

## 13. Failure → AI correction loop (`autoFix.ts`)
Deterministic policy mapping each failure mode to a packaging change (anaerobic →
micro-perforated material, moisture → thickness increase, oxidation/thermal →
lower-OTR laminate, condensation → perforations, physical → thicker film; chilling
injury → honest no-op since it is a storage decision, not packaging). The loop
re-runs the full pipeline with the applied changes and reports before/after with
per-metric `better` flags — including honestly marking trade-offs (e.g. shelf-life
cost of switching to a breathable film). Label: `prototype simulation — not
physical validation`.

## 14. What an ML layer would add (and why it isn't faked)
With real training data (from Validation-Lab closures and supplier datasets), the
planned upgrades are: (a) gradient-boosted shelf-life regressor replacing the Q10
heuristic, with per-commodity uncertainty; (b) learned MAP kinetics fitted to pack
trials; (c) vision model for commodity identification. The engine interfaces
(`ShelfLifeParams`, `MapParams`, `EngineContext`) are designed so these slot in
without UI changes. Until real data exists, shipping a fake "trained model" would
violate the scientific-integrity rule — so the honest heuristics ship instead.
