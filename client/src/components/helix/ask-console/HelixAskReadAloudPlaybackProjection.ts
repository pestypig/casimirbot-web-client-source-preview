import type {
  ReadAloudPlaybackState,
  ReadAloudRegionTrafficPhase,
  ReadAloudRegionTrafficRegion,
  ReadAloudRegionTrafficState,
} from "@/lib/helix/ask-read-aloud-display";

export type HelixAskReadAloudPlaybackProjection = {
  replyId: string;
  utteranceId: string | null;
  phase: "loading" | "reading" | "preloading" | "paused" | "resuming" | "completed" | "cancelled" | "error";
  activeChunkIndex: number | null;
  activeChunkText: string | null;
  preloadingChunkIndex: number | null;
  preloadingChunkText: string | null;
  completedChunkIndex: number | null;
  chunkCount: number | null;
};

export type HelixAskReadAloudPlaybackProjectionByReply = Record<
  string,
  HelixAskReadAloudPlaybackProjection
>;

export type HelixAskReadAloudPlaybackProjectionEvent = {
  kind?: string | null;
  replyId?: string | null;
  utteranceId?: string | null;
  chunkIndex?: number | null;
  chunkCount?: number | null;
  text?: string | null;
};

const HELIX_ASK_READ_ALOUD_PROJECTION_EVENT_KINDS = new Set([
  "chunk_synth_start",
  "chunk_synth_ok",
  "chunk_play_start",
  "chunk_play_end",
  "chunk_drop",
  "chunk_synth_error",
]);

function normalizeChunkIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createProjectionFromEvent(
  event: HelixAskReadAloudPlaybackProjectionEvent,
): HelixAskReadAloudPlaybackProjection | null {
  const replyId = normalizeText(event.replyId);
  if (!replyId) return null;
  return {
    replyId,
    utteranceId: normalizeText(event.utteranceId),
    phase: "loading",
    activeChunkIndex: null,
    activeChunkText: null,
    preloadingChunkIndex: null,
    preloadingChunkText: null,
    completedChunkIndex: null,
    chunkCount: normalizeChunkIndex(event.chunkCount),
  };
}

export function reduceHelixAskReadAloudPlaybackProjection(
  current: HelixAskReadAloudPlaybackProjection | null | undefined,
  event: HelixAskReadAloudPlaybackProjectionEvent,
): HelixAskReadAloudPlaybackProjection | null {
  if (!event.kind || !HELIX_ASK_READ_ALOUD_PROJECTION_EVENT_KINDS.has(event.kind)) {
    return current ?? null;
  }
  const replyId = normalizeText(event.replyId);
  if (!replyId) return current ?? null;
  const chunkIndex = normalizeChunkIndex(event.chunkIndex);
  const chunkCount = normalizeChunkIndex(event.chunkCount) ?? current?.chunkCount ?? null;
  const chunkText = normalizeText(event.text);
  const nextBase = current?.replyId === replyId
    ? {
        ...current,
        utteranceId: normalizeText(event.utteranceId) ?? current.utteranceId,
        chunkCount,
      }
    : createProjectionFromEvent(event);
  if (!nextBase) return null;

  if (event.kind === "chunk_synth_start" || event.kind === "chunk_synth_ok") {
    if (
      nextBase.activeChunkIndex !== null &&
      chunkIndex !== null &&
      chunkIndex > nextBase.activeChunkIndex
    ) {
      return {
        ...nextBase,
        phase:
          nextBase.phase === "paused"
            ? "paused"
            : nextBase.phase === "loading" || nextBase.phase === "resuming"
              ? nextBase.phase
              : "reading",
        preloadingChunkIndex: chunkIndex,
        preloadingChunkText: chunkText ?? nextBase.preloadingChunkText,
      };
    }
    if (nextBase.activeChunkIndex === null && nextBase.phase !== "reading" && nextBase.phase !== "paused") {
      return {
        ...nextBase,
        phase: chunkIndex !== null && chunkIndex > 0 ? "preloading" : "loading",
        activeChunkIndex: chunkIndex !== null && chunkIndex <= 0 ? chunkIndex : nextBase.activeChunkIndex,
        activeChunkText: chunkIndex !== null && chunkIndex <= 0 ? chunkText : nextBase.activeChunkText,
        preloadingChunkIndex: chunkIndex !== null && chunkIndex > 0 ? chunkIndex : nextBase.preloadingChunkIndex,
        preloadingChunkText: chunkIndex !== null && chunkIndex > 0 ? chunkText : nextBase.preloadingChunkText,
      };
    }
  }

  if (event.kind === "chunk_play_start") {
    return {
      ...nextBase,
      phase: "reading",
      activeChunkIndex: chunkIndex,
      activeChunkText: chunkText ?? nextBase.activeChunkText,
      preloadingChunkIndex:
        nextBase.preloadingChunkIndex === chunkIndex ? null : nextBase.preloadingChunkIndex,
      preloadingChunkText:
        nextBase.preloadingChunkIndex === chunkIndex ? null : nextBase.preloadingChunkText,
    };
  }

  if (event.kind === "chunk_play_end") {
    const endedActive = nextBase.activeChunkIndex === chunkIndex;
    return {
      ...nextBase,
      phase: nextBase.preloadingChunkIndex !== null ? "preloading" : "completed",
      activeChunkIndex: endedActive ? null : nextBase.activeChunkIndex,
      activeChunkText: endedActive ? null : nextBase.activeChunkText,
      completedChunkIndex: chunkIndex,
    };
  }

  if (event.kind === "chunk_drop" || event.kind === "chunk_synth_error") {
    return {
      ...nextBase,
      phase: event.kind === "chunk_synth_error" ? "error" : "cancelled",
      activeChunkIndex: null,
      activeChunkText: null,
      preloadingChunkIndex: null,
      preloadingChunkText: null,
    };
  }

  return nextBase;
}

