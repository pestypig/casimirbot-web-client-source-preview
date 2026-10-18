// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TheoryBadgeGraphPanel from "../panels/TheoryBadgeGraphPanel";
import { useTheoryBadgePlaybackStore } from "@/store/useTheoryBadgePlaybackStore";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async () => buildNhm2TheoryBadgeGraphV1(),
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TheoryBadgeGraphPanel />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  useTheoryBadgePlaybackStore.getState().clearPlayback();
  cleanup();
});

describe("TheoryBadgeGraphPanel playback", () => {
  it("runs a badge path from the achievement map", async () => {
    renderPanel();

    fireEvent.doubleClick(await screen.findByRole("button", { name: "QEI badge replay margin" }));

    await waitFor(
      () => {
        expect(useTheoryBadgePlaybackStore.getState().status).toBe("complete");
      },
      { timeout: 8000 },
    );

    const run = useTheoryBadgePlaybackStore.getState().activeRun;
    expect(run?.summary.solvedCount).toBeGreaterThan(0);
    expect(run?.summary.skippedCount).toBeGreaterThan(0);
  });
});
