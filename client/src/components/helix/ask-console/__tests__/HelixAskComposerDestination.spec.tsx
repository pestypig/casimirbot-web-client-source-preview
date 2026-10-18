// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHelixAskComposerDestinationModel,
  saveHelixOperatorNote,
  shouldAutomaticallySelectBoundAgent,
  shouldClearBoundAgentComposerAfterSend,
  transitionHelixAskComposerDraft,
} from "../HelixAskComposerDestination";
import { HelixAskComposerDestinationStrip } from
  "../HelixAskComposerDestinationStrip";
import { buildHelixAskLegacyComposerState } from "../HelixAskLegacyComposerState";

describe("Helix Ask composer destination", () => {
  afterEach(cleanup);
  it("shows setup only for a selected unavailable task destination", () => {
    const open = vi.fn();
    const change = vi.fn();
    render(<HelixAskComposerDestinationStrip model={buildHelixAskComposerDestinationModel({kind: "helix_ask"})} onDestinationChange={change} onOpenConnectionSetup={open} externalBindingUnavailable />);
    expect(screen.queryByRole("button", { name: "Set up task" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Composer destination"), {target: {value: "bound_agent"}});
    expect(open).not.toHaveBeenCalled();
    expect(change).toHaveBeenCalledWith("bound_agent");
    cleanup();
    render(<HelixAskComposerDestinationStrip model={buildHelixAskComposerDestinationModel({kind: "bound_agent"})} onDestinationChange={change} onOpenConnectionSetup={open} />);
    expect(screen.getByRole("status")).toHaveTextContent("Needs task binding");
    fireEvent.click(screen.getByRole("button", { name: "Set up task" }));
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("does not interrupt an available binding with setup", () => {
    render(<HelixAskComposerDestinationStrip model={buildHelixAskComposerDestinationModel({kind: "bound_agent", boundAgentState: "active"})} onDestinationChange={vi.fn()} onOpenConnectionSetup={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Composer destination"), {target: {value: "bound_agent"}});
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("offers one compact destination chooser without submitting", () => {
    const change = vi.fn();
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(<form onSubmit={submit}><HelixAskComposerDestinationStrip
      model={buildHelixAskComposerDestinationModel({ kind: "helix_ask", runtimeLabel: "Codex" })}
      onDestinationChange={change}
    /></form>);
    expect(screen.getAllByLabelText("Composer destination")).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "Helix Console message destinations" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Composer destination"), {target: {value: "operator_note"}});
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith("operator_note");
    expect(submit).not.toHaveBeenCalled();
  });
  it("auto-selects an externally active binding unless the operator chose another destination", () => {
    expect(shouldAutomaticallySelectBoundAgent({
      bindingStatus: "active",
      operatorSelectedDestination: false,
    })).toBe(true);
    expect(shouldAutomaticallySelectBoundAgent({
      bindingStatus: "pending_claim",
      operatorSelectedDestination: false,
    })).toBe(false);
    expect(shouldAutomaticallySelectBoundAgent({
      bindingStatus: "active",
      operatorSelectedDestination: true,
    })).toBe(false);
  });

  it("keeps unsent text with its exact destination across automatic and manual switches", () => {
    const first = transitionHelixAskComposerDraft({
      drafts: { helix_ask: "", bound_agent: "", operator_note: "" },
      from: "helix_ask", to: "bound_agent", currentText: "Private question",
    });
    expect(first.nextText).toBe("");
    const second = transitionHelixAskComposerDraft({
      drafts: first.drafts, from: "bound_agent", to: "helix_ask", currentText: "Task instruction",
    });
    expect(second.nextText).toBe("Private question");
    expect(second.drafts.bound_agent).toBe("Task instruction");
    expect(transitionHelixAskComposerDraft({
      drafts: second.drafts, from: "helix_ask", to: "helix_ask", currentText: "Edited question",
    }).nextText).toBe("Edited question");
  });
  it("does not let a late task acknowledgement clear another destination's draft", () => {
    expect(shouldClearBoundAgentComposerAfterSend({
      accepted: true, currentDestination: "helix_ask", currentText: "Private question", sentText: "Task instruction",
    })).toBe(false);
    expect(shouldClearBoundAgentComposerAfterSend({
      accepted: true, currentDestination: "bound_agent", currentText: "Revised task instruction", sentText: "Task instruction",
    })).toBe(false);
    expect(shouldClearBoundAgentComposerAfterSend({
      accepted: true, currentDestination: "bound_agent", currentText: "Task instruction", sentText: "Task instruction",
    })).toBe(true);
  });

  it("labels an available governed turn as Ask and a busy turn as Queue", () => {
    expect(buildHelixAskComposerDestinationModel({
      kind: "helix_ask",
      runtimeLabel: "Codex",
      busy: false,
    })).toMatchObject({
      destinationLabel: "Codex",
      transportLabel: "Helix Ask governed turn",
      actionLabel: "Ask",
      deliveryState: "ready",
      providerDeliveryClaimed: false,
    });
    expect(buildHelixAskComposerDestinationModel({
      kind: "helix_ask",
      runtimeLabel: "Codex",
      busy: true,
    })).toMatchObject({ actionLabel: "Queue", deliveryState: "queued" });
  });

  it("saves an operator note without claiming provider delivery", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };
    const note = saveHelixOperatorNote(
      "Remember this without sending it.",
      storage,
      new Date("2026-09-01T20:00:00.000Z"),
    );
    expect(note).toMatchObject({
      text: "Remember this without sending it.",
      delivery_state: "saved_locally",
      provider_delivery_claimed: false,
    });
    expect(JSON.parse([...values.values()][0])).toEqual([note]);
  });

  it("labels exact-task polling as queued steering without claiming provider delivery", () => {
    expect(buildHelixAskComposerDestinationModel({
      kind: "bound_agent",
      boundAgentState: "active",
    })).toMatchObject({
      destinationLabel: "Bound external AI task",
      transportLabel: "Exact MCP polling binding",
      actionLabel: "Queue",
      deliveryState: "ready",
      providerDeliveryClaimed: false,
    });
    expect(buildHelixAskComposerDestinationModel({
      kind: "bound_agent",
      boundAgentState: "awaiting_agent_pickup",
    })).toMatchObject({
      deliveryState: "awaiting_agent_pickup",
      providerDeliveryClaimed: false,
    });
  });

  it("renders the exact destination, transport, action, and delivery state", () => {
    const onDestinationChange = vi.fn();
    render(
      <HelixAskComposerDestinationStrip
        model={buildHelixAskComposerDestinationModel({
          kind: "operator_note",
          noteState: "saved",
        })}
        onDestinationChange={onDestinationChange}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved locally");
    expect(screen.getByText(/Local operator note. Action: Save operator note/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Composer destination"), {
      target: { value: "helix_ask" },
    });
    expect(onDestinationChange).toHaveBeenCalledWith("helix_ask");
  });

  it("keeps typed Ask private while a separate room is open", () => {
    render(<HelixAskComposerDestinationStrip
      model={buildHelixAskComposerDestinationModel({ kind: "helix_ask", runtimeLabel: "Codex" })}
      onDestinationChange={vi.fn()}
      roomScope={{ roomId: "room:host" }}
    />);
    expect(screen.getByRole("status")).toHaveTextContent("Codex ready");
    expect(screen.getByText(/An open room does not receive this private Ask turn/)).toBeInTheDocument();
    expect(screen.queryByText(/room:host/)).toBeNull();
  });

  it("preserves the destination strip across the legacy composer bridge", () => {
    const destination = <div>Destination bridge sentinel</div>;
    const input = {
      destination,
      voiceLevelMonitor: {},
      moodAvatar: {},
      actionToolbar: {},
      textarea: {},
    } as Parameters<typeof buildHelixAskLegacyComposerState>[0];

    expect(buildHelixAskLegacyComposerState(input).destination).toBe(destination);
  });
});
