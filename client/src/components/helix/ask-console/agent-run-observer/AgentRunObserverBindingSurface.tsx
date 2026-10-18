import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy,
} from "@/lib/workstation/accountCapabilityPolicy";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import {
  AgentRunObserverApiError,
  agentRunObserverApi,
} from "./AgentRunObserverApi";
import { buildSelectedChatContextSnapshot } from "./AgentRunObserverChatContext";
import type { AgentRunObserverBinding } from "./AgentRunObserverContracts";
import { AgentRunObserverLane } from "./AgentRunObserverLane";
import { useAgentRunObserver } from "./useAgentRunObserver";

export const AGENT_RUN_OBSERVER_BINDING_STORAGE_PREFIX =
  "helix.agent-run-observer.binding.v1:";
const BINDING_REFRESH_MS = 2_000;
const SHARED_REALTIME_ROOMS_FEATURE = "shared_realtime_rooms";

type StoredObserverBinding = {
  bindingRef: string;
  chatSessionId: string;
};

export const isAgentRunObserverAvailable = (
  policy: HelixAccountCapabilityPolicy | null | undefined,
): boolean =>
  Boolean(
    policy?.feature_flags.includes(SHARED_REALTIME_ROOMS_FEATURE) &&
    !policy.locked_features.includes(SHARED_REALTIME_ROOMS_FEATURE),
  );

const isUnavailableObserverBindingError = (
  error: unknown,
): error is AgentRunObserverApiError =>
  error instanceof AgentRunObserverApiError &&
  (error.status === 404 || error.status === 410);

const storageKey = (chatSessionId: string): string =>
  `${AGENT_RUN_OBSERVER_BINDING_STORAGE_PREFIX}${chatSessionId}`;

const parseStoredAgentRunObserverBinding = (
  serialized: string | null,
  chatSessionId: string,
): StoredObserverBinding | null => {
  if (!serialized) return null;
  try {
    const value = JSON.parse(
      serialized,
    ) as Partial<StoredObserverBinding> | null;
    if (
      !value ||
      typeof value.bindingRef !== "string" ||
      !value.bindingRef.trim() ||
      value.chatSessionId !== chatSessionId
    ) {
      return null;
    }
    return {
      bindingRef: value.bindingRef.trim(),
      chatSessionId,
    };
  } catch {
    return null;
  }
};

export const readStoredAgentRunObserverBinding = (
  chatSessionId: string,
): StoredObserverBinding | null => {
  if (typeof window === "undefined" || !chatSessionId.trim()) return null;
  const key = storageKey(chatSessionId);
  try {
    const durable = parseStoredAgentRunObserverBinding(
      window.localStorage.getItem(key),
      chatSessionId,
    );
    if (durable) return durable;
  } catch {
    // A blocked localStorage backend can still fall through to legacy state.
  }
  try {
    const legacy = parseStoredAgentRunObserverBinding(
      window.sessionStorage.getItem(key),
      chatSessionId,
    );
    if (!legacy) return null;
    try {
      window.localStorage.setItem(key, JSON.stringify(legacy));
      window.sessionStorage.removeItem(key);
    } catch {
      // Preserve readable legacy state when durable migration is unavailable.
    }
    return legacy;
  } catch {
    return null;
  }
};

export const storeAgentRunObserverBinding = (
  binding: StoredObserverBinding,
): void => {
  if (
    typeof window === "undefined" ||
    !binding.bindingRef.trim() ||
    !binding.chatSessionId.trim()
  ) {
    return;
  }
  const key = storageKey(binding.chatSessionId);
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        bindingRef: binding.bindingRef.trim(),
        chatSessionId: binding.chatSessionId.trim(),
      }),
    );
    window.sessionStorage.removeItem(key);
  } catch {
    // The server binding remains durable; this only disables browser recovery.
  }
};

