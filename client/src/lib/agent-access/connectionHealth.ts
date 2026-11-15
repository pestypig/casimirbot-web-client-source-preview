import { parseDesktopMcpTunnelState } from "@shared/desktop-mcp-tunnel";
import { helixAgentConnectionStatusSchema } from "@shared/helix-agent-client-profile";
import { helixReasoningTaskBindingProjectionSchema } from "@shared/helix-reasoning-task-binding";
import { pairingStatusSchema, type RegisteredPairingDestination } from "./durablePairing";

export type ConnectionHealthBlocker =
  | "sign_in" | "native_unverified" | "native_setup" | "operator_stop" | "native_transition"
  | "local_setup" | "device_approval" | "local_client"
  | "service_read" | "source_or_gateway" | "oauth" | "protected_read" | "catalog"
  | "package" | "required_tool" | "exact_task" | "pairing" | "runtime_binding" | "none";
export type ConnectionHealthAction = "account-session" | "device-check" | "agent-access" | "desktop-updates";
export type ConnectionHealthRoute = "private_tunnel" | "external_oauth" | "local_stdio";
export type ConnectionHealthPurpose = "personal_mcp" | "paired_task";
export type ConnectionHealth = Readonly<{
  route: ConnectionHealthRoute;
  purpose: ConnectionHealthPurpose;
  blocker: ConnectionHealthBlocker;
  actor: "owner" | "external_client" | "native_supervisor" | "none";
  panel: ConnectionHealthAction;
  message: string;
  completion: string;
  transport: string;
  protectedRead: "current" | "missing" | "unknown";
  exactTaskRead: "verified" | "unverified";
  exactTaskReason: "chat_not_selected" | "presence_missing" | "binding_unavailable" |
    "chat_mismatch" | "client_mismatch" | "task_mismatch" | "matched";
  pairing: "accepted" | "inactive" | "unknown";
  runtimeBinding: "active" | "inactive" | "unknown";
  registration: "current" | "not_listed" | "unknown";
  catalog: "current" | "stale" | "unknown";
  packageBuild: string | null;
  packagePending: string | null;
  packageFreshness: "current_selected" | "pending" | "mismatch" | "unknown";
  observedAt: string;
  expiresAt: string;
  /** Only opaque IDs supplied by a fresh authenticated protected read. Never persist this string. */
  workingIdentity: string | null;
  stopped: boolean;
}>;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const build = (value: unknown): string | null => typeof value === "string" &&
  /^release-[a-z0-9][a-z0-9.-]*$/i.test(value) ? value : null;
const localPhase = (value: unknown): string | null => {
  const state = record(value);
  return typeof state?.phase === "string" &&
    ["ready", "build_unavailable", "codex_unavailable", "website_unavailable", "unavailable"].includes(state.phase)
    ? state.phase : null;
};

/** A status projection, never an authority grant. A native Ready state cannot
 * prove the external Source, OAuth, or a protected read from an exact task. */
