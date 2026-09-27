# NutriPack — Database

## Packaging component tables (Complete Packaging Solution upgrade)

Shipped in `src/lib/domain/packagingData.ts` (JSON store mirror via `packaging_components`
keys on migration; PostgreSQL schema below mirrors the TypeScript interfaces):

- `packaging_formats` — id, name, category (flexible|rigid|specialized), flexibility, rigidity,
  ventilationCapability, stackability, resealability, tamperEvidenceCapability, leakResistance,
  typicalApplications[], foodCompatibility[], description, compatibleMaterialIds[] (FK → materials),
  source, dataType. 16 rows.
- `closures` — id, name, type, compatibleFormatIds[], compatibleMaterials[], resealable,
  tamperEvidence, leakResistance, foodContactStatus, description, source, dataType. 10 rows.
- `sealing_methods` — id, name, compatibleMaterials[], compatibleFormats[], sealStrength,
  hermeticPotential, equipmentRequirement, description, source, dataType. 8 rows.
- `secondary_packaging` — id, name, material, loadCapacityKg, stackability, protection,
  moistureResistance, reusePotential, foodContactRequired, description, source, dataType. 10 rows.
- `transport_packaging` (tertiary) — id, name, material, loadCapacityKg, stackability, reusability,
  mechanicalProtection, moistureProtection, temperatureProtection, typicalTransport[],
  coldChainSuitable, description, source, dataType. 10 rows.
- `inner_components` — id, name, purpose, rule flags (moistureSensitive/liquid/fragile), dataType. 5 rows.

Migration guarantee: reference-data upsert-by-id (`migrate()` in `store.ts`) adds new
commodities/materials on load without deleting user or demo rows.


## Current implementation: embedded document store

Zero-dependency persistence in `data/nutripack.json` (gitignored), managed by
`src/lib/server/store.ts`:

- Atomic writes: write to `.tmp`, then `rename`.
- In-process cache; `updateDb(mutator)` for transactional mutation + persist.
- Auto-seeded on first run: demo users, 12 commodities, 11 materials, 4 sources.
- Audit log capped at 500 entries.

```ts
interface DbShape {
  version: number;
  seededAt: string;
  users: StoredUser[];                    // scrypt password hashes only
  commodities: FoodCommodity[];           // with Sourced<T> provenance values
  materials: PackagingMaterial[];         // dataStatus: 'reference' | 'verified'
  sources: ReferenceSource[];             // provenance registry
  projects: Project[];                    // Project → versions[] → AnalysisResult
  experiments: ValidationExperiment[];    // → observations[]
  auditLog: { at, actor, action, detail }[];
}
```

## PostgreSQL schema (migration target)

The document shape mirrors this normalized design 1:1, so migration is mechanical:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','analyst','viewer')),
  organization TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reference_sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  year INT,
  url TEXT,
  notes TEXT
);

CREATE TABLE food_commodities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  form TEXT NOT NULL CHECK (form IN ('fresh','processed')),
  typical_storage_env TEXT NOT NULL,
  storage_temp_range_c INT4RANGE NOT NULL,
  storage_rh_range_pct INT4RANGE NOT NULL,
  value_per_kg_inr NUMERIC NOT NULL,
  notes TEXT,
  provenance TEXT NOT NULL DEFAULT 'reference',
  source_id TEXT REFERENCES reference_sources(id)
);

CREATE TABLE food_properties (
  commodity_id TEXT PRIMARY KEY REFERENCES food_commodities(id) ON DELETE CASCADE,
  moisture_content_pct NUMERIC, ph NUMERIC, fat_pct NUMERIC, protein_pct NUMERIC,
  water_activity NUMERIC, respiration_rate_mg_co2_kg_h NUMERIC,
  oxygen_sensitivity SMALLINT NOT NULL,
  moisture_sensitivity SMALLINT NOT NULL,
  light_sensitivity SMALLINT NOT NULL,
  temperature_sensitivity SMALLINT NOT NULL
);

CREATE TABLE packaging_materials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  otr_cm3_m2_day NUMERIC NOT NULL,
  wvtr_g_m2_day NUMERIC NOT NULL,
  co2tr_cm3_m2_day NUMERIC NOT NULL,
  thickness_um_min INT NOT NULL, thickness_um_max INT NOT NULL,
  sealable BOOLEAN NOT NULL,
  tensile_strength_mpa NUMERIC NOT NULL,
  temp_min_c INT NOT NULL, temp_max_c INT NOT NULL,
  moisture_barrier NUMERIC NOT NULL, oxygen_barrier NUMERIC NOT NULL, light_barrier NUMERIC NOT NULL,
  recyclability TEXT NOT NULL,
  recycled_content_pct INT NOT NULL DEFAULT 0,
  carbon_kg_co2e_per_m2 NUMERIC NOT NULL,
  cost_inr_per_m2 NUMERIC NOT NULL,
  food_contact_safe BOOLEAN NOT NULL DEFAULT true,
  map_suitable BOOLEAN NOT NULL DEFAULT false,
  data_status TEXT NOT NULL DEFAULT 'reference',   -- admin can set 'verified'
  disabled BOOLEAN NOT NULL DEFAULT false,
  source_id TEXT REFERENCES reference_sources(id)
);

CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE analyses (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  input_json JSONB NOT NULL,          -- AnalysisInput
  result_json JSONB NOT NULL,         -- AnalysisResult (immutable snapshot)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON analyses (project_id, created_at DESC);

CREATE TABLE validation_experiments (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  commodity_id TEXT REFERENCES food_commodities(id),
  material_id TEXT REFERENCES packaging_materials(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  predicted_low NUMERIC NOT NULL, predicted_high NUMERIC NOT NULL,
  actual_shelf_life_days NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE validation_observations (
  id UUID PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES validation_experiments(id) ON DELETE CASCADE,
  day INT NOT NULL,
  weight_g NUMERIC, weight_loss_pct NUMERIC, ph NUMERIC, moisture_pct NUMERIC,
  color_l NUMERIC, texture_n NUMERIC, spoilage_score SMALLINT,
  temperature_c NUMERIC, rh_pct NUMERIC, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
```

### Why `result_json` as JSONB?
An `AnalysisResult` is an immutable, self-contained decision snapshot (inputs,
requirements, derivation log, scores, explanations). Storing it as JSONB preserves
exact reproducibility of historical recommendations even as the engine evolves —
which is precisely what a validation audit needs. Hot query paths (material/food
lookup, scoring inputs) are the normalized relational parts.

### Migration checklist
1. `prisma migrate dev` with the schema above (Prisma models mirror the TS types).
2. Replace `store.ts` internals with Prisma calls — the exported API
   (`getDb`, `updateDb`, `audit`) stays identical, so routes don't change.
3. Add a connection pool + read replica when scaling read-heavy twin simulations.
