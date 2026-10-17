import { describe, expect, it } from "vitest";
import { buildHelixAgentClientReadiness } from "@shared/helix-agent-client-readiness";
import type { HelixAgentConnectionStatus } from "@shared/helix-agent-client-profile";
import type { DesktopMcpTunnelState } from "@shared/desktop-mcp-tunnel";
import { buildAgentHarnessOnboardingDiagnostic } from "../agentHarnessOnboarding";

describe("agent harness onboarding diagnostics", () => {
  it("exports bounded readiness facts without opaque refs, credentials, or provider content", () => {
    const readiness = buildHelixAgentClientReadiness({
      agentSelected: true,
      provider_application: "available",
      client_authorization: "active",
      client_presence: "online",
      catalog_sync: "stale",
      thread_attachment: "stale",
      continuation_readiness: "polling",
      environment_readiness: "not_selected",
    });
    const status = {
      readiness,
      proof_basis: "authenticated_presence_tool",
      catalog_reenumeration_required: true,
      authenticated_profile_ref: "secret-profile-ref",
      authenticated_mcp_client_ref: "secret-client-ref",
      conversation_thread_ref: "secret-thread-ref",
    } as HelixAgentConnectionStatus;
    const tunnel = {
      status: "degraded",
      scope: "local_supervisor_coordination_and_device_check",
      configured: true,
      processRunning: true,
      healthy: false,
      ready: false,
      failureCode: "health_failed",
      recovery: {
        phase: "exhausted",
        attemptCount: 3,
        maxAttempts: 3,
        manualInterventionRequired: true,
      },
    } as DesktopMcpTunnelState;

    const diagnostic = buildAgentHarnessOnboardingDiagnostic({
      generatedAt: new Date("2026-09-03T00:00:00.000Z"),
      onboardingPhase: "action_required",
      setupStep: "check",
      selectedClientProfile: "codex_app",
      nativeDesktopAvailable: true,
      status,
      tunnel,
      reasoningBinding: {
        reasoning_binding_id: "secret-binding-ref",
        helix_conversation_id: "secret-conversation-ref",
        status: "revoked",
        continuation_transport: "polling",
        binding_epoch: 2,
      },
    });

    expect(diagnostic.native_tunnel).toMatchObject({
      recovery_phase: "exhausted",
      recovery_attempt_count: 3,
      recovery_max_attempts: 3,
      manual_intervention_required: true,
    });
    expect(diagnostic.reasoning_binding).toEqual({
      status: "revoked",
      binding_epoch: 2,
      continuation_transport: "polling",
    });
    expect(diagnostic).toMatchObject({
      provider_task_created: false,
      codex_ui_automation_used: false,
      credential_included: false,
      hidden_reasoning_included: false,
      answer_authority: false,
      terminal_eligible: false,
    });
    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain("secret-");
    expect(serialized).not.toContain("authenticated_profile_ref");
    expect(serialized).not.toContain("reasoning_binding_id");
  });
});