export function projectConnectionHealth(input: {
  now: number; developer: boolean; signedIn: boolean; tunnel?: unknown;
  readinessRead?: "ok" | "http_error" | "network_error" | "invalid_payload";
  readinessHttpStatus?: number | null;
  localStdioSupported?: boolean; localStdio?: unknown; deviceApproval?: unknown;
  client?: unknown; packageState?: unknown; binding?: unknown; pairing?: unknown;
  registrations?: readonly RegisteredPairingDestination[] | null;
  activeChatId?: string | null; taskRefHash?: string | null; route?: ConnectionHealthRoute;
  purpose?: ConnectionHealthPurpose;
}): ConnectionHealth {
  const route: ConnectionHealthRoute = input.developer
    ? input.route === "external_oauth" || input.route === "local_stdio" ? input.route : "private_tunnel"
    : input.route === "external_oauth" ? "external_oauth"
      : input.route === "local_stdio" || input.localStdioSupported ? "local_stdio" : "external_oauth";
  const purpose: ConnectionHealthPurpose = input.purpose ?? (input.developer ? "paired_task" : "personal_mcp");
  const usesTunnel = route === "private_tunnel";
  const usesLocalStdio = route === "local_stdio";
  const tunnel = parseDesktopMcpTunnelState(input.tunnel);
  const personalPhase = localPhase(input.localStdio);
  const personalAvailable = record(input.localStdio)?.available === true && personalPhase === "ready";
  const approvalPhase = record(input.deviceApproval)?.phase;
  const parsed = helixAgentConnectionStatusSchema.safeParse(input.client);
  const client = parsed.success ? parsed.data : null;
  const pkg = record(input.packageState);
  const running = usesTunnel ? build(pkg?.runningBuild) : null;
  const selected = usesTunnel ? build(pkg?.selectedBuild) : null;
  const pending = usesTunnel ? build(pkg?.pendingBuild) : null;
  const packageFreshness = !running || !selected ? "unknown" : running !== selected ? "mismatch" : pending ? "pending" : "current_selected";
  const currentRead = Boolean(client && client.selected_client_profile === "codex_app" &&
    client.proof_basis === "authenticated_presence_tool" &&
    client.readiness.client_authorization === "active" &&
    client.readiness.client_presence === "online" &&
    !client.authorization_changed_after_presence && client.authenticated_mcp_client_ref &&
    client.observed_at && Date.parse(client.observed_at) <= input.now &&
    input.now - Date.parse(client.observed_at) <= 30_000 &&
    client.heartbeat_expires_at && Date.parse(client.heartbeat_expires_at) > input.now);
  const parsedBinding = helixReasoningTaskBindingProjectionSchema.safeParse(input.binding);
  const binding = parsedBinding.success ? parsedBinding.data : null;
  const parsedPairing = pairingStatusSchema.safeParse(input.pairing);
  const pairing = parsedPairing.success ? parsedPairing.data : null;
  const exactTaskReason: ConnectionHealth["exactTaskReason"] = !input.activeChatId ? "chat_not_selected"
    : !currentRead || !client ? "presence_missing"
      : !binding ? "binding_unavailable"
        : binding.helix_conversation_id !== input.activeChatId ? "chat_mismatch"
          : binding.authenticated_profile_ref !== client.authenticated_profile_ref ||
            binding.service_instance_ref !== client.service_instance_ref ||
            binding.authenticated_mcp_client_ref !== client.authenticated_mcp_client_ref ||
            binding.client_session_ref !== client.client_session_ref ? "client_mismatch"
            : !client.conversation_thread_ref || binding.provider_thread_ref_hash !== input.taskRefHash
              ? "task_mismatch" : "matched";
  const sameTask = exactTaskReason === "matched";
  const pairingCurrent = Boolean(sameTask && pairing && binding?.pairing_id === pairing.id &&
    pairing.chatId === input.activeChatId && pairing.state === "accepted" &&
    pairing.acceptedAt && Date.parse(pairing.pairingExpiresAt) > input.now);
  const bindingCurrent = Boolean(pairingCurrent && binding?.status === "active" &&
    Date.parse(binding.expires_at) > input.now);
  const registration = !client?.conversation_thread_ref || !input.registrations ? "unknown" :
    input.registrations.some(item => item.destination.profileId === client.authenticated_profile_ref &&
      item.destination.clientId === client.authenticated_mcp_client_ref &&
      item.destination.taskId === client.conversation_thread_ref && Date.parse(item.expiresAt) > input.now &&
      (!pairing || item.destinationDigest === pairing.destinationDigest)) ? "current" : "not_listed";
  const protectedRead = currentRead ? "current" : client ? "missing" : "unknown";
  const catalog = !currentRead ? "unknown" :
    client!.catalog_reenumeration_required || client!.readiness.catalog_sync !== "current" ? "stale" : "current";
  const transport = usesTunnel ? tunnel?.status ?? "unknown"
    : usesLocalStdio ? `local stdio (${personalPhase ?? "unknown"})` : "external OAuth connection";
  const stopped = usesTunnel && tunnel?.status === "stopped" && tunnel.recovery.lastReason === "operator_stop";
  const base = { route, purpose, transport, protectedRead, exactTaskRead: sameTask ? "verified" : "unverified", exactTaskReason,
    pairing: pairingCurrent ? "accepted" : pairing ? "inactive" : "unknown",
    runtimeBinding: bindingCurrent ? "active" : binding ? "inactive" : "unknown",
    registration,
    catalog, packageBuild: running, packagePending: pending,
    packageFreshness, observedAt: new Date(input.now).toISOString(),
    expiresAt: new Date(Math.min(input.now + 30_000,
      currentRead ? Date.parse(client!.heartbeat_expires_at!) : input.now + 30_000)).toISOString(),
    workingIdentity: currentRead && catalog === "current" &&
      (!usesTunnel || (tunnel?.status === "ready" && tunnel.ready && tunnel.scope === "full_helix_agent")) &&
      (!usesLocalStdio || (personalAvailable && approvalPhase === "approved")) &&
      (purpose === "personal_mcp" || bindingCurrent) &&
      client!.authenticated_mcp_client_ref
      ? JSON.stringify([client!.authenticated_profile_ref, client!.service_instance_ref,
        client!.authenticated_mcp_client_ref, route, purpose, purpose === "paired_task" ? binding!.pairing_id : null,
        usesTunnel ? running : null]) : null,
    stopped } as const;
  const result = (blocker: ConnectionHealthBlocker, actor: ConnectionHealth["actor"], panel: ConnectionHealthAction,
    message: string, completion: string): ConnectionHealth => ({...base, blocker, actor, panel, message, completion});
  if (!input.signedIn) return result("sign_in", "owner", "account-session", "Sign in to inspect this account's connection.", "Current account session.");
  if (usesLocalStdio && !personalPhase)
    return result("local_setup", "native_supervisor", "account-session", "Installed personal Codex setup availability could not be verified.", "A fresh read-only native setup inspection is available.");
  if (usesLocalStdio && !personalAvailable)
    return result("local_setup", "owner", "account-session", `Personal Codex setup is ${(personalPhase ?? "unavailable").replaceAll("_", " ")}. Review the installed Account & Sessions control.`, "Personal Codex setup reports ready on this installation.");
  if (usesLocalStdio && approvalPhase === "account_required")
    return result("sign_in", "owner", "account-session", "The native personal connection cannot verify the selected account. Sign in to the intended profile.", "Native account check succeeds for this installation.");
  if (usesLocalStdio && approvalPhase === "not_approved")
    return result("device_approval", "owner", "account-session", "This computer has not been approved for personal Codex access.", "Account & Sessions confirms this installation's separate computer approval.");
  if (usesLocalStdio && approvalPhase !== "approved")
    return result("native_unverified", "native_supervisor", "account-session",
      currentRead
        ? "A protected Codex check-in is current, but the separate computer approval read did not complete. Retry that read in Account & Sessions; do not start a new approval unless it reports not approved."
        : "The computer approval read did not complete. Retry the check in Account & Sessions; do not start a new approval unless it reports not approved.",
      "Current read-only computer approval check reports approved or not approved.");
  if (usesTunnel && !tunnel)
    return result("native_unverified", "native_supervisor", "device-check", "Local tunnel status could not be verified.", "A fresh native tunnel state is available for this account.");
  if (usesTunnel && (tunnel?.status === "unconfigured" || tunnel?.status === "blocked"))
    return result("native_setup", "owner", "device-check", "Protected local tunnel setup needs attention.", "Native supervisor reports configured transport.");
  if (stopped) return result("operator_stop", "owner", "device-check", "The owner stopped the tunnel. It will stay stopped until an explicit start.", "Owner reviews scope and starts the existing tunnel.");
  if (usesTunnel && tunnel && (tunnel.status !== "ready" || !tunnel.ready || tunnel.scope !== "full_helix_agent"))
    return result("native_transition", "native_supervisor", "device-check", "Review the local tunnel state and current scope.", "Full developer tunnel reports Ready after an explicit transition.");
  if (input.readinessRead && input.readinessRead !== "ok") {
    const status = input.readinessRead === "http_error" && Number.isInteger(input.readinessHttpStatus) &&
      input.readinessHttpStatus! >= 400 && input.readinessHttpStatus! <= 599
      ? `HTTP ${input.readinessHttpStatus}` : input.readinessRead.replaceAll("_", " ");
    return result("service_read", "native_supervisor", "device-check",
      `The local account readiness check failed (${status}). Inspect this service before diagnosing the external Source or pairing.`,
      "A fresh, schema-valid account readiness response from this service.");
  }
  if (!client && usesLocalStdio) return result("local_client", "owner", "account-session", "Computer approval is current, but no personal Codex check-in has reached this app. After an app restart, use Reconnect Codex for the saved grant, then refresh Codex while leaving this app open. Request a new approval only if the app says it is required.", "One read-only call from that task reaches this service through its personal Codex entry.");
  if (!client) return result("source_or_gateway", "external_client", "agent-access", "Current authenticated client status is unavailable here. Check the matching Source in the exact task; a gateway 429 or 404 is a transport failure before pairing.", "One protected read from that exact task reaches this CasimirBot service.");
  if (usesLocalStdio && client.proof_basis === "none" &&
    client.readiness.client_presence === "offline")
    return result("protected_read", "external_client", "agent-access", "No recent personal Codex task check-in was observed. The saved approval and pairing are not disproven by an idle task; use one protected read from the exact task before reconnecting.", "A protected read from the exact task reaches this service.");
  if (client.readiness.client_authorization !== "active" || client.authorization_changed_after_presence)
    return usesLocalStdio
      ? result("local_client", "owner", "account-session", "Personal Codex authorization is not verified by this read. If this app restarted, use Reconnect Codex for the saved grant; refresh Codex while the app stays open. Request a new approval only if the app says it is required.", "Current grant verification and a read-only call from this exact task.")
      : result("oauth", "owner", "agent-access", "The selected Codex Source needs account authorization.", "The exact task completes OAuth and a fresh protected read.");
  if (!currentRead) return result("protected_read", "external_client", "agent-access", "Current authenticated client presence has not been observed. Source and gateway health remain unverified.", "Fresh protected client check-in; then verify the exact task separately.");
  if (catalog !== "current") return result("catalog", "external_client", "agent-access", usesLocalStdio
    ? "Restart Codex and inspect this task's personal CasimirBot MCP entry and tool catalog."
    : "The authenticated client catalog needs refresh in the same Source and task.", "Fresh catalog with the required tool listed and callable.");
  if (usesTunnel && packageFreshness === "mismatch")
    return result("package", "owner", "desktop-updates", "The running EXE differs from the private build selected by the launcher.", "Review the current running build and selected channel before an EXE handoff.");
  if (purpose === "personal_mcp")
    return result("required_tool", "external_client", "agent-access", "Client presence is current. The selected personal MCP tool has not been called and verified here.", "One admitted read-only tool call from the selected client returns a handler receipt; program permission remains separate.");
  if (!sameTask)
    return result("exact_task", "external_client", "agent-access", "Account-level protected presence is current; the selected Helix chat still lacks a matching fresh protected read from its exact Codex task.", "Protected tool call from that paired task reaches a CasimirBot handler with matching task and client identity.");
  if (!pairingCurrent)
    return result("pairing", "owner", "agent-access", "The exact task is present, but its owner-approved pairing is not currently verified.", "Existing pairing is accepted and unexpired for this Helix chat; inspect it before any new invitation.");
  if (!bindingCurrent)
    return result("runtime_binding", "native_supervisor", "agent-access", "The accepted pairing has no current matching runtime binding.", "Existing pairing's runtime binding is active for this exact task and chat.");
  return result("none", "none", "agent-access",
    "Transport, protected client presence, exact pairing and runtime binding are current. Verify each requested tool with its own handler receipt.",
    "Call the required tool from the exact task and inspect its handler receipt.");
}
