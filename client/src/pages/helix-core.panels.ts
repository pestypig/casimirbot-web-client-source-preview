import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Atom,
  Calculator,
  ClipboardList,
  DownloadCloud,
  Globe2,
  History,
  LineChart,
  Map,
  Navigation2,
  RadioTower,
  Scissors,
  ScrollText,
  Sparkles,
  TerminalSquare,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  Target,
  Waves,
  PlayCircle
} from "lucide-react";

type LoaderFactory = () => Promise<{ default: ComponentType<any> }>;

export type HelixPanelRef = {
  id: string;
  title: string;
  icon?: LucideIcon;
  keywords?: string[];
  loader: LoaderFactory;
  endpoints?: string[];
  pinned?: boolean;
  skipTaskbar?: boolean;
  defaultSize?: { w: number; h: number };
  defaultPosition?: { x: number; y: number };
  defaultOpen?: boolean;
  /**
   * True when the panel is usable with touch-first ergonomics (no hover-only controls or drag-only input).
   * Panels default to desktop-only unless explicitly marked.
   */
  mobileReady?: boolean;
  heavy?: boolean;
  startHidden?: boolean;
};

const API = {
  pipelineGet: "GET /api/helix/pipeline",
  stressEnergyBrick: "GET /api/helix/stress-energy-brick",
  helixMode: "POST /api/helix/mode",
  helixSnapshot: "GET /api/helix/snapshot",
  helixMetrics: "GET /api/helix/metrics",
  helixDisplacement: "GET /api/helix/displacement",
  helixProofs: "GET /api/helix/pipeline/proofs",
  grConstraintContract: "GET /api/helix/gr-constraint-contract",
  grEvaluation: "GET /api/helix/gr-evaluation",
  nhm2BlockGet: "GET /api/helix/blocks/:blockId",
  nhm2BlockResolve: "POST /api/helix/blocks/resolve",
  grAgentLoop: "GET /api/helix/gr-agent-loop",
  grAgentLoopKpis: "GET /api/helix/gr-agent-loop/kpis",
  theoryGraph: "GET /api/helix/theory/graph",
  stagePlayGraph: "GET /api/helix/stage-play/graph",
  warpCalculator: "POST /api/physics/warp/calculator",
  tokamakState: "GET /api/physics/tokamak/sim",
  tokamakCommand: "POST /api/physics/tokamak/command",
  environmentDevices: "GET /api/agi/environment-connectors/devices"
} as const;

