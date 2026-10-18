import React from "react";
import type {
  HelixLanguageModelProfileId,
  HelixPinnedLanguageModelId,
} from "@shared/helix-language-model-policy";

export type HelixAskLanguageModelPickerSelection =
  | { kind: "profile"; profile: HelixLanguageModelProfileId }
  | { kind: "pinned"; model: HelixPinnedLanguageModelId };

export type HelixAskLanguageModelPickerProps = {
  model: HelixAskLanguageModelPickerModel;
  menuOpen: boolean;
  onPrimaryClick: () => void;
  onSelect: (value: HelixAskLanguageModelPickerSelection) => void;
};

export type HelixAskLanguageModelPickerItem = {
  id: string;
  selection: HelixAskLanguageModelPickerSelection;
  label: string;
  shortLabel: string;
  description: string;
  selected: boolean;
};

export type HelixAskLanguageModelPickerModel = {
  selectedProfile: HelixLanguageModelProfileId;
  selectedPinnedModel: HelixPinnedLanguageModelId | null;
  selectedLabel: string;
  items: HelixAskLanguageModelPickerItem[];
};

const LANGUAGE_MODEL_PROFILE_ITEMS: Array<Omit<HelixAskLanguageModelPickerItem, "selected">> = [
  {
    id: "profile:auto",
    selection: { kind: "profile", profile: "auto" },
    label: "Auto",
    shortLabel: "AI Auto",
    description: "Let policy choose per turn",
  },
  {
    id: "profile:fast",
    selection: { kind: "profile", profile: "fast" },
    label: "Fast",
    shortLabel: "AI Fast",
    description: "Lower latency",
  },
  {
    id: "profile:balanced",
    selection: { kind: "profile", profile: "balanced" },
    label: "Balanced",
    shortLabel: "AI Bal",
    description: "General purpose",
  },
  {
    id: "profile:deep",
    selection: { kind: "profile", profile: "deep" },
    label: "Deep",
    shortLabel: "AI Deep",
    description: "Higher reasoning",
  },
  {
    id: "pinned:gpt-5.4-mini",
    selection: { kind: "pinned", model: "gpt-5.4-mini" },
    label: "GPT-5.4 mini",
    shortLabel: "AI 5.4 mini",
    description: "Lowest-cost supported Codex model",
  },
];

export function buildHelixAskLanguageModelPickerModel(
  args: {
    selectedProfile: HelixLanguageModelProfileId;
    selectedPinnedModel: HelixPinnedLanguageModelId | null;
  },
): HelixAskLanguageModelPickerModel {
  const items = LANGUAGE_MODEL_PROFILE_ITEMS.map((item) => ({
    ...item,
    selected: item.selection.kind === "pinned"
      ? item.selection.model === args.selectedPinnedModel
      : args.selectedPinnedModel === null && item.selection.profile === args.selectedProfile,
  }));
  const selected = items.find((item) => item.selected) ?? items[0];
  return {
    selectedProfile: args.selectedProfile,
    selectedPinnedModel: args.selectedPinnedModel,
    selectedLabel: selected.shortLabel,
    items,
  };
}

export function HelixAskLanguageModelPicker({
  model,
  menuOpen,
  onPrimaryClick,
  onSelect,
}: HelixAskLanguageModelPickerProps) {
  return (
    <>
      <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-language-model-picker.choose-ask-ai-mode"
        type="button"
        data-helix-ask-action-item="true"
        aria-label="Choose Ask AI mode"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Choose Ask AI mode"
        className="inline-flex h-10 shrink-0 snap-center items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100 transition hover:bg-emerald-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
        onClick={onPrimaryClick}
      >
        {model.selectedLabel}
      </button>
      {menuOpen ? (
        <div
          role="menu"
          aria-label="Ask AI mode"
          className="absolute right-24 top-12 z-30 min-w-48 rounded-lg border border-white/10 bg-slate-950/95 p-1.5 text-xs text-slate-100 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur"
        >
          {model.items.map((item) => (
            <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-language-model-picker.event-event-prevent-default-event-stop-propagation-on-select-item-select"
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={item.selected}
              className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 ${
                item.selected ? "bg-emerald-400/15 text-emerald-100" : "text-slate-100 hover:bg-white/10"
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelect(item.selection);
              }}
            >
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.12em]">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-slate-400">
                  {item.description}
                </span>
              </span>
              <span className="text-[9px] uppercase tracking-[0.14em] text-slate-400">
                {item.selection.kind === "pinned" ? "pin" : "ai"}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
