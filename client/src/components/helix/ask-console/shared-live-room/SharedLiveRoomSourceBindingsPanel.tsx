import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Copy,
  KeyRound,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unlink,
  UserRound,
  X,
} from "lucide-react";
import type {
  HelixRoomSourceBinding,
  HelixRoomSourceBindingReceipt,
  HelixRoomSourcePluginConfig,
} from "@shared/helix-room-source-ingress";
import type {
  HelixConnectorPairing,
  HelixConnectorPairingReceipt,
} from "@shared/helix-connector-pairing";
import type {
  HelixRoomEnvironmentProjection,
  HelixRoomEnvironmentsReceipt,
} from "@shared/helix-environment-subject";
import type {
  HelixEnvironmentCommandAuthority,
  HelixEnvironmentCommandAuthorityProfile,
  HelixEnvironmentCommandAuthorityReceipt,
  HelixEnvironmentCommandAutonomyMode,
  HelixEnvironmentCommandCategory,
  HelixEnvironmentCommandMemberGrant,
} from "@shared/helix-environment-command";
import type {
  HelixSharedRealtimeRoomParticipant,
} from "@shared/helix-shared-realtime-room";
import { SharedLiveRoomPlayerEmbodimentPanel, type PlayerAuthorityReviewDraft } from "./SharedLiveRoomPlayerEmbodimentPanel";
import { MinecraftLocalLifecycleCard } from "./MinecraftLocalLifecycleCard";

const sourceBindingsPath = (roomId: string): string =>
  `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/source-bindings`;
const credentialClaimPath =
  "/api/agi/realtime/room-source-credential-deliveries/claim";
const connectorPairingsPath = (roomId: string): string =>
  `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/connector-pairings`;
const environmentsPath = (roomId: string): string =>
  `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/environments`;
const commandAuthorityPath = (
  roomId: string,
  environmentBindingId: string,
): string =>
  `${environmentsPath(roomId)}/${encodeURIComponent(environmentBindingId)}/command-authority`;
const commandMemberGrantPath = (
  roomId: string,
  environmentBindingId: string,
  participantId: string,
): string =>
  `${environmentsPath(roomId)}/${encodeURIComponent(environmentBindingId)}/participants/${encodeURIComponent(participantId)}/command-grant`;
const ENVIRONMENT_REFRESH_INTERVAL_MS = 10_000;
const ENVIRONMENT_REFRESH_MAX_BACKOFF_MS = 30_000;

type SafeCredentialDelivery = {
  claim_handle: string;
  claim_url: string;
  expires_at: string;
  delivery_status: "pending_claim";
  bearer_included: false;
  plugin_config_included: false;
};

type SafeSourceBindingReceipt = Partial<HelixRoomSourceBindingReceipt> & {
  ok: boolean;
  error?: string | null;
  message?: string | null;
  bindings?: HelixRoomSourceBinding[];
  credential_delivery?: SafeCredentialDelivery;
};

type SafeConnectorPairingReceipt = Partial<HelixConnectorPairingReceipt> & {
  ok: boolean;
  error?: string | null;
  message?: string | null;
  pairing?: HelixConnectorPairing | null;
  pairings?: HelixConnectorPairing[];
};

type SafeCommandAuthorityReceipt =
  Partial<HelixEnvironmentCommandAuthorityReceipt> & {
    ok: boolean;
    error?: string | null;
    message?: string | null;
    authority?: HelixEnvironmentCommandAuthority | null;
    member_grant?: HelixEnvironmentCommandMemberGrant | null;
    member_grants?: HelixEnvironmentCommandMemberGrant[];
  };

const COMMAND_AUTHORITY_PROFILES: Array<{
  id: HelixEnvironmentCommandAuthorityProfile;
  label: string;
}> = [
  { id: "observe", label: "Observe only" },
  { id: "player_assistant", label: "Player assistant" },
  { id: "world_operator", label: "World operator" },
  { id: "server_administrator", label: "Server administrator (full)" },
];

const COMMAND_AUTONOMY_MODES: Array<{
  id: HelixEnvironmentCommandAutonomyMode;
  label: string;
}> = [
  { id: "approve_each", label: "Approve each action" },
  { id: "approved_categories", label: "Approved categories" },
  { id: "autonomous", label: "Autonomous for this lease" },
];

const COMMAND_CATEGORIES: Array<{
  id: HelixEnvironmentCommandCategory;
  label: string;
}> = [
  { id: "query", label: "Queries" },
  { id: "player_state", label: "Player state" },
  { id: "player_inventory", label: "Inventory" },
  { id: "player_movement", label: "Movement" },
  { id: "world_time_weather", label: "Time and weather" },
  { id: "world_build", label: "World building" },
  { id: "entity_control", label: "Entity control" },
  { id: "server_administration", label: "Server administration" },
  { id: "mod_command", label: "Mod commands" },
];

const MINECRAFT_SOURCE_ADAPTERS = [
  {
    id: "minecraft.fabric_mod.v1",
    label: "Minecraft Fabric mod",
    sourceLabel: "Minecraft Fabric source",
  },
  {
    id: "minecraft.paper_plugin.v1",
    label: "Minecraft Paper plugin",
    sourceLabel: "Minecraft Paper source",
  },
] as const;

type MinecraftSourceAdapterId = (typeof MINECRAFT_SOURCE_ADAPTERS)[number]["id"];

const readReceipt = async (
  response: Response,
): Promise<SafeSourceBindingReceipt> => {
  const body = (await response
    .json()
    .catch(() => null)) as SafeSourceBindingReceipt | null;
  if (!response.ok || !body?.ok) {
    throw Object.assign(
      new Error(body?.message || "Room source binding request failed."),
      { status: response.status },
    );
  }
  return body;
};

const readEnvironmentReceipt = async (
  response: Response,
): Promise<HelixRoomEnvironmentsReceipt> => {
  const body = (await response
    .json()
    .catch(() => null)) as HelixRoomEnvironmentsReceipt | null;
  if (!response.ok || !body?.ok) {
    throw Object.assign(
      new Error(body?.message || "Room environment request failed."),
      { status: response.status },
    );
  }
  return body;
};

const readPairingReceipt = async (
  response: Response,
): Promise<SafeConnectorPairingReceipt> => {
  const body = (await response
    .json()
    .catch(() => null)) as SafeConnectorPairingReceipt | null;
  if (!response.ok || !body?.ok) {
    throw Object.assign(
      new Error(body?.message || "Connector pairing request failed."),
      { status: response.status },
    );
  }
  return body;
};

