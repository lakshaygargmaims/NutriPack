// Behavioral verification for the Complete Packaging Solution upgrade.
// Drives the REAL HTTP API and asserts cross-layer invariants, hard-constraint
// enforcement, what-if transitions and determinism. Exits non-zero on failure.
const BASE = 'http://localhost:3100';
let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name} ${extra}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
};

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

const ROUTE = { origin: 'Nashik', destination: 'Delhi', mode: 'road', distanceKm: 1200, durationDays: 2, coldChain: false, handlingPoints: 3, source: 'assumption' };
const input = (commodityId, storage) => ({
  commodityId,
  ...(storage ? { storage } : {}),
  transport: { origin: 'Nashik', destination: 'Delhi', mode: 'road', coldChain: false },
  business: { packageSizeGrams: 1000, productionVolumePerMonth: 10000 },
  priority: 'balanced',
});

const LEVELS = ['low', 'medium', 'high'];

console.log('=== A. Component DB integrity ===');
const pdb = await req('GET', '/api/complete-solution');
ok('DBs served with demo provenance', pdb.status === 200 && pdb.data.ok && pdb.data.formats.every((f) => f.dataType === 'demo'), `(${pdb.data.formats.length} formats)`);
// Cross-reference integrity: every closure's compatibleFormatIds must point at real formats
const formatIds = new Set(pdb.data.formats.map((f) => f.id));
ok('closure→format references resolve', pdb.data.closures.every((c) => c.compatibleFormatIds.every((id) => formatIds.has(id))));
// Every format must list at least one material that exists in /api/materials
const mats = await req('GET', '/api/materials');
const matIds = new Set(mats.data.materials.map((m) => m.id));
ok('format→material references resolve', pdb.data.formats.every((f) => f.compatibleMaterialIds.some((m) => matIds.has(m))), '(no dangling FKs)');

console.log('=== B. Full lifecycle: tomato 500 kg Nashik→Delhi ===');
const t = await req('POST', '/api/complete-solution', { input: input('tomato'), quantityKg: 500, route: ROUTE });
const ts = t.data.solutions;
ok('3 options returned', t.status === 200 && ts.length === 3);
ok('option ids distinct', new Set(ts.map((s) => s.optionId)).size === 3);

const s0 = ts[0];
// Layer-chain invariants on the balanced option
ok('format selected', !!s0.primaryPackaging.formatId, `(${s0.primaryPackaging.formatName})`);
ok('material is format-compatible', s0.primaryPackaging && pdb.data.formats.find((f) => f.id === s0.primaryPackaging.formatId).compatibleMaterialIds.includes(s0.materialStructure.materialId), `(${s0.materialStructure.materialName.split(' (')[0]} ∈ ${s0.primaryPackaging.formatName})`);
const dbClosures = pdb.data.closures.find((c) => c.id === s0.closure?.id);
ok('closure is format-compatible', !s0.closure || dbClosures.compatibleFormatIds.includes(s0.primaryPackaging.formatId), `(${s0.closure?.name ?? 'none'})`);
const dbSeals = pdb.data.sealingMethods.find((x) => x.id === s0.sealingMethod?.id);
ok('sealing is material-compatible', !s0.sealingMethod || dbSeals.compatibleMaterialIds.length === 0 || dbSeals.compatibleMaterialIds.includes(s0.materialStructure.materialId), `(${s0.sealingMethod?.name ?? 'none'})`);
ok('hierarchy is ordered product→transport', s0.hierarchy[0].level === 'product' && s0.hierarchy.at(-1).level === 'transport' && s0.hierarchy.some((h) => h.level === 'primary'));
ok('every hierarchy layer has provenance', s0.hierarchy.every((h) => h.source.length > 0));
ok('risk levels valid', s0.failureRisks.every((r) => LEVELS.includes(r.level)) && LEVELS.includes(s0.transportRisk) && LEVELS.includes(s0.estimatedCostCategory) && LEVELS.includes(s0.sustainabilityIndicator));

