import * as React from "react";

const CONNECTIONS = [
  "habit-pressure-break",
  "worldview-integrity",
  "capability-ambition-gradient",
  "values-over-images",
  "integration-ladder",
  "stewardship-ledger"
];

export function ConformityLaunchRailPanel() {
  return (
    <div className="relative h-full overflow-hidden bg-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_rgba(15,23,42,0.05)_45%,_rgba(2,6,23,0.9)_100%)]" />
      <div className="relative z-10 flex h-full flex-col">
        <header className="border-b border-white/10 px-6 py-5">
          <p className="text-xs font-mono uppercase tracking-[0.45em] text-cyan-300/70">
            Mission Ethos
          </p>
          <h1 className="mt-2 text-3xl font-serif">Conformity Launch Rail</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            Stable norms are rails, not cages. Use the known, deterministic regions to move toward
            the unknown, then step off into verified invention.
          </p>
        </header>
        <main className="flex-1 overflow-auto px-6 py-5">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="space-y-5">
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-5 shadow-[0_0_40px_rgba(15,23,42,0.45)]">
                <p className="text-xs font-mono uppercase tracking-[0.3em] text-slate-400">
                  Distilled Thesis
                </p>
                <p className="mt-3 text-base leading-relaxed text-slate-100">
                  Expansion and contraction are the map. Expansion is the frontier, contraction is
                  the reliable scaffold. Self-actualization uses the scaffold without falling into
                  habit gravity wells.
                </p>
                <p className="mt-3 text-base leading-relaxed text-slate-100">
                  Leadership is alignment under constraint: allocate resources where reality makes
                  progress inevitable, then build the next rung instead of forcing outcomes.
                  Dreams become durable when they are translated into constraints and verification
                  hooks.
                </p>
                <p className="mt-3 text-base leading-relaxed text-slate-100">
                  When alignment holds, invention widens freedom. Less labor to reach the next
                  development, more patience to let the system mature.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-xs font-mono uppercase tracking-[0.3em] text-slate-400">
                  Decision Ladder
                </p>
                <ol className="mt-3 space-y-2 text-sm text-slate-200">
                  <li>1. Name the rail: which norms are stable and measurable right now.</li>
                  <li>2. Name the gravity well: which habits repeat because they are old.</li>
                  <li>3. Name the frontier: what unknown becomes reachable from this rail.</li>
                  <li>4. Prove alignment: add a verification hook and a harm ledger.</li>
                  <li>5. Allocate patience: choose timelines that let the new rung stabilize.</li>
                </ol>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-xs font-mono uppercase tracking-[0.3em] text-slate-400">
                  Signals To Watch
                </p>
                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  <p>Rail integrity: deterministic metrics remain green.</p>
                  <p>Gravity drift: decisions optimized for conformity or status.</p>
                  <p>Frontier pull: clear hypothesis with falsifiable checkpoints.</p>
                  <p>Wellbeing delta: people gain time and freedom to create.</p>
                </div>
              </div>
            </section>

            <aside className="space-y-5">
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-5">
                <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-200">
                  Expansion / Contraction Map
                </p>
                <p className="mt-3 text-sm text-slate-100">
                  Expansion regions are exploration. Contraction regions are compression into
                  stable norms. Both are required to move without breaking the vessel.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-xs font-mono uppercase tracking-[0.3em] text-slate-400">
                  Connection Map
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CONNECTIONS.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-xs font-mono uppercase tracking-[0.3em] text-slate-400">
                  Minimal Artifact
                </p>
                <p className="mt-3 text-sm text-slate-200">
                  Conformity-to-Frontier Brief with the rail, the frontier, the verification hook,
                  and the wellbeing delta.
                </p>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

export default ConformityLaunchRailPanel;
