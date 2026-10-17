import * as React from "react";
import { Link, useParams } from "wouter";
import { useMetrics } from "@/hooks/use-metrics";

type RoleKey = "optimist" | "engineer" | "diplomat" | "strategist";

const ROLE_META: Record<RoleKey, {
  title: string; emoji: string; tagline: string;
  panels: Array<{ id: string; title: string; render: (m: ReturnType<typeof useMetrics>["data"])=>React.ReactNode }>;
}> = {
  optimist: {
    title: "Radiant Optimist", emoji: "🌞",
    tagline: "The light we save today will shine for a billion tomorrows.",
    panels: [
      {
        id: "energy-positivity",
        title: "Energy Positivity",
        render: (m) => (
          <MetricLine items={[
            ["Energy Output", m?.energyOutput ? `${m.energyOutput.toFixed(1)} MW` : "—"],
            ["Exotic Mass",   m?.exoticMass ? `${Math.round(m.exoticMass).toLocaleString()} kg` : "—"],
            ["Ford–Roman",    m?.fordRoman ? `${m.fordRoman.status} (ζ = ${fmt(m.fordRoman.value)})` : "—"],
          ]}/>
        )
      },
      {
        id: "array-health",
        title: "Casimir Array Health",
        render: (m) => (
          <Bar label="Active Tiles"
               num={m?.activeTiles ?? 0}
               den={m?.totalTiles ?? 1} />
        )
      },
    ]
  },

  engineer: {
    title: "The Engineer", emoji: "⚙️",
    tagline: "Every equation is a bridge; every weld, a promise.",
    panels: [
      {
        id: "amplification",
        title: "Amplification Chain (live)",
        render: (m) => (
          <MetricLine items={[
            ["γ_VdB", m?.gammaVanDenBroeck ? fmt(m.gammaVanDenBroeck) : "—"],
            ["Curvature Max (proxy)", m?.curvatureMax ? fmt(m.curvatureMax) : "—"],
            ["Model", m?.modelMode ?? "—"],
          ]}/>
        )
      },
      {
        id: "sectors",
        title: "Sector Strobing",
        render: (m) => (
          <MetricLine items={[
            ["Active Sectors", m?.sectorStrobing ? `${m.sectorStrobing}` : "—"],
            ["Active Tiles", m?.activeTiles ? m.activeTiles.toLocaleString() : "—"],
          ]}/>
        )
      },
    ]
  },

  diplomat: {
    title: "The Diplomat", emoji: "🐼",
    tagline: "In harmony, the cosmos folds itself around us.",
    panels: [
      {
        id: "timescale",
        title: "Time‑Scale Ratio",
        render: (m) => (
          <MetricLine items={[
            ["TS ratio", m?.timeScaleRatio ? fmt(m.timeScaleRatio) : "—"],
            ["Hull", m?.geometry ? `${m.geometry.Lx_m}×${m.geometry.Ly_m}×${m.geometry.Lz_m} m` : "—"],
            ["Energy Output", m?.energyOutput ? `${m.energyOutput.toFixed(1)} MW` : "—"],
          ]}/>
        )
      },
      {
        id: "harmony",
        title: "Frame Harmony",
        render: () => <p className="text-sm text-slate-300">Frames in sync. Environmental drift ≈ minimal (display stub).</p>
      },
    ]
  },

  strategist: {
    title: "The Strategist", emoji: "🐒",
    tagline: "Even the smallest stone changes the course of the river.",
    panels: [
      {
        id: "tactics",
        title: "Tactical Overview",
        render: (m) => (
          <MetricLine items={[
            ["Curvature Max (proxy)", m?.curvatureMax ? fmt(m.curvatureMax) : "—"],
            ["Energy Output", m?.energyOutput ? `${m.energyOutput.toFixed(1)} MW` : "—"],
            ["Exotic Mass", m?.exoticMass ? `${Math.round(m.exoticMass).toLocaleString()} kg` : "—"],
          ]}/>
        )
      },
      {
        id: "routes",
        title: "Orbital / Rescue Map",
        render: () => <p className="text-sm text-slate-300">Route planner & sector allocation (link to Bridge / Mission Planner).</p>
      },
    ]
  },
};

export default function StationPage() {
  const params = useParams();
  const role = (params.role as RoleKey) || "optimist";
  const metrics = useMetrics();
  const data = metrics.data;
  const err = (metrics as any).error ?? (metrics as any).err;

  const meta = ROLE_META[role] ?? ROLE_META.optimist;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Top nav */}
      <div className="border-b border-slate-800 bg-slate-900/70 sticky top-0 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <div className="text-xl font-semibold">HELIX • Station</div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <NavTab to={`/station/${role}`} label="Station" active />
            <NavTab to="/bridge"        label="Theory Graph" />
            <NavTab to="/documentation" label="Docs & Papers" />
            <NavTab to="/helix-core"    label="Energy Core" />
            <NavTab to="/"              label="Change Profile" />
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-semibold">{meta.emoji} {meta.title}</h1>
        <p className="mt-2 text-slate-300">{meta.tagline}</p>

        {err && <p className="mt-3 text-rose-300 text-sm">Metrics error: {err}</p>}

        {/* Panels */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {meta.panels.map(p => (
            <section key={p.id} className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
              <h2 className="text-lg font-medium mb-3">{p.title}</h2>
              {p.render(data)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- small UI helpers ---------- */

function NavTab({to,label,active=false}:{to:string;label:string;active?:boolean}) {
  const cls = active
    ? "px-3 py-1 rounded-md bg-slate-700 text-slate-100"
    : "px-3 py-1 rounded-md hover:bg-slate-800 text-slate-300";
  return <Link href={to} className={cls}>{label}</Link>;
}

function MetricLine({items}:{items:[string,string][]}) {
  return (
    <div className="space-y-2">
      {items.map(([k,v])=>(
        <div key={k} className="flex justify-between text-sm">
          <span className="text-slate-300">{k}</span>
          <span className="text-slate-100 font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Bar({label,num,den}:{label:string;num:number;den:number}) {
  const frac = Math.max(0, Math.min(1, den ? num/den : 0));
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-100 font-medium">{num.toLocaleString()} / {den.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded bg-slate-800 overflow-hidden">
        <div className="h-full bg-cyan-400" style={{width:`${frac*100}%`}}/>
      </div>
    </div>
  );
}

function fmt(n:number){ 
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1e6 || a < 1e-3) return n.toExponential(2);
  return a >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(3);
}
