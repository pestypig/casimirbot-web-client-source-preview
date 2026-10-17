// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HelixConsoleMessage } from "../HelixConsoleMessage";

describe("Helix Console message presentation", () => {
  afterEach(cleanup);

  it("uses the existing final-answer renderer for an agent reply", () => {
    render(<HelixConsoleMessage kind="agent" author="Agent"
      text={"**Result**: $x^2$ [source](https://example.com/report)"} />);
    expect(screen.getByTestId("helix-ask-console-final-answer")).toBeInTheDocument();
    expect(screen.getByText("Result").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "source" })).toHaveAttribute("href", "https://example.com/report");
    expect(screen.getByRole("link", { name: "source" })).toHaveAttribute("rel", "noreferrer noopener");
    expect(document.querySelector(".katex")).not.toBeNull();
  });

  it("keeps a person's message literal and does not turn it into agent output", () => {
    render(<HelixConsoleMessage kind="person" author="Guest"
      text="**literal** [link](javascript:alert(1))" />);
    expect(screen.getByText("**literal** [link](javascript:alert(1))")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByTestId("helix-ask-console-final-answer")).toBeNull();
  });
});
