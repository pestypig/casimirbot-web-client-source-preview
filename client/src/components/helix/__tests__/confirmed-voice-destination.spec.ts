// @vitest-environment node
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { buildVoiceInputStatusLabel } from "@/lib/helix/ask-voice-copy-display";

// Exercise the actual confirmation callback with explicit dependencies.
// No microphone, native destination, provider or game connection is opened.
const source = fs.readFileSync(new URL("../HelixAskPill.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("HelixAskPill.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback = "";
const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "acceptTranscriptConfirmationCandidate") {
    if (!node.initializer || !ts.isCallExpression(node.initializer)) throw new Error("confirmation callback missing");
    callback = node.initializer.arguments[0].getText(parsed);
  }
  ts.forEachChild(node, visit);
};
visit(parsed);
if (!callback) throw new Error("confirmation callback not found");
const code = ts.transpileModule(`(${callback})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const makeHarness = (destination: string, accepted: boolean) => {
  const setters = Object.fromEntries([
    "stopReadAloud", "setTranscriptConfirmState", "clearHeldTranscriptState", "markVoiceCheckpoint",
    "patchVoiceSegmentAttempt", "setVoiceInputError", "setVoiceInputState", "processTranscriptionQueue",
  ].map(name => [name, vi.fn()]));
  const pending = { id: "candidate:one", traceId: "trace:one", segmentId: "segment:one",
    transcript: "Observe the marked waypoint", sourceText: null, sourceLanguage: "en",
    translated: false, translationUncertain: false, confidence: 0.9, confidenceReason: null,
    completion: {}, turnComplete: {}, sttEngine: "fixture" };
  const refs = { transcriptConfirmStateRef: { current: pending }, micArmStateRef: { current: "on" },
    voiceConfirmedTurnQueueRef: { current: [] as unknown[] } };
  const offer = vi.fn(() => accepted);
  const accept = vm.runInNewContext(code, { ...setters, ...refs,
    readPersonalVoiceDestination: () => destination, offerFinalizedVoiceSteering: offer,
    labelForPersonalVoiceDestination: () => "Selected paired Codex chat",
    clipText: (text: string, limit: number) => text.slice(0, limit),
  }) as (candidateId: string, source: "manual" | "auto") => void;
  return { accept, offer, refs, setters };
};
const visibleStatus = (h: ReturnType<typeof makeHarness>) => buildVoiceInputStatusLabel("on",
  h.setters.setVoiceInputState.mock.lastCall?.[0], h.setters.setVoiceInputError.mock.lastCall?.[0] ?? null);

describe("confirmed voice destination status", () => {
  it("returns to listening after offering the transcript to the selected chat without local reasoning", () => {
    const h = makeHarness("paired_codex", true);
    h.accept("candidate:one", "manual");
    expect(h.offer).toHaveBeenCalledExactlyOnceWith({ clientEventRef: "gpt-live:trace:one", transcript: "Observe the marked waypoint" });
    expect(visibleStatus(h)).toBe("Listening");
    expect(h.refs.voiceConfirmedTurnQueueRef.current).toEqual([]);
    expect(h.setters.processTranscriptionQueue).not.toHaveBeenCalled();
  });
  it("shows the unavailable destination error without falling back to another chat", () => {
    const h = makeHarness("paired_codex", false);
    h.accept("candidate:one", "manual");
    expect(visibleStatus(h)).toBe("Selected paired Codex chat is unavailable. The transcript was not sent to another chat.");
    expect(h.offer).toHaveBeenCalledOnce();
    expect(h.refs.voiceConfirmedTurnQueueRef.current).toEqual([]);
    expect(h.setters.processTranscriptionQueue).not.toHaveBeenCalled();
  });
  it("keeps the explicitly selected Ask Helix route", () => {
    const h = makeHarness("ask_helix", false);
    h.accept("candidate:one", "manual");
    expect(visibleStatus(h)).toBe("Transcribing");
    expect(h.refs.voiceConfirmedTurnQueueRef.current).toHaveLength(1);
    expect(h.setters.processTranscriptionQueue).toHaveBeenCalledOnce();
  });
  it.each(["microphone off", "different candidate"])("does nothing for %s", boundary => {
    const h = makeHarness("paired_codex", true);
    if (boundary === "microphone off") h.refs.micArmStateRef.current = "off";
    h.accept(boundary === "different candidate" ? "candidate:other" : "candidate:one", "manual");
    expect(h.offer).not.toHaveBeenCalled();
    for (const fn of Object.values(h.setters)) expect(fn).not.toHaveBeenCalled();
  });
});
