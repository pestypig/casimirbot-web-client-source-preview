import * as React from "react";
import type { TEssenceThemeDeck, TThemePanelRecord } from "@shared/essence-themes";

type ThemeInstrumentDeckProps = {
  deck?: TEssenceThemeDeck | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
};

export function ThemeInstrumentDeck({ deck, loading, error, onRefresh }: ThemeInstrumentDeckProps) {
  const themes = deck?.themes ?? [];

  return (
    <section className="mt-10 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80">Personal Physics</p>
          <h2 className="text-lg font-semibold text-foreground">Inner Universe Instruments</h2>
          <p className="max-w-2xl text-sm text-muted-foreground/85">
            Essence mapped your most visited envelopes into themes. Each panel shows the forces, constraints, state
            space, and gentle reframes so you can see your own pulse.
          </p>
        </div>
        {onRefresh && (
          <button
            className="rounded-full border border-primary/35 bg-card/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary transition hover:border-primary/55 hover:bg-primary/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/65 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() => onRefresh()}
          >
            Refresh
          </button>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl border border-primary/25 bg-card/72 px-4 py-6 text-sm text-muted-foreground/85">
          Scanning envelopes for themes...
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-500/60 bg-rose-500/5 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}
      {!loading && !error && !themes.length && (
        <div className="rounded-2xl border border-primary/25 bg-card/72 px-4 py-6 text-sm text-muted-foreground/85">
          Drop a few envelopes into Essence and this dashboard will light up with your personal physics.
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {themes.map((theme, idx) => (
          <ThemeCard theme={theme} key={theme.id} index={idx} />
        ))}
      </div>
    </section>
  );
}

type ThemeCardProps = {
  theme: TThemePanelRecord;
  index: number;
};

function ThemeCard({ theme, index }: ThemeCardProps) {
  const gradient = theme.color ?? "#0f172a";
  const lastTouched =
    theme.recencyDays === 0 ? "today" : theme.recencyDays < 2 ? "yesterday" : `${Math.round(theme.recencyDays)}d ago`;

  return (
    <article className="rounded-3xl border border-primary/25 bg-card/72 text-foreground shadow-[0_40px_120px_hsl(var(--primary)/0.2)] transition-colors hover:border-primary/55 hover:bg-card/82">
      <header
        className="rounded-t-3xl px-5 py-4"
        style={{
          background:
            index % 2 === 0
              ? `linear-gradient(120deg, ${gradient}, rgba(15,23,42,0.8))`
              : `linear-gradient(120deg, rgba(15,23,42,0.9), ${gradient})`,
        }}
      >
        <p className="text-[11px] uppercase tracking-[0.35em] text-white/60">Theme {index + 1}</p>
        <h3 className="text-xl font-semibold tracking-tight text-white">{theme.label}</h3>
        <p className="mt-1 text-sm text-white/80">{theme.summary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-white/70">
          <span>{theme.corpusSize} envelopes</span>
          <span className="h-px w-6 bg-white/30" />
          <span>{lastTouched}</span>
          {!!theme.topKeywords.length && (
            <>
              <span className="h-px w-6 bg-white/30" />
              <span>{theme.topKeywords.slice(0, 3).join(" - ")}</span>
            </>
          )}
        </div>
      </header>
      <div className="space-y-6 px-5 py-6">
        <FieldPanel theme={theme} />
        <StatePanel theme={theme} />
        <DualityPanel theme={theme} />
        <ReframePanel theme={theme} />
        <EvidencePanel theme={theme} />
      </div>
    </article>
  );
}

function FieldPanel({ theme }: { theme: TThemePanelRecord }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">Field</h4>
        <span className="text-[11px] text-muted-foreground/80">forces & constraints</span>
      </div>
      <div className="mt-2 flex flex-col gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground/70">Forces</p>
          <ul className="mt-1 space-y-1">
            {theme.field.forces.slice(0, 3).map((force) => (
              <li key={force.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{force.label}</span>
                <span className="text-muted-foreground/80">{Math.round(force.magnitude * 100)}%</span>
              </li>
            ))}
            {!theme.field.forces.length && <li className="text-sm text-muted-foreground/70">No clear drivers yet.</li>}
          </ul>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground/70">Constraints</p>
          <ul className="mt-1 space-y-1">
            {theme.field.constraints.slice(0, 3).map((constraint) => (
              <li key={constraint.id} className="flex items-center justify-between text-sm">
                <span>{constraint.label}</span>
                <span className="text-muted-foreground/80">{Math.round(constraint.weight * 100)}%</span>
              </li>
            ))}
            {!theme.field.constraints.length && <li className="text-sm text-muted-foreground/70">No hard boundaries yet.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

function StatePanel({ theme }: { theme: TThemePanelRecord }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">State Space</h4>
        {theme.stateSpace.stuckIn && (
          <span className="text-[11px] text-primary/85">
            lingering in {theme.stateSpace.stuckIn.replace(/-/g, " ")}
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-2">
        {theme.stateSpace.nodes.map((node) => (
          <div key={node.id} className="rounded-xl border border-primary/20 bg-card/75 p-2 text-center shadow-[inset_0_0_22px_hsl(var(--primary)/0.08)]">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80">{node.label}</p>
            <div className="mt-2 h-2 w-full rounded-full bg-primary/18">
              <div
                className="h-2 rounded-full bg-primary/80"
                style={{ width: `${Math.max(6, node.emphasis * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-foreground/90">{node.count}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DualityPanel({ theme }: { theme: TThemePanelRecord }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">Tensions</h4>
      </div>
      <div className="mt-2 space-y-3">
        {theme.dualities.slice(0, 3).map((axis) => (
          <div key={axis.id}>
            <p className="text-xs text-foreground/90">{axis.label}</p>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground/80">
              <span>{axis.negative}</span>
              <div className="relative h-1 flex-1 rounded-full bg-primary/18">
                <div
                  className="absolute -top-1 h-3 w-3 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.35)]"
                  style={{ left: `${((axis.leaning + 1) / 2) * 100}%`, transform: "translateX(-50%)" }}
                />
              </div>
              <span>{axis.positive}</span>
            </div>
          </div>
        ))}
        {!theme.dualities.length && <p className="text-sm text-muted-foreground/70">No clear tensions detected.</p>}
      </div>
    </section>
  );
}

function ReframePanel({ theme }: { theme: TThemePanelRecord }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">Reintroductions</h4>
      </div>
      <ul className="mt-2 space-y-2">
        {theme.reframes.map((reframe) => (
          <li key={reframe.id} className="rounded-2xl border border-primary/25 bg-card/78 p-3 text-sm text-foreground shadow-[inset_0_0_22px_hsl(var(--primary)/0.08)]">
            <p>{reframe.prompt}</p>
            {reframe.emphasis && <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground/75">{reframe.emphasis}</p>}
          </li>
        ))}
        {!theme.reframes.length && <li className="text-sm text-muted-foreground/70">Awaiting more signals.</li>}
      </ul>
    </section>
  );
}

function EvidencePanel({ theme }: { theme: TThemePanelRecord }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">Show Your Work</h4>
      </div>
      <ul className="mt-2 space-y-2">
        {theme.evidence.slice(0, 2).map((item) => (
          <li key={`${item.envelopeId}-${item.excerpt ?? "excerpt"}`} className="rounded-xl border border-primary/20 bg-card/75 p-2 shadow-[inset_0_0_22px_hsl(var(--primary)/0.08)]">
            <p className="text-xs font-semibold text-foreground">{item.label}</p>
            {item.excerpt && <p className="text-[13px] text-muted-foreground/85">{item.excerpt}</p>}
          </li>
        ))}
        {!theme.evidence.length && <li className="text-sm text-muted-foreground/70">Evidence pending.</li>}
      </ul>
    </section>
  );
}
