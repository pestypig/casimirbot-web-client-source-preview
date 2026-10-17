import type { LumaMood } from "./luma-moods";

type PanelWhisper = {
  text: string;
  node: string;
  mood?: LumaMood | null;
  tags?: string[];
};

const PANEL_IDEOLOGY_MAP: Record<string, PanelWhisper> = {
  // Mission / ethos roots
  "mission-ethos": {
    node: "mission-ethos",
    text: "Mission Ethos: steer physics with compassion; every panel is a vow.",
    mood: "friend",
  },
  "mission-ethos-source": {
    node: "mission-ethos",
    text: "Source essay: return to the vow before you tune the drive.",
    mood: "question",
  },
  "conformity-launch-rail": {
    node: "conformity-launch-rail",
    text: "Conformity Launch Rail: use the stable norms as rails, not destinations.",
    mood: "friend",
  },

  // Stewardship / craft
  "helix-core": {
    node: "bodhisattva-craft",
    text: "Helix Core: bodhisattva craft—hold duty, TS, and curvature as moral ledgers.",
    mood: "friend",
  },
  "helix-observables": {
    node: "stewardship-ledger",
    text: "Observables: listen to the vessel; let the metrics confess the truth.",
    mood: "question",
  },

  // Beginner's mind / inner spark
  "helix-noise-gens": {
    node: "beginners-mind",
    text: "Noise Generators: beginner’s mind—clean spectra, clean intent.",
    mood: "happy",
  },
  "helix-luma": {
    node: "inner-spark",
    text: "Luma Lab: inner spark—let play and curiosity steer the signal.",
    mood: "love",
  },

  // Integrity / worldview
  "rag-admin": {
    node: "worldview-integrity",
    text: "RAG Admin: worldview integrity—curate sources so the chorus stays honest.",
    mood: "question",
  },
  "rag-ingest": {
    node: "worldview-integrity",
    text: "RAG Ingest: feed the corpus with care; integrity precedes inference.",
    mood: "question",
  },
  "code-admin": {
    node: "worldview-integrity",
    text: "Code Admin: worldview integrity—trust begins with traceable code paths.",
    mood: "question",
  },
  "docs-viewer": {
    node: "beginners-mind",
    text: "Docs & Papers: beginner’s mind—read, revise, and keep the vow aligned.",
    mood: "question",
  },

  // Navigation / cohorts
  "star-coherence": {
    node: "devotion-course",
    text: "Star Coherence: devotion course—hold formation so the convoy learns together.",
    mood: "friend",
  },
  "endpoints": {
    node: "integrity-protocols",
    text: "Endpoints: integrity protocols—map the interfaces before you trust the flow.",
    mood: "question",
  },

  // Builders / tiles
  "casimir-tiles": {
    node: "inner-spark",
    text: "Casimir Tiles: inner spark—small experiments, big insights.",
    mood: "happy",
  },

  // Docs & ideology panels already covered; taskbar/control panels
  "taskbar": {
    node: "mission-ethos",
    text: "Taskbar: anchor your workspace; keep the vow visible.",
    mood: "friend",
  },
  "fashion-route": {
    node: "values-over-images",
    text: "Style is a language; keep consent and integrity visible while creating looks.",
    mood: "friend",
    tags: ["fashion", "integrity"],
  },
  "vanity-protocol": {
    node: "vanity-as-medium",
    text: "Use surface, anchor vow: style can signal context, but verification decides action.",
    mood: "question",
    tags: ["vanity", "protocol"],
  },
};

export function resolvePanelIdeologyWhisper(panelId: string | undefined, title?: string) {
  if (!panelId) return null;
  const key = panelId.toLowerCase();
  const entry = PANEL_IDEOLOGY_MAP[key];
  if (!entry) return null;
  const tags = ["panel", panelId, `ideology:${entry.node}`];
  if (entry.tags?.length) {
    tags.push(...entry.tags);
  }
  return {
    text: entry.text || `Opening ${title ?? panelId}`,
    tags,
    mood: entry.mood ?? null,
  };
}