export const removeStoredAgentRunObserverBinding = (
  chatSessionId: string,
  expectedBindingRef?: string,
): void => {
  if (typeof window === "undefined" || !chatSessionId.trim()) return;
  const key = storageKey(chatSessionId);
  const expectedRef = expectedBindingRef?.trim() || null;
  const removeMatching = (storage: Storage): void => {
    if (expectedRef) {
      const stored = parseStoredAgentRunObserverBinding(
        storage.getItem(key),
        chatSessionId,
      );
      if (stored?.bindingRef !== expectedRef) return;
    }
    storage.removeItem(key);
  };
  try {
    removeMatching(window.localStorage);
  } catch {
    // Continue so a legacy tab-only record can still be removed.
  }
  try {
    removeMatching(window.sessionStorage);
  } catch {
    // Storage cleanup is best-effort and carries no server authority.
  }
};

export type AgentRunObserverBindingSurfaceProps = {
  contextId: string;
  className?: string;
};

export function AgentRunObserverBindingSurface({
  contextId,
  className = "",
}: AgentRunObserverBindingSurfaceProps) {
  const [accountPolicy, setAccountPolicy] =
    useState<HelixAccountCapabilityPolicy | null>(() =>
      readCachedAccountCapabilityPolicy(),
    );
  const [includeContext, setIncludeContext] = useState(true);
  const [binding, setBinding] = useState<AgentRunObserverBinding | null>(null);
  const [boundChatSessionId, setBoundChatSessionId] = useState<string | null>(
    null,
  );
  const [claimHandle, setClaimHandle] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [bindingStorageRevision, setBindingStorageRevision] = useState(0);
  const [requestError, setRequestError] =
    useState<AgentRunObserverApiError | null>(null);
  const activeChatSessionId = useAgiChatStore((state) => state.activeId);
  const activeChatSession = useAgiChatStore((state) =>
    state.activeId ? state.sessions[state.activeId] : undefined,
  );
  const newChatSession = useAgiChatStore((state) => state.newSession);
  const setActiveChatSession = useAgiChatStore((state) => state.setActive);
  const bindingRefRef = useRef<string | null>(null);
  bindingRefRef.current = binding?.binding_ref ?? null;
  const observerAvailable = isAgentRunObserverAvailable(accountPolicy);

  const clearUnavailableObserverBinding = useCallback(
    (chatSessionId: string, unavailableBindingRef: string): boolean => {
      const normalizedRef = unavailableBindingRef.trim();
      if (!chatSessionId.trim() || !normalizedRef) return false;
      const currentBindingRef = bindingRefRef.current;
      if (currentBindingRef && currentBindingRef !== normalizedRef) {
        return false;
      }
      const stored = readStoredAgentRunObserverBinding(chatSessionId);
      if (stored && stored.bindingRef !== normalizedRef) return false;
      removeStoredAgentRunObserverBinding(chatSessionId, normalizedRef);
      setClaimHandle(null);
      setBinding(null);
      setBoundChatSessionId(null);
      setRequestError(null);
      return true;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = (): void => {
      void fetchAccountCapabilityPolicy()
        .then((policy) => {
          if (!cancelled) setAccountPolicy(policy);
        })
        .catch(() => {
          if (!cancelled) {
            setAccountPolicy(readCachedAccountCapabilityPolicy());
          }
        });
    };
    refresh();
    if (typeof window !== "undefined") {
      window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, refresh);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener(
          HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
          refresh,
        );
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !activeChatSessionId) return;
    const key = storageKey(activeChatSessionId);
    const synchronizeBindingStorage = (event: StorageEvent): void => {
      if (
        event.key !== key ||
        (event.storageArea && event.storageArea !== window.localStorage)
      ) {
        return;
      }
      const stored = readStoredAgentRunObserverBinding(activeChatSessionId);
      if (stored?.bindingRef === bindingRefRef.current) return;
      setClaimHandle(null);
      setBinding(null);
      setBoundChatSessionId(null);
      setRequestError(null);
      setBindingStorageRevision((revision) => revision + 1);
    };
    window.addEventListener("storage", synchronizeBindingStorage);
    return () => {
      window.removeEventListener("storage", synchronizeBindingStorage);
    };
  }, [activeChatSessionId]);

  useEffect(() => {
    if (!boundChatSessionId || boundChatSessionId === activeChatSessionId) {
      return;
    }
    setClaimHandle(null);
    setBinding(null);
    setBoundChatSessionId(null);
    setRequestError(null);
  }, [activeChatSessionId, boundChatSessionId]);

  useEffect(() => {
    if (
      binding ||
      boundChatSessionId ||
      !activeChatSessionId ||
      !observerAvailable
    ) {
      return;
    }
    let cancelled = false;
    const stored = readStoredAgentRunObserverBinding(activeChatSessionId);
    if (!stored) return;
    void agentRunObserverApi
      .getBinding(stored.bindingRef)
      .then((receipt) => {
        if (cancelled) return;
        const currentStored = readStoredAgentRunObserverBinding(
          stored.chatSessionId,
        );
        if (currentStored?.bindingRef !== stored.bindingRef) return;
        setBoundChatSessionId(stored.chatSessionId);
        setBinding(receipt.binding);
        setRequestError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        const currentStored = readStoredAgentRunObserverBinding(
          stored.chatSessionId,
        );
        if (currentStored?.bindingRef !== stored.bindingRef) return;
        if (isUnavailableObserverBindingError(error)) {
          clearUnavailableObserverBinding(
            stored.chatSessionId,
            stored.bindingRef,
          );
          return;
        }
        setRequestError(
          error instanceof AgentRunObserverApiError
            ? error
            : new AgentRunObserverApiError({
                status: 0,
                message: "The saved external-agent binding is unavailable.",
              }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeChatSessionId,
    binding,
    bindingStorageRevision,
    boundChatSessionId,
    clearUnavailableObserverBinding,
    observerAvailable,
  ]);

  useEffect(() => {
    if (!binding || binding.status !== "pending_claim" || disconnecting) {
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    const refresh = async (): Promise<void> => {
      try {
        const receipt = await agentRunObserverApi.getBinding(
          binding.binding_ref,
        );
        if (cancelled) return;
        setBinding(receipt.binding);
        setRequestError(null);
        if (receipt.binding.status !== "pending_claim") {
          setClaimHandle(null);
        }
        if (receipt.binding.status === "pending_claim") {
          timer = window.setTimeout(() => void refresh(), BINDING_REFRESH_MS);
        }
      } catch (error) {
        if (cancelled) return;
        if (isUnavailableObserverBindingError(error) && boundChatSessionId) {
          clearUnavailableObserverBinding(
            boundChatSessionId,
            binding.binding_ref,
          );
          return;
        }
        setRequestError(
          error instanceof AgentRunObserverApiError
            ? error
            : new AgentRunObserverApiError({
                status: 0,
                message: "The external-agent binding could not be refreshed.",
              }),
        );
      }
    };
    timer = window.setTimeout(() => void refresh(), BINDING_REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    binding,
    boundChatSessionId,
    clearUnavailableObserverBinding,
    disconnecting,
  ]);

  const controller = useAgentRunObserver({
    chatSessionId: boundChatSessionId,
    bindingRef: binding?.binding_ref ?? null,
    enabled: observerAvailable && binding?.status === "active",
  });

  useEffect(() => {
    if (
      !isUnavailableObserverBindingError(controller.error) ||
      !binding ||
      !boundChatSessionId
    ) {
      return;
    }
    clearUnavailableObserverBinding(boundChatSessionId, binding.binding_ref);
  }, [
    binding,
    boundChatSessionId,
    clearUnavailableObserverBinding,
    controller.error,
  ]);

  const authorizeChat = useCallback(
    async (
      chatSessionId: string,
      includeSelectedContext: boolean,
    ): Promise<void> => {
      const session = useAgiChatStore.getState().sessions[chatSessionId];
      if (!session) return;
      setCreating(true);
      setRequestError(null);
      setClaimHandle(null);
      try {
        const receipt = await agentRunObserverApi.createBinding({
          chat_session_id: chatSessionId,
          context: buildSelectedChatContextSnapshot({
            session,
            includeContext: includeSelectedContext,
          }),
        });
        setBinding(receipt.binding);
        setBoundChatSessionId(chatSessionId);
        setClaimHandle(receipt.claim_handle);
        storeAgentRunObserverBinding({
          bindingRef: receipt.binding.binding_ref,
          chatSessionId,
        });
      } catch (error) {
        setRequestError(
          error instanceof AgentRunObserverApiError
            ? error
            : new AgentRunObserverApiError({
                status: 0,
                message: "The selected chat could not be authorized.",
              }),
        );
      } finally {
        setCreating(false);
      }
    },
    [],
  );

  const authorizeDedicatedChat = useCallback((): void => {
    const chatSessionId = newChatSession(
      `Shared Live Room agent (${contextId.trim() || "Helix Ask"})`,
      `${contextId.trim() || "helix-ask"}:shared-live-room-agent`,
    );
    setActiveChatSession(chatSessionId);
    void authorizeChat(chatSessionId, false);
  }, [authorizeChat, contextId, newChatSession, setActiveChatSession]);

  const disconnectBinding = useCallback(async (): Promise<void> => {
    if (!binding || !boundChatSessionId || disconnecting) return;
    setDisconnecting(true);
    setRequestError(null);
    try {
      try {
        await agentRunObserverApi.disconnectBinding(binding.binding_ref);
      } catch (error) {
        const alreadyDetached =
          error instanceof AgentRunObserverApiError &&
          (error.status === 404 || error.status === 410);
        if (!alreadyDetached) throw error;
      }
      removeStoredAgentRunObserverBinding(
        boundChatSessionId,
        binding.binding_ref,
      );
      setClaimHandle(null);
      setBinding(null);
      setBoundChatSessionId(null);
    } catch (error) {
      setRequestError(
        error instanceof AgentRunObserverApiError
          ? error
          : new AgentRunObserverApiError({
              status: 0,
              message: "The external-agent binding could not be disconnected.",
            }),
      );
    } finally {
      setDisconnecting(false);
    }
  }, [binding, boundChatSessionId, disconnecting]);

  const selectedChatLabel = useMemo(
    () => activeChatSession?.title?.trim() || "Selected Helix chat",
    [activeChatSession?.title],
  );

  if (!observerAvailable) return null;

  if (binding && boundChatSessionId) {
    return (
      <AgentRunObserverLane
        binding={binding}
        claimHandle={claimHandle}
        className={className}
        disconnecting={disconnecting}
        onDisconnect={disconnectBinding}
        controller={{
          ...controller,
          error: controller.error ?? requestError,
        }}
      />
    );
  }

  return (
    <section
      aria-label="Authorize external agent"
      className={[
        "rounded-lg border border-slate-700/70 bg-slate-950/50 p-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-200">
        External agent observer
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        Bind one agent run to one chat. The agent receives only an opaque claim
        handle and cannot list your other chats.
      </p>
      {activeChatSession ? (
        <label className="mt-3 flex items-start gap-2 text-xs text-slate-300">
          <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.agent-run-observer-binding-surface.input"
            checked={includeContext}
            className="mt-0.5"
            onChange={(event) => setIncludeContext(event.target.checked)}
            type="checkbox"
          />
          Include a bounded recent snapshot from “{selectedChatLabel}” as
          conversation context only
        </label>
      ) : (
        <p className="mt-3 text-xs text-amber-300">
          Select an existing Helix chat, or create a dedicated room chat.
        </p>
      )}
      {requestError ? (
        <p className="mt-3 text-xs text-rose-300" role="alert">
          {requestError.message}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.agent-run-observer-binding-surface.if-active-chat-session-id-void-authorize-chat-active-chat-session-id-inc"
          className="rounded border border-cyan-700 px-2 py-1 text-xs text-cyan-100 disabled:opacity-40"
          disabled={!activeChatSessionId || creating}
          onClick={() => {
            if (activeChatSessionId) {
              void authorizeChat(activeChatSessionId, includeContext);
            }
          }}
          type="button"
        >
          {creating ? "Authorizing…" : "Authorize selected chat"}
        </button>
        <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.agent-run-observer-binding-surface.create-dedicated-room-chat"
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
          disabled={creating}
          onClick={authorizeDedicatedChat}
          type="button"
        >
          Create dedicated room chat
        </button>
      </div>
    </section>
  );
}
