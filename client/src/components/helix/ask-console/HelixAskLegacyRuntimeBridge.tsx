import { HelixAskPill } from "@/components/helix/HelixAskPill";
import type { HelixAskConsoleProps } from "./HelixAskConsoleState";

export function HelixAskLegacyRuntimeBridge(props: HelixAskConsoleProps) {
  return <HelixAskPill {...props} />;
}
