# NutriPack

**Intelligent Food Packaging Recommendation & Optimization System**
Smart India Hackathon 2026 — Problem Statement **SIH26236**

> *"Intelligent Packaging. Smarter Decisions."**

NutriPack (formerly prototyped as PackWise AI) is a decision-support platform that connects **food properties → packaging
requirements → AI material recommendation → packaging digital twin → shelf-life
estimation → cost + sustainability → validation**. It is built as a complete
product: working engine, working APIs, working UI, working persistence — no dead
buttons, no placeholder pages.

---

## ⚡ Quick start

```bash
cd nutripack-ai
npm install
npm run build && npm start        # production, http://localhost:3100
# or: npm run dev                 # development

npm test                          # engine unit tests (vitest)
node tests/api.test.mjs           # API integration tests (auth, authZ, uploads) vs a running server
npm run e2e                       # end-to-end acceptance test vs a running server
node scripts/verify-solution.mjs  # behavioural suite for the complete-solution engine
npm run seed                      # seed demo projects + validation experiments (idempotent)
```

**Continuous integration:** every push and pull request runs the full chain on GitHub Actions —
`npm ci` → typecheck → unit tests → production build → boot the built server → API integration
tests → seed → e2e → behavioural suite (`.github/workflows/ci.yml`).

Demo accounts (seeded automatically on first run):

| Account | Email | Password | Role |
|---|---|---|---|
| Admin | `admin@nutripack.demo` | `demo123` | admin (data management) |
| Analyst | `analyst@nutripack.demo` | `demo123` | analyst (save projects) |

**Seeded demo data:** run `npm run seed` (server running) to populate the demo
accounts with 5 saved projects (tomato/mango/biscuits/rice/banana routes, with
version history), 3 validation experiments (2 closed-loop completed, 1 running),
and audit-log activity — so every page (dashboard, projects, validation, admin)
shows realistic results immediately. Idempotent: re-running skips what exists.

**SIH Demo Mode:** open the Dashboard and click any of the four preconfigured
scenarios (Tomato Delhi→Jaipur, Rice ambient, Mango cold-chain, Biscuits) — or open
`/analyzer?demo=tomato-delhi-jaipur` to run the full judge flow instantly.

---

## What it does (the core flow)

```
FOOD (commodity + properties + image identification)
  ↓
PACKAGING REQUIREMENTS (rule engine: OTR window, WVTR, barriers, sealability, MAP)
  ↓
AI RECOMMENDATION (filtering → weighted scoring → multi-objective optimization)
  ↓
DIGITAL TWIN (food + packaging + environment + transport, live what-if sliders)
  ↓
SHELF-LIFE ESTIMATION (Q10 × barrier-fit, ranges + confidence)
  ↓
COST + SUSTAINABILITY + WASTE ECONOMICS + TRANSPORT RISK
  ↓
ALTERNATIVES + EXPLANATIONS ("Why this? Why not the alternatives?")
  ↓
VALIDATION LAB (prediction vs experiment → closed loop)
```

### Modules implemented

| Module | Where | Status |
|---|---|---|
| **Complete Packaging Solution** (format → closure → sealing → liners → secondary → tertiary → transport, 3 options) | `/solution`, `/api/complete-solution` | ✅ |
| **Packaging component databases** (formats/closures/seals/secondary/tertiary, provenance-tagged) | `/formats`, `/api/complete-solution` (GET) | ✅ |
| Dashboard (KPIs, charts, scenarios, projects) | `/dashboard` | ✅ |
| Food Analyzer (form + image ID + property overrides) | `/analyzer` | ✅ |
| Recommendation Engine (5 objective profiles) | `/api/analysis`, `/api/optimize` | ✅ |
| Digital Twin (live sliders, risk panel, MAP chart) | `/twin`, `/api/simulate` | ✅ |
| **Failure Lab** (forced-material failure modes, risk timeline, Monte Carlo uncertainty) | `/twin` → Failure Lab tab, `/api/simulate?materialId`, `/api/monte-carlo` | ✅ |
| **Micro-perforation designer** (orifice-physics OTR breakdown, film vs perf vs total) | MAP simulator + `/api/map?perforations` | ✅ |
| **Multi-leg supply-chain twin** (TTT shelf-life accounting, per-leg risk, VIABLE/MARGINAL/FAILURE verdict) | `/supply-chain`, `/api/supply-chain` | ✅ |
| **Route Intelligence** (OSM/OSRM routing → transport exposure → packaging deltas, destination what-if) | `/route`, `/api/route-intel` | ✅ |
| **Structure Generator** (multilayer candidates PET/AL/PE etc. with per-layer roles) | result view, `/api/structure` | ✅ |
| **Failure → AI Correction Loop** (detect → modify → re-simulate → compare) | Failure Lab, `/api/auto-fix` | ✅ |
| **Farmer Mode** (4-input simple flow, plain-language advice) | `/farmer`, `/api/farmer` | ✅ |
| Material Explorer (searchable database, provenance) | `/materials`, `/api/materials` | ✅ |
| Comparison (sortable table + Pareto charts) | `/compare`, `/api/compare` | ✅ |
| Sustainability + waste economics | `/api/sustainability` + result view | ✅ |
| Shelf-Life Estimator | `/api/shelf-life` + result view | ✅ |
| Respiration engine + MAP simulation | `/api/map` + interactive simulator | ✅ |
| Transportation simulator | `/api/transport` + result view | ✅ |
| Structure visualizer (layers, perforation concept) | result view | ✅ |
| Explainable AI ("Why this / why not") + Judge mode | result view | ✅ |
| Validation Lab (experiments, observations, prediction error) | `/validation`, `/api/validation` | ✅ |
| Reports (16 sections, PDF export via jsPDF) | `/report`, `/api/reports` | ✅ |
| Projects (versions, compare, delete) | `/projects`, `/api/analysis/[id]` | ✅ |
| Admin (verify/disable materials, audit log, role-protected) | `/admin`, `/api/admin` | ✅ |
| Auth (register/login, signed tokens, roles) | `/api/auth` | ✅ |

