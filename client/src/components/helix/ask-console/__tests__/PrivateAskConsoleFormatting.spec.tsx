// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { HelixContinuousTurnStreamRow } from "@/lib/helix/ask-active-turn-stream";
import { HelixAskTurnStreamPanel } from "../HelixAskTurnStreamPanel";
import { HelixConsoleConversationWorkspace } from "../HelixConsoleConversationWorkspace";
import { useHelixAskLegacyContentRenderers } from "../HelixAskLegacyContentRenderers";

afterEach(cleanup);

const answer = [
  "## Connected answer",
  "",
  "First paragraph has **structure** and a [source](https://example.com/report).",
  "",
  "Second paragraph shows \\(x^2 + y^2 = z^2\\) and `inline code`.",
].join("\n");

function PrivateAskFinalFixture() {
  const { renderFinalAnswerContent } = useHelixAskLegacyContentRenderers({
    resolvePanelIdForPath: () => null,
    onOpenPanel: vi.fn(),
  });
  const finalRow: HelixContinuousTurnStreamRow = {
    key: "final", source: "final", label: "Final answer", text: answer,
    meta: "", status: "completed", tone: "checkpoint", evidenceRefs: [],
  };
  return <HelixConsoleConversationWorkspace selectedChannel="private_ask"
    onSelectChannel={vi.fn()} privateApiAvailable={false}>
    <HelixAskTurnStreamPanel rows={[finalRow]} isLatestReply stagePlayEventCount={0}
      finalAnswerRawText={answer} finalAnswerSourceLabel="terminal"
      finalAnswerAuthority="terminal"
      renderFinalAnswer={() => renderFinalAnswerContent(answer)}
      clipText={value => value} readRowClassName={() => ""}
      readDotClassName={() => ""} readPillClassName={() => ""}
      onCopyFinal={vi.fn()} onDebugCopy={vi.fn()} onReadAloud={vi.fn()}
      jobReadyLinks={[]} onRunJobReadyLink={vi.fn()} />
  </HelixConsoleConversationWorkspace>;
}

it("keeps Private Ask's final answer rich and readable inside the selected Console chat", () => {
  render(<PrivateAskFinalFixture />);
  const conversation = screen.getByRole("region", { name: "Helix Console conversations" });
  const finalAnswer = screen.getByTestId("helix-ask-console-final-answer");
  expect(conversation).toContainElement(finalAnswer);
  expect(finalAnswer.querySelectorAll('[aria-hidden="true"].h-2')).toHaveLength(2);
  expect(screen.getByRole("heading", { level: 2, name: "Connected answer" })).toBeInTheDocument();
  expect(screen.getByText("structure").tagName).toBe("STRONG");
  expect(screen.getByRole("link", { name: "source" })).toHaveAttribute("href", "https://example.com/report");
  expect(screen.getByRole("link", { name: "source" })).toHaveAttribute("rel", "noreferrer noopener");
  expect(conversation.querySelector(".katex")).not.toBeNull();
  expect(conversation.querySelector("code")).toHaveTextContent("inline code");
  expect(conversation.textContent).not.toContain("**structure**");
  expect(screen.getByRole("button", { name: "# Ask Helix" })).toHaveAttribute("aria-current", "page");
});
