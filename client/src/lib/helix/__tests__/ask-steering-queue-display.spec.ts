import { describe, expect, it, vi } from "vitest";

import {
  buildHelixAskSteeringQueueItems,
  readHelixSteeringQueueDotClass,
  readHelixSteeringQueueItemClass,
  shouldAutoWakeHelixMailboxQueueItem,
} from "@/lib/helix/ask-steering-queue-display";

describe("ask-steering-queue-display", () => {
  it("projects mailbox state and debug phase into sorted steering queue items without active stream rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-09T10:03:00.000Z"));

    try {
      const rows = buildHelixAskSteeringQueueItems({
        latestReply: {
          debug: {
            live_source_turn_phase_resolution: {
              phase: "terminal_checkpoint",
              canonicalGoal: "watch Minecraft",
              reason: "checkpoint ready",
              allowedTools: ["live_env.read_processed_live_source_mail"],
              completionEvidence: ["checkpoint:1"],
            },
          },
        },
        mailbox: {
          ok: true,
          mailboxThreadId: "helix-ask:desktop",
          processedMailPackets: [
            {
              packetId: "packet-1",
              mailIds: ["mail-1"],
              recommendedNext: "ask_from_processed_packet",
              salience: { level: "high", voiceCandidate: true },
              changedFacts: ["player entered cave"],
              evidenceRefs: ["packet:1"],
              createdAt: "2026-06-09T10:01:00.000Z",
            },
          ],
          wakeRequests: [
            {
              wakeRequestId: "wake-1",
              wakeIntent: "ask_from_processed_packet",
              mailIds: ["mail-1"],
              status: "queued",
              evidenceRefs: ["wake:1"],
              createdAt: "2026-06-09T10:02:00.000Z",
            },
          ],
        },
        maxItems: 4,
      });

      expect(rows.map((row) => row.status)).toEqual(["next", "queued", "queued"]);
      expect(rows.map((row) => row.label)).toEqual([
        "terminal checkpoint",
        "Ask handoff queued",
        "Micro-reasoner finding",
      ]);
      expect(rows.some((row) => row.key.startsWith("active:"))).toBe(false);
      expect(rows[2].detail).toContain("recommended ask_from_processed_packet");
      expect(rows[2].detail).toContain("salience high voice candidate");
      expect(rows[2].detail).toContain("changed: player entered cave");
      expect(shouldAutoWakeHelixMailboxQueueItem(rows[2])).toBe(true);
      expect(shouldAutoWakeHelixMailboxQueueItem(rows[0])).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps unread mailbox backlog held and maps tone classes without React", () => {
    const rows = buildHelixAskSteeringQueueItems({
      mailbox: {
        ok: true,
        mailboxThreadId: "helix-ask:desktop",
        mailItems: [
          {
            mailId: "mail-raw-1",
            status: "unread",
            summary: { preview: "Minecraft player moves toward a cave." },
            evidenceRefs: ["visual:1"],
            createdAt: "2026-06-09T10:01:00.000Z",
          },
        ],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      label: "Observer backlog",
      status: "held",
      tone: "amber",
      evidenceRefs: ["mail-raw-1", "visual:1"],
      createdAtMs: Date.parse("2026-06-09T10:01:00.000Z"),
    });
    expect(rows[0].detail).toContain("Minecraft player moves toward a cave.");
    expect(shouldAutoWakeHelixMailboxQueueItem(rows[0])).toBe(false);
    expect(readHelixSteeringQueueItemClass(rows[0])).toContain("border-amber");
    expect(readHelixSteeringQueueDotClass(rows[0])).toContain("bg-amber");
  });
});
