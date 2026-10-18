import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { PanelTelemetry } from "@shared/desktop";
import type { HelixPanelRef } from "@/pages/helix-core.panels";
import { HELIX_PANELS } from "@/pages/helix-core.panels";
import { isFlagEnabled } from "@/lib/envFlags";
import { getResonanceWatcherState } from "@/lib/agi/resonanceVersion";
import {
  getWorkstationPanelCapabilities,
  type WorkstationPanelCapabilities,
} from "@/lib/workstation/panelCapabilities";

export type PanelId =
  | "endpoints"
  | "agent-access"
  | "taskbar"
  | "docs-viewer"
  | "resonance-orchestra"
  | "essence-prompt-panel"
  | "situation-room-sources"
  | "situation-room-pipelines"
  | "live-answer-environment"
  | "image-lens"
  | "document-image-lens"
  | "surface-workspace"
  | "visual-evidence"
  | "motorcycle-hud-lab"
  | "narrator"
  | "postulate-board"
  | HelixPanelRef["id"];

export type PanelTelemetryWindowSnapshot = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  isOpen?: boolean;
  isMinimized?: boolean;
  isMaximized?: boolean;
  isFullscreen?: boolean;
  z?: number;
  opacity?: number;
};

export type PanelTelemetryContext = {
  desktopId: string;
  panelId: PanelId | (string & {});
  instanceId: string;
  now: Date;
  window?: PanelTelemetryWindowSnapshot;
};

export type PanelTelemetryDetails = Partial<
  Omit<PanelTelemetry, "panelId" | "instanceId" | "title"> & { lastUpdated?: string }
>;

export type PanelTelemetryCollector = (ctx: PanelTelemetryContext) => PanelTelemetryDetails | null;

export interface PanelDefinition {
  id: PanelId | (string & {});
  title: string;
  icon?: LucideIcon;
  loader: () => Promise<{ default: ComponentType<any> }>;
  defaultSize?: { w: number; h: number };
  defaultPosition?: { x: number; y: number };
  defaultOpen?: boolean;
  endpoints?: string[];
  pinned?: boolean;
  skipTaskbar?: boolean;
  alwaysOnTop?: boolean;
  noMinimize?: boolean;
  keywords?: string[];
  mobileReady?: boolean;
  heavy?: boolean;
  startHidden?: boolean;
  telemetryKind?: string;
  collectTelemetry?: PanelTelemetryCollector;
  workstationCapabilities?: WorkstationPanelCapabilities;
}

type ModuleLoader<T = Record<string, ComponentType<any>>> = () => Promise<T>;

const load = <T extends Record<string, unknown>>(
  importer: ModuleLoader<T>,
  named?: keyof T | string
) => {
  return () =>
    importer().then((mod: any) => {
      const fallbackKey = typeof named === "string" ? named : "default";
      const candidate = mod?.default ?? (named ? mod?.[named as string] : undefined);
      if (!candidate) {
        throw new Error(`Panel loader missing export "${fallbackKey}"`);
      }
      return { default: candidate as ComponentType<any> };
    });
};

