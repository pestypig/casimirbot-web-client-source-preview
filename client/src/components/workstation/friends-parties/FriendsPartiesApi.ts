import type {
  HelixFriendsPartiesResponse,
  HelixSocialDiscoveryPolicy,
  HelixSocialPresenceVisibility,
  HelixVoiceParty,
  HelixVoicePartyIceConfiguration,
  HelixVoicePartyIceConfigurationResponse,
  HelixVoicePartyMediaSignal,
  HelixVoicePartyMediaSignalKind,
  HelixVoicePartyMediaSignalResponse,
  HelixVoicePartyMediaState,
} from "@shared/helix-friends-voice-party";

const ROOT = "/api/agi/friends-parties";

export class FriendsPartiesApiError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "FriendsPartiesApiError";
  }
}

const requestJson = async (
  path: string,
  init: RequestInit = {},
): Promise<HelixFriendsPartiesResponse> => {
  const result = await fetch(path, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload = await result.json().catch(() => null) as HelixFriendsPartiesResponse | null;
  if (
    !result.ok || payload?.schema !== "helix.friends_parties.response.v1" ||
    payload.ok !== true
  ) {
    throw new FriendsPartiesApiError(
      payload?.error ?? "friends_parties_request_failed",
      result.status,
      payload?.message ?? "Friends & Parties request failed.",
    );
  }
  return payload;
};

const requestSignalJson = async (
  path: string,
  init: RequestInit = {},
): Promise<HelixVoicePartyMediaSignalResponse> => {
  const result = await fetch(path, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload = await result.json().catch(() => null) as
    HelixVoicePartyMediaSignalResponse | null;
  if (
    !result.ok || payload?.schema !== "helix.voice_party.media_signal.response.v1" ||
    payload.ok !== true
  ) {
    throw new FriendsPartiesApiError(
      payload?.error ?? "voice_party_unavailable",
      result.status,
      payload?.message ?? "Voice party signaling failed.",
    );
  }
  return payload;
};

const requestIceJson = async (
  path: string,
): Promise<HelixVoicePartyIceConfiguration> => {
  const result = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await result.json().catch(() => null) as
    HelixVoicePartyIceConfigurationResponse | null;
  if (
    !result.ok ||
    payload?.schema !== "helix.voice_party.ice_configuration.response.v1" ||
    payload.ok !== true ||
    !payload.configuration
  ) {
    throw new FriendsPartiesApiError(
      payload?.error ?? "voice_party_unavailable",
      result.status,
      payload?.message ?? "Voice party ICE admission failed.",
    );
  }
  return payload.configuration;
};

const partyPath = (partyId: string, suffix = ""): string =>
  `${ROOT}/parties/${encodeURIComponent(partyId)}${suffix}`;

const requireParty = (payload: HelixFriendsPartiesResponse): HelixVoiceParty => {
  if (payload.party) return payload.party;
  throw new FriendsPartiesApiError("voice_party_unavailable", 502, "Party response omitted party state.");
};

export const friendsPartiesApi = {
  list: (): Promise<HelixFriendsPartiesResponse> => requestJson(ROOT),
  updateProfile(input: {
    handle: string;
    discovery_policy?: HelixSocialDiscoveryPolicy;
    presence_visibility?: HelixSocialPresenceVisibility;
  }): Promise<HelixFriendsPartiesResponse> {
    return requestJson(`${ROOT}/profile`, { method: "PUT", body: JSON.stringify(input) });
  },
  requestFriend(handle: string): Promise<HelixFriendsPartiesResponse> {
    return requestJson(`${ROOT}/friendships`, { method: "POST", body: JSON.stringify({ handle }) });
  },
  findExactHandle(handle: string): Promise<HelixFriendsPartiesResponse> {
    return requestJson(`${ROOT}/profiles/exact?handle=${encodeURIComponent(handle)}`);
  },
  decideFriendship(friendshipId: string, decision: "accept" | "decline" | "remove") {
    return requestJson(`${ROOT}/friendships/${encodeURIComponent(friendshipId)}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
  },
  setBlock(peerProfileId: string, blocked: boolean) {
    return requestJson(`${ROOT}/blocks`, {
      method: "POST",
      body: JSON.stringify({ peer_profile_id: peerProfileId, blocked }),
    });
  },
  heartbeat(state: "online" | "away" | "in_party") {
    return requestJson(`${ROOT}/presence/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ state }),
    });
  },
  async createParty(): Promise<HelixVoiceParty> {
    return requireParty(await requestJson(`${ROOT}/parties`, {
      method: "POST",
      body: JSON.stringify({}),
    }));
  },
  async getParty(partyId: string): Promise<HelixVoiceParty> {
    return requireParty(await requestJson(partyPath(partyId)));
  },
  async createPartyInvite(partyId: string, recipientProfileId: string) {
    const payload = await requestJson(partyPath(partyId, "/invites"), {
      method: "POST",
      body: JSON.stringify({ recipient_profile_id: recipientProfileId }),
    });
    if (!payload.party || !payload.invite_code) {
      throw new FriendsPartiesApiError("voice_party_unavailable", 502, "Party invite response was incomplete.");
    }
    return {
      party: payload.party,
      inviteCode: payload.invite_code,
      expiresAt: payload.invite_expires_at,
    };
  },
  async joinParty(inviteCode: string): Promise<HelixVoiceParty> {
    return requireParty(await requestJson(`${ROOT}/parties/join`, {
      method: "POST",
      body: JSON.stringify({ invite_code: inviteCode }),
    }));
  },
  async updateMedia(
    partyId: string,
    input: { media_state: HelixVoicePartyMediaState; muted?: boolean; deafened?: boolean },
  ): Promise<HelixVoiceParty> {
    return requireParty(await requestJson(partyPath(partyId, "/media"), {
      method: "PATCH",
      body: JSON.stringify(input),
    }));
  },
  async heartbeatParty(partyId: string): Promise<HelixVoiceParty> {
    return requireParty(await requestJson(partyPath(partyId, "/heartbeat"), {
      method: "POST",
      body: JSON.stringify({}),
    }));
  },
  async requestGptAttachment(partyId: string, roomId: string): Promise<HelixVoiceParty> {
    return requireParty(await requestJson(partyPath(partyId, "/gpt-attachment"), {
      method: "POST",
      body: JSON.stringify({ attached: true, room_id: roomId }),
    }));
  },
  async detachGpt(partyId: string): Promise<HelixVoiceParty> {
    return requireParty(await requestJson(partyPath(partyId, "/gpt-attachment"), {
      method: "POST",
      body: JSON.stringify({ attached: false }),
    }));
  },
  leaveParty(partyId: string): Promise<HelixFriendsPartiesResponse> {
    return requestJson(partyPath(partyId, "/leave"), {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async publishSignal(partyId: string, input: {
    targetParticipantId: string;
    negotiationId: string;
    kind: HelixVoicePartyMediaSignalKind;
    description?: RTCSessionDescriptionInit | null;
    candidate?: RTCIceCandidateInit | null;
  }): Promise<HelixVoicePartyMediaSignal> {
    const payload = await requestSignalJson(partyPath(partyId, "/media/signals"), {
      method: "POST",
      body: JSON.stringify({
        target_participant_id: input.targetParticipantId,
        negotiation_id: input.negotiationId,
        kind: input.kind,
        description: input.description ?? null,
        candidate: input.candidate ?? null,
      }),
    });
    if (!payload.signal) {
      throw new FriendsPartiesApiError("voice_party_unavailable", 502, "Signal response omitted signal state.");
    }
    return payload.signal;
  },
  async listSignals(partyId: string, afterSignalId?: string | null) {
    const suffix = afterSignalId
      ? `/media/signals?after=${encodeURIComponent(afterSignalId)}`
      : "/media/signals";
    return (await requestSignalJson(partyPath(partyId, suffix))).signals;
  },
  getIceConfiguration(
    partyId: string,
    transportPolicy: "all" | "relay" = "all",
  ): Promise<HelixVoicePartyIceConfiguration> {
    return requestIceJson(partyPath(
      partyId,
      `/media/ice-configuration?transport=${transportPolicy}`,
    ));
  },
};

export type FriendsPartiesApi = typeof friendsPartiesApi;
