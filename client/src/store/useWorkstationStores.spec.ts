import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveActiveHelixAskSession } from "@/lib/helix/helixAskChatSessions";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { useHelixAskWorkspaceSessionStore } from "@/store/useHelixAskWorkspaceSessionStore";
import { useWorkstationClipboardStore } from "@/store/useWorkstationClipboardStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { useWorkstationNotesStore } from "@/store/useWorkstationNotesStore";
import { useWorkstationSessionMemoryStore } from "@/store/useWorkstationSessionMemoryStore";
import { useWorkstationWorkflowTimelineStore } from "@/store/useWorkstationWorkflowTimelineStore";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";

describe("workstation stores", () => {
  beforeEach(() => {
    useAgiChatStore.setState({ sessions: {}, activeId: undefined });
    useHelixAskWorkspaceSessionStore.setState({ layoutSnapshots: {} });
    useWorkstationLayoutStore.setState({
      chatDock: { side: "right", widthPx: 420, collapsed: false },
      activeGroupId: "group-primary",
      groups: {
        "group-primary": {
          id: "group-primary",
          title: "Primary",
          panelIds: [],
          activePanelId: null,
        },
      },
      root: { type: "group", groupId: "group-primary" },
      recentlyClosedPanels: [],
    });
    useWorkstationNotesStore.setState({ notes: {}, order: [], active_note_id: undefined });
    useWorkstationClipboardStore.setState({ receipts: [] });
    useWorkstationSessionMemoryStore.setState({ panelScroll: {}, drafts: {} });
    useWorkstationWorkflowTimelineStore.setState({ entries: [] });
    useWorkspaceMemoryRegistryStore.setState({ artifacts: {} });
  });

  it("creates and activates notes via upsertWorkflowNote", () => {
    const created = useWorkstationNotesStore.getState().upsertWorkflowNote({
      id: "note:test",
      title: "Test note",
      topic: "topic-a",
      body: "alpha",
      citations: [],
      snippets: [],
    });
    const state = useWorkstationNotesStore.getState();
    expect(created.id).toBe("note:test");
    expect(state.active_note_id).toBe("note:test");
    expect(state.order[0]).toBe("note:test");
  });

  it("creates manual workstation notes with stable unique ids", () => {
    const notes = useWorkstationNotesStore.getState();
    const first = notes.createManualNote({ title: "Draft brief" });
    const second = notes.createManualNote({ title: "Draft brief" });
    const state = useWorkstationNotesStore.getState();
    expect(first.id).toBe("note:manual:draft-brief");
    expect(second.id).toBe("note:manual:draft-brief-2");
    expect(state.active_note_id).toBe(second.id);
    expect(state.notes[first.id]?.topic).toBe("manual-document");
    expect(state.order.slice(0, 2)).toEqual([second.id, first.id]);
  });

  it("updates note body and timestamp deterministically", () => {
    const notes = useWorkstationNotesStore.getState();
    notes.upsertWorkflowNote({
      id: "note:test",
      title: "Test note",
      topic: "topic-a",
      body: "alpha",
      citations: [],
      snippets: [],
    });
    const before = useWorkstationNotesStore.getState().notes["note:test"]?.updated_at ?? "";
    notes.updateNoteBody("note:test", "alpha\nbeta");
    const updated = useWorkstationNotesStore.getState().notes["note:test"];
    expect(updated?.body).toBe("alpha\nbeta");
    expect(Date.parse(updated?.updated_at ?? "")).toBeGreaterThanOrEqual(Date.parse(before));
  });

  it("allows manual note titles to be blank or contain surrounding spaces while editing", () => {
    const notes = useWorkstationNotesStore.getState();
    const note = notes.createManualNote({ title: "Draft brief" });
    notes.renameNote(note.id, "");
    expect(useWorkstationNotesStore.getState().notes[note.id]?.title).toBe("");

    notes.renameNote(note.id, "  Project plan  ");
    expect(useWorkstationNotesStore.getState().notes[note.id]?.title).toBe("  Project plan  ");
  });

  it("tracks clipboard read/write style receipts and clear behavior", () => {
    const clipboard = useWorkstationClipboardStore.getState();
    clipboard.addReceipt({
      id: "clip:1",
      direction: "write",
      text: "first",
      source: "spec",
      meta: { receipt_link: "none" },
    });
    clipboard.addReceipt({
      id: "clip:2",
      direction: "read",
      text: "second",
      source: "spec",
      meta: { receipt_link: "clip:1" },
    });
    const state = useWorkstationClipboardStore.getState();
    expect(state.receipts[0]?.id).toBe("clip:2");
    expect(state.receipts[0]?.meta?.receipt_link).toBe("clip:1");
    expect(state.receipts).toHaveLength(2);
    clipboard.clearReceipts();
    expect(useWorkstationClipboardStore.getState().receipts).toHaveLength(0);
  });

  it("keeps clipboard receipts in memory when localStorage quota is exceeded", () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => {
          storage.delete(key);
        },
        setItem: (key: string, value: string) => {
          if (key === "workstation-clipboard-history:v1") {
            throw new Error("Quota exceeded");
          }
          storage.set(key, value);
        },
      },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      useWorkstationClipboardStore.getState().addReceipt({
        id: "clip:quota",
        direction: "write",
        text: "x".repeat(10_000),
        source: "quota-spec",
        meta: { large: "y".repeat(10_000) },
      });

      const receipt = useWorkstationClipboardStore.getState().receipts[0];
      expect(receipt?.id).toBe("clip:quota");
      expect(receipt?.text.length).toBeLessThan(4100);
      expect(receipt?.meta).toMatchObject({ truncated: true });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[workstation-clipboard] localStorage write skipped after quota pressure"),
        expect.anything(),
      );
    } finally {
      warnSpy.mockRestore();
      if (originalWindow === undefined) {
        vi.unstubAllGlobals();
      } else {
        vi.stubGlobal("window", originalWindow);
      }
    }
  });

  it("keeps chat messages in memory while trimming the browser-saved copy after quota pressure", () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    const storage = new Map<string, string>();
    let throwNextChatWrite = true;
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => {
          storage.delete(key);
        },
        setItem: (key: string, value: string) => {
          if (key === "agi-chat-sessions-v1" && throwNextChatWrite) {
            throwNextChatWrite = false;
            throw new Error("Quota exceeded");
          }
          storage.set(key, value);
        },
      },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const chats = useAgiChatStore.getState();
      const sessionId = chats.newSession("Quota chat", "helix-ask-chat:quota");
      const hugeContent = `answer\n${"x".repeat(50_000)}`;
      chats.addMessage(sessionId, {
        role: "assistant",
        content: hugeContent,
        helixAsk: {
          debug: "y".repeat(40_000),
        },
      });

      const inMemoryMessage = useAgiChatStore.getState().sessions[sessionId]?.messages[0];
      expect(inMemoryMessage?.content).toBe(hugeContent);
      expect(JSON.stringify(inMemoryMessage?.helixAsk ?? {})).toContain("y".repeat(100));

      const stored = storage.get("agi-chat-sessions-v1");
      expect(stored).toBeTruthy();
      expect(stored?.length ?? 0).toBeLessThan(80_000);
      expect(stored).toContain("saved chat copy");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[agi-chat] saved chat copy was truncated after storage quota pressure"),
        expect.anything(),
      );
    } finally {
      warnSpy.mockRestore();
      if (originalWindow === undefined) {
        vi.unstubAllGlobals();
      } else {
        vi.stubGlobal("window", originalWindow);
      }
    }
  });

  it("remembers workstation scroll positions and drafts for the browser session", () => {
    const memory = useWorkstationSessionMemoryStore.getState();
    memory.rememberPanelScroll("docs-viewer:doc:/docs/example.md", {
      scrollTop: 320.6,
      scrollHeight: 1400,
      clientHeight: 500,
    });
    memory.rememberDraft("scientific-calculator:input", "tau = alpha T");
    memory.rememberDraft("situation-room:pipeline-draft", "monitor voice chat");

    const state = useWorkstationSessionMemoryStore.getState();
    expect(state.readPanelScroll("docs-viewer:doc:/docs/example.md")?.scrollTop).toBe(321);
    expect(state.readDraft("scientific-calculator:input")).toBe("tau = alpha T");
    expect(state.buildWorkstationSessionMemorySnapshot()).toMatchObject({
      schema: "helix.workstation_memory.v1",
      memory_class: "surface_session_only",
      storage: "sessionStorage",
      panel_scroll_keys: ["docs-viewer:doc:/docs/example.md"],
      context_injection: "never_by_default",
      user_visible: true,
    });
    expect(state.buildWorkstationSessionMemorySnapshot().draft_keys).toEqual([
      "scientific-calculator:input",
      "situation-room:pipeline-draft",
    ]);

    state.clearDraft("scientific-calculator:input");
    expect(useWorkstationSessionMemoryStore.getState().readDraft("scientific-calculator:input")).toBe("");
    expect(useWorkstationSessionMemoryStore.getState().readDraft("situation-room:pipeline-draft")).toBe("monitor voice chat");
  });

  it("registers workspace memory artifacts by storage and ownership scope", () => {
    const notes = useWorkstationNotesStore.getState();
    const note = notes.createManualNote({ title: "Registry note" });
    notes.updateNoteBody(note.id, "body");

    const chats = useAgiChatStore.getState();
    const sessionId = chats.newSession("New chat", "helix-ask-chat:registry");
    chats.addMessage(sessionId, {
      role: "user",
      content: "Registry chat",
    });

    const memory = useWorkstationSessionMemoryStore.getState();
    memory.rememberDraft(`workstation-notes:${note.id}:body`, "<p>body</p>");

    const layout = useWorkstationLayoutStore.getState();
    const snapshot = layout.captureLayoutSnapshot();
    useHelixAskWorkspaceSessionStore.getState().saveLayoutSnapshot(sessionId, snapshot);

    const registry = useWorkspaceMemoryRegistryStore.getState().buildRegistrySnapshot();
    expect(registry.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifact_id: `workstation-note:${note.id}`,
          artifact_type: "workstation_note",
          owner_scope: "browser_guest",
          storage_backend: "localStorage",
          sync_status: "profile_candidate",
        }),
        expect.objectContaining({
          artifact_id: `helix-chat-session:${sessionId}`,
          artifact_type: "helix_chat_session",
          owner_scope: "browser_guest",
          storage_backend: "localStorage",
          sync_status: "profile_candidate",
          chat_session_id: sessionId,
          title: "Registry chat",
        }),
        expect.objectContaining({
          artifact_id: `workstation-session-draft:workstation-notes:${note.id}:body`,
          artifact_type: "workstation_session_draft",
          owner_scope: "surface_session_only",
          storage_backend: "sessionStorage",
          sync_status: "local_only",
        }),
        expect.objectContaining({
          artifact_id: `helix-chat-layout:${sessionId}`,
          artifact_type: "helix_chat_layout",
          owner_scope: "browser_guest",
          storage_backend: "localStorage",
          sync_status: "local_only",
          chat_session_id: sessionId,
        }),
      ]),
    );
    expect(registry.profile_ready_artifact_count).toBe(2);
    expect(registry.session_only_artifact_count).toBe(1);
  });

  it("titles a fresh Helix Ask chat from the first user message", () => {
    const chats = useAgiChatStore.getState();
    const sessionId = chats.newSession("New chat", "helix-ask-chat:test");
    chats.addMessage(sessionId, {
      role: "user",
      content: "Plan the next workstation research pass with notes",
    });

    expect(useAgiChatStore.getState().sessions[sessionId]?.title).toBe(
      "Plan the next workstation research pass with notes",
    );
  });

  it("resolves Helix Ask resume from chat-session identity instead of global artifact recency", () => {
    const chats = useAgiChatStore.getState();
    const olderChatId = chats.newSession("Older chat", "helix-ask-chat:older");
    chats.addMessage(olderChatId, {
      role: "user",
      content: "Older saved chat",
    });
    const newerChatId = chats.newSession("Newer chat", "helix-ask-chat:newer");
    chats.addMessage(newerChatId, {
      role: "user",
      content: "Newer saved chat",
    });
    const nonHelixChatId = chats.newSession("Account chat", "account-panel");
    useAgiChatStore.setState((state) => ({
      sessions: {
        ...state.sessions,
        [olderChatId]: {
          ...state.sessions[olderChatId]!,
          updatedAt: "2026-06-13T10:00:00.000Z",
        },
        [newerChatId]: {
          ...state.sessions[newerChatId]!,
          updatedAt: "2026-06-13T10:01:00.000Z",
        },
      },
    }));

    const note = useWorkstationNotesStore.getState().createManualNote({ title: "Newest note artifact" });
    useWorkstationNotesStore.getState().updateNoteBody(note.id, "This note can be newer without selecting a chat.");

    const sessions = useAgiChatStore.getState().sessions;
    expect(resolveActiveHelixAskSession(sessions, olderChatId)?.id).toBe(olderChatId);
    expect(resolveActiveHelixAskSession(sessions, nonHelixChatId)?.id).toBe(newerChatId);
  });

  it("saves and restores workstation layout snapshots per Helix Ask chat", () => {
    const layout = useWorkstationLayoutStore.getState();
    layout.openPanelInActiveGroup("workstation-notes");
    layout.setChatDockWidth(560);
    const snapshot = useWorkstationLayoutStore.getState().captureLayoutSnapshot();
    const workspaceSessions = useHelixAskWorkspaceSessionStore.getState();

    workspaceSessions.saveLayoutSnapshot("chat-a", snapshot);
    layout.setChatDockWidth(360);
    layout.openPanelInActiveGroup("docs-viewer");

    const restored = workspaceSessions.readLayoutSnapshot("chat-a");
    expect(restored).not.toBeNull();
    useWorkstationLayoutStore.getState().applyLayoutSnapshot(restored!);

    const state = useWorkstationLayoutStore.getState();
    expect(state.chatDock.widthPx).toBe(560);
    expect(state.groups["group-primary"]?.panelIds).toEqual(["workstation-notes"]);
    expect(state.groups["group-primary"]?.activePanelId).toBe("workstation-notes");
  });

  it("removes workstation layout memory when a Helix Ask chat is deleted", () => {
    const layout = useWorkstationLayoutStore.getState();
    const snapshot = layout.captureLayoutSnapshot();
    const workspaceSessions = useHelixAskWorkspaceSessionStore.getState();

    workspaceSessions.saveLayoutSnapshot("chat-delete", snapshot);
    expect(workspaceSessions.readLayoutSnapshot("chat-delete")).not.toBeNull();
    expect(useWorkspaceMemoryRegistryStore.getState().artifacts["helix-chat-layout:chat-delete"]).toBeDefined();

    workspaceSessions.removeLayoutSnapshot("chat-delete");

    expect(useHelixAskWorkspaceSessionStore.getState().readLayoutSnapshot("chat-delete")).toBeNull();
    expect(useWorkspaceMemoryRegistryStore.getState().artifacts["helix-chat-layout:chat-delete"]).toBeUndefined();
  });
});
