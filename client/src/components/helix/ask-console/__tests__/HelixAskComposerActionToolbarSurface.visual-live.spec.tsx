/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  liveActive: true,
  visualInputEnabled: false,
  toggleVisualInput: vi.fn(),
}));

vi.mock("../HelixAskActionToolbar", () => ({
  HelixAskActionToolbar: (props: {
    liveRuntimeControls?: React.ReactNode;
    onCaptureVisualSource: () => void;
  }) => (
    <>
      {props.liveRuntimeControls}
      <button type="button" onClick={props.onCaptureVisualSource}>
        Capture selected visual source
      </button>
    </>
  ),
}));

vi.mock("../HelixAskLiveRuntimeControls", async () => {
  const ReactModule = await import("react");
  return {
    HelixAskLiveRuntimeControls: (props: {
      onToolbarBridgeChange?: (bridge: Record<string, unknown> | null) => void;
      onVisualInputEnableRequested?: () => void;
    }) => {
      ReactModule.useEffect(() => {
        props.onToolbarBridgeChange?.({
          engaged: true,
          active: mocks.liveActive,
          microphoneEnabled: false,
          microphoneToggleDisabled: false,
          toggleMicrophone: vi.fn(),
          visualInputEnabled: mocks.visualInputEnabled,
          visualInputToggleDisabled: false,
          toggleVisualInput: () => {
            if (!mocks.visualInputEnabled) {
              props.onVisualInputEnableRequested?.();
            }
            mocks.toggleVisualInput();
          },
        });
        return () => props.onToolbarBridgeChange?.(null);
      }, [props.onToolbarBridgeChange, props.onVisualInputEnableRequested]);
      return null;
    },
    buildHelixAskLiveRuntimeControlsModel: vi.fn(),
  };
});

vi.mock("../HelixAskRuntimePicker", () => ({
  HelixAskRuntimePicker: () => null,
}));

vi.mock("../HelixAskComposer", () => ({
  HelixAskComposerSubmitButton: () => null,
}));

vi.mock("../useHelixAskActionCarousel", () => ({
  useHelixAskActionCarousel: () => ({
    viewportRef: { current: null },
    trackRef: { current: null },
    canScrollLeft: false,
    canScrollRight: false,
    onScrollLeft: vi.fn(),
    onScrollRight: vi.fn(),
  }),
}));

import { HelixAskComposerActionToolbarSurface } from "../HelixAskComposerActionToolbarSurface";

const renderSurface = (input: {
  onCaptureVisualSource: () => void;
  visualSituationSourceStatus?: string;
}) => render(
  <HelixAskComposerActionToolbarSurface
    {...({
      onImageSelect: vi.fn(),
      onAttachImage: vi.fn(),
      micEnabled: false,
      onToggleMic: vi.fn(),
      onRetryVoiceSample: vi.fn(),
      visualSituationSourceStatus: input.visualSituationSourceStatus ?? "idle",
      onCaptureVisualSource: input.onCaptureVisualSource,
      visualSituationIncludeAudio: false,
      onToggleVisualAudio: vi.fn(),
      runtimePickerModel: {},
      runtimeMenuOpen: false,
      onRuntimePrimaryClick: vi.fn(),
      onRuntimeSelect: vi.fn(),
      liveRuntimeControlsModel: { visible: true },
      submitViewModel: {},
      onSubmitIntent: vi.fn(),
      onStop: vi.fn(),
    } as any)}
  />,
);

describe("Helix Ask visual capture and GPT Live coordination", () => {
  beforeEach(() => {
    mocks.liveActive = true;
    mocks.visualInputEnabled = false;
    mocks.toggleVisualInput.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("starts one producer and enables Vision from a single explicit capture click", async () => {
    const onCaptureVisualSource = vi.fn();
    renderSurface({ onCaptureVisualSource });

    await waitFor(() => expect(
      screen.getByRole("button", { name: "Capture selected visual source" }),
    ).toBeEnabled());
    fireEvent.click(screen.getByRole("button", {
      name: "Capture selected visual source",
    }));

    expect(mocks.toggleVisualInput).toHaveBeenCalledTimes(1);
    expect(onCaptureVisualSource).toHaveBeenCalledTimes(1);
  });
});