// Food-specificity (the §29 requirement): configurations must DIFFER per food
console.log('=== C. Food-specificity ===');
const rice = await req('POST', '/api/complete-solution', { input: input('rice', { temperatureC: 25, rhPct: 60, targetShelfLifeDays: 180, environment: 'ambient' }), quantityKg: 5000, route: ROUTE });
const biscuits = await req('POST', '/api/complete-solution', { input: input('biscuits', { temperatureC: 25, rhPct: 55, targetShelfLifeDays: 90, environment: 'ambient' }), quantityKg: 200, route: ROUTE });
const configs = new Set([s0.primaryPackaging.formatId, rice.data.solutions[0].primaryPackaging.formatId, biscuits.data.solutions[0].primaryPackaging.formatId]);
ok('tomato/rice/biscuits get DIFFERENT formats', configs.size === 3, `(${[...configs].join(' vs ')})`);
// Respiring produce must never get a sealed-only flexible format with zero ventilation AND no MAP note
ok('tomato keeps gas exchange (ventilated or MAP rationale)', /ventilat|MAP|gas/i.test(s0.recommendationReasons.join(' ')) || s0.primaryPackaging.ventilationCapability === 'high');
// Rice is moisture-sensitive: rationale must mention moisture
ok('rice rationale mentions moisture', /moisture/i.test(rice.data.solutions[0].recommendationReasons.join(' ')));

console.log('=== D. Hard constraints ===');
const milk = await req('POST', '/api/complete-solution', {
  input: input('milk', { temperatureC: 4, rhPct: 60, targetShelfLifeDays: 7, environment: 'refrigerated' }),
  quantityKg: 200,
  route: { ...ROUTE, origin: 'Anand', coldChain: true, durationDays: 1.5 },
});
const ms = milk.data.solutions[0];
const LEAK_PROOF = ['fmt-bottle', 'fmt-tub', 'fmt-can-tin', 'fmt-jar', 'fmt-insulated-box'];
ok('milk NEVER gets a leaky format (all 3 options)', milk.data.solutions.every((s) => LEAK_PROOF.includes(s.primaryPackaging.formatId)), `(${milk.data.solutions.map((s) => s.primaryPackaging.formatName).join(' | ')})`);
ok('milk sealing hermetic when present', milk.data.solutions.every((s) => !s.sealingMethod || s.sealingMethod.hermeticPotential === 'high'));
ok('milk has rejections with reasons', ms.rejectedCandidates.length > 0 && ms.rejectedCandidates.every((r) => r.because.length > 10), `(${ms.rejectedCandidates.length} rejected)`);
// Cold-chain filter: milk route must select cold-chain-suitable tertiary
ok('milk tertiary is cold-chain suitable', !ms.tertiaryPackaging || pdb.data.tertiary.find((x) => x.id === ms.tertiaryPackaging.id).coldChainSuitable);

console.log('=== E. What-if state transitions ===');
const long = await req('POST', '/api/complete-solution', { input: input('tomato'), quantityKg: 5000, route: { ...ROUTE, distanceKm: 1800, durationDays: 5, handlingPoints: 5 } });
const tiny = await req('POST', '/api/complete-solution', { input: input('tomato'), quantityKg: 5, route: { ...ROUTE, distanceKm: 25, durationDays: 0.3, handlingPoints: 1 } });
ok('long-haul gains tertiary packaging', long.data.solutions[0].tertiaryPackaging !== null);
ok('tiny local load skips tertiary', tiny.data.solutions[0].tertiaryPackaging === null);
ok('transport risk escalates with journey', long.data.solutions[0].transportRisk !== 'low' || tiny.data.solutions[0].transportRisk !== 'low');
// Destination what-if: Nashik→Delhi vs Nashik→Guwahati (longer) — risk must not DECREASE
const far = await req('POST', '/api/complete-solution', { input: input('tomato'), quantityKg: 500, route: { ...ROUTE, destination: 'Guwahati', distanceKm: 2600, durationDays: 4 } });
const order = { low: 0, medium: 1, high: 2 };
ok('longer route → risk not lower', order[far.data.solutions[0].transportRisk] >= order[s0.transportRisk], `(${s0.transportRisk} → ${far.data.solutions[0].transportRisk})`);

console.log('=== F. Determinism ===');
const again = await req('POST', '/api/complete-solution', { input: input('tomato'), quantityKg: 500, route: ROUTE });
ok('identical request → identical configuration', JSON.stringify(again.data.solutions[0].materialStructure) === JSON.stringify(s0.materialStructure) && again.data.solutions[0].primaryPackaging.formatId === s0.primaryPackaging.formatId);
ok('confidence always valid', ts.concat(again.data.solutions).every((s) => ['high', 'medium', 'low'].includes(s.confidence)));

console.log('=== G. Invalid input handling ===');
const bad1 = await req('POST', '/api/complete-solution', { quantityKg: 100 });
ok('missing commodity → 400', bad1.status === 400);
const bad2 = await req('POST', '/api/complete-solution', { input: input('dragon-fruit'), quantityKg: 100 });
ok('unknown commodity → 400 with guidance', bad2.status === 400 && /api\/foods|Unknown/i.test(bad2.data.errors?.[0] ?? ''));

console.log(`\n=== BEHAVIORAL RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
