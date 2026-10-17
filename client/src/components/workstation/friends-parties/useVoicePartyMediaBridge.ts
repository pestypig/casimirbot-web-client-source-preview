import { useCallback, useEffect, useRef, useState } from "react";
import type { HelixVoiceParty, HelixVoicePartyMember } from
  "@shared/helix-friends-voice-party";
import type { FriendsPartiesApi } from "./FriendsPartiesApi";
import {
  createVoicePartyMediaBridge,
  INITIAL_VOICE_PARTY_MEDIA_PROJECTION,
  type VoicePartyMediaBridge,
  type VoicePartyMediaProjection,
} from "./VoicePartyMediaBridge";

export const useVoicePartyMediaBridge = (input: {
  party: HelixVoiceParty | null;
  self: HelixVoicePartyMember | null;
  api: FriendsPartiesApi;
}) => {
  const bridgeRef = useRef<VoicePartyMediaBridge | null>(null);
  const [projection, setProjection] = useState<VoicePartyMediaProjection>(
    INITIAL_VOICE_PARTY_MEDIA_PROJECTION,
  );
  const identity = input.party && input.self
    ? `${input.party.party_id}|${input.self.participant_id}`
    : null;
  const identityRef = useRef<string | null>(null);

  useEffect(() => {
    if (bridgeRef.current && identityRef.current === identity && input.party) {
      bridgeRef.current.syncParty(input.party);
    }
  }, [identity, input.party]);

  useEffect(() => () => {
    const bridge = bridgeRef.current;
    bridgeRef.current = null;
    identityRef.current = null;
    if (bridge) void bridge.close();
  }, []);

  const start = useCallback(async () => {
    if (!input.party || !input.self || !identity) return;
    if (bridgeRef.current) await bridgeRef.current.close().catch(() => undefined);
    const bridge = createVoicePartyMediaBridge({
      party: input.party,
      self: input.self,
      api: input.api,
      onProjection: setProjection,
    });
    bridgeRef.current = bridge;
    identityRef.current = identity;
    await bridge.start();
  }, [identity, input.api, input.party, input.self]);

  const stop = useCallback(async () => {
    const bridge = bridgeRef.current;
    bridgeRef.current = null;
    identityRef.current = null;
    if (bridge) await bridge.close().catch(() => undefined);
  }, []);

  return {
    projection,
    start,
    stop,
    setMuted: (muted: boolean) => bridgeRef.current?.setMuted(muted) ?? Promise.resolve(),
    setDeafened: (deafened: boolean) =>
      bridgeRef.current?.setDeafened(deafened) ?? Promise.resolve(),
    resumePlayback: () => bridgeRef.current?.resumePlayback() ?? Promise.resolve(false),
  };
};

