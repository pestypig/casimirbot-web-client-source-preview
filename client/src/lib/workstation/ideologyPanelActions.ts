import {
  HELIX_IDEOLOGY_CONTEXT_RECEIPT_SCHEMA,
  HELIX_IDEOLOGY_MOTIVE_COMPARISON_RECEIPT_SCHEMA,
  type IdeologyContextReceipt,
  type IdeologyFramework,
  type IdeologyGuidanceSummary,
  type IdeologyMotiveComparisonReceipt,
  type IdeologyNodeSummary,
} from "@shared/helix-ideology-workstation";
import type { IdeologyDoc, IdeologyGuidanceResponse, IdeologyNode } from "@/lib/ideology-types";
import type {
  HelixPanelActionExecutionContext,
  HelixPanelActionExecutionResult,
  HelixPanelActionRequest,
} from "@/lib/workstation/panelActionAdapters";

const PANEL_ID = "mission-ethos" as const;
const DEFAULT_NODE_IDS = [
  "mission-ethos",
  "beginners-mind",
  "right-speech-infrastructure",
  "three-tenets-loop",
  "capture-resistance",
  "interbeing-systems",
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter((entry): entry is string => Boolean(entry));
  }
  const single = asString(value);
  return single ? [single] : [];
}

function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(25, Math.floor(parsed)) : fallback;
}

async function loadIdeologyDoc(): Promise<IdeologyDoc> {
  const response = await fetch("/api/ethos/ideology", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Ideology registry request failed (${response.status}).`);
  const data = await response.json();
  if (!data || !Array.isArray(data.nodes)) throw new Error("Ideology registry response is missing nodes.");
  return data as IdeologyDoc;
}

function buildNodeMaps(doc: IdeologyDoc): {
  byId: Map<string, IdeologyNode>;
  bySlug: Map<string, IdeologyNode>;
  parentOf: Map<string, string | null>;
} {
  const byId = new Map<string, IdeologyNode>();
  const bySlug = new Map<string, IdeologyNode>();
  const parentOf = new Map<string, string | null>([[doc.rootId, null]]);
  for (const node of doc.nodes) {
    byId.set(node.id, node);
    if (node.slug) bySlug.set(node.slug, node);
  }
  for (const node of doc.nodes) {
    for (const child of node.children ?? []) {
      parentOf.set(child, node.id);
    }
  }
  return { byId, bySlug, parentOf };
}

function resolveNode(doc: IdeologyDoc, idOrSlug: string | null | undefined): IdeologyNode | null {
  if (!idOrSlug) return null;
  const maps = buildNodeMaps(doc);
  return maps.byId.get(idOrSlug) ?? maps.bySlug.get(idOrSlug) ?? null;
}

function nodePath(node: IdeologyNode, doc: IdeologyDoc): string[] {
  const maps = buildNodeMaps(doc);
  const path: string[] = [];
  let cursor: IdeologyNode | null = node;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.unshift(cursor.title);
    const parentId = maps.parentOf.get(cursor.id);
    cursor = parentId ? maps.byId.get(parentId) ?? null : null;
  }
  return path;
}

function summarizeNode(node: IdeologyNode, doc: IdeologyDoc): IdeologyNodeSummary {
  return {
    node_id: node.id,
    slug: node.slug ?? null,
    title: node.title,
    excerpt: node.excerpt ?? null,
    tags: node.tags ?? [],
    path: nodePath(node, doc),
    evidence_refs: [`ideology:${node.id}`, `docs/ethos/ideology.json#${node.id}`],
  };
}

function searchNodes(doc: IdeologyDoc, query: string, limit: number): IdeologyNodeSummary[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = doc.nodes
    .map((node) => {
      const haystack = [
        node.id,
        node.slug,
        node.title,
        node.excerpt,
        node.bodyMD,
        ...(node.tags ?? []),
      ].filter(Boolean).join(" ").toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { node, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title));
  return scored.slice(0, limit).map((entry) => summarizeNode(entry.node, doc));
}

function inferPressureSignals(text: string): string[] {
  const lower = text.toLowerCase();
  const signals: string[] = [];
  const hasAny = (terms: string[]) => terms.some((term) => lower.includes(term));
  if (hasAny(["now", "urgent", "immediately", "limited time", "hurry", "asap"])) signals.push("urgency_scarcity");
  if (hasAny(["secret", "private", "don't tell", "do not tell", "hide", "between us"])) signals.push("isolation_secrecy");
  if (hasAny(["pay", "money", "investment", "wire", "crypto", "profit", "refund", "fee"])) signals.push("financial_ask");
  if (hasAny(["expert", "authority", "official", "doctor", "professor", "leader", "boss"])) signals.push("authority_claim");
  if (hasAny(["trust me", "special", "chosen", "only you", "you are smart", "flatter"])) signals.push("flattery_grooming");
  return signals;
}

async function loadGuidance(activePressures: string[]): Promise<IdeologyGuidanceSummary | null> {
  if (activePressures.length === 0) return null;
  try {
    const response = await fetch("/api/ethos/ideology/guidance", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ activePressures, topK: 5 }),
    });
    if (!response.ok) return null;
    const data = await response.json() as IdeologyGuidanceResponse;
    return {
      invariant: data.invariant,
      detectedBundles: data.detectedBundles ?? [],
      recommendedNodeIds: data.recommendedNodeIds ?? [],
      warnings: data.warnings ?? [],
      recommendedArtifacts: data.recommendedArtifacts ?? [],
      suggestedVerificationSteps: data.suggestedVerificationSteps ?? [],
    };
  } catch {
    return null;
  }
}

