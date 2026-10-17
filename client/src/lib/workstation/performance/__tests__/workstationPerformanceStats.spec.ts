import { describe, expect, it } from "vitest";
import {
  classifyWorkstationInteractionPressure,
  classifyWorkstationUiFramePressure,
  summarizeWorkstationFrameDurations,
  summarizeWorkstationInteractions,
  summarizeWorkstationLongTasks,
} from "../workstationPerformanceStats";

describe("workstationPerformanceStats", () => {
  it("summarizes a rolling frame window", () => {
    const summary = summarizeWorkstationFrameDurations(
      [
        { ts: 1000, frameMs: 16 },
        { ts: 1016, frameMs: 17 },
        { ts: 1033, frameMs: 55 },
        { ts: 1088, frameMs: 20 },
      ],
      2000,
      1000,
    );

    expect(summary).toMatchObject({
      fps: 4,
      average_frame_ms: 27,
      p95_frame_ms: 55,
      worst_frame_ms: 55,
      long_frame_count: 1,
      long_frame_ratio: 0.3,
    });
  });

  it("summarizes long tasks in the active window", () => {
    expect(summarizeWorkstationLongTasks(
      [
        { ts: 100, durationMs: 75 },
        { ts: 900, durationMs: 125 },
        { ts: 1900, durationMs: 50 },
      ],
      2000,
      1000,
    )).toEqual({
      long_task_count: 1,
      long_task_total_ms: 50,
    });
  });

  it("classifies UI frame pressure conservatively", () => {
    expect(classifyWorkstationUiFramePressure({
      fps: 58,
      p95FrameMs: 22,
      worstFrameMs: 44,
      longFrameRatio: 0,
      longTaskCount: 0,
    })).toBe("normal");

    expect(classifyWorkstationUiFramePressure({
      fps: 30,
      p95FrameMs: 60,
      worstFrameMs: 90,
      longFrameRatio: 0.12,
      longTaskCount: 1,
    })).toBe("degraded");

    expect(classifyWorkstationUiFramePressure({
      fps: 12,
      p95FrameMs: 120,
      worstFrameMs: 260,
      longFrameRatio: 0.4,
      longTaskCount: 12,
    })).toBe("blocked");
  });

  it("summarizes interaction latency and jank", () => {
    const summary = summarizeWorkstationInteractions(
      [
        { ts: 1000, kind: "click", inputDelayMs: 12, inputToNextFrameMs: 40 },
        { ts: 1100, kind: "scroll", inputDelayMs: 20, inputToNextFrameMs: 92 },
        { ts: 1200, kind: "panel_drag", inputDelayMs: 60, inputToNextFrameMs: 120 },
      ],
      1300,
      1000,
    );

    expect(summary).toMatchObject({
      interaction_event_count: 3,
      input_delay_p95_ms: 60,
      input_to_next_frame_p95_ms: 120,
      click_to_next_frame_p95_ms: 40,
      scroll_jank_count: 1,
      drag_jank_count: 1,
      active_interaction_kind: "panel_drag",
    });
  });

  it("classifies interaction pressure separately from idle FPS", () => {
    expect(classifyWorkstationInteractionPressure({
      inputDelayP95Ms: 20,
      inputToNextFrameP95Ms: 30,
      clickToNextFrameP95Ms: 30,
      scrollJankCount: 0,
      dragJankCount: 0,
      longTaskCount: 0,
    })).toBe("normal");

    expect(classifyWorkstationInteractionPressure({
      inputDelayP95Ms: 55,
      inputToNextFrameP95Ms: 90,
      clickToNextFrameP95Ms: 70,
      scrollJankCount: 4,
      dragJankCount: 0,
      longTaskCount: 1,
    })).toBe("degraded");

    expect(classifyWorkstationInteractionPressure({
      inputDelayP95Ms: 130,
      inputToNextFrameP95Ms: 190,
      clickToNextFrameP95Ms: 190,
      scrollJankCount: 12,
      dragJankCount: 12,
      longTaskCount: 12,
    })).toBe("blocked");
  });
});
