import { summarizeVoiceDebugText } from "@/lib/helix/ask-voice-text-display";
import type { VoiceLaneTimelineDebugEvent } from "@/lib/helix/voice-capture-diagnostics";

export type HelixAskVoiceTimelineBuildInfo = {
  clientBuild: string;
  clientMode: "dev" | "prod";
  serverService: string | null;
  serverVersion: string | null;
  serverGitSha: string | null;
  serverBuildTime: string | null;
  fetchedAtMs: number | null;
  error: string | null;
};

const cleanVersionText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function buildHelixAskVoiceTimelineInitialBuildInfo(args: {
  clientBuild: string;
  isDev: boolean;
}): HelixAskVoiceTimelineBuildInfo {
  return {
    clientBuild: args.clientBuild,
    clientMode: args.isDev ? "dev" : "prod",
    serverService: null,
    serverVersion: null,
    serverGitSha: null,
    serverBuildTime: null,
    fetchedAtMs: null,
    error: null,
  };
}

export function applyHelixAskVoiceTimelineVersionPayload(
  current: HelixAskVoiceTimelineBuildInfo,
  payload: {
    service?: unknown;
    version?: unknown;
    gitSha?: unknown;
    buildTime?: unknown;
  },
  fetchedAtMs: number,
): HelixAskVoiceTimelineBuildInfo {
  return {
    ...current,
    serverService: cleanVersionText(payload.service),
    serverVersion: cleanVersionText(payload.version),
    serverGitSha: cleanVersionText(payload.gitSha),
    serverBuildTime: cleanVersionText(payload.buildTime),
    fetchedAtMs,
    error: null,
  };
}

export function applyHelixAskVoiceTimelineVersionError(
  current: HelixAskVoiceTimelineBuildInfo,
  error: unknown,
  fetchedAtMs: number,
): HelixAskVoiceTimelineBuildInfo {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "version_unavailable";
  return {
    ...current,
    fetchedAtMs,
    error: message,
  };
}

export type HelixAskVoiceTimelineBuildInfoEventOptions = {
  buildInfo: HelixAskVoiceTimelineBuildInfo;
  atMs: number;
};

export function buildHelixAskVoiceTimelineBuildInfoEvent({
  buildInfo,
  atMs,
}: HelixAskVoiceTimelineBuildInfoEventOptions): VoiceLaneTimelineDebugEvent {
  const status: VoiceLaneTimelineDebugEvent["status"] =
    buildInfo.error
      ? "error"
      : buildInfo.serverVersion || buildInfo.serverGitSha
        ? "ok"
        : "warn";
  const summary = summarizeVoiceDebugText(
    [
      `client:${buildInfo.clientBuild}`,
      buildInfo.serverVersion ? `server:${buildInfo.serverVersion}` : "server:unknown",
      buildInfo.serverGitSha ? `git:${buildInfo.serverGitSha.slice(0, 12)}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
    260,
  );
  const detail = summarizeVoiceDebugText(
    [
      `client_mode:${buildInfo.clientMode}`,
      buildInfo.serverService ? `service:${buildInfo.serverService}` : null,
      buildInfo.serverBuildTime ? `build_time:${buildInfo.serverBuildTime}` : null,
      buildInfo.error ? `error:${buildInfo.error}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
    260,
  );
  const idToken = [
    buildInfo.clientBuild,
    buildInfo.serverVersion ?? "unknown",
    buildInfo.serverGitSha ?? "nogit",
  ]
    .join("-")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .slice(0, 120);

  return {
    id: `build:${idToken || "snapshot"}`,
    atMs,
    source: "system",
    kind: "build_info",
    status,
    traceId: null,
    turnKey: null,
    attemptId: null,
    text: summary || null,
    detail: detail || null,
  };
}