const PANEL_KEYWORDS: Record<string, string[]> = {
  "device-check": ["device check", "connector health", "paired device", "probe readiness", "last contact"],
  "desktop-updates": ["desktop update", "installer", "signed update", "download update", "app version"],
  "electron-orbital": ["orbital density", "Bohr k/q/g", "toroidal packets", "Coulomb probe", "iso-surface"],
  "gr-agent-loop-audit": ["gr agent loop", "residuals", "gate audit", "accepted config", "warp constraints", "kpi", "time to green", "constraint violations", "learning loop", "patch ladder", "failure backlog", "run comparison"],
  "theory-badge-graph": [
    "theory badge",
    "badge graph",
    "nhm2 theory",
    "calculator loadout",
    "unit signatures",
    "claim boundary"
  ],
  "moral-graph": [
    "moral graph",
    "moral badge graph",
    "ideology badge graph",
    "ideology reflection",
    "ethos lens",
    "right speech",
    "two key review",
    "diagnostic compass"
  ],
  "fruition-calculator": [
    "fruition",
    "fruition calculator",
    "fruition procedure",
    "procedure expression",
    "action expression",
    "moral calculator",
    "ideology calculator",
    "evidence only procedure"
  ],
  "stage-play-badge-graph": [
    "stage play",
    "stage play badge graph",
    "live world graph",
    "minecraft stage",
    "affordance graph",
    "blocked moves",
    "procedural binding",
    "live environment reflection"
  ],
  "conformity-launch-rail": [
    "conformity",
    "self alignment",
    "gravity wells",
    "expansion contraction",
    "deterministic rails",
    "resource allocation",
    "leadership",
    "actualization",
    "frontier",
    "constraint ladder"
  ],
  "nhm2-solve-state": [
    "nhm2 solve",
    "solve state",
    "needle hull mark 2",
    "warp bubble",
    "proof surface",
    "gr certificate",
  ],
  "star-hydrostatic": ["HR map", "Gamow window", "potato threshold", "polytrope", "stellar ledger"],
  "star-watcher": ["Solar feed", "Coherence overlay", "Motion metrics"],
  "tokamak-sim": [
    "tokamak",
    "sparc",
    "plasma",
    "coherence diagnostics",
    "k-metrics",
    "ridge tracking",
    "precursor"
  ],
  "direction-pad": ["direction pad", "flight director", "vector pad", "nav pad", "pose nudge"],
  "nav-system": ["nav system", "nav pose", "waypoints", "navigation hud", "pose tracking"],
  "civilization-bounds-roadmap": [
    "civilization bounds",
    "system limits",
    "collaboration constraints",
    "feasibility map",
    "ideal observed gap",
    "resource bounds",
    "procedural atlas",
    "theory moral bridge",
    "bounded civilization",
  ],
  "deepmix-solar": ["deep mix solar", "mixing bands", "sector solver", "solar telemetry", "mix heuristics"],
  "solar-globe": ["solar globe", "synoptic globe", "field lines", "magnetogram", "solar surface"],
  "deepmix-sweetspot": ["sweet spot", "deep mix target", "isoline", "mix optimization", "duty sweet spot"],
  "deepmix-globe": ["deep mix globe", "mix field", "global mix", "deep mixing globe"],
  "scientific-calculator": [
    "scientific calculator",
    "latex solver",
    "equation solver",
    "step solver",
    "math workspace",
  ],
  "operational-mode": ["operational mode", "station vs desktop", "mode toggle", "profile switch", "mission view"],
  "halobank": ["HaloBank", "timeline", "halo ledger", "bank history", "halo archive"],
  "hull-status": ["runtime ops", "plan b", "runtime policy", "endpoint guard", "queue telemetry"],
  "agi-debate-view": ["AGI debate", "debate SSE", "argument stream", "multi agent debate", "debate dashboard"],
  "agi-essence-console": ["Essence console", "AGI console", "plan execute", "tools logs", "command console"],
  "agi-contribution-workbench": [
    "contribution",
    "receipt",
    "VCU",
    "review queue",
    "verification",
    "evidence"
  ],
  "star-coherence": ["star coherence", "coherence governor", "tool budget", "collapse policy", "telemetry"],
  "agi-task-history": ["task history", "AGI trace", "task log", "history queue", "trace timeline"],
  "constraint-pack-policy": ["constraint packs", "policy profile", "budget overrides", "thresholds", "pack governance"],
  "essence-proposals": ["essence proposals", "proposal queue", "jobs board", "proposal actions", "proposal mgr"],
  "dresscode": ["dresscode", "pattern", "draft", "garment", "svg", "grid", "clip mask"],
  "stellar-lsr": ["stars", "lsr", "local standard of rest", "catalog", "nav", "stellar"],
  "remove-bg-edges": ["background removal", "png alpha", "canny", "grabcut", "opencv", "mask"],
};

function lazyPanel<T extends Record<string, unknown>>(
  importer: () => Promise<T>,
  named?: keyof T | string
): LoaderFactory {
  return () =>
    importer().then((mod) => {
      const key = named ? String(named) : "default";
      const candidate = (mod as Record<string, ComponentType<any>>).default ?? (mod as Record<string, ComponentType<any>>)[key];
      if (!candidate) {
        throw new Error(`Helix panel loader missing export "${key}"`);
      }
      return { default: candidate };
    });
}

