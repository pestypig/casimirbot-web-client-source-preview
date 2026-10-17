export const COVER_FLOW_STORAGE_KEY = "noisegen:coverFlow";
export const COVER_FLOW_EVENT = "noisegen:cover-flow";

export type CoverFlowPayload = {
  knowledgeFileIds: string[];
  kbTexture?: string | null;
  trackId?: string;
  trackName?: string;
  albumId?: string;
  albumName?: string;
  forceRemote?: boolean;
};

const sanitizeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed) {
      ids.add(trimmed);
    }
  }
  return Array.from(ids);
};

export const normalizeCoverFlowPayload = (payload: CoverFlowPayload | null | undefined): CoverFlowPayload | null => {
  if (!payload) return null;
  const knowledgeFileIds = sanitizeIds(payload.knowledgeFileIds);
  if (knowledgeFileIds.length === 0) return null;
  const normalizeString = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined);
  const normalized: CoverFlowPayload = {
    knowledgeFileIds,
  };
  if (typeof payload.forceRemote === "boolean") {
    normalized.forceRemote = payload.forceRemote;
  }
  const kbTexture = normalizeString(payload.kbTexture);
  if (kbTexture) normalized.kbTexture = kbTexture;
  const trackId = normalizeString(payload.trackId);
  if (trackId) normalized.trackId = trackId;
  const trackName = normalizeString(payload.trackName);
  if (trackName) normalized.trackName = trackName;
  const albumId = normalizeString(payload.albumId);
  if (albumId) normalized.albumId = albumId;
  const albumName = normalizeString(payload.albumName);
  if (albumName) normalized.albumName = albumName;
  return normalized;
};

export const writeCoverFlowPayload = (payload: CoverFlowPayload): CoverFlowPayload | null => {
  const normalized = normalizeCoverFlowPayload(payload);
  if (!normalized) return null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage?.setItem(COVER_FLOW_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore storage errors; this is best-effort.
    }
    try {
      window.dispatchEvent(new CustomEvent(COVER_FLOW_EVENT, { detail: normalized }));
    } catch {
      // Best-effort dispatch.
    }
  }
  return normalized;
};

export const clearCoverFlowPayload = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(COVER_FLOW_STORAGE_KEY);
  } catch {
    // Ignore storage errors; this is best-effort.
  }
  try {
    window.dispatchEvent(new CustomEvent(COVER_FLOW_EVENT, { detail: null }));
  } catch {
    // Best-effort dispatch.
  }
};

export const readCoverFlowPayload = (): CoverFlowPayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(COVER_FLOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoverFlowPayload;
    return normalizeCoverFlowPayload(parsed);
  } catch {
    return null;
  }
};