const BASE_PANELS: PanelDefinition[] = [
  {
    id: "mission-ethos",
    title: "Ideology & Moral",
    loader: load(() => import("@/components/IdeologyPanel"), "IdeologyPanel"),
    defaultSize: { w: 960, h: 680 },
    defaultPosition: { x: 150, y: 130 },
    startHidden: true
  },
  {
    id: "mission-ethos-source",
    title: "Mission Ethos Source",
    loader: load(() => import("@/components/MissionEthosSourcePanel"), "MissionEthosSourcePanel"),
    defaultSize: { w: 840, h: 640 },
    defaultPosition: { x: 220, y: 160 }
  },
  {
    id: "helix-noise-gens",
    title: "Helix Noise Gens",
    loader: load(() => import("@/pages/helix-noise-gens")),
    defaultSize: { w: 1100, h: 720 },
    defaultPosition: { x: 180, y: 140 },
    pinned: true,
  },
  {
    id: "helix-observables",
    title: "Helix Observables",
    loader: load(() => import("@/pages/helix-observables")),
    defaultSize: { w: 1100, h: 720 },
    defaultPosition: { x: 200, y: 160 }
  },
  {
    id: "star-coherence",
    title: "Star Coherence Governor",
    loader: load(() => import("@/components/agi/StarCoherencePanel"), "StarCoherencePanel"),
    defaultSize: { w: 520, h: 520 },
    defaultPosition: { x: 240, y: 180 },
    endpoints: ["GET /api/agi/star/telemetry"]
  },
  {
    id: "helix-luma",
    title: "Luma Lab",
    loader: load(() => import("@/pages/luma")),
    defaultSize: { w: 1080, h: 720 },
    defaultPosition: { x: 220, y: 180 }
  },
  {
    id: "rag-ingest",
    title: "RAG Ingest",
    loader: load(() => import("@/pages/ingest")),
    defaultSize: { w: 980, h: 680 },
    defaultPosition: { x: 240, y: 200 }
  },
  {
    id: "rag-admin",
    title: "RAG Admin",
    loader: load(() => import("@/pages/rag-admin")),
    defaultSize: { w: 1020, h: 700 },
    defaultPosition: { x: 260, y: 220 }
  },
  {
    id: "code-admin",
    title: "Code Admin",
    loader: load(() => import("@/pages/code-admin")),
    defaultSize: { w: 1020, h: 700 },
    defaultPosition: { x: 280, y: 240 }
  },
  {
    id: "essence-proposals",
    title: "Essence Proposals",
    loader: load(() => import("@/components/agi/EssenceProposalsPanel"), "EssenceProposalsPanel"),
    defaultSize: { w: 1100, h: 720 },
    defaultPosition: { x: 320, y: 260 }
  },
  {
    id: "essence-prompt-panel",
    title: "Essence Prompt Variations",
    loader: load(() => import("@/components/agi/EssencePromptPanel"), "EssencePromptPanel"),
    defaultSize: { w: 1100, h: 720 },
    defaultPosition: { x: 360, y: 280 }
  },
  {
    id: "star-hydrostatic",
    title: "Hydrostatic Equilibrium",
    loader: load(() => import("@/pages/star-hydrostatic-panel")),
    defaultSize: { w: 1100, h: 720 },
    defaultPosition: { x: 320, y: 220 }
  },
  {
    id: "star-watcher",
    title: "Star Watcher",
    loader: load(() => import("@/pages/star-watcher-panel")),
    defaultSize: { w: 1200, h: 740 },
    defaultPosition: { x: 180, y: 140 }
  },
  {
    id: "endpoints",
    title: "Endpoints & Panels",
    loader: load(() => import("@/components/desktop/EndpointsPanel")),
    defaultSize: { w: 520, h: 420 },
    defaultPosition: { x: 60, y: 420 },
    defaultOpen: true
  },
  {
    id: "agent-access",
    title: "Agent Access",
    loader: load(() => import("@/components/workstation/AgentAccessPanel")),
    defaultSize: { w: 900, h: 720 },
    defaultPosition: { x: 120, y: 80 },
    endpoints: [
      "POST /mcp",
      "GET /.well-known/oauth-protected-resource/mcp",
      "/api/v1/agent-runs",
    ],
    keywords: [
      "MCP",
      "OpenAI",
      "Codex",
      "Gemini",
      "OAuth",
      "external agent",
    ],
    mobileReady: true,
  },
  {
    id: "friends-parties",
    title: "Friends & Voice Parties",
    loader: load(() => import("@/components/workstation/friends-parties")),
    defaultSize: { w: 980, h: 700 },
    defaultPosition: { x: 140, y: 90 },
    endpoints: [
      "GET /api/agi/friends-parties",
      "POST /api/agi/friends-parties/friendships",
      "POST /api/agi/friends-parties/parties",
      "POST /api/agi/friends-parties/parties/:partyId/media/signals",
    ],
    keywords: ["friends", "party", "voice", "chat", "GPT Live"],
    mobileReady: true,
  },
  {
    id: "taskbar",
    title: "Taskbar",
    loader: load(() => import("@/components/desktop/TaskbarPanel")),
    defaultSize: { w: 720, h: 80 },
    defaultPosition: { x: 24, y: 24 },
    pinned: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    noMinimize: true
  },
  {
    id: "docs-viewer",
    title: "Docs & Papers",
    loader: load(() => import("@/components/DocViewerPanel")),
    defaultSize: { w: 1040, h: 720 },
    defaultPosition: { x: 180, y: 120 }
  },
  {
    id: "workstation-notes",
    title: "Workstation Notes",
    loader: load(() => import("@/components/workstation/WorkstationNotesPanel")),
    defaultSize: { w: 980, h: 700 },
    defaultPosition: { x: 220, y: 140 },
  },
  {
    id: "account-session",
    title: "Account & Sessions",
    loader: load(() => import("@/components/workstation/AccountSessionPanel")),
    defaultSize: { w: 900, h: 640 },
    defaultPosition: { x: 240, y: 130 },
    keywords: ["account", "session", "profile", "discord", "usage", "memory", "tokens", "sign in"],
  },
  {
    id: "environment-home",
    title: "Home",
    loader: load(() => import("@/components/workstation/EnvironmentHomePanel")),
    defaultSize: { w: 1040, h: 740 },
    defaultPosition: { x: 200, y: 120 },
    keywords: ["environment", "home", "store", "packages", "install"],
  },
  {
    id: "local-harness",
    title: "Local Harness",
    loader: load(() => import("@/components/workstation/LocalHarnessPanel")),
    defaultSize: { w: 940, h: 620 },
    defaultPosition: { x: 250, y: 135 },
    endpoints: ["GET /api/local-supervisor/status"],
    keywords: ["local", "harness", "supervisor", "Codex", "MCP", "installed node"],
  },
  {
    id: "connections-billing-security",
    title: "Connections, Billing & Security",
    loader: load(() => import("@/components/workstation/InstalledServicesPanel")),
    defaultSize: { w: 1040, h: 740 },
    defaultPosition: { x: 260, y: 140 },
    endpoints: ["GET /api/account/installed-services"],
    keywords: [
      "connections",
      "providers",
      "billing",
      "subscription",
      "credentials",
      "device security",
      "MFA",
    ],
  },
  {
    id: "postulate-board",
    title: "Postulate Board",
    loader: load(() => import("@/components/workstation/PostulateBoardPanel")),
    defaultSize: { w: 980, h: 700 },
    defaultPosition: { x: 260, y: 150 },
    keywords: ["postulate", "proposal", "review", "badge graph", "reward", "receipt"],
  },
  {
    id: "situation-room-sources",
    title: "Situation Room",
    loader: load(() => import("@/components/workstation/SituationRoomPipelinesPanel")),
    defaultSize: { w: 1120, h: 740 },
    defaultPosition: { x: 240, y: 160 },
    keywords: ["situation", "room", "sources", "audio", "transcript", "notes", "pipelines"],
  },
  {
    id: "situation-room-pipelines",
    title: "Situation Room",
    loader: load(() => import("@/components/workstation/SituationRoomPipelinesPanel")),
    defaultSize: { w: 1120, h: 740 },
    defaultPosition: { x: 280, y: 180 },
    keywords: ["situation", "room", "sources", "pipelines", "jobs", "translation", "summary", "prompt"],
  },
  {
    id: "live-answer-environment",
    title: "Live Answer",
    loader: load(() => import("@/components/workstation/LiveAnswerEnvironmentPanel"), "LiveAnswerEnvironmentPanel"),
    defaultSize: { w: 980, h: 720 },
    defaultPosition: { x: 260, y: 160 },
    keywords: ["live", "answer", "cortana", "minecraft", "game source", "plugin signal", "present state", "line checks", "interpreted log"],
  },
  {
    id: "image-lens",
    title: "Image Lens",
    loader: load(() => import("@/components/workstation/ImageLensPanel")),
    defaultSize: { w: 1180, h: 760 },
    defaultPosition: { x: 260, y: 150 },
    keywords: ["image", "crop", "visual source", "live answer", "frame", "attachment", "url"],
  },
  {
    id: "document-image-lens",
    title: "Image Lens",
    loader: load(() => import("@/components/workstation/DocumentImageLensPanel")),
    defaultSize: { w: 1180, h: 760 },
    defaultPosition: { x: 260, y: 150 },
    keywords: ["image", "crop", "visual source", "legacy", "document image lens"],
  },
  {
    id: "narrator",
    title: "Narrator",
    loader: load(() => import("@/components/workstation/NarratorPanel")),
    defaultSize: { w: 980, h: 680 },
    defaultPosition: { x: 300, y: 170 },
    keywords: ["narrator", "voice", "read aloud", "callout", "speech", "accessibility", "events"],
  },
  {
    id: "workstation-clipboard-history",
    title: "Clipboard History",
    loader: load(() => import("@/components/workstation/WorkstationClipboardHistoryPanel")),
    defaultSize: { w: 760, h: 620 },
    defaultPosition: { x: 260, y: 180 },
  },
  {
    id: "workstation-workflow-timeline",
    title: "Workflow Timeline",
    loader: load(() => import("@/components/workstation/WorkstationWorkflowTimelinePanel")),
    defaultSize: { w: 820, h: 640 },
    defaultPosition: { x: 300, y: 200 },
  },
  {
    id: "workflow-demo-lab",
    title: "Workflow Demo Lab",
    loader: load(() => import("@/components/workstation/WorkflowDemoLabPanel")),
    defaultSize: { w: 980, h: 720 },
    defaultPosition: { x: 320, y: 180 },
    keywords: ["workflow", "demo", "quick time event", "qte", "research", "proposal", "developer"],
  },
  {
    id: "surface-workspace",
    title: "Surface Workspace",
    loader: load(() => import("@/components/workstation/SurfaceWorkspacePanel")),
    defaultSize: { w: 1180, h: 780 },
    defaultPosition: { x: 260, y: 140 },
    keywords: ["surface", "hud", "routing", "registry", "output", "overlay", "developer"],
    heavy: false,
  },
  {
    id: "visual-evidence",
    title: "Visual Evidence",
    loader: load(() => import("@/components/workstation/VisualEvidencePanel")),
    defaultSize: { w: 1180, h: 780 },
    defaultPosition: { x: 280, y: 150 },
    keywords: ["visual", "video", "frames", "capture", "evidence", "codex", "vision", "developer"],
    heavy: false,
  },
  {
    id: "motorcycle-hud-lab",
    title: "Motorcycle HUD Lab",
    loader: load(() => import("@/components/workstation/MotorcycleHudLabPanel")),
    defaultSize: { w: 1240, h: 820 },
    defaultPosition: { x: 260, y: 130 },
    keywords: ["motorcycle", "helmet", "hud", "radar", "sensor", "replay", "safety", "developer"],
    heavy: false,
  },
  {
    id: "workstation-process-graph",
    title: "Process Graph",
    loader: load(() => import("@/components/workstation/WorkstationProcessGraphPanel")),
    defaultSize: { w: 1120, h: 740 },
    defaultPosition: { x: 300, y: 180 },
    keywords: ["process", "graph", "workflow", "tools", "jobs", "artifacts", "timeline"],
  },
  {
    id: "workstation-task-manager",
    title: "Task Manager",
    loader: load(() => import("@/components/workstation/WorkstationTaskManagerPanel")),
    defaultSize: { w: 980, h: 680 },
    defaultPosition: { x: 320, y: 190 },
    keywords: ["task", "manager", "memory", "ram", "runtime", "process", "performance"],
    heavy: false,
  },
  {
    id: "workstation-storage-map",
    title: "Storage Map",
    loader: load(() => import("@/components/workstation/WorkstationStorageMapPanel")),
    defaultSize: { w: 1060, h: 720 },
    defaultPosition: { x: 340, y: 210 },
    keywords: ["storage", "saved memory", "disk", "quota", "localStorage", "sessionStorage", "profile memory"],
    heavy: false,
  },
  ...(isFlagEnabled("ENABLE_RESONANCE_ORCHESTRA", true)
    ? [
        {
          id: "resonance-orchestra",
          title: "Resonance Orchestra",
          loader: load(() => import("@/components/agi/ResonanceOrchestraPanel")),
          defaultSize: { w: 640, h: 520 },
          defaultPosition: { x: 420, y: 220 },
          collectTelemetry: () => {
            const watcher = getResonanceWatcherState();
            const ageMs = watcher.lastEventTs ? Math.max(0, Date.now() - watcher.lastEventTs) : null;
            return {
              kind: "client",
              metrics: {
                latticeVersion: watcher.version,
                filesTouched: watcher.stats?.filesTouched ?? 0
              },
              flags: { sseConnected: watcher.connected },
              strings: ageMs !== null ? { lastEventAge: `${Math.round(ageMs / 1000)}s` } : undefined,
              sourceIds: [
                "client/src/components/agi/ResonanceOrchestraPanel.tsx",
                "client/src/lib/agi/resonanceVersion.ts"
              ]
            };
          }
        }
      ]
    : [])
];

// Merge HELIX_PANELS without duplicating ids that already exist in BASE_PANELS.
const existingIds = new Set(BASE_PANELS.map((p: PanelDefinition) => p.id));
const mergedHelix = HELIX_PANELS.filter((p: HelixPanelRef) => !existingIds.has(p.id));

export const panelRegistry: PanelDefinition[] = ([...BASE_PANELS, ...mergedHelix] as PanelDefinition[]).map((panel) => ({
  ...panel,
  workstationCapabilities: panel.workstationCapabilities ?? getWorkstationPanelCapabilities(panel.id) ?? undefined,
}));

export function getPanelDef(id: PanelDefinition["id"]) {
  return panelRegistry.find((p) => p.id === id);
}
