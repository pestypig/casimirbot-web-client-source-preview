import type { LumaMood } from "@/lib/luma-moods";
import type {
  WorkstationProcessEdge,
  WorkstationProcessGraphState,
  WorkstationProcessNode,
  WorkstationProcessNodeKind,
} from "./processGraphTypes";
import { escapeSvgText } from "./svgEscape";

type RenderProcessGraphSvgOptions = {
  graph: Pick<WorkstationProcessGraphState, "nodes" | "edges">;
  width?: number;
  height?: number;
  mood?: LumaMood;
  density?: "ambient" | "panel";
  labels?: "hidden" | "minimal" | "full";
  maxNodes?: number;
  maxEdges?: number;
};

const LANE_BY_KIND: Record<WorkstationProcessNodeKind, number> = {
  workspace: 0,
  helix_ask: 1,
  agent: 1,
  tool: 2,
  panel: 2,
  operation: 3,
  job: 3,
  artifact: 4,
  source: 4,
  evidence: 5,
  memory: 5,
  error: 5,
};

const MOOD_ACCENT: Record<LumaMood, { primary: string; secondary: string; wash: string }> = {
  mad: { primary: "#fb7185", secondary: "#f97316", wash: "#2a0711" },
  upset: { primary: "#fbbf24", secondary: "#f97316", wash: "#241306" },
  shock: { primary: "#fde047", secondary: "#facc15", wash: "#241f04" },
  question: { primary: "#7dd3fc", secondary: "#38bdf8", wash: "#061627" },
  happy: { primary: "#6ee7b7", secondary: "#34d399", wash: "#061c14" },
  friend: { primary: "#5eead4", secondary: "#22d3ee", wash: "#04191c" },
  love: { primary: "#f9a8d4", secondary: "#fb7185", wash: "#250719" },
};

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return Math.abs(result);
}

function statusStroke(status: string, accent: string): string {
  switch (status) {
    case "failed":
      return "#fb7185";
    case "verified":
    case "completed":
      return "#86efac";
    case "running":
    case "active":
      return accent;
    case "pending":
      return "#fde68a";
    default:
      return "rgba(148, 163, 184, 0.72)";
  }
}

function nodeShape(node: WorkstationProcessNode, x: number, y: number, r: number, fill: string, stroke: string, opacity: number): string {
  if (node.kind === "operation") {
    return `<polygon points="${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}" fill="${fill}" stroke="${stroke}" stroke-width="2" opacity="${opacity}"/>`;
  }
  if (node.kind === "job" || node.kind === "agent") {
    const points = Array.from({ length: 6 }, (_, idx) => {
      const angle = (Math.PI / 3) * idx - Math.PI / 6;
      return `${(x + Math.cos(angle) * r).toFixed(1)},${(y + Math.sin(angle) * r).toFixed(1)}`;
    }).join(" ");
    return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="2" opacity="${opacity}"/>`;
  }
  if (node.kind === "source") {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2" opacity="${opacity}"/>`;
  }
  const w = node.kind === "artifact" || node.kind === "panel" ? r * 2.8 : r * 2.2;
  const h = r * 1.55;
  const dash = node.status === "pending" ? ` stroke-dasharray="5 5"` : "";
  return `<rect x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="2"${dash} opacity="${opacity}"/>`;
}

