// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SharedLiveRoomDialog } from "../SharedLiveRoomDialog";
import { HELIX_WORKSTATION_GUIDANCE_EVENT, clearPendingWorkstationGuidance } from "@/lib/workstation/workstationGuidance";

vi.mock("../SharedLiveRoomActivePanel", () => ({ SharedLiveRoomActivePanel: ({ onOpenTaskPairing }: { onOpenTaskPairing?: () => void }) => <div>
  <div tabIndex={-1} data-environment-player-settings="environment:other">Other player</div>
  <div tabIndex={-1} data-environment-player-settings="environment:exact">Exact player</div>
  <button type="button" onClick={onOpenTaskPairing}>Open task pairing</button>
</div> }));
afterEach(() => { cleanup(); clearPendingWorkstationGuidance(); });

it("closes the room modal before opening task pairing guidance", async () => {
  const observed: Array<{ dialogOpen: boolean; detail: unknown }> = [];
  const listener = (event: Event) => observed.push({
    dialogOpen: Boolean(screen.queryByRole("dialog", { name: "Rooms" })),
    detail: (event as CustomEvent).detail,
  });
  window.addEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, listener);
  function Scenario() {
    const [open, setOpen] = React.useState(true);
    return open ? <SharedLiveRoomDialog room={{ room_id: "room:exact" } as never}
      controller={{ error: null } as never} titleId="title" descriptionId="description"
      onClose={() => setOpen(false)} /> : null;
  }
  try {
    render(<Scenario />);
    fireEvent.click(screen.getByRole("button", { name: "Open task pairing" }));
    await waitFor(() => expect(observed).toHaveLength(1));
    expect(observed[0]).toMatchObject({ dialogOpen: false, detail: {
      kind: "user_attention", panelId: "agent-access", targetId: "external-ai-connection-setup",
    } });
  } finally {
    window.removeEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, listener);
  }
});

it.each(["environment:exact", "environment:missing"])("reveals only the requested player section %s", async environmentBindingId => {
  render(<SharedLiveRoomDialog room={{ room_id: "room:exact" } as never}
    controller={{ error: null } as never} titleId="title" descriptionId="description"
    onClose={vi.fn()} navigationTarget={{ environmentBindingId }} />);
  if (environmentBindingId === "environment:exact") {
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText("Exact player")));
    expect(screen.getByRole("status").textContent).toContain("No permission was activated");
  } else {
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close Rooms", exact: true })));
    expect(screen.getByRole("status").textContent).toContain("No other environment will be selected");
  }
});
