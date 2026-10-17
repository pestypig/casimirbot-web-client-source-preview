export function normalizePanelQuery(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type WorkstationPanelAlias<PanelId extends string = string> = {
  id: PanelId;
  aliases: readonly string[];
};

export type WorkstationPanelSummary<PanelId extends string = string> = {
  id: PanelId;
  title: string;
  keywords?: readonly string[] | null;
};

export type WorkstationPanelResolverConfig<PanelId extends string = string> = {
  panels: readonly WorkstationPanelSummary<PanelId>[];
  hasPanel: (panelId: PanelId) => boolean;
  aliases?: readonly WorkstationPanelAlias<PanelId>[];
};

const NHM2_VIEWER_ALIASES = ["warp bubble", "warp viewer", "alcubierre", "warp visualizer", "metric tensor", "bubble hull"] as const;

export const HELIX_WORKSTATION_PANEL_ALIASES = [
  { id: "helix-noise-gens", aliases: ["noise gens", "noise generators", "noise generator"] },
  { id: "nhm2-solve-state", aliases: NHM2_VIEWER_ALIASES },
  { id: "operational-mode", aliases: ["live energy", "energy pipeline", "pipeline", "pipeline controls", "helix core", "core"] },
  { id: "nhm2-solve-state", aliases: ["nhm2 solve", "nhm2 solve state"] },
  { id: "docs-viewer", aliases: ["docs", "documentation", "papers"] },
  { id: "resonance-orchestra", aliases: ["resonance", "resonance orchestra"] },
  {
    id: "workstation-workflow-timeline",
    aliases: ["workflow timeline", "tool trace", "helix trace", "helix timeline", "conversation panel"],
  },
  { id: "agi-essence-console", aliases: ["essence console", "legacy essence console"] },
] as const satisfies readonly WorkstationPanelAlias[];

export function isNhm2ViewerAlias(value: string): boolean {
  const normalized = normalizePanelQuery(value);
  return NHM2_VIEWER_ALIASES.some((alias) => normalized.includes(alias));
}

export function resolvePanelIdFromText<PanelId extends string = string>(
  value: string,
  config: WorkstationPanelResolverConfig<PanelId>,
): PanelId | null {
  const normalized = normalizePanelQuery(value);
  if (!normalized) return null;
  const aliases =
    config.aliases ??
    (HELIX_WORKSTATION_PANEL_ALIASES as readonly WorkstationPanelAlias<PanelId>[]);
  for (const entry of aliases) {
    if (!config.hasPanel(entry.id)) continue;
    if (entry.aliases.some((alias) => normalized.includes(alias))) {
      return entry.id;
    }
  }
  const tokens = normalized.split(/\s+/).filter(Boolean);
  let bestId: PanelId | null = null;
  let bestScore = 0;
  for (const panel of config.panels) {
    if (!config.hasPanel(panel.id)) continue;
    const haystack = `${panel.title} ${panel.id} ${(panel.keywords ?? []).join(" ")}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = panel.id;
    }
  }
  return bestScore > 0 ? bestId : null;
}

export function resolvePanelIdFromPath<PanelId extends string = string>(
  value: string,
  config: Pick<WorkstationPanelResolverConfig<PanelId>, "hasPanel"> & {
    docsPanelId: PanelId;
  },
): PanelId | null {
  const normalized = value.replace(/\\/g, "/").toLowerCase();
  if ((/(^|\/)docs\//i.test(normalized) || /\.md$/i.test(normalized)) && config.hasPanel(config.docsPanelId)) {
    return config.docsPanelId;
  }
  return null;
}

export function parseOpenPanelCommand<PanelId extends string = string>(
  value: string,
  config: WorkstationPanelResolverConfig<PanelId>,
): PanelId | null {
  const match = value.trim().match(/^(?:\/open|open|show|launch)\s+(.+)/i);
  if (!match) return null;
  const raw = match[1].replace(/^(the|panel|window)\s+/i, "").trim();
  const lowerRaw = raw.toLowerCase();
  const conversationalDocIntent =
    /\b(?:doc|docs|documentation|paper|report|publication|research)\b/.test(lowerRaw) &&
    /\b(?:about|for|on|regarding)\b/.test(lowerRaw);
  const readAloudIntent = /\b(?:read|aloud|out loud|speak|narrate|voice)\b/.test(lowerRaw);
  if (conversationalDocIntent || readAloudIntent) return null;
  return resolvePanelIdFromText(raw, config);
}

export function restateWorkstationSubgoal(value: string): string {
  const cleaned = value
    .trim()
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/^question\s*:\s*/i, "")
    .replace(/^(?:hey|hi)\s+(?:helix|dottie)\s*,?\s*/i, "")
    .replace(/^(?:can|could|would)\s+you\s+/i, "")
    .replace(/^please\s+/i, "")
    .trim();
  const summarizeOrExplainIntent =
    /\b(?:summari[sz]e|summary|tldr|tl;dr|explain|break\s+down|walk\s+me\s+through|what\s+does)\b/i.test(
      cleaned,
    );
  if (summarizeOrExplainIntent) {
    return cleaned;
  }
  const paperReadTopic =
    cleaned.match(
      /\b(?:read|open|show|find|search|look|pick|bring|pull)\b[\s\S]*?\b(?:paper|papers|research|publication|report|doc|document)\b[\s\S]*?\b(?:about|on|for|regarding)\s+(.+?)(?:[.?!]|$)/i,
    )?.[1]?.trim() ??
    cleaned.match(/\b(?:paper|papers|doc|document)\s+(?:about|on|for|regarding)\s+(.+?)(?:[.?!]|$)/i)?.[1]?.trim();

  if (paperReadTopic) {
    return `find a paper about ${paperReadTopic} and open it and read it to me`;
  }
  return cleaned;
}

export function normalizeWorkstationCommandText(value: string): string {
  const normalizedQuotes = value.replace(/[“”]/g, "\"").replace(/[‘’]/g, "'");
  const collapsedWhitespace = normalizedQuotes.replace(/\s+/g, " ").trim();
  if (!collapsedWhitespace) return "";
  return collapsedWhitespace
    .replace(/\boutloud\b/gi, "out loud")
    .replace(/\b(?:pull|bring)\s+up\b/gi, "open")
    .replace(/\bpop\s+open\b/gi, "open")
    .replace(/\bopen\s+up\b/gi, "open")
    .replace(/\bjump\s+(?:over\s+)?to\b/gi, "go to")
    .replace(/\bread\s+(this|current)\s+to\s+me\b/gi, (_match, referent: string) => {
      return `read ${referent.toLowerCase()} doc to me`;
    })
    .replace(/\bread\s+(this|current)\s+(?:aloud|out\s+loud)\b/gi, (_match, referent: string) => {
      return `read ${referent.toLowerCase()} doc to me`;
    })
    .replace(/\bnarrate\s+(this|current)\s+to\s+me\b/gi, (_match, referent: string) => {
      return `read ${referent.toLowerCase()} doc to me`;
    })
    .replace(/\bnarrate\s+(this|current)\s+(?:aloud|out\s+loud)\b/gi, (_match, referent: string) => {
      return `read ${referent.toLowerCase()} doc to me`;
    })
    .replace(/\b(this|current)\s+file\b/gi, (_match, referent: string) => {
      return `${referent.toLowerCase()} doc`;
    })
    .replace(/\bnote\s*pad\b/gi, "note")
    .replace(/\bnotepad\b/gi, "note")
    .replace(/\bclip\s*board\b/gi, "clipboard")
    .replace(/\bcopy\s+that\s+to\s+clipboard\b/gi, "copy this to clipboard")
    .replace(/\bcopy\s+it\s+to\s+clipboard\b/gi, "copy this to clipboard")
    .replace(/\bappend\s+that\s+to\s+my\s+note\b/gi, "append this to my note")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLexiconAlias(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bopen\s+up\b/g, "open")
    .replace(
      /^(?:ok|okay|please|pls|can\s+you|could\s+you|would\s+you|will\s+you|let'?s|kindly)\b[\s,.-]*/g,
      "",
    )
    .replace(/\b(?:the|my)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type WorkstationNoteCreateLexiconArgs = {
  title?: string;
  topic?: string;
  body?: string;
};

export function parseWorkstationNoteCreateLexiconArgs(input: {
  source: string;
  conversationalCandidate: string;
}): WorkstationNoteCreateLexiconArgs | null {
  const bodyMatch = input.source.match(/\b(?:create|make)\s+(?:a\s+)?note\s+(?:for\s+me\s+)?["'](.+?)["']\s*$/i);
  if (bodyMatch?.[1]?.trim()) return { body: bodyMatch[1].trim() };
  const title =
    input.conversationalCandidate.match(/\bcreate\s+(?:a\s+)?note\s+(?:called|named|titled)\s+(.+)$/i)?.[1] ??
    input.conversationalCandidate.match(/\bnew\s+note\s+(.+)$/i)?.[1] ??
    input.conversationalCandidate.match(/\bstart\s+note\s+(?:about|on|for)\s+(.+)$/i)?.[1];
  const normalizedTitle = title?.replace(/[?.!]+$/g, "").trim();
  return normalizedTitle ? { title: normalizedTitle, topic: normalizedTitle } : null;
}