---

## Scientific integrity (read this first)

NutriPack does not simply tell users which material to choose — it recommends a **complete packaging configuration** (format, material, closure, sealing, liners, secondary, tertiary, transport) based on the food, its protection requirements, storage conditions, transport journey, handling conditions, cost, sustainability and packaging risks. It is a **decision-support** tool. Every scientific value is provenance-tagged:

- `reference` — indicative literature-style demo data (**not** lab-certified)
- `user` — entered by the analyst
- `estimated` — produced by a model in this app
- `experimental` — measured in the Validation Lab

The platform therefore:

- ✅ says **"estimated shelf life 12.9–18.6 days, medium confidence"**
- ✅ shows its derivation log for every requirement
- ✅ flags data gaps instead of inventing values
- ❌ never claims laboratory-validated accuracy, guaranteed waste reduction, or exact carbon footprints
- ❌ never lets an LLM invent packaging specifications (there is no LLM in the science path at all)

Reference values live in `src/lib/domain/referenceData.ts` with source IDs into the
`SOURCES` registry (exposed at `/api/sources`). Replace them with verified data for
production — the schema already supports `verified` status (see `VALIDATION.md`).

---

## The AI architecture in one paragraph

Requirements are derived by **transparent rules** (e.g. respiring produce gets an OTR
window computed from respiration rate × Q10 × mass/area ratio; dry products get a
WVTR ceiling; oxidation-sensitive products get an OTR ceiling). Materials are then
**filtered by hard constraints** (temperature range, sealability, MAP capability, and
an anaerobic veto when film OTR is far below respiration demand) and **scored** on ten
weighted criteria, with **profile-specific re-weighting** for the five optimization
objectives. Shelf life is a **Q10 temperature correction × barrier-fit factor** on a
reference baseline, always reported as a range with confidence. MAP evolution is a
one-compartment O₂/CO₂ balance simulation. Transport risk, sustainability and waste
economics are explainable heuristic models. Details: `AI_MODEL.md`.

---

## Documentation

| File | Contents |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, stack, data flow |
| [AI_MODEL.md](./AI_MODEL.md) | Every engine: rules, formulas, worked examples |
| [DATABASE.md](./DATABASE.md) | Entities, current store, PostgreSQL migration path |
| [API.md](./API.md) | All endpoints with request/response examples |
| [VALIDATION.md](./VALIDATION.md) | Validation philosophy, Validation Lab, model-improvement loop |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Environment variables, deployment, operations |

## Known limitations

- Reference dataset is demo-grade; film permeability values are order-of-magnitude.
- Shelf-life model is empirical (Q10 + barrier fit), not a predictive microbial model.
- Image identification ships as an honest demo classifier; connect a real vision
  provider via `VISION_PROVIDER` (it never claims to measure chemistry from photos).
- Waste-economics loss rates are reference assumptions, not measured supply-chain data.
- Embedded JSON store is single-node; PostgreSQL schema is specified in `DATABASE.md`.

## Future scope

Verified data partnerships (film suppliers, labs) · real ML layer trained on
Validation-Lab closures · perishable-goods route/weather integration · multi-language
UI for FPOs · regulatory label checks (FSSAI) · printer-ready regional cost tables.
