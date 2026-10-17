import React, { type ReactNode } from "react";
import { requestWorkstationGuidance } from "@/lib/workstation/workstationGuidance";
import type {
  HelixAskComposerDestinationKind,
  HelixAskComposerDestinationModel,
} from "./HelixAskComposerDestination";

export type HelixAskComposerDestinationStripProps = {
  model: HelixAskComposerDestinationModel;
  onDestinationChange: (kind: HelixAskComposerDestinationKind) => void;
  roomScope?: { roomId: string | null };
  onOpenConnectionSetup?: () => void;
  externalBindingUnavailable?: boolean;
  showSelector?: boolean;
  voiceStatus?: ReactNode;
};

const destinationStatus = (model: HelixAskComposerDestinationModel) => {
  if (model.kind === "operator_note") return model.deliveryState === "saved" ? "Saved locally" : "Local only";
  if (model.kind === "bound_agent") return model.deliveryState === "unavailable" ? "Needs task binding" :
    model.deliveryState === "awaiting_agent_pickup" ? "Awaiting task pickup" : "Ready to queue";
  return model.deliveryState === "queued" ? "Ask queued" : `${model.destinationLabel} ready`;
};

/** Compact send-target control. Chat navigation belongs to the Console, not the pill. */
export function HelixAskComposerDestinationStrip({
  model,
  onDestinationChange,
  roomScope,
  onOpenConnectionSetup,
  showSelector = true,
  voiceStatus = null,
}: HelixAskComposerDestinationStripProps) {
  const bindingNeeded = model.kind === "bound_agent" && model.deliveryState === "unavailable";
  const openSetup = () => {
    requestWorkstationGuidance({ kind: "user_attention", panelId: "agent-access",
      targetId: "external-ai-connection-setup", label: "Review the exact-task connection and binding.", durationMs: 12000 });
    onOpenConnectionSetup?.();
  };
  return <div className="flex min-w-0 flex-nowrap items-center gap-2 text-[11px]"
    data-provider-delivery-claimed={String(model.providerDeliveryClaimed)}>
    {showSelector ? <label className="flex min-w-0 items-center gap-2 text-slate-400">
      <span className="shrink-0">Send to</span>
      <select aria-label="Composer destination" name="helix-composer-destination"
        title="Each destination keeps its own unsent draft"
        className="max-w-44 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-semibold text-slate-100"
        value={model.kind}
        onChange={event => onDestinationChange(event.currentTarget.value as HelixAskComposerDestinationKind)}>
        <option value="helix_ask">Ask Helix</option>
        <option value="bound_agent">Message Codex</option>
        <option value="operator_note">Workspace note</option>
      </select>
    </label> : null}
    <span role="status" aria-live="polite" className={`shrink-0 whitespace-nowrap ${bindingNeeded ? "text-amber-200" : "text-slate-400"}`}
      title={`${model.transportLabel} · ${model.actionLabel}`}>
      {destinationStatus(model)}
    </span>
    {bindingNeeded && onOpenConnectionSetup ? <button type="button" onClick={openSetup}
      className="shrink-0 whitespace-nowrap rounded border border-cyan-700 px-2 py-1 text-cyan-100">Set up task</button> : null}
    {voiceStatus}
    <span className="sr-only">
      {model.transportLabel}. Action: {model.actionLabel}.
      {model.kind === "helix_ask" && roomScope?.roomId ? " An open room does not receive this private Ask turn." : ""}
    </span>
  </div>;
}
