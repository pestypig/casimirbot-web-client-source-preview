import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARED_LIVE_ROOM_ICE_SERVERS,
  readSharedLiveRoomIceConfiguration,
} from "../RoomIceConfiguration";

describe("Shared Live Room ICE configuration", () => {
  it("accepts bounded STUN and TURN entries without projecting credentials", () => {
    const result = readSharedLiveRoomIceConfiguration(JSON.stringify([
      { urls: "stun:stun.example.test:3478" },
      {
        urls: [
          "turn:turn.example.test:3478?transport=udp",
          "turns:turn.example.test:5349?transport=tcp",
        ],
        username: "room-user",
        credential: "room-secret",
      },
    ]));
    expect(result).toEqual({
      source: "configured",
      error: null,
      iceServers: [
        { urls: "stun:stun.example.test:3478" },
        {
          urls: [
            "turn:turn.example.test:3478?transport=udp",
            "turns:turn.example.test:5349?transport=tcp",
          ],
          username: "room-user",
          credential: "room-secret",
        },
      ],
    });
    expect(JSON.stringify({
      source: result.source,
      error: result.error,
    })).not.toContain("room-secret");
  });

  it("fails closed to the default STUN server for malformed configuration", () => {
    expect(readSharedLiveRoomIceConfiguration('[{"urls":"https://not-ice"}]'))
      .toEqual({
        source: "default_stun",
        error: "ice_configuration_invalid",
        iceServers: DEFAULT_SHARED_LIVE_ROOM_ICE_SERVERS,
      });
    expect(readSharedLiveRoomIceConfiguration("not-json").error)
      .toBe("ice_configuration_invalid");
  });
});

