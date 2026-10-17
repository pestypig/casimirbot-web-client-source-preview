import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (repoPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), repoPath), "utf8");

describe("Helix Ask voice ownership boundaries", () => {
  it("keeps pure transcript helpers in the non-React voice transcript module", () => {
    const pill = read("client/src/components/helix/HelixAskPill.tsx");
    const map = read("client/src/lib/helix/ASK_UI_OWNERSHIP.md");
    const transcript = read("client/src/lib/helix/voice/voice-transcript.ts");

    expect(map).toContain("voice/voice-transcript.ts");
    expect(map).toContain("Deterministic voice transcript draft merging");
    expect(map).toContain("STT queue mutation");
    expect(pill).toContain('from "@/lib/helix/voice/voice-transcript"');
    expect(pill).not.toMatch(/export function mergeVoiceTranscriptDraft\s*\(/);
    expect(pill).not.toMatch(/export function resolveVoiceDispatchTranscriptFromDraft\s*\(/);
    expect(transcript).toMatch(/export function mergeVoiceTranscriptDraft\s*\(/);
    expect(transcript).toMatch(/export function resolveVoiceDispatchTranscriptFromDraft\s*\(/);
    expect(transcript).not.toMatch(/from ["']react["']/);
    expect(transcript).not.toContain("@/store/");
    expect(transcript).not.toContain("@/components/helix/HelixAskPill");
  });

  it("keeps voice authority evaluators and suppression projection in the non-React voice authority module", () => {
    const pill = read("client/src/components/helix/HelixAskPill.tsx");
    const map = read("client/src/lib/helix/ASK_UI_OWNERSHIP.md");
    const harness = read("client/src/lib/helix/turn-loop-harness.ts");
    const authority = read("client/src/lib/helix/voice/voice-turn-authority.ts");

    expect(map).toContain("voice/voice-turn-authority.ts");
    expect(map).toContain("Deterministic voice turn seal gating");
    expect(map).toContain("authority suppression reason projection");
    expect(map).toContain("Starting/restarting Ask turns");
    expect(pill).toContain('from "@/lib/helix/voice/voice-turn-authority"');
    expect(harness).toContain('from "@/lib/helix/voice/voice-turn-authority"');
    expect(harness).not.toContain("@/components/helix/HelixAskPill");
    expect(pill).not.toMatch(/export function evaluateVoiceTurnSealGate\s*\(/);
    expect(pill).not.toMatch(/export function evaluateVoiceReasoningResponseAuthority\s*\(/);
    expect(pill).not.toMatch(/function resolveVoiceAuthoritySuppression\s*\(/);
    expect(authority).toMatch(/export function evaluateVoiceTurnSealGate\s*\(/);
    expect(authority).toMatch(/export function evaluateVoiceReasoningResponseAuthority\s*\(/);
    expect(authority).toMatch(/export function resolveVoiceAuthoritySuppression\s*\(/);
    expect(authority).not.toMatch(/from ["']react["']/);
    expect(authority).not.toContain("@/store/");
    expect(authority).not.toContain("@/components/helix/HelixAskPill");
  });

  it("keeps terminal projection helpers in the non-React terminal projection module", () => {
    const pill = read("client/src/components/helix/HelixAskPill.tsx");
    const projection = read("client/src/lib/helix/ask-terminal-projection.ts");

    expect(pill).toContain('from "@/lib/helix/ask-terminal-projection"');
    expect(pill).not.toMatch(/export function buildVisibleResolvedTurn\s*\(/);
    expect(pill).not.toMatch(/export function chooseVisibleFinalText\s*\(/);
    expect(pill).not.toMatch(/export function normalizeTerminalAnswerText\s*\(/);
    expect(pill).not.toMatch(/export function isInvalidTerminalAnswerText\s*\(/);
    expect(pill).not.toMatch(/export function readHelixAskFinalAnswerSourceLabel\s*\(/);
    expect(pill).not.toMatch(/export function resolveHelixAskFinalAnswerPresentation\s*\(/);
    expect(projection).toMatch(/export function buildVisibleResolvedTurn\s*\(/);
    expect(projection).toMatch(/export function chooseVisibleFinalText\s*\(/);
    expect(projection).toMatch(/export function normalizeTerminalAnswerText\s*\(/);
    expect(projection).toMatch(/export function isInvalidTerminalAnswerText\s*\(/);
    expect(projection).toMatch(/export function readHelixAskFinalAnswerSourceLabel\s*\(/);
    expect(projection).toMatch(/export function resolveHelixAskFinalAnswerPresentation\s*\(/);
    expect(projection).not.toMatch(/from ["']react["']/);
    expect(projection).not.toContain("@/store/");
    expect(projection).not.toContain("@/components/helix/HelixAskPill");
    expect(projection).not.toContain("setAskReplies");
    expect(projection).not.toContain("enqueueVoicePlaybackIntent");
    expect(projection).not.toContain("runAskTurn");
  });
});
