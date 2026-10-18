import {
  HelixAskConsoleSupplementSurface,
  type HelixAskConsoleSupplementSurfaceProps,
} from "./HelixAskConsoleSupplementSurface";
import type { HelixAskLegacyComposerSurfaceProps } from "./HelixAskLegacyComposerSurface";
import { HelixConsoleSelectedComposer } from "./HelixConsoleSelectedComposer";
import type { HelixConsoleChannel } from "./HelixConsoleConversationWorkspace";
import type { LocalRoomTextOwnerSnapshot } from "./shared-live-room/LocalRoomTextOwnerBridge";
import type { HostedRoomTextOwnerSnapshot } from "./shared-live-room/NativeHostedRoomTextOwnerBridge";
import {
  HelixAskReasoningTheaterSurface,
  type HelixAskReasoningTheaterSurfaceProps,
} from "./HelixAskReasoningTheaterSurface";

export type HelixAskLegacySurfaceContentProps = {
  composer: HelixAskLegacyComposerSurfaceProps;
  supplement: HelixAskConsoleSupplementSurfaceProps;
  reasoningTheater: HelixAskReasoningTheaterSurfaceProps;
  selectedChannel?: HelixConsoleChannel;
  localRoom?: LocalRoomTextOwnerSnapshot | null;
  hostedRoom?: HostedRoomTextOwnerSnapshot | null;
  onSelectRoomAgent?: (source: "local" | "hosted") => void;
};

export function HelixAskLegacySurfaceContent({
  composer,
  supplement,
  reasoningTheater,
  selectedChannel = "private_ask",
  localRoom,
  hostedRoom,
  onSelectRoomAgent,
}: HelixAskLegacySurfaceContentProps) {
  return (
    <>
      <HelixConsoleSelectedComposer composer={composer} selectedChannel={selectedChannel}
        localRoom={localRoom} hostedRoom={hostedRoom} onSelectRoomAgent={onSelectRoomAgent} />
      {selectedChannel === "private_ask" || selectedChannel === "bound_task" ? <><HelixAskConsoleSupplementSurface {...supplement} />
        <HelixAskReasoningTheaterSurface {...reasoningTheater} /></> : null}
    </>
  );
}
