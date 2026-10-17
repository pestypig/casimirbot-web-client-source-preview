import React from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  Code,
  Eraser,
  FileText,
  Heading1,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
  Loader2,
  Plus,
  Quote,
  Redo2,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import { useWorkstationNotesStore } from "@/store/useWorkstationNotesStore";
import { useWorkstationSessionMemoryStore } from "@/store/useWorkstationSessionMemoryStore";
import { cn } from "@/lib/utils";

function formatWhen(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString();
}

const RICH_NOTE_ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "I",
  "LI",
  "OL",
  "P",
  "PRE",
  "S",
  "SPAN",
  "STRIKE",
  "STRONG",
  "SUB",
  "SUP",
  "U",
  "UL",
]);

const RICH_NOTE_ALLOWED_STYLES = new Set([
  "font-weight",
  "font-style",
  "text-decoration",
  "text-align",
  "color",
  "background-color",
]);

const isLikelyRichDocument = (value: string): boolean => /<\/?[a-z][\s\S]*>/i.test(value);

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const plainTextToDocumentHtml = (value: string): string => {
  const blocks = value.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br>")}</p>`;
    })
    .filter(Boolean)
    .join("");
};

const sanitizeRichNoteHtml = (html: string): string => {
  if (typeof window === "undefined") {
    return isLikelyRichDocument(html) ? html : plainTextToDocumentHtml(html);
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  const sanitizeNode = (node: Node): void => {
    Array.from(node.childNodes).forEach((child) => sanitizeNode(child));
    if (!(node instanceof Element)) return;
    if (!RICH_NOTE_ALLOWED_TAGS.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      return;
    }
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name === "href" && node.tagName === "A") {
        const href = attribute.value.trim();
        if (/^(https?:|mailto:|#|\/)/i.test(href)) {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noreferrer");
          return;
        }
      }
      if (name === "style") {
        const filtered = attribute.value
          .split(";")
          .map((entry) => entry.trim())
          .filter((entry) => {
            const [key] = entry.split(":");
            return key ? RICH_NOTE_ALLOWED_STYLES.has(key.trim().toLowerCase()) : false;
          })
          .join("; ");
        if (filtered) {
          node.setAttribute("style", filtered);
          return;
        }
      }
      node.removeAttribute(attribute.name);
    });
  };
  sanitizeNode(root);
  return root.innerHTML.trim();
};

type EditorCommand =
  | { id: string; label: string; icon: React.ComponentType<{ className?: string }>; command: string; value?: string }
  | { id: string; label: string; icon: React.ComponentType<{ className?: string }>; action: "link" };

type NoteSaveState = "saved" | "saving";

type WorkstationNoteSessionSaveSnapshot = {
  note_id: string;
  title: string;
  body: string;
  saved_at: string;
};

const editorCommandGroups: EditorCommand[][] = [
  [
    { id: "undo", label: "Undo", icon: Undo2, command: "undo" },
    { id: "redo", label: "Redo", icon: Redo2, command: "redo" },
  ],
  [
    { id: "paragraph", label: "Paragraph", icon: FileText, command: "formatBlock", value: "P" },
    { id: "heading-1", label: "Heading 1", icon: Heading1, command: "formatBlock", value: "H1" },
    { id: "heading-2", label: "Heading 2", icon: Heading2, command: "formatBlock", value: "H2" },
  ],
  [
    { id: "bold", label: "Bold", icon: Bold, command: "bold" },
    { id: "italic", label: "Italic", icon: Italic, command: "italic" },
    { id: "underline", label: "Underline", icon: Underline, command: "underline" },
    { id: "strike", label: "Strikethrough", icon: Strikethrough, command: "strikeThrough" },
    { id: "code", label: "Code style", icon: Code, command: "formatBlock", value: "PRE" },
  ],
  [
    { id: "bullet-list", label: "Bulleted list", icon: List, command: "insertUnorderedList" },
    { id: "numbered-list", label: "Numbered list", icon: ListOrdered, command: "insertOrderedList" },
    { id: "quote", label: "Quote", icon: Quote, command: "formatBlock", value: "BLOCKQUOTE" },
  ],
  [
    { id: "align-left", label: "Align left", icon: AlignLeft, command: "justifyLeft" },
    { id: "align-center", label: "Align center", icon: AlignCenter, command: "justifyCenter" },
    { id: "align-right", label: "Align right", icon: AlignRight, command: "justifyRight" },
  ],
  [
    { id: "link", label: "Insert link", icon: Link, action: "link" },
    { id: "clear-formatting", label: "Clear formatting", icon: Eraser, command: "removeFormat" },
  ],
];

