import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRightSquare, Plus, Send, Trash2, Wallet } from "lucide-react";
import {
  CHAT_CONTEXT_BUDGET,
  useAgiChatStore,
  type ChatSession,
} from "@/store/useAgiChatStore";
import type { TTelemetrySnapshot } from "@shared/star-telemetry";
import {
  execute,
  deleteChatSession,
  listChatSessions,
  listPersonas,
  memorySearch,
  plan,
  connectDebateStream,
  subscribeToolLogs,
  syncKnowledgeProjects,
  getPanelSnapshots,
  getBadgeTelemetry,
  upsertChatSession,
  type PersonaSummary,
  type MemorySearchResponse,
  type PanelSnapshotResponse,
  type BadgeTelemetryResponse,
  type DebateStreamEvent,
  type ToolLogEvent,
} from "@/lib/agi/api";
import { fetchDebateTelemetryOnce, type DebateTelemetryResponse } from "@/hooks/useDebateTelemetry";
import { isFlagEnabled } from "@/lib/envFlags";
import { buildDefaultCandidates, collapseCandidates, type OrchestratorContext, type RuntimeMode } from "@/lib/agi/orchestrator";
import type { PanelControlAction } from "@/lib/agi/panelControl";
import TraceDrawer from "./TraceDrawer";
import MemoryDrawer from "./MemoryDrawer";
import EvalPanel from "./EvalPanel";
import DebateView from "./DebateView";
import { JobsBudgetModal } from "./JobsBudgetModal";
import { MessageBubble } from "./MessageBubble";
import type { TMemorySearchHit } from "@shared/essence-persona";
import type { KnowledgeProjectExport } from "@shared/knowledge";
import { useKnowledgeProjectsStore } from "@/store/useKnowledgeProjectsStore";
import { isFlagEnabled as flag } from "@/lib/envFlags";
import { useEssenceProfile } from "@/hooks/useEssenceProfile";
import type { EssenceProfile, EssenceProfileUpdate } from "@shared/inferenceProfile";
import type { LocalCallSpec } from "@shared/local-call-spec";
import { fetchLocalCallSpec } from "@/lib/agi/localCallSpec";

const DEFAULT_PERSONA: PersonaSummary = { id: "default", display_name: "Default" };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const sumCounts = (counts?: Record<string, number> | null): number => {
  if (!counts) return 0;
  return Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);
};
const KNOWLEDGE_ATTACHMENTS_ENABLED = isFlagEnabled("ENABLE_KNOWLEDGE_PROJECTS", true);
const INFERENCE_PANEL_ENABLED = isFlagEnabled("ENABLE_INFERENCE_PANEL", true);
const CHAT_SYNC_ENABLED = isFlagEnabled("ENABLE_AGI_CHAT_SYNC", true);
const DEBATE_LAST_ID_KEY = "debate:last-id";

const COHERENCE_HIGH_THRESHOLD = 0.7;
const COHERENCE_LOW_THRESHOLD = 0.35;
const DISPERSION_HIGH_THRESHOLD = 0.55;
const DISPERSION_LOW_THRESHOLD = 0.3;
const COHERENCE_COLLAPSE_SOFT_LIMIT = 2000;

type TaskStatus = {
  text: string;
  tone: "info" | "success" | "error";
  startedAt: number;
};

type ActivitySource = "status" | "plan" | "tool" | "result" | "hint";

type ActivityEntry = {
  id: string;
  text: string;
  tone: TaskStatus["tone"];
  ts: number;
  source: ActivitySource;
};

