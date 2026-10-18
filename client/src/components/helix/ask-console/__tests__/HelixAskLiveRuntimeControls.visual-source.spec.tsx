/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPersonalVoiceDestination, writePersonalVoiceDestination } from
  "@/lib/helix/personal-voice-route";

const mocks = vi.hoisted(() => ({
  connectionReady: true,
  setVisualInputEnabled: vi.fn(() => true),
  runtime: {
    active: true,
    error: null as string | null,
    lifecycleState: "active" as "active" | "off",
    microphoneEnabled: false,
    setMicrophoneEnabled: vi.fn(() => true),
    setVisualInputEnabled: vi.fn(() => true),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    transportState: "active" as "active" | "idle",
    visualInputEnabled: false,
    visualInputError: null as string | null,
    visualInputFrameCount: 0,
    visualInputProviderAcknowledgedFrameCount: 0,
    visualInputProviderImageConfirmedFrameCount: 0,
    visualInputLastDeliveryStatus: "none" as const,
    workerRelayStatus: null,
  },
}));

vi.mock("../useHelixAskLiveRuntimeSession", () => ({
  useHelixAskLiveRuntimeSession: () => mocks.runtime,
}));
vi.mock("@/components/agent-access/useManagedConversation", () => ({
  useSharedManagedConversation: () => ({ connectionReady: mocks.connectionReady }),
}));

import {
  buildHelixAskLiveRuntimeControlsModel,
  HelixAskLiveRuntimeControls,
} from "../HelixAskLiveRuntimeControls";

const model = buildHelixAskLiveRuntimeControlsModel({
  accountPolicy: {
    account_type: "developer",
    feature_flags: ["runtime_agent_controls", "shared_realtime_rooms"],
    locked_features: [],
  },
  lifecycleState: "active",
  transportControllerState: "active",
});

