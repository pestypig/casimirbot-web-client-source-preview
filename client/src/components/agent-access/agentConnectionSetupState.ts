import type { HelixAgentClientProfileId } from "@shared/helix-agent-client-profile";

export const AGENT_CONNECTION_SETUP_STORAGE_KEY =
  "helix.agent_connection_setup.v1" as const;

export const connectionSetupGuidanceTarget = (profile: HelixAgentClientProfileId): string =>
  profile === "standard_mcp" ? "external-ai-connection-setup-standard-mcp" : "external-ai-connection-setup";
export const connectionSetupGuidanceProfile = (target: string | undefined): HelixAgentClientProfileId | null =>
  target === "external-ai-connection-setup" ? "codex_app"
    : target === "external-ai-connection-setup-standard-mcp" ? "standard_mcp" : null;

export const AGENT_CONNECTION_SETUP_STEPS = [
  "choose",
  "account",
  "authorize",
  "connect",
  "check",
  "ready",
] as const;

export type AgentConnectionSetupStep =
  (typeof AGENT_CONNECTION_SETUP_STEPS)[number];

export type AgentConnectionSetupState = Readonly<{
  selectedProfile: HelixAgentClientProfileId | null;
  viewedStep: AgentConnectionSetupStep;
  explanationOpen: boolean;
  deviceCheckSkipped: boolean;
}>;

export type PersistedAgentConnectionSetup = Readonly<{
  schema: typeof AGENT_CONNECTION_SETUP_STORAGE_KEY;
  selected_profile: HelixAgentClientProfileId | null;
  viewed_step: AgentConnectionSetupStep;
}>;

export const INITIAL_AGENT_CONNECTION_SETUP_STATE: AgentConnectionSetupState =
  Object.freeze({
    selectedProfile: null,
    viewedStep: "choose",
    explanationOpen: false,
    deviceCheckSkipped: false,
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const parsePersistedAgentConnectionSetup = (
  candidate: unknown,
): PersistedAgentConnectionSetup | null => {
  if (!isRecord(candidate)) return null;
  if (
    Object.keys(candidate).length !== 3 ||
    candidate.schema !== AGENT_CONNECTION_SETUP_STORAGE_KEY ||
    ![null, "codex_app", "standard_mcp"].includes(
      candidate.selected_profile as null | string,
    ) ||
    !AGENT_CONNECTION_SETUP_STEPS.includes(
      candidate.viewed_step as AgentConnectionSetupStep,
    )
  ) return null;
  if (candidate.selected_profile === null && candidate.viewed_step !== "choose") {
    return null;
  }
  return candidate as PersistedAgentConnectionSetup;
};

export const restoreAgentConnectionSetup = (
  serialized: string | null,
): AgentConnectionSetupState => {
  if (!serialized) return INITIAL_AGENT_CONNECTION_SETUP_STATE;
  try {
    const parsed = parsePersistedAgentConnectionSetup(JSON.parse(serialized));
    if (!parsed) return INITIAL_AGENT_CONNECTION_SETUP_STATE;
    return {
      selectedProfile: parsed.selected_profile,
      viewedStep: parsed.viewed_step,
      explanationOpen: false,
      deviceCheckSkipped: false,
    };
  } catch {
    return INITIAL_AGENT_CONNECTION_SETUP_STATE;
  }
};

export const persistableAgentConnectionSetup = (
  state: AgentConnectionSetupState,
): PersistedAgentConnectionSetup => ({
  schema: AGENT_CONNECTION_SETUP_STORAGE_KEY,
  selected_profile: state.selectedProfile,
  viewed_step: state.viewedStep,
});

export type AgentConnectionSetupAction =
  | { type: "choose"; profile: HelixAgentClientProfileId }
  | { type: "view"; step: AgentConnectionSetupStep }
  | { type: "back" }
  | { type: "toggle_explanation" }
  | { type: "skip_device_check" }
  | { type: "reset" };

export const agentConnectionSetupReducer = (
  state: AgentConnectionSetupState,
  action: AgentConnectionSetupAction,
): AgentConnectionSetupState => {
  switch (action.type) {
    case "choose":
      // Native attention can reselect the current app while transport is
      // limited or unavailable. That event is not evidence of a signed-out
      // account; only a fresh readiness response may reset verified progress.
      if (state.selectedProfile === action.profile) return state;
      return { ...state, selectedProfile: action.profile, viewedStep: "account", explanationOpen: false };
    case "view":
      if (!state.selectedProfile && action.step !== "choose") return state;
      return { ...state, viewedStep: action.step, explanationOpen: false };
    case "back": {
      const current = AGENT_CONNECTION_SETUP_STEPS.indexOf(state.viewedStep);
      const viewedStep = AGENT_CONNECTION_SETUP_STEPS[Math.max(0, current - 1)];
      return {
        ...state,
        selectedProfile: viewedStep === "choose" ? null : state.selectedProfile,
        viewedStep,
        explanationOpen: false,
      };
    }
    case "toggle_explanation":
      return { ...state, explanationOpen: !state.explanationOpen };
    case "skip_device_check":
      return { ...state, deviceCheckSkipped: true };
    case "reset":
      return INITIAL_AGENT_CONNECTION_SETUP_STATE;
  }
};
