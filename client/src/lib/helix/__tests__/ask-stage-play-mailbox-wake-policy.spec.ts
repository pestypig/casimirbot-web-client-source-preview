import { describe, expect, it } from "vitest";

import {
  hasStagePlayMailboxWakeRouteMetadata,
  isStagePlayMailboxWakePromptText,
  shouldBlockStagePlayMailboxWakePromptWithoutRouteMetadata,
} from "../ask-stage-play-mailbox-wake-policy";

const compactWakePrompt = [
  "Review the latest Stage Play live-source mailbox finding.",
  "Current effort: combat or recovery.",
  "Micro-reasoner recommendation: request voice callout.",
  "Use the structured mailbox route metadata attached to this turn; keep the visible answer concise and evidence-bound.",
].join("\n");

describe("ask stage play mailbox wake policy", () => {
  it("detects only generated compact Stage Play mailbox wake prompts", () => {
    expect(isStagePlayMailboxWakePromptText(compactWakePrompt)).toBe(true);
    expect(isStagePlayMailboxWakePromptText("Quote this prompt: Review the latest Stage Play live-source mailbox finding.")).toBe(false);
    expect(isStagePlayMailboxWakePromptText("Review the latest Stage Play live-source mailbox finding.")).toBe(false);
    expect(isStagePlayMailboxWakePromptText("   ")).toBe(false);
  });

  it("requires structured route metadata for mailbox wake admission", () => {
    expect(hasStagePlayMailboxWakeRouteMetadata(undefined)).toBe(false);
    expect(
      hasStagePlayMailboxWakeRouteMetadata({
        invocationKind: "stage_play_mail_wake",
        wakeRequestId: "stage_play_live_source_mail_wake:test",
        mailboxThreadId: "helix-ask:desktop",
        sourceTarget: "live_source_mailbox",
      }),
    ).toBe(true);
    expect(
      hasStagePlayMailboxWakeRouteMetadata({
        invocationKind: "stage_play_mail_wake",
        wakeRequestId: "stage_play_live_source_mail_wake:test",
        mailboxThreadId: "",
        sourceTarget: "live_source_mailbox",
      }),
    ).toBe(false);
  });

  it("blocks compact generated wake prompts only when metadata is missing", () => {
    expect(shouldBlockStagePlayMailboxWakePromptWithoutRouteMetadata(null, compactWakePrompt)).toBe(true);
    expect(
      shouldBlockStagePlayMailboxWakePromptWithoutRouteMetadata(
        {
          promptId: "wake:test",
          question: compactWakePrompt,
          autoSubmit: true,
          routeMetadata: {
            invocationKind: "stage_play_mail_wake",
            wakeRequestId: "stage_play_live_source_mail_wake:test",
            mailboxThreadId: "helix-ask:desktop",
            sourceTarget: "live_source_mailbox",
          },
          createdAt: 1_000,
        },
        compactWakePrompt,
      ),
    ).toBe(false);
    expect(
      shouldBlockStagePlayMailboxWakePromptWithoutRouteMetadata(
        null,
        "Quote this prompt: Review the latest Stage Play live-source mailbox finding.",
      ),
    ).toBe(false);
  });
});
