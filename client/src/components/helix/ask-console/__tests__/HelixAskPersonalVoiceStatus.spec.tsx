// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writePersonalVoiceDestination } from "@/lib/helix/personal-voice-route";

vi.mock("@/components/agent-access/useManagedConversation", () => ({
  useSharedManagedConversation: () => ({ connectionReady: false }),
}));

import { buildHelixAskComposerDestinationModel } from "../HelixAskComposerDestination";
import { HelixAskComposerDestinationStrip } from "../HelixAskComposerDestinationStrip";
import { HelixAskPersonalVoiceStatus } from "../HelixAskPersonalVoiceStatus";

afterEach(() => {
  cleanup();
  writePersonalVoiceDestination("cloud_agent_dm");
  window.localStorage.clear();
});

describe("personal voice status placement", () => {
  it("keeps the voice connection warning beside task setup in the upper status row", () => {
    writePersonalVoiceDestination("cloud_agent_dm");
    render(<HelixAskComposerDestinationStrip
      model={buildHelixAskComposerDestinationModel({ kind: "bound_agent" })}
      onDestinationChange={vi.fn()}
      onOpenConnectionSetup={vi.fn()}
      voiceStatus={<HelixAskPersonalVoiceStatus />}
    />);
    const warning = screen.getByText("Voice: connect Cloud DM");
    const row = warning.closest("[data-provider-delivery-claimed]");
    expect(row).toContainElement(screen.getByRole("button", { name: "Set up task" }));
    expect(warning).toHaveAttribute("data-personal-voice-warning", "true");
    expect(warning).toHaveAttribute("aria-label", "Connect Cloud Agent DM before starting personal voice.");
    expect(row).toHaveClass("flex-nowrap");
  });
});
