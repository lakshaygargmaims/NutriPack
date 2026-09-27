// NutriPack — demo data seeder (idempotent).
// Populates the JSON store through the app's OWN APIs so seeded records have
// exactly the shapes the UI renders. Safe to re-run: existing projects and
// experiments (matched by name/title) are skipped, not duplicated.
//
//   node scripts/seed.mjs
//   npm run seed
//
const BASE = process.env.PACKWISE_URL || 'http://localhost:3100';
let created = 0, skipped = 0;

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

const ok = (name) => { created++; console.log(`  ➕ ${name}`); };
const skip = (name) => { skipped++; console.log(`  ✓  ${name} (already seeded)`); };

console.log('=== NutriPack demo seeder ===');
console.log(`Target: ${BASE}\n`);

// 1. Log in as the analyst demo account (auto-seeded users; admin for audits)
console.log('Auth:');
const login = await req('POST', '/api/auth', { action: 'login', email: 'analyst@nutripack.demo', password: 'demo123' });
console.log('  ✓  analyst@nutripack.demo / demo123');
const adminLogin = await req('POST', '/api/auth', { action: 'login', email: 'admin@nutripack.demo', password: 'demo123' });
console.log('  ✓  admin@nutripack.demo / demo123');
const token = login.data?.token ?? login.token;

