// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HELIX_ASK_DEFAULT_RENDERED_TURN_COUNT,
  HELIX_ASK_RENDERED_TURN_REVEAL_STEP,
  HelixAskTurnHistoryWindowControl,
  selectHelixAskTurnHistoryWindow,
} from "@/components/helix/ask-console/HelixAskTurnHistoryWindow";

afterEach(() => {
  cleanup();
});

describe("Helix Ask rendered turn history window", () => {
  it("keeps the latest completed turns mounted without deleting durable history", () => {
    const replies = Array.from({ length: 20 }, (_, index) => `turn-${index + 1}`);
    const window = selectHelixAskTurnHistoryWindow({ replies });

    expect(window.totalCount).toBe(20);
    expect(window.visibleCount).toBe(HELIX_ASK_DEFAULT_RENDERED_TURN_COUNT);
    expect(window.hiddenCount).toBe(12);
    expect(window.visibleReplies).toEqual(replies.slice(-HELIX_ASK_DEFAULT_RENDERED_TURN_COUNT));
    expect(replies).toHaveLength(20);
  });

  it("reveals older turns in bounded steps while preserving the latest turn", () => {
    const replies = Array.from({ length: 20 }, (_, index) => `turn-${index + 1}`);

    function Harness() {
      const [limit, setLimit] = useState(HELIX_ASK_DEFAULT_RENDERED_TURN_COUNT);
      const window = selectHelixAskTurnHistoryWindow({ replies, requestedVisibleCount: limit });
      return (
        <>
          <HelixAskTurnHistoryWindowControl
            hiddenCount={window.hiddenCount}
            visibleCount={window.visibleCount}
            totalCount={window.totalCount}
            onRevealOlder={() => setLimit((current) => current + HELIX_ASK_RENDERED_TURN_REVEAL_STEP)}
          />
          <output data-testid="visible-turns">{window.visibleReplies.join(",")}</output>
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId("visible-turns")).toHaveTextContent("turn-13,turn-14");
    expect(screen.getByTestId("visible-turns")).toHaveTextContent("turn-20");

    fireEvent.click(screen.getByRole("button", { name: "Show 8 older turns" }));

    expect(screen.getByTestId("visible-turns")).toHaveTextContent("turn-5,turn-6");
    expect(screen.getByTestId("visible-turns")).toHaveTextContent("turn-20");
    expect(screen.getByRole("button", { name: "Show 4 older turns" })).toBeInTheDocument();
  });

  it("does not render a control when every turn is already visible", () => {
    const onRevealOlder = vi.fn();
    const { container } = render(
      <HelixAskTurnHistoryWindowControl
        hiddenCount={0}
        visibleCount={3}
        totalCount={3}
        onRevealOlder={onRevealOlder}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(onRevealOlder).not.toHaveBeenCalled();
  });
});