function dispatchOpenNode(nodeId: string | null): void {
  if (!nodeId || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("helix-ideology-open-node", { detail: { node_id: nodeId } }));
}

function contextResult(
  action: IdeologyContextReceipt["action"],
  receipt: IdeologyContextReceipt,
  message: string,
): HelixPanelActionExecutionResult {
  return {
    ok: receipt.ok,
    panel_id: PANEL_ID,
    action_id: action,
    artifact: {
      kind: "ideology_context_receipt",
      ...receipt,
    } as unknown as Record<string, unknown>,
    message,
  };
}

function comparisonResult(receipt: IdeologyMotiveComparisonReceipt): HelixPanelActionExecutionResult {
  return {
    ok: receipt.ok,
    panel_id: PANEL_ID,
    action_id: "compare_motive_to_zen",
    artifact: {
      kind: "ideology_motive_comparison_receipt",
      ...receipt,
    } as unknown as Record<string, unknown>,
    message: receipt.ok
      ? `Prepared ${receipt.nodes.length} ideology node(s) for motive comparison.`
      : receipt.error ?? "Could not prepare ideology motive comparison.",
  };
}

function buildComparisonPrompt(args: {
  framework: IdeologyFramework;
  nodes: IdeologyNodeSummary[];
  pressureSignals: string[];
}): string {
  const nodeList = args.nodes.map((node) => `${node.node_id}: ${node.title}`).join("; ");
  const pressures = args.pressureSignals.length ? args.pressureSignals.join(", ") : "none detected";
  return [
    `Compare the user's motive against the ${args.framework} framework using only these compact ideology nodes: ${nodeList}.`,
    `Treat the framework as advisory evidence, not action authority. User decides.`,
    `Discuss alignment, tensions, missing context, and verification questions. Pressure signals: ${pressures}.`,
    `Do not quote or inject the raw ideology tree; cite node ids from the receipt.`,
  ].join(" ");
}

