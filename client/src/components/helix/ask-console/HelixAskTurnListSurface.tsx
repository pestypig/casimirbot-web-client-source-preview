import {
  forwardRef,
  type Ref,
} from "react";

import {
  HelixAskTurnList,
  type HelixAskTurnListProps,
} from "./HelixAskTurnList";
import {
  HelixAskActiveTurnReplySurface,
  type HelixAskActiveTurnReplySurfaceProps,
} from "./HelixAskActiveTurnReplySurface";

export type HelixAskTurnListSurfaceProps = HelixAskTurnListProps & {
  visible?: boolean;
  activeTurnStreamReply?: HelixAskActiveTurnReplySurfaceProps | null;
};

export const HelixAskTurnListSurface = forwardRef<HTMLDivElement, HelixAskTurnListSurfaceProps>(
  function HelixAskTurnListSurface(
    {
      visible = true,
      activeTurnStreamReply = null,
      activeTurnStreamPanel,
      ...props
    },
    ref: Ref<HTMLDivElement>,
  ) {
    if (!visible) return null;
    const resolvedActiveTurnStreamPanel =
      activeTurnStreamPanel ??
      (activeTurnStreamReply ? <HelixAskActiveTurnReplySurface {...activeTurnStreamReply} /> : null);

    return (
      <HelixAskTurnList
        {...props}
        ref={ref}
        activeTurnStreamPanel={resolvedActiveTurnStreamPanel}
      />
    );
  },
);
