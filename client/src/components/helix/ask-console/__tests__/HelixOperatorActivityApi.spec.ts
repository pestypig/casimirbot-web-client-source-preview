import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdapterAiActivityPage,
  HelixOperatorActivityHttpError,
  shouldRetainResponsesActivityAfterReadFailure,
} from "../HelixOperatorActivityApi";

afterEach(() => vi.unstubAllGlobals());

describe("Responses activity transport retention", () => {
  const seenAt = 1_000_000;

  it("keeps a recent verified page only for transient transport failures", () => {
    for (const error of [new TypeError("network unavailable"),
      new HelixOperatorActivityHttpError("timeout", 408),
      new HelixOperatorActivityHttpError("rate limited", 429),
      new HelixOperatorActivityHttpError("server unavailable", 503)]) {
      expect(shouldRetainResponsesActivityAfterReadFailure(error, seenAt, seenAt + 29_999))
        .toBe(true);
      expect(shouldRetainResponsesActivityAfterReadFailure(error, seenAt, seenAt + 30_001))
        .toBe(false);
    }
  });

  it("clears immediately for account denial, malformed data, or no verified page", () => {
    for (const error of [new HelixOperatorActivityHttpError("signed out", 401),
      new HelixOperatorActivityHttpError("forbidden", 403),
      new HelixOperatorActivityHttpError("missing", 404),
      new SyntaxError("malformed response")]) {
      expect(shouldRetainResponsesActivityAfterReadFailure(error, seenAt, seenAt + 1))
        .toBe(false);
    }
    expect(shouldRetainResponsesActivityAfterReadFailure(new TypeError("network"), 0, seenAt))
      .toBe(false);
    expect(shouldRetainResponsesActivityAfterReadFailure(new TypeError("network"), seenAt, seenAt - 1))
      .toBe(false);
  });

  it("preserves the HTTP status of an actual rejected activity read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Signed out" }),
      { status: 401, headers: { "content-type": "application/json" } })));
    await expect(fetchAdapterAiActivityPage({ helixConversationId: "chat:owner" }))
      .rejects.toMatchObject({ name: "HelixOperatorActivityHttpError", status: 401,
        message: "Signed out" });
  });
});