const readCommandAuthorityReceipt = async (
  response: Response,
): Promise<SafeCommandAuthorityReceipt> => {
  const body = (await response
    .json()
    .catch(() => null)) as SafeCommandAuthorityReceipt | null;
  if (!response.ok || !body?.ok) {
    throw Object.assign(
      new Error(body?.message || "Environment command authority request failed."),
      { status: response.status },
    );
  }
  return {
    ...body,
    authority: body.authority ?? null,
    member_grant: body.member_grant ?? null,
    member_grants: body.member_grants ?? [],
  };
};

const configYaml = (config: HelixRoomSourcePluginConfig): string =>
  [
    "helix:",
    `  endpoint: "${config.endpoint}"`,
    `  bearer_token: "${config.bearer_token}"`,
    `  source_id: "${config.source_id}"`,
    `  room_id: "${config.room_id}"`,
    `  world_id: "${config.world_id}"`,
    `  domain_adapter: "${config.domain_adapter}"`,
    "  execution_enabled: false",
  ].join("\n");

export function SharedLiveRoomSourceBindingsPanel({
  roomId,
  roomClosed,
  isOwner,
  selfParticipantId,
  participants = [],
}: {
  roomId: string;
  roomClosed: boolean;
  isOwner: boolean;
  selfParticipantId: string;
  participants?: HelixSharedRealtimeRoomParticipant[];
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  // Retain only unsaved choices while a stale subject temporarily unmounts its
  // controls. The cache lives only as long as this room panel, never in profile
  // backup; exact player/owner/source scope prevents accidental transfer.
  const playerReviewDrafts = useRef(new Map<string, PlayerAuthorityReviewDraft>());
  const [bindings, setBindings] = useState<HelixRoomSourceBinding[]>([]);
  const [pairings, setPairings] = useState<HelixConnectorPairing[]>([]);
  const [pairingCommand, setPairingCommand] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<string | null>(null);
  const [pairingCopyState, setPairingCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const [environments, setEnvironments] = useState<
    HelixRoomEnvironmentProjection[]
  >([]);
  const [setupConfig, setSetupConfig] =
    useState<HelixRoomSourcePluginConfig | null>(null);
  const [pendingDelivery, setPendingDelivery] =
    useState<SafeCredentialDelivery | null>(null);
  const [sourceAdapterId, setSourceAdapterId] =
    useState<MinecraftSourceAdapterId>("minecraft.fabric_mod.v1");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [commandState, setCommandState] = useState<
    Record<string, SafeCommandAuthorityReceipt>
  >({});
  const [commandProfileDraft, setCommandProfileDraft] = useState<
    Record<string, HelixEnvironmentCommandAuthorityProfile>
  >({});
  const [commandAutonomyDraft, setCommandAutonomyDraft] = useState<
    Record<string, HelixEnvironmentCommandAutonomyMode>
  >({});
  const [commandCategoryDraft, setCommandCategoryDraft] = useState<
    Record<string, HelixEnvironmentCommandCategory[]>
  >({});
  const [commandAuthorityAcknowledged, setCommandAuthorityAcknowledged] =
    useState<Record<string, boolean>>({});
  const [sensitiveActionArmed, setSensitiveActionArmed] = useState<
    Record<string, boolean>
  >({});
  const [memberGrantDraft, setMemberGrantDraft] = useState<
    Record<string, HelixEnvironmentCommandAuthorityProfile>
  >({});
  const basePath = useMemo(() => sourceBindingsPath(roomId), [roomId]);
  const pairingPath = useMemo(() => connectorPairingsPath(roomId), [roomId]);
  const roomEnvironmentsPath = useMemo(
    () => environmentsPath(roomId),
    [roomId],
  );

  const load = useCallback(
    async (signal?: AbortSignal): Promise<boolean> => {
      if (roomClosed) {
        setAvailable(false);
        return true;
      }
      try {
        const environmentReceipt = await readEnvironmentReceipt(
          await fetch(roomEnvironmentsPath, {
            signal,
            credentials: "include",
          }),
        );
        const roomEnvironments = environmentReceipt.environments ?? [];
        setEnvironments(roomEnvironments);
        const commandEntries = await Promise.all(
          roomEnvironments.map(async (environment) => {
            try {
              const authority = await readCommandAuthorityReceipt(
                await fetch(
                  commandAuthorityPath(
                    roomId,
                    environment.environment_binding_id,
                  ),
                  { signal, credentials: "include" },
                ),
              );
              return [environment.environment_binding_id, authority] as const;
            } catch (error) {
              return [
                environment.environment_binding_id,
                {
                  ok: false,
                  error: "command_authority_unavailable",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Command authority is unavailable.",
                  authority: null,
                  member_grant: null,
                  member_grants: [],
                } satisfies SafeCommandAuthorityReceipt,
              ] as const;
            }
          }),
        );
        if (signal?.aborted) return false;
        const nextCommandState = Object.fromEntries(commandEntries);
        setCommandState(nextCommandState);
        setCommandProfileDraft((prior) => {
          const next = { ...prior };
          for (const [environmentId, state] of commandEntries) {
            next[environmentId] ??=
              state.authority?.authority_profile ?? "observe";
          }
          return next;
        });
        setCommandAutonomyDraft((prior) => {
          const next = { ...prior };
          for (const [environmentId, state] of commandEntries) {
            next[environmentId] ??=
              state.authority?.autonomy_mode ?? "approve_each";
          }
          return next;
        });
        setCommandCategoryDraft((prior) => {
          const next = { ...prior };
          for (const [environmentId, state] of commandEntries) {
            next[environmentId] ??=
              state.authority?.approved_categories ?? [];
          }
          return next;
        });
        setMemberGrantDraft((prior) => {
          const next = { ...prior };
          for (const [environmentId, state] of commandEntries) {
            for (const grant of state.member_grants ?? []) {
              next[`${environmentId}:${grant.participant_id}`] ??=
                grant.max_authority_profile;
            }
          }
          return next;
        });
        if (isOwner) {
          const [sourceResponse, pairingResponse] = await Promise.all([
            fetch(basePath, { signal, credentials: "include" }),
            fetch(pairingPath, { signal, credentials: "include" }),
          ]);
          if (sourceResponse.status !== 403) {
            const sourceReceipt = await readReceipt(sourceResponse);
            setBindings(sourceReceipt.bindings ?? []);
          }
          if (pairingResponse.status !== 403) {
            const pairingReceipt = await readPairingReceipt(pairingResponse);
            setPairings(pairingReceipt.pairings ?? []);
          }
        } else {
          setBindings([]);
          setPairings([]);
        }
        setAvailable(true);
        return true;
      } catch (error) {
        if (signal?.aborted) return false;
        setAvailable(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load room environments.",
        );
        return false;
      }
    },
    [basePath, isOwner, pairingPath, roomClosed, roomEnvironmentsPath, roomId],
  );

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let timer: number | null = null;
    let delayMs = ENVIRONMENT_REFRESH_INTERVAL_MS;
    const schedule = (delay: number): void => {
      if (disposed) return;
      timer = window.setTimeout(() => {
        timer = null;
        void refresh();
      }, delay);
    };
    const refresh = async (): Promise<void> => {
      const succeeded = await load(controller.signal);
      if (disposed) return;
      delayMs = succeeded
        ? ENVIRONMENT_REFRESH_INTERVAL_MS
        : Math.min(ENVIRONMENT_REFRESH_MAX_BACKOFF_MS, delayMs * 2);
      schedule(delayMs);
    };
    void refresh();
    return () => {
      disposed = true;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    setSetupConfig(null);
    setPairings([]);
    setPairingCommand(null);
    setPairingCode(null);
    setPairingExpiresAt(null);
    setPairingCopyState("idle");
    setPendingDelivery(null);
    setCopyState("idle");
    setCommandState({});
    setCommandProfileDraft({});
    setCommandAutonomyDraft({});
    setCommandCategoryDraft({});
    setMemberGrantDraft({});
  }, [roomId]);

  const claimDelivery = async (
    delivery: SafeCredentialDelivery,
  ): Promise<SafeSourceBindingReceipt> => {
    const claimed = await readReceipt(
      await fetch(credentialClaimPath, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim_handle: delivery.claim_handle }),
      }),
    );
    setPendingDelivery(null);
    return claimed;
  };

  const run = async (
    action: string,
    operation: () => Promise<SafeSourceBindingReceipt>,
  ): Promise<void> => {
    setBusy(action);
    setMessage(null);
    setCopyState("idle");
    try {
      const receipt = await operation();
      const delivery = receipt.credential_delivery;
      if (delivery) setPendingDelivery(delivery);
      const next = delivery ? await claimDelivery(delivery) : receipt;
      setSetupConfig(next.plugin_config ?? null);
      setMessage(next.message ?? "Room source binding updated.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Room source binding request failed.",
      );
    } finally {
      setBusy(null);
    }
  };

  const create = (): Promise<void> => {
    const sourceAdapter = MINECRAFT_SOURCE_ADAPTERS.find(
      (adapter) => adapter.id === sourceAdapterId,
    ) ?? MINECRAFT_SOURCE_ADAPTERS[0];
    return run("create", async () =>
      readReceipt(
        await fetch(basePath, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `browser-source-create:${crypto.randomUUID()}`,
          },
          body: JSON.stringify({
            domain_adapter: sourceAdapter.id,
            source_label: sourceAdapter.sourceLabel,
          }),
        }),
      ),
    );
  };

  const createPairing = async (
    binding?: HelixRoomSourceBinding,
    options?: { commandCredentialRequested?: boolean },
  ): Promise<void> => {
    const sourceAdapter = binding
      ? MINECRAFT_SOURCE_ADAPTERS.find(
          (adapter) => adapter.id === binding.domain_adapter,
        ) ?? MINECRAFT_SOURCE_ADAPTERS[0]
      : MINECRAFT_SOURCE_ADAPTERS.find(
          (adapter) => adapter.id === sourceAdapterId,
        ) ?? MINECRAFT_SOURCE_ADAPTERS[0];
    const action = binding
      ? options?.commandCredentialRequested
        ? `pairing-command:${binding.binding_id}`
        : `pairing-rotate:${binding.binding_id}`
      : "pairing-create";
    setBusy(action);
    setMessage(null);
    setPairingCommand(null);
    setPairingCode(null);
    setPairingExpiresAt(null);
    setPairingCopyState("idle");
    try {
      const response = await fetch(pairingPath, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `browser-connector-pairing:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          purpose: binding ? "rotate" : "create",
          ...(binding ? { binding_id: binding.binding_id } : {}),
          command_credential_requested:
            options?.commandCredentialRequested === true,
          domain_adapter: sourceAdapter.id,
          source_label: binding?.source_label ?? sourceAdapter.sourceLabel,
        }),
      });
      const created = await readPairingReceipt(response);
      setPairingCommand(created.pairing_command ?? null);
      setPairingCode(created.pairing_code ?? null);
      setPairingExpiresAt(created.pairing?.expires_at ?? null);
      setMessage(created.message ?? "Connector pairing code created.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create the connector pairing code.",
      );
    } finally {
      setBusy(null);
    }
  };

  const pairLocalServer = async (
    binding: HelixRoomSourceBinding,
  ): Promise<void> => {
    const sourceAdapter =
      MINECRAFT_SOURCE_ADAPTERS.find(
        (adapter) => adapter.id === binding.domain_adapter,
      ) ?? MINECRAFT_SOURCE_ADAPTERS[0];
    const action = `pairing-local-server:${binding.binding_id}`;
    setBusy(action);
    setMessage(null);
    setPairingCommand(null);
    setPairingCode(null);
    setPairingExpiresAt(null);
    setPairingCopyState("idle");
    try {
      const response = await fetch(`${pairingPath}/local-server-handoff`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `browser-local-server-pairing:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          purpose: "rotate",
          binding_id: binding.binding_id,
          command_credential_requested: true,
          action_credential_requested: false,
          domain_adapter: sourceAdapter.id,
          source_label: binding.source_label ?? sourceAdapter.sourceLabel,
        }),
      });
      const created = await readPairingReceipt(response);
      setMessage(
        created.message ??
          "Local server command access was staged without exposing the one-time code.",
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not stage local server command access.",
      );
    } finally {
      setBusy(null);
    }
  };

  const pairLocalSource = async (
    binding: HelixRoomSourceBinding,
  ): Promise<void> => {
    const sourceAdapter =
      MINECRAFT_SOURCE_ADAPTERS.find(
        (adapter) => adapter.id === binding.domain_adapter,
      ) ?? MINECRAFT_SOURCE_ADAPTERS[0];
    const action = `pairing-local-source:${binding.binding_id}`;
    setBusy(action);
    setMessage(null);
    setPairingCommand(null);
    setPairingCode(null);
    setPairingExpiresAt(null);
    setPairingCopyState("idle");
    try {
      const response = await fetch(`${pairingPath}/local-source-handoff`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `browser-local-source-pairing:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          purpose: "rotate",
          binding_id: binding.binding_id,
          command_credential_requested: false,
          action_credential_requested: false,
          domain_adapter: sourceAdapter.id,
          source_label: binding.source_label ?? sourceAdapter.sourceLabel,
        }),
      });
      const created = await readPairingReceipt(response);
      setMessage(
        created.message ??
          "Local server sensing was staged without exposing the one-time code or enabling command access.",
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not stage local server sensing.",
      );
    } finally {
      setBusy(null);
    }
  };

  const revokePairing = async (
    pairing: HelixConnectorPairing,
  ): Promise<void> => {
    setBusy(`pairing-revoke:${pairing.pairing_id}`);
    setMessage(null);
    try {
      const revoked = await readPairingReceipt(
        await fetch(
          `${pairingPath}/${encodeURIComponent(pairing.pairing_id)}`,
          { method: "DELETE", credentials: "include" },
        ),
      );
      setMessage(revoked.message ?? "Connector pairing code revoked.");
      if (pairingCode && pairing.pairing_id === revoked.pairing?.pairing_id) {
        setPairingCommand(null);
        setPairingCode(null);
        setPairingExpiresAt(null);
      }
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not revoke the connector pairing code.",
      );
    } finally {
      setBusy(null);
    }
  };

  const retryPendingClaim = (): Promise<void> => {
    if (!pendingDelivery) return Promise.resolve();
    return run("claim", () => claimDelivery(pendingDelivery));
  };

  const revoke = (binding: HelixRoomSourceBinding): Promise<void> => {
    const actionKey = `revoke:${binding.binding_id}`;
    if (sensitiveActionArmed[actionKey] !== true) {
      setSensitiveActionArmed((prior) => ({ ...prior, [actionKey]: true }));
      setMessage(
        `Click Confirm revoke for ${binding.source_label} to permanently disable this source link.`,
      );
      return Promise.resolve();
    }
    setSensitiveActionArmed((prior) => ({ ...prior, [actionKey]: false }));
    return run(`revoke:${binding.binding_id}`, async () =>
      readReceipt(
        await fetch(`${basePath}/${encodeURIComponent(binding.binding_id)}`, {
          method: "DELETE",
        }),
      ),
    );
  };

  const selectOwnSubject = async (
    environment: HelixRoomEnvironmentProjection,
    subjectRef: string,
  ): Promise<void> => {
    setBusy(`identity:${environment.environment_binding_id}`);
    setMessage(null);
    try {
      const result = await readEnvironmentReceipt(
        await fetch(
          `${roomEnvironmentsPath}/${encodeURIComponent(environment.environment_binding_id)}/me`,
          {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject_ref: subjectRef }),
          },
        ),
      );
      setMessage(result.message);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update your environment identity.",
      );
    } finally {
      setBusy(null);
    }
  };

  const clearOwnSubject = async (
    environment: HelixRoomEnvironmentProjection,
  ): Promise<void> => {
    setBusy(`identity:${environment.environment_binding_id}`);
    setMessage(null);
    try {
      const result = await readEnvironmentReceipt(
        await fetch(
          `${roomEnvironmentsPath}/${encodeURIComponent(environment.environment_binding_id)}/me`,
          { method: "DELETE", credentials: "include" },
        ),
      );
      setMessage(result.message);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not remove your environment identity.",
      );
    } finally {
      setBusy(null);
    }
  };

  const saveCommandAuthority = async (
    environment: HelixRoomEnvironmentProjection,
  ): Promise<void> => {
    const environmentId = environment.environment_binding_id;
    const authorityProfile = commandProfileDraft[environmentId] ?? "observe";
    const autonomyMode = commandAutonomyDraft[environmentId] ?? "approve_each";
    const approvedCategories =
      autonomyMode === "approved_categories"
        ? commandCategoryDraft[environmentId] ?? []
        : [];
    if (
      (authorityProfile === "server_administrator" ||
        autonomyMode === "autonomous") &&
      commandAuthorityAcknowledged[environmentId] !== true
    ) {
      setMessage(
        "Acknowledge the full-command/autonomous warning before saving this authority lease.",
      );
      return;
    }
    setBusy(`command-authority:${environmentId}`);
    setMessage(null);
    try {
      const receipt = await readCommandAuthorityReceipt(
        await fetch(commandAuthorityPath(roomId, environmentId), {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            authority_profile: authorityProfile,
            autonomy_mode: autonomyMode,
            approved_categories: approvedCategories,
            expires_at: null,
          }),
        }),
      );
      setMessage(receipt.message ?? "Command authority updated.");
      setCommandAuthorityAcknowledged((prior) => ({
        ...prior,
        [environmentId]: false,
      }));
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update environment command authority.",
      );
    } finally {
      setBusy(null);
    }
  };

  const emergencyStopCommands = async (
    environment: HelixRoomEnvironmentProjection,
  ): Promise<void> => {
    const environmentId = environment.environment_binding_id;
    const actionKey = `command-stop:${environmentId}`;
    if (sensitiveActionArmed[actionKey] !== true) {
      setSensitiveActionArmed((prior) => ({ ...prior, [actionKey]: true }));
      setMessage(
        "Click Confirm emergency stop to cancel pending commands and revoke connector command credentials.",
      );
      return;
    }
    setSensitiveActionArmed((prior) => ({ ...prior, [actionKey]: false }));
    setBusy(`command-stop:${environmentId}`);
    setMessage(null);
    try {
      const receipt = await readCommandAuthorityReceipt(
        await fetch(commandAuthorityPath(roomId, environmentId), {
          method: "DELETE",
          credentials: "include",
        }),
      );
      setMessage(receipt.message ?? "Environment commands stopped.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not stop environment commands.",
      );
    } finally {
      setBusy(null);
    }
  };

  const saveMemberCommandGrant = async (
    environment: HelixRoomEnvironmentProjection,
    participant: HelixSharedRealtimeRoomParticipant,
  ): Promise<void> => {
    const environmentId = environment.environment_binding_id;
    const draftKey = `${environmentId}:${participant.participant_id}`;
    const maxAuthorityProfile = memberGrantDraft[draftKey] ?? "observe";
    setBusy(`command-grant:${draftKey}`);
    setMessage(null);
    try {
      const receipt = await readCommandAuthorityReceipt(
        await fetch(
          commandMemberGrantPath(
            roomId,
            environmentId,
            participant.participant_id,
          ),
          {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              max_authority_profile: maxAuthorityProfile,
              autonomy_override: null,
              expires_at: null,
            }),
          },
        ),
      );
      setMessage(receipt.message ?? `Command access updated for ${participant.display_name}.`);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update room member command access.",
      );
    } finally {
      setBusy(null);
    }
  };

  const copySetup = async (): Promise<void> => {
    if (!setupConfig) return;
    try {
      await navigator.clipboard.writeText(configYaml(setupConfig));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const copyPairingCommand = async (): Promise<void> => {
    if (!pairingCommand) return;
    try {
      await navigator.clipboard.writeText(pairingCommand);
      setPairingCopyState("copied");
    } catch {
      setPairingCopyState("failed");
    }
  };

  if (roomClosed || available === false) return null;

  return (
    <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-cyan-100">
            Room environments
          </p>
          <p className="mt-0.5 text-[10px] text-cyan-100/60">
            Connected programs and the identity each room member uses when the
            runtime agent reads them.
          </p>
        </div>
        {isOwner ? <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`minecraft-source-adapter-${roomId}`}>
            Minecraft environment adapter
          </label>
          <select data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.select"
            id={`minecraft-source-adapter-${roomId}`}
            value={sourceAdapterId}
            disabled={busy !== null || available === null}
            className="rounded border border-cyan-300/30 bg-slate-950 px-2 py-1 text-[10px] text-cyan-100 disabled:opacity-50"
            onChange={(event) =>
              setSourceAdapterId(event.target.value as MinecraftSourceAdapterId)
            }
          >
            {MINECRAFT_SOURCE_ADAPTERS.map((adapter) => (
              <option key={adapter.id} value={adapter.id}>
                {adapter.label}
              </option>
            ))}
          </select>
          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.pair-in-game"
            type="button"
            disabled={busy !== null || available === null}
            className="inline-flex items-center gap-1 rounded border border-cyan-300/30 px-2 py-1 text-[10px] font-semibold text-cyan-100 disabled:opacity-50"
            onClick={() => void createPairing()}
          >
            <KeyRound className="h-3 w-3" />
            Pair in game
          </button>
          <button data-helix-interaction-kind="navigate" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.advanced-fallback-reveal-and-install-the-full-source-configuration-manua"
            type="button"
            disabled={busy !== null || available === null}
            title="Advanced fallback: reveal and install the full source configuration manually"
            className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-[10px] text-slate-400 disabled:opacity-50"
            onClick={() => void create()}
          >
            Manual config
          </button>
        </div> : null}
      </div>

      {environments.length > 0 ? (
        <div className="mt-2 space-y-2">
          {environments.map((environment) => {
            const directory = environment.subject_directory;
            const environmentId = environment.environment_binding_id;
            const sourceBinding = bindings.find(
              (binding) =>
                binding.binding_id === environment.room_source_binding_id,
            );
            const playerReviewKey = JSON.stringify([roomId, selfParticipantId, isOwner,
              environment.environment_binding_id, environment.room_source_binding_id,
              environment.source_id, environment.world_id, environment.self_subject_binding?.subject_ref ?? null]);
            const identityBusy =
              busy === `identity:${environmentId}`;
            const commandReceipt = commandState[environmentId];
            const authority = commandReceipt?.authority ?? null;
            const selfGrant = commandReceipt?.member_grant ?? null;
            const profileDraft =
              commandProfileDraft[environmentId] ??
              authority?.authority_profile ??
              "observe";
            const autonomyDraft =
              commandAutonomyDraft[environmentId] ??
              authority?.autonomy_mode ??
              "approve_each";
            const categoryDraft = commandCategoryDraft[environmentId] ?? [];
            const authorityBusy =
              busy === `command-authority:${environmentId}` ||
              busy === `command-stop:${environmentId}`;
            const maxMemberProfileIndex = Math.max(
              0,
              COMMAND_AUTHORITY_PROFILES.findIndex(
                (profile) => profile.id === (authority?.authority_profile ?? "observe"),
              ),
            );
            return (
              <article
                key={environment.environment_binding_id}
                className="rounded border border-white/10 bg-slate-950/70 p-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-[10px] font-semibold text-slate-100">
                      <Activity className="h-3 w-3 text-cyan-300" />
                      {environment.source_label}
                    </p>
                    <p className="mt-0.5 text-[9px] text-slate-500">
                      {environment.domain_adapter} · {environment.connection_status}
                      {environment.latest_observed_at
                        ? ` · observed ${new Date(environment.latest_observed_at).toLocaleTimeString()}`
                        : " · awaiting connector"}
                    </p>
                    <p className="mt-0.5 text-[9px] text-slate-500">
                      {environment.capability_ids.length} admitted read capabilities
                    </p>
                    <p
                      className="mt-0.5 break-all font-mono text-[9px] text-slate-500"
                      title="Exact bound world identity"
                    >
                      Bound world: {environment.world_id}
                    </p>
                  </div>
                  {environment.self_subject_binding ? (
                    <span className={`rounded px-1.5 py-0.5 text-[9px] ${
                      environment.self_subject_binding.status === "active"
                        ? "bg-emerald-400/15 text-emerald-200"
                        : "bg-amber-400/15 text-amber-200"
                    }`}>
                      {environment.self_subject_binding.status === "active"
                        ? `You are ${environment.self_subject_binding.subject_label}`
                        : `Reverify ${environment.self_subject_binding.subject_label}`}
                    </span>
                  ) : null}
                </div>

                {directory ? (
                  <div className="mt-2 rounded border border-cyan-300/10 bg-cyan-400/5 p-2">
                    <label
                      className="flex items-center gap-1 text-[10px] font-semibold text-cyan-100"
                      htmlFor={`environment-subject-${environment.environment_binding_id}`}
                    >
                      <UserRound className="h-3 w-3" />
                      Your identity in this environment
                    </label>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <select data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.select.2"
                        id={`environment-subject-${environment.environment_binding_id}`}
                        value={
                          environment.self_subject_binding?.status === "active"
                            ? environment.self_subject_binding.subject_ref
                            : ""
                        }
                        disabled={
                          identityBusy ||
                          directory.freshness !== "fresh" ||
                          directory.subjects.length === 0
                        }
                        className="min-w-44 flex-1 rounded border border-cyan-300/25 bg-slate-950 px-2 py-1 text-[10px] text-cyan-50 disabled:opacity-50"
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value) void selectOwnSubject(environment, value);
                        }}
                      >
                        <option value="">
                          {directory.subjects.length === 0
                            ? "No online subjects reported"
                            : environment.identity_assignment ===
                                "reverification_required"
                              ? "Choose again to reverify"
                            : "Choose who you are"}
                        </option>
                        {directory.subjects.map((subject) => {
                          const claimedByOther =
                            subject.claimed_by_participant_id !== null &&
                            subject.claimed_by_participant_id !== selfParticipantId;
                          return (
                            <option
                              key={subject.subject_ref}
                              value={subject.subject_ref}
                              disabled={claimedByOther}
                            >
                              {subject.display_label}
                              {claimedByOther ? " · claimed by another member" : ""}
                            </option>
                          );
                        })}
                      </select>
                      {environment.self_subject_binding ? (
                        <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.remove"
                          type="button"
                          disabled={identityBusy}
                          className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-[9px] text-slate-300 disabled:opacity-50"
                          onClick={() => void clearOwnSubject(environment)}
                        >
                          <Unlink className="h-2.5 w-2.5" />
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[9px] text-cyan-100/55">
                      {environment.identity_assignment === "reverification_required"
                        ? "The connector session changed. Choose the online player again before environment tools can act for you."
                        : "Only a safe display name and presence are shown here. The game identity and connector credential remain server-side."}
                    </p>
                    {directory.freshness === "fresh" &&
                    directory.subjects.length === 0 ? (
                      <p
                        role="status"
                        className="mt-1 rounded border border-amber-300/25 bg-amber-400/10 p-1.5 text-[9px] text-amber-100"
                      >
                        The connector is online, but no player is present in this
                        exact bound world. Do not pair Player Embodiment or run
                        player actions until the intended client joins and its
                        identity appears here.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-2 rounded border border-violet-300/15 bg-violet-400/5 p-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1 text-[10px] font-semibold text-violet-100">
                        <ShieldCheck className="h-3 w-3" />
                        Minecraft command access
                      </p>
                      <p className="mt-0.5 text-[9px] text-violet-100/55">
                        {authority
                          ? `${COMMAND_AUTHORITY_PROFILES.find((profile) => profile.id === authority.authority_profile)?.label ?? authority.authority_profile} · ${COMMAND_AUTONOMY_MODES.find((mode) => mode.id === authority.autonomy_mode)?.label ?? authority.autonomy_mode}`
                          : "Observation only · no command authority configured"}
                      </p>
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] ${
                        authority?.status === "active"
                          ? "bg-emerald-400/15 text-emerald-200"
                          : "bg-slate-400/10 text-slate-400"
                      }`}
                    >
                      {authority?.status ?? "off"}
                    </span>
                  </div>

                  {authority?.authority_profile === "server_administrator" ||
                  profileDraft === "server_administrator" ? (
                    <p className="mt-2 rounded border border-amber-300/25 bg-amber-400/10 p-1.5 text-[9px] text-amber-100">
                      Full mode admits the complete command tree exposed by this
                      live Minecraft server, including installed mod commands.
                      It never grants host shell, filesystem, RCON, process, or
                      operating-system access.
                    </p>
                  ) : null}

                  {isOwner ? (
                    <div className="mt-2 space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-[9px] text-violet-100/70">
                          Authority profile
                          <select data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.select.3"
                            aria-label={`Command authority for ${environment.source_label}`}
                            value={profileDraft}
                            disabled={authorityBusy}
                            className="mt-1 w-full rounded border border-violet-300/25 bg-slate-950 px-2 py-1 text-[10px] text-violet-50 disabled:opacity-50"
                            onChange={(event) =>
                              setCommandProfileDraft((prior) => ({
                                ...prior,
                                [environmentId]: event.target.value as HelixEnvironmentCommandAuthorityProfile,
                              }))
                            }
                          >
                            {COMMAND_AUTHORITY_PROFILES.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-[9px] text-violet-100/70">
                          Approval mode
                          <select data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.select.4"
                            aria-label={`Command approval mode for ${environment.source_label}`}
                            value={autonomyDraft}
                            disabled={authorityBusy}
                            className="mt-1 w-full rounded border border-violet-300/25 bg-slate-950 px-2 py-1 text-[10px] text-violet-50 disabled:opacity-50"
                            onChange={(event) =>
                              setCommandAutonomyDraft((prior) => ({
                                ...prior,
                                [environmentId]: event.target.value as HelixEnvironmentCommandAutonomyMode,
                              }))
                            }
                          >
                            {COMMAND_AUTONOMY_MODES.map((mode) => (
                              <option key={mode.id} value={mode.id}>
                                {mode.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {autonomyDraft === "approved_categories" ? (
                        <fieldset className="rounded border border-white/10 p-2">
                          <legend className="px-1 text-[9px] text-slate-400">
                            Categories the agent may run without asking
                          </legend>
                          <div className="grid gap-1 sm:grid-cols-2">
                            {COMMAND_CATEGORIES.map((category) => (
                              <label
                                key={category.id}
                                className="flex items-center gap-1.5 text-[9px] text-slate-300"
                              >
                                <input data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.input"
                                  type="checkbox"
                                  checked={categoryDraft.includes(category.id)}
                                  onChange={(event) =>
                                    setCommandCategoryDraft((prior) => {
                                      const current = prior[environmentId] ?? [];
                                      return {
                                        ...prior,
                                        [environmentId]: event.target.checked
                                          ? [...new Set([...current, category.id])]
                                          : current.filter((item) => item !== category.id),
                                      };
                                    })
                                  }
                                />
                                {category.label}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ) : null}

                      {profileDraft === "server_administrator" ||
                      autonomyDraft === "autonomous" ? (
                        <label className="flex items-start gap-2 rounded border border-amber-300/25 bg-amber-950/20 p-2 text-[9px] text-amber-100">
                          <input data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.input.2"
                            type="checkbox"
                            aria-label={`Acknowledge full Minecraft command authority for ${environment.source_label}`}
                            checked={commandAuthorityAcknowledged[environmentId] === true}
                            disabled={authorityBusy}
                            onChange={(event) =>
                              setCommandAuthorityAcknowledged((prior) => ({
                                ...prior,
                                [environmentId]: event.target.checked,
                              }))
                            }
                          />
                          <span>
                            I understand that this lease can expose the complete live Minecraft command tree, including mod, world-mutation, and server-administration commands. It never grants host shell, files, RCON, processes, or credentials, and Emergency stop remains available.
                          </span>
                        </label>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.save-command-authority"
                          type="button"
                          disabled={
                            authorityBusy ||
                            busy !== null ||
                            ((profileDraft === "server_administrator" ||
                              autonomyDraft === "autonomous") &&
                              commandAuthorityAcknowledged[environmentId] !== true)
                          }
                          className="inline-flex items-center gap-1 rounded border border-violet-300/30 px-2 py-1 text-[9px] font-semibold text-violet-100 disabled:opacity-50"
                          onClick={() => void saveCommandAuthority(environment)}
                        >
                          <ShieldCheck className="h-2.5 w-2.5" />
                          Save command authority
                        </button>
                        {authority?.status === "active" ? (
                          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.pair-command-access-in-game"
                            type="button"
                            disabled={
                              authorityBusy || busy !== null || !sourceBinding
                            }
                            className="inline-flex items-center gap-1 rounded border border-amber-300/30 px-2 py-1 text-[9px] font-semibold text-amber-100 disabled:opacity-50"
                            onClick={() =>
                              sourceBinding
                                ? void createPairing(sourceBinding, {
                                    commandCredentialRequested: true,
                                  })
                                : undefined
                            }
                          >
                            <KeyRound className="h-2.5 w-2.5" />
                            Pair command access in game
                          </button>
                        ) : null}
                        {authority?.status === "active" ? (
                          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.pair-local-server-privately"
                            type="button"
                            disabled={
                              authorityBusy || busy !== null || !sourceBinding
                            }
                            className="inline-flex items-center gap-1 rounded border border-emerald-300/30 px-2 py-1 text-[9px] font-semibold text-emerald-100 disabled:opacity-50"
                            onClick={() =>
                              sourceBinding
                                ? void pairLocalServer(sourceBinding)
                                : undefined
                            }
                          >
                            <KeyRound className="h-2.5 w-2.5" />
                            Pair local server privately
                          </button>
                        ) : null}
                        {authority?.status === "active" ? (
                          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.void-emergency-stop-commands-environment"
                            type="button"
                            disabled={authorityBusy || busy !== null}
                            className="inline-flex items-center gap-1 rounded border border-red-300/30 px-2 py-1 text-[9px] font-semibold text-red-200 disabled:opacity-50"
                            onClick={() => void emergencyStopCommands(environment)}
                          >
                            <Power className="h-2.5 w-2.5" />
                            {sensitiveActionArmed[`command-stop:${environmentId}`]
                              ? "Confirm emergency stop"
                              : "Emergency stop"}
                          </button>
                        ) : null}
                      </div>

                      {authority ? (
                        <div className="rounded border border-white/10 p-2">
                          <p className="text-[9px] font-semibold text-slate-300">
                            Room member ceilings
                          </p>
                          <div className="mt-1 space-y-1.5">
                            {participants.map((participant) => {
                              const draftKey = `${environmentId}:${participant.participant_id}`;
                              const memberBusy = busy === `command-grant:${draftKey}`;
                              const currentGrant = commandReceipt?.member_grants?.find(
                                (grant) => grant.participant_id === participant.participant_id,
                              );
                              const subject = directory?.subjects.find(
                                (entry) =>
                                  entry.claimed_by_participant_id === participant.participant_id,
                              );
                              return (
                                <div
                                  key={participant.participant_id}
                                  className="flex flex-wrap items-center gap-2"
                                >
                                  <span className="min-w-28 flex-1 text-[9px] text-slate-300">
                                    {participant.display_name}
                                    {subject ? ` · ${subject.display_label}` : " · no player selected"}
                                  </span>
                                  <select data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.select.5"
                                    aria-label={`Command ceiling for ${participant.display_name}`}
                                    value={
                                      memberGrantDraft[draftKey] ??
                                      currentGrant?.max_authority_profile ??
                                      "observe"
                                    }
                                    disabled={memberBusy}
                                    className="rounded border border-white/15 bg-slate-950 px-1.5 py-1 text-[9px] text-slate-200 disabled:opacity-50"
                                    onChange={(event) =>
                                      setMemberGrantDraft((prior) => ({
                                        ...prior,
                                        [draftKey]: event.target.value as HelixEnvironmentCommandAuthorityProfile,
                                      }))
                                    }
                                  >
                                    {COMMAND_AUTHORITY_PROFILES.slice(
                                      0,
                                      maxMemberProfileIndex + 1,
                                    ).map((profile) => (
                                      <option key={profile.id} value={profile.id}>
                                        {profile.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.apply"
                                    type="button"
                                    disabled={memberBusy || busy !== null}
                                    className="rounded border border-white/15 px-1.5 py-1 text-[9px] text-slate-300 disabled:opacity-50"
                                    onClick={() =>
                                      void saveMemberCommandGrant(environment, participant)
                                    }
                                  >
                                    Apply
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-[9px] text-violet-100/55">
                      Your ceiling: {selfGrant?.max_authority_profile ?? "observe"}.
                      The room owner controls this lease; your selected player
                      identity scopes player-targeted commands.
                    </p>
                  )}
                </div>
                <div tabIndex={-1} data-environment-player-settings={environment.domain_adapter === "minecraft.fabric_mod.v1" ? environment.environment_binding_id : undefined}>
                {environment.domain_adapter === "minecraft.fabric_mod.v1" ? (
                  environment.self_subject_binding?.status === "active" ? (
                    <SharedLiveRoomPlayerEmbodimentPanel
                      key={playerReviewKey}
                      roomId={roomId}
                      environment={environment}
                      selfParticipantId={selfParticipantId}
                      sourceBinding={sourceBinding}
                      isOwner={isOwner}
                      initialReviewDraft={playerReviewDrafts.current.get(playerReviewKey)}
                      onReviewDraftChange={(draft) => {
                        playerReviewDrafts.current.delete(playerReviewKey);
                        if (!draft) return;
                        playerReviewDrafts.current.set(playerReviewKey, draft);
                        while (playerReviewDrafts.current.size > 32) {
                          playerReviewDrafts.current.delete(playerReviewDrafts.current.keys().next().value!);
                        }
                      }}
                    />
                  ) : isOwner ? (
                    <div className="mt-2">
                      <MinecraftLocalLifecycleCard />
                      <p className="mt-1 text-[9px] text-cyan-100/60">
                        Launch or rejoin the prepared local client first. The
                        full Play Minecraft with Helix activation appears only
                        after this room verifies the current player.
                      </p>
                    </div>
                  ) : null
                ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-slate-500">
          No room environments are bound yet.
        </p>
      )}

      {pairingCommand && pairingCode ? (
        <div className="mt-2 rounded border border-emerald-300/25 bg-emerald-400/10 p-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold text-emerald-50">
                One-time connector pairing
              </p>
              <code className="mt-1 block select-all text-sm font-bold tracking-wider text-emerald-100">
                {pairingCode}
              </code>
              <p className="mt-1 text-[10px] text-emerald-100/70">
                Run <code>{pairingCommand}</code> from the Minecraft server
                console or as an operator. The code expires{" "}
                {pairingExpiresAt
                  ? new Date(pairingExpiresAt).toLocaleTimeString()
                  : "soon"}
                .
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.void-copy-pairing-command"
                type="button"
                className="inline-flex items-center gap-1 rounded border border-emerald-200/30 px-2 py-1 text-[10px] text-emerald-50"
                onClick={() => void copyPairingCommand()}
              >
                <Copy className="h-3 w-3" />
                {pairingCopyState === "copied"
                  ? "Copied"
                  : pairingCopyState === "failed"
                    ? "Select"
                    : "Copy command"}
              </button>
              <button data-helix-interaction-kind="navigate" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.hide-connector-pairing-code"
                type="button"
                aria-label="Hide connector pairing code"
                className="rounded border border-emerald-200/30 p-1 text-emerald-50"
                onClick={() => {
                  setPairingCommand(null);
                  setPairingCode(null);
                  setPairingExpiresAt(null);
                  setPairingCopyState("idle");
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
          <p className="mt-1 text-[9px] text-emerald-100/55">
            The room credential is delivered directly to the connector and is
            never placed in chat, agent context, MCP output, or debug export.
          </p>
        </div>
      ) : null}

      {pairings.some((pairing) => pairing.status === "pending") ? (
        <div className="mt-2 space-y-1">
          {pairings
            .filter((pairing) => pairing.status === "pending")
            .map((pairing) => (
              <div
                key={pairing.pairing_id}
                className="flex flex-wrap items-center gap-2 rounded border border-emerald-300/15 bg-slate-950/60 p-1.5"
              >
                <p className="min-w-0 flex-1 truncate text-[9px] text-emerald-100/65">
                  Pending {pairing.purpose} pairing for {pairing.source_label} ·
                  expires {new Date(pairing.expires_at).toLocaleTimeString()}
                </p>
                <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.revoke-code"
                  type="button"
                  disabled={busy !== null}
                  className="rounded border border-rose-300/20 px-1.5 py-0.5 text-[9px] text-rose-200 disabled:opacity-50"
                  onClick={() => void revokePairing(pairing)}
                >
                  Revoke code
                </button>
              </div>
            ))}
        </div>
      ) : null}

      {setupConfig ? (
        <div className="mt-2 rounded border border-amber-300/25 bg-amber-400/10 p-2">
          <div className="flex items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-amber-50">
              {configYaml(setupConfig)}
            </pre>
            <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.copy-minecraft-room-source-configuration"
              type="button"
              aria-label="Copy Minecraft room source configuration"
              className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-200/30 px-2 py-1 text-[10px] text-amber-50"
              onClick={() => void copySetup()}
            >
              <Copy className="h-3 w-3" />
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Select"
                  : "Copy"}
            </button>
            <button data-helix-interaction-kind="navigate" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.hide-minecraft-room-source-configuration"
              type="button"
              aria-label="Hide Minecraft room source configuration"
              className="inline-flex shrink-0 items-center rounded border border-amber-200/30 p-1 text-amber-50"
              onClick={() => {
                setSetupConfig(null);
                setCopyState("idle");
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="mt-1 text-[10px] text-amber-100/70">
            The bearer token is returned once and only its hash is stored by the
            server. Copy it, then hide this display.
          </p>
        </div>
      ) : null}

      {pendingDelivery && !setupConfig ? (
        <div className="mt-2 rounded border border-amber-300/25 bg-amber-400/10 p-2">
          <p className="text-[10px] text-amber-100/80">
            The source binding exists, but its one-time browser credential
            claim has not completed.
          </p>
          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.retry-secure-claim"
            type="button"
            disabled={busy !== null}
            className="mt-1 rounded border border-amber-200/30 px-2 py-1 text-[10px] text-amber-50 disabled:opacity-50"
            onClick={() => void retryPendingClaim()}
          >
            Retry secure claim
          </button>
        </div>
      ) : null}

      {bindings.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {bindings.map((binding) => (
            <div
              key={binding.binding_id}
              className="flex flex-wrap items-center gap-2 rounded border border-white/10 bg-slate-950/70 p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold text-slate-200">
                  {binding.source_label} - {binding.status}
                </p>
                <p className="mt-0.5 break-all text-[9px] text-slate-500">
                  {binding.public_ingress_base_url}
                </p>
                <p className="mt-0.5 break-all text-[9px] text-slate-500">
                  {binding.source_id} · token {binding.token_prefix ?? "none"} ·
                  expires{" "}
                  {binding.expires_at
                    ? new Date(binding.expires_at).toLocaleString()
                    : "n/a"}
                  {binding.last_used_at
                    ? ` · last used ${new Date(binding.last_used_at).toLocaleString()}`
                    : " · never used"}
                </p>
              </div>
              {binding.status === "active" || binding.status === "expired" ? (
                <>
                  <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.re-pair"
                    type="button"
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 rounded border border-white/15 px-1.5 py-1 text-[9px] text-slate-300 disabled:opacity-50"
                    onClick={() => void createPairing(binding)}
                  >
                    <RefreshCw className="h-2.5 w-2.5" />
                    Re-pair
                  </button>
                  {binding.domain_adapter === "minecraft.fabric_mod.v1" ? (
                    <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.re-pair-local-sensing-privately"
                      type="button"
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded border border-cyan-300/25 px-1.5 py-1 text-[9px] text-cyan-100 disabled:opacity-50"
                      onClick={() => void pairLocalSource(binding)}
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                      Re-pair local sensing privately
                    </button>
                  ) : null}
                  <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-source-bindings-panel.void-revoke-binding"
                    type="button"
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 rounded border border-rose-300/25 px-1.5 py-1 text-[9px] text-rose-200 disabled:opacity-50"
                    onClick={() => void revoke(binding)}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    {sensitiveActionArmed[`revoke:${binding.binding_id}`]
                      ? "Confirm revoke"
                      : "Revoke"}
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {message ? (
        <p className="mt-2 text-[10px] text-cyan-100/70">{message}</p>
      ) : null}
    </div>
  );
}