export default function EssenceConsole() {
  const {
    sessions,
    activeId,
    newSession,
    setActive,
    addMessage,
    setPersona,
    totals,
    clearSession,
    deleteSession,
    mergeSessions,
  } = useAgiChatStore();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [traceId, setTraceId] = useState<string | undefined>();
  const [showTrace, setShowTrace] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showDebate, setShowDebate] = useState(false);
  const [showJobs, setShowJobs] = useState(false);
  const [showPanels, setShowPanels] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [personas, setPersonas] = useState<PersonaSummary[]>([DEFAULT_PERSONA]);
  const [personaStatus, setPersonaStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<TMemorySearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [panelSnapshot, setPanelSnapshot] = useState<PanelSnapshotResponse | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [badgeSnapshot, setBadgeSnapshot] = useState<BadgeTelemetryResponse | null>(null);
  const [badgeBusy, setBadgeBusy] = useState(false);
  const [badgeError, setBadgeError] = useState<string | null>(null);
  const [showInferences, setShowInferences] = useState(false);
  const [inferenceStateless, setInferenceStateless] = useState(false);
  const [profileDraft, setProfileDraft] = useState<EssenceProfileUpdate>({});
  const transcriptRef = useRef<HTMLDivElement>(null);
  const syncTimerRef = useRef<number | null>(null);
  const lastSyncKeyRef = useRef<string | null>(null);
  const [hull, setHull] = useState<
    {
      hull_mode: boolean;
      llm_policy: string;
      llm_runtime?: string | null;
      llm_http?: { url: string; allowed: boolean } | null;
      allow_hosts?: string[] | null;
      queue?: {
        backend?: string;
        active?: Record<string, number>;
        pending?: Record<string, number> | null;
      } | null;
      queue_depth?: number | null;
      approvals_outstanding?: number | null;
    } | null
  >(null);
  const [debateId, setDebateId] = useState<string | null>(null);
  const [planHasDebate, setPlanHasDebate] = useState(false);

  const {
    refresh: refreshKnowledgeProjects,
    activeKnowledgeProjects,
    exportKnowledgeContext,
    warnings: knowledgeWarnings,
    baselineEnabled,
    toggleBaseline,
  } = useKnowledgeProjectsStore((state) => ({
    refresh: state.refresh,
    activeKnowledgeProjects: state.projects.filter((project) => state.activeIds.includes(project.id)),
    exportKnowledgeContext: state.exportActiveContext,
    warnings: state.warnings,
    baselineEnabled: state.baselineEnabled,
    toggleBaseline: state.toggleBaseline,
  }));

  const session: ChatSession | undefined = activeId ? sessions[activeId] : undefined;
  const messages = session?.messages ?? [];
  const personaId = session?.personaId ?? DEFAULT_PERSONA.id;

  useEffect(() => {
    if (!CHAT_SYNC_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await listChatSessions({ includeMessages: true });
        if (!cancelled && remote.length > 0) {
          mergeSessions(remote);
        }
      } catch (error) {
        console.warn("[essence] chat session sync failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mergeSessions, CHAT_SYNC_ENABLED]);

  useEffect(() => {
    if (!CHAT_SYNC_ENABLED || !session) return;
    const key = `${session.id}:${session.messages.length}:${session.title}:${session.personaId}`;
    if (lastSyncKeyRef.current === key) return;
    lastSyncKeyRef.current = key;
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      (async () => {
        try {
          const saved = await upsertChatSession(session);
          mergeSessions([saved]);
        } catch (error) {
          console.warn("[essence] chat session save failed", error);
          lastSyncKeyRef.current = null;
        }
      })();
    }, 600);
    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [session, mergeSessions, CHAT_SYNC_ENABLED]);
  const handleDeleteSession = useCallback(
    (id: string) => {
      deleteSession(id);
      if (!CHAT_SYNC_ENABLED) return;
      deleteChatSession(id).catch((error) => {
        console.warn("[essence] chat session delete failed", error);
      });
    },
    [deleteSession, CHAT_SYNC_ENABLED],
  );
  const contextTotals = useMemo(() => (session ? totals(session.id) : { tokens: 0, messages: 0 }), [session, totals]);
  const contextPct = clamp01(contextTotals.tokens / CHAT_CONTEXT_BUDGET);
  const runtimeMode: RuntimeMode = useMemo(() => {
    if (!hull?.hull_mode) return "offline";
    if (hull?.llm_http) return "online";
    return "degraded";
  }, [hull]);
  const queueActive = sumCounts(hull?.queue?.active);
  const queuePending = sumCounts(hull?.queue?.pending);
  const queueDepth =
    typeof hull?.queue_depth === "number"
      ? hull.queue_depth
      : queueActive + queuePending;
  const approvalsOutstanding =
    typeof hull?.approvals_outstanding === "number"
      ? hull.approvals_outstanding
      : null;
  const llmLabel = [hull?.llm_policy, hull?.llm_runtime].filter(Boolean).join("/");
  const llmTitle = hull?.llm_http?.url
    ? `${hull.llm_http.allowed ? "Allowed" : "Blocked"} ${hull.llm_http.url}`
    : undefined;
  const hullTitle =
    hull?.allow_hosts && hull.allow_hosts.length > 0
      ? `Allow: ${hull.allow_hosts.join(", ")}`
      : undefined;
  const queueTitle =
    hull?.queue != null
      ? `Active ${queueActive} / Pending ${queuePending}`
      : undefined;
  const hasQueueData =
    hull?.queue != null || typeof hull?.queue_depth === "number";
  const profileTargetId = personaId || null;
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    update: saveProfile,
    reset: resetProfile,
    saving: profileSaving,
  } = useEssenceProfile(profileTargetId, inferenceStateless);

  useEffect(() => {
    if (!profile) {
      setProfileDraft({});
      return;
    }
    const { essence_id: _id, created_at: _c, updated_at: _u, ...rest } = profile;
    setProfileDraft(rest);
  }, [profile, profileTargetId]);
  const rawInferenceSignals = useMemo(() => {
    const userMessages = messages.filter((m) => m.role === "user");
    const prefersBullets = userMessages.some((m) => m.content.includes("\n-") || m.content.includes("\n* "));
    const prefersCode = userMessages.some((m) => m.content.includes("```") || m.content.includes("{") || m.content.includes(";"));
    const avgLen =
      userMessages.length > 0
        ? userMessages.reduce((sum, m) => sum + m.content.length, 0) / Math.max(1, userMessages.length)
        : 0;
    const detailLevel = avgLen > 500 ? "long" : avgLen > 200 ? "medium" : "short";
    const toneHint = prefersBullets || prefersCode ? "structured" : "neutral-analytical";
    const recentTasks = userMessages
      .slice(-4)
      .map((m) => m.content.trim())
      .filter(Boolean)
      .map((text) => (text.length > 160 ? `${text.slice(0, 160)}...` : text));
    const frictionNotes = activity.filter((a) => a.tone === "error").map((a) => a.text);
    const rhythmNotes: string[] = [];
    if (planHasDebate) rhythmNotes.push("Debate oversight planned");
    if (hull) {
      rhythmNotes.push(
        `Hull ${hull.hull_mode ? "ON" : "OFF"} | ${hull.llm_policy}${hull.llm_runtime ? `/${hull.llm_runtime}` : ""}`,
      );
    }
    if (activity.length > 0) {
      const planEvents = activity.filter((a) => a.source === "plan").length;
      const toolEvents = activity.filter((a) => a.source === "tool").length;
      rhythmNotes.push(`Recent plan/tool events: ${planEvents}/${toolEvents}`);
    }
    const simplifySignals = userMessages.filter((m) => /short|simplify|smaller|brief/i.test(m.content)).length;
    const sustainability: string[] = [];
    if (simplifySignals > 0) sustainability.push("Prefers compressed plans (simplify/short requests detected).");
    if (frictionNotes.length > 0) sustainability.push(`Friction events: ${frictionNotes.length} (recent errors).`);
    if (sustainability.length === 0) sustainability.push("No friction detected; stay with standard plan size.");
    const tokenCounts = new Map<string, number>();
    userMessages.forEach((m) => {
      m.content
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 5)
        .forEach((w) => tokenCounts.set(w, (tokenCounts.get(w) ?? 0) + 1));
    });
    const longevity = Array.from(tokenCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([w, c]) => `${w} (${c})`);
    return {
      interactionStyle: { prefersBullets, prefersCode, detailLevel, toneHint },
      focusAreas: activeKnowledgeProjects.map((p) => p.name),
      rhythm: rhythmNotes,
      recentTasks: recentTasks.length > 0 ? recentTasks : ["No recent tasks yet."],
      telemetry: {
        tokens: contextTotals.tokens,
        messages: messages.length,
        knowledgeProjects: activeKnowledgeProjects.length,
      },
      sustainability,
      longevity: longevity.length > 0 ? longevity : ["Not enough signal yet."],
      usage: [
        "Used to pick format defaults and plan granularity (bullets/code/detail).",
        "Derived from what you requested; no emotional inference or hidden logging.",
        "Toggle stateless mode to stop showing these signals for this view.",
      ],
    };
  }, [messages, activity, activeKnowledgeProjects, planHasDebate, hull, contextTotals.tokens]);

  const inferenceSignals = useMemo<InferenceSignals>(() => {
    if (inferenceStateless) {
      return {
        interactionStyle: { prefersBullets: false, prefersCode: false, detailLevel: "short", toneHint: "neutral" },
        focusAreas: [],
        rhythm: ["Stateless mode: inferences muted."],
        sustainability: ["Stateless mode: no persistence; defaults fall back to neutral."],
        longevity: ["Stateless mode: not collecting themes."],
        recentTasks: ["Hidden while stateless is on."],
        telemetry: { tokens: 0, messages: 0, knowledgeProjects: 0 },
        usage: ["Stateless mode enabled; turn off to see usage-derived defaults."],
        disabled: true,
      };
    }
    return rawInferenceSignals;
  }, [rawInferenceSignals, inferenceStateless]);

  const handleSaveProfile = useCallback(async () => {
    await saveProfile(profileDraft ?? {});
  }, [profileDraft, saveProfile]);

  const handleResetProfile = useCallback(async () => {
    await resetProfile();
    setProfileDraft({});
  }, [resetProfile]);

  const stageRef = useRef<"idle" | "planning" | "executing">("idle");
  const hintTimers = useRef<number[]>([]);
  const activeTraceRef = useRef<string | undefined>(undefined);
  const seenLogSeq = useRef<Set<number>>(new Set());
  const seenDebateSeq = useRef<Set<number>>(new Set());
  const panelControlTimestamps = useRef<number[]>([]);
  const panelControlHandlerRef = useRef<(action: PanelControlAction) => void>(() => {});

  const clearHintTimers = useCallback(() => {
    if (typeof window === "undefined") return;
    hintTimers.current.forEach((id) => window.clearTimeout(id));
    hintTimers.current = [];
  }, []);

  const applyPanelControlAction = useCallback(
    (action: PanelControlAction) => {
      const now = Date.now();
      panelControlTimestamps.current = panelControlTimestamps.current.filter((ts) => now - ts < 2000);
      if (panelControlTimestamps.current.length >= 2) {
        return;
      }
      panelControlTimestamps.current.push(now);
      switch (action.type) {
        case "OPEN_TRACE":
          setShowTrace(true);
          break;
        case "CLOSE_TRACE":
          setShowTrace(false);
          break;
        case "OPEN_MEMORY":
          setShowMemory(true);
          break;
        case "CLOSE_MEMORY":
          setShowMemory(false);
          break;
        case "OPEN_INFERENCES":
          setShowInferences(true);
          break;
        case "CLOSE_INFERENCES":
          setShowInferences(false);
          break;
        case "TOGGLE_INFERENCES_STATELESS":
          setInferenceStateless(!!action.payload);
          break;
        case "OPEN_BADGES":
          setShowBadges(true);
          break;
        case "CLOSE_BADGES":
          setShowBadges(false);
          break;
        case "OPEN_PANELS":
          setShowPanels(true);
          break;
        case "CLOSE_PANELS":
          setShowPanels(false);
          break;
        case "OPEN_BUDGET":
          setShowJobs(true);
          break;
        case "CLOSE_BUDGET":
          setShowJobs(false);
          break;
        default:
          break;
      }
    },
    [setShowTrace, setShowMemory, setShowInferences, setInferenceStateless, setShowBadges, setShowPanels, setShowJobs],
  );

  useEffect(() => {
    panelControlHandlerRef.current = applyPanelControlAction;
  }, [applyPanelControlAction]);

  useEffect(() => {
    panelControlTimestamps.current = [];
  }, [session?.id]);

  const pushActivity = useCallback(
    (text: string, tone: TaskStatus["tone"] = "info", source: ActivitySource = "status") => {
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const entry: ActivityEntry = { id, text, tone, ts: Date.now(), source };
      setActivity((prev) => {
        const next = [...prev, entry];
        return next.length > 80 ? next.slice(next.length - 80) : next;
      });
    },
    [],
  );

  const updateStatus = useCallback(
    (text: string, tone: TaskStatus["tone"] = "info", source: ActivitySource = "status") => {
      setStatus({ text, tone, startedAt: Date.now() });
      pushActivity(text, tone, source);
    },
    [pushActivity],
  );

  const scheduleHint = useCallback(
    (text: string, delayMs: number, tone: TaskStatus["tone"] = "info") => {
      if (typeof window === "undefined") return;
      const id = window.setTimeout(() => {
        if (busy) {
          updateStatus(text, tone, "hint");
        }
      }, delayMs);
      hintTimers.current.push(id);
    },
    [busy, updateStatus],
  );

  useEffect(() => {
    activeTraceRef.current = traceId;
    seenLogSeq.current = new Set();
    setDebateId(null);
    seenDebateSeq.current = new Set();
    setPlanHasDebate(false);
  }, [traceId]);

  useEffect(() => {
    seenDebateSeq.current = new Set();
  }, [debateId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (debateId) {
        window.localStorage.setItem(DEBATE_LAST_ID_KEY, debateId);
      } else {
        window.localStorage.removeItem(DEBATE_LAST_ID_KEY);
      }
    } catch {
      // ignore storage failures
    }
    window.dispatchEvent(new CustomEvent("essence-debate-id", { detail: { debateId: debateId ?? "" } }));
  }, [debateId]);

  useEffect(() => {
    if (!traceId) {
      return;
    }
    const stop = subscribeToolLogs((event: ToolLogEvent) => {
      if (!event || event.traceId !== activeTraceRef.current) {
        return;
      }
      const seq = typeof event.seq === "number" ? event.seq : null;
      if (seq !== null && seenLogSeq.current.has(seq)) {
        return;
      }
      if (seq !== null) {
        seenLogSeq.current.add(seq);
      }
      if (event.debateId && typeof event.debateId === "string") {
        setDebateId(event.debateId);
      }
      const label =
        typeof event.message === "string" && event.message.trim()
          ? event.message.trim()
          : typeof event.text === "string" && event.text.trim()
            ? event.text.trim()
            : event.stage
              ? event.detail
                ? `${event.stage}: ${event.detail}`
                : event.stage
              : `${event.tool ?? "tool"} ${event.ok === false ? "failed" : "finished"}`;
      pushActivity(label, event.ok === false ? "error" : "info", "tool");
    });
    return stop;
  }, [traceId, pushActivity, setDebateId]);

  useEffect(() => {
    if (!debateId) {
      return;
    }
    const teardown = connectDebateStream(debateId, {
      onEvent: (event: DebateStreamEvent) => {
        if (typeof event.seq === "number") {
          if (seenDebateSeq.current.has(event.seq)) {
            return;
          }
          seenDebateSeq.current.add(event.seq);
        }
        let tone: TaskStatus["tone"] = "info";
        let label = "Debate event";
        if (event.type === "turn") {
          const snippet = (event.turn.text ?? "").replace(/\s+/g, " ").trim();
          const preview = snippet.length > 160 ? `${snippet.slice(0, 160)}...` : snippet || "(no text)";
          label = `Debate ${event.turn.role}: ${preview}`;
        } else if (event.type === "status") {
          label = `Debate status: ${event.status}`;
          if (event.status === "timeout" || event.status === "aborted") {
            tone = "error";
          }
        } else if (event.type === "outcome") {
          const pct = (event.outcome.confidence * 100).toFixed(1);
          label = `Debate outcome: ${event.outcome.verdict} (${pct}%)`;
          tone = "success";
        }
        pushActivity(label, tone, "plan");
      },
      onError: () => {
        pushActivity("Debate stream disconnected.", "error", "status");
      },
    });
    return teardown;
  }, [debateId, planHasDebate, pushActivity]);

  useEffect(() => {
    if (!activeId) {
      const newId = newSession("Ask to do anything");
      setActive(newId);
    }
  }, [activeId, newSession, setActive]);

  useEffect(() => {
    if (!KNOWLEDGE_ATTACHMENTS_ENABLED) {
      return;
    }
    void refreshKnowledgeProjects();
  }, [refreshKnowledgeProjects]);

  useEffect(() => {
    let canceled = false;
    if (!flag("ENABLE_AGI", true)) return;
    fetch("/api/hull/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (canceled || !data) return;
        setHull({
          hull_mode: !!data.hull_mode,
          llm_policy: String(data.llm_policy ?? ""),
          llm_runtime: data.llm_runtime ?? null,
          llm_http: data.llm_http ?? null,
          allow_hosts: Array.isArray(data.allow_hosts) ? data.allow_hosts : null,
          queue: data.queue ?? null,
          queue_depth: typeof data.queue_depth === "number" ? data.queue_depth : null,
          approvals_outstanding:
            typeof data.approvals_outstanding === "number"
              ? data.approvals_outstanding
              : null,
        });
      })
      .catch(() => undefined);
    const t = setInterval(() => {
      fetch("/api/hull/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          setHull({
            hull_mode: !!data.hull_mode,
            llm_policy: String(data.llm_policy ?? ""),
            llm_runtime: data.llm_runtime ?? null,
            llm_http: data.llm_http ?? null,
            allow_hosts: Array.isArray(data.allow_hosts) ? data.allow_hosts : null,
            queue: data.queue ?? null,
            queue_depth:
              typeof data.queue_depth === "number" ? data.queue_depth : null,
            approvals_outstanding:
              typeof data.approvals_outstanding === "number"
                ? data.approvals_outstanding
                : null,
          });
        })
        .catch(() => undefined);
    }, 20000);
    return () => {
      canceled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    if (!isFlagEnabled("ENABLE_PERSONA_UI")) {
      setPersonas([DEFAULT_PERSONA]);
      setPersonaStatus("idle");
      setPersonaError(null);
      return;
    }
    setPersonaStatus("loading");
    listPersonas()
      .then((items) => {
        if (canceled) return;
        const next = Array.isArray(items) && items.length > 0 ? items : [DEFAULT_PERSONA];
        if (!next.some((item) => item.id === DEFAULT_PERSONA.id)) {
          next.unshift(DEFAULT_PERSONA);
        }
        setPersonas(next);
        setPersonaStatus("ready");
      })
      .catch((err) => {
        if (canceled) return;
        const message = err instanceof Error ? err.message : String(err);
        setPersonaError(message || "Unable to load personas");
        setPersonaStatus("error");
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages.length]);

  async function handleSend() {
    if (!session) return;
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setTraceId(undefined);
    setDebateId(null);
    setPlanHasDebate(false);
    seenDebateSeq.current = new Set();
    stageRef.current = "planning";
    clearHintTimers();
    setActivity([]);
    pushActivity(`You: ${text}`, "info", "status");
    addMessage(session.id, { role: "user", content: text });
    try {
      const knowledgeProjectIds = activeKnowledgeProjects.map((project) => project.id);
      let knowledgeContext: KnowledgeProjectExport[] | undefined;
      if (KNOWLEDGE_ATTACHMENTS_ENABLED && exportKnowledgeContext) {
        updateStatus("Preparing knowledge attachments...");
        knowledgeContext = await exportKnowledgeContext();
      }
      updateStatus("Planning (request sent to Essence)...");
      scheduleHint("Still planning... waiting for planner response.", 6000);
      scheduleHint(
        "Planning is taking longer than expected. If this persists, check server logs for /api/agi/plan.",
        12000,
      );
      let inlineKnowledge = knowledgeContext && knowledgeContext.length > 0 ? knowledgeContext : undefined;
      let syncedProjectIds: string[] | undefined;
      if (inlineKnowledge && inlineKnowledge.length > 0) {
        try {
          updateStatus("Syncing knowledge corpus...");
          const syncResult = await syncKnowledgeProjects(inlineKnowledge);
          if (syncResult.synced > 0) {
            inlineKnowledge = undefined;
            syncedProjectIds = syncResult.projectIds;
          } else {
            updateStatus("Knowledge sync unavailable, sending inline context.", "error");
          }
        } catch (syncError) {
          console.warn("[knowledge] sync failed", syncError);
          updateStatus("Knowledge sync failed, sending inline context.", "error");
        } finally {
          updateStatus("Planning (request sent to Essence)...");
        }
      }
      const projectIdsForPlan =
        inlineKnowledge && inlineKnowledge.length > 0
          ? undefined
          : syncedProjectIds && syncedProjectIds.length > 0
            ? syncedProjectIds
            : knowledgeProjectIds;
      let callSpec: LocalCallSpec | null = null;
      try {
        callSpec = await fetchLocalCallSpec({
          userMessage: text,
          pageContext: undefined,
          visibleCode: undefined,
          recentSummary: undefined,
          availableResources: undefined,
        });
      } catch {
        callSpec = null;
      }
      const orchestratorCtx: OrchestratorContext = {
        userQuestion: text,
        personaId,
        essenceId: profile?.essence_id ?? null,
        profile,
        runtimeMode,
        contextCharsRemaining: Math.max(0, CHAT_CONTEXT_BUDGET - contextTotals.tokens),
      };
      const candidates = buildDefaultCandidates(orchestratorCtx);
      const decision = await collapseCandidates(orchestratorCtx, candidates);
      const chosen = candidates.find((c) => c.id === decision.chosenId) ?? candidates[0];
      const goalForPlan = (chosen?.promptSpec.user_question ?? text).slice(0, 20000);

      const planned = await plan(
        goalForPlan,
        personaId,
        inlineKnowledge && inlineKnowledge.length > 0 ? inlineKnowledge : undefined,
        projectIdsForPlan,
        {
          promptSpec: chosen?.promptSpec,
          collapseTrace: decision,
          collapseStrategy: decision.strategy,
          callSpec: callSpec ?? undefined,
          essenceConsole: true,
          sessionId: session.id,
          refinery: { origin: "live" },
        },
      );
      const planLatticeVersion = planned.lattice_version ?? null;
      const collapseTrace = (planned as any).collapse_trace;
      if (collapseTrace?.chosenId) {
        const topCandidate = Array.isArray(collapseTrace.candidates) ? collapseTrace.candidates[0] : null;
        const scoreText =
          topCandidate && typeof topCandidate.score === "number" ? ` score ${topCandidate.score.toFixed(2)}` : "";
        pushActivity(
          `Orchestration: ${collapseTrace.chosenId}${scoreText}${
            Array.isArray(topCandidate?.tags) && topCandidate.tags.length ? ` [${topCandidate.tags.join(", ")}]` : ""
          }`,
          "info",
          "plan",
        );
      }
      clearHintTimers();
      stageRef.current = "executing";
      scheduleHint("Still executing plan... waiting for tool calls to finish.", 8000);
      setTraceId(planned.traceId);
      const debatePlanned =
        Array.isArray(planned.executor_steps) &&
        planned.executor_steps.some(
          (s: any) => s?.kind === "debate.run" || (s?.kind === "tool.call" && s?.tool === "debate.run"),
        );
      const debateIdFromPlan = planned.debate_id ?? null;
      setPlanHasDebate(debatePlanned || Boolean(debateIdFromPlan));
      setDebateId(debateIdFromPlan);
      if (debatePlanned) {
        pushActivity("Debate planned; listening for live turns.", "info", "plan");
      }
      if (planLatticeVersion) {
        pushActivity(`Lattice snapshot (plan): ${planLatticeVersion}`, "info", "plan");
      }
      updateStatus("Plan received; executing...", "info", "plan");
      if (Array.isArray(planned.executor_steps) && planned.executor_steps.length > 0) {
        const chain = planned.executor_steps.map((s: any) => s.kind || s.id).join(" -> ");
        pushActivity(`Plan ready: ${chain}`, "info", "plan");
      }
      if (planned.strategy) {
        const note =
          Array.isArray(planned.strategy_notes) && planned.strategy_notes.length > 0
            ? ` (${planned.strategy_notes.join("; ")})`
            : "";
        pushActivity(`Plan strategy: ${planned.strategy}${note}`, "info", "plan");
      }
      const exec = await execute(planned.traceId);
      clearHintTimers();
      stageRef.current = "idle";
      const execSteps = Array.isArray(exec.steps) ? (exec.steps as any[]) : [];
      const execDebateId =
        exec.debate_id ??
        (execSteps.find((step: any) => step?.kind === "debate.run" && step?.output?.debateId)?.output?.debateId ??
          execSteps.find((step: any) => step?.tool === "debate.run" && step?.output?.debateId)?.output?.debateId ??
          null);
      if (execDebateId) {
        setDebateId(execDebateId);
        setPlanHasDebate(true);
      }
      const execLatticeVersion = exec.lattice_version ?? null;
      if (planLatticeVersion && execLatticeVersion && execLatticeVersion !== planLatticeVersion) {
        pushActivity(`Lattice mismatch: plan ${planLatticeVersion} -> exec ${execLatticeVersion}`, "error", "status");
      } else if (execLatticeVersion) {
        pushActivity(`Lattice snapshot (exec): ${execLatticeVersion}`, "info", "status");
      }
      let telemetry: DebateTelemetryResponse | null = null;
      if (execDebateId) {
        try {
          telemetry = await fetchDebateTelemetryOnce(execDebateId);
        } catch {
          telemetry = null;
        }
      }
      const rawSummary = summarizeExecution(exec);
      const summary = applyCoherenceReplyStyle(
        rawSummary,
        telemetry?.telemetry,
        telemetry?.confidence,
      );
      addMessage(session.id, {
        role: "assistant",
        content: summary,
        traceId: planned.traceId,
        whyBelongs: exec.why_belongs,
      });
      pushActivity(summary, exec.ok === false ? "error" : "success", "result");
      updateStatus("Task complete.", "success");
      setShowTrace(true);
    } catch (error) {
      clearHintTimers();
      stageRef.current = "idle";
      const message = error instanceof Error ? error.message : String(error);
      addMessage(session.id, {
        role: "assistant",
        content: `Task failed: ${message}`,
      });
      updateStatus(message, "error");
    } finally {
      setBusy(false);
    }
  }

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchHits([]);
      setSearchError(null);
      return;
    }
    setSearchBusy(true);
    setSearchError(null);
    try {
      const payload: MemorySearchResponse = await memorySearch({
        q: query,
        personaId,
      });
      setSearchHits(payload.items ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSearchError(message || "Search failed");
      setSearchHits([]);
    } finally {
      setSearchBusy(false);
    }
  };

  const handleToggleProject = (projectId: string) => {
    window.dispatchEvent(new CustomEvent("open-knowledge-project", { detail: { projectId } }));
  };

  const loadPanelSnapshots = useCallback(async () => {
    setPanelBusy(true);
    setPanelError(null);
    try {
      const snapshot = await getPanelSnapshots();
      setPanelSnapshot(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPanelError(message || "Unable to load panel telemetry.");
      setPanelSnapshot(null);
    } finally {
      setPanelBusy(false);
    }
  }, []);

  const loadBadgeTelemetry = useCallback(async () => {
    setBadgeBusy(true);
    setBadgeError(null);
    try {
      const snapshot = await getBadgeTelemetry();
      setBadgeSnapshot(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBadgeError(message || "Unable to load badge telemetry.");
      setBadgeSnapshot(null);
    } finally {
      setBadgeBusy(false);
    }
  }, []);

  useEffect(() => {
    if (showPanels) {
      void loadPanelSnapshots();
    }
  }, [showPanels, loadPanelSnapshots]);

  useEffect(() => {
    if (showBadges) {
      void loadBadgeTelemetry();
    }
  }, [showBadges, loadBadgeTelemetry]);

  return (
    <div className="flex h-full min-h-screen bg-[#050915] text-slate-100">
      <aside className="w-64 border-r border-white/5 bg-black/30">
        <SessionList
          sessions={sessions}
          activeId={activeId}
          onNew={() => setActive(newSession("Ask to do anything"))}
          onSelect={setActive}
          onDelete={handleDeleteSession}
        />
      </aside>
      <main className="flex-1 flex flex-col">
        <header className="flex items-center justify-between border-b border-white/5 px-6 py-3">
          <div className="flex items-center gap-3">
            <PersonaSelect
              personas={personas}
              value={personaId}
              onChange={(next) => session && setPersona(session.id, next)}
              status={personaStatus}
              error={personaError}
            />
            <button
              className="text-xs uppercase tracking-wide text-slate-400 hover:text-white"
              onClick={() => session && clearSession(session.id)}
              disabled={!session || !session.messages.length}
            >
              Clear chat
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-2">
        <button className="underline" onClick={() => setShowTrace((value) => !value)}>
          Trace
        </button>
        <button className="underline" onClick={() => setShowMemory((value) => !value)}>
          Memory
        </button>
        <button className="underline" onClick={() => setShowDebate(true)}>
          Debate
        </button>
        <button className="underline" onClick={() => setShowPanels((value) => !value)}>
          Panels
        </button>
        <button className="underline" onClick={() => setShowBadges((value) => !value)}>
          Badges
        </button>
        {INFERENCE_PANEL_ENABLED && (
          <button className="underline" onClick={() => setShowInferences(true)}>
            Inferences
          </button>
        )}
      </div>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-100 hover:bg-white/10"
              onClick={() => setShowJobs(true)}
              title="Open budget & daily jobs"
            >
              <Wallet size={14} /> Budget
            </button>
            <ContextMeter pct={contextPct} tokens={contextTotals.tokens} />
            {hull && (
              <div className="ml-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`rounded-full border px-2 py-0.5 ${
                    hull.hull_mode
                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                      : "border-rose-400/40 bg-rose-500/10 text-rose-100"
                  }`}
                  title={hullTitle}
                >
                  Hull {hull.hull_mode ? "ON" : "OFF"}
                </span>
                {llmLabel && (
                  <span
                    className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-200"
                    title={llmTitle}
                  >
                    LLM {llmLabel}
                  </span>
                )}
                {hasQueueData && (
                  <span
                    className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-200"
                    title={queueTitle}
                  >
                    Queue {queueDepth}
                  </span>
                )}
                {approvalsOutstanding !== null && (
                  <span
                    className={`rounded-full border px-2 py-0.5 ${
                      approvalsOutstanding > 0
                        ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                        : "border-white/10 bg-white/5 text-slate-200"
                    }`}
                    title="Pending approvals"
                  >
                    Approvals {approvalsOutstanding}
                  </span>
                )}
              </div>
            )}
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <section className="flex-1 flex flex-col min-w-0">
            <div ref={transcriptRef} className="flex-1 overflow-auto px-8 py-6 space-y-4">
              {messages.length === 0 && (
                <div className="text-sm text-slate-400">
                  Start a conversation. Active knowledge projects will be attached automatically.
                </div>
              )}
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
            <div className="border-t border-white/10 px-6 py-4 space-y-3">
              {KNOWLEDGE_ATTACHMENTS_ENABLED && (
                <KnowledgeTray
                  projects={activeKnowledgeProjects}
                  warnings={knowledgeWarnings}
                  onLaunch={handleToggleProject}
                  baselineEnabled={baselineEnabled}
                  onToggleBaseline={toggleBaseline}
                />
              )}
              <TaskStatusIndicator status={status} busy={busy} />
              <TaskActivityLog entries={activity} traceId={traceId} stage={stageRef.current} />
              <div className="flex items-end gap-3">
                <textarea
                  className="flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm focus:outline-none focus:border-sky-500"
                  placeholder="Ask to do anything..."
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={busy}
                  rows={3}
                />
                <button
                  className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-3 font-semibold text-white disabled:opacity-50"
                  onClick={() => void handleSend()}
                  disabled={busy || !input.trim()}
                >
                  <Send size={16} /> Send
                </button>
              </div>
            </div>
          </section>
          <aside className="w-80 border-l border-white/5 bg-black/20 px-5 py-5 flex flex-col gap-6">
            <EvalPanel />
            <MemorySearchPanel
              query={searchQ}
              onQueryChange={setSearchQ}
              onSearch={() => void handleSearch(searchQ)}
              hits={searchHits}
              busy={searchBusy}
              error={searchError}
            />
          </aside>
        </div>
      </main>
      <TraceDrawer traceId={traceId} open={showTrace} onClose={() => setShowTrace(false)} variant="window" />
      <MemoryDrawer traceId={traceId} open={showMemory} onClose={() => setShowMemory(false)} variant="window" />
      <DebateView
        traceId={traceId}
        debateId={debateId ?? undefined}
        open={showDebate}
        onClose={() => setShowDebate(false)}
      />
      <PanelSnapshotDrawer
        open={showPanels}
        onClose={() => setShowPanels(false)}
        snapshot={panelSnapshot}
        busy={panelBusy}
        error={panelError}
        onRefresh={() => void loadPanelSnapshots()}
      />
      <BadgeTelemetryDrawer
        open={showBadges}
        onClose={() => setShowBadges(false)}
        snapshot={badgeSnapshot}
        busy={badgeBusy}
        error={badgeError}
        onRefresh={() => void loadBadgeTelemetry()}
      />
      {INFERENCE_PANEL_ENABLED && (
        <InferenceDrawer
          open={showInferences}
          onClose={() => setShowInferences(false)}
          signals={inferenceSignals}
          stateless={inferenceStateless}
          onToggleStateless={() => setInferenceStateless((v) => !v)}
          onReset={() => setInferenceStateless(false)}
          profile={profile ?? null}
          profileDraft={profileDraft}
          onProfileDraftChange={setProfileDraft}
          onSaveProfile={handleSaveProfile}
          onResetProfile={handleResetProfile}
          profileLoading={profileLoading}
          profileSaving={profileSaving}
          profileError={profileError}
          targetId={profileTargetId}
        />
      )}
      <JobsBudgetModal open={showJobs} onClose={() => setShowJobs(false)} onInsertPrompt={(text) => setInput(text)} />
    </div>
  );
}

function summarizeExecution(payload: Awaited<ReturnType<typeof execute>>): string {
  if (!payload) return "Plan completed.";
  const badgeStep: any = Array.isArray(payload.steps)
    ? payload.steps.find((step: any) => step?.tool === "telemetry.badges.read" || step?.kind === "telemetry.badges.read")
    : null;
  const badgeSummary = badgeStep && badgeStep.output ? formatBadgeTelemetryOutput(badgeStep.output) : null;
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const finalAnswer = findFinalAnswerText(steps);
  const summaryCandidate = typeof payload.result_summary === "string" ? payload.result_summary.trim() : "";

  if (summaryCandidate) {
    if (finalAnswer && looksTelemetryOnly(summaryCandidate)) {
      const extras = [badgeSummary, summaryCandidate].filter(Boolean) as string[];
      return [finalAnswer, ...dedupeLines(extras)].join("\n\n");
    }
    if (badgeSummary && !summaryCandidate.includes(badgeSummary)) {
      return `${summaryCandidate}\n${badgeSummary}`;
    }
    return summaryCandidate;
  }

  if (finalAnswer) {
    if (badgeSummary) {
      return `${finalAnswer}\n\n${badgeSummary}`;
    }
    return finalAnswer;
  }
  if (badgeSummary) {
    return badgeSummary;
  }
  if (!steps.length) {
    return "Plan executed with no reported steps.";
  }
  return steps
    .map((step: any, idx: number) => {
      const status = step.ok === false ? "failed" : "ok";
      const label = step.tool ?? step.kind ?? `step${idx + 1}`;
      return `${idx + 1}. ${label} - ${status}`;
    })
    .join("\n");
}

function findFinalAnswerText(steps: any[]): string | null {
  if (!Array.isArray(steps)) return null;
  const reversed = [...steps].reverse();
  const answerKinds = ["tool.call", "specialist.run", "specialist.verify", "debate.run", "summary.compose"];

  for (const step of reversed) {
    if (!step || step.ok === false) continue;
    const kind = typeof step.kind === "string" ? step.kind.toLowerCase() : typeof step.tool === "string" ? step.tool.toLowerCase() : "";
    if (answerKinds.some((k) => kind.includes(k))) {
      const text = extractReadableText(step.output);
      if (text) return text;
    }
  }

  for (const step of reversed) {
    if (!step || step.ok === false) continue;
    const text = extractReadableText(step.output);
    if (text) return text;
  }
  return null;
}

function extractReadableText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (value && typeof value === "object") {
    const payload = value as Record<string, any>;
    const nestedOutput = payload.output;
    const nestedData = payload.data;
    const candidates = [
      payload.excerpt,
      payload.summary,
      payload.text,
      payload.message,
      payload.content,
      payload.answer,
      payload.result,
      typeof nestedOutput === "string" ? nestedOutput : nestedOutput?.text,
      typeof nestedData === "string" ? nestedData : nestedData?.text,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return null;
}

function looksTelemetryOnly(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.startsWith("operator update") ||
    lower.includes("telemetry") ||
    lower.includes("debate") ||
    lower.includes("trace") ||
    lower.includes("plan dsl") ||
    lower.includes("executor steps")
  );
}

function dedupeLines(parts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const key = part.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(part);
  }
  return result;
}

function formatBadgeTelemetryOutput(output: any): string | null {
  if (!output || typeof output !== "object") return null;
  const entries = Array.isArray((output as any).entries) ? (output as any).entries : [];
  if (entries.length === 0) return null;
  const capturedAt = typeof (output as any).capturedAt === "string" ? (output as any).capturedAt : null;
  const headerParts = [
    "Live badge telemetry",
    `panels ${entries.length}`,
    capturedAt ? `captured ${capturedAt}` : null,
  ].filter(Boolean);

  const lines: string[] = [];
  const top = entries.slice(0, 3);
  for (const entry of top) {
    const metrics = entry?.metrics ?? {};
    const occ = typeof metrics.occupancy === "number" ? metrics.occupancy : undefined;
    const coh = typeof metrics.coherence === "number" ? metrics.coherence : undefined;
    const q = typeof metrics.avgQFactor === "number" ? metrics.avgQFactor : undefined;
    const label = [entry?.title, entry?.panelId].filter(Boolean).join(" · ") || "panel";
    const status = entry?.status ? String(entry.status).toUpperCase() : "UNK";
    const detail: string[] = [];
    if (occ !== undefined) detail.push(`occ ${(occ * 100).toFixed(1)}%`);
    if (coh !== undefined) detail.push(`coh ${coh.toFixed(3)}`);
    if (q !== undefined) detail.push(`Q ${q.toFixed(3)}`);
    if (entry?.solutions && entry.solutions.length > 0) {
      detail.push(`next: ${entry.solutions.map((s: any) => s.action).join(" | ")}`);
    }
    lines.push(`${status} · ${label}${detail.length ? " · " + detail.join(" · ") : ""}`);
  }

  const relationNotes: string[] = Array.isArray((output as any).relationNotes) ? (output as any).relationNotes : [];
  const relationText = relationNotes.length ? `Relation: ${relationNotes.join(" ")}` : "";
  return [headerParts.join(" · "), ...lines, relationText].filter(Boolean).join("\n");
}

function applyCoherenceReplyStyle(
  base: string,
  snapshot?: TTelemetrySnapshot,
  confidence?: number,
): string {
  if (!snapshot) return base;
  const coherence =
    typeof snapshot.global_coherence === "number" && Number.isFinite(snapshot.global_coherence)
      ? snapshot.global_coherence
      : 0.5;
  const dispersion =
    typeof snapshot.phase_dispersion === "number" && Number.isFinite(snapshot.phase_dispersion)
      ? snapshot.phase_dispersion
      : 0.5;

  const highCoherence = coherence >= COHERENCE_HIGH_THRESHOLD;
  const lowCoherence = coherence <= COHERENCE_LOW_THRESHOLD;
  const highDispersion = dispersion >= DISPERSION_HIGH_THRESHOLD;
  const lowDispersion = dispersion <= DISPERSION_LOW_THRESHOLD;

  const blocks = base
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  if (blocks.length === 0) return base;

  const fmtPct = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : "n/a";

  if (highCoherence && lowDispersion) {
    const combinedLength = blocks.join("\n\n").length;
    if (combinedLength <= COHERENCE_COLLAPSE_SOFT_LIMIT) {
      return blocks.join("\n\n");
    }
    const primary = blocks[0];
    const suppressed = blocks.length - 1;
    const suffix =
      suppressed > 0
        ? `\n\n(Additional debate branches collapsed; coherence ${fmtPct(
            coherence,
          )}, dispersion ${fmtPct(dispersion)}.)`
        : "";
    return `${primary}${suffix}`;
  }

  if (lowCoherence && highDispersion) {
    const prefixParts = [
      "I'm not confident the debate has fully converged yet.",
      `Coherence is around ${fmtPct(coherence)} with dispersion ${fmtPct(dispersion)}.`,
      confidence !== undefined ? `Collapse confidence is ~${fmtPct(confidence)}.` : "",
      "Before acting, treat the following interpretations as tentative and clarify your intent if possible.",
    ].filter(Boolean);
    return `${prefixParts.join(" ")}\n\n${blocks.join("\n\n")}`;
  }

  if (blocks.length === 1) {
    return [
      "The debate surfaced one leading interpretation; treat it as best-current rather than final.",
      "",
      blocks[0],
    ].join("\n");
  }

  const primary = blocks[0];
  const alternative = blocks[1];
  const extras = blocks.length - 2;

  const lines: string[] = [];
  lines.push("The debate identified two leading interpretations:");
  lines.push("");
  lines.push("Primary interpretation:");
  lines.push(primary);
  lines.push("");
  lines.push("Alternative interpretation:");
  lines.push(alternative);
  if (extras > 0) {
    lines.push("");
    lines.push(`(${extras} additional variants omitted for brevity.)`);
  }
  return lines.join("\n");
}

function SessionList({
  sessions,
  activeId,
  onNew,
  onSelect,
  onDelete,
}: {
  sessions: Record<string, ChatSession>;
  activeId?: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const list = Object.values(sessions).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="uppercase text-xs tracking-wide text-slate-400">Sessions</span>
        <button
          className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white hover:border-sky-400"
          onClick={onNew}
        >
          <Plus size={12} /> New
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {list.length === 0 && <div className="px-4 py-6 text-sm text-slate-400">No sessions yet.</div>}
        {list.map((session) => {
          const messageCount = session.messageCount ?? session.messages.length;
          return (
            <div
              key={session.id}
              className={`px-4 py-3 border-b border-white/5 text-sm ${
                session.id === activeId ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <button className="text-left w-full" onClick={() => onSelect(session.id)}>
                <div className="font-semibold text-white truncate">{session.title || "Untitled chat"}</div>
                <div className="text-[11px] text-slate-400">{new Date(session.createdAt).toLocaleString()}</div>
              </button>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>{messageCount} messages</span>
                <button className="flex items-center gap-1 text-rose-200 hover:text-rose-100" onClick={() => onDelete(session.id)}>
                  <Trash2 size={12} /> delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KnowledgeTray({
  projects,
  warnings,
  onLaunch,
  baselineEnabled,
  onToggleBaseline,
}: {
  projects: Array<{ id: string; name: string }>;
  warnings: string[];
  onLaunch: (projectId: string) => void;
  baselineEnabled: boolean;
  onToggleBaseline: () => void;
}) {
  if (projects.length === 0) {
    return (
      <div className="text-xs text-slate-400">
        No active knowledge projects. Open Helix Settings then AGI Knowledge to attach files.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs border ${
            baselineEnabled ? "bg-emerald-500/20 text-emerald-100 border-emerald-400/30" : "bg-white/5 text-slate-200 border-white/10"
          }`}
          onClick={onToggleBaseline}
          title="Toggle Core Knowledge bundle"
        >
          Core Knowledge
        </button>
        {projects.map((project) => (
          <button
            key={project.id}
            className="flex items-center gap-1 rounded-full bg-sky-500/20 px-3 py-1 text-xs text-sky-100 border border-sky-400/30"
            onClick={() => onLaunch(project.id)}
          >
            {project.name} <ArrowUpRightSquare size={12} />
          </button>
        ))}
      </div>
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100 space-y-1">
          {warnings.map((warning, index) => (
            <div key={`${warning}-${index}`}>{warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskStatusIndicator({ status, busy }: { status: TaskStatus | null; busy: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy || !status) {
      setElapsed(0);
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    setElapsed(Date.now() - status.startedAt);
    const timer = window.setInterval(() => {
      setElapsed(Date.now() - status.startedAt);
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [busy, status?.startedAt]);

  const tone = status?.tone ?? "info";
  const indicatorColor =
    tone === "error" ? "bg-rose-400" : tone === "success" ? "bg-emerald-400" : "bg-sky-400";
  const textColor =
    tone === "error" ? "text-rose-200" : tone === "success" ? "text-emerald-200" : "text-slate-400";
  const dotColor = status ? indicatorColor : "bg-slate-600";

  return (
    <div className={`flex items-center gap-2 text-xs ${textColor}`} role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${busy ? "animate-pulse" : ""} ${dotColor}`} aria-hidden="true" />
      <span>{status?.text ?? "Idle"}</span>
      {busy && status ? (
        <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500">{formatElapsed(elapsed)}</span>
      ) : null}
    </div>
  );
}

function TaskActivityLog({
  entries,
  traceId,
  stage,
}: {
  entries: ActivityEntry[];
  traceId?: string;
  stage: "idle" | "planning" | "executing";
}) {
  if (entries.length === 0) return null;
  const visible = entries.slice(-12);
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2" aria-live="polite">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
        <span>Live task feed</span>
        <span className="text-slate-500">
          {stage !== "idle" ? stage : traceId ? `trace ${traceId.slice(0, 8)}` : "idle"}
        </span>
      </div>
      <div className="space-y-1 max-h-36 overflow-auto">
        {visible.map((entry) => {
          const dot =
            entry.tone === "error" ? "bg-rose-400" : entry.tone === "success" ? "bg-emerald-400" : "bg-sky-400";
          const textColor =
            entry.tone === "error" ? "text-rose-100" : entry.tone === "success" ? "text-emerald-100" : "text-slate-200";
          return (
            <div key={entry.id} className={`flex items-start gap-2 text-[11px] ${textColor}`}>
              <span className={`mt-1 h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
              <span className="flex-1 whitespace-pre-wrap">{entry.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0s";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function PersonaSelect({
  personas,
  value,
  onChange,
  status,
  error,
}: {
  personas: PersonaSummary[];
  value: string;
  onChange: (id: string) => void;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}) {
  return (
    <div className="flex flex-col text-xs">
      <label className="uppercase tracking-wide text-slate-400">Persona</label>
      <select
        className="mt-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white focus:border-sky-500 focus:outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={status === "loading"}
      >
        {personas.map((persona) => (
          <option key={persona.id} value={persona.id}>
            {persona.display_name}
          </option>
        ))}
      </select>
      {error && <span className="text-rose-300">{error}</span>}
    </div>
  );
}

function ContextMeter({ pct, tokens }: { pct: number; tokens: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <div className="w-32 h-2 rounded-full bg-white/10">
        <div className="h-2 rounded-full bg-sky-400" style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      <span>
        {tokens}/{CHAT_CONTEXT_BUDGET} tok
      </span>
    </div>
  );
}

function MemorySearchPanel({
  query,
  onQueryChange,
  onSearch,
  hits,
  busy,
  error,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  hits: TMemorySearchHit[];
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="uppercase text-xs tracking-wide text-slate-400">Memory search</span>
        <button className="text-xs underline" onClick={onSearch} disabled={busy}>
          {busy ? "Searching..." : "Search"}
        </button>
      </div>
      <input
        type="text"
        className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm focus:outline-none focus:border-sky-500"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Keywords..."
      />
      {error && <div className="text-xs text-rose-300">{error}</div>}
      <div className="space-y-3 max-h-64 overflow-auto">
        {hits.length === 0 && !busy && <div className="text-xs text-slate-500">No hits yet.</div>}
        {hits.map((hit) => (
          <div key={hit.id} className="rounded-lg border border-white/10 bg-black/30 p-2 text-xs space-y-1">
            <div className="font-semibold text-white">{hit.kind}</div>
            <div className="text-[11px] text-slate-400">{new Date(hit.created_at).toLocaleString()}</div>
            <div className="text-slate-100 whitespace-pre-wrap">{hit.snippet}</div>
            <div className="flex flex-wrap gap-1">
              {hit.keys.map((key) => (
                <span key={`${hit.id}-${key}`} className="rounded bg-white/10 px-1 py-0.5">
                  {key}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelSnapshotDrawer({
  open,
  onClose,
  snapshot,
  busy,
  error,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: PanelSnapshotResponse | null;
  busy: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (!open) return null;
  const panels = snapshot?.panels ?? [];
  const summarizeKV = (record?: Record<string, unknown>, limit = 6) => {
    if (!record) return "—";
    const entries = Object.entries(record).slice(0, limit);
    if (entries.length === 0) return "—";
    return entries
      .map(([key, value]) => `${key}:${typeof value === "number" ? Number(value).toFixed(3) : String(value)}`)
      .join(" · ");
  };
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end bg-black/50">
      <div className="h-full w-[520px] bg-[#0b0f1c] border-l border-white/10 shadow-xl overflow-auto">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">Panel Snapshots</div>
            <div className="text-[11px] text-slate-400">
              {snapshot?.capturedAt ? `Captured ${new Date(snapshot.capturedAt).toLocaleString()}` : "Awaiting data"}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              className="underline disabled:opacity-40"
              onClick={() => onRefresh()}
              disabled={busy}
              title="Refresh live panel telemetry"
            >
              {busy ? "Refreshing..." : "Refresh"}
            </button>
            <button className="underline" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {error && <div className="px-4 py-2 text-xs text-rose-300 border-b border-rose-400/30">{error}</div>}
        {snapshot?.relatedPanels && snapshot.relatedPanels.length > 0 && (
          <div className="px-4 py-2 text-[11px] text-slate-300 border-b border-white/10 space-y-1">
            <div className="font-semibold text-white/90">Related panels</div>
            <div className="flex flex-wrap gap-1">
              {snapshot.relatedPanels.map((panel) => (
                <span key={panel.id} className="rounded bg-white/10 px-2 py-0.5 text-[11px]">
                  {panel.title ?? panel.id}
                </span>
              ))}
            </div>
            {snapshot.relationNotes?.map((note: string, idx: number) => (
              <div key={idx} className="text-slate-400">
                {note}
              </div>
            ))}
          </div>
        )}
        {busy && !panels.length && <div className="px-4 py-3 text-xs text-slate-400">Loading panel telemetry...</div>}
        {!busy && panels.length === 0 && !error && (
          <div className="px-4 py-3 text-xs text-slate-400">No panel telemetry available.</div>
        )}
        <div className="divide-y divide-white/5">
          {panels.map((panel) => (
            <div key={`${panel.panelId}-${panel.instanceId}`} className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{panel.title}</div>
                  <div className="text-[11px] text-slate-400">
                    {panel.panelId} · {panel.instanceId}
                  </div>
                </div>
                <div className="text-[11px] text-slate-400">{new Date(panel.lastUpdated).toLocaleString()}</div>
              </div>
              <div className="text-xs text-slate-200">
                <div>Metrics: {summarizeKV(panel.metrics)}</div>
                <div>Flags: {summarizeKV(panel.flags)}</div>
                <div>Notes: {panel.notes || "—"}</div>
                <div>
                  Bands:{" "}
                  {Array.isArray(panel.bands) && panel.bands.length > 0
                    ? panel.bands.map((band) => band.name).join(", ")
                    : "—"}
                </div>
                {panel.tile_sample && (
                  <div>
                    Tiles: {panel.tile_sample.active ?? 0}/{panel.tile_sample.total ?? 0}
                    {panel.tile_sample.hot && panel.tile_sample.hot.length > 0 ? ` hot:${panel.tile_sample.hot.length}` : ""}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BadgeTelemetryDrawer({
  open,
  onClose,
  snapshot,
  busy,
  error,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: BadgeTelemetryResponse | null;
  busy: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (!open) return null;
  const entries = snapshot?.entries ?? [];
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end bg-black/50">
      <div className="h-full w-[520px] bg-[#0b0f1c] border-l border-white/10 shadow-xl overflow-auto">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">Badge Telemetry</div>
            <div className="text-[11px] text-slate-400">
              {snapshot?.capturedAt ? `Captured ${new Date(snapshot.capturedAt).toLocaleString()}` : "Awaiting data"}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button className="underline disabled:opacity-40" onClick={() => onRefresh()} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh"}
            </button>
            <button className="underline" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {error && <div className="px-4 py-2 text-xs text-rose-300 border-b border-rose-400/30">{error}</div>}
        {snapshot?.relationNotes && snapshot.relationNotes.length > 0 && (
          <div className="px-4 py-2 text-[11px] text-slate-300 border-b border-white/10 space-y-1">
            {snapshot.relationNotes.map((note, idx) => (
              <div key={idx}>{note}</div>
            ))}
          </div>
        )}
        {busy && !entries.length && <div className="px-4 py-3 text-xs text-slate-400">Loading badge telemetry...</div>}
        {!busy && entries.length === 0 && !error && (
          <div className="px-4 py-3 text-xs text-slate-400">No badge telemetry available.</div>
        )}
        <div className="divide-y divide-white/5">
          {entries.map((entry) => (
            <div key={`${entry.panelId}-${entry.instanceId}`} className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{entry.title}</div>
                  <div className="text-[11px] text-slate-400">
                    {entry.panelId} · {entry.instanceId} · {entry.status.toUpperCase()}
                  </div>
                </div>
                <div className="text-[11px] text-slate-400">{new Date(entry.lastUpdated).toLocaleString()}</div>
              </div>
              <div className="text-xs text-slate-200 whitespace-pre-wrap">{entry.summary}</div>
              <div className="text-[11px] text-slate-300">
                Proofs:{" "}
                {entry.proofs.length
                  ? entry.proofs.map((p) => `${p.label}=${p.value}`).join(" · ")
                  : "—"}
              </div>
              <div className="text-[11px] text-slate-300">
                Next steps:{" "}
                {entry.solutions.length
                  ? entry.solutions.map((s) => s.action).join(" · ")
                  : "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type InferenceSignals = {
  interactionStyle: { prefersBullets: boolean; prefersCode: boolean; detailLevel: string; toneHint: string };
  focusAreas: string[];
  rhythm: string[];
  sustainability: string[];
  longevity: string[];
  recentTasks: string[];
  telemetry: { tokens: number; messages: number; knowledgeProjects: number };
  usage: string[];
  disabled?: boolean;
};

function InferenceDrawer({
  open,
  onClose,
  signals,
  stateless,
  onToggleStateless,
  onReset,
  profile,
  profileDraft,
  onProfileDraftChange,
  onSaveProfile,
  onResetProfile,
  profileLoading,
  profileSaving,
  profileError,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  signals: InferenceSignals;
  stateless: boolean;
  onToggleStateless: () => void;
  onReset: () => void;
  profile: EssenceProfile | null;
  profileDraft: EssenceProfileUpdate;
  onProfileDraftChange: (next: EssenceProfileUpdate) => void;
  onSaveProfile: () => Promise<void>;
  onResetProfile: () => Promise<void>;
  profileLoading: boolean;
  profileSaving: boolean;
  profileError: string | null;
  targetId: string | null;
}) {
  const updateInteraction = (partial: Partial<NonNullable<EssenceProfileUpdate["interaction_style"]>>) => {
    onProfileDraftChange({
      ...profileDraft,
      interaction_style: { ...(profileDraft.interaction_style ?? {}), ...partial },
    });
  };

  const updateFocus = (key: keyof NonNullable<EssenceProfileUpdate["focus_areas"]>, value: number) => {
    const clean = Number.isFinite(value) ? value : undefined;
    const next = { ...(profileDraft.focus_areas ?? {}) };
    if (clean === undefined) {
      delete next[key];
    } else {
      next[key] = clean;
    }
    onProfileDraftChange({
      ...profileDraft,
      focus_areas: next,
    });
  };

  const updateAspiration = (key: keyof NonNullable<EssenceProfileUpdate["aspiration_signals"]>, value: number) => {
    const clean = Number.isFinite(value) ? value : undefined;
    const next = { ...(profileDraft.aspiration_signals ?? {}) };
    if (clean === undefined) {
      delete next[key];
    } else {
      next[key] = clean;
    }
    onProfileDraftChange({
      ...profileDraft,
      aspiration_signals: next,
    });
  };

  const toggleDisabled = (dim: string) => {
    const current = new Set(profileDraft.disabled_dimensions ?? []);
    if (current.has(dim)) {
      current.delete(dim);
    } else {
      current.add(dim);
    }
    onProfileDraftChange({ ...profileDraft, disabled_dimensions: Array.from(current) });
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end bg-black/60">
      <div className="h-full w-[440px] bg-[#0b0f1c] border-l border-white/10 shadow-xl overflow-auto">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">Profile & Inferences</div>
            <div className="text-[11px] text-slate-400">
              Remote-sensing view: inferred from what was already requested, not by asking personal questions.
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              className={`rounded border px-2 py-1 ${stateless ? "border-amber-300/40 text-amber-200" : "border-white/20 text-slate-200"}`}
              onClick={onToggleStateless}
            >
              {stateless ? "Stateless on" : "Stateless off"}
            </button>
            <button className="underline" onClick={onReset}>
              Reset view
            </button>
            <button className="underline" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="divide-y divide-white/10">
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Stored profile</div>
                <div className="text-xs text-slate-300">
                  {targetId ? `essence_id: ${targetId}` : "No essence id available."}
                </div>
                {profile?.updated_at && (
                  <div className="text-[11px] text-slate-500">Updated {new Date(profile.updated_at).toLocaleString()}</div>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-300">
                {profileLoading && <span>Loading…</span>}
                {profileSaving && <span>Saving…</span>}
              </div>
            </div>
            {profileError && <div className="text-[11px] text-rose-300">{profileError}</div>}
            <div className="grid grid-cols-1 gap-3 text-xs text-slate-100 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] text-slate-400">Detail level</span>
                <select
                  className="w-full rounded border border-white/10 bg-black/40 px-2 py-1"
                  value={profileDraft.interaction_style?.detail_level ?? "medium"}
                  onChange={(e) => updateInteraction({ detail_level: e.target.value as any })}
                >
                  <option value="short">short</option>
                  <option value="medium">medium</option>
                  <option value="long">long</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-slate-400">Tone</span>
                <select
                  className="w-full rounded border border-white/10 bg-black/40 px-2 py-1"
                  value={profileDraft.interaction_style?.tone_preference ?? "neutral-analytical"}
                  onChange={(e) => updateInteraction({ tone_preference: e.target.value as any })}
                >
                  <option value="neutral-analytical">neutral-analytical</option>
                  <option value="direct">direct</option>
                  <option value="playful">playful</option>
                  <option value="formal">formal</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={profileDraft.interaction_style?.prefers_bullets ?? false}
                  onChange={(e) => updateInteraction({ prefers_bullets: e.target.checked })}
                />
                <span>Prefers bullets</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={profileDraft.interaction_style?.prefers_code ?? false}
                  onChange={(e) => updateInteraction({ prefers_code: e.target.checked })}
                />
                <span>Prefers code/structured</span>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs text-slate-100 sm:grid-cols-2">
              {["learning", "creative_work", "execution_ops", "health", "relationships"].map((key) => (
                <label key={key} className="space-y-1">
                  <span className="text-[11px] text-slate-400">{key.replace("_", " ")}</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                  className="w-full rounded border border-white/10 bg-black/40 px-2 py-1"
                    value={(profileDraft.focus_areas as any)?.[key] ?? ""}
                    onChange={(e) =>
                      updateFocus(
                        key as any,
                        e.target.value === "" ? Number.NaN : Number(e.target.value),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs text-slate-100 sm:grid-cols-2">
              {["craftsmanship", "autonomy", "stability", "exploration"].map((key) => (
                <label key={key} className="space-y-1">
                  <span className="text-[11px] text-slate-400">{key}</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                  className="w-full rounded border border-white/10 bg-black/40 px-2 py-1"
                    value={(profileDraft.aspiration_signals as any)?.[key] ?? ""}
                    onChange={(e) =>
                      updateAspiration(
                        key as any,
                        e.target.value === "" ? Number.NaN : Number(e.target.value),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-200">
              {["aspiration_signals", "longevity", "sustainability", "focus_areas"].map((dim) => (
                <label key={dim} className="flex items-center gap-1 rounded border border-white/10 px-2 py-1">
                  <input
                    type="checkbox"
                    checked={profileDraft.disabled_dimensions?.includes(dim) ?? false}
                    onChange={() => toggleDisabled(dim)}
                  />
                  <span>Disable {dim.replace("_", " ")}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                className="rounded border border-sky-400/60 px-3 py-1 text-sky-100 hover:bg-sky-500/10 disabled:opacity-40"
                onClick={() => void onSaveProfile()}
                disabled={profileSaving || !targetId}
              >
                Save profile
              </button>
              <button
                className="rounded border border-amber-400/60 px-3 py-1 text-amber-100 hover:bg-amber-500/10 disabled:opacity-40"
                onClick={() => void onResetProfile()}
                disabled={profileSaving || profileLoading || !targetId}
              >
                Reset profile
              </button>
              {stateless && <span className="text-[11px] text-amber-200">Stateless: not persisted</span>}
            </div>
          </div>
          <div className="p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Interaction style</div>
            <div className="text-xs text-slate-100 space-y-1">
              <div>Detail: {signals.interactionStyle.detailLevel}</div>
              <div>Prefers bullets: {signals.interactionStyle.prefersBullets ? "yes" : "no"}</div>
              <div>Prefers code/structured: {signals.interactionStyle.prefersCode ? "yes" : "no"}</div>
              <div>Tone hint: {signals.interactionStyle.toneHint}</div>
            </div>
          </div>
          <div className="p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Focus areas</div>
            <div className="text-xs text-slate-100 space-y-1">
              {signals.focusAreas.length > 0 ? (
                signals.focusAreas.map((item) => <div key={item}>{item}</div>)
              ) : (
                <div className="text-slate-400">No attached projects yet.</div>
              )}
            </div>
          </div>
          <div className="p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Rhythm / posture</div>
            <div className="text-xs text-slate-100 space-y-1">
              {signals.rhythm.length > 0 ? (
                signals.rhythm.map((item, idx) => <div key={`${item}-${idx}`}>{item}</div>)
              ) : (
                <div className="text-slate-400">Awaiting signals.</div>
              )}
            </div>
          </div>
          <div className="p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Sustainability / friction</div>
            <div className="text-xs text-slate-100 space-y-1">
              {signals.sustainability.length > 0 ? (
                signals.sustainability.map((item, idx) => <div key={`${item}-${idx}`}>{item}</div>)
              ) : (
                <div className="text-slate-400">No recent friction events.</div>
              )}
            </div>
          </div>
          <div className="p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Recent tasks</div>
            <div className="text-xs text-slate-100 space-y-1">
              {signals.recentTasks.map((task, idx) => (
                <div key={`${task}-${idx}`} className="rounded border border-white/10 bg-white/5 px-2 py-1">
                  {task}
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Longevity themes</div>
            <div className="text-xs text-slate-100 space-y-1">
              {signals.longevity.map((item, idx) => (
                <div key={`${item}-${idx}`}>{item}</div>
              ))}
            </div>
          </div>
          <div className="p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Usage & guardrails</div>
            <div className="text-xs text-slate-100 space-y-1">
              {signals.usage.map((item, idx) => (
                <div key={`${item}-${idx}`}>{item}</div>
              ))}
              <div className="text-[11px] text-slate-400">
                Polite rules: observational, non-confessional, physics-flavored; only uses what you already provided.
              </div>
            </div>
          </div>
          <div className="p-4 space-y-1 text-xs text-slate-300">
            <div>Telemetry: tokens {signals.telemetry.tokens}, messages {signals.telemetry.messages}</div>
            <div>Knowledge attachments: {signals.telemetry.knowledgeProjects}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
