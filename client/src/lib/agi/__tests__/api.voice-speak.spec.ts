import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let speakVoice: typeof import("@/lib/agi/api").speakVoice;
let speakVoiceStream: typeof import("@/lib/agi/api").speakVoiceStream;
let getVoiceCallDiagnosticsSnapshot: typeof import("@/lib/helix/voice-call-diagnostics").getVoiceCallDiagnosticsSnapshot;
let clearVoiceCallDiagnosticsSnapshot: typeof import("@/lib/helix/voice-call-diagnostics").clearVoiceCallDiagnosticsSnapshot;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({ speakVoice, speakVoiceStream } = await import("@/lib/agi/api"));
  ({ getVoiceCallDiagnosticsSnapshot, clearVoiceCallDiagnosticsSnapshot } = await import(
    "@/lib/helix/voice-call-diagnostics"
  ));
});

describe("speakVoice", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearVoiceCallDiagnosticsSnapshot();
  });

  it("maps payload and parses JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, suppressed: true, reason: "voice_context_ineligible" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await speakVoice({
      text: "Read this",
      mode: "briefing",
      priority: "info",
      voice_profile_id: "ops",
      traceId: "trace-1",
      missionId: "mission-1",
      eventId: "event-1",
      contextTier: "tier1",
      sessionState: "active",
      voiceMode: "normal",
      chunkKind: "translation_relay",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/voice/speak",
      expect.objectContaining({ method: "POST" }),
    );
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toMatchObject({
      text: "Read this",
      mode: "briefing",
      priority: "info",
      voice_profile_id: "ops",
      traceId: "trace-1",
      missionId: "mission-1",
      eventId: "event-1",
      contextTier: "tier1",
      sessionState: "active",
      voiceMode: "normal",
      chunkKind: "translation_relay",
    });
    expect(res.kind).toBe("json");
    const calls = getVoiceCallDiagnosticsSnapshot();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      kind: "speak",
      endpoint: "/api/voice/speak",
      ok: true,
      status: 200,
      responseKind: "json",
      traceId: "trace-1",
      missionId: "mission-1",
      eventId: "event-1",
      textLength: "Read this".length,
    });
    expect(calls[0]?.textHash).toBeTruthy();
    expect(JSON.stringify(calls[0])).not.toContain("Read this");
  });

  it("parses audio blob responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Blob(["audio-bytes"], { type: "audio/wav" }), {
          status: 200,
          headers: { "content-type": "audio/wav" },
        }),
      ),
    );

    const res = await speakVoice({ text: "audio" });
    expect(res.kind).toBe("audio");
    expect(getVoiceCallDiagnosticsSnapshot()[0]).toMatchObject({
      kind: "speak",
      ok: true,
      status: 200,
      responseKind: "audio",
      audioBytes: 11,
      audioMimeType: "audio/wav",
    });
  });

  it("returns stream responses without consuming the audio body", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "x-voice-cache": "stream",
          "x-voice-provider": "elevenlabs",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await speakVoiceStream({ text: "stream this", provider: "elevenlabs" });

    expect(res.kind).toBe("stream");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/voice/speak",
      expect.objectContaining({ method: "POST" }),
    );
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toMatchObject({
      text: "stream this",
      provider: "elevenlabs",
      streaming: true,
    });
    expect(res.headers.cache).toBe("stream");
    if (res.kind === "stream") {
      const reader = res.stream.getReader();
      const first = await reader.read();
      expect(Array.from(first.value ?? [])).toEqual([1, 2, 3]);
    }
    expect(getVoiceCallDiagnosticsSnapshot()[0]).toMatchObject({
      kind: "speak",
      ok: true,
      status: 200,
      responseKind: "audio",
      cacheHeader: "stream",
      audioMimeType: "audio/mpeg",
    });
  });
});