export function reduceHelixAskReadAloudPlaybackProjectionByReply(
  current: HelixAskReadAloudPlaybackProjectionByReply,
  event: HelixAskReadAloudPlaybackProjectionEvent,
): HelixAskReadAloudPlaybackProjectionByReply {
  if (!event.kind || !HELIX_ASK_READ_ALOUD_PROJECTION_EVENT_KINDS.has(event.kind)) {
    return current;
  }
  const replyId = normalizeText(event.replyId);
  if (!replyId) return current;
  const nextProjection = reduceHelixAskReadAloudPlaybackProjection(current[replyId], event);
  if (!nextProjection) return current;
  return {
    ...current,
    [replyId]: nextProjection,
  };
}

export function clearHelixAskReadAloudPlaybackProjectionForReply(
  current: HelixAskReadAloudPlaybackProjectionByReply,
  replyId: string | null | undefined,
): HelixAskReadAloudPlaybackProjectionByReply {
  const normalizedReplyId = normalizeText(replyId);
  if (!normalizedReplyId || !current[normalizedReplyId]) return current;
  const next = { ...current };
  delete next[normalizedReplyId];
  return next;
}

function buildProjectionRegion(input: {
  phase: ReadAloudRegionTrafficPhase;
  label: string;
  chunkIndex: number | null;
  chunkCount: number | null;
  chunkText: string | null;
}): ReadAloudRegionTrafficRegion {
  return {
    active: true,
    phase: input.phase,
    label: input.label,
    detail:
      input.chunkIndex !== null && input.chunkCount !== null && input.chunkCount > 0
        ? `chunk ${input.chunkIndex + 1}/${input.chunkCount}`
        : null,
    chunkIndex: input.chunkIndex,
    chunkCount: input.chunkCount,
    chunkText: input.chunkText,
  };
}

export function buildHelixAskReadAloudTrafficStateFromPlaybackProjection(args: {
  replyId?: string | null;
  readAloudState: ReadAloudPlaybackState;
  projection?: HelixAskReadAloudPlaybackProjection | null;
}): ReadAloudRegionTrafficState | null {
  const replyId = normalizeText(args.replyId);
  const projection = args.projection;
  if (!replyId || projection?.replyId !== replyId) return null;
  if (projection.phase === "completed" || projection.phase === "cancelled" || projection.phase === "error") {
    return null;
  }

  const regions: ReadAloudRegionTrafficRegion[] = [];
  if (projection.activeChunkIndex !== null || projection.activeChunkText) {
    const phase =
      args.readAloudState === "paused" || projection.phase === "paused"
        ? "paused"
        : args.readAloudState === "resuming" || projection.phase === "resuming"
          ? "resuming"
          : projection.phase === "loading"
            ? "loading"
            : "reading";
    regions.push(buildProjectionRegion({
      phase,
      label:
        phase === "loading"
          ? "Loading read-aloud"
          : phase === "paused"
            ? "Read-aloud paused"
            : phase === "resuming"
              ? "Resuming read-aloud"
              : "Reading aloud",
      chunkIndex: projection.activeChunkIndex,
      chunkCount: projection.chunkCount,
      chunkText: projection.activeChunkText,
    }));
  }
  if (projection.preloadingChunkIndex !== null || projection.preloadingChunkText) {
    regions.push(buildProjectionRegion({
      phase: "preloading",
      label: "Preloading next read-aloud chunk",
      chunkIndex: projection.preloadingChunkIndex,
      chunkCount: projection.chunkCount,
      chunkText: projection.preloadingChunkText,
    }));
  }
  const first = regions[0] ?? null;
  if (!first) return null;
  return {
    ...first,
    regions,
  };
}
