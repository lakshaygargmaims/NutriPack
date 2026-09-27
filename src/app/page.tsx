import Link from 'next/link';

const FLOW = ['FOOD', 'REQUIREMENTS', 'PACKAGING', 'ROUTE', 'FAILURE RISK', 'OPTIMIZATION', 'EXPLAINABLE RESULT'];

export default function Landing() {
  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="pt-10">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <span className="badge-green mb-4">SIH 2026 · Intelligent Decision-Support Platform</span>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink-900">
              Nutri<span className="text-brand-600">Pack</span>
            </h1>
            <p className="mt-2 text-xl font-medium text-ink-700">Intelligent Packaging. Smarter Decisions.</p>
            <p className="mt-4 text-ink-600 leading-relaxed">
              An explainable AI-powered packaging decision-support platform that understands the food, understands the
              journey, predicts packaging risks, and recommends packaging accordingly — from commodity data to route
              intelligence to a packaging simulation model.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/analyzer" className="btn-primary">
                Start Analysis
              </Link>
              <Link href="/materials" className="btn-ghost">
                Explore Materials
              </Link>
            </div>
          </div>
          <div className="card card-pad">
            <div className="section-title">The NutriPack flow</div>
            <ol className="space-y-2">
              {FLOW.map((step, i) => (
                <li key={step} className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">{i + 1}</span>
                  <span className="text-sm font-medium text-ink-700">{step}</span>
                  {i < FLOW.length - 1 && <span className="text-ink-300">↓</span>}
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-lg bg-ink-50 border border-ink-200 p-3 text-xs text-ink-500">
              Every number in the platform is provenance-tagged: reference / user / experimental / estimated. Model outputs
              are labelled as estimates — never presented as laboratory-verified facts.
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM / SOLUTION */}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="card card-pad">
          <div className="section-title">The problem</div>
          <p className="text-sm text-ink-600 leading-relaxed">
            Packaging mismatch is a leading cause of food loss: fresh produce packed in non-breathable film spoils
            anaerobically; dry foods packed in permeable film gain moisture and stale. SMEs and FPOs rarely have packaging
            scientists, so material choice is made by habit, not analysis.
          </p>
        </div>
        <div className="card card-pad">
          <div className="section-title">The solution</div>
          <p className="text-sm text-ink-600 leading-relaxed">
            NutriPack translates food properties into packaging requirements, scores real materials against those
            requirements, weighs the transport route, predicts failure modes, optimizes across protection / cost /
            sustainability objectives, and simulates food + packaging + environment scenarios — with transparent,
            explainable output at every step.
          </p>
        </div>
      </section>

      {/* CORE FEATURES */}
      <section>
        <h2 className="text-2xl font-bold text-ink-900 mb-6">Core features</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            ['Food Analyzer', 'Commodity properties, storage, transport and business inputs — with sensible defaults and flagged data gaps.'],
            ['Requirement Translator', 'Rule-based translation of food properties into OTR/WVTR windows, barriers, thickness, sealability and MAP needs.'],
            ['Hybrid AI Engine', 'Rules → regulatory filter → candidate generation → weighted multi-criteria scoring. LLM only explains structured output.'],
            ['Route Intelligence', 'OpenStreetMap + OSRM road routing feeds distance/duration/handling exposure into packaging scoring.'],
            ['Failure Predictor', 'Model-based failure modes (anaerobic, condensation, moisture, thermal…) with cause → mitigation, plus an auto-correct loop.'],
            ['Packaging Simulation Model', 'Interactive food + packaging + environment + transport what-ifs — future-ready for Digital Twin integration.'],
            ['Shelf-Life Estimator', 'Q10 temperature model × barrier fit on reference baselines — ranges with confidence, never false precision.'],
            ['Sustainability & Waste Economics', 'Relative sustainability indicators and food-value-saved vs packaging-cost calculator.'],
          ].map(([title, body]) => (
            <div key={title} className="card card-pad">
              <h3 className="font-semibold text-ink-900">{title}</h3>
              <p className="mt-2 text-sm text-ink-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="card card-pad">
        <div className="section-title">How it works</div>
        <div className="grid md:grid-cols-5 gap-3 text-sm">
          {[
            ['1 · Analyze', 'Food properties + environment captured (or detected via image).'],
            ['2 · Derive', 'Rule engine converts properties into packaging requirements.'],
            ['3 · Optimize', 'Materials scored & optimized per priority (protection / cost / sustainability / long-distance / balanced).'],
            ['4 · Simulate', 'Packaging simulation model runs storage, route and failure what-ifs.'],
            ['5 · Validate', 'Validation Lab compares predictions with real experiments — closing the loop.'],
          ].map(([t, b]) => (
            <div key={t} className="rounded-lg border border-ink-200 bg-ink-50 p-3">
              <div className="font-semibold text-ink-800">{t}</div>
              <div className="mt-1 text-ink-600">{b}</div>
            </div>
          ))}
        </div>
      </section>

      {/* USE CASES */}
      <section>
        <h2 className="text-2xl font-bold text-ink-900 mb-6">Who it is for</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {['Food manufacturers & processors', 'Packaging engineers', 'Researchers & QC teams', 'SMEs, FPOs & small producers'].map((u) => (
            <div key={u} className="card card-pad text-sm font-medium text-ink-700">
              {u}
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad bg-brand-50 border-brand-200">
        <h2 className="text-xl font-bold text-ink-900">Ready for the judges?</h2>
        <p className="text-sm text-ink-600 mt-1">
          The SIH Demo Mode loads a polished Tomato → Delhi → Jaipur analysis instantly.
        </p>
        <Link href="/analyzer?demo=1" className="btn-primary mt-4">
          Launch SIH Demo Mode
        </Link>
      </section>
    </div>
  );
}
