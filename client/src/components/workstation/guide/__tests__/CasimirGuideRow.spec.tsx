/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CASIMIR_GUIDE_ROW_STATES,
  CasimirGuideRow,
  type CasimirGuideRowState,
} from "../CasimirGuideRow";

describe("CasimirGuideRow", () => {
  afterEach(cleanup);

  it("renders every Guide state as an explicit typed presentation", () => {
    render(<>
      {CASIMIR_GUIDE_ROW_STATES.map((state) => (
        <CasimirGuideRow
          key={state}
          row={{ id: state, label: `Row ${state}`, state }}
          stateLabel={`State ${state}`}
        />
      ))}
    </>);

    for (const state of CASIMIR_GUIDE_ROW_STATES) {
      const row = screen.getByRole("button", { name: new RegExp(`Row ${state}`) });
      expect(row.getAttribute("data-guide-row-state")).toBe(state);
      expect(row.textContent).toContain(state === "available" ? "›" : `State ${state}`);
    }
  });

  it("only enables states whose recovery or navigation action is safe", () => {
    const action = vi.fn();
    const actionable = new Set<CasimirGuideRowState>(["available", "degraded", "stale", "failed"]);
    render(<>
      {CASIMIR_GUIDE_ROW_STATES.map((state) => (
        <CasimirGuideRow
          key={state}
          row={{ id: state, label: `Row ${state}`, state, action }}
          stateLabel={state}
        />
      ))}
    </>);

    for (const state of CASIMIR_GUIDE_ROW_STATES) {
      const row = screen.getByRole("button", { name: new RegExp(`Row ${state}`) }) as HTMLButtonElement;
      expect(row.disabled).toBe(!actionable.has(state));
      if (actionable.has(state)) fireEvent.click(row);
    }
    expect(action).toHaveBeenCalledTimes(actionable.size);
  });
});
