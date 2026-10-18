import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";

import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";
import { useScientificCalculatorLiveSourceStore } from "@/store/useScientificCalculatorLiveSourceStore";
import { useSituationRoomGraphStore } from "@/store/useSituationRoomGraphStore";
import { useSituationRoomJobStore } from "@/store/useSituationRoomJobStore";
import { useSituationRoomStore } from "@/store/useSituationRoomStore";
import { useWorkstationClipboardStore } from "@/store/useWorkstationClipboardStore";
import { useWorkstationSessionMemoryStore } from "@/store/useWorkstationSessionMemoryStore";
import { useNarratorStore } from "@/store/useNarratorStore";
import { useWorkstationNotesStore } from "@/store/useWorkstationNotesStore";
import { useWorkstationProcessGraphStore } from "@/store/useWorkstationProcessGraphStore";
import { useTheoryMapOverlayStore } from "@/store/useTheoryMapOverlayStore";
import { useTheoryBadgeGraphPanelStore } from "@/store/useTheoryBadgeGraphPanelStore";
import { isScientificCalculatorStepTraceArtifactV1 } from "@shared/contracts/scientific-calculator-step-schema.v1";
import { SHARED_INTERFACE_LANGUAGE_CODES } from "@shared/interface-language-codes";
import { isTheoryBadgePlaybackArtifactV1 } from "@shared/contracts/theory-badge-playback.v1";
import { isTheoryCalculatorLoadoutV1 } from "@shared/contracts/theory-calculator-loadout.v1";
import { isTheoryContextReflectionV1 } from "@shared/contracts/theory-context-reflection.v1";
import { isTheoryContextExplanationPlanV1 } from "@shared/contracts/theory-context-explanation-plan.v1";
import { isHelixTheoryContextReflectionToolReceiptV1 } from "@shared/contracts/helix-theory-context-reflection-tool-receipt.v1";
import { WORKSTATION_V1_PANEL_CAPABILITIES } from "@/lib/workstation/panelCapabilities";
import { SCIENTIFIC_CALCULATOR_DRAFT_KEY } from "@/lib/scientific-calculator/events";

const hoisted = vi.hoisted(() => {
  const callOrder: string[] = [];
  return {
    callOrder,
    openDocPanelMock: vi.fn((_: unknown) => {
      callOrder.push("openDocPanel");
    }),
    launchHelixAskPromptMock: vi.fn(),
  };
});

vi.mock("@/lib/docs/openDocPanel", () => ({
  openDocPanel: hoisted.openDocPanelMock,
}));
vi.mock("@/lib/helix/ask-prompt-launch", () => ({
  launchHelixAskPrompt: hoisted.launchHelixAskPromptMock,
}));
vi.mock("@/lib/helix/display-audio-capture", () => ({
  startDisplayAudioSituationSession: vi.fn(),
}));
vi.mock("@/lib/helix/mic-audio-situation-capture", () => ({
  startMicAudioSituationSession: vi.fn(),
}));

import { executeHelixPanelAction } from "@/lib/workstation/panelActionAdapters";
import {
  clearWorkstationDebugEvents,
  getWorkstationDebugSnapshot,
  setWorkstationDebugEnabled,
} from "@/lib/helix/workstation-debug";
import {
  clearDottieVoiceDebugClips,
  getDottieVoiceDebugClipsSnapshot,
} from "@/lib/helix/dottie-voice-debug-clips";

function actionContext() {
  return {
    openPanel: () => undefined,
    focusPanel: () => undefined,
    closePanel: () => undefined,
    openSettings: () => undefined,
  };
}

