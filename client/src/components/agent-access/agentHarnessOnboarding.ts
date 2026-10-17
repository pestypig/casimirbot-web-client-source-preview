import type { HelixAgentConnectionStatus } from "@shared/helix-agent-client-profile";
import type { DesktopMcpTunnelState } from "@shared/desktop-mcp-tunnel";
import type { BrowserReasoningBinding } from "@/lib/agent-access/reasoningTaskBinding";
import type { AgentConnectionSetupStep } from "./agentConnectionSetupState";

export const AGENT_HARNESS_ONBOARDING_PHASES = [
  "idle",
  "starting_native_harness",
  "checking_readiness",
  "ready",
  "action_required",
] as const;

export type AgentHarnessOnboardingPhase =
  (typeof AGENT_HARNESS_ONBOARDING_PHASES)[number];

export type AgentHarnessOnboardingDiagnostic = Readonly<{
  schema: "helix.agent_harness_onboarding_diagnostic.v1";
  generated_at: string;
  onboarding_phase: AgentHarnessOnboardingPhase;
  setup_step: AgentConnectionSetupStep;
  selected_client_profile: "codex_app" | "standard_mcp" | null;
  native_desktop_available: boolean;
  readiness: null | Readonly<{
    status: HelixAgentConnectionStatus["readiness"]["status"];
    proof_basis: HelixAgentConnectionStatus["proof_basis"];
    provider_application: HelixAgentConnectionStatus["readiness"]["provider_application"];
    client_authorization: HelixAgentConnectionStatus["readiness"]["client_authorization"];
    client_presence: HelixAgentConnectionStatus["readiness"]["client_presence"];
    catalog_sync: HelixAgentConnectionStatus["readiness"]["catalog_sync"];
    thread_attachment: HelixAgentConnectionStatus["readiness"]["thread_attachment"];
    continuation_readiness: HelixAgentConnectionStatus["readiness"]["continuation_readiness"];
    catalog_reenumeration_required: boolean;
    recovery_action: HelixAgentConnectionStatus["readiness"]["recovery_action"];
  }>;
  native_tunnel: null | Readonly<{
    status: DesktopMcpTunnelState["status"];
    scope: DesktopMcpTunnelState["scope"];
    configured: boolean;
    process_running: boolean;
    healthy: boolean;
    ready: boolean;
    failure_code: DesktopMcpTunnelState["failureCode"];
    recovery_phase: DesktopMcpTunnelState["recovery"]["phase"];
    recovery_attempt_count: number;
    recovery_max_attempts: number;
    manual_intervention_required: boolean;
  }>;
  reasoning_binding: null | Readonly<{
    status: BrowserReasoningBinding["status"];
    binding_epoch: number;
    continuation_transport: BrowserReasoningBinding["continuation_transport"];
  }>;
  provider_task_created: false;
  codex_ui_automation_used: false;
  credential_included: false;
  provider_thread_content_included: false;
  hidden_reasoning_included: false;
  answer_authority: false;
  terminal_eligible: false;
}>;

export const buildAgentHarnessOnboardingDiagnostic = (input: Readonly<{
  generatedAt?: Date;
  onboardingPhase: AgentHarnessOnboardingPhase;
  setupStep: AgentConnectionSetupStep;
  selectedClientProfile: "codex_app" | "standard_mcp" | null;
  nativeDesktopAvailable: boolean;
  status: HelixAgentConnectionStatus | null;
  tunnel: DesktopMcpTunnelState | null;
  reasoningBinding: BrowserReasoningBinding | null;
}>): AgentHarnessOnboardingDiagnostic => Object.freeze({
  schema: "helix.agent_harness_onboarding_diagnostic.v1",
  generated_at: (input.generatedAt ?? new Date()).toISOString(),
  onboarding_phase: input.onboardingPhase,
  setup_step: input.setupStep,
  selected_client_profile: input.selectedClientProfile,
  native_desktop_available: input.nativeDesktopAvailable,
  readiness: input.status ? Object.freeze({
    status: input.status.readiness.status,
    proof_basis: input.status.proof_basis,
    provider_application: input.status.readiness.provider_application,
    client_authorization: input.status.readiness.client_authorization,
    client_presence: input.status.readiness.client_presence,
    catalog_sync: input.status.readiness.catalog_sync,
    thread_attachment: input.status.readiness.thread_attachment,
    continuation_readiness: input.status.readiness.continuation_readiness,
    catalog_reenumeration_required: input.status.catalog_reenumeration_required,
    recovery_action: input.status.readiness.recovery_action,
  }) : null,
  native_tunnel: input.tunnel ? Object.freeze({
    status: input.tunnel.status,
    scope: input.tunnel.scope,
    configured: input.tunnel.configured,
    process_running: input.tunnel.processRunning,
    healthy: input.tunnel.healthy,
    ready: input.tunnel.ready,
    failure_code: input.tunnel.failureCode,
    recovery_phase: input.tunnel.recovery.phase,
    recovery_attempt_count: input.tunnel.recovery.attemptCount,
    recovery_max_attempts: input.tunnel.recovery.maxAttempts,
    manual_intervention_required: input.tunnel.recovery.manualInterventionRequired,
  }) : null,
  reasoning_binding: input.reasoningBinding ? Object.freeze({
    status: input.reasoningBinding.status,
    binding_epoch: input.reasoningBinding.binding_epoch,
    continuation_transport: input.reasoningBinding.continuation_transport,
  }) : null,
  provider_task_created: false,
  codex_ui_automation_used: false,
  credential_included: false,
  provider_thread_content_included: false,
  hidden_reasoning_included: false,
  answer_authority: false,
  terminal_eligible: false,
});