const RAW_HELIX_PANELS: HelixPanelRef[] = [
  {
    id: "device-check",
    title: "Device Check",
    icon: RadioTower,
    loader: lazyPanel(() => import("@/components/DeviceCheckPanel")),
    defaultSize: { w: 920, h: 680 },
    defaultPosition: { x: 180, y: 100 },
    mobileReady: true,
    endpoints: [API.environmentDevices],
    keywords: PANEL_KEYWORDS["device-check"]
  },
  {
    id: "desktop-updates",
    title: "Desktop Updates",
    icon: DownloadCloud,
    loader: lazyPanel(() => import("@/components/DesktopUpdatePanel")),
    defaultSize: { w: 760, h: 560 },
    defaultPosition: { x: 220, y: 140 },
    keywords: PANEL_KEYWORDS["desktop-updates"]
  },
  {
    id: "civilization-bounds-roadmap",
    title: "Civilization Bounds Roadmap",
    icon: Globe2,
    loader: lazyPanel(() => import("@/components/CivilizationBoundsRoadmap")),
    defaultSize: { w: 1100, h: 720 },
    defaultPosition: { x: 240, y: 200 },
    mobileReady: true,
    keywords: PANEL_KEYWORDS["civilization-bounds-roadmap"],
  },
  {
    id: "electron-orbital",
    title: "Electron Orbital Simulator",
    icon: Atom,
    loader: lazyPanel(() => import("@/components/ElectronOrbitalPanel")),
    defaultSize: { w: 1120, h: 720 },
    defaultPosition: { x: 180, y: 160 },
    endpoints: [API.pipelineGet, API.helixSnapshot],
    startHidden: true,
  },
  {
    id: "gr-agent-loop-audit",
    title: "GR Agent Loop Audit",
    icon: LineChart,
    loader: lazyPanel(() => import("@/components/GrAgentLoopAuditPanel")),
    defaultSize: { w: 720, h: 520 },
    defaultPosition: { x: 220, y: 140 },
    mobileReady: true,
    endpoints: [API.grAgentLoop, API.grAgentLoopKpis]
  },
  {
    id: "theory-badge-graph",
    title: "Theory Badge Graph",
    icon: ScrollText,
    loader: lazyPanel(() => import("@/components/panels/TheoryBadgeGraphPanel")),
    defaultSize: { w: 1040, h: 720 },
    defaultPosition: { x: 300, y: 190 },
    mobileReady: true,
    endpoints: [API.theoryGraph],
    keywords: PANEL_KEYWORDS["theory-badge-graph"]
  },
  {
    id: "moral-graph",
    title: "Moral Badge Graph",
    icon: Shield,
    loader: lazyPanel(() => import("@/components/panels/MoralGraphLaunchPanel")),
    defaultSize: { w: 1040, h: 720 },
    defaultPosition: { x: 320, y: 200 },
    mobileReady: true,
    keywords: PANEL_KEYWORDS["moral-graph"]
  },
  {
    id: "fruition-calculator",
    title: "Fruition Calculator",
    icon: Calculator,
    loader: lazyPanel(() => import("@/components/panels/FruitionCalculatorPanel")),
    defaultSize: { w: 900, h: 700 },
    defaultPosition: { x: 340, y: 220 },
    mobileReady: true,
    keywords: PANEL_KEYWORDS["fruition-calculator"]
  },
  {
    id: "stage-play-badge-graph",
    title: "Stage Play Badge Graph",
    icon: Map,
    loader: lazyPanel(() => import("@/components/panels/StagePlayBadgeGraphPanel")),
    defaultSize: { w: 1120, h: 760 },
    defaultPosition: { x: 360, y: 230 },
    mobileReady: true,
    endpoints: [API.stagePlayGraph],
    keywords: PANEL_KEYWORDS["stage-play-badge-graph"]
  },
  {
    id: "conformity-launch-rail",
    title: "Conformity Launch Rail",
    icon: Target,
    loader: lazyPanel(
      () => import("@/components/ideology/ConformityLaunchRailPanel"),
      "ConformityLaunchRailPanel"
    ),
    defaultSize: { w: 960, h: 680 },
    defaultPosition: { x: 340, y: 220 },
    mobileReady: true,
    keywords: PANEL_KEYWORDS["conformity-launch-rail"]
  },
  {
    id: "tsn-sim",
    title: "TSN Determinism",
    icon: RadioTower,
    loader: lazyPanel(() => import("@/components/HelixTsnPanel")),
    defaultSize: { w: 980, h: 640 },
    defaultPosition: { x: 160, y: 120 },
    endpoints: ["POST /api/sim/tsn"],
    keywords: ["tsn", "gptp", "qbv", "deterministic", "latency", "clock", "white rabbit"]
  },
  {
    id: "star-hydrostatic",
    title: "Hydrostatic Equilibrium (HR)",
    icon: Sun,
    loader: lazyPanel(() => import("@/pages/star-hydrostatic-panel")),
    defaultSize: { w: 1100, h: 720 },
    defaultPosition: { x: 240, y: 140 }
  },
  {
    id: "star-watcher",
    title: "Star Watcher",
    icon: PlayCircle,
    loader: lazyPanel(() => import("@/pages/star-watcher-panel")),
    defaultSize: { w: 1200, h: 740 },
    defaultPosition: { x: 180, y: 140 }
  },
  {
    id: "ferrofluid-analogue",
    title: "Ferrofluid Globe Analogue",
    icon: Sun,
    loader: lazyPanel(() => import("@/pages/ferrofluid-analogue-panel")),
    defaultSize: { w: 1040, h: 760 },
    defaultPosition: { x: 210, y: 150 }
  },
  {
    id: "tokamak-sim",
    title: "Tokamak Simulation",
    icon: RadioTower,
    loader: lazyPanel(() => import("@/components/TokamakSimulationPanel")),
    defaultSize: { w: 720, h: 640 },
    defaultPosition: { x: 240, y: 160 },
    endpoints: [API.tokamakState, API.tokamakCommand]
  },
  {
    id: "direction-pad",
    title: "Direction Pad",
    icon: Navigation2,
    loader: lazyPanel(() => import("@/components/DirectionPad")),
    defaultSize: { w: 420, h: 360 },
    defaultPosition: { x: 520, y: 260 },
    mobileReady: true
  },
  {
    id: "nav-system",
    title: "Solar Navigation",
    icon: Map,
    loader: lazyPanel(() => import("@/components/NavPageSection"), "NavPageSection"),
    defaultSize: { w: 720, h: 520 },
    defaultPosition: { x: 620, y: 200 }
  },
  {
    id: "deepmix-solar",
    title: "DeepMix Solar View",
    icon: Sun,
    loader: lazyPanel(() => import("@/components/DeepMixingSolarView"), "DeepMixingSolarView"),
    defaultSize: { w: 840, h: 600 },
    defaultPosition: { x: 260, y: 300 }
  },
  {
    id: "solar-globe",
    title: "Solar Globe",
    icon: Sun,
    loader: lazyPanel(() => import("@/components/SolarGlobePanel")),
    pinned: true,
    defaultSize: { w: 520, h: 620 },
    defaultPosition: { x: 360, y: 120 }
  },
  {
    id: "deepmix-sweetspot",
    title: "DeepMix Sweet Spot",
    icon: Target,
    loader: lazyPanel(() => import("@/components/deepmix/DeepMixSweetSpot")),
    defaultSize: { w: 600, h: 420 },
    defaultPosition: { x: 360, y: 340 }
  },
  {
    id: "deepmix-globe",
    title: "DeepMix Globe",
    icon: Globe2,
    loader: lazyPanel(() => import("@/components/deepmix/DeepMixGlobePanel")),
    defaultSize: { w: 760, h: 620 },
    defaultPosition: { x: 320, y: 380 }
  },
  {
    id: "nhm2-solve-state",
    title: "NHM2 Solve State",
    icon: ShieldCheck,
    loader: lazyPanel(() => import("@/components/Nhm2SolveStatePanel")),
    pinned: true,
    defaultOpen: true,
    defaultSize: { w: 1180, h: 780 },
    defaultPosition: { x: 140, y: 60 },
    endpoints: [
      API.pipelineGet,
      API.helixProofs,
      API.grConstraintContract,
      API.grEvaluation,
      API.nhm2BlockGet,
      API.nhm2BlockResolve,
      API.stressEnergyBrick,
      API.warpCalculator,
    ],
    keywords: PANEL_KEYWORDS["nhm2-solve-state"],
  },
  {
    id: "scientific-calculator",
    title: "Scientific Calculator",
    icon: Calculator,
    loader: lazyPanel(() => import("@/components/panels/ScientificCalculatorPanel")),
    defaultSize: { w: 900, h: 700 },
    defaultPosition: { x: 300, y: 140 },
    mobileReady: true,
    keywords: PANEL_KEYWORDS["scientific-calculator"],
  },
  {
    id: "operational-mode",
    title: "Operational Mode Switch",
    icon: Settings,
    loader: lazyPanel(() => import("@/components/OperationalModePanel")),
    defaultSize: { w: 600, h: 320 },
    defaultPosition: { x: 160, y: 520 },
    pinned: true,
    mobileReady: true,
    endpoints: [API.pipelineGet, API.helixMode]
  },
  {
    id: "halobank",
    title: "HaloBank Timeline",
    icon: Sun,
    loader: lazyPanel(() => import("@/components/HalobankPanel")),
    defaultSize: { w: 1100, h: 680 },
    defaultPosition: { x: 140, y: 40 },
    endpoints: ["GET /halobank"]
  },
  {
    id: "hull-status",
    title: "Runtime Ops",
    icon: Shield,
    loader: lazyPanel(() => import("@/components/hull/RuntimeOps")),
    defaultSize: { w: 520, h: 520 },
    defaultPosition: { x: 80, y: 80 },
    pinned: true
  },
  {
    id: "agi-debate-view",
    title: "Debate View",
    icon: TerminalSquare,
    loader: lazyPanel(() => import("@/components/agi/DebateView")),
    defaultSize: { w: 1000, h: 720 },
    defaultPosition: { x: 120, y: 100 }
  },
  {
    id: "agi-essence-console",
    title: "Essence Console",
    icon: TerminalSquare,
    loader: lazyPanel(() => import("@/components/agi/essence.tsx")),
    defaultSize: { w: 920, h: 720 },
    defaultPosition: { x: 180, y: 120 },
    endpoints: [
      "POST /api/agi/plan",
      "POST /api/agi/execute",
      "GET /api/agi/tools/logs/stream"
    ],
    pinned: true
  },
  {
    id: "star-coherence",
    title: "Star Coherence Governor",
    icon: Sparkles,
    loader: lazyPanel(() => import("@/components/agi/StarCoherencePanel"), "StarCoherencePanel"),
    defaultSize: { w: 520, h: 520 },
    defaultPosition: { x: 220, y: 140 },
    mobileReady: true,
    endpoints: ["GET /api/agi/star/telemetry"]
  },
  {
    id: "agi-task-history",
    title: "Task History",
    icon: History,
    loader: lazyPanel(() => import("@/components/agi/TaskHistoryPanel")),
    defaultSize: { w: 520, h: 600 },
    defaultPosition: { x: 1140, y: 140 },
    pinned: true
  },
  {
    id: "helix-noise-gens",
    title: "Noise Gens",
    icon: Waves,
    loader: lazyPanel(() => import("@/pages/helix-noise-gens")),
    defaultSize: { w: 1100, h: 720 },
    defaultPosition: { x: 180, y: 140 },
    pinned: true,
    mobileReady: true,
    endpoints: [
      "GET /api/noise-gens/originals",
      "GET /api/noise-gens/generations",
      "GET /api/noise-gens/moods"
    ],
    keywords: ["noise gen", "noisegens", "cover", "render plan", "stems", "atoms", "moods"]
  },
  {
    id: "constraint-pack-policy",
    title: "Constraint Pack Policies",
    icon: ClipboardList,
    loader: lazyPanel(() => import("@/components/agi/ConstraintPackPolicyPanel")),
    defaultSize: { w: 980, h: 680 },
    defaultPosition: { x: 260, y: 140 },
    mobileReady: true,
    endpoints: [
      "GET /api/agi/constraint-packs",
      "GET /api/agi/constraint-packs/policies",
      "POST /api/agi/constraint-packs/policies"
    ]
  },
  {
    id: "agi-contribution-workbench",
    title: "Contribution Workbench",
    icon: ClipboardList,
    loader: lazyPanel(() => import("@/components/agi/ContributionWorkbenchPanel")),
    defaultSize: { w: 1100, h: 720 },
    defaultPosition: { x: 300, y: 160 },
    endpoints: [
      "GET /api/agi/contributions/drafts",
      "POST /api/agi/contributions/ingest",
      "POST /api/agi/contributions/drafts/:id/verify",
      "POST /api/agi/contributions/drafts/:id/receipt",
      "GET /api/agi/contributions/receipts",
      "GET /api/agi/contributions/receipts/:id/disputes",
      "POST /api/agi/contributions/receipts/:id/disputes",
      "POST /api/agi/contributions/disputes/:id/resolve",
      "POST /api/agi/contributions/receipts/:id/review",
      "POST /api/agi/contributions/receipts/:id/mint",
      "POST /api/agi/contributions/receipts/:id/revoke"
    ],
    keywords: PANEL_KEYWORDS["agi-contribution-workbench"]
  },
  {
    id: "remove-bg-edges",
    title: "PNG Edge Cutter",
    icon: Scissors,
    loader: lazyPanel(() => import("@/components/RemoveBgEdgesPanel")),
    defaultSize: { w: 960, h: 640 },
    defaultPosition: { x: 200, y: 80 }
  },
  {
    id: "dresscode",
    title: "Dresscode Drafting",
    icon: Sparkles,
    loader: lazyPanel(() => import("@/components/essence/DresscodePanel")),
    defaultSize: { w: 1120, h: 880 },
    defaultPosition: { x: 200, y: 140 }
  },
  {
    id: "stellar-lsr",
    title: "Stellar LSR Viewer",
    icon: Navigation2,
    loader: lazyPanel(() => import("@/components/StellarLsrPanel")),
    defaultSize: { w: 1120, h: 780 },
    defaultPosition: { x: 180, y: 120 },
    endpoints: ["GET /api/stellar/local-rest", "GET /api/stellar/local-rest/stream"]
  },
  {
    id: "essence-proposals",
    title: "Essence Proposals",
    icon: Sparkles,
    loader: lazyPanel(() => import("@/components/agi/EssenceProposalsPanel"), "EssenceProposalsPanel"),
    defaultSize: { w: 1080, h: 700 },
    defaultPosition: { x: 220, y: 140 },
    endpoints: ["GET /api/proposals", "POST /api/proposals/:id/action", "GET /api/essence/events"]
  }
];

export const HELIX_PANELS: HelixPanelRef[] = RAW_HELIX_PANELS.map((panel) => {
  const fallbackKeywords = PANEL_KEYWORDS[panel.id];
  const mobileReady = panel.mobileReady === true;
  if (!fallbackKeywords || panel.keywords?.length) {
    return { ...panel, mobileReady };
  }
  return { ...panel, keywords: fallbackKeywords, mobileReady };
});

export const MOBILE_HELIX_PANELS = HELIX_PANELS.filter((panel) => panel.mobileReady && !panel.startHidden);
