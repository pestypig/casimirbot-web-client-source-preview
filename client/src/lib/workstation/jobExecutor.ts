import { panelRegistry } from "@/lib/desktop/panelRegistry";
import { findBestDocForTopic, findRandomPaperForTopic } from "@/lib/docs/paperReadCommand";
import { launchHelixAskPrompt } from "@/lib/helix/ask-prompt-launch";
import { getWorkstationPanelCapabilities } from "@/lib/workstation/panelCapabilities";
import { writeClipboardWithReceipt, recordClipboardReceipt } from "@/lib/workstation/workstationClipboard";
import {
  executeHelixPanelAction,
  type HelixPanelActionExecutionContext,
} from "@/lib/workstation/panelActionAdapters";
import { emitHelixAskLiveEvent } from "@/lib/helix/liveEventsBus";
import { emitHelixWorkstationProceduralStep } from "@/lib/workstation/proceduralPlaybackContract";
import {
  useWorkstationNotesStore,
  type WorkstationNoteCitation,
  type WorkstationNoteSnippet,
} from "@/store/useWorkstationNotesStore";

export type WorkstationJobPayload = {
  job_id?: string;
  title?: string;
  objective?: string;
  preferred_panels?: string[];
  max_steps?: number;
  workflow?: "observable_research_pipeline";
  workflow_args?: Record<string, unknown>;
};

export type WorkstationJobStepReceipt = {
  step: number;
  panel_id: string;
  action_id: string;
  ok: boolean;
  started_at: string;
  duration_ms: number;
  message?: string;
  artifact?: Record<string, unknown> | null;
};

export type WorkstationJobExecutionResult = {
  job_id: string;
  title: string;
  objective: string;
  started_at: string;
  completed_at: string;
  ok: boolean;
  step_receipts: WorkstationJobStepReceipt[];
};

type ObservableResearchWorkflowArgs = {
  topic: string;
  note_title: string;
  compare_instruction: string;
  max_matches: number;
};

function normalizePanels(preferredPanels: string[] | undefined): string[] {
  const fromPayload = Array.isArray(preferredPanels)
    ? preferredPanels
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    : [];
  if (fromPayload.length > 0) return fromPayload;
  return panelRegistry
    .filter((panel) => panel.workstationCapabilities?.v1_job_ready)
    .map((panel) => panel.id);
}

function chooseActionId(panelId: string): string | null {
  const capabilities = getWorkstationPanelCapabilities(panelId);
  if (!capabilities || !capabilities.can_run_action || capabilities.actions.length === 0) return null;
  if (capabilities.safe_actions.includes("open")) return "open";
  if (capabilities.safe_actions.length > 0) return capabilities.safe_actions[0];
  return capabilities.actions[0]?.id ?? null;
}

