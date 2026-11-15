/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkstationNotesPanel from "../WorkstationNotesPanel";
import { useWorkstationNotesStore } from "@/store/useWorkstationNotesStore";
import { useWorkstationSessionMemoryStore } from "@/store/useWorkstationSessionMemoryStore";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";
import { useWorkstationWorkflowTimelineStore } from "@/store/useWorkstationWorkflowTimelineStore";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";

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
    cacheAccountCapabilityPolicy(null, null);
    vi.restoreAllMocks();
  });

  it("does not offer another account an unowned legacy note", () => {
    const legacy = { id: "note:old", title: "Prior note", topic: "manual-document",
      body: "preserved body", citations: [], snippets: [], created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z" };
    window.localStorage.setItem("workstation-notes:v1", JSON.stringify({
      state: { notes: { [legacy.id]: legacy }, order: [legacy.id] }, version: 0,
    }));
    cacheAccountCapabilityPolicy(null, "profile:panel-import");
    render(<WorkstationNotesPanel />);
    expect(screen.queryByRole("button", { name: "Import notes" })).toBeNull();
    expect(screen.queryByText("Prior note")).toBeNull();
    expect(useWorkstationNotesStore.getState().notes[legacy.id]).toBeUndefined();
    expect(window.localStorage.getItem("workstation-notes:v1")).toContain("preserved body");
  });

  it.each(["note", "profile"] as const)("ignores a queued editor save after the active %s changes", (boundary) => {
    const saveFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      saveFrames.push(callback);
      return saveFrames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    cacheAccountCapabilityPolicy(null, "profile:autosave-alpha");
    const alpha = useWorkstationNotesStore.getState().createManualNote({
      title: "Alpha", body: "<p>Original alpha</p>",
    });
    const alphaScope = useWorkstationNotesStore.getState().storage_scope_key;
    render(<WorkstationNotesPanel />);
    fireEvent.click(screen.getAllByRole("button", { name: /Alpha/i })[0]);
    const editor = screen.getByRole("textbox", { name: /Workstation note document editor/i });
    editor.innerHTML = "<p>Alpha pending edit</p>";
    fireEvent.input(editor);
    const oldSave = saveFrames.at(-1)!;
    expect(oldSave).toBeTypeOf("function");

    act(() => {
      if (boundary === "profile") cacheAccountCapabilityPolicy(null, "profile:autosave-beta");
      useWorkstationNotesStore.getState().createManualNote({
        title: boundary === "profile" ? "Alpha" : "Beta", body: "<p>New selection body</p>",
      });
    });
    expect(screen.getByRole("textbox", { name: /Workstation note document editor/i }).innerHTML)
      .toBe("<p>New selection body</p>");
    act(() => { oldSave(1); });

    expect(useWorkstationSessionMemoryStore.getState().readDraft(`${alphaScope}:${alpha.id}:body`))
      .toBe("");
    expect(useWorkstationSessionMemoryStore.getState().readDraft(`${alphaScope}:${alpha.id}:document`))
      .toBe("");
    if (boundary === "note") {
      expect(useWorkstationNotesStore.getState().notes[alpha.id].body).toBe("<p>Original alpha</p>");
    }
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
      .rememberDraft(`${useWorkstationNotesStore.getState().storage_scope_key}:note:manual:untitled-note:body`,
        "<p>typed draft survives</p>");

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
