import {
  HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE,
  HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT,
} from "./HelixAskBackendEntrypointPolicy";

const readBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

export type HelixAskBackendEntrypointFailureProjection = {
  selected_final_answer: string;
  visible_final_answer: string;
  final_answer_source: "typed_failure";
  terminal_artifact_kind: "typed_failure";
  terminal_error_code: typeof HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE;
  ask_entrypoint_failure_code: string;
  blocked_projection_kind: string;
  first_broken_rail: string;
  repair_target: string;
};

export function resolveHelixAskBackendEntrypointFailureProjection(args: {
  source: Record<string, unknown>;
  debug?: Record<string, unknown> | null;
}): HelixAskBackendEntrypointFailureProjection | null {
  const askEntrypointRequired =
    readBoolean(args.source.ask_entrypoint_required) ??
    readBoolean(args.debug?.ask_entrypoint_required) ??
    false;
  const askEntrypointObserved =
    readBoolean(args.source.ask_entrypoint_observed) ??
    readBoolean(args.debug?.ask_entrypoint_observed);
  if (!askEntrypointRequired || askEntrypointObserved !== false) return null;
  return {
    selected_final_answer: HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT,
    visible_final_answer: HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT,
    final_answer_source: "typed_failure",
    terminal_artifact_kind: "typed_failure",
    terminal_error_code: HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE,
    ask_entrypoint_failure_code:
      typeof args.source.ask_entrypoint_failure_code === "string"
        ? args.source.ask_entrypoint_failure_code
        : typeof args.debug?.ask_entrypoint_failure_code === "string"
          ? args.debug.ask_entrypoint_failure_code
          : HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE,
    blocked_projection_kind:
      typeof args.source.blocked_projection_kind === "string"
        ? args.source.blocked_projection_kind
        : typeof args.debug?.blocked_projection_kind === "string"
          ? args.debug.blocked_projection_kind
          : "client_projection",
    first_broken_rail:
      typeof args.source.first_broken_rail === "string"
        ? args.source.first_broken_rail
        : typeof args.debug?.first_broken_rail === "string"
          ? args.debug.first_broken_rail
          : "backend_ask_entrypoint",
    repair_target:
      typeof args.source.repair_target === "string"
        ? args.source.repair_target
        : typeof args.debug?.repair_target === "string"
          ? args.debug.repair_target
          : "prompt_submit_entrypoint",
  };
}

export function applyHelixAskBackendEntrypointFailureProjection(args: {
  target: Record<string, unknown>;
  source: Record<string, unknown>;
  debug?: Record<string, unknown> | null;
}): boolean {
  const projection = resolveHelixAskBackendEntrypointFailureProjection({
    source: args.source,
    debug: args.debug,
  });
  if (!projection) return false;
  Object.assign(args.target, projection);
  return true;
}
