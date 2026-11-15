import { describe, expect, it } from "vitest";
import { connectionFixture, tunnelFixture } from "../../../../../tests/fixtures/local-personal-connection";
import { projectConnectionHealth } from "../connectionHealth";
import { parseConnectionHealthMemory, shouldNotifyConnectionChange } from "../connectionHealthMemory";

const now = Date.parse("2026-10-16T18:00:00Z");
const client = () => ({...connectionFixture(), observed_at: new Date(now - 1000).toISOString(),
  heartbeat_expires_at: new Date(now + 20_000).toISOString()});
const binding = () => ({schema:"helix.reasoning_task_binding.v1",reasoning_binding_id:"binding:fixture",pairing_id:"pairing:fixture",
  binding_epoch:1,status:"active",service_instance_ref:"fixture-service",authenticated_profile_ref:"fixture-profile",
  authenticated_mcp_client_ref:"fixture-client",client_session_ref:"fixture-session",provider_thread_ref_hash:"a".repeat(64),
  helix_conversation_id:"chat-fixture",mission_id:null,run_id:null,reasoning_role:"principal",continuation_transport:"polling",
  negotiated_observability_level:"tool_activity_only",created_by:"signed_in_operator",
  created_at:new Date(now-60_000).toISOString(),expires_at:new Date(now+60_000).toISOString(),
  claimed_at:new Date(now-50_000).toISOString(),revoked_at:null,provider_thread_content_included:false,
  hidden_reasoning_included:false,execution_authority:false,evidence_authority:false,answer_authority:false,terminal_eligible:false});
const pairing = () => ({schema:"helix.pairing_status.v1",id:"pairing:fixture",revision:1,destinationDigest:"b".repeat(64),
  chatId:"chat-fixture",environment:null,state:"accepted",createdAt:new Date(now-120_000).toISOString(),
  invitationExpiresAt:new Date(now-60_000).toISOString(),pairingExpiresAt:new Date(now+60_000).toISOString(),
  acceptedAt:new Date(now-50_000).toISOString(),revokedAt:null,executionAuthority:false,answerAuthority:false});
const inspect = (overrides: Record<string, unknown> = {}) => projectConnectionHealth({
  now, developer: true, signedIn: true, tunnel: tunnelFixture(), client: client(),
  packageState: {runningBuild:"release-main-r164",selectedBuild:"release-main-r164",pendingBuild:null},
  ...overrides,
});