describe("Helix Ask GPT Live Vision source coordination", () => {
  beforeEach(() => {
    mocks.connectionReady = true;
    mocks.runtime.active = true;
    mocks.runtime.lifecycleState = "active";
    mocks.runtime.transportState = "active";
    writePersonalVoiceDestination("cloud_agent_dm");
    mocks.runtime.error = null;
    mocks.runtime.visualInputEnabled = false;
    mocks.runtime.visualInputFrameCount = 0;
    mocks.runtime.visualInputProviderAcknowledgedFrameCount = 0;
    mocks.runtime.visualInputProviderImageConfirmedFrameCount = 0;
    mocks.runtime.setVisualInputEnabled.mockClear();
  });

  afterEach(() => {
    cleanup();
    writePersonalVoiceDestination("cloud_agent_dm");
    vi.clearAllMocks();
  });

  it("starts the selected visual source before enabling Live Vision", () => {
    const onVisualInputEnableRequested = vi.fn();
    render(
      <HelixAskLiveRuntimeControls
        model={model}
        onVisualInputEnableRequested={onVisualInputEnableRequested}
      />,
    );

    const vision = screen.getByRole("button", {
      name: "Share visual frames with GPT Live",
    });
    expect(vision).toHaveAttribute(
      "title",
      "Enable GPT Live Vision and start the selected Screen or Camera source with automatic 10-second captures",
    );

    fireEvent.click(vision);

    expect(onVisualInputEnableRequested).toHaveBeenCalledTimes(1);
    expect(mocks.runtime.setVisualInputEnabled).toHaveBeenCalledWith(true);
    expect(onVisualInputEnableRequested.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runtime.setVisualInputEnabled.mock.invocationCallOrder[0],
    );
  });

  it("does not restart capture when disabling Live Vision", () => {
    mocks.runtime.visualInputEnabled = true;
    mocks.runtime.visualInputFrameCount = 3;
    const onVisualInputEnableRequested = vi.fn();
    render(
      <HelixAskLiveRuntimeControls
        model={model}
        onVisualInputEnableRequested={onVisualInputEnableRequested}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Stop sharing visual frames with GPT Live",
    }));

    expect(onVisualInputEnableRequested).not.toHaveBeenCalled();
    expect(mocks.runtime.setVisualInputEnabled).toHaveBeenCalledWith(false);
  });

  it("explains that zero sent frames means Vision is waiting for a source", () => {
    mocks.runtime.visualInputEnabled = true;
    render(<HelixAskLiveRuntimeControls model={model} />);

    expect(screen.getByRole("button", {
      name: "Stop sharing visual frames with GPT Live",
    })).toHaveAttribute(
      "title",
      "GPT Live Vision is enabled and waiting for the selected Screen or Camera source; captures run automatically every 10 seconds (0 sent)",
    );
  });

  it("distinguishes transport-queued frames from provider acknowledgements", () => {
    mocks.runtime.visualInputEnabled = true;
    mocks.runtime.visualInputFrameCount = 3;
    render(<HelixAskLiveRuntimeControls model={model} />);

    const vision = screen.getByRole("button", {
      name: "Stop sharing visual frames with GPT Live",
    });
    expect(vision).toHaveAttribute(
      "title",
      "GPT Live Vision queued 3 frames on the Realtime transport; awaiting provider acknowledgement",
    );

    cleanup();
    mocks.runtime.visualInputProviderAcknowledgedFrameCount = 2;
    render(<HelixAskLiveRuntimeControls model={model} />);
    expect(screen.getByRole("button", {
      name: "Stop sharing visual frames with GPT Live",
    })).toHaveAttribute(
      "title",
      "GPT Live Vision provider acknowledged 2 of 3 items; awaiting input_image confirmation",
    );

    cleanup();
    mocks.runtime.visualInputProviderImageConfirmedFrameCount = 2;
    render(<HelixAskLiveRuntimeControls model={model} />);
    expect(screen.getByRole("button", {
      name: "Stop sharing visual frames with GPT Live",
    })).toHaveAttribute(
      "title",
      "GPT Live Vision provider confirmed image context for 2 of 3 queued frames",
    );
  });

  it("exposes GPT Live to users while withholding visual capture and shared rooms", () => {
    const userModel = buildHelixAskLiveRuntimeControlsModel({
      accountPolicy: {
        account_type: "user",
        feature_flags: ["runtime_agent_controls"],
        locked_features: [
          "live_answer_visual_capture_controls",
          "shared_realtime_rooms",
        ],
      },
      lifecycleState: "active",
      transportControllerState: "active",
      authority: "suggest_actions",
    });

    render(<HelixAskLiveRuntimeControls model={userModel} />);
    fireEvent.click(screen.getByRole("button", { name: "Voice settings" }));

    expect(userModel.controlState.runtime_agent_authority).toBe("observe_only");
    expect(screen.getByRole("button", { name: "Live runtime agent mode" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Enable Live Voice microphone" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Live runtime agent authority" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share visual frames with GPT Live" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Shared GPT Live Room" })).toBeNull();
  });

  it("keeps the Observe/Suggest authority selector available to developers", () => {
    render(<HelixAskLiveRuntimeControls model={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Voice settings" }));

    expect(screen.getByRole("button", { name: "Live runtime agent authority" })).toBeVisible();
  });

  it("selects a personal voice destination separately from the text chat and blocks an unpaired direct route", () => {
    mocks.runtime.active = false;
    mocks.runtime.lifecycleState = "off";
    mocks.runtime.transportState = "idle";
    render(<HelixAskLiveRuntimeControls model={model} />);
    const lifecycle = screen.getByRole("button", { name: "Live runtime agent lifecycle" });
    expect(lifecycle).toHaveTextContent("Cloud Agent DM");
    expect(lifecycle).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Voice settings" }));
    expect(screen.getByRole("radio", { name: "Cloud Agent DM" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Message Codex" })).toBeNull();
    act(() => writePersonalVoiceDestination("message_codex"));
    expect(readPersonalVoiceDestination()).toBe("message_codex");
    expect(lifecycle).toHaveTextContent("Message Codex");
    expect(lifecycle).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Ask Helix" })).toBeDisabled();
  });

  it("stops an active call if another control changes its personal voice route", () => {
    render(<HelixAskLiveRuntimeControls model={model} />);
    writePersonalVoiceDestination("message_codex");
    expect(mocks.runtime.stop).toHaveBeenCalledOnce();
  });

  it("shows an actionable provider-auth status without projecting credential material", () => {
    mocks.runtime.error = "openai_realtime_authentication_failed_invalid_api_key";
    render(<HelixAskLiveRuntimeControls model={model} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("OpenAI rejected the Realtime credential");
    expect(status).toHaveAttribute(
      "data-helix-ask-realtime-failure",
      "openai_realtime_authentication_failed_invalid_api_key",
    );
    expect(screen.getByRole("button", { name: "Live runtime agent lifecycle" })).toHaveAttribute(
      "title",
      "Open Voice connection to replace and test your OpenAI API key in the desktop harness. Browser users should check their server's OpenAI connection.",
    );
  });
});