export function renderWorkstationProcessGraphSvg(options: RenderProcessGraphSvgOptions): string {
  const width = options.width ?? 1600;
  const height = options.height ?? 900;
  const density = options.density ?? "ambient";
  const labels = options.labels ?? (density === "ambient" ? "minimal" : "full");
  const maxNodes = Math.min(options.maxNodes ?? (density === "ambient" ? 18 : 220), density === "ambient" ? 18 : 240);
  const maxEdges = Math.min(options.maxEdges ?? (density === "ambient" ? 28 : 420), density === "ambient" ? 28 : 420);
  const mood = options.mood ?? "question";
  const accent = MOOD_ACCENT[mood] ?? MOOD_ACCENT.question;

  const nodes = Object.values(options.graph.nodes)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, maxNodes);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Object.values(options.graph.edges)
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .slice(-maxEdges);

  const laneWidth = width / 6;
  const positioned = new Map<string, { node: WorkstationProcessNode; x: number; y: number; z: number; r: number; opacity: number }>();
  const newest = Math.max(...nodes.map((node) => Date.parse(node.updatedAt) || 0), Date.now());
  nodes.forEach((node) => {
    const lane = LANE_BY_KIND[node.kind] ?? 3;
    const ageMs = Math.max(0, newest - (Date.parse(node.updatedAt) || newest));
    const recency = Math.max(0, 1 - ageMs / (1000 * 60 * 20));
    const activeBoost = node.status === "active" || node.status === "running" || node.status === "pending" ? 1 : 0;
    const z = Math.min(1, recency * 0.75 + activeBoost * 0.35);
    const x = laneWidth * (lane + 0.5) + ((hash(node.id) % 61) - 30);
    const y = 90 + (hash(`${node.id}:y`) % Math.max(1, height - 180));
    const r = density === "ambient" ? 14 + z * 10 : 18 + z * 12;
    const opacity = density === "ambient" ? 0.2 + z * 0.5 : 0.55 + z * 0.35;
    positioned.set(node.id, { node, x, y, z, r, opacity });
  });

  const edgeSvg = edges
    .map((edge: WorkstationProcessEdge) => {
      const from = positioned.get(edge.from);
      const to = positioned.get(edge.to);
      if (!from || !to) return "";
      const stroke = statusStroke(edge.status, accent.secondary);
      const opacity = density === "ambient" ? 0.16 + Math.max(from.z, to.z) * 0.42 : 0.35 + Math.max(from.z, to.z) * 0.4;
      const dash = edge.status === "pending" ? ` stroke-dasharray="8 8"` : "";
      const pulse = edge.status === "running" || edge.status === "active" ? `<animate attributeName="stroke-opacity" values="${opacity};${Math.min(0.95, opacity + 0.25)};${opacity}" dur="2.8s" repeatCount="indefinite"/>` : "";
      const midX = (from.x + to.x) / 2;
      const controlLift = (hash(edge.id) % 90) - 45;
      return `<path d="M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${midX.toFixed(1)} ${(Math.min(from.y, to.y) - 55 + controlLift).toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${(1.2 + Math.max(from.z, to.z) * 2.6).toFixed(1)}" stroke-opacity="${opacity.toFixed(2)}"${dash}>${pulse}</path>`;
    })
    .join("");

  const nodeSvg = [...positioned.values()]
    .sort((a, b) => a.z - b.z)
    .map(({ node, x, y, z, r, opacity }) => {
      const stroke = statusStroke(node.status, accent.primary);
      const fill = node.kind === "artifact" ? "rgba(15, 23, 42, 0.72)" : `${accent.wash}`;
      const blur = density === "ambient" && z < 0.35 ? ` filter="url(#softBlur)"` : "";
      const label =
        labels === "hidden"
          ? ""
          : `<text x="${x.toFixed(1)}" y="${(y + r + 14).toFixed(1)}" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui" font-size="${density === "ambient" ? 11 : 13}" fill="${accent.primary}" fill-opacity="${density === "ambient" ? 0.42 : 0.9}">${escapeSvgText(labels === "minimal" ? node.kind.replace("_", " ") : node.label.slice(0, 34))}</text>`;
      const statusMark = node.status === "failed"
        ? `<path d="M ${(x + r * 0.6).toFixed(1)} ${(y - r * 0.65).toFixed(1)} l 9 0 l -4.5 8 z" fill="#fb7185" opacity="0.9"/>`
        : node.status === "completed" || node.status === "verified"
          ? `<path d="M ${(x + r * 0.45).toFixed(1)} ${(y - r * 0.25).toFixed(1)} l 5 5 l 10 -12" fill="none" stroke="#86efac" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`
          : "";
      return `<g${blur}>${nodeShape(node, x, y, r, fill, stroke, opacity)}${statusMark}${label}</g>`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice">`,
    "<defs>",
    '<filter id="softBlur"><feGaussianBlur stdDeviation="1.4"/></filter>',
    `<radialGradient id="graphGlow" cx="50%" cy="50%" r="65%"><stop offset="0%" stop-color="${accent.primary}" stop-opacity="0.08"/><stop offset="70%" stop-color="${accent.secondary}" stop-opacity="0.03"/><stop offset="100%" stop-color="${accent.wash}" stop-opacity="0"/></radialGradient>`,
    "</defs>",
    `<rect width="${width}" height="${height}" fill="url(#graphGlow)"/>`,
    `<g>${edgeSvg}</g>`,
    `<g>${nodeSvg}</g>`,
    "</svg>",
  ].join("");
}
