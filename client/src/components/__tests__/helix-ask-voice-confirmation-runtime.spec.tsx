// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HelixAskVoiceConfirmationRuntimeSurface,
  type HelixAskVoiceCommandConfirmationCandidate,
  type HelixAskVoiceConfirmationActivity,
  type HelixAskVoiceConfirmationRuntimeEvent,
  type HelixAskVoiceConfirmationRuntimeSurfaceProps,
  type HelixAskVoiceTranscriptConfirmationCandidate,
} from "@/components/helix/ask-console/HelixAskVoiceConfirmationRuntime";

const commandCandidate: HelixAskVoiceCommandConfirmationCandidate = {
  id: "command:send:1",
  action: "send",
  transcript: "send it",
};

const transcriptCandidate: HelixAskVoiceTranscriptConfirmationCandidate = {
  id: "transcript:1",
  transcript: "Use the active document",
  sourceText: "Use the active document",
  sourceLanguage: "en",
  dispatchState: "confirm",
  translated: false,
  translationUncertain: false,
  confidence: 0.94,
  pivotConfidence: 0.95,
  speechProbability: 0.95,
  snrDb: 24,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function buildProps(
  overrides: Partial<HelixAskVoiceConfirmationRuntimeSurfaceProps> = {},
): HelixAskVoiceConfirmationRuntimeSurfaceProps {
  return {
    micEnabled: true,
    commandCandidate: null,
    transcriptCandidate: null,
    confirmV2Active: true,
    lowQualitySpeechProbability: 0.45,
    lowQualitySnrDb: 6,
    readTranscriptActivity: () => ({ speechActive: false, queuedSegmentCount: 0 }),
    onCommandAutoConfirm: vi.fn(),
    onCommandPreempted: vi.fn(),
    onTranscriptAutoConfirm: vi.fn(),
    clipText: (text, limit) => text.slice(0, limit),
    describeCommandAction: (action) => action,
    onCommandAccept: vi.fn(),
    onCommandCancel: vi.fn(),
    onTranscriptAccept: vi.fn(),
    onTranscriptRetry: vi.fn(),
    countdownMs: 3_000,
    tickMs: 1_000,
    ...overrides,
  };
}

describe("HelixAskVoiceConfirmationRuntime", () => {
  it("owns the command countdown and auto-confirms exactly once", () => {
    vi.useFakeTimers();
    const onCommandAutoConfirm = vi.fn();

    render(
      <HelixAskVoiceConfirmationRuntimeSurface
        {...buildProps({ commandCandidate, onCommandAutoConfirm })}
      />,
    );

    expect(screen.getByText("Auto-confirming in 3s. Say \"cancel\" to stop.")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText("Auto-confirming in 2s. Say \"cancel\" to stop.")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText("Auto-confirming in 1s. Say \"cancel\" to stop.")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1_000));

    expect(onCommandAutoConfirm).toHaveBeenCalledTimes(1);
    expect(onCommandAutoConfirm).toHaveBeenCalledWith(commandCandidate.id);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the command timer for a manual cancellation", () => {
    vi.useFakeTimers();
    const onCommandCancel = vi.fn();
    const { rerender } = render(
      <HelixAskVoiceConfirmationRuntimeSurface
        {...buildProps({ commandCandidate, onCommandCancel })}
      />,
    );

    expect(vi.getTimerCount()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCommandCancel).toHaveBeenCalledWith(commandCandidate.id);
    rerender(
      <HelixAskVoiceConfirmationRuntimeSurface
        {...buildProps({ commandCandidate: null, onCommandCancel })}
      />,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives transcript confirmation immediate precedence over a command", () => {
    vi.useFakeTimers();
    const onCommandPreempted = vi.fn();
    const { rerender } = render(
      <HelixAskVoiceConfirmationRuntimeSurface
        {...buildProps({ commandCandidate, onCommandPreempted })}
      />,
    );

    rerender(
      <HelixAskVoiceConfirmationRuntimeSurface
        {...buildProps({ commandCandidate, transcriptCandidate, onCommandPreempted })}
      />,
    );

    expect(onCommandPreempted).toHaveBeenCalledTimes(1);
    expect(onCommandPreempted).toHaveBeenCalledWith(commandCandidate.id);
    expect(screen.queryByText("Voice command")).toBeNull();
    expect(screen.getByText("Confirm transcript")).toBeTruthy();
  });

  it("resets transcript auto-confirm while live speech is active", () => {
    vi.useFakeTimers();
    let activity: HelixAskVoiceConfirmationActivity = { speechActive: false, queuedSegmentCount: 0 };
    const events: HelixAskVoiceConfirmationRuntimeEvent[] = [];
    const onTranscriptAutoConfirm = vi.fn();

    render(
      <HelixAskVoiceConfirmationRuntimeSurface
        {...buildProps({
          transcriptCandidate,
          onTranscriptAutoConfirm,
          onEvent: (event) => events.push(event),
          readTranscriptActivity: () => activity,
        })}
      />,
    );

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText(/Auto-confirming in 2s/)).toBeTruthy();
    activity = { speechActive: true, queuedSegmentCount: 0 };
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText(/Auto-confirming in 3s/)).toBeTruthy();
    expect(events.filter((event) => event.type === "transcript_waiting_for_inactivity")).toHaveLength(1);

    activity = { speechActive: false, queuedSegmentCount: 0 };
    act(() => vi.advanceTimersByTime(3_000));
    expect(onTranscriptAutoConfirm).toHaveBeenCalledTimes(1);
    expect(onTranscriptAutoConfirm).toHaveBeenCalledWith(transcriptCandidate.id);
  });

  it("fails closed when translated transcript pivot confidence is too low", () => {
    vi.useFakeTimers();
    const onTranscriptAutoConfirm = vi.fn();
    const onEvent = vi.fn();

    render(
      <HelixAskVoiceConfirmationRuntimeSurface
        {...buildProps({
          transcriptCandidate: {
            ...transcriptCandidate,
            sourceLanguage: "zh-hans",
            translated: true,
            translationUncertain: true,
            pivotConfidence: 0.4,
          },
          onTranscriptAutoConfirm,
          onEvent,
        })}
      />,
    );

    expect(screen.queryByText(/Auto-confirming in/)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(onTranscriptAutoConfirm).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "transcript_countdown_blocked",
        reason: "pivot_low_confidence",
      }),
    );
  });

  it("cleans up active timers when the mic is disabled or the surface unmounts", () => {
    vi.useFakeTimers();
    const { rerender, unmount } = render(
      <HelixAskVoiceConfirmationRuntimeSurface {...buildProps({ commandCandidate })} />,
    );
    expect(vi.getTimerCount()).toBe(1);

    rerender(
      <HelixAskVoiceConfirmationRuntimeSurface
        {...buildProps({ commandCandidate, micEnabled: false })}
      />,
    );
    expect(vi.getTimerCount()).toBe(0);

    rerender(
      <HelixAskVoiceConfirmationRuntimeSurface {...buildProps({ commandCandidate })} />,
    );
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