function emitJobLiveEvent(args: {
  contextId: string;
  traceId: string;
  kind: "job_started" | "job_step_receipt" | "job_completed";
  content: string;
  durationMs?: number;
  step?: number;
  panelId?: string;
  actionId?: string;
  ok?: boolean;
  artifact?: Record<string, unknown> | null;
  tool?: string;
}): void {
  const tsIso = new Date().toISOString();
  emitHelixAskLiveEvent({
    contextId: args.contextId,
    traceId: args.traceId,
    entry: {
      id: `workstation-job:${args.traceId}:${args.kind}:${args.step ?? 0}:${Date.now()}`,
      text: args.content,
      tool: args.tool ?? "workstation.job_executor",
      ts: tsIso,
      durationMs: args.durationMs,
      meta: {
        kind: args.kind,
        step: args.step,
        panel_id: args.panelId,
        action_id: args.actionId,
        ok: args.ok,
        artifact: args.artifact ?? null,
        trace_id: args.traceId,
      },
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.floor(value);
}

function parseObservableResearchWorkflowArgs(
  objective: string,
  value: Record<string, unknown> | undefined,
): ObservableResearchWorkflowArgs {
  const topic = (asNonEmptyString(value?.topic) ?? objective) || "current research topic";
  const noteTitle = asNonEmptyString(value?.note_title) ?? `Topic note: ${topic}`;
  const compareInstruction =
    asNonEmptyString(value?.compare_instruction) ??
    `Compare the collected topics for "${topic}" and explain key overlaps, differences, and caveats.`;
  const maxMatchesRaw = asFiniteInteger(value?.max_matches);
  const maxMatches = maxMatchesRaw === null ? 3 : Math.max(1, Math.min(6, maxMatchesRaw));
  return {
    topic,
    note_title: noteTitle,
    compare_instruction: compareInstruction,
    max_matches: maxMatches,
  };
}

type TopicSnippet = {
  id: string;
  citation: WorkstationNoteCitation;
  path: string;
  heading: string;
  excerpt: string;
  score: number;
};

function extractTopicSnippetsFromMarkdown(args: {
  markdown: string;
  path: string;
  topic: string;
  maxMatches: number;
}): TopicSnippet[] {
  const lines = args.markdown.replace(/\r\n/g, "\n").split("\n");
  const terms = Array.from(
    new Set(
      args.topic
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 3),
    ),
  );

  if (terms.length === 0) return [];

  const sections: Array<{ heading: string; text: string; start: number; end: number }> = [];
  let currentHeading = "Document";
  let currentText: string[] = [];
  let currentStartOffset = 0;
  let runningOffset = 0;

  const pushSection = () => {
    const text = currentText.join("\n").trim();
    if (!text) return;
    sections.push({
      heading: currentHeading,
      text,
      start: currentStartOffset,
      end: runningOffset,
    });
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (headingMatch) {
      pushSection();
      currentHeading = headingMatch[1].trim();
      currentText = [];
      currentStartOffset = runningOffset;
      runningOffset += line.length + 1;
      continue;
    }
    currentText.push(line);
    runningOffset += line.length + 1;
  }
  pushSection();

  const scored = sections
    .map((section) => {
      const lower = section.text.toLowerCase();
      const score = terms.reduce((acc, term) => acc + (lower.includes(term) ? 1 : 0), 0);
      const firstHit = terms
        .map((term) => lower.indexOf(term))
        .filter((index) => index >= 0)
        .sort((left, right) => left - right)[0];
      return { section, score, firstHit };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, args.maxMatches);

  return scored.map((entry, index) => {
    const startInSection = typeof entry.firstHit === "number" && entry.firstHit >= 0 ? entry.firstHit : 0;
    const endInSection = Math.min(entry.section.text.length, startInSection + 420);
    const excerpt = entry.section.text.slice(startInSection, endInSection).replace(/\s+/g, " ").trim();
    const citation: WorkstationNoteCitation = {
      id: `cit:${args.path}:${entry.section.heading}:${index}:${Math.random().toString(36).slice(2, 7)}`,
      path: args.path,
      heading: entry.section.heading,
      start_offset: Math.max(0, entry.section.start + startInSection),
      end_offset: Math.max(0, entry.section.start + endInSection),
    };
    return {
      id: `snippet:${citation.id}`,
      citation,
      path: args.path,
      heading: entry.section.heading,
      excerpt,
      score: entry.score,
    };
  });
}

async function fetchLocalDoc(path: string): Promise<string | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function runObservableResearchWorkflow(args: {
  contextId: string;
  traceId: string;
  jobId: string;
  objective: string;
  workflowArgs: ObservableResearchWorkflowArgs;
  executionContext: HelixPanelActionExecutionContext;
}): Promise<WorkstationJobStepReceipt[]> {
  const receipts: WorkstationJobStepReceipt[] = [];

  const pushReceipt = (receipt: Omit<WorkstationJobStepReceipt, "step">) => {
    const fullReceipt: WorkstationJobStepReceipt = {
      ...receipt,
      step: receipts.length + 1,
    };
    receipts.push(fullReceipt);
    emitJobLiveEvent({
      contextId: args.contextId,
      traceId: args.traceId,
      kind: "job_step_receipt",
      step: fullReceipt.step,
      panelId: fullReceipt.panel_id,
      actionId: fullReceipt.action_id,
      ok: fullReceipt.ok,
      durationMs: fullReceipt.duration_ms,
      artifact: fullReceipt.artifact ?? null,
      content: `Step ${fullReceipt.step}: ${fullReceipt.panel_id}.${fullReceipt.action_id} -> ${fullReceipt.ok ? "ok" : "fail"}${fullReceipt.message ? ` (${fullReceipt.message})` : ""}`,
    });
  };

  const nowIso = () => new Date().toISOString();

  const panelStartMs = Date.now();
  args.executionContext.openPanel("docs-viewer");
  args.executionContext.focusPanel("docs-viewer");
  args.executionContext.openPanel("workstation-notes");
  args.executionContext.focusPanel("workstation-notes");
  args.executionContext.openPanel("workstation-clipboard-history");
  args.executionContext.focusPanel("workstation-clipboard-history");
  args.executionContext.openPanel("workstation-workflow-timeline");
  args.executionContext.focusPanel("workstation-workflow-timeline");
  args.executionContext.openPanel("agi-essence-console");
  args.executionContext.focusPanel("agi-essence-console");
  emitHelixWorkstationProceduralStep({
    traceId: args.traceId,
    step: "open_note_panel",
    panelId: "workstation-notes",
    topic: args.workflowArgs.topic,
  });
  pushReceipt({
    panel_id: "workstation-notes",
    action_id: "open_note_panel",
    ok: true,
    started_at: nowIso(),
    duration_ms: Math.max(0, Date.now() - panelStartMs),
    message: "Opened docs, notes, clipboard history, and timeline panels.",
    artifact: { topic: args.workflowArgs.topic, note_title: args.workflowArgs.note_title },
  });

  const candidatePaths = Array.from(
    new Set(
      [findBestDocForTopic(args.workflowArgs.topic)?.route, findRandomPaperForTopic(args.workflowArgs.topic)?.route, "/docs/papers.md"].filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
      ),
    ),
  );

  const collectedSnippets: TopicSnippet[] = [];
  emitHelixWorkstationProceduralStep({
    traceId: args.traceId,
    step: "start_note",
    panelId: "workstation-notes",
    topic: args.workflowArgs.note_title,
  });

  for (const path of candidatePaths) {
    const startedAtMs = Date.now();
    const markdown = await fetchLocalDoc(path);
    if (!markdown) {
      pushReceipt({
        panel_id: "docs-viewer",
        action_id: "find_topic_sections",
        ok: false,
        started_at: nowIso(),
        duration_ms: Math.max(0, Date.now() - startedAtMs),
        message: `Failed to load ${path}`,
        artifact: { path },
      });
      continue;
    }
    const snippets = extractTopicSnippetsFromMarkdown({
      markdown,
      path,
      topic: args.workflowArgs.topic,
      maxMatches: args.workflowArgs.max_matches,
    });
    for (const snippet of snippets) {
      emitHelixWorkstationProceduralStep({
        traceId: args.traceId,
        step: "highlight_copy",
        panelId: "docs-viewer",
        docPath: snippet.path,
        topic: snippet.heading,
      });
      const copyOk = await writeClipboardWithReceipt({
        text: snippet.excerpt,
        source: "workflow.observable_research.copy_section",
        traceId: args.traceId,
        meta: {
          path: snippet.path,
          heading: snippet.heading,
          citation_id: snippet.citation.id,
        },
      });
      if (copyOk) {
        recordClipboardReceipt({
          direction: "paste",
          text: snippet.excerpt,
          source: "workflow.observable_research.paste_note",
          traceId: args.traceId,
          meta: {
            note_title: args.workflowArgs.note_title,
            citation_id: snippet.citation.id,
          },
        });
      }
      emitHelixWorkstationProceduralStep({
        traceId: args.traceId,
        step: "paste_note",
        panelId: "workstation-notes",
        docPath: snippet.path,
        topic: snippet.heading,
      });
      pushReceipt({
        panel_id: "docs-viewer",
        action_id: "copy_section_to_note",
        ok: true,
        started_at: nowIso(),
        duration_ms: Math.max(0, Date.now() - startedAtMs),
        message: `Copied "${snippet.heading}" to note draft.`,
        artifact: snippet,
      });
      collectedSnippets.push(snippet);
      if (collectedSnippets.length >= args.workflowArgs.max_matches) break;
    }
    if (collectedSnippets.length >= args.workflowArgs.max_matches) break;
  }

  const noteId = `note:${args.jobId}`;
  const noteCitations = Array.from(
    new Map(collectedSnippets.map((snippet) => [snippet.citation.id, snippet.citation])).values(),
  );
  const noteSnippets: WorkstationNoteSnippet[] = collectedSnippets.map((snippet) => ({
    id: snippet.id,
    citation_id: snippet.citation.id,
    excerpt: snippet.excerpt,
  }));
  const noteBody =
    collectedSnippets.length > 0
      ? collectedSnippets
          .map(
            (snippet, index) =>
              `${index + 1}. ${snippet.heading}\nSource: ${snippet.path}\nCitation: ${snippet.citation.id} [${snippet.citation.start_offset}-${snippet.citation.end_offset}]\nExcerpt: ${snippet.excerpt}`,
          )
          .join("\n\n")
      : `No topic snippets found for "${args.workflowArgs.topic}".`;

  const savedNote = useWorkstationNotesStore.getState().upsertWorkflowNote({
    id: noteId,
    title: args.workflowArgs.note_title,
    topic: args.workflowArgs.topic,
    body: noteBody,
    citations: noteCitations,
    snippets: noteSnippets,
    trace_id: args.traceId,
  });

  emitHelixWorkstationProceduralStep({
    traceId: args.traceId,
    step: "save_note",
    panelId: "workstation-notes",
    topic: noteId,
  });

  pushReceipt({
    panel_id: "workstation-notes",
    action_id: "save_note",
    ok: true,
    started_at: nowIso(),
    duration_ms: 0,
    message: `Saved temporary note ${noteId}.`,
    artifact: {
      note_id: noteId,
      note_title: savedNote.title,
      note_body: noteBody,
      snippets_count: collectedSnippets.length,
      citations_count: noteCitations.length,
    },
  });

  const noteLink = `note://${noteId}`;
  const citationsJson = JSON.stringify(
    noteCitations.map((citation) => ({
      id: citation.id,
      path: citation.path,
      heading: citation.heading,
      start_offset: citation.start_offset,
      end_offset: citation.end_offset,
    })),
    null,
    2,
  );

  const comparePrompt = [
    args.workflowArgs.compare_instruction,
    "",
    `Topic: ${args.workflowArgs.topic}`,
    `Temporary note link: ${noteLink}`,
    `Note id: ${noteId}`,
    `Note title: ${savedNote.title}`,
    "",
    "Citation requirement:",
    "In the final explanation, every major claim must cite one or more citation IDs from the list below.",
    "Output a dedicated 'Citations used' section that maps claim -> citation IDs.",
    "",
    "Section-level citations (required source set):",
    citationsJson,
    "",
    "Collected note excerpts:",
    noteBody,
  ].join("\n");

  emitHelixWorkstationProceduralStep({
    traceId: args.traceId,
    step: "attach_note_to_chat",
    panelId: "agi-essence-console",
    topic: noteId,
  });
  emitHelixWorkstationProceduralStep({
    traceId: args.traceId,
    step: "compare_topics_start",
    panelId: "agi-essence-console",
    topic: args.workflowArgs.topic,
  });

  launchHelixAskPrompt({
    question: comparePrompt,
    autoSubmit: true,
    panelId: "agi-essence-console",
    bypassWorkstationDispatch: true,
    forceReasoningDispatch: true,
    suppressWorkstationPayloadActions: true,
    answerContract: {
      schema: "helix.ask.answer_contract.v1",
      source: "docs_viewer",
      mode: "explain_paper",
      strict_sections: true,
      min_tokens: 1100,
      sections: [
        { id: "topic_overlap", heading: "Topic Overlap", required: true, synonyms: ["Shared Ground"] },
        { id: "topic_differences", heading: "Topic Differences", required: true, synonyms: ["Contrasts"] },
        { id: "explanation", heading: "Explanation", required: true, synonyms: ["Synthesis"] },
        { id: "citations_used", heading: "Citations used", required: true, synonyms: ["Citation Map"] },
      ],
    },
  });

  pushReceipt({
    panel_id: "agi-essence-console",
    action_id: "launch_compare_reasoning",
    ok: true,
    started_at: nowIso(),
    duration_ms: 0,
    message: "Attached temporary note context and dispatched compare/explain reasoning.",
    artifact: {
      topic: args.workflowArgs.topic,
      note_id: noteId,
      note_link: noteLink,
      snippets_count: collectedSnippets.length,
      citations_count: noteCitations.length,
      compare_instruction: args.workflowArgs.compare_instruction,
    },
  });

  return receipts;
}

export async function runWorkstationJob(args: {
  contextId: string;
  payload: WorkstationJobPayload;
  executionContext: HelixPanelActionExecutionContext;
}): Promise<WorkstationJobExecutionResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const jobId = args.payload.job_id?.trim() || `job:${crypto.randomUUID()}`;
  const title = args.payload.title?.trim() || "Workstation Job";
  const objective = args.payload.objective?.trim() || "Execute job-ready panel actions.";
  const traceId = /^workstation-action:/i.test(jobId) ? jobId : `workstation-job:${jobId}`;

  emitJobLiveEvent({
    contextId: args.contextId,
    traceId,
    kind: "job_started",
    content: `Started job "${title}". Objective: ${objective}`,
  });

  const panelIds = normalizePanels(args.payload.preferred_panels);
  const maxStepsRaw = Number(args.payload.max_steps ?? 4);
  const maxSteps = Number.isFinite(maxStepsRaw) ? Math.max(1, Math.min(12, Math.floor(maxStepsRaw))) : 4;
  let receipts: WorkstationJobStepReceipt[] = [];

  if (args.payload.workflow === "observable_research_pipeline") {
    const workflowArgs = parseObservableResearchWorkflowArgs(
      objective,
      asRecord(args.payload.workflow_args ?? undefined) ?? undefined,
    );
    receipts = await runObservableResearchWorkflow({
      contextId: args.contextId,
      traceId,
      jobId,
      objective,
      workflowArgs,
      executionContext: args.executionContext,
    });
  } else {
    receipts = [];

    for (let index = 0; index < panelIds.length && receipts.length < maxSteps; index += 1) {
      const panelId = panelIds[index];
      const actionId = chooseActionId(panelId);
      if (!actionId) continue;
      const stepStartMs = Date.now();
      const result = executeHelixPanelAction(
        {
          panel_id: panelId,
          action_id: actionId,
        },
        args.executionContext,
      );
      const durationMs = Math.max(0, Date.now() - stepStartMs);
      const receipt: WorkstationJobStepReceipt = {
        step: receipts.length + 1,
        panel_id: panelId,
        action_id: actionId,
        ok: result.ok,
        started_at: new Date(stepStartMs).toISOString(),
        duration_ms: durationMs,
        message: result.message,
        artifact: result.artifact ?? null,
      };
      receipts.push(receipt);

      emitJobLiveEvent({
        contextId: args.contextId,
        traceId,
        kind: "job_step_receipt",
        step: receipt.step,
        panelId,
        actionId,
        ok: result.ok,
        durationMs: durationMs,
        artifact: result.artifact ?? null,
        content: `Step ${receipt.step}: ${panelId}.${actionId} -> ${result.ok ? "ok" : "fail"}${result.message ? ` (${result.message})` : ""}`,
      });
    }
  }

  const completedAt = new Date().toISOString();
  const ok = receipts.length > 0 && receipts.every((receipt) => receipt.ok);
  emitJobLiveEvent({
    contextId: args.contextId,
    traceId,
    kind: "job_completed",
    ok,
    content: `Completed job "${title}" with ${receipts.length} step(s). Status: ${ok ? "ok" : "partial/fail"}.`,
  });

  return {
    job_id: jobId,
    title,
    objective,
    started_at: startedAt,
    completed_at: completedAt,
    ok,
    step_receipts: receipts,
  };
}
