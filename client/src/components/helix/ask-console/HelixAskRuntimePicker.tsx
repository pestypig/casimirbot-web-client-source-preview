import React from "react";
import type { HelixAgentRuntimeDescriptor, HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import { formatHelixAgentRuntimeShortLabel } from "@/lib/helix/ask-agent-runtime-display";

export type HelixAskRuntimePickerProps = {
  model: HelixAskRuntimePickerModel;
  menuOpen: boolean;
  onPrimaryClick: () => void;
  onSelect: (value: HelixAgentRuntimeId) => void;
};

export type HelixAskRuntimePickerItem = {
  id: HelixAgentRuntimeId;
  label: string;
  shortLabel: string;
  enabled: boolean;
  experimental: boolean;
  selected: boolean;
  statusLabel: "exp" | "off" | "on";
};

export type HelixAskRuntimePickerModel = {
  selectedRuntime: HelixAgentRuntimeId;
  selectedLabel: string;
  enabledProviderCount: number;
  primaryButtonMode: "cycle" | "menu";
  items: HelixAskRuntimePickerItem[];
};

export function buildHelixAskRuntimePickerModel(args: {
  selectedRuntime: HelixAgentRuntimeId;
  providers: readonly HelixAgentRuntimeDescriptor[];
}): HelixAskRuntimePickerModel {
  const fallbackProvider = args.providers.find((provider) => provider.id === args.selectedRuntime) ?? args.providers[0] ?? null;
  const selectedRuntime = fallbackProvider?.id ?? args.selectedRuntime;
  const items = args.providers.map((provider) => {
    const shortLabel = formatHelixAgentRuntimeShortLabel(provider);
    return {
      id: provider.id,
      label: provider.label,
      shortLabel,
      enabled: provider.enabled,
      experimental: provider.experimental === true,
      selected: provider.id === selectedRuntime,
      statusLabel: provider.enabled ? (provider.experimental ? "exp" : "on") : "off",
    };
  });
  const enabledProviderCount = items.filter((item) => item.enabled).length;
  return {
    selectedRuntime,
    selectedLabel: formatHelixAgentRuntimeShortLabel(fallbackProvider),
    enabledProviderCount,
    primaryButtonMode: enabledProviderCount <= 2 ? "cycle" : "menu",
    items,
  };
}

export function HelixAskRuntimePicker({
  model,
  menuOpen,
  onPrimaryClick,
  onSelect,
}: HelixAskRuntimePickerProps) {
  return (
    <>
      <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-runtime-picker.choose-ask-agent-runtime"
        type="button"
        data-helix-ask-action-item="true"
        aria-label="Choose Ask agent runtime"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Choose Ask agent runtime"
        className="inline-flex h-10 shrink-0 snap-center items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        onClick={onPrimaryClick}
      >
        {model.selectedLabel}
      </button>
      {menuOpen ? (
        <div
          role="menu"
          aria-label="Ask agent runtime"
          className="absolute right-10 top-12 z-30 min-w-52 rounded-lg border border-white/10 bg-slate-950/95 p-1.5 text-xs text-slate-100 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur"
        >
          {model.items.map((provider) => (
            <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-runtime-picker.event-event-prevent-default-event-stop-propagation-on-select-provider-id"
              key={provider.id}
              type="button"
              role="menuitemradio"
              aria-checked={provider.selected}
              disabled={!provider.enabled}
              className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
                provider.selected
                  ? "bg-cyan-400/15 text-cyan-100"
                  : provider.enabled
                    ? "text-slate-100 hover:bg-white/10"
                    : "cursor-not-allowed text-slate-500 opacity-70"
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelect(provider.id);
              }}
            >
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.12em]">
                  {provider.shortLabel}
                </span>
                <span className="mt-0.5 block text-[10px] text-slate-400">
                  {provider.label}
                </span>
              </span>
              <span className="text-[9px] uppercase tracking-[0.14em] text-slate-400">
                {provider.statusLabel}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
