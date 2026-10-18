import React from "react";
import { createRoot } from "react-dom/client";
import { SharedLiveRoomSourceBindingsPanel } from "../../src/components/helix/ask-console/shared-live-room/SharedLiveRoomSourceBindingsPanel";

// Isolated rendered controls only. The test supplies normalized observation
// replies; no fixture identity or consent reaches a production service.
createRoot(document.getElementById("root")!).render(<SharedLiveRoomSourceBindingsPanel
  roomId="room:player-review-fixture" roomClosed={false} isOwner selfParticipantId="participant:player-review-fixture" />);
