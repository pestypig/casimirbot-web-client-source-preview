import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { recordWorkstationTimelineEntry } from "@/store/useWorkstationWorkflowTimelineStore";
import { emitHelixAskLiveEvent } from "@/lib/helix/liveEventsBus";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";

const WORKSTATION_NOTES_STORAGE_KEY = "workstation-notes:v1";

const fallbackNotesStorage = (() => {
  const memory: Record<string, string> = {};
  return {
    getItem: (name: string) => memory[name] ?? null,
    setItem: (name: string, value: string) => {
      memory[name] = value;
    },
    removeItem: (name: string) => {
      delete memory[name];
    },
  };
})();

const safeNotesStorage = createJSONStorage<Pick<WorkstationNotesState, "notes" | "order" | "active_note_id">>(() => ({
  getItem: (name) => {
    try {
      if (typeof window === "undefined") return fallbackNotesStorage.getItem(name);
      return window.localStorage.getItem(name) ?? fallbackNotesStorage.getItem(name);
    } catch (error) {
      console.warn("[workstation-notes] localStorage read failed", error);
      return fallbackNotesStorage.getItem(name);
    }
  },
  setItem: (name, value) => {
    fallbackNotesStorage.setItem(name, value);
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(name, value);
    } catch (error) {
      console.warn("[workstation-notes] localStorage write failed; keeping session copy", error);
    }
  },
  removeItem: (name) => {
    fallbackNotesStorage.removeItem(name);
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(name);
    } catch (error) {
      console.warn("[workstation-notes] localStorage remove failed", error);
    }
  },
}));

export type WorkstationNoteCitation = {
  id: string;
  path: string;
  heading: string;
  start_offset: number;
  end_offset: number;
};

export type WorkstationNoteSnippet = {
  id: string;
  citation_id: string;
  excerpt: string;
};

export type WorkstationNote = {
  id: string;
  title: string;
  topic: string;
  body: string;
  citations: WorkstationNoteCitation[];
  snippets: WorkstationNoteSnippet[];
  created_at: string;
  updated_at: string;
  trace_id?: string;
};

type WorkstationNotesState = {
  notes: Record<string, WorkstationNote>;
  order: string[];
  active_note_id?: string;
  createManualNote: (input?: {
    title?: string;
    topic?: string;
    body?: string;
  }) => WorkstationNote;
  upsertWorkflowNote: (input: {
    id: string;
    title: string;
    topic: string;
    body: string;
    citations: WorkstationNoteCitation[];
    snippets: WorkstationNoteSnippet[];
    trace_id?: string;
  }) => WorkstationNote;
  appendLiveNoteChunk: (input: {
    note_id: string;
    title: string;
    topic: string;
    chunk_text: string;
    citation: WorkstationNoteCitation;
    snippet: WorkstationNoteSnippet;
    trace_id: string;
  }) => WorkstationNote;
  setActiveNote: (noteId: string) => void;
  updateNoteBody: (noteId: string, body: string) => void;
  renameNote: (noteId: string, title: string) => void;
  deleteNote: (noteId: string) => void;
};

const slugForNoteId = (value: string): string => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "untitled-note";
};

