# NutriPack — Architecture

## System overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Next.js 14 (App Router)                    │
│                                                                  │
│  Presentation (React 18 + Tailwind, /src/app, /src/components)   │
│    Landing · Dashboard · Analyzer · Twin · Materials · Compare   │
│    Validation Lab · Projects · Report (jsPDF) · Admin            │
│                          │ fetch (JSON)                          │
│                          ▼                                       │
│  API layer (/src/app/api/*) — zod-validated route handlers       │
│    analysis · recommendation · optimize · simulate · shelf-life  │
│    compare · transport · sustainability · map · validation       │
│    materials · foods · sources · demo · reports · image-identify │
│    auth · admin · health                                         │
│                          │                                       │
│                          ▼                                       │
│  Engine (pure TypeScript, /src/lib/engine)                       │
│    requirements → scoring → pipeline (multi-objective)           │
│    shelfLife · map · transport · sustainability · util           │
│                          │                                       │
│                          ▼                                       │
│  Domain (/src/lib/domain) — types + reference dataset            │
│                          │                                       │
│                          ▼                                       │
│  Server infra (/src/lib/server)                                  │
│    store.ts (embedded JSON doc store, atomic writes)             │
│    auth.ts (HMAC-signed tokens, scrypt hashes, roles)            │
│    context.ts (engine context + demo scenarios)                  │
└──────────────────────────────────────────────────────────────────┘
```

## Design decisions

### 1. Monolith-first, service-ready
The whole product runs as one Node process — right for a hackathon and for
on-premise R&D deployments. The engine is **pure functions with no I/O**, so the
ML/science layer can be lifted into a Python FastAPI service (`ML_SERVICE_URL` is
already an env var) without touching the UI. `AI_MODEL.md` documents each formula
for a faithful port.

### 2. Embedded document store, PostgreSQL-ready
`store.ts` persists a typed `DbShape` document (`data/nutripack.json`) with
tmp-file + rename atomic writes. The entity design (users, commodities, materials,
projects→versions, experiments→observations, sources, audit log) maps 1:1 onto the
normalized PostgreSQL schema in `DATABASE.md`. Migration is mechanical because all
access already goes through `getDb()/updateDb()`.

### 3. Provenance as a first-class type
`Sourced<T> = { value, provenance, sourceId? }` — every scientific quantity is
tagged at the type level. The UI renders provenance chips; reports carry a data
provenance section; admin can flip materials to `verified` only.

### 4. LLM-free science path
Recommendations come exclusively from structured data + rules + scoring +
optimization. This is deliberate: reproducibility for judges and auditors, and no
risk of an LLM inventing an OTR value. An LLM can be layered on top of the
structured output (the `/api/recommendation` response is already designed as its
input) for narrative explanation only.

### 5. Stateless API, client-side session
API routes are stateless; the browser holds the signed token
(`localStorage.nutripack.token`). Roles: `viewer` < `analyst` < `admin`. Admin
endpoints re-verify server-side on every call; audit log records auth, analysis,
admin and report events.

## Request lifecycle (core flow)

1. `POST /api/analysis` — zod validates payload shape and ranges.
2. `runAnalysis(input, ctx)`:
   - `validateInput` → honest 400 with structured errors (never invents data).
   - `resolveProperties` merges commodity reference properties with user overrides.
   - `deriveRequirements` produces the requirement envelope + derivation log.
   - For each of the 5 optimization profiles: score all materials
     (`scoreMaterial`), rank feasible-first, estimate shelf life / cost /
     sustainability / transport per candidate, keep top 5.
   - Primary = top of the requested profile; twin + judge explanation + comparison
     assembled; result returned.
3. If authenticated, the result is appended as a new version on the
   commodity·route project (auto-versioning) and audited.

## Frontend structure

- `AppShell` — nav + auth state + disclaimer footer.
- `analyzer/page.tsx` — the 5-section form; builds `AnalysisInput`; renders
  `ResultView`; supports `?demo=<scenario>` instant runs (SIH Demo Mode).
- `ResultView` — recommendation card, structure visualizer, why/why-not,
  requirement envelope + derivation log, multi-objective side-by-side, twin
  snapshot + MAP chart, sustainability bars, waste economics, transport
  explanations, judge-mode toggle, next-step CTAs.
- `twin/page.tsx` — system diagram + sliders wired to `/api/simulate` (debounced
  by React state batching; server re-runs the full pipeline).
- Pages are client components for interactivity; data fetching is plain `fetch`
  with loading skeletons; charts are Recharts (bar/scatter/line with reference
  bands for MAP targets and spoilage thresholds).
