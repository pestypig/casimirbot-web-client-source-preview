export const DEFAULT_SHARED_LIVE_ROOM_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export type SharedLiveRoomIceConfiguration = {
  iceServers: RTCIceServer[];
  source: "default_stun" | "configured";
  error: "ice_configuration_invalid" | null;
};

const MAX_ICE_SERVERS = 8;
const MAX_URLS_PER_SERVER = 8;
const MAX_FIELD_LENGTH = 1_024;
const ICE_URL = /^(?:stun|stuns|turn|turns):[^\s]+$/i;

const boundedText = (value: unknown): string | null =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= MAX_FIELD_LENGTH
    ? value.trim()
    : null;

const parseServer = (value: unknown): RTCIceServer | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const rawUrls = Array.isArray(candidate.urls) ? candidate.urls : [candidate.urls];
  const urls = rawUrls
    .map(boundedText)
    .filter((url): url is string => Boolean(url && ICE_URL.test(url)));
  if (
    urls.length === 0 ||
    urls.length !== rawUrls.length ||
    urls.length > MAX_URLS_PER_SERVER
  ) return null;
  const username = candidate.username == null ? null : boundedText(candidate.username);
  const credential = candidate.credential == null ? null : boundedText(candidate.credential);
  if (
    (candidate.username != null && !username) ||
    (candidate.credential != null && !credential)
  ) return null;
  return {
    urls: Array.isArray(candidate.urls) ? urls : urls[0],
    ...(username ? { username } : {}),
    ...(credential ? { credential } : {}),
  };
};

export const readSharedLiveRoomIceConfiguration = (
  rawConfiguration: string | null | undefined,
): SharedLiveRoomIceConfiguration => {
  if (!rawConfiguration?.trim()) {
    return {
      iceServers: DEFAULT_SHARED_LIVE_ROOM_ICE_SERVERS,
      source: "default_stun",
      error: null,
    };
  }
  try {
    const parsed = JSON.parse(rawConfiguration) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_ICE_SERVERS) {
      throw new Error("invalid_ice_server_count");
    }
    const iceServers = parsed.map(parseServer);
    if (iceServers.some((server) => !server)) throw new Error("invalid_ice_server");
    return {
      iceServers: iceServers as RTCIceServer[],
      source: "configured",
      error: null,
    };
  } catch {
    return {
      iceServers: DEFAULT_SHARED_LIVE_ROOM_ICE_SERVERS,
      source: "default_stun",
      error: "ice_configuration_invalid",
    };
  }
};

export const readSharedLiveRoomIceConfigurationFromEnvironment = ():
SharedLiveRoomIceConfiguration => {
  const environment = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;
  return readSharedLiveRoomIceConfiguration(
    environment?.VITE_SHARED_LIVE_ROOM_ICE_SERVERS_JSON,
  );
};

