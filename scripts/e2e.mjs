// NutriPack — End-to-end acceptance test (brief §48)
const BASE = 'http://localhost:3100';
let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name} ${extra}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
};
async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
}

console.log('=== 1. Health & data ===');
const h = await req('GET', '/api/health');
ok('health', h.data.ok && h.data.commodities >= 10, `(${h.data.commodities} commodities, ${h.data.materials} materials)`);
const foods = await req('GET', '/api/foods');
ok('foods list', foods.data.ok && foods.data.foods.length >= 10);
const mats = await req('GET', '/api/materials?q=poly');
ok('materials search', mats.data.ok && mats.data.count >= 2);

console.log('=== 2. Auth ===');
const login = await req('POST', '/api/auth', { action: 'login', email: 'analyst@nutripack.demo', password: 'demo123' });
ok('login', login.data.ok && !!login.data.token);
const token = login.data.token;
const badLogin = await req('POST', '/api/auth', { action: 'login', email: 'analyst@nutripack.demo', password: 'wrong-password' });
ok('rejects bad password (401)', badLogin.status === 401);

console.log('=== 3. Tomato Delhi→Jaipur analysis (§48 core) ===');
const input = {
  commodityId: 'tomato',
  storage: { temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' },
  transport: { origin: 'Delhi', destination: 'Jaipur', distanceKm: 280, mode: 'road', durationDays: 1, expectedTempC: 20, expectedRhPct: 60, coldChain: false },
  business: { packageSizeGrams: 1000, productionVolumePerMonth: 10000 },
  priority: 'balanced',
};
const an = await req('POST', '/api/analysis', input, token);
ok('analysis 200', an.status === 200 && an.data.ok);
const r = an.data.result;
ok('material returned', !!r.primary.material.name, `→ ${r.primary.material.name.split(' (')[0]}`);
ok('OTR/WVTR/thickness/sealability present', r.primary.material.otrCm3M2Day.value > 0 && r.primary.material.wvtrGm2Day.value > 0 && r.primary.material.thicknessUmRange[0] > 0);
ok('MAP suitability stated', typeof r.primary.material.mapSuitable === 'boolean');
ok('shelf-life range + confidence', r.shelfLife.daysHigh >= r.shelfLife.daysLow && ['low', 'medium', 'high'].includes(r.shelfLife.confidence), `(${r.shelfLife.daysLow}–${r.shelfLife.daysHigh} d, ${r.shelfLife.confidence})`);
ok('cost', r.primary.score.estimatedCostPerPackageInr > 0, `(₹${r.primary.score.estimatedCostPerPackageInr}/pack)`);
ok('sustainability', r.sustainability.total > 0 && r.sustainability.label === 'estimated', `(${r.sustainability.total}/100)`);
ok('transport analysis', ['low', 'medium', 'high'].includes(r.transport.suitability), `(${r.transport.suitability}, risk ${r.transport.riskScore})`);
ok('alternatives', r.alternativesComparison.length >= 3);
ok('why-explanation', r.primary.reasons.length >= 4);
ok('derivation log', r.requirements.derivation.length >= 4);
ok('project auto-saved', !!an.data.projectId);
ok('anoxic materials vetoed for tomato', r.recommendations.balanced.filter(x => x.score.infeasible.length).some(x => x.material.id === 'met-pet' || x.material.id === 'foil-lam'));

console.log('=== 4. Digital twin what-if (§48: change temperature → verify update) ===');
const twin8 = await req('POST', '/api/simulate', { input, changes: { temperatureC: 8 } });
const twin25 = await req('POST', '/api/simulate', { input, changes: { temperatureC: 25 } });
ok('twin responds', twin8.data.ok && twin25.data.ok);
const s8 = twin8.data.twin.estimatedShelfLife.daysLow;
const s25 = twin25.data.twin.estimatedShelfLife.daysLow;
ok('hotter → shorter modelled shelf life', s25 < s8, `(${s8} d @8°C vs ${s25} d @25°C)`);

console.log('=== 5. Multi-objective (§10) ===');
const opt = await req('POST', '/api/optimize', input);
ok('5 objective profiles', opt.data.objectives.length === 5, opt.data.objectives.map(o => `${o.profile}:${o.materialName.split(' (')[0]}@₹${o.costPerPackageInr}`).join(' | '));

console.log('=== 6. Compare ===');
const cmp = await req('POST', '/api/compare', input);
ok('comparison rows', cmp.data.ok && cmp.data.rows.length >= 3);

console.log('=== 7. Validation Lab closed loop (§21) ===');
// Reuse an existing e2e experiment if present so repeated runs don't litter the demo DB.
const expList = await req('GET', '/api/validation');
const reused = expList.data.experiments.find((e) => e.title === 'E2E tomato trial');
const exp = reused ? { data: { ok: true, experiment: reused } } : await req('POST', '/api/validation', { kind: 'experiment', title: 'E2E tomato trial', commodityId: 'tomato', materialId: 'multi-3layer', predictedLow: r.shelfLife.daysLow, predictedHigh: r.shelfLife.daysHigh }, token);
ok('experiment created', exp.data.ok);
const obs1 = await req('POST', '/api/validation', { experimentId: exp.data.experiment.id, day: 3, weightLossPct: 2.1, spoilageScore: 1 }, token);
ok('observation saved', obs1.data.ok);
const obs2 = await req('POST', '/api/validation', { experimentId: exp.data.experiment.id, day: 11, weightLossPct: 8.4, spoilageScore: 4 }, token);
ok('endpoint closes loop with prediction error', obs2.data.comparison && typeof obs2.data.comparison.predictionErrorPct === 'number', `(actual 11 d vs predicted ${r.shelfLife.daysLow}–${r.shelfLife.daysHigh} d → ${obs2.data.comparison?.predictionErrorPct}% error)`);
const expGet = await req('GET', `/api/validation?experimentId=${exp.data.experiment.id}`);
ok('experiment persisted', expGet.data.experiments[0].observations.length >= 2);

console.log('=== 8. Report ===');
const rep = await req('POST', '/api/reports', { result: r, projectId: an.data.projectId }, token);
ok('report sections', rep.data.ok && rep.data.sections.length >= 12);

console.log('=== 9. Admin (role-protected) ===');
const adminDenied = await req('GET', '/api/admin', null, token);
ok('analyst blocked from admin', adminDenied.status === 403);
const adminLogin = await req('POST', '/api/auth', { action: 'login', email: 'admin@nutripack.demo', password: 'demo123' });
const admin = await req('GET', '/api/admin', null, adminLogin.data.token);
ok('admin sees databases', admin.data.ok && admin.data.materials.length >= 10 && admin.data.auditLog !== undefined);
const verify = await req('POST', '/api/admin', { action: 'material.verify', id: 'ldpe' }, adminLogin.data.token);
ok('material verify action', verify.data.ok);
const unauth = await req('GET', '/api/admin');
ok('anonymous blocked', unauth.status === 403);

console.log('=== 10. Demo scenarios + image-identify + error handling ===');
const demo = await req('GET', '/api/demo');
ok('4 demo scenarios precomputed', demo.data.ok && demo.data.scenarios.length === 4);
const img = await req('POST', '/api/image-identify', { hint: 'mango' });
ok('image/hint identification', img.data.ok && img.data.detection.commodityId === 'mango');
const bad = await req('POST', '/api/analysis', { commodityId: 'tomato', storage: { temperatureC: 999 }, priority: 'balanced' });
ok('invalid input rejected with structured errors', bad.status === 400 && bad.data.errors.length > 0);
const unknown = await req('POST', '/api/analysis', { commodityId: 'dragon-fruit', priority: 'balanced' });
ok('unknown commodity → honest 400', unknown.status === 400, `(${unknown.data.errors[0].slice(0, 60)}…)`);
const noMat = await req('POST', '/api/analysis', { commodityId: 'spices', storage: { temperatureC: 25, rhPct: 20, targetShelfLifeDays: 365 }, priority: 'balanced' });
ok('spices analysis completes (tolerant), data gaps flagged', noMat.data.ok && noMat.data.result.requirements.dataGaps !== undefined);

console.log('=== 11. Failure Lab engines: Monte Carlo, supply chain, perforations, forced material ===');
const mc = await req('POST', '/api/monte-carlo', { input, materialId: 'ldpe' });
ok('Monte Carlo runs', mc.data.ok && mc.data.monteCarlo.n >= 2000, `(p50 ${mc.data.monteCarlo?.p50} d, P5–P95 ${mc.data.monteCarlo?.p5}–${mc.data.monteCarlo?.p95} d)`);
ok('MC percentiles ordered + histogram bins', mc.data.monteCarlo.p5 <= mc.data.monteCarlo.p50 && mc.data.monteCarlo.p50 <= mc.data.monteCarlo.p95 && mc.data.monteCarlo.histogram.length === 18);
ok('MC target/anaerobic probabilities in range', mc.data.monteCarlo.probTargetMet >= 0 && mc.data.monteCarlo.probTargetMet <= 100 && mc.data.monteCarlo.probAnaerobic >= 0 && mc.data.monteCarlo.probAnaerobic <= 100, `(target met ${mc.data.monteCarlo.probTargetMet}%, anaerobic ${mc.data.monteCarlo.probAnaerobic}%)`);

const chain = await req('POST', '/api/supply-chain', { input });
ok('supply chain TTT runs (default 4-leg)', chain.data.ok && chain.data.supplyChain.legs.length >= 1, `(${chain.data.supplyChain?.legs?.length ?? 0} legs, used ${chain.data.supplyChain?.shelfLifeUsedDays} d)`);
ok('TTT verdict issued', /VIABLE|MARGINAL|FAILURE/.test(chain.data.supplyChain.verdict), chain.data.supplyChain.verdict.slice(0, 60));
ok('leg accounting sums to total', Math.abs(chain.data.supplyChain.legs.reduce((a, l) => a + l.shelfLifeUsedDays, 0) - chain.data.supplyChain.shelfLifeUsedDays) < 0.01);

const perf = await req('POST', '/api/map', { commodityId: 'tomato', temperatureC: 8, rhPct: 85, materialId: 'met-pet', days: 8, perforations: { count: 6, diameterUm: 120 } });
ok('MAP sim with micro-perforations', perf.data.ok && perf.data.perforations && perf.data.perforations.count === 6);
const noPerf = await req('POST', '/api/map', { commodityId: 'tomato', temperatureC: 8, rhPct: 85, materialId: 'met-pet', days: 8 });
ok('perforations raise O₂ vs sealed film', perf.data.series.at(-1).o2Pct >= noPerf.data.series.at(-1).o2Pct, `(${noPerf.data.series.at(-1).o2Pct}% → ${perf.data.series.at(-1).o2Pct}% O₂ day 8)`);

const forced = await req('POST', '/api/simulate', { input, changes: { materialId: 'foil-lam' } });
ok('Failure Lab forced material', forced.data.ok && forced.data.forcedMaterialId === 'foil-lam' && forced.data.failureModes.length > 0, `(${forced.data.forcedMaterialName.split(' (')[0]} → ${forced.data.failureModes.length} failure modes)`);

console.log('=== 12. Route Intelligence (OSM/OSRM + exposure model) ===');
const cities = await req('GET', '/api/route-intel');
ok('city gazetteer', cities.data.ok && cities.data.cities.length >= 20, `(${cities.data.cities.length} cities)`);
const route = await req('POST', '/api/route-intel', { origin: 'Delhi', destination: 'Mumbai', mode: 'road', commodityId: 'tomato' });
ok('route analysis runs', route.data.ok && route.data.analysis.distanceKm > 500, `(Delhi→Mumbai ${route.data.analysis?.distanceKm} km, ${route.data.metrics?.source})`);
ok('route provenance labelled', route.data.metrics.source === 'osrm' || /assumption|fallback/i.test(route.data.metrics.note));
ok('route risk level + deltas', ['low', 'medium', 'high'].includes(route.data.analysis.overallRisk) && Array.isArray(route.data.deltas?.notes));
const badRoute = await req('POST', '/api/route-intel', { origin: 'Atlantis', destination: 'Mumbai' });
ok('unknown city → honest 400', badRoute.status === 400);

console.log('=== 13. Structure generator + auto-fix + farmer mode ===');
const struct = await req('POST', '/api/structure', { commodityId: 'tomato', materialId: 'multi-3layer' });
ok('structures generated', struct.data.ok && struct.data.structures.length >= 3, `(${struct.data.structures?.length ?? 0} candidates)`);
ok('all structures require validation', struct.data.structures.every((s) => s.candidateStatus === 'requires validation'));
ok('layer purposes explained', struct.data.structures.some((s) => s.layers.some((l) => l.purpose.length > 10)));

const autofix = await req('POST', '/api/auto-fix', { input: { ...input, forcedMaterialId: 'foil-lam' } });
ok('auto-fix detects + corrects', autofix.data.ok && autofix.data.steps.length > 0 && autofix.data.comparison.length === 4, `(${autofix.data.steps?.length ?? 0} fix steps)`);
ok('auto-fix honesty label', /not physical validation/i.test(autofix.data.label));

const farmer = await req('POST', '/api/farmer', { commodityId: 'tomato', quantityKg: 500, origin: 'Nashik', destination: 'Delhi', days: 2 });
ok('farmer mode simple output', farmer.data.ok && farmer.data.simple.packShort.length > 0 && farmer.data.simple.cost.length > 0, `(${farmer.data.simple?.packShort} → ${farmer.data.simple?.transportRisk})`);
const badFarmer = await req('POST', '/api/farmer', { commodityId: 'tomato', quantityKg: 500, origin: 'Atlantis', destination: 'Delhi' });
ok('farmer invalid city → 400', badFarmer.status === 400);

console.log('=== 14. Complete Packaging Solution (format → closure → seal → secondary → tertiary) ===');
const pdb = await req('GET', '/api/complete-solution');
ok('component DBs served', pdb.data.ok && pdb.data.formats.length >= 15 && pdb.data.closures.length >= 10 && pdb.data.sealingMethods.length >= 8 && pdb.data.secondary.length >= 10 && pdb.data.tertiary.length >= 10, `(${pdb.data.formats.length} formats, ${pdb.data.closures.length} closures, ${pdb.data.sealingMethods.length} seals, ${pdb.data.secondary.length} secondary, ${pdb.data.tertiary.length} tertiary)`);

const tomatoSol = await req('POST', '/api/complete-solution', { input, quantityKg: 500, route: { origin: 'Nashik', destination: 'Delhi', mode: 'road', distanceKm: 1200, durationDays: 2, coldChain: false, handlingPoints: 3, source: 'assumption' } });
ok('3 complete options', tomatoSol.data.ok && tomatoSol.data.solutions.length === 3);
const ts0 = tomatoSol.data.solutions[0];
ok('tomato solution complete', ts0.primaryPackaging.formatId && ts0.materialStructure.materialId && ts0.hierarchy.length >= 3, `(${ts0.primaryPackaging.formatName} + ${ts0.secondaryPackaging?.name ?? '—'} + ${ts0.tertiaryPackaging?.name ?? '—'})`);
ok('all options carry provenance', tomatoSol.data.solutions.every((s) => s.dataProvenance.sourceType === 'demo' && s.confidence.length > 0));

const milkSol = await req('POST', '/api/complete-solution', { input: { ...input, commodityId: 'milk', storage: { temperatureC: 4, rhPct: 60, targetShelfLifeDays: 7, environment: 'refrigerated' } }, quantityKg: 200, route: { origin: 'Anand', destination: 'Delhi', mode: 'road', distanceKm: 1000, durationDays: 1.5, coldChain: true, handlingPoints: 2, source: 'assumption' } });
ok('milk → leak-proof primary + hermetic seal', milkSol.data.ok && ['fmt-bottle', 'fmt-tub', 'fmt-can-tin', 'fmt-jar', 'fmt-insulated-box'].includes(milkSol.data.solutions[0].primaryPackaging.formatId) && (!milkSol.data.solutions[0].sealingMethod || milkSol.data.solutions[0].sealingMethod.hermeticPotential === 'high'));

const riceSol = await req('POST', '/api/complete-solution', { input: { ...input, commodityId: 'rice', storage: { temperatureC: 25, rhPct: 60, targetShelfLifeDays: 180, environment: 'ambient' } }, quantityKg: 5000 });
ok('rice ≠ tomato (food-specific configs)', riceSol.data.solutions[0].primaryPackaging.formatId !== tomatoSol.data.solutions[0].primaryPackaging.formatId, `(${riceSol.data.solutions[0].primaryPackaging.formatName} vs ${tomatoSol.data.solutions[0].primaryPackaging.formatName})`);

const badSol = await req('POST', '/api/complete-solution', { quantityKg: 100 });
ok('missing commodity → honest 400', badSol.status === 400);

console.log('=== 15. Seeded demo data present ===');
const projList = await req('GET', '/api/analysis');
ok('demo projects seeded', projList.data.projects.length >= 5, `(${projList.data.projects.length} projects)`);
ok('demo experiments seeded', expList.data.experiments.length >= 3, `(${expList.data.experiments.length} experiments)`);

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
