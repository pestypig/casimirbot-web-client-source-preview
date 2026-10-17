/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkstationNotesPanel from "../WorkstationNotesPanel";
import { useWorkstationNotesStore } from "@/store/useWorkstationNotesStore";
import { useWorkstationSessionMemoryStore } from "@/store/useWorkstationSessionMemoryStore";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";
import { useWorkstationWorkflowTimelineStore } from "@/store/useWorkstationWorkflowTimelineStore";

describe("WorkstationNotesPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    useWorkstationNotesStore.setState({ notes: {}, order: [], active_note_id: undefined });
    useWorkstationSessionMemoryStore.setState({ panelScroll: {}, drafts: {} });
    useWorkspaceMemoryRegistryStore.setState({ artifacts: {} });
    useWorkstationWorkflowTimelineStore.setState({ entries: [] });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("restores a session draft when the persisted note body is empty", async () => {
    useWorkstationNotesStore.getState().upsertWorkflowNote({
      id: "note:manual:untitled-note",
      title: "Untitled note",
      topic: "manual-document",
      body: "",
      citations: [],
      snippets: [],
      trace_id: "test-note",
    });
    useWorkstationSessionMemoryStore
      .getState()
      .rememberDraft("workstation-notes:note:manual:untitled-note:body", "<p>typed draft survives</p>");

    render(<WorkstationNotesPanel />);
    fireEvent.click(screen.getAllByRole("button", { name: /Untitled note/i })[0]);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /Workstation note document editor/i }).innerHTML).toContain(
        "typed draft survives",
      );
    });
    expect(useWorkstationNotesStore.getState().notes["note:manual:untitled-note"]?.body).toBe(
      "<p>typed draft survives</p>",
    );
  });

  it("persists typed note body when backing out and re-entering the note", async () => {
    useWorkstationNotesStore.getState().upsertWorkflowNote({
      id: "note:manual:autosave-proof",
      title: "Autosave proof",
      topic: "manual-document",
      body: "",
      citations: [],
      snippets: [],
      trace_id: "test-note-autosave",
    });

    render(<WorkstationNotesPanel />);
    fireEvent.click(screen.getAllByRole("button", { name: /Autosave proof/i })[0]);

    const editor = await screen.findByRole("textbox", { name: /Workstation note document editor/i });
    editor.innerHTML = "<p>typed body survives panel navigation</p>";
    fireEvent.input(editor);
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(useWorkstationNotesStore.getState().notes["note:manual:autosave-proof"]?.body).toBe(
        "<p>typed body survives panel navigation</p>",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Back to workstation notes/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /Autosave proof/i })[0]);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /Workstation note document editor/i }).innerHTML).toContain(
        "typed body survives panel navigation",
      );
    });
  });
});
