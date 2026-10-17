export type PanelControlAction =
  | { type: "OPEN_TRACE" }
  | { type: "CLOSE_TRACE" }
  | { type: "OPEN_MEMORY" }
  | { type: "CLOSE_MEMORY" }
  | { type: "OPEN_INFERENCES" }
  | { type: "CLOSE_INFERENCES" }
  | { type: "TOGGLE_INFERENCES_STATELESS"; payload: boolean }
  | { type: "OPEN_BADGES" }
  | { type: "CLOSE_BADGES" }
  | { type: "OPEN_PANELS" }
  | { type: "CLOSE_PANELS" }
  | { type: "OPEN_BUDGET" }
  | { type: "CLOSE_BUDGET" };
