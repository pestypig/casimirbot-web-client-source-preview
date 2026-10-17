// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildHelixAskFinalAnswerBlocks,
  HelixAskFinalAnswer,
  isHelixAskMermaidCodeBlockLanguage,
} from "@/components/helix/ask-console/HelixAskFinalAnswer";

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    svg: '<svg data-testid="rendered-mermaid-svg" viewBox="0 0 10 10"></svg>',
  })),
}));

vi.mock("mermaid", () => ({
  default: mermaidMocks,
}));

afterEach(() => {
  cleanup();
  mermaidMocks.initialize.mockClear();
  mermaidMocks.render.mockClear();
});

describe("Helix Ask rich final-answer rendering", () => {
  it("renders delimited LaTeX through KaTeX without a bridge-supplied renderer", () => {
    const markup = renderToStaticMarkup(
      <HelixAskFinalAnswer text={"The invariant is \\(G_{\\mu\\nu}=8\\pi T_{\\mu\\nu}\\)."} />,
    );

    expect(markup).toContain('class="katex');
    expect(markup).toContain("G");
    expect(markup).not.toContain("\\(G_{\\mu\\nu}");
  });

  it("recovers standalone bracket-delimited multiline probability math", () => {
    const text = [
      "[",
      "P(M_{t+\\Delta t}\\mid M_t)",
      "=",
      "\\sum_{x_t,x_{t+\\Delta t}}",
      "P(M_{t+\\Delta t}\\mid x_{t+\\Delta t})",
      "P(x_{t+\\Delta t}\\mid x_t)",
      "P(x_t\\mid M_t).",
      "]",
    ].join("\n");

    expect(buildHelixAskFinalAnswerBlocks(text)).toEqual([
      expect.objectContaining({
        kind: "code",
        language: "math",
        text: expect.stringContaining("\\sum_{x_t,x_{t+\\Delta t}}"),
      }),
    ]);

    const markup = renderToStaticMarkup(<HelixAskFinalAnswer text={text} />);

    expect(markup).toContain('data-code-renderer="katex"');
    expect(markup).toContain('class="katex');
    expect(markup).not.toContain('data-code-renderer="raw"');

    const ordinaryBracketedText = buildHelixAskFinalAnswerBlocks([
      "[",
      "Selection / Fitness Context",
      "]",
    ].join("\n"));
    expect(ordinaryBracketedText.some(
      (block) => block.kind === "code" && block.language === "math",
    )).toBe(false);
  });

  it("renders GFM headings, emphasis, and pipe tables instead of exposing Markdown markers", () => {
    const text = [
      "### Match-status boundaries",
      "",
      "**Exact matches:** *Selection / Fitness Context*,",
      "",
      "| Interpretation | Graph support | What is missing | Assessment |",
      "|---|---|---|---|",
      "| **Epistemic probability** from hidden deterministic microstates | Selection edge | Explicit microstate weights | Exact |",
    ].join("\n");

    expect(buildHelixAskFinalAnswerBlocks(text)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "heading",
        level: 3,
        text: "Match-status boundaries",
      }),
      expect.objectContaining({
        kind: "table",
        header: expect.arrayContaining([
          expect.objectContaining({ text: "Interpretation" }),
          expect.objectContaining({ text: "Assessment" }),
        ]),
      }),
    ]));

    const view = render(<HelixAskFinalAnswer text={text} />);

    expect(view.getByRole("heading", { level: 3, name: "Match-status boundaries" })).toBeInTheDocument();
    expect(view.getByRole("table")).toBeInTheDocument();
    expect(view.getByRole("columnheader", { name: "Graph support" })).toBeInTheDocument();
    expect(view.container.querySelector("strong")).toHaveTextContent("Exact matches:");
    expect(view.container.querySelector("em")).toHaveTextContent("Selection / Fitness Context");
    expect(view.container.textContent).not.toContain("### Match-status boundaries");
    expect(view.container.textContent).not.toContain("|---|---|---|---|");
  });

  it("classifies Mermaid fences as diagram blocks and renders their SVG lazily", async () => {
    const text = [
      "System flow:",
      "",
      "```mermaid",
      "flowchart LR",
      "  A[Codex terminal] --> B[Helix authority] --> C[Visible answer]",
      "```",
    ].join("\n");

    expect(isHelixAskMermaidCodeBlockLanguage("mermaid")).toBe(true);
    expect(buildHelixAskFinalAnswerBlocks(text)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "code",
        language: "mermaid",
        text: expect.stringContaining("flowchart LR"),
      }),
    ]));

    const view = render(<HelixAskFinalAnswer text={text} />);

    await waitFor(() => {
      expect(view.getByTestId("helix-ask-final-answer-mermaid-block")).toHaveAttribute(
        "data-diagram-status",
        "rendered",
      );
    });
    expect(mermaidMocks.initialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: "strict",
      startOnLoad: false,
    }));
    expect(mermaidMocks.render).toHaveBeenCalledWith(
      expect.stringMatching(/^helix-ask-mermaid-/),
      expect.stringContaining("A[Codex terminal] --> B[Helix authority]"),
    );
    expect(view.getByTestId("rendered-mermaid-svg")).toBeInTheDocument();
  });

  it("keeps ordinary code fences on the raw code renderer", () => {
    const markup = renderToStaticMarkup(
      <HelixAskFinalAnswer text={["```json", '{"status":"ok"}', "```"].join("\n")} />,
    );

    expect(markup).toContain('data-code-language="json"');
    expect(markup).toContain('data-code-renderer="raw"');
    expect(markup).not.toContain('data-diagram-renderer="mermaid"');
  });
});