export default function WorkstationNotesPanel() {
  const notes = useWorkstationNotesStore((state) => state.notes);
  const order = useWorkstationNotesStore((state) => state.order);
  const activeNoteId = useWorkstationNotesStore((state) => state.active_note_id);
  const createManualNote = useWorkstationNotesStore((state) => state.createManualNote);
  const setActiveNote = useWorkstationNotesStore((state) => state.setActiveNote);
  const updateBody = useWorkstationNotesStore((state) => state.updateNoteBody);
  const renameNote = useWorkstationNotesStore((state) => state.renameNote);
  const deleteNote = useWorkstationNotesStore((state) => state.deleteNote);
  const rememberDraft = useWorkstationSessionMemoryStore((state) => state.rememberDraft);
  const readDraft = useWorkstationSessionMemoryStore((state) => state.readDraft);
  const [viewMode, setViewMode] = React.useState<"list" | "reader">("list");
  const [saveState, setSaveState] = React.useState<NoteSaveState>("saved");
  const noteRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const editorSelectionRef = React.useRef<Range | null>(null);
  const lastActiveNoteIdRef = React.useRef(activeNoteId);
  const saveStateTimeoutRef = React.useRef<number | null>(null);
  const pendingEditorSaveFrameRef = React.useRef<number | null>(null);

  const noteList = React.useMemo(
    () => order.map((id) => notes[id]).filter(Boolean),
    [notes, order],
  );
  const activeNote = activeNoteId ? notes[activeNoteId] : undefined;
  const activeNoteTitle = activeNote?.title ?? "";

  const editorHtml = React.useMemo(
    () => sanitizeRichNoteHtml(activeNote?.body ?? ""),
    [activeNote?.body],
  );

  React.useEffect(() => {
    if (!activeNoteId || lastActiveNoteIdRef.current === activeNoteId) return;
    lastActiveNoteIdRef.current = activeNoteId;
    setViewMode("reader");
    setSaveState("saved");
  }, [activeNoteId]);

  React.useEffect(() => {
    if (activeNoteId) return;
    setViewMode("list");
  }, [activeNoteId]);

  React.useEffect(() => {
    if (!activeNote || activeNote.body.trim()) return;
    const draftBody = readDraft(`workstation-notes:${activeNote.id}:body`);
    if (!draftBody.trim()) return;
    updateBody(activeNote.id, draftBody);
  }, [activeNote, readDraft, updateBody]);

  React.useEffect(() => {
    if (viewMode !== "list" || !activeNoteId) return;
    const target = noteRefs.current[activeNoteId];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeNoteId, noteList, viewMode]);

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeNote) return;
    if (editor.innerHTML === editorHtml) return;
    editor.innerHTML = editorHtml;
  }, [activeNote, editorHtml, viewMode]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const updateSelection = () => {
      const editor = editorRef.current;
      const selection = document.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return;
      editorSelectionRef.current = range.cloneRange();
    };
    document.addEventListener("selectionchange", updateSelection);
    return () => document.removeEventListener("selectionchange", updateSelection);
  }, []);

  React.useEffect(() => {
    return () => {
      if (saveStateTimeoutRef.current !== null) {
        window.clearTimeout(saveStateTimeoutRef.current);
      }
      if (pendingEditorSaveFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingEditorSaveFrameRef.current);
      }
    };
  }, []);

  const markAutosave = React.useCallback(
    (snapshot?: WorkstationNoteSessionSaveSnapshot) => {
      if (snapshot) {
        rememberDraft(
          `workstation-notes:${snapshot.note_id}:document`,
          JSON.stringify(snapshot),
        );
      }
      setSaveState("saving");
      if (saveStateTimeoutRef.current !== null) {
        window.clearTimeout(saveStateTimeoutRef.current);
      }
      saveStateTimeoutRef.current = window.setTimeout(() => {
        setSaveState("saved");
        saveStateTimeoutRef.current = null;
      }, 450);
    },
    [rememberDraft],
  );

  const handleSelectNote = React.useCallback(
    (noteId: string) => {
      setActiveNote(noteId);
      setViewMode("reader");
    },
    [setActiveNote],
  );

  const handleDeleteNote = React.useCallback(
    (noteId: string) => {
      deleteNote(noteId);
      setViewMode("list");
    },
    [deleteNote],
  );

  const handleCreateNote = React.useCallback(() => {
    const note = createManualNote();
    setActiveNote(note.id);
    setViewMode("reader");
  }, [createManualNote, setActiveNote]);

  const handleRenameNote = React.useCallback(
    (title: string) => {
      if (!activeNote) return;
      renameNote(activeNote.id, title);
      rememberDraft(`workstation-notes:${activeNote.id}:title`, title);
      markAutosave({
        note_id: activeNote.id,
        title,
        body: activeNote.body,
        saved_at: new Date().toISOString(),
      });
    },
    [activeNote, markAutosave, rememberDraft, renameNote],
  );

  const persistEditorHtml = React.useCallback(() => {
    if (!activeNote || !editorRef.current) return;
    const html = sanitizeRichNoteHtml(editorRef.current.innerHTML);
    if (html !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = html;
    }
    updateBody(activeNote.id, html);
    rememberDraft(`workstation-notes:${activeNote.id}:body`, html);
    markAutosave({
      note_id: activeNote.id,
      title: activeNote.title,
      body: html,
      saved_at: new Date().toISOString(),
    });
  }, [activeNote, markAutosave, rememberDraft, updateBody]);

  const scheduleEditorSave = React.useCallback(() => {
    if (pendingEditorSaveFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingEditorSaveFrameRef.current);
    }
    pendingEditorSaveFrameRef.current = window.requestAnimationFrame(() => {
      pendingEditorSaveFrameRef.current = null;
      persistEditorHtml();
    });
  }, [persistEditorHtml]);

  const runEditorCommand = React.useCallback(
    (command: EditorCommand) => {
      const editor = editorRef.current;
      if (!editor || !activeNote) return;
      editor.focus();
      const selection = document.getSelection();
      const savedRange = editorSelectionRef.current;
      if (selection && savedRange && editor.contains(savedRange.commonAncestorContainer)) {
        selection.removeAllRanges();
        selection.addRange(savedRange);
      }
      if ("action" in command && command.action === "link") {
        const url = window.prompt("Link URL");
        if (!url?.trim()) return;
        document.execCommand("createLink", false, url.trim());
      } else if ("command" in command) {
        document.execCommand(command.command, false, command.value);
      }
      persistEditorHtml();
    },
    [activeNote, persistEditorHtml],
  );

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-slate-950/90 text-slate-100">
      {viewMode === "list" ? (
        <section className="flex h-full min-h-0 w-full flex-col bg-slate-950/60">
          <div className="border-b border-white/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <FileText className="h-4 w-4 text-cyan-300" />
                Workstation Notes
              </div>
              <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-notes.workstation-notes-panel.new-note"
                type="button"
                onClick={handleCreateNote}
                className="inline-flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                New note
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Showing {noteList.length} {noteList.length === 1 ? "note" : "notes"}.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {noteList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/15 bg-black/20 p-4 text-xs text-slate-400">
                <p>No notes yet.</p>
                <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-notes.workstation-notes-panel.start-a-note"
                  type="button"
                  onClick={handleCreateNote}
                  className="mt-3 inline-flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Start a note
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {noteList.map((note) => {
                  const selected = note.id === activeNoteId;
                  return (
                    <div
                      key={note.id}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                        selected
                          ? "bg-cyan-500/20 text-white ring-1 ring-cyan-500/60"
                          : "text-slate-200 hover:bg-white/5",
                      )}
                    >
                      <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-notes.workstation-notes-panel.handle-select-note-note-id"
                        ref={(node) => {
                          noteRefs.current[note.id] = node;
                        }}
                        type="button"
                        onClick={() => handleSelectNote(note.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="break-words text-sm font-medium leading-tight">
                          {note.title.trim() || "Untitled note"}
                        </p>
                        <p className="mt-1 break-words text-[11px] text-slate-400">{note.topic}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{formatWhen(note.updated_at)}</p>
                      </button>
                      <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-notes.workstation-notes-panel.handle-delete-note-note-id"
                        type="button"
                        aria-label={`Delete ${note.title.trim() || "Untitled note"}`}
                        onClick={() => handleDeleteNote(note.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col">
          {!activeNote ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-400">
              <p>Select a note from the list to open the reader.</p>
              <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-notes.workstation-notes-panel.back-to-notes"
                type="button"
                onClick={() => setViewMode("list")}
                className="rounded border border-white/15 bg-black/25 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              >
                Back to notes
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-notes.workstation-notes-panel.back-to-workstation-notes"
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-label="Back to workstation notes"
                  className="h-9 w-9 shrink-0 rounded-full border border-white/10 text-slate-100 hover:bg-white/10 hover:text-cyan-100"
                >
                  <ArrowLeft className="mx-auto h-4 w-4" />
                </button>
                <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-notes.workstation-notes-panel.untitled-note"
                  value={activeNoteTitle}
                  onChange={(event) => handleRenameNote(event.target.value)}
                  placeholder="Untitled note"
                  className="min-w-0 flex-1 rounded border border-white/20 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                />
                <button data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-notes.workstation-notes-panel.button"
                  type="button"
                  disabled
                  aria-label={saveState === "saving" ? "Saving session" : "Session saved"}
                  title={saveState === "saving" ? "Saving session" : "Session saved"}
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-slate-100",
                    saveState === "saving"
                      ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                      : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
                  )}
                >
                  {saveState === "saving" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </button>
                <span className="sr-only" role="status" aria-live="polite">
                  {saveState === "saving" ? "Saving session" : "Session saved"}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex flex-wrap gap-1 border-b border-white/10 bg-slate-950/80 px-3 py-2">
                    {editorCommandGroups.map((group, groupIndex) => (
                      <div
                        key={`format-group-${groupIndex}`}
                        className="flex items-center gap-1 border-r border-white/10 pr-1 last:border-r-0"
                      >
                        {group.map((command) => {
                          const Icon = command.icon;
                          return (
                            <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-notes.workstation-notes-panel.run-editor-command-command"
                              key={command.id}
                              type="button"
                              title={command.label}
                              aria-label={command.label}
                              onPointerDown={(event) => event.preventDefault()}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => runEditorCommand(command)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                            >
                              <Icon className="h-4 w-4" />
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div
                    ref={editorRef}
                    contentEditable
                    role="textbox"
                    aria-label="Workstation note document editor"
                    data-placeholder="Type or paste long-form notes here..."
                    onInput={scheduleEditorSave}
                    onKeyUp={scheduleEditorSave}
                    onPaste={scheduleEditorSave}
                    onBlur={persistEditorHtml}
                    className="prose prose-invert prose-sm min-h-[420px] max-w-none flex-1 overflow-y-auto bg-slate-950 px-5 py-4 text-sm leading-6 text-slate-100 outline-none prose-headings:text-white prose-a:text-cyan-300 prose-blockquote:border-cyan-400/40 prose-blockquote:text-slate-300 prose-code:text-cyan-100 empty:before:pointer-events-none empty:before:text-slate-500 empty:before:content-[attr(data-placeholder)]"
                    suppressContentEditableWarning
                  />
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