function installWindowStorageStub() {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    clear: vi.fn(() => {
      storage.clear();
    }),
  };
  class TestCustomEvent<T = unknown> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) {
      super(type);
      this.detail = init?.detail as T;
    }
  }
  vi.stubGlobal("CustomEvent", TestCustomEvent);
  vi.stubGlobal("window", {
    localStorage,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

describe("panelActionAdapters", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installWindowStorageStub();
    hoisted.callOrder.length = 0;
    hoisted.openDocPanelMock.mockClear();
    hoisted.launchHelixAskPromptMock.mockClear();
    clearDottieVoiceDebugClips();
    clearWorkstationDebugEvents();
    setWorkstationDebugEnabled(false);
    window.localStorage.clear();
    useWorkstationNotesStore.setState({ notes: {}, order: [], active_note_id: undefined });
    useWorkstationClipboardStore.setState({ receipts: [] });
    useWorkstationSessionMemoryStore.setState({ panelScroll: {}, drafts: {} });
    useScientificCalculatorStore.setState({
      currentLatex: "",
      history: [],
      lastSolve: null,
      lastArtifactV1: null,
      lastTheoryLoadout: null,
      activeTheoryLoadoutItemIndex: null,
      lastSetup: null,
      calculatorReceipts: [],
      lastCalculatorReceipt: null,
      steps: [],
      debugEvents: [],
    });
    useScientificCalculatorLiveSourceStore.getState().stopPrimeStream();
    useTheoryMapOverlayStore.getState().clearOverlay();
    useTheoryMapOverlayStore.getState().clearLiveAnswerContext();
    useTheoryBadgeGraphPanelStore.getState().resetPanelMemory();
    useScientificCalculatorLiveSourceStore.setState({
      status: "idle",
      sourceId: "source:calculator-prime-stream",
      environmentId: null,
      sourceEquation: "",
      equationContext: "",
      calculatorSetup: null,
      latestTick: null,
      liveWorkbenchExpression: "",
      liveSolveSteps: [],
      activeLiveStepId: null,
      debugLog: [],
    });
    useSituationRoomStore.getState().reset();
    useSituationRoomJobStore.getState().reset();
    useSituationRoomGraphStore.getState().reset();
    useWorkstationProcessGraphStore.getState().reset();
    useNarratorStore.getState().clearFeed();
    useNarratorStore.getState().resetPolicies();
  });

  it("returns receipt-shaped observations for panel open/focus/close actions", () => {
    const opened = executeHelixPanelAction(
      { panel_id: "docs-viewer", action_id: "open" },
      actionContext(),
    );
    expect(opened.ok).toBe(true);
    expect(opened.artifact).toMatchObject({
      kind: "workspace_action_receipt",
      schema: "helix.workspace_action_receipt.v1",
      panel_id: "docs-viewer",
      action_id: "open",
      status: "completed",
      state_observed: true,
    });

    const focused = executeHelixPanelAction(
      { panel_id: "docs-viewer", action_id: "focus" },
      actionContext(),
    );
    expect(focused.artifact).toMatchObject({
      kind: "workspace_action_receipt",
      panel_id: "docs-viewer",
      action_id: "focus",
      state_observed: true,
    });

    const closed = executeHelixPanelAction(
      { panel_id: "docs-viewer", action_id: "close" },
      actionContext(),
    );
    expect(closed.artifact).toMatchObject({
      kind: "workspace_action_receipt",
      panel_id: "docs-viewer",
      action_id: "close",
      state_observed: true,
    });
  });

  it("projects calculator gateway solve observations into the visible calculator state without answer authority", () => {
    const opened: string[] = [];
    const result = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "show_gateway_solve",
        args: {
          expression: "(18+6)*3",
          normalized_expression: "(18+6)*3",
          result: "72",
          source_capability: "scientific-calculator.solve_expression",
          observation_ref: "ask:test:calculator-projection:scientific-calculator.solve_expression",
        },
      },
      {
        openPanel: (panelId) => opened.push(`open:${panelId}`),
        focusPanel: (panelId) => opened.push(`focus:${panelId}`),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    expect(opened).toEqual(["open:scientific-calculator", "focus:scientific-calculator"]);
    expect(result.artifact).toMatchObject({
      kind: "calculator_gateway_solve_projection",
      expression: "(18+6)*3",
      normalized_expression: "(18+6)*3",
      result_text: "72",
      source_capability: "scientific-calculator.solve_expression",
      gateway_observation_authority: true,
      panel_generated_answer: false,
      assistant_answer: false,
      terminal_eligible: false,
      produced_calculator_receipt: true,
      calculator_receipt_status: "solved",
    });
    const calculatorState = useScientificCalculatorStore.getState();
    expect(calculatorState.currentLatex).toBe("(18+6)*3");
    expect(calculatorState.lastSolve).toMatchObject({
      ok: true,
      input_latex: "(18+6)*3",
      normalized_expression: "(18+6)*3",
      result_text: "72",
      trace: {
        route: "helix_workstation_gateway_observation",
        delegatedTo: "scientific-calculator.solve_expression",
      },
    });
    expect(calculatorState.lastCalculatorReceipt).toMatchObject({
      schema: "helix.scientific_calculator_receipt.v1",
      status: "solved",
      expression: "(18+6)*3",
      result_text: "72",
    });
    expect(result.artifact?.calculator_receipt_ref).toBe(calculatorState.lastCalculatorReceipt?.receipt_id);
    expect(calculatorState.debugEvents[0]).toMatchObject({
      action_id: "solve_expression",
      source: "workstation_action",
      input_latex: "(18+6)*3",
      result_text: "72",
      normalized_expression: "(18+6)*3",
      message: "solve_completed",
    });
  });

  it("prefills symbolic calculator expressions without creating a solve result", () => {
    const opened: string[] = [];
    const result = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "prefill_expression",
        args: {
          expression: "E = h * f",
          source_path: "paper:eq1",
        },
      },
      {
        openPanel: (panelId) => opened.push(`open:${panelId}`),
        focusPanel: (panelId) => opened.push(`focus:${panelId}`),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    expect(opened).toEqual(["open:scientific-calculator", "focus:scientific-calculator"]);
    expect(result.artifact).toMatchObject({
      kind: "calculator_expression_prefill",
      schema: "helix.calculator_expression_prefill_receipt.v1",
      latex: "E = h * f",
      source_path: "paper:eq1",
      produced_calculator_receipt: true,
      calculator_receipt_status: "blocked",
      produced_numeric_value_evidence: false,
      terminal_eligible: false,
      assistant_answer: false,
      classification: {
        calculation_type: "symbolic_equation",
        missing_variables: ["f"],
        blocked_reasons: ["missing_variable_bindings"],
      },
    });
    const calculatorState = useScientificCalculatorStore.getState();
    expect(calculatorState.currentLatex).toBe("E = h * f");
    expect(calculatorState.lastSolve).toBeNull();
    expect(calculatorState.lastCalculatorReceipt).toMatchObject({
      schema: "helix.scientific_calculator_receipt.v1",
      status: "blocked",
      expression: "E = h * f",
      missing_bindings: ["variable:f"],
      blockers: ["missing_variable_bindings"],
    });
    expect(result.artifact?.calculator_receipt_ref).toBe(calculatorState.lastCalculatorReceipt?.receipt_id);
    expect(calculatorState.debugEvents[1]).toMatchObject({
      action_id: "prefill_expression",
      source: "workstation_action",
      input_latex: "E = h * f",
      message: "latex_ingested",
    });
  });

  it("routes narrator source policy and confirm-speak actions as non-answer receipts", () => {
    const policyResult = executeHelixPanelAction(
      {
        panel_id: "narrator",
        action_id: "narrator.set_source_policy",
        args: {
          source_kind: "image_lens",
          delivery_mode: "visible_only",
          enabled: true,
        },
      },
      actionContext(),
    );
    expect(policyResult.ok).toBe(true);
    expect(policyResult.artifact).toMatchObject({
      kind: "narrator_source_policy_receipt",
      assistant_answer: false,
      terminal_eligible: false,
    });

    const event = useNarratorStore.getState().publishEvent({
      sourceKind: "image_lens",
      sourceId: "image-lens:event:adapter",
      text: "Image Lens narrator event.",
      authority: "live_observation",
      assistant_answer: false,
      terminal_eligible: false,
      evidenceRefs: ["image-lens:event:adapter"],
      rawContentIncluded: false,
      speakable: true,
      requestedDeliveryMode: "confirm_to_speak",
      defaultDeliveryMode: "visible_only",
    });
    expect(event).not.toBeNull();

    const confirmResult = executeHelixPanelAction(
      {
        panel_id: "narrator",
        action_id: "narrator.confirm_speak_event",
        args: { event_id: event?.eventId },
      },
      actionContext(),
    );
    expect(confirmResult.ok).toBe(true);
    expect(confirmResult.artifact).toMatchObject({
      kind: "narrator_confirm_speak_receipt",
      assistant_answer: false,
      terminal_eligible: false,
      panel_generated_answer: false,
    });

    const sayResult = executeHelixPanelAction(
      {
        panel_id: "narrator",
        action_id: "narrator.say",
        args: {
          text: "Narration is on for the translation stream.",
          source_kind: "helix_console",
          source_id: "helix_ask:goal-context",
          evidence_refs: ["goal_context_update:translation"],
          delivery_mode: "confirm_to_speak",
        },
      },
      actionContext(),
    );
    expect(sayResult.ok).toBe(true);
    expect(sayResult.artifact).toMatchObject({
      kind: "narrator_say_receipt",
      published: true,
      assistant_answer: false,
      terminal_eligible: false,
      panel_generated_answer: false,
    });

    const bindResult = executeHelixPanelAction(
      {
        panel_id: "narrator",
        action_id: "narrator.bind_stream",
        args: {
          source_ref: "source:browser-audio",
          stream_kind: "translated_transcript",
          delivery_mode: "visible_only",
          voice_policy: "confirm_speak_required",
        },
      },
      actionContext(),
    );
    expect(bindResult.ok).toBe(true);
    expect(bindResult.artifact).toMatchObject({
      kind: "narrator_bind_stream_receipt",
      source_ref: "source:browser-audio",
      stream_kind: "translated_transcript",
      assistant_answer: false,
      terminal_eligible: false,
      panel_generated_answer: false,
    });

    const probeResult = executeHelixPanelAction(
      {
        panel_id: "narrator",
        action_id: "narrator.debug_auto_speak_probe",
        args: { trace_id: "trace:narrator-probe" },
      },
      actionContext(),
    );
    expect(probeResult.ok).toBe(true);
    expect(probeResult.artifact).toMatchObject({
      kind: "narrator_debug_auto_speak_probe_receipt",
      published: true,
      trace_id: "trace:narrator-probe",
      assistant_answer: false,
      terminal_eligible: false,
      panel_generated_answer: false,
    });
  });

  it("sets Wolof interface language through the account-session workstation action", () => {
    const opened: string[] = [];
    setWorkstationDebugEnabled(true);
    const result = executeHelixPanelAction(
      {
        panel_id: "account-session",
        action_id: "set_interface_language",
        args: { language: "wo" },
      },
      {
        openPanel: (panelId) => opened.push(`open:${panelId}`),
        focusPanel: (panelId) => opened.push(`focus:${panelId}`),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    expect(opened).toEqual(["open:account-session", "focus:account-session"]);
    expect(JSON.parse(window.localStorage.getItem("helix-start-settings") ?? "{}")).toMatchObject({
      interfaceLanguage: "wo",
    });
    expect(result.artifact).toMatchObject({
      kind: "workspace_action_receipt",
      schema: "helix.workspace_action_receipt.v1",
      panel_id: "account-session",
      action_id: "set_interface_language",
      status: "completed",
      preference_key: "interfaceLanguage",
      language: "wo",
      bcp47: "wo",
      translation_mode: "procedural_catalog",
      assistant_answer: false,
    });
    expect(getWorkstationDebugSnapshot().events.at(-1)).toMatchObject({
      channel: "account_session",
      action: "interface_language.changed",
      detail: {
        language: "wo",
        bcp47: "wo",
      },
    });
  });

  it("rejects unsupported interface language action values without changing storage", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "account-session",
        action_id: "set_interface_language",
        args: { language: "zz" },
      },
      actionContext(),
    );

    expect(result.ok).toBe(false);
    expect(window.localStorage.getItem("helix-start-settings")).toBeNull();
    expect(result.artifact).toMatchObject({
      kind: "workspace_action_receipt",
      panel_id: "account-session",
      action_id: "set_interface_language",
      status: "failed",
      reason: "unsupported_language",
      supported_languages: [...SHARED_INTERFACE_LANGUAGE_CODES],
    });
  });

  it("opens/focuses docs panel before applying read intent", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "docs-viewer",
        action_id: "open_doc_and_read",
        args: { path: "/docs/papers.md", topic: "sun" },
      },
      {
        openPanel: () => {
          hoisted.callOrder.push("openPanel");
        },
        focusPanel: () => {
          hoisted.callOrder.push("focusPanel");
        },
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.action_id).toBe("open_doc_and_read");
    expect(hoisted.callOrder).toEqual(["openPanel", "focusPanel", "openDocPanel"]);
  });

  it("returns same-turn docs observations for manual summarize/explain docs actions", () => {
    const summarizeResult = executeHelixPanelAction(
      {
        panel_id: "docs-viewer",
        action_id: "summarize_doc",
        args: { path: "/docs/papers.md" },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(summarizeResult.ok).toBe(true);
    expect(summarizeResult.action_id).toBe("summarize_doc");
    expect(summarizeResult.artifact).toMatchObject({
      kind: "doc_summary",
      path: "/docs/papers.md",
      observation_scope: "manual_panel_action",
      runtime_owned: false,
      same_turn_observation: true,
      nested_ask_launch: false,
      launched_prompt: false,
    });
    expect(hoisted.launchHelixAskPromptMock).not.toHaveBeenCalled();

    const explainResult = executeHelixPanelAction(
      {
        panel_id: "docs-viewer",
        action_id: "explain_paper",
        args: { path: "/docs/papers.md", selected_text: "Key excerpt" },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(explainResult.ok).toBe(true);
    expect(explainResult.artifact).toMatchObject({
      kind: "doc_summary",
      mode: "explain_paper",
      path: "/docs/papers.md",
      selected_text: "Key excerpt",
      observation_scope: "manual_panel_action",
      runtime_owned: false,
      same_turn_observation: true,
      nested_ask_launch: false,
      launched_prompt: false,
    });
    expect(hoisted.launchHelixAskPromptMock).not.toHaveBeenCalled();
  });

  it("returns same-turn docs observations for runtime-owned summarize and locate actions", () => {
    const summarizeResult = executeHelixPanelAction(
      {
        panel_id: "docs-viewer",
        action_id: "summarize_doc",
        args: {
          path: "/docs/papers.md",
          selected_text: "This paper introduces the useful caveats.",
          agent_step_decision_ref: "agent-step-doc-summary",
        },
      },
      actionContext(),
    );

    expect(summarizeResult.ok).toBe(true);
    expect(summarizeResult.artifact).toMatchObject({
      kind: "doc_summary",
      path: "/docs/papers.md",
      decision_ref: "agent-step-doc-summary",
      observation_scope: "runtime_selected_capability",
      runtime_owned: true,
      same_turn_observation: true,
      nested_ask_launch: false,
      launched_prompt: false,
      manual_ui_launch_only: false,
    });
    expect(hoisted.launchHelixAskPromptMock).not.toHaveBeenCalled();

    const locateResult = executeHelixPanelAction(
      {
        panel_id: "docs-viewer",
        action_id: "locate_in_doc",
        args: {
          path: "/docs/papers.md",
          query: "caveats",
          selected_text: "Useful caveats appear in this selected section.",
          agent_step_decision_ref: "agent-step-doc-location",
        },
      },
      actionContext(),
    );

    expect(locateResult.ok).toBe(true);
    expect(locateResult.artifact).toMatchObject({
      kind: "doc_location_matches",
      path: "/docs/papers.md",
      query: "caveats",
      decision_ref: "agent-step-doc-location",
      observation_scope: "runtime_selected_capability",
      runtime_owned: true,
      same_turn_observation: true,
      nested_ask_launch: false,
      launched_prompt: false,
    });
    expect((locateResult.artifact?.matches as unknown[] | undefined)?.length).toBe(1);
    expect(hoisted.launchHelixAskPromptMock).not.toHaveBeenCalled();
  });

  it("creates and appends notes with deterministic artifacts", () => {
    const create = executeHelixPanelAction(
      {
        panel_id: "workstation-notes",
        action_id: "create_note",
        args: { title: "Mission Notes", topic: "nhm2" },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(create.ok).toBe(true);
    expect(create.artifact?.note_id).toBe("note:mission-notes");

    const append = executeHelixPanelAction(
      {
        panel_id: "workstation-notes",
        action_id: "append_to_note",
        args: { title: "Mission Notes", text: "new evidence line" },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(append.ok).toBe(true);
    expect(append.artifact?.note_id).toBe("note:mission-notes");
    const note = useWorkstationNotesStore.getState().notes["note:mission-notes"];
    expect(note?.body).toContain("new evidence line");
  });

  it("does not create an untitled note when append target resolution fails", () => {
    const append = executeHelixPanelAction(
      {
        panel_id: "workstation-notes",
        action_id: "append_to_note",
        args: { text: "orphaned line" },
      },
      actionContext(),
    );

    expect(append.ok).toBe(false);
    expect(append.artifact).toMatchObject({
      kind: "note_mutation_failure",
      error_code: "note_target_unresolved",
      mutation_applied: false,
      requested_action: "append_to_note",
    });
    expect(Object.keys(useWorkstationNotesStore.getState().notes)).toEqual([]);

    const explicitCreate = executeHelixPanelAction(
      {
        panel_id: "workstation-notes",
        action_id: "append_to_note",
        args: {
          title: "New Target Note",
          text: "created only because the model explicitly requested it",
          create_if_missing: true,
        },
      },
      actionContext(),
    );

    expect(explicitCreate.ok).toBe(true);
    expect(explicitCreate.artifact).toMatchObject({
      note_id: "note:new-target-note",
      created_note: true,
    });
    expect(useWorkstationNotesStore.getState().notes["note:new-target-note"]?.body).toContain(
      "created only because the model explicitly requested it",
    );
  });

  it("requires confirmation for destructive note and clipboard actions", () => {
    const notesState = useWorkstationNotesStore.getState();
    notesState.upsertWorkflowNote({
      id: "note:test",
      title: "Test",
      topic: "test",
      body: "abc",
      citations: [],
      snippets: [],
    });
    useWorkstationClipboardStore.getState().addReceipt({
      direction: "copy",
      text: "alpha",
      source: "spec",
    });

    const deleteBlocked = executeHelixPanelAction(
      {
        panel_id: "workstation-notes",
        action_id: "delete_note",
        args: { note_id: "note:test" },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(deleteBlocked.ok).toBe(false);
    expect(deleteBlocked.artifact?.requires_confirmation).toBe(true);

    const clearBlocked = executeHelixPanelAction(
      {
        panel_id: "workstation-clipboard-history",
        action_id: "clear_history",
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(clearBlocked.ok).toBe(false);
    expect(clearBlocked.artifact?.requires_confirmation).toBe(true);
  });

  it("supports clipboard read/write and receipt-to-note copy", () => {
    useWorkstationClipboardStore.getState().addReceipt({
      id: "clip:latest",
      direction: "copy",
      text: "latest payload",
      source: "spec",
    });
    const notesState = useWorkstationNotesStore.getState();
    notesState.upsertWorkflowNote({
      id: "note:target",
      title: "Target",
      topic: "target",
      body: "",
      citations: [],
      snippets: [],
    });

    const read = executeHelixPanelAction(
      {
        panel_id: "workstation-clipboard-history",
        action_id: "read_clipboard",
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(read.ok).toBe(true);
    expect(read.artifact?.text).toBe("latest payload");

    const write = executeHelixPanelAction(
      {
        panel_id: "workstation-clipboard-history",
        action_id: "write_clipboard",
        args: { text: "copied text" },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(write.ok).toBe(true);
    expect(write.artifact?.direction).toBe("write");

    const copyToNote = executeHelixPanelAction(
      {
        panel_id: "workstation-clipboard-history",
        action_id: "copy_receipt_to_note",
        args: { note_id: "note:target", receipt_id: "clip:latest" },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(copyToNote.ok).toBe(true);
    expect(copyToNote.artifact?.note_id).toBe("note:target");
    expect(useWorkstationNotesStore.getState().notes["note:target"]?.body).toContain("latest payload");

    const copySelectionToNote = executeHelixPanelAction(
      {
        panel_id: "workstation-clipboard-history",
        action_id: "copy_selection_to_note",
        args: { note_id: "note:target" },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(copySelectionToNote.ok).toBe(true);
    expect(copySelectionToNote.artifact?.source).toBe("clipboard_receipt");
  });

  it("returns process graph context packs and escaped SVG without executing other panel actions", () => {
    const processGraphStore = useWorkstationProcessGraphStore.getState();
    processGraphStore.dispatch({
      type: "panel.opened",
      panelId: "docs-viewer",
      label: `<script>alert("x")</script>`,
      ts: "2026-05-15T10:00:00.000Z",
    });
    processGraphStore.dispatch({
      type: "tool.completed",
      tool: "docs-viewer.search_docs",
      traceId: "trace-1",
      panelId: "docs-viewer",
      artifact: { kind: "doc_context", title: "Docs result" },
      ts: "2026-05-15T10:01:00.000Z",
    });
    processGraphStore.dispatch({
      type: "panel.opened",
      panelId: "unsafe-panel",
      label: `<script>alert("x")</script>`,
      ts: "2026-05-15T10:02:00.000Z",
    });
    const context = {
      openPanel: vi.fn(),
      focusPanel: vi.fn(),
      closePanel: vi.fn(),
      openSettings: vi.fn(),
    };

    const contextPack = executeHelixPanelAction(
      {
        panel_id: "workstation-process-graph",
        action_id: "get_context_pack",
      },
      context,
    );
    expect(contextPack.ok).toBe(true);
    expect(contextPack.artifact?.kind).toBe("workstation_process_graph_context_pack");
    expect(context.openPanel).not.toHaveBeenCalled();
    expect(context.focusPanel).not.toHaveBeenCalled();

    const compactSnapshot = executeHelixPanelAction(
      {
        panel_id: "workstation-process-graph",
        action_id: "get_snapshot",
        args: { scope: "compact" },
      },
      context,
    );
    expect(compactSnapshot.artifact?.kind).toBe("workstation_process_graph_context_pack");

    const focus = executeHelixPanelAction(
      {
        panel_id: "workstation-process-graph",
        action_id: "focus_node",
        args: { node_id: "panel:docs-viewer" },
      },
      context,
    );
    expect(focus.ok).toBe(true);
    expect(useWorkstationProcessGraphStore.getState().graph.view.focusedNodeId).toBe("panel:docs-viewer");

    const svg = executeHelixPanelAction(
      {
        panel_id: "workstation-process-graph",
        action_id: "export_svg",
      },
      context,
    );
    expect(String(svg.artifact?.svg ?? "")).not.toContain("<script>");
    expect(String(svg.artifact?.svg ?? "")).toContain("&lt;script&gt;");
  });

  it("supports scientific calculator ingest and solve actions", () => {
    const ingest = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "ingest_latex",
        args: {
          latex: "x^2-4=0",
          source_path: "/docs/papers.md",
          calculator_setup: {
            schema: "helix.calculator_setup_context.v1",
            expression: "x^2-4=0",
            display_latex: "x^2-4=0",
            subgoal: "Solve the quadratic equation.",
            domain: "generic",
            variables: [],
          },
        },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(ingest.ok).toBe(true);
    expect(ingest.artifact?.latex).toBe("x^2-4=0");
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("x^2-4=0");
    expect(useScientificCalculatorStore.getState().currentLatex).not.toContain("Solve the quadratic equation");
    expect(ingest.artifact?.calculator_setup).toEqual(
      expect.objectContaining({
        subgoal: "Solve the quadratic equation.",
        expression: "x^2-4=0",
      }),
    );
    expect(ingest.artifact?.debug_event).toEqual(
      expect.objectContaining({
        panel_id: "scientific-calculator",
        action_id: "ingest_latex",
        source: "workstation_action",
        calculator_setup: expect.objectContaining({
          subgoal: "Solve the quadratic equation.",
        }),
      }),
    );

    const solve = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "solve_with_steps",
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(solve.ok).toBe(true);
    expect(typeof solve.artifact?.result_text).toBe("string");
    expect((solve.artifact?.steps_count as number) > 0).toBe(true);
    expect(Array.isArray(solve.artifact?.steps)).toBe(true);
    expect(isScientificCalculatorStepTraceArtifactV1(solve.artifact?.artifact_v1)).toBe(true);
    expect(solve.artifact?.result_kind).toMatch(/exact|approximate|symbolic_relation/);
    expect(typeof solve.artifact?.confidence).toBe("number");
    expect(solve.artifact).toHaveProperty("fallback_reason");
    expect(solve.artifact?.trace).toEqual(
      expect.objectContaining({
        route: "scientific-calculator/nerdamer",
        engine: "nerdamer",
        sourceOfTruth: "scientific_calculator",
      }),
    );
    expect(solve.artifact?.target_workbench).toBe("scalar");
    expect(solve.artifact?.debug_event).toEqual(
      expect.objectContaining({
        action_id: "solve_with_steps",
        source: "workstation_action",
        target_workbench: "scalar",
      }),
    );

    const copyResult = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "copy_result",
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(copyResult.ok).toBe(true);
    expect(copyResult.artifact?.debug_event).toEqual(
      expect.objectContaining({
        action_id: "copy_result",
        source: "workstation_action",
      }),
    );

    const copyDebugLog = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "copy_debug_log",
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(copyDebugLog.ok).toBe(true);
    expect(copyDebugLog.artifact?.debug_event).toEqual(
      expect.objectContaining({
        action_id: "copy_debug_log",
        source: "workstation_action",
      }),
    );
    expect(String(copyDebugLog.artifact?.text)).toContain("scientific_calculator_debug_log");
  });

  it("starts a scientific calculator equation live source with setup context", () => {
    const context = {
      openPanel: vi.fn(),
      focusPanel: vi.fn(),
      closePanel: vi.fn(),
      openSettings: vi.fn(),
    };

    const result = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "start_equation_live_source",
        args: {
          equation: "3*x+9=0",
          environment_id: "env:test",
          max_ticks: 1,
          calculator_setup: {
            schema: "helix.calculator_setup_context.v1",
            expression: "3*x+9=0",
            display_latex: "3*x+9=0",
            subgoal: "Solve a linear root as a live calculator source.",
            domain: "generic",
            variables: [],
          },
        },
      },
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.artifact).toEqual(
      expect.objectContaining({
        kind: "workstation_live_source_receipt",
        mode: "current_equation",
        source_equation: "3*x+9=0",
        equation_context: "Solve a linear root as a live calculator source.",
        calculator_setup: expect.objectContaining({
          expression: "3*x+9=0",
        }),
      }),
    );
    expect(context.openPanel).toHaveBeenCalledWith("scientific-calculator", undefined);
    expect(context.focusPanel).toHaveBeenCalledWith("scientific-calculator", undefined);
    expect(useScientificCalculatorLiveSourceStore.getState().sourceEquation).toBe("3*x+9=0");
    expect(useScientificCalculatorStore.getState().lastSetup).toEqual(
      expect.objectContaining({
        expression: "3*x+9=0",
      }),
    );
  });

  it("strips prompt prose before scientific calculator workstation solves", () => {
    const solve = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "solve_expression",
        args: {
          latex: "1.602e-19*5 with the scientific calculator, then explain what that energy means in joules",
          calculator_setup: {
            schema: "helix.calculator_setup_context.v1",
            expression: "1.602e-19*5",
            display_latex: "1.602e-19*5",
            subgoal: "Evaluate the supplied calculator expression.",
            domain: "generic",
            result_unit: "J",
            result_quantity: "energy",
            result_dimension_signature: "L^2 M T^-2",
            unit_system: "SI",
            variables: [],
          },
        },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(solve.ok).toBe(true);
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("1.602e-19*5");
    expect(solve.artifact?.result_text).toBe("8.01e-19");
    expect(solve.artifact?.result_unit).toBe("J");
    expect(solve.artifact?.result_quantity).toBe("energy");
    expect(solve.artifact?.result_dimension_signature).toBe("L^2 M T^-2");
    expect(solve.artifact?.unit_system).toBe("SI");
    expect(solve.artifact?.target_workbench).toBe("scalar");
    expect(String(solve.artifact?.normalized_expression)).not.toContain("with the scientific calculator");
  });

  it("preserves function expressions when scientific calculator workstation solves update panel input", () => {
    const expression = "((sqrt(81)+ln(e^3))*7-5^2)/2";
    useWorkstationSessionMemoryStore.getState().rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, "(81)+");

    const solve = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "solve_expression",
        args: {
          latex: `Call scientific-calculator.solve_expression with this exact expression: ${expression}`,
        },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(solve.ok).toBe(true);
    expect(useScientificCalculatorStore.getState().currentLatex).toBe(expression);
    expect(useWorkstationSessionMemoryStore.getState().readDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY)).toBe(expression);
    expect(solve.artifact?.result_text).toBe("29.5");
    expect(String(solve.artifact?.normalized_expression)).not.toBe("(81)+");
  });

  it("normalizes mixed-number notation before scientific calculator workstation solves", () => {
    const solve = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "solve_expression",
        args: {
          latex: "calculate 9 1/8 with the scientific calculator",
        },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(solve.ok).toBe(true);
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("(73/8)");
    expect(solve.artifact?.result_text).toBe("9.125");
    expect(String(solve.artifact?.normalized_expression)).not.toBe("91/8");
  });

  it("does not treat explicit subtraction as mixed-number notation", () => {
    const solve = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "solve_expression",
        args: {
          latex: "calculate 9 - 1/8 with the scientific calculator",
        },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(solve.ok).toBe(true);
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("9-1/8");
    expect(solve.artifact?.result_text).toBe("8.875");
  });

  it("uses calculator setup expression instead of prompt prose for workstation solves", () => {
    const solve = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "solve_expression",
        args: {
          latex: "what is kinetic energy of 2 kg moving at 15 meters per second",
          calculator_setup: {
            schema: "helix.calculator_setup_context.v1",
            expression: "0.5*2*15^2",
            display_latex: "0.5*2*15^2",
            subgoal: "Compute kinetic energy from KE = 1/2 m v^2.",
            equation: "KE = 1/2 m v^2",
            domain: "kinetic_energy",
            result_unit: "J",
            result_quantity: "energy",
            result_dimension_signature: "L^2 M T^-2",
            unit_system: "SI",
            variables: [],
          },
        },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(solve.ok).toBe(true);
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("0.5*2*15^2");
    expect(solve.artifact?.result_text).toBe("225");
  });

  it("rejects prose-only calculator action args without mutating calculator input", () => {
    useScientificCalculatorStore.getState().clear();
    const solve = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "solve_expression",
        args: {
          latex: "what is kinetic energy of 2 kg moving at 15 meters per second",
        },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(solve.ok).toBe(false);
    expect(solve.message).toContain("not prose");
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("");
  });

  it("delegates Situation Room source and pipeline actions", () => {
    const room = useSituationRoomStore.getState().createRoom("Delegation Room");
    useSituationRoomStore.getState().appendSituationEvent({
      id: "evt:delegation:1",
      room_id: room.room_id,
      source: "display_tab_audio",
      event_type: "voice_transcript",
      text: "Tenemos que esperar la resistencia al fuego.",
      classification: "info",
      evidence_refs: ["situation-room://delegation/chunk/0001"],
      capture_session_id: "cap:delegation",
      chunk_index: 0,
      ts: "2026-05-01T00:00:00.000Z",
      meta: {
        source_text: "Tenemos que esperar la resistencia al fuego.",
        source_language: "es",
        translated: false,
      },
    });

    const createJob = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "create_job",
        args: { kind: "translate", target_language: "es" },
      },
      {
        openPanel: vi.fn(),
        focusPanel: vi.fn(),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(createJob.ok).toBe(true);
    expect(createJob.artifact?.room_id).toBe(room.room_id);
    expect(createJob.artifact?.kind).toBe("translate");
    expect(createJob.artifact?.target_language).toBe("es");
    expect(createJob.artifact?.attachment_policy).toBe("manual_only");
    expect(createJob.artifact?.context_injection).toBe("explicit_attachment_only");
    expect(createJob.artifact?.derived_outputs_auto_attach).toBe(false);
    expect(createJob.artifact?.command_lane_enabled).toBe(false);

    const jobId = String(createJob.artifact?.job_id ?? "");
    const attachRoom = executeHelixPanelAction(
      {
        panel_id: "situation-room-sources",
        action_id: "attach_room_to_helix_ask",
        args: { room_id: room.room_id },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(attachRoom.ok).toBe(true);
    expect(attachRoom.artifact?.room_id).toBe(room.room_id);

    const runJob = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "run_job",
        args: { job_id: jobId },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(runJob.ok).toBe(true);
    expect(runJob.artifact?.job_id).toBe(jobId);
  });

  it("delegates Situation Room graph and translation-pair actions", () => {
    const room = useSituationRoomStore.getState().createRoom("Graph Delegation Room");
    const createGraph = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "create_graph",
        args: { room_id: room.room_id, title: "Mediator graph" },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(createGraph.ok).toBe(true);
    expect(createGraph.artifact?.graph_id).toBeTruthy();

    const translationPair = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "create_translation_pair",
        args: {
          graph_id: createGraph.artifact?.graph_id,
          room_id: room.room_id,
          speaker_a_id: "spk_user_1",
          speaker_b_id: "spk_rowan",
          speaker_a_native_language: "en",
          speaker_b_native_language: "es",
          render_policy: "dual",
        },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(translationPair.ok).toBe(true);
    expect(translationPair.artifact?.graph_id).toBe(createGraph.artifact?.graph_id);
    expect(translationPair.artifact?.job_ids).toHaveLength(2);
    expect(translationPair.artifact).toMatchObject({
      attachment_policy: "manual_only",
      context_injection: "explicit_attachment_only",
      command_lane_enabled: false,
    });

    const graphFromRecipe = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "create_graph_from_recipe",
        args: {
          recipe_id: "two_way_interpreter",
          room_id: room.room_id,
          source_ids: ["src:voice"],
          bindings: {
            source_ids: ["src:voice"],
            speaker_a_id: "spk_user_1",
            speaker_b_id: "spk_rowan",
            speaker_a_native_language: "en",
            speaker_b_native_language: "es",
            output_mode: "dual",
          },
        },
      },
      {
        openPanel: vi.fn(),
        focusPanel: vi.fn(),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(graphFromRecipe.ok).toBe(true);
    expect(graphFromRecipe.artifact).toMatchObject({
      kind: "situation_room_graph_execution_receipt",
      schema: "helix.situation_graph_execution_receipt.v1",
      recipe_id: "two_way_interpreter",
      attachment_policy: "manual_only",
      context_injection: "explicit_attachment_only",
      command_lane_enabled: false,
    });
    expect(graphFromRecipe.artifact?.node_ids).toHaveLength(7);
    expect(graphFromRecipe.artifact?.job_ids).toHaveLength(2);
  });

  it("posts Situation Room standby thread binding requests", () => {
    const room = useSituationRoomStore.getState().createRoom("Minecraft Binding Room");
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, schema: "helix.situation_thread_binding_receipt.v1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "attach_standby_to_helix_thread",
        args: {
          room_id: room.room_id,
          source_id: "source:minecraft-server",
          world_id: "minecraft:minehut",
          thread_id: "thread:ask",
        },
      },
      {
        openPanel: vi.fn(),
        focusPanel: vi.fn(),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({
      kind: "situation_thread_binding_receipt",
      ok: true,
      context_policy: "explicit_attachment_only",
      command_lane_enabled: false,
      binding_request: {
        room_id: room.room_id,
        source_id: "source:minecraft-server",
        world_id: "minecraft:minehut",
        thread_id: "thread:ask",
        mode: "standby_receipts",
        append_policy: "salient_only",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/situation/thread-binding",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("keeps a synthetic Situation Room live-source attach unverified until authenticated ingress", () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "attach_live_source",
        args: {
          thread_id: "thread:minecraft-live",
          room_id: "room:minecraft-minehut",
          environment_id: "live-env:minecraft",
          source_id: "source:minecraft-server",
          world_id: "minecraft:minehut",
          kind: "minecraft_world_events",
        },
      },
      {
        openPanel: vi.fn(),
        focusPanel: vi.fn(),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({
      schema: "helix.live_source_admission_receipt.v1",
      thread_id: "thread:minecraft-live",
      room_id: "room:minecraft-minehut",
      environment_id: "live-env:minecraft",
      source_id: "source:minecraft-server",
      source_kind: "minecraft_world_events",
      transport: "unknown",
      freshness: {
        status: "unknown",
        last_seen_at: null,
      },
      trust_level: "unverified",
      terminal_eligible: false,
      assistant_answer: false,
      raw_content_included: false,
      post_tool_model_step_required: true,
      context_role: "receipt_not_assistant_answer",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/situation/live-source/event",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("attaches and queries Dottie as a witness-only observer", () => {
    const context = {
      openPanel: vi.fn(),
      focusPanel: vi.fn(),
      closePanel: () => undefined,
      openSettings: () => undefined,
    };
    const attach = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "observer.attach",
        args: {
          target_run_id: "run:ask:voice-lane",
          observer_profile: "auntie_dottie",
          target_turn_id: "turn:voice-lane",
          max_chars: 120,
        },
      },
      context,
    );

    expect(attach.ok).toBe(true);
    expect(attach.artifact?.kind).toBe("dottie_observer_subscription_receipt");
    expect(attach.artifact?.subscription).toMatchObject({
      schema: "helix.dottie_observer_subscription.v1",
      observer_profile: "auntie_dottie",
      target_run_id: "run:ask:voice-lane",
      target_agent_id: "agent:helix_ask",
      target_turn_id: "turn:voice-lane",
      authority: "witness_only",
      can_execute_tools: false,
      assistant_answer: false,
      raw_reasoning_included: false,
    });

    const query = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "observer.query",
        args: { target_run_id: "run:ask:voice-lane" },
      },
      context,
    );

    expect(query.ok).toBe(true);
    expect(query.artifact?.kind).toBe("dottie_observer_query_receipt");
    expect(query.artifact?.count).toBeGreaterThanOrEqual(1);
    expect(query.artifact?.subscriptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_run_id: "run:ask:voice-lane",
          authority: "witness_only",
        }),
      ]),
    );
  });

  it("manifests Dottie as a Situation Room evidence-only preset", () => {
    const room = useSituationRoomStore.getState().createRoom("Dottie Manifest Room");
    const context = {
      openPanel: vi.fn(),
      focusPanel: vi.fn(),
      closePanel: () => undefined,
      openSettings: () => undefined,
    };

    const result = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "dottie.manifest",
        args: {
          room_id: room.room_id,
          thread_id: "thread:dottie-manifest",
          source_ids: ["source:visible"],
          target_run_id: "run:ask:dottie-manifest",
          voice_mode: "propose_only",
          commentary_cadence: "salience_only",
        },
      },
      context,
    );

    expect(result.ok).toBe(true);
    expect(context.openPanel).toHaveBeenCalledWith("situation-room-pipelines", undefined);
    expect(result.artifact).toMatchObject({
      schema: "helix.dottie_manifest_preset_receipt.v1",
      kind: "dottie_manifest_preset_receipt",
      preset_id: "auntie_dottie",
      thread_id: "thread:dottie-manifest",
      room_id: room.room_id,
      assistant_answer: false,
      raw_content_included: false,
      context_role: "tool_evidence",
      command_lane_enabled: false,
    });
    expect(result.artifact?.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "live_answer_environment_receipt", assistant_answer: false }),
        expect.objectContaining({ kind: "live_commentary_policy_receipt", assistant_answer: false }),
        expect.objectContaining({ kind: "dottie_observer_subscription_receipt", assistant_answer: false }),
        expect.objectContaining({ kind: "voice_policy_receipt", assistant_answer: false }),
      ]),
    );
  });

  it("creates Dottie through the generic construct recipe action", () => {
    const room = useSituationRoomStore.getState().createRoom("Construct Dottie Room");
    const context = {
      openPanel: vi.fn(),
      focusPanel: vi.fn(),
      closePanel: () => undefined,
      openSettings: () => undefined,
    };

    const result = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "construct.create_from_recipe",
        args: {
          recipe_id: "auntie_dottie_witness",
          room_id: room.room_id,
          thread_id: "thread:construct-dottie",
          target_run_id: "run:ask:construct-dottie",
          voice_mode: "propose_only",
        },
      },
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({
      schema: "helix.situation_construct_recipe_run.v1",
      kind: "situation_construct_recipe_run",
      recipe_id: "auntie_dottie_witness",
      thread_id: "thread:construct-dottie",
      room_id: room.room_id,
      status: "applied_as_receipts",
      assistant_answer: false,
      raw_content_included: false,
      instruction_authority: "none",
      context_role: "tool_evidence",
      ask_context_policy: "evidence_only",
      terminal_eligible: false,
      panel_generated_answer: false,
      next_step_authority: "agent_step_decision",
    });
    expect(result.artifact?.live_job_contract).toMatchObject({
      schema: "helix.situation_room_live_job_contract.v1",
      purpose: "voice_witness",
      voice_policy: "propose_only",
      authority_policy: {
        construct_answer_authority: "witness_only",
        helix_ask_terminal_authority_required: true,
      },
      assistant_answer: false,
      raw_content_included: false,
    });
    expect(result.artifact?.construct_observation).toMatchObject({
      schema: "helix.situation_room_construct_observation.v1",
      terminal_eligible: false,
      panel_generated_answer: false,
      next_step_authority: "agent_step_decision",
      policy_state: {
        voice_policy: "propose_only",
        spoken: false,
        confirm_speak_receipt_present: false,
        output_authority: "proposal",
      },
    });
    expect(result.artifact?.constructs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "dottie_manifest", status: "receipt_only" }),
        expect.objectContaining({ type: "observer", status: "receipt_only" }),
        expect.objectContaining({ type: "voice_policy", status: "receipt_only" }),
      ]),
    );
    expect(result.artifact?.compatibility_receipt).toMatchObject({
      kind: "dottie_manifest_preset_receipt",
      assistant_answer: false,
    });
  });

  it("updates live job operating prompts as observation-only receipts", () => {
    const context = {
      openPanel: vi.fn(),
      focusPanel: vi.fn(),
      closePanel: () => undefined,
      openSettings: () => undefined,
    };
    const created = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "construct.create_from_recipe",
        args: {
          recipe_id: "auntie_dottie_witness",
          room_id: "room:prompt-edit",
          thread_id: "thread:prompt-edit",
          operating_prompt: "Watch Minecraft and stay quiet.",
        },
      },
      context,
    );
    const contract = created.artifact?.live_job_contract as { contract_id: string };

    const updated = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "construct.set_operating_prompt",
        args: {
          contract_id: contract.contract_id,
          operating_prompt: "Only interrupt for confirmed route drift.",
        },
      },
      context,
    );

    expect(updated.ok).toBe(true);
    expect(updated.artifact).toMatchObject({
      kind: "situation_live_job_prompt_update_receipt",
      terminal_eligible: false,
      panel_generated_answer: false,
      next_step_authority: "agent_step_decision",
      assistant_answer: false,
      raw_content_included: false,
      live_job_contract: {
        contract_id: contract.contract_id,
        operating_prompt: "Only interrupt for confirmed route drift.",
        compiled_policy: {
          evidence_threshold: "confirmed",
        },
      },
      construct_observation: {
        action: "construct.set_operating_prompt",
        terminal_eligible: false,
        panel_generated_answer: false,
      },
    });
  });

  it("creates a browser audio transcriber construct recipe without answer authority", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "construct.create_from_recipe",
        args: {
          recipe_id: "browser_audio_transcriber",
          room_id: "room:transcriber",
          thread_id: "thread:transcriber",
          source_ids: ["source:tab-audio"],
          output: "transcript_stream",
        },
      },
      {
        openPanel: vi.fn(),
        focusPanel: vi.fn(),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({
      schema: "helix.situation_construct_recipe_run.v1",
      kind: "situation_construct_recipe_run",
      recipe_id: "browser_audio_transcriber",
      status: "active",
      assistant_answer: false,
      raw_content_included: false,
      instruction_authority: "none",
      terminal_eligible: false,
      panel_generated_answer: false,
      next_step_authority: "agent_step_decision",
    });
    expect(result.artifact?.construct_observation).toMatchObject({
      terminal_eligible: false,
      panel_generated_answer: false,
      next_step_authority: "agent_step_decision",
      policy_state: {
        spoken: false,
        confirm_speak_receipt_present: false,
        output_authority: "typed_only",
      },
    });
    expect(result.artifact?.constructs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "source_binding", status: "active", source_ids: ["source:tab-audio"] }),
        expect.objectContaining({ type: "transcription_job", status: "active", source_ids: ["source:tab-audio"] }),
        expect.objectContaining({ type: "commentary_policy", status: "receipt_only" }),
      ]),
    );
  });

  it("binds browser audio transcriber constructs to Live Answers as an output surface", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "construct.create_from_recipe",
        args: {
          recipe_id: "browser_audio_transcriber",
          room_id: "room:transcriber-live-answer",
          thread_id: "thread:transcriber-live-answer",
          source_ids: ["source:tab-audio"],
          output: "live_answer_environment",
          environment_id: "live_answer:client-transcriber",
        },
      },
      {
        openPanel: vi.fn(),
        focusPanel: vi.fn(),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.artifact?.constructs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "transcription_job",
          environment_id: "live_answer:client-transcriber",
          output_bindings: expect.arrayContaining([
            expect.objectContaining({
              output_kind: "live_answer_environment",
              artifact_ref: "live_answer:client-transcriber",
              status: "active",
            }),
          ]),
        }),
        expect.objectContaining({
          type: "live_environment",
          status: "active",
          environment_id: "live_answer:client-transcriber",
        }),
      ]),
    );
  });

  it("queries and updates Situation Room constructs through generic construct actions", () => {
    const context = {
      openPanel: vi.fn(),
      focusPanel: vi.fn(),
      closePanel: () => undefined,
      openSettings: () => undefined,
    };
    const created = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "construct.create_from_recipe",
        args: {
          recipe_id: "browser_audio_transcriber",
          room_id: "room:construct-query",
          thread_id: "thread:construct-query",
          source_ids: ["source:tab-audio"],
        },
      },
      context,
    );
    const constructs = created.artifact?.constructs as Array<{ construct_id: string; type: string }> | undefined;
    const transcriptionConstructId = constructs?.find((construct) => construct.type === "transcription_job")?.construct_id;

    const query = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "construct.query",
        args: { thread_id: "thread:construct-query", type: "transcription_job" },
      },
      context,
    );
    const detach = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "construct.detach",
        args: { construct_id: transcriptionConstructId },
      },
      context,
    );

    expect(query.ok).toBe(true);
    expect(query.artifact?.constructs).toEqual(
      expect.arrayContaining([expect.objectContaining({ construct_id: transcriptionConstructId })]),
    );
    expect(detach.ok).toBe(true);
    expect(detach.artifact).toMatchObject({
      kind: "situation_construct_update_receipt",
      construct: expect.objectContaining({ construct_id: transcriptionConstructId, status: "detached" }),
      assistant_answer: false,
    });
  });

  it("proposes Dottie voice from a public trace event without making an answer", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "voice_delivery.propose_from_trace",
        args: {
          observer_id: "observer:dottie:test",
          source_event_id: "agent_commentary:orientation",
          source_event_schema: "helix.agent_commentary.v1",
          source_text: "I am checking route authority before the voice lane and then I will inspect the public commentary source.",
          target_turn_id: "turn:voice-lane",
          max_chars: 64,
        },
      },
      {
        openPanel: vi.fn(),
        focusPanel: vi.fn(),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({
      kind: "dottie_voice_receipt",
      schema: "helix.dottie_voice_receipt.v1",
      observer_id: "observer:dottie:test",
      source_event_id: "agent_commentary:orientation",
      source_event_schema: "helix.agent_commentary.v1",
      target_turn_id: "turn:voice-lane",
        spoken: false,
        proposed: true,
        speak_authority: {
          kind: "operator_callout_v1",
          artifact_ref: "agent_commentary:orientation",
          evidence_refs: ["agent_commentary:orientation"],
        },
        assistant_answer: false,
      authority: "witness_only",
      certainty_parity_ok: true,
      evidence_parity_ok: true,
      raw_reasoning_included: false,
      terminal_eligible: false,
      panel_generated_answer: false,
      next_step_authority: "agent_step_decision",
    });
    expect(result.artifact?.construct_observation).toMatchObject({
      action: "voice_delivery.propose_from_trace",
      terminal_eligible: false,
      panel_generated_answer: false,
      next_step_authority: "agent_step_decision",
      policy_state: {
        voice_policy: "propose_only",
        spoken: false,
        confirm_speak_receipt_present: false,
        output_authority: "proposal",
      },
    });
    expect(String(result.artifact?.spoken_text).length).toBeLessThanOrEqual(64);
    expect(result.artifact?.spoken_text_hash).toMatch(/^fnv1a64:/);
    expect(result.artifact?.source_text_hash).toMatch(/^fnv1a64:/);
    expect(getDottieVoiceDebugClipsSnapshot()).toEqual([
      expect.objectContaining({
        status: "proposed",
        observerId: "observer:dottie:test",
        sourceEventId: "agent_commentary:orientation",
        spokenText: result.artifact?.spoken_text,
        spoken: false,
        authority: "witness_only",
      }),
    ]);
  });

  it("marks voice delivery as spoken only through confirm_speak", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "voice_delivery.confirm_speak",
        args: {
          thread_id: "thread:voice-confirm",
          spoken_text: "Route drift confirmed.",
        },
      },
      {
        openPanel: vi.fn(),
        focusPanel: vi.fn(),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({
      kind: "standby_callout_delivery_receipt",
      schema: "helix.voice_delivery_confirm_speak_receipt.v1",
      spoken: true,
      confirm_speak_receipt_present: true,
        output_authority: "confirmed_spoken",
        speak_authority: {
          kind: "operator_callout_v1",
          artifact_ref: expect.stringMatching(/^voice_confirm_speak:/),
          evidence_refs: [expect.stringMatching(/^voice_confirm_speak:/)],
        },
        assistant_answer: false,
      raw_content_included: false,
      terminal_eligible: false,
      panel_generated_answer: false,
      next_step_authority: "agent_step_decision",
      construct_observation: {
        action: "voice_delivery.confirm_speak",
        policy_state: {
          spoken: true,
          confirm_speak_receipt_present: true,
          output_authority: "confirmed_spoken",
        },
      },
    });
  });

  it("delegates Situation Room setup-from-prompt and mic source actions with receipts", () => {
    const room = useSituationRoomStore.getState().createRoom("Setup Delegation Room");
    const source = {
      source_id: "src:setup:display",
      room_id: room.room_id,
      label: "Discord tab audio",
      capture_source: "display_tab_audio" as const,
      capture_session_id: "cap:setup",
      status: "active" as const,
      chunk_index: 0,
      started_at: "2026-05-04T00:00:00.000Z",
    };
    useSituationRoomStore.setState((state: ReturnType<typeof useSituationRoomStore.getState>) => ({
      sources: { ...state.sources, [source.source_id]: source },
      rooms: {
        ...state.rooms,
        [room.room_id]: {
          ...state.rooms[room.room_id],
          source_ids: [source.source_id],
        },
      },
    }));

    const setup = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "setup_from_prompt",
        args: {
          intent: "translate_conversation",
          capture_preference: "existing_source",
          room_id: room.room_id,
          source_ids: [source.source_id],
          speaker_a_id: "spk_user_1",
          speaker_b_id: "spk_friend_1",
          speaker_a_native_language: "English",
          speaker_b_native_language: "Spanish",
        },
      },
      {
        openPanel: vi.fn(),
        focusPanel: vi.fn(),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );

    expect(setup.ok).toBe(true);
    expect(setup.artifact).toMatchObject({
      kind: "situation_room_setup_execution_receipt",
      schema: "helix.situation_setup_receipt.v1",
      setup_status: "complete",
      lifecycle_status: "executed",
      executed_action_id: "situation-room-pipelines.setup_from_prompt",
      room_id: room.room_id,
      source_ids: [source.source_id],
      attachment_policy: "manual_only",
      context_injection: "explicit_attachment_only",
      command_lane_enabled: false,
    });
    expect(setup.artifact?.graph_id).toBeTruthy();
    expect(setup.artifact?.job_ids).toHaveLength(2);

    const missingSetup = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "setup_from_prompt",
        args: {
          intent: "translate_conversation",
          capture_preference: "browser_tab_audio",
          room_id: room.room_id,
          speaker_a_id: "spk_user_1",
          speaker_b_id: "spk_friend_1",
          speaker_a_native_language: "English",
          speaker_b_native_language: "Spanish",
          source_ids: ["src:not-found"],
        },
      },
      {
        openPanel: vi.fn(),
        focusPanel: vi.fn(),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(missingSetup.ok).toBe(false);
    expect(missingSetup.artifact).toMatchObject({
      kind: "situation_room_setup_execution_receipt",
      lifecycle_status: "failed",
      setup_status: "needs_capture_permission",
      error: "setup_requirements_missing",
    });

    const mic = executeHelixPanelAction(
      {
        panel_id: "situation-room-sources",
        action_id: "attach_mic_audio_source",
        args: { room_id: room.room_id, label: "Same microphone" },
      },
      {
        openPanel: vi.fn(),
        focusPanel: vi.fn(),
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(mic.ok).toBe(true);
    expect(mic.artifact).toMatchObject({
      mic_permission_requested: true,
      capture_source: "mic",
      label: "Same microphone",
    });
  });

  it("keeps complex ADM-style symbolic equations solvable without crashing", () => {
    const solve = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "solve_with_steps",
        args: {
          latex:
            "ds^2 = -(alpha^2-beta_i*beta^i)*dt^2 + 2*beta_i*dx^i*dt + gamma_ij*dx^i*dx^j",
        },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(solve.ok).toBe(true);
    expect(typeof solve.artifact?.result_text).toBe("string");
    expect(String(solve.artifact?.result_text).length).toBeGreaterThan(0);
    expect(String(solve.artifact?.error ?? "")).not.toContain("eqn.split");
  });

  it("marks GR-class scientific requests as backend-only with trace metadata", () => {
    const solve = executeHelixPanelAction(
      {
        panel_id: "scientific-calculator",
        action_id: "solve_with_steps",
        args: {
          latex: "Compute the Einstein tensor and QI guardrail for the Natario warp.metric T00 route.",
        },
      },
      {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
    );
    expect(solve.ok).toBe(false);
    expect(solve.artifact?.sourceOfTruth).toBe("einstein_backend");
    expect(solve.artifact?.capabilityClass).toBe("gr_warp_physics");
    expect(solve.artifact?.trace).toEqual(
      expect.objectContaining({
        delegatedTo: "/api/physics/warp/calculator",
      }),
    );
  });

    it("looks up theory badges for Helix workstation context", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
        action_id: "lookup_badges",
        args: { query: "solve the QEI sampling margin", limit: 3 },
      },
      actionContext(),
    );

    expect(result.ok).toBe(true);
    expect(result.artifact?.kind).toBe("theory_badge_lookup");
    const matches = result.artifact?.matches as Array<{ badgeId: string; claimBoundaryWarnings: string[] }>;
    expect(matches[0]?.badgeId).toBe("nhm2.qei.sampling_window");
      expect(matches[0]?.claimBoundaryWarnings).toContain("diagnostic-only badge");
    });

    it("locates theory context and updates the map overlay without solving", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "locate_context",
          args: {
            query: "solve the QEI margin",
            symbols: ["qei_margin"],
            overlay: true,
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_badge_locator");
      expect(result.artifact?.schemaVersion).toBe("theory_badge_locator/v1");
      expect(result.artifact?.matches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ badgeId: "nhm2.qei.sampling_window" }),
        ]),
      );
      expect(useTheoryMapOverlayStore.getState().rippleBadgeIds).toContain("nhm2.qei.sampling_window");
    expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
  });

    it("reflects discussion context as non-terminal tool evidence", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "reflect_discussion_context",
          args: {
            prompt: "Discuss Einstein tensor source residual and QEI margin.",
            conversation_context: "We are setting up a diagnostic NHM2 warp-bubble demo.",
            mentioned_equations: [
              "R_source = source_required - source_available",
              "qei_margin = qei_bound - qei_sample",
            ],
            mentioned_symbols: ["G_mu_nu", "R_source", "qei_margin"],
            mentioned_domains: ["warp_gr_nhm2", "qei_stress_energy"],
            overlay: true,
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_context_reflection");
      expect(result.artifact?.schemaVersion).toBe("theory_context_reflection/v1");
      expect(isTheoryContextReflectionV1(result.artifact?.artifact_v1)).toBe(true);
      expect(isHelixTheoryContextReflectionToolReceiptV1(result.artifact?.tool_receipt_v1)).toBe(true);
      expect(result.artifact?.tool_receipt_v1).toMatchObject({
        panelSync: {
          requested: true,
          applied: true,
          overlayMode: "discussion_zone",
        },
      });
      expect(result.artifact).toMatchObject({
        assistant_answer: false,
        raw_content_included: false,
        terminal_eligible: false,
        panel_generated_answer: false,
        context_role: "tool_evidence",
        ask_context_policy: "evidence_only",
      });
      expect(result.artifact?.exact_badge_ids).toEqual(
        expect.arrayContaining(["nhm2.closure.source_residual", "nhm2.qei.sampling_window"]),
      );
      expect(useTheoryMapOverlayStore.getState().source).toBe("discussion_reflection");
      expect(useTheoryMapOverlayStore.getState().softRegions.length).toBeGreaterThan(0);
      expect(useScientificCalculatorStore.getState().currentLatex).toBe("");
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout).toBeNull();
    });

    it("returns reflection recommended actions without executing them", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "reflect_discussion_context",
          args: {
            prompt: "Map Einstein tensor source residual and QEI margin before any solve.",
            mentioned_equations: [
              "G_mu_nu = 8*pi*G*T_mu_nu/c^4",
              "R_source = source_required - source_available",
            ],
            mentioned_symbols: ["G_mu_nu", "R_source", "qei_margin"],
            mentioned_domains: ["warp_gr_nhm2", "qei_stress_energy"],
            overlay: false,
            open_panel: false,
          },
        },
        actionContext(),
      );
      const reflection = result.artifact?.artifact_v1;
      const actions = isTheoryContextReflectionV1(reflection)
        ? reflection.evidenceForAsk.recommendedNextActions
        : [];

      expect(result.ok).toBe(true);
      expect(actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actionId: "theory-badge-graph.build_compound_theory_run",
            mutatesCalculator: false,
            solves: false,
            args: expect.objectContaining({
              mode: "dependency_path",
              include_scalar: true,
              include_runtime: true,
              include_evidence: true,
              include_boundaries: true,
            }),
          }),
          expect.objectContaining({
            actionId: "theory-badge-graph.get_runtime_math_trace",
            mutatesCalculator: false,
            solves: false,
            args: expect.objectContaining({
              badge_id: expect.any(String),
            }),
          }),
        ]),
      );
      expect(actions.every((action) => action.solves === false)).toBe(true);
      expect(useScientificCalculatorStore.getState().currentLatex).toBe("");
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout).toBeNull();
    });

    it("proposes frontier conjectures as non-terminal workbench evidence", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "propose_frontier_conjectures",
          args: {
            prompt:
              "Find missing badge bridges between Einstein tensor source residual, QEI margin, and tensor authority.",
            mentioned_symbols: ["G_mu_nu", "R_source", "qei_margin"],
            mentioned_domains: ["warp_gr_nhm2", "qei_stress_energy"],
            frontier_search_seed: "panel-frontier-conjecture-test",
            overlay: false,
            open_panel: false,
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_frontier_conjecture_workbench");
      expect(result.artifact?.schemaVersion).toBe("theory_frontier_conjecture_workbench/v1");
      expect(isHelixTheoryContextReflectionToolReceiptV1(result.artifact?.tool_receipt_v1)).toBe(true);
      expect(result.artifact).toMatchObject({
        graph_id: expect.any(String),
        candidate_count: expect.any(Number),
        assistant_answer: false,
        raw_content_included: false,
        terminal_eligible: false,
        post_tool_model_step_required: true,
      });
      expect(result.artifact?.candidate_count).toBeGreaterThan(0);
      expect(result.artifact?.frontier_search_v1).toMatchObject({
        interpretation: expect.objectContaining({
          noTheoryValidation: true,
          noAutomaticEdgePromotion: true,
        }),
      });
      expect(result.artifact?.candidates?.[0]).toMatchObject({
        candidate_id: expect.any(String),
        candidate_kind: expect.stringMatching(/candidate_connection|missing_intermediate_badge|unresolved_semantic_region/),
        status: expect.stringMatching(
          /coarse_candidate|exact_verification_pending|needs_observable|needs_scholarly_evidence|blocked_by_boundary/,
        ),
        nearby_badge_ids: expect.any(Array),
        proposed_relation_or_missing_badge: expect.any(String),
        congruence_score: expect.any(Number),
        information_gain_bits: expect.any(Number),
        calculator_probe_available: expect.any(Boolean),
        promotion_allowed: false,
        terminal_eligible: false,
        assistant_answer: false,
        post_tool_model_step_required: true,
      });
      expect(useScientificCalculatorStore.getState().currentLatex).toBe("");
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout).toBeNull();
    });

    it("does not open the theory panel when reflection open_panel is false", () => {
      const openPanel = vi.fn();
      const focusPanel = vi.fn();
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "reflect_discussion_context",
          args: {
            prompt: "Discuss source residual.",
            open_panel: false,
          },
        },
        {
          openPanel,
          focusPanel,
          closePanel: () => undefined,
          openSettings: () => undefined,
        },
      );

      expect(result.ok).toBe(true);
      expect(openPanel).not.toHaveBeenCalled();
      expect(focusPanel).not.toHaveBeenCalled();
    });

    it("does not update the overlay store when reflection overlay is false", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "reflect_discussion_context",
          args: {
            prompt: "Discuss source residual.",
            overlay: false,
            open_panel: false,
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(useTheoryMapOverlayStore.getState().source).toBe("none");
      expect(useTheoryMapOverlayStore.getState().lastReflectionArtifact).toBeNull();
    });

    it("builds a non-terminal explanation plan from the active reflection", () => {
      const reflection = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "reflect_discussion_context",
          args: {
            prompt: "Map source residual and QEI margin in the theory graph.",
            mentioned_symbols: ["R_source", "qei_margin"],
            mentioned_domains: ["warp_gr_nhm2", "qei_stress_energy"],
            overlay: true,
            open_panel: false,
          },
        },
        actionContext(),
      );
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "explain_reflected_context",
          args: {},
        },
        actionContext(),
      );

      expect(reflection.ok).toBe(true);
      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_context_explanation_plan");
      expect(isTheoryContextExplanationPlanV1(result.artifact?.artifact_v1)).toBe(true);
      expect(result.artifact).toMatchObject({
        assistant_answer: false,
        raw_content_included: false,
        terminal_eligible: false,
        panel_generated_answer: false,
        context_role: "tool_evidence",
        ask_context_policy: "evidence_only",
      });
      expect(JSON.stringify(result.artifact)).toContain("nhm2.closure.source_residual");
      expect(JSON.stringify(result.artifact)).toContain("qei");
      expect(useScientificCalculatorStore.getState().currentLatex).toBe("");
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout).toBeNull();
    });

    it("declares explain_reflected_context as a low-risk artifact action", () => {
      const capabilities = WORKSTATION_V1_PANEL_CAPABILITIES["theory-badge-graph"];
      const action = capabilities.actions.find((candidate) => candidate.id === "explain_reflected_context");

      expect(action).toMatchObject({
        title: "Explain Reflected Context",
        risk: "low",
        returns_artifact: true,
      });
      expect(capabilities.safe_actions).toContain("explain_reflected_context");
      expect(capabilities.returns_artifact_actions).toContain("explain_reflected_context");
    });

    it("declares reflect_discussion_context as a low-risk artifact action", () => {
      const capabilities = WORKSTATION_V1_PANEL_CAPABILITIES["theory-badge-graph"];
      const action = capabilities.actions.find((candidate) => candidate.id === "reflect_discussion_context");

      expect(action).toMatchObject({
        title: "Reflect Discussion Context",
        risk: "low",
        returns_artifact: true,
      });
      expect(capabilities.safe_actions).toContain("reflect_discussion_context");
      expect(capabilities.returns_artifact_actions).toContain("reflect_discussion_context");
    });

    it("declares propose_frontier_conjectures as a low-risk artifact action", () => {
      const capabilities = WORKSTATION_V1_PANEL_CAPABILITIES["theory-badge-graph"];
      const action = capabilities.actions.find((candidate) => candidate.id === "propose_frontier_conjectures");

      expect(action).toMatchObject({
        title: "Propose Frontier Conjectures",
        risk: "low",
        returns_artifact: true,
      });
      expect(capabilities.safe_actions).toContain("propose_frontier_conjectures");
      expect(capabilities.returns_artifact_actions).toContain("propose_frontier_conjectures");
    });

    it("exposes physics atlas blocks and can select the solar lens", () => {
      const atlasResult = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "list_physics_atlas",
        },
        actionContext(),
      );

      expect(atlasResult.ok).toBe(true);
      expect(atlasResult.artifact?.kind).toBe("physics_atlas");
      expect(JSON.stringify(atlasResult.artifact)).toContain("solar_surface_spectrum");

      const selectResult = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "select_atlas_block",
          args: { block_id: "solar_surface_spectrum", overlay: true },
        },
        actionContext(),
      );

      expect(selectResult.ok).toBe(true);
      expect(selectResult.artifact?.kind).toBe("physics_atlas_lens");
      expect(useTheoryBadgeGraphPanelStore.getState().activeAtlasLensId).toBe("solar_surface_spectrum");
      expect(useTheoryMapOverlayStore.getState().highlightedBadgeIds).toContain(
        "solar.spectrum.photon_energy",
      );
    });

    it("exposes Helix Ask atlas block listing and focus actions without calculator mutation", () => {
      const listResult = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "list_atlas_blocks",
        },
        actionContext(),
      );

      expect(listResult.ok).toBe(true);
      expect(listResult.artifact?.kind).toBe("physics_atlas_blocks");
      expect(listResult.artifact?.blocks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "solar_surface_spectrum",
            calculator_examples: expect.any(Array),
            runtime_actions: expect.any(Array),
            claim_boundary_notes: expect.any(Array),
          }),
        ]),
      );

      const focusResult = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "focus_atlas_block",
          args: { atlas_block_id: "solar_surface_spectrum", overlay: true },
        },
        actionContext(),
      );

      expect(focusResult.ok).toBe(true);
      expect(focusResult.artifact?.kind).toBe("physics_atlas_lens");
      expect(focusResult.artifact?.block_id).toBe("solar_surface_spectrum");
      expect(focusResult.artifact?.highlighted_badge_ids).toContain("solar.spectrum.photon_energy");
      expect(focusResult.artifact?.calculator_examples).toEqual(expect.any(Array));
      expect(useTheoryBadgeGraphPanelStore.getState().activeAtlasLensId).toBe("solar_surface_spectrum");
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
      expect(useScientificCalculatorStore.getState().currentLatex).toBe("");
    });

    it("locates solar and distance badges with atlas block priors", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "locate_context",
          args: {
            query: "Estimate photon energy for 656.28 nm H-alpha and Doppler shift",
            atlas_block_ids: ["solar_surface_spectrum", "cosmic_distance_ladder"],
            symbols: ["lambda", "lambda0", "lambda_obs", "z", "E"],
            overlay: true,
            limit: 12,
          },
        },
        actionContext(),
      );

      const matches = result.artifact?.matches as Array<{ badgeId: string }>;
      expect(result.ok).toBe(true);
      expect(matches.map((match) => match.badgeId)).toEqual(
        expect.arrayContaining([
          "solar.spectrum.photon_energy",
          "solar.spectrum.halpha_line_reference",
          "solar.spectrum.doppler_shift",
          "solar.spectrum.radial_velocity_proxy",
          "cosmic.spectral.redshift",
        ]),
      );
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
    });

    it("loads theory badge payloads to the calculator without solving", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "load_payloads_to_calculator",
          args: {
            badge_id: "nhm2.qei.sampling_window",
            load_mode: "primary",
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
    expect(result.artifact?.kind).toBe("theory_badge_calculator_loadout");
    expect(useScientificCalculatorStore.getState().currentLatex).toContain("qei");
    expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
  });

    it("builds and loads object-aware StarSim calculator loadouts", () => {
      const buildResult = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "build_calculator_loadout",
          args: {
            target_badge_id: "starsim.runtime.evaluate_fusion_microphysics",
            mode: "dependency_path",
            object_context: {
              kind: "starsim_star",
              observables: {
                objectClass: "red_giant",
                spectralType: "K1III",
                luminosity_Lsun: 65,
                radius_Rsun: 12,
                mass_Msun: 1.1,
                r90_Rstar: 0.2,
              },
            },
          },
        },
        actionContext(),
      );

      expect(buildResult.ok).toBe(true);
      expect(buildResult.artifact?.kind).toBe("theory_calculator_loadout");
      expect(isTheoryCalculatorLoadoutV1(buildResult.artifact?.artifact_v1)).toBe(true);
      expect(JSON.stringify(buildResult.artifact?.artifact_v1)).toContain("T_eff = 5772*(65/(12^2))^(1/4)");

      const loadResult = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "load_calculator_loadout",
          args: {
            badge_ids: ["starsim.observable.surface_temperature_proxy"],
            object_context: {
              kind: "starsim_star",
              observables: { luminosity_Lsun: 65, radius_Rsun: 12 },
            },
          },
        },
        actionContext(),
      );

      expect(loadResult.ok).toBe(true);
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout?.summary.scalarCount).toBe(1);
      expect(useScientificCalculatorStore.getState().currentLatex).toBe("T_eff = 5772*(65/(12^2))^(1/4)");
    });

    it("solves scalar rows in a theory calculator loadout", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "solve_calculator_loadout",
          args: {
            badge_ids: ["starsim.observable.surface_temperature_proxy"],
            object_context: {
              kind: "starsim_star",
              observables: { luminosity_Lsun: 65, radius_Rsun: 12 },
            },
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_calculator_loadout_solve");
      const loadout = result.artifact?.artifact_v1;
      expect(isTheoryCalculatorLoadoutV1(loadout)).toBe(true);
      expect(result.artifact?.solved_count).toBeGreaterThanOrEqual(1);
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout?.items[0]?.calculatorArtifactV1).toBeTruthy();
    });

    it("builds object-aware cosmic distance ladder loadouts", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "load_calculator_loadout",
          args: {
            badge_ids: ["cosmic.spectral.redshift", "cosmic.low_z.hubble_distance"],
            object_context: {
              kind: "cosmic_distance_object",
              observables: {
                lambda_rest: 656.28,
                lambda_obs: 721.91,
                redshift: 0.1,
                H0: 70,
              },
            },
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_calculator_loadout_loaded");
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout?.objectContext?.kind).toBe("cosmic_distance_object");
      expect(useScientificCalculatorStore.getState().currentLatex).toBe("z = (721.91 - 656.28) / 656.28");
    });

    it("builds solar atlas calculator loadouts for Helix Ask", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "build_calculator_loadout",
          args: {
            atlas_block_id: "solar_surface_spectrum",
            include_context_items: false,
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_calculator_loadout");
      expect(JSON.stringify(result.artifact?.artifact_v1)).toContain("E = h*c/lambda");
      expect(JSON.stringify(result.artifact?.artifact_v1)).toContain("z = (lambda_obs - lambda0)/lambda0");
      expect(JSON.stringify(result.artifact?.artifact_v1)).toContain("v = c*z");
    });

    it("builds locator-matched solar atlas loadouts without solving", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "build_calculator_loadout",
          args: {
            mode: "locator_matches",
            atlas_block_id: "solar_surface_spectrum",
            query: "H-alpha photon energy Doppler shift",
            include_context_items: false,
            variable_bindings: {
              h: "6.62607015e-34",
              c: 299792458,
              lambda: "656.28e-9",
              lambda0: "656.28e-9",
              lambda_obs: "656.35e-9",
            },
          },
        },
        actionContext(),
      );

      const loadout = result.artifact?.artifact_v1 as { items?: Array<{ badgeId: string; solveExpression: string }>; summary?: { solvedCount: number } };
      expect(result.ok).toBe(true);
      expect(loadout.items?.map((item) => item.badgeId)).toEqual(
        expect.arrayContaining([
          "solar.spectrum.photon_energy",
          "solar.spectrum.doppler_shift",
          "solar.spectrum.radial_velocity_proxy",
        ]),
      );
      expect(loadout.items?.map((item) => item.solveExpression)).toContain("E = 6.62607015e-34*299792458/656.28e-9");
      expect(loadout.summary?.solvedCount).toBe(0);
    });

    it("loads object-aware solar spectrum observation loadouts", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "load_calculator_loadout",
          args: {
            badge_ids: [
              "solar.spectrum.photon_energy",
              "solar.spectrum.doppler_shift",
              "solar.spectrum.radial_velocity_proxy",
            ],
            object_context: {
              kind: "solar_spectrum_observation",
              observables: {
                lambda: 656.28e-9,
                lambda0: 656.28e-9,
                lambda_obs: 656.35e-9,
              },
            },
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_calculator_loadout_loaded");
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout?.objectContext?.kind).toBe(
        "solar_spectrum_observation",
      );
      expect(useScientificCalculatorStore.getState().currentLatex).toBe("E = 6.62607015e-34*299792458/6.5628e-7");
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
    });

    it("loads object-aware Casimir cavity loadouts", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "load_calculator_loadout",
          args: {
            badge_ids: [
              "casimir.cavity.parallel_plate_energy_density",
              "casimir.cavity.per_tile_energy",
            ],
            object_context: {
              kind: "casimir_cavity_object",
              observables: {
                a: 1e-9,
                A_tile: 2.5e-3,
                E_area: -0.4333,
              },
            },
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_calculator_loadout_loaded");
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout?.objectContext?.kind).toBe(
        "casimir_cavity_object",
      );
      expect(useScientificCalculatorStore.getState().currentLatex).toBe(
        "E_area = -(3.141592653589793^2*3.16152677e-26)/(720*1e-9^3)",
      );
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
    });

    it("loads object-aware Warp / GR / NHM2 diagnostic loadouts", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "load_calculator_loadout",
          args: {
            badge_ids: [
              "nhm2.geometry.lapse_shift_profile",
              "nhm2.closure.source_residual",
            ],
            object_context: {
              kind: "nhm2_diagnostic_object",
              observables: {
                t_shift: 1,
                delta_t_lapse: 0.1,
                source_required: 1,
                source_available: 0.8,
              },
            },
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_calculator_loadout_loaded");
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout?.objectContext?.kind).toBe(
        "nhm2_diagnostic_object",
      );
      expect(useScientificCalculatorStore.getState().currentLatex).toBe("t_proper = 1 + 0.1");
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
    });

    it("loads object-aware QEI / stress-energy diagnostic loadouts", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "load_calculator_loadout",
          args: {
            badge_ids: [
              "nhm2.qei.sampling_window",
              "nhm2.energy_condition.diagnostic_gate",
            ],
            object_context: {
              kind: "nhm2_diagnostic_object",
              observables: {
                qei_bound: 1,
                qei_sample: 0.9,
              },
            },
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_calculator_loadout_loaded");
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout?.objectContext?.kind).toBe(
        "nhm2_diagnostic_object",
      );
      expect(useScientificCalculatorStore.getState().currentLatex).toBe("qei_margin = 1 - 0.9");
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
    });

    it("loads object-aware Tokamak Plasma diagnostic loadouts", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "load_calculator_loadout",
          args: {
            badge_ids: [
              "tokamak.plasma.magnetic_pressure",
              "tokamak.plasma.beta_proxy",
            ],
            object_context: {
              kind: "tokamak_plasma_object",
              observables: {
                B_T: 5.3,
                p_B: 11176683.7,
                p_Pa: 160217.6634,
              },
            },
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_calculator_loadout_loaded");
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout?.objectContext?.kind).toBe(
        "tokamak_plasma_object",
      );
      expect(useScientificCalculatorStore.getState().currentLatex).toBe(
        "p_B = 5.3^2/(2*0.00000125663706212)",
      );
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
    });

    it("loads object-aware Galactic Dynamics loadouts", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "load_calculator_loadout",
          args: {
            badge_ids: [
              "galactic.map.distance_3d",
              "galactic.rotation.velocity_residual",
            ],
            object_context: {
              kind: "galactic_dynamics_object",
              observables: {
                dx_pc: 3,
                dy_pc: 4,
                dz_pc: 12,
                v_obs: 220,
                v_model: 190,
              },
            },
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_calculator_loadout_loaded");
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout?.objectContext?.kind).toBe(
        "galactic_dynamics_object",
      );
      expect(useScientificCalculatorStore.getState().currentLatex).toBe(
        "distance_pc = sqrt(3^2 + 4^2 + 12^2)",
      );
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
    });

    it("loads object-aware Curvature / Collapse benchmark loadouts", () => {
      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "load_calculator_loadout",
          args: {
            badge_ids: [
              "curvature.proxy.body_density",
              "collapse.benchmark.hazard_probability",
            ],
            object_context: {
              kind: "curvature_collapse_object",
              observables: {
                rho_kg_m3: 1000,
                dt_ms: 50,
                tau_ms: 1000,
              },
            },
          },
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.artifact?.kind).toBe("theory_calculator_loadout_loaded");
      expect(useScientificCalculatorStore.getState().lastTheoryLoadout?.objectContext?.kind).toBe(
        "curvature_collapse_object",
      );
      expect(useScientificCalculatorStore.getState().currentLatex).toBe("kappa_body = 6.217e-27*1000");
      expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
    });

    it("runs StarSim runtime receipts through theory badge actions", () => {
      const runtimeResult = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "run_runtime_badge",
          args: {
            badge_id: "starsim.runtime.evaluate_fusion_microphysics",
            object_context: {
              kind: "starsim_star",
              observables: {
                objectClass: "red_giant",
                spectralType: "K1III",
                luminosity_Lsun: 65,
                radius_Rsun: 12,
                mass_Msun: 1.1,
              },
            },
          },
        },
        actionContext(),
      );

      expect(runtimeResult.ok).toBe(true);
      expect(runtimeResult.artifact?.kind).toBe("starsim_runtime_receipt");
      expect(runtimeResult.artifact?.fusion_zone_mode).toBe("shell_fusion");

      const solveResult = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "solve_calculator_loadout",
          args: {
            badge_ids: ["starsim.runtime.evaluate_fusion_microphysics"],
            mode: "dependency_path",
            solve_scope: "all_scalar_and_runtime",
            object_context: {
              kind: "starsim_star",
              observables: {
                objectClass: "red_giant",
                spectralType: "K1III",
                luminosity_Lsun: 65,
                radius_Rsun: 12,
                mass_Msun: 1.1,
              },
            },
          },
        },
        actionContext(),
      );

      expect(solveResult.ok).toBe(true);
      expect(solveResult.artifact?.runtime_receipt_count).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(solveResult.artifact)).toContain("starsim_runtime_receipt");
    });

    it("clears theory map overlays", () => {
      executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "locate_context",
          args: { query: "rest energy", overlay: true },
        },
        actionContext(),
      );
      expect(useTheoryMapOverlayStore.getState().rippleBadgeIds.length).toBeGreaterThan(0);

      const result = executeHelixPanelAction(
        {
          panel_id: "theory-badge-graph",
          action_id: "clear_overlay",
        },
        actionContext(),
      );

      expect(result.ok).toBe(true);
      expect(useTheoryMapOverlayStore.getState().rippleBadgeIds).toEqual([]);
    });

    it("returns theory badge context and connection traces", () => {
    const contextResult = executeHelixPanelAction(
      {
        panel_id: "theory-badge-graph",
        action_id: "get_badge_context",
        args: { badge_id: "nhm2.qei.sampling_window" },
      },
      actionContext(),
    );

    expect(contextResult.ok).toBe(true);
    expect(contextResult.artifact?.kind).toBe("theory_badge_context");
    expect(contextResult.artifact?.calculator_payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "qei_margin_difference_payload" }),
      ]),
    );

    const traceResult = executeHelixPanelAction(
      {
        panel_id: "theory-badge-graph",
        action_id: "trace_badges",
        args: { badge_ids: ["nhm2.qei.sampling_window", "nhm2.closure.source_residual"] },
      },
      actionContext(),
    );

    expect(traceResult.ok).toBe(true);
    expect(traceResult.artifact?.kind).toBe("theory_badge_connection_trace");
    expect(traceResult.artifact?.shared_ancestor_ids).toEqual(
      expect.arrayContaining(["nhm2.source.energy_density_proxy"]),
    );
    expect(traceResult.artifact?.shared_unit_signatures).toContain("M L^-1 T^-2");
  });

  it("runs a theory badge path through calculator playback", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "theory-badge-graph",
        action_id: "run_badge_path",
        args: { target_badge_id: "nhm2.qei.sampling_window" },
      },
      actionContext(),
    );

    expect(result.ok).toBe(true);
    expect(result.artifact?.kind).toBe("theory_badge_playback");
    expect(result.artifact?.target_badge_id).toBe("nhm2.qei.sampling_window");
    expect(result.artifact?.solved_count).toBeGreaterThanOrEqual(1);
    expect(isTheoryBadgePlaybackArtifactV1(result.artifact?.artifact_v1)).toBe(true);
  });
});
