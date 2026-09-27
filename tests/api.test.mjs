/**
 * API INTEGRATION TESTS — run against the production server on :3100.
 * Start it first:  npm run build && npm start  (then: node tests/api.test.mjs)
 * These validate real HTTP behavior: status codes, authZ, headers, validation.
 * Skipped automatically (exit 0 with notice) when the server is not running.
 */
const BASE = (process.env.API_BASE || 'http://localhost:3100').replace(/\/$/, '');

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function req(method, path, { body, token, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  // server up?
  try {
    const h = await req('GET', '/api/health');
    if (!h.data?.ok) throw new Error('health not ok');
    console.log(`=== API integration tests — ${BASE} ===`);
  } catch {
    console.log('Server not reachable at ' + BASE + ' — start it (npm start) or set API_BASE.');
    return;
  }

  console.log('\n-- Security headers --');
  const health = await req('GET', '/api/health');
  ok('X-Content-Type-Options: nosniff', health.headers.get('x-content-type-options') === 'nosniff');
  ok('X-Frame-Options: DENY', health.headers.get('x-frame-options') === 'DENY');
  ok('Referrer-Policy set', !!health.headers.get('referrer-policy'));

  console.log('\n-- Health & reference data --');
  ok('GET /api/health 200 + counts', health.status === 200 && health.data.commodities > 0);
  const foods = await req('GET', '/api/foods');
  ok('GET /api/foods 200', foods.status === 200 && Array.isArray(foods.data.foods));

  console.log('\n-- Authentication --');
  const bad = await req('POST', '/api/auth', { body: { action: 'login', email: 'analyst@nutripack.demo', password: 'wrong-pass' } });
  ok('wrong password → 401 + generic message', bad.status === 401 && /invalid credentials/i.test(bad.data?.errors?.[0] ?? ''), `status ${bad.status}`);
  ok('401 does not leak hash fields', !JSON.stringify(bad.data).includes('passwordHash'));

  const login = await req('POST', '/api/auth', { body: { action: 'login', email: 'analyst@nutripack.demo', password: 'demo123' } });
  ok('valid login → 200 + token', login.status === 200 && !!login.data?.token, `status ${login.status}${login.data ? '' : ', non-JSON body'}`);
  const analyst = login.data?.token;

  const me = await req('GET', '/api/auth', { token: analyst });
  ok('GET /api/auth with token → user', me.status === 200 && me.data?.user?.email === 'analyst@nutripack.demo', `status ${me.status}`);
  const meNoTok = await req('GET', '/api/auth');
  ok('GET /api/auth without token → 401', meNoTok.status === 401);

  const malformed = await req('POST', '/api/auth', { body: { action: 'login', email: 'not-an-email', password: 'x' } });
  ok('malformed login → 400', malformed.status === 400);

  const dupe = await req('POST', '/api/auth', { body: { action: 'register', email: 'analyst@nutripack.demo', password: 'password123', name: 'Dup' } });
  ok('duplicate registration → 409', dupe.status === 409);

  const weak = await req('POST', '/api/auth', { body: { action: 'register', email: `t${Date.now()}@x.demo`, password: 'short', name: 'Weak' } });
  ok('weak password → 400', weak.status === 400);

  console.log('\n-- Authorization (role gates) --');
  const adminNoAuth = await req('GET', '/api/admin');
  ok('admin GET unauthenticated → 403', adminNoAuth.status === 403);
  const adminAnalyst = await req('GET', '/api/admin', { token: analyst });
  ok('admin GET as analyst → 403', adminAnalyst.status === 403);
  const adminLogin = await req('POST', '/api/auth', { body: { action: 'login', email: 'admin@nutripack.demo', password: 'demo123' } });
  ok('admin login ok', adminLogin.status === 200 && !!adminLogin.data?.token, `status ${adminLogin.status}`);
  const adminOk = await req('GET', '/api/admin', { token: adminLogin.data?.token });
  ok('admin GET as admin → 200', adminOk.status === 200 && adminOk.data?.ok);

  console.log('\n-- Analysis endpoint: validation & lifecycle --');
  const okBody = { commodityId: 'tomato', storage: { temperatureC: 8, rhPct: 85, targetShelfLifeDays: 12, environment: 'refrigerated' }, transport: {}, business: {}, priority: 'balanced' };
  const anon = await req('POST', '/api/analysis', { body: okBody });
  ok('anonymous analysis allowed (public engine) 200', anon.status === 200 && anon.data.ok);
  const authed = await req('POST', '/api/analysis', { body: okBody, token: analyst });
  ok('authenticated analysis → projectId', authed.status === 200 && !!authed.data?.projectId, `status ${authed.status}`);

  const badBody = await req('POST', '/api/analysis', { body: { commodityId: 'tomato', storage: { temperatureC: 999 }, priority: 'balanced' } });
  ok('temperature 999 → 400 with field name', badBody.status === 400 && /temperatureC/i.test(JSON.stringify(badBody.data)));
  const badPriority = await req('POST', '/api/analysis', { body: { ...okBody, priority: 'best' } });
  ok('unknown priority → 400', badPriority.status === 400);
  const missing = await req('POST', '/api/analysis', { body: {} });
  ok('empty body → 400', missing.status === 400);
  const unknownFood = await req('POST', '/api/analysis', { body: { ...okBody, commodityId: 'unicorn' } });
  ok('unknown commodity → 400', unknownFood.status === 400);

  console.log('\n-- Project ownership & 404s --');
  const pid = authed.data?.projectId ?? 'missing';
  const getProj = await req('GET', `/api/analysis/${pid}`);
  ok('GET project 200', getProj.status === 200);
  const noAuthDelete = await req('DELETE', `/api/analysis/${pid}`);
  ok('DELETE without token → 401', noAuthDelete.status === 401);
  const del404 = await req('DELETE', `/api/analysis/p-nonexistent`, { token: analyst });
  ok('DELETE unknown project → 404', del404.status === 404);

  console.log('\n-- Mutation endpoints require auth --');
  const obsAnon = await req('POST', '/api/validation', { body: { experimentId: 'exp-x', day: 1 } });
  ok('observation without token → 401', obsAnon.status === 401);
  const expAnon = await req('POST', '/api/validation', { body: { kind: 'experiment', commodityId: 'tomato' } });
  ok('experiment create without token → 401', expAnon.status === 401);
  const expOk = await req('POST', '/api/validation', { body: { kind: 'experiment', commodityId: 'tomato', materialId: 'ldpe', predictedLow: 8, predictedHigh: 12 }, token: analyst });
  ok('experiment create with token → 200', expOk.status === 200 && !!expOk.data?.experiment?.id, `status ${expOk.status}`);
  const obsOk = await req('POST', '/api/validation', { body: { experimentId: expOk.data?.experiment?.id ?? 'missing', day: 1, spoilageScore: 5 }, token: analyst });
  ok('observation with token → 200 + closed-loop comparison', obsOk.status === 200 && obsOk.data?.comparison !== null, `status ${obsOk.status}`);
  const obsBad = await req('POST', '/api/validation', { body: { experimentId: expOk.data?.experiment?.id ?? 'missing', day: 9999 }, token: analyst });
  ok('observation day 9999 → 400', obsBad.status === 400);

  console.log('\n-- Upload endpoint security --');
  const form = new FormData();
  form.append('image', new File([Buffer.alloc(10)], 'tiny.png', { type: 'image/png' }));
  const up = await fetch(`${BASE}/api/image-identify`, { method: 'POST', body: form });
  ok('valid small image accepted (demo classifier)', up.status === 200);
  const upData = await up.json();
  ok('response labelled demo-classifier', upData.detection?.provenance === 'demo-classifier');
  const bigForm = new FormData();
  bigForm.append('image', new File([Buffer.alloc(6 * 1024 * 1024)], 'big.png', { type: 'image/png' }));
  const upBig = await fetch(`${BASE}/api/image-identify`, { method: 'POST', body: bigForm });
  ok('6 MB image → 413', upBig.status === 413);
  const badMime = new FormData();
  badMime.append('image', new File([Buffer.alloc(100)], 'evil.exe', { type: 'application/x-msdownload' }));
  const upBad = await fetch(`${BASE}/api/image-identify`, { method: 'POST', body: badMime });
  ok('non-image MIME → 415', upBad.status === 415);

  console.log('\n-- Engine failure isolation (bad AI/model input never 500s) --');
  for (const [name, path, body] of [
    ['monte-carlo bad material → 4xx', '/api/monte-carlo', { commodityId: 'tomato', materialId: 'nope', storage: {}, oxygenFit: 1, moistureFit: 1 }],
    ['supply-chain unknown food → 4xx', '/api/supply-chain', { commodityId: 'nope', legs: [] }],
    ['route-intel unknown city → 400', '/api/route-intel', { origin: 'Atlantis', destination: 'Delhi' }],
    ['complete-solution missing input → 400', '/api/complete-solution', { quantityKg: 10 }],
    ['simulate garbage → 4xx', '/api/simulate', { changes: 'not-an-object' }],
  ]) {
    const r = await req('POST', path, { body });
    ok(`${name} (${r.status})`, r.status >= 400 && r.status < 500);
    ok(`${path} never leaks stack traces`, !JSON.stringify(r.data).includes('at ') || !/at .+\(.+:\d+:\d+\)/.test(JSON.stringify(r.data)));
  }

  console.log(`\n=== API RESULT: ${passed} passed, ${failed} failed ===`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log('  - ' + f);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('API test runner crashed:', e.message);
  process.exitCode = 1;
});