describe("Connection Health first failure", () => {
  it("keeps owner Stop ahead of external recovery and never treats it as silent restart", () => {
    const tunnel = {...tunnelFixture(), status:"stopped", ready:false, healthy:false, processRunning:false,
      recovery:{...tunnelFixture().recovery,lastReason:"operator_stop"}};
    const health = inspect({tunnel});
    expect(health.blocker).toBe("operator_stop");
    expect(health.stopped).toBe(true);
    expect(health.panel).toBe("device-check");
  });
  it("does not equate local Ready with a matching Source or protected read", () => {
    expect(inspect({tunnel:null}).blocker).toBe("native_unverified");
    expect(inspect({client:null}).blocker).toBe("source_or_gateway");
    expect(inspect({client:{...client(),proof_basis:"none"}}).blocker).toBe("protected_read");
  });
  it("reports a failed local readiness read before making any Source or pairing inference", () => {
    const failed = inspect({client:null,readinessRead:"http_error",readinessHttpStatus:503});
    expect(failed.blocker).toBe("service_read");
    expect(failed.message).toContain("HTTP 503");
    expect(failed.panel).toBe("device-check");
    expect(inspect({client:null,readinessRead:"network_error"}).blocker).toBe("service_read");
    expect(inspect({client:null,readinessRead:"invalid_payload"}).blocker).toBe("service_read");
  });
  it("separates OAuth, catalog and package selection from transport", () => {
    expect(inspect({client:{...client(),readiness:{...client().readiness,client_authorization:"missing"}}}).blocker).toBe("oauth");
    expect(inspect({client:{...client(),catalog_reenumeration_required:true}}).blocker).toBe("catalog");
    const packageHealth = inspect({packageState:{runningBuild:"release-main-r164",selectedBuild:"release-main-r164",pendingBuild:"release-main-r165"}});
    expect(packageHealth.blocker).toBe("exact_task");
    expect(packageHealth.packageFreshness).toBe("pending");
    expect(inspect({packageState:{runningBuild:"release-main-r164",selectedBuild:"release-main-r165",pendingBuild:null}}).blocker).toBe("package");
  });
  it("does not demand a private developer tunnel from an ordinary account", () => {
    const health = inspect({developer:false,tunnel:null});
    expect(health.blocker).toBe("required_tool");
    expect(health.purpose).toBe("personal_mcp");
    expect(health.transport).toMatch(/external OAuth/);
  });
  it("uses the installed personal stdio checkpoints for an ordinary account", () => {
    const ordinary = {developer:false,route:"local_stdio",localStdioSupported:true,tunnel:null};
    expect(inspect({...ordinary,localStdio:{available:false,phase:"build_unavailable"}}).blocker).toBe("local_setup");
    const localStdio = {available:true,phase:"ready"};
    expect(inspect({...ordinary,localStdio,deviceApproval:{phase:"not_approved"}}).blocker).toBe("device_approval");
    for (const deviceApproval of [null, {phase:"busy"}, {phase:"unavailable"}]) {
      const unresolved = inspect({...ordinary,localStdio,deviceApproval});
      expect(unresolved.blocker).toBe("native_unverified");
      expect(unresolved.actor).toBe("native_supervisor");
      expect(unresolved.protectedRead).toBe("current");
      expect(unresolved.message).toContain("protected Codex check-in is current");
      expect(unresolved.message).toContain("separate computer approval read did not complete");
      expect(unresolved.message).not.toContain("not been approved");
      expect(unresolved.workingIdentity).toBeNull();
    }
    const missingClient = inspect({...ordinary,localStdio,deviceApproval:{phase:"approved"},client:null});
    expect(missingClient.blocker).toBe("local_client");
    expect(missingClient.message).toContain("Reconnect Codex");
    expect(missingClient.message).toContain("saved grant");
    const current = inspect({...ordinary,localStdio,deviceApproval:{phase:"approved"}});
    expect(current.blocker).toBe("required_tool");
    expect(current.transport).toBe("local stdio (ready)");
    expect(current.workingIdentity).toBeTruthy();
    expect(inspect({...ordinary,localStdio,deviceApproval:{phase:"not_approved"}}).workingIdentity).toBeNull();
    expect(inspect({...ordinary,localStdio,deviceApproval:{phase:"approved"},
      client:{...client(),readiness:{...client().readiness,client_authorization:"missing"}}}).blocker).toBe("local_client");
  });
  it("allows an ordinary profile to inspect an explicitly selected pairing", () => {
    const health = inspect({developer:false,purpose:"paired_task",route:"local_stdio",localStdioSupported:true,
      localStdio:{available:true,phase:"ready"},deviceApproval:{phase:"approved"}});
    expect(health.purpose).toBe("paired_task");
    expect(health.blocker).toBe("exact_task");
  });
  it("treats an idle personal task as unverified, not a revoked local grant", () => {
    const ordinary = {developer:false,route:"local_stdio" as const,localStdioSupported:true,
      tunnel:null,localStdio:{available:true,phase:"ready"},deviceApproval:{phase:"approved"}};
    const idle = inspect({...ordinary,client:{...client(),proof_basis:"none",
      authenticated_mcp_client_ref:null,client_session_ref:null,
      observed_at:null,heartbeat_expires_at:null,
      readiness:{...client().readiness,client_presence:"offline",client_authorization:"missing"}}});
    expect(idle.blocker).toBe("protected_read");
    expect(idle.message).toContain("not disproven");
    expect(idle.workingIdentity).toBeNull();
    expect(shouldNotifyConnectionChange({health:idle,memory:{
      schema:"casimirbot.connection_health.v1",profileHash:"a".repeat(64),
      identityHash:"b".repeat(64),verifiedAt:new Date(now-1_000).toISOString(),
      packageBuild:null,lastNotice:null,
    },now,optedIn:true})).toBe(false);
  });
  it("keeps the developer external OAuth route separate from its private tunnel", () => {
    const health = inspect({route:"external_oauth",tunnel:null});
    expect(health.route).toBe("external_oauth");
    expect(health.blocker).toBe("exact_task");
    expect(health.packageFreshness).toBe("unknown");
  });
  it("does not promote account-level presence to an exact task receipt", () => {
    expect(inspect().blocker).toBe("exact_task");
    const exact = {client:{...client(),conversation_thread_ref:"task-fixture"},binding:binding(),pairing:pairing(),
      activeChatId:"chat-fixture",taskRefHash:"a".repeat(64)};
    expect(inspect(exact).blocker).toBe("none");
    expect(inspect(exact).runtimeBinding).toBe("active");
    expect(inspect(exact).message).toContain("exact pairing and runtime binding are current");
    expect(inspect({...exact,registrations:[]}).registration).toBe("not_listed");
    expect(inspect({...exact,registrations:[]}).blocker).toBe("none");
    expect(inspect({...exact,taskRefHash:"c".repeat(64)}).blocker).toBe("exact_task");
    expect(inspect({...exact,pairing:{...pairing(),state:"revoked"}}).blocker).toBe("pairing");
    expect(inspect({...exact,binding:{...binding(),status:"revoked"}}).blocker).toBe("runtime_binding");
  });
  it("expires protected evidence and persists no raw identity in the projected fingerprint", () => {
    expect(inspect({now:now+40_000}).protectedRead).toBe("missing");
    expect(inspect().workingIdentity).toBeNull();
    expect(inspect({purpose:"personal_mcp"}).workingIdentity).toContain("[");
  });
});