const buildManualNoteId = (title: string, existingIds: string[]): string => {
  const base = `note:manual:${slugForNoteId(title)}`;
  if (!existingIds.includes(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existingIds.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
};

function registerNoteMemoryArtifact(note: WorkstationNote) {
  useWorkspaceMemoryRegistryStore.getState().upsertArtifact({
    artifact_id: `workstation-note:${note.id}`,
    artifact_type: "workstation_note",
    storage_key: WORKSTATION_NOTES_STORAGE_KEY,
    storage_backend: "localStorage",
    owner_scope: "browser_guest",
    sync_status: "profile_candidate",
    title: note.title.trim() || "Untitled note",
    updated_at: note.updated_at,
  });
}

export const useWorkstationNotesStore = create<WorkstationNotesState>()(
  persist(
    (set, get) => ({
      notes: {},
      order: [],
      active_note_id: undefined,
      createManualNote: (input) => {
        const title = input?.title?.trim() || "Untitled note";
        const note = get().upsertWorkflowNote({
          id: buildManualNoteId(title, Object.keys(get().notes)),
          title,
          topic: input?.topic?.trim() || "manual-document",
          body: input?.body ?? "",
          citations: [],
          snippets: [],
          trace_id: `workstation-notes:manual:${Date.now()}`,
        });
        return note;
      },
      upsertWorkflowNote: (input) => {
        const nowIso = new Date().toISOString();
        const prev = get().notes[input.id];
        const note: WorkstationNote = {
          id: input.id,
          title: input.title.trim() || "Untitled note",
          topic: input.topic.trim() || "topic",
          body: input.body,
          citations: input.citations,
          snippets: input.snippets,
          created_at: prev?.created_at ?? nowIso,
          updated_at: nowIso,
          trace_id: input.trace_id ?? prev?.trace_id,
        };
        set((state) => ({
          notes: { ...state.notes, [note.id]: note },
          order: [note.id, ...state.order.filter((entry) => entry !== note.id)],
          active_note_id: note.id,
        }));
        registerNoteMemoryArtifact(note);
        recordWorkstationTimelineEntry({
          lane: "notes",
          label: `Saved note "${note.title}"`,
          detail: `topic=${note.topic} snippets=${note.snippets.length} citations=${note.citations.length}`,
          traceId: note.trace_id,
          panelId: "workstation-notes",
        });
        const traceId = note.trace_id?.trim() || `workstation-notes:${note.id}`;
        emitHelixAskLiveEvent({
          contextId: HELIX_ASK_CONTEXT_ID.desktop,
          traceId,
          entry: {
            id: `workstation-note-saved:${note.id}:${Date.now()}`,
            text: `saved note "${note.title}" with ${note.snippets.length} snippet(s) and ${note.citations.length} citation(s)`,
            tool: "workstation.notes",
            ts: new Date().toISOString(),
            meta: {
              kind: "workstation_note_saved",
              note_id: note.id,
              topic: note.topic,
              snippets_count: note.snippets.length,
              citations_count: note.citations.length,
              trace_id: traceId,
            },
          },
        });
        return note;
      },
      appendLiveNoteChunk: (input) => {
        const current = get().notes[input.note_id];
        const nowIso = new Date().toISOString();
        const normalizedChunk = input.chunk_text.trim();
        const body = [
          current?.body?.trim() ?? "",
          normalizedChunk ? `- ${normalizedChunk}` : "",
        ].filter(Boolean).join("\n");
        const citations = current
          ? [...current.citations.filter((citation) => citation.id !== input.citation.id), input.citation]
          : [input.citation];
        const snippets = current
          ? [...current.snippets.filter((snippet) => snippet.id !== input.snippet.id), input.snippet]
          : [input.snippet];
        const note: WorkstationNote = {
          id: input.note_id,
          title: input.title.trim() || current?.title || "Live note",
          topic: input.topic.trim() || current?.topic || "live-source",
          body,
          citations,
          snippets,
          created_at: current?.created_at ?? nowIso,
          updated_at: nowIso,
          trace_id: input.trace_id,
        };
        set((state) => ({
          notes: { ...state.notes, [note.id]: note },
          order: [note.id, ...state.order.filter((entry) => entry !== note.id)],
          active_note_id: note.id,
        }));
        recordWorkstationTimelineEntry({
          lane: "notes",
          label: `Appended live note chunk "${note.title}"`,
          detail: `topic=${note.topic} trace=${input.trace_id}`,
          traceId: input.trace_id,
          panelId: "workstation-notes",
        });
        emitHelixAskLiveEvent({
          contextId: HELIX_ASK_CONTEXT_ID.desktop,
          traceId: input.trace_id,
          entry: {
            id: `workstation-live-note:${note.id}:${Date.now()}`,
            text: `appended live note chunk to "${note.title}"`,
            tool: "workstation.notes",
            ts: nowIso,
            meta: {
              kind: "workstation_live_note_chunk",
              note_id: note.id,
              topic: note.topic,
              trace_id: input.trace_id,
              raw_transcript_included: false,
            },
          },
        });
        return note;
      },
      setActiveNote: (noteId) =>
        set((state) => ({
          active_note_id: state.notes[noteId] ? noteId : state.active_note_id,
        })),
      updateNoteBody: (noteId, body) =>
        set((state) => {
          const current = state.notes[noteId];
          if (!current) return state;
          const updated = {
            ...current,
            body,
            updated_at: new Date().toISOString(),
          };
          registerNoteMemoryArtifact(updated);
          return {
            notes: {
              ...state.notes,
              [noteId]: updated,
            },
          };
        }),
      renameNote: (noteId, title) =>
        set((state) => {
          const current = state.notes[noteId];
          if (!current) return state;
          const updated = {
            ...current,
            title,
            updated_at: new Date().toISOString(),
          };
          registerNoteMemoryArtifact(updated);
          return {
            notes: {
              ...state.notes,
              [noteId]: updated,
            },
          };
        }),
      deleteNote: (noteId) =>
        set((state) => {
          if (!state.notes[noteId]) return state;
          useWorkspaceMemoryRegistryStore.getState().removeArtifact(`workstation-note:${noteId}`);
          const nextNotes = { ...state.notes };
          delete nextNotes[noteId];
          const nextOrder = state.order.filter((entry) => entry !== noteId);
          const nextActive =
            state.active_note_id === noteId ? (nextOrder[0] ?? undefined) : state.active_note_id;
          return {
            notes: nextNotes,
            order: nextOrder,
            active_note_id: nextActive,
          };
        }),
    }),
    {
      name: WORKSTATION_NOTES_STORAGE_KEY,
      storage: safeNotesStorage,
      partialize: (state) => ({
        notes: state.notes,
        order: state.order,
        active_note_id: state.active_note_id,
      }),
    },
  ),
);