export async function executeIdeologyPanelAction(
  request: HelixPanelActionRequest,
  context: HelixPanelActionExecutionContext,
): Promise<HelixPanelActionExecutionResult> {
  const actionId = request.action_id;
  const args = asRecord(request.args);
  context.openPanel(PANEL_ID);
  context.focusPanel(PANEL_ID);

  if (actionId === "open") {
    return { ok: true, panel_id: PANEL_ID, action_id: actionId, message: "Opened Ideology & Moral." };
  }

  try {
    const doc = await loadIdeologyDoc();
    const evidence = ["ideology:registry", "docs/ethos/ideology.json"];
    const nodeId = asString(args.node_id) ?? asString(args.slug);
    const query = asString(args.query);
    const limit = asPositiveInt(args.limit, 6);

    if (actionId === "open_node") {
      const selectedNode = resolveNode(doc, nodeId ?? doc.rootId);
      const selected = selectedNode ? summarizeNode(selectedNode, doc) : null;
      dispatchOpenNode(selected?.node_id ?? null);
      return contextResult("open_node", {
        schema: HELIX_IDEOLOGY_CONTEXT_RECEIPT_SCHEMA,
        ok: Boolean(selected),
        action: "open_node",
        panel_id: PANEL_ID,
        node_id: nodeId ?? doc.rootId,
        query: null,
        matches: selected ? [selected] : [],
        selected,
        context_policy: "compact_context_only",
        raw_tree_included: false,
        deterministic_content_role: "observation_not_assistant_answer",
        evidence_refs: selected?.evidence_refs ?? evidence,
        error: selected ? null : `No ideology node matched ${nodeId ?? doc.rootId}.`,
      }, selected ? `Opened ideology node ${selected.title}.` : "Ideology node not found.");
    }

    if (actionId === "search_nodes") {
      const searchQuery = query ?? "";
      const matches = searchQuery ? searchNodes(doc, searchQuery, limit) : [];
      return contextResult("search_nodes", {
        schema: HELIX_IDEOLOGY_CONTEXT_RECEIPT_SCHEMA,
        ok: searchQuery.length > 0,
        action: "search_nodes",
        panel_id: PANEL_ID,
        node_id: null,
        query: searchQuery,
        matches,
        selected: matches[0] ?? null,
        context_policy: "compact_context_only",
        raw_tree_included: false,
        deterministic_content_role: "observation_not_assistant_answer",
        evidence_refs: [...evidence, ...matches.flatMap((match) => match.evidence_refs)],
        error: searchQuery ? null : "A query is required to search ideology nodes.",
      }, `Found ${matches.length} ideology node(s).`);
    }

    if (actionId === "build_context") {
      const selectedNode = resolveNode(doc, nodeId ?? undefined);
      const selected = selectedNode ? summarizeNode(selectedNode, doc) : null;
      const matches = selected
        ? [selected]
        : query
          ? searchNodes(doc, query, limit)
          : DEFAULT_NODE_IDS.map((id) => resolveNode(doc, id)).filter((node): node is IdeologyNode => Boolean(node)).map((node) => summarizeNode(node, doc));
      dispatchOpenNode((selected ?? matches[0])?.node_id ?? null);
      return contextResult("build_context", {
        schema: HELIX_IDEOLOGY_CONTEXT_RECEIPT_SCHEMA,
        ok: matches.length > 0,
        action: "build_context",
        panel_id: PANEL_ID,
        node_id: selected?.node_id ?? null,
        query: query ?? null,
        matches,
        selected: selected ?? matches[0] ?? null,
        context_policy: "compact_context_only",
        raw_tree_included: false,
        deterministic_content_role: "observation_not_assistant_answer",
        evidence_refs: [...evidence, ...matches.flatMap((match) => match.evidence_refs)],
        error: matches.length ? null : "No ideology context nodes matched the request.",
      }, `Built ideology context with ${matches.length} node(s).`);
    }

    if (actionId === "compare_motive_to_zen") {
      const motive = asString(args.motive) ?? "";
      const framework = (asString(args.framework) ?? "moral") as IdeologyFramework;
      const pressureSignals = [...new Set([...asStringArray(args.active_pressures), ...inferPressureSignals(motive)])];
      const explicitNodes = asStringArray(args.node_ids)
        .map((id) => resolveNode(doc, id))
        .filter((node): node is IdeologyNode => Boolean(node));
      const queryNodes = query ? searchNodes(doc, query, limit).map((summary) => resolveNode(doc, summary.node_id)).filter((node): node is IdeologyNode => Boolean(node)) : [];
      const fallbackNodes = DEFAULT_NODE_IDS
        .map((id) => resolveNode(doc, id))
        .filter((node): node is IdeologyNode => Boolean(node));
      const nodes = (explicitNodes.length ? explicitNodes : queryNodes.length ? queryNodes : fallbackNodes)
        .slice(0, limit)
        .map((node) => summarizeNode(node, doc));
      const guidance = await loadGuidance(pressureSignals);
      dispatchOpenNode(nodes[0]?.node_id ?? null);
      return comparisonResult({
        schema: HELIX_IDEOLOGY_MOTIVE_COMPARISON_RECEIPT_SCHEMA,
        ok: motive.length > 0 && nodes.length > 0,
        panel_id: PANEL_ID,
        motive_text: motive,
        framework,
        selected_node_ids: nodes.map((node) => node.node_id),
        nodes,
        pressure_signals: pressureSignals,
        guidance,
        comparison_prompt: buildComparisonPrompt({ framework, nodes, pressureSignals }),
        boundary: {
          advisory_only: true,
          user_decides: true,
          not_action_authority: true,
        },
        context_policy: "compact_context_only",
        raw_tree_included: false,
        deterministic_content_role: "observation_not_assistant_answer",
        model_invoked: false,
        evidence_refs: [...evidence, ...nodes.flatMap((node) => node.evidence_refs)],
        error: motive ? null : "A motive is required for ideology comparison.",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      panel_id: PANEL_ID,
      action_id: actionId,
      message,
      artifact: {
        kind: actionId === "compare_motive_to_zen" ? "ideology_motive_comparison_receipt" : "ideology_context_receipt",
        ok: false,
        panel_id: PANEL_ID,
        error: message,
        context_policy: "compact_context_only",
        raw_tree_included: false,
        deterministic_content_role: "observation_not_assistant_answer",
      },
    };
  }

  return {
    ok: false,
    panel_id: PANEL_ID,
    action_id: actionId,
    message: `Unsupported ideology action: ${actionId}.`,
  };
}