describe("Connection Health notification memory", () => {
  const digest = "a".repeat(64);
  const memory = {schema:"casimirbot.connection_health.v1",profileHash:digest,identityHash:digest,
    verifiedAt:new Date(now-60_000).toISOString(),packageBuild:"release-main-r164",lastNotice:null};
  it("accepts only safe hashes and build labels", () => {
    expect(parseConnectionHealthMemory(memory)?.identityHash).toBe(digest);
    expect(parseConnectionHealthMemory({...memory,identityHash:"Bearer secret"})).toBeNull();
    expect(parseConnectionHealthMemory({...memory,endpoint:"https://private.example"})).toBeNull();
  });
  it("is opt-in, quiet on Stop, deduped and bounded by last healthy time", () => {
    const health = inspect({client:null});
    expect(shouldNotifyConnectionChange({health,memory:memory as any,now,optedIn:false})).toBe(false);
    expect(shouldNotifyConnectionChange({health,memory:memory as any,now,optedIn:true})).toBe(true);
    expect(shouldNotifyConnectionChange({health,memory:{...memory,lastNotice:{blocker:health.blocker,at:new Date(now-1000).toISOString()}} as any,now,optedIn:true})).toBe(false);
    expect(shouldNotifyConnectionChange({health:inspect({tunnel:{...tunnelFixture(),status:"stopped",ready:false,healthy:false,processRunning:false,recovery:{...tunnelFixture().recovery,lastReason:"operator_stop"}}}),memory:memory as any,now,optedIn:true})).toBe(false);
    expect(shouldNotifyConnectionChange({health,memory:{...memory,verifiedAt:new Date(now-8*24*60*60_000).toISOString()} as any,now,optedIn:true})).toBe(false);
  });
});
