import { describe, expect, it } from "vitest";
import { shouldRenewSharedLiveRoomFloor } from
  "../SharedLiveRoomFloorLease";

const base = {
  activeRoomId: "room:shared",
  runtimeState: "bridge_active" as const,
  transportOwner: "room_media_bridge" as const,
  activeSpeakerParticipantId: "participant:owner",
  selfParticipantId: "participant:owner",
  selfRole: "owner" as const,
  peerAudioConnected: true,
};

describe("Shared Live Room floor lease renewal", () => {
  it("continues renewing while peer audio remains connected", () => {
    expect(shouldRenewSharedLiveRoomFloor(base)).toBe(true);
  });

  it("renews the owner floor on the direct host transport", () => {
    expect(shouldRenewSharedLiveRoomFloor({
      ...base,
      runtimeState: "host_transport_active",
      transportOwner: "host_browser",
      peerAudioConnected: false,
    })).toBe(true);
  });

  it("stops renewal when the bridge transport or floor identity is no longer current", () => {
    expect(shouldRenewSharedLiveRoomFloor({
      ...base,
      peerAudioConnected: false,
    })).toBe(false);
    expect(shouldRenewSharedLiveRoomFloor({
      ...base,
      activeSpeakerParticipantId: "participant:guest",
    })).toBe(false);
  });
});
