import { describe, expect, it } from "vitest";

import {
  applyHelixAskVoiceTimelineVersionError,
  applyHelixAskVoiceTimelineVersionPayload,
  buildHelixAskVoiceTimelineInitialBuildInfo,
} from "@/components/helix/ask-console/HelixAskVoiceTimelineBuildInfo";

describe("Helix Ask voice timeline build info", () => {
  it("builds deterministic initial client build info", () => {
    expect(
      buildHelixAskVoiceTimelineInitialBuildInfo({
        clientBuild: "build-123",
        isDev: true,
      }),
    ).toEqual({
      clientBuild: "build-123",
      clientMode: "dev",
      serverService: null,
      serverVersion: null,
      serverGitSha: null,
      serverBuildTime: null,
      fetchedAtMs: null,
      error: null,
    });

    expect(
      buildHelixAskVoiceTimelineInitialBuildInfo({
        clientBuild: "prod-build",
        isDev: false,
      }).clientMode,
    ).toBe("prod");
  });

  it("applies trimmed server version payload fields without mutating client identity", () => {
    const current = buildHelixAskVoiceTimelineInitialBuildInfo({
      clientBuild: "client-build",
      isDev: false,
    });

    expect(
      applyHelixAskVoiceTimelineVersionPayload(
        current,
        {
          service: " helix-api ",
          version: " 2026.7.1 ",
          gitSha: " abc123 ",
          buildTime: "",
        },
        42,
      ),
    ).toEqual({
      clientBuild: "client-build",
      clientMode: "prod",
      serverService: "helix-api",
      serverVersion: "2026.7.1",
      serverGitSha: "abc123",
      serverBuildTime: null,
      fetchedAtMs: 42,
      error: null,
    });
  });

  it("records version fetch errors with a deterministic fallback label", () => {
    const current = {
      ...buildHelixAskVoiceTimelineInitialBuildInfo({
        clientBuild: "client-build",
        isDev: true,
      }),
      serverService: "old-service",
    };

    expect(applyHelixAskVoiceTimelineVersionError(current, new Error(" version_http_500 "), 100)).toEqual({
      ...current,
      fetchedAtMs: 100,
      error: "version_http_500",
    });
    expect(applyHelixAskVoiceTimelineVersionError(current, "nope", 101)).toEqual({
      ...current,
      fetchedAtMs: 101,
      error: "version_unavailable",
    });
  });
});
