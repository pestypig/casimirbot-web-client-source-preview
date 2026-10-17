/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HelixAskActionToolbar,
  type HelixAskActionToolbarProps,
} from "../HelixAskActionToolbar";

const buildProps = (
  overrides: Partial<HelixAskActionToolbarProps> = {},
): HelixAskActionToolbarProps => ({
  canScrollLeft: false,
  canScrollRight: false,
  onScrollLeft: vi.fn(),
  onScrollRight: vi.fn(),
  onImageSelect: vi.fn(),
  onAttachImage: vi.fn(),
  micEnabled: false,
  showMicButton: false,
  onToggleMic: vi.fn(),
  onRetryVoiceSample: vi.fn(),
  showVisualCaptureControls: true,
  visualSourceKind: "screen",
  onToggleVisualSourceKind: vi.fn(),
  visualSituationSourceStatus: "idle",
  onCaptureVisualSource: vi.fn(),
  visualSituationIncludeAudio: false,
  onToggleVisualAudio: vi.fn(),
  runtimePicker: <span data-testid="runtime-picker" />,
  submitButton: <button type="button">Submit</button>,
  ...overrides,
});

describe("HelixAskActionToolbar visual source controls", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("identifies Screen and Camera distinctly and only offers tab audio for Screen", () => {
    const onToggleVisualSourceKind = vi.fn();
    const { rerender } = render(
      <HelixAskActionToolbar
        {...buildProps({
          visualSourceKind: "screen",
          onToggleVisualSourceKind,
        })}
      />,
    );

    const screenSelector = screen.getByRole("button", {
      name: "Visual source: Screen. Switch to camera",
    });
    expect(screenSelector).toHaveAttribute("data-visual-source-kind", "screen");
    expect(screenSelector).toHaveTextContent("Screen");
    expect(screenSelector.querySelector("svg.lucide-monitor-up")).not.toBeNull();
    expect(screenSelector.querySelector("svg.lucide-camera")).toBeNull();
    expect(screen.getByRole("button", { name: "Enable tab audio for visual capture" })).toBeEnabled();

    fireEvent.click(screenSelector);
    expect(onToggleVisualSourceKind).toHaveBeenCalledTimes(1);

    rerender(
      <HelixAskActionToolbar
        {...buildProps({
          visualSourceKind: "camera",
          onToggleVisualSourceKind,
        })}
      />,
    );

    const cameraSelector = screen.getByRole("button", {
      name: "Visual source: Camera. Switch to screen",
    });
    expect(cameraSelector).toHaveAttribute("data-visual-source-kind", "camera");
    expect(cameraSelector).toHaveTextContent("Camera");
    expect(cameraSelector.querySelector("svg.lucide-camera")).not.toBeNull();
    expect(cameraSelector.querySelector("svg.lucide-monitor-up")).toBeNull();
    expect(screen.queryByRole("button", { name: /tab audio for visual capture/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Start camera sharing" })).toBeEnabled();
  });

  it("keeps capture cancellable while requesting and locks source selection until capture settles", () => {
    const onCaptureVisualSource = vi.fn();
    const { rerender } = render(
      <HelixAskActionToolbar
        {...buildProps({
          visualSituationSourceStatus: "requesting",
          onCaptureVisualSource,
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Visual source: Screen. Switch to camera" }),
    ).toBeDisabled();
    const cancelCapture = screen.getByRole("button", { name: "Cancel screen sharing request" });
    expect(cancelCapture).toHaveAttribute("title", "Cancel screen sharing request");
    expect(cancelCapture).toHaveAttribute("aria-pressed", "false");
    expect(cancelCapture).toBeEnabled();

    fireEvent.click(cancelCapture);
    expect(onCaptureVisualSource).toHaveBeenCalledTimes(1);

    rerender(
      <HelixAskActionToolbar
        {...buildProps({
          visualSourceKind: "camera",
          visualSituationSourceStatus: "active",
          onCaptureVisualSource,
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Visual source: Camera. Switch to screen" }),
    ).toBeDisabled();
    const stopCapture = screen.getByRole("button", { name: "Stop camera sharing" });
    expect(stopCapture).toHaveAttribute(
      "title",
      "Stop camera sharing with automatic 10-second captures",
    );
    expect(stopCapture).toHaveAttribute("aria-pressed", "true");
    expect(stopCapture).toBeEnabled();
  });

  it("exposes idle as Start and an error as a retryable, non-active capture", () => {
    const onCaptureVisualSource = vi.fn();
    const { rerender } = render(
      <HelixAskActionToolbar
        {...buildProps({
          visualSituationSourceStatus: "idle",
          onCaptureVisualSource,
        })}
      />,
    );

    const startCapture = screen.getByRole("button", { name: "Start screen sharing" });
    expect(startCapture).toHaveAttribute(
      "title",
      "Start screen sharing with automatic 10-second captures",
    );
    expect(startCapture).toHaveAttribute("aria-pressed", "false");
    expect(startCapture).toBeEnabled();

    rerender(
      <HelixAskActionToolbar
        {...buildProps({
          visualSituationSourceStatus: "error",
          onCaptureVisualSource,
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Visual source: Screen. Switch to camera" }),
    ).toBeEnabled();
    const retryCapture = screen.getByRole("button", { name: "Retry screen sharing" });
    expect(retryCapture).toHaveAttribute(
      "title",
      "Retry screen sharing with automatic 10-second captures",
    );
    expect(retryCapture).toHaveAttribute("aria-pressed", "false");
    expect(retryCapture).toBeEnabled();

    fireEvent.click(retryCapture);
    expect(onCaptureVisualSource).toHaveBeenCalledTimes(1);
  });
});