// 2. Seed projects (each POST /api/analysis auto-saves a project version)
const SCENARIOS = [
  {
    name: 'Tomato · Delhi → Jaipur',
    input: {
      commodityId: 'tomato',
      storage: { temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' },
      transport: { origin: 'Delhi', destination: 'Jaipur', distanceKm: 280, mode: 'road', durationDays: 1, expectedTempC: 20, expectedRhPct: 60, coldChain: false },
      business: { packageSizeGrams: 1000, productionVolumePerMonth: 10000 },
      priority: 'balanced',
    },
  },
  {
    name: 'Mango · Lucknow → Delhi Airport (cold chain)',
    input: {
      commodityId: 'mango',
      storage: { temperatureC: 12, rhPct: 90, targetShelfLifeDays: 10, environment: 'refrigerated' },
      transport: { origin: 'Lucknow', destination: 'Delhi Airport', distanceKm: 550, mode: 'road', durationDays: 1, expectedTempC: 12, expectedRhPct: 85, coldChain: true },
      business: { packageSizeGrams: 2000, productionVolumePerMonth: 20000 },
      priority: 'max_shelf_life',
    },
  },
  {
    name: 'Biscuits · Kolkata → Guwahati',
    input: {
      commodityId: 'biscuits',
      storage: { temperatureC: 25, rhPct: 55, targetShelfLifeDays: 90, environment: 'ambient' },
      transport: { origin: 'Kolkata', destination: 'Guwahati', distanceKm: 1020, mode: 'road', durationDays: 3, expectedTempC: 32, expectedRhPct: 75, coldChain: false },
      business: { packageSizeGrams: 200, productionVolumePerMonth: 200000 },
      priority: 'max_shelf_life',
    },
  },
  {
    name: 'Rice · Karnal → Lucknow',
    input: {
      commodityId: 'rice',
      storage: { temperatureC: 25, rhPct: 60, targetShelfLifeDays: 180, environment: 'ambient' },
      transport: { origin: 'Karnal', destination: 'Lucknow', distanceKm: 580, mode: 'road', durationDays: 2, expectedTempC: 30, expectedRhPct: 65, coldChain: false },
      business: { packageSizeGrams: 5000, productionVolumePerMonth: 50000 },
      priority: 'min_cost',
    },
  },
  {
    name: 'Banana · Thrissur → Bengaluru',
    input: {
      commodityId: 'banana',
      storage: { temperatureC: 14, rhPct: 90, targetShelfLifeDays: 8, environment: 'refrigerated' },
      transport: { origin: 'Thrissur', destination: 'Bengaluru', distanceKm: 480, mode: 'road', durationDays: 1, expectedTempC: 27, expectedRhPct: 70, coldChain: false },
      business: { packageSizeGrams: 500, productionVolumePerMonth: 15000 },
      priority: 'balanced',
    },
  },
];

console.log('\nProjects:');
const existingProjects = await req('GET', '/api/analysis');
const analysisResults = {};
for (const s of SCENARIOS) {
  // Server auto-names projects as `<commodity> · <origin> → <destination>`, so
  // match on the route rather than our display name (commodity display names vary).
  const t = s.input.transport;
  const match = existingProjects.projects.find((p) => p.name.includes(t.origin) && p.name.includes(t.destination));
  if (match) {
    const full = await req('GET', `/api/analysis/${match.id}`);
    analysisResults[s.name] = full.project.versions.at(-1).result;
    skip(`${s.name}`);
    continue;
  }
  const res = await req('POST', '/api/analysis', s.input, token);
  if (!res.projectId || !res.result) throw new Error(`analysis for "${s.name}" did not persist`);
  analysisResults[s.name] = res.result;
  const mid = (res.result.shelfLife.daysLow + res.result.shelfLife.daysHigh) / 2;
  ok(`${s.name} → ${res.result.primary.material.name.split(' (')[0]}, ${res.result.shelfLife.daysLow}–${res.result.shelfLife.daysHigh} d, ₹${res.result.primary.score.estimatedCostPerPackageInr}/pack (V1 saved)`);
  void mid;
}

// 3. Seed validation-lab experiments with realistic observation series
console.log('\nValidation experiments:');
const existingExps = await req('GET', '/api/validation');
const tomatoRes = analysisResults['Tomato · Delhi → Jaipur'];
const biscuitRes = analysisResults['Biscuits · Kolkata → Guwahati'];
const mangoRes = analysisResults['Mango · Lucknow → Delhi Airport (cold chain)'];

const EXPERIMENTS = [
  {
    title: 'Tomato · multi-3layer · 8°C chamber trial',
    commodityId: 'tomato',
    materialId: 'multi-3layer',
    predicted: tomatoRes ? tomatoRes.shelfLife.daysLow : 8,
    predictedHigh: tomatoRes ? tomatoRes.shelfLife.daysHigh : 12,
    obs: [
      { day: 0, spoilageScore: 0, weightLossPct: 0, colorL: 52, notes: 'Packed at packhouse, firm red fruit.' },
      { day: 3, spoilageScore: 0, weightLossPct: 1.2, colorL: 51, notes: 'No visible decay, slight softening.' },
      { day: 6, spoilageScore: 1, weightLossPct: 2.8, colorL: 49, notes: 'Minor shrivel, colour deepening.' },
      { day: 9, spoilageScore: 2, weightLossPct: 4.6, colorL: 46, notes: 'Soft spots on 2 fruits.' },
      { day: 11, spoilageScore: 4, weightLossPct: 7.1, colorL: 44, notes: 'Mould visible — sensory endpoint reached.' },
    ],
  },
  {
    title: 'Biscuits · pet laminate · 25°C/55%RH trial',
    commodityId: 'biscuits',
    materialId: 'pet',
    predicted: biscuitRes ? biscuitRes.shelfLife.daysLow : 80,
    predictedHigh: biscuitRes ? biscuitRes.shelfLife.daysHigh : 120,
    obs: [
      { day: 0, moisturePct: 2.1, spoilageScore: 0, textureN: 42, notes: 'Fresh bake, crisp snap.' },
      { day: 30, moisturePct: 2.9, spoilageScore: 0, textureN: 36, notes: 'Slight softening, still acceptable.' },
      { day: 60, moisturePct: 3.8, spoilageScore: 1, textureN: 28, notes: 'Noticeable loss of crispness.' },
      { day: 85, moisturePct: 4.9, spoilageScore: 4, textureN: 19, notes: 'Rancid odour + soggy texture — endpoint.' },
    ],
  },
  {
    title: 'Mango · ldpe · cold-chain pilot (running)',
    commodityId: 'mango',
    materialId: 'ldpe',
    predicted: mangoRes ? mangoRes.shelfLife.daysLow : 9,
    predictedHigh: mangoRes ? mangoRes.shelfLife.daysHigh : 14,
    obs: [
      { day: 0, spoilageScore: 0, weightLossPct: 0, colorL: 61, notes: 'Alphonso, harvested at 85% maturity.' },
      { day: 4, spoilageScore: 0, weightLossPct: 1.8, colorL: 57, notes: 'Colour turning, aroma developing.' },
    ],
  },
];

for (const e of EXPERIMENTS) {
  if (existingExps.experiments.some((x) => x.title === e.title)) {
    skip(`${e.title}`);
    continue;
  }
  const exp = await req('POST', '/api/validation', {
    kind: 'experiment',
    title: e.title,
    commodityId: e.commodityId,
    materialId: e.materialId,
    predictedLow: e.predicted,
    predictedHigh: e.predictedHigh,
  }, token);
  for (const o of e.obs) {
    await req('POST', '/api/validation', { experimentId: exp.experiment.id, ...o }, token);
  }
  const done = e.obs.at(-1).spoilageScore >= 4;
  ok(`${e.title} — ${e.obs.length} observations${done ? ', closed loop (endpoint reached)' : ' (still running)'}`);
}

// 4. Warm every demo-visible engine once so response caches / routes are hot
console.log('\nEngine warm-up:');
const anyResult = Object.values(analysisResults)[0];
const baseInput = SCENARIOS[0].input;
await req('POST', '/api/simulate', { input: baseInput, changes: { temperatureC: 12 } });
console.log('  ✓  /api/simulate (digital twin)');
await req('POST', '/api/monte-carlo', { input: baseInput, materialId: 'ldpe' });
console.log('  ✓  /api/monte-carlo');
await req('POST', '/api/supply-chain', { input: baseInput });
console.log('  ✓  /api/supply-chain (default 4-leg chain)');
await req('POST', '/api/map', { commodityId: 'tomato', temperatureC: 8, rhPct: 85, materialId: 'ldpe', days: 8, perforations: { count: 4, diameterUm: 120 } });
console.log('  ✓  /api/map (with micro-perforations)');
if (anyResult) {
  await req('POST', '/api/reports', { result: anyResult });
  console.log('  ✓  /api/reports (16-section PDF payload)');
}

// 5. One admin action so the audit log shows role-gated activity
const admin = (adminLogin.data?.token ?? adminLogin.token);
if (admin) {
  await req('POST', '/api/admin', { action: 'material.verify', id: 'multi-3layer' }, admin);
  console.log('\nAdmin: verified material multi-3layer (audit log entry added)');
}

console.log(`\n=== Seed complete: ${created} created, ${skipped} already present ===`);
console.log('Login at /login with analyst@nutripack.demo or admin@nutripack.demo — password demo123');
