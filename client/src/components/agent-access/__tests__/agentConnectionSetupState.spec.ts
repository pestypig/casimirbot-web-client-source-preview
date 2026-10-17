import { describe, expect, it } from "vitest";
import {
  AGENT_CONNECTION_SETUP_STORAGE_KEY,
  INITIAL_AGENT_CONNECTION_SETUP_STATE,
  agentConnectionSetupReducer,
  parsePersistedAgentConnectionSetup,
  persistableAgentConnectionSetup,
  restoreAgentConnectionSetup,
} from "../agentConnectionSetupState";

describe("agent connection setup state", () => {
  it("persists only a profile preference and viewed step", () => {
    const selected = agentConnectionSetupReducer(
      INITIAL_AGENT_CONNECTION_SETUP_STATE,
      { type: "choose", profile: "codex_app" },
    );
    const persisted = persistableAgentConnectionSetup({
      ...selected,
      explanationOpen: true,
      deviceCheckSkipped: true,
    });
    expect(persisted).toEqual({
      schema: AGENT_CONNECTION_SETUP_STORAGE_KEY,
      selected_profile: "codex_app",
      viewed_step: "account",
    });
    expect(JSON.stringify(persisted)).not.toMatch(/token|binding|client_session|thread/i);
  });

  it("restores preferences without treating optional local UI state as proof", () => {
    const restored = restoreAgentConnectionSetup(JSON.stringify({
      schema: AGENT_CONNECTION_SETUP_STORAGE_KEY,
      selected_profile: "standard_mcp",
      viewed_step: "check",
    }));
    expect(restored).toEqual({
      selectedProfile: "standard_mcp",
      viewedStep: "check",
      explanationOpen: false,
      deviceCheckSkipped: false,
    });
  });

  it("fails malformed, unknown, secret-bearing, and impossible state closed", () => {
    expect(parsePersistedAgentConnectionSetup({
      schema: AGENT_CONNECTION_SETUP_STORAGE_KEY,
      selected_profile: null,
      viewed_step: "ready",
    })).toBeNull();
    expect(parsePersistedAgentConnectionSetup({
      schema: AGENT_CONNECTION_SETUP_STORAGE_KEY,
      selected_profile: "codex_app",
      viewed_step: "ready",
      access_token: "secret",
    })).toBeNull();
    expect(restoreAgentConnectionSetup("not-json")).toBe(
      INITIAL_AGENT_CONNECTION_SETUP_STATE,
    );
  });

  it("supports bounded Back, Explain, Skip, and Reset transitions", () => {
    let state = agentConnectionSetupReducer(INITIAL_AGENT_CONNECTION_SETUP_STATE, {
      type: "choose",
      profile: "codex_app",
    });
    state = agentConnectionSetupReducer(state, { type: "toggle_explanation" });
    expect(state.explanationOpen).toBe(true);
    state = agentConnectionSetupReducer(state, { type: "skip_device_check" });
    expect(state.deviceCheckSkipped).toBe(true);
    state = agentConnectionSetupReducer(state, { type: "back" });
    expect(state).toMatchObject({ selectedProfile: null, viewedStep: "choose" });
    expect(agentConnectionSetupReducer(state, { type: "reset" })).toBe(
      INITIAL_AGENT_CONNECTION_SETUP_STATE,
    );
  });
});
