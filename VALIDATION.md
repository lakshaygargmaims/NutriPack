# NutriPack — Validation Philosophy & Lab

## The core position

NutriPack **does not claim experimentally validated predictions**. It produces
model-based decision support with quantified uncertainty, and it ships the tooling
to close the loop between prediction and reality.

| Claim the platform makes | Claim it refuses to make |
|---|---|
| "Estimated shelf life 12.9–18.6 days, medium confidence" | "Accurate shelf-life prediction" |
| "Model-based sustainability score (comparative)" | "Carbon footprint of this package" |
| "Potential reduction in food waste (estimate)" | "Guaranteed 30% waste reduction" |
| "Reference/demo dataset" | "Laboratory-validated data" |

## How uncertainty is surfaced

1. **Ranges, not points** — every shelf-life output is `[daysLow, daysHigh]`.
2. **Confidence labels** — `low` when input data is missing (no aw / no respiration)
   or conditions are abusive; otherwise `medium`. `high` is never emitted without
   experimental backing.
3. **Provenance chips** — every scientific value is tagged
   `reference | user | experimental | estimated` (typed as `Sourced<T>`).
4. **Derivation logs** — the requirement engine explains each rule it fired.
5. **Data-gap flags** — missing inputs are listed (UI + report), never silently
   substituted with invented values.
6. **Disclaimers** — in every result, report footer, and the global app footer.

## The Validation Lab (closed loop)

`/validation` + `POST /api/validation`:

```
PREDICTION (engine shelf-life range, stored on the experiment)
   ↓
EXPERIMENT (researcher records day, weight loss, pH, moisture, color,
            texture, spoilage 0–5, temperature, RH)
   ↓
ENDPOINT (spoilage score ≥ 4 closes the trial)
   ↓
COMPARISON (actual days vs predicted range → predictionErrorPct)
   ↓
MODEL IMPROVEMENT (calibration dataset grows; see AI_MODEL.md §7)
```

Each experiment stores the predicted range alongside observations, so error can be
computed per-trial and aggregated later. The trend chart plots weight loss,
spoilage score and pH against the prediction band.

## Verification checklist for the demo dataset

The bundled reference values (film OTR/WVTR, respiration classes, loss rates) are
**demo-grade**, sourced from textbook-style ranges and marked `dataStatus:
'reference'`. To upgrade any record to verified status:

1. Obtain a test report (e.g. ASTM D3985 OTR, ASTM F1249 WVTR, ISO 4892 aging).
2. In `/admin`, add the testing source to the source registry.
3. Update the material values and use `material.verify` — the UI switches the
   provenance chip from `reference` to `verified` across the platform.
4. Preferably run a Validation-Lab trial with the new material and record the result.

## Model validation methodology (when data exists)

- **Backtesting**: hold out closed Validation-Lab trials; compute MAPE of predicted
  midpoint vs actual endpoint per commodity class.
- **Calibration**: adjust Q10 factors (2.2 / 1.4) and the uncertainty band per class
  by fitting to observed endpoints; document in AI_MODEL.md with the dataset date.
- **Discrimination**: verify the risk label separates trials that failed early vs
  met target (simple ROC on 'high risk' vs early failure).
- Only after a documented backtest does the UI earn the right to display a
  validation metric — until then the platform says "not validated".
