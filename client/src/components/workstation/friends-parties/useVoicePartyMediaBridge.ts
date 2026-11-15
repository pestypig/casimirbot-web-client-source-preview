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
  const generation = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    setProjection(INITIAL_VOICE_PARTY_MEDIA_PROJECTION);
    return () => {
      mounted.current = false;
      generation.current++;
      const bridge = bridgeRef.current;
      bridgeRef.current = null;
      identityRef.current = null;
      if (bridge) void bridge.close().catch(() => undefined);
    };
  }, [identity]);

  useEffect(() => {
    if (bridgeRef.current && identityRef.current === identity && input.party) {
      bridgeRef.current.syncParty(input.party);
    }
  }, [identity, input.party]);

  const start = useCallback(async () => {
    if (!mounted.current || !input.party || !input.self || !identity) return;
    const attempt = ++generation.current;
    const previous = bridgeRef.current;
    bridgeRef.current = null;
    identityRef.current = null;
    if (previous) await previous.close().catch(() => undefined);
    if (!mounted.current || generation.current !== attempt) return;
    const bridge = createVoicePartyMediaBridge({
      party: input.party,
      self: input.self,
      api: input.api,
      onProjection: next => {
        if (mounted.current && generation.current === attempt) setProjection(next);
      },
    });
    bridgeRef.current = bridge;
    identityRef.current = identity;
    await bridge.start();
  }, [identity, input.api, input.party, input.self]);

  const stop = useCallback(async () => {
    generation.current++;
    const bridge = bridgeRef.current;
    bridgeRef.current = null;
    identityRef.current = null;
    if (mounted.current) setProjection(current => ({ ...current, state: "closed",
      peer_audio_connected: false, remote_audio_playback_ready: false }));
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

