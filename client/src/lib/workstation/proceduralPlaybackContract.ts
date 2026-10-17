export const HELIX_WORKSTATION_PROCEDURAL_STEP_EVENT = "helix:workstation:procedural-step";

export type HelixWorkstationProceduralStep =
  | "highlight_plus"
  | "open_picker"
  | "target_panel"
  | "close_picker"
  | "open_doc"
  | "read_start"
  | "open_note_panel"
  | "start_note"
  | "highlight_copy"
  | "paste_note"
  | "save_note"
  | "attach_note_to_chat"
  | "compare_topics_start";

export type HelixWorkstationProceduralStepPayload = {
  traceId: string;
  step: HelixWorkstationProceduralStep;
  groupId?: string;
  panelId?: string;
  docPath?: string;
  topic?: string;
};

export function emitHelixWorkstationProceduralStep(payload: HelixWorkstationProceduralStepPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(HELIX_WORKSTATION_PROCEDURAL_STEP_EVENT, {
      detail: payload,
    }),
  );
}
