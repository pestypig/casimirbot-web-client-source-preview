// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ sendVoiceTranscript: vi.fn<(text: string) => boolean>() }));
vi.mock("../useManagedConversation", async () => {
  const { createContext } = await import("react");
  return {
    useManagedConversation: () => ({ sendVoiceTranscript: mocked.sendVoiceTranscript }),
    ManagedConversationControllerContext: createContext(null),
  };
});

import { ManagedConversationOwnerBoundary } from "../ManagedConversationOwnerBoundary";
import { offerFinalizedVoiceSteering } from "@/lib/helix/voice-steering-finalized";
import { readPersonalVoiceDestination, writePersonalVoiceDestination } from
  "@/lib/helix/personal-voice-route";

afterEach(() => {
  cleanup();
  mocked.sendVoiceTranscript.mockReset();
  writePersonalVoiceDestination("cloud_agent_dm");
  window.localStorage.clear();
});

describe("personal Live Voice route", () => {
  it("keeps its selected destination independent of a text chat and deduplicates an accepted transcript", () => {
    writePersonalVoiceDestination("cloud_agent_dm");
    mocked.sendVoiceTranscript.mockReturnValue(true);
    render(<ManagedConversationOwnerBoundary><div>Another text chat is selected</div></ManagedConversationOwnerBoundary>);

    expect(offerFinalizedVoiceSteering({ clientEventRef: "voice:one", transcript: "Inspect this" })).toBe(true);
    expect(offerFinalizedVoiceSteering({ clientEventRef: "voice:one", transcript: "Inspect this" })).toBe(true);
    expect(mocked.sendVoiceTranscript).toHaveBeenCalledExactlyOnceWith("Inspect this", "voice:one");
    expect(readPersonalVoiceDestination()).toBe("cloud_agent_dm");
  });

  it("reports an unavailable Cloud Agent turn instead of claiming it was queued or falling through", () => {
    mocked.sendVoiceTranscript.mockReturnValue(false);
    render(<ManagedConversationOwnerBoundary><div /></ManagedConversationOwnerBoundary>);

    expect(offerFinalizedVoiceSteering({ clientEventRef: "voice:offline", transcript: "Inspect this" })).toBe(false);
    expect(mocked.sendVoiceTranscript).toHaveBeenCalledOnce();
    writePersonalVoiceDestination("ask_helix");
    expect(offerFinalizedVoiceSteering({ clientEventRef: "voice:ask", transcript: "Ask locally" })).toBe(false);
    expect(mocked.sendVoiceTranscript).toHaveBeenCalledOnce();
  });
});
