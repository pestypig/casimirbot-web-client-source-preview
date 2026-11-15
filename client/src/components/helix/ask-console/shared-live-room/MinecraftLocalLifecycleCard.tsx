import React, { useEffect, useRef, useState } from "react";
import { Gamepad2, Loader2 } from "lucide-react";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { helixMinecraftLocalLifecycleReceiptSchema, helixMinecraftLoopbackAddressSchema,
  helixMinecraftLocalServerLifecycleSchema } from "@shared/helix-minecraft-local-lifecycle";

const ENDPOINT =
  "/api/agi/environment-connectors/local/minecraft/fabric-loopback/launch";

type LifecycleResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  server_lifecycle?: unknown;
  receipt?: {
    launcher_action?: string;
    connection_action?: string;
    server_address?: string;
  };
};

export type MinecraftLocalLifecycleResult = Readonly<{
  launcherAction: string;
  connectionAction: string;
  serverAddress: string;
}>;

export const launchMinecraftLocalLifecycle = async (signal?: AbortSignal): Promise<MinecraftLocalLifecycleResult> => {
  const account = new AbortController();
  const changed = () => account.abort(new DOMException("Account changed", "AbortError"));
  window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
  try {
    const operationSignal = AbortSignal.any([account.signal, ...(signal ? [signal] : [])]);
    operationSignal.throwIfAborted();
    const selectionSignal = AbortSignal.any([operationSignal, AbortSignal.timeout(10_000)]);
    const selectionResponse = await fetch(ENDPOINT.replace(/launch$/, "selection"), { credentials: "include", signal: selectionSignal });
    selectionSignal.throwIfAborted();
    const selection = await selectionResponse.json().catch(() => null);
    selectionSignal.throwIfAborted();
    const address = helixMinecraftLoopbackAddressSchema.safeParse(selection?.address);
    if (!selectionResponse.ok || selection?.ok !== true || !address.success) {
      throw new Error(selection?.message ?? "Select a prepared local server and player profile in desktop setup.");
    }
    const launchSignal = AbortSignal.any([operationSignal, AbortSignal.timeout(280_000)]);
    launchSignal.throwIfAborted();
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal: launchSignal,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: address.data,
        operator_confirmation: true,
      }),
    });
    launchSignal.throwIfAborted();
    const body = (await response.json().catch(() => null)) as
      | LifecycleResponse
      | null;
    launchSignal.throwIfAborted();
    if (!response.ok || body?.ok !== true) {
      const server = helixMinecraftLocalServerLifecycleSchema.safeParse(body?.server_lifecycle);
      const partial = server.success
        ? ` Server ${server.data.status} was observed at ${server.data.observed_at}; client setup did not complete.`
        : "";
      throw new Error(
        (body?.message ?? body?.error ?? "Minecraft lifecycle request failed.") + partial,
      );
    }
    const receipt = helixMinecraftLocalLifecycleReceiptSchema.safeParse(body.receipt);
    if (!receipt.success) throw new Error("Minecraft returned an incomplete startup receipt. Check setup before retrying.");
    return {
      launcherAction: receipt.data.launcher_action,
      connectionAction: receipt.data.connection_action,
      serverAddress: receipt.data.server_address,
    };
  } finally {
    window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
  }
};

export function MinecraftLocalLifecycleCard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const cancel = () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
    const changed = () => {
      cancel();
      setBusy(false);
      setMessage(null);
      setOk(false);
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => {
      cancel();
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    };
  }, []);

  const launchAndJoin = async (): Promise<void> => {
    if (activeRequest.current) return;
    const request = new AbortController();
    activeRequest.current = request;
    const current = () => activeRequest.current === request && !request.signal.aborted;
    setBusy(true);
    setMessage(null);
    setOk(false);
    try {
      const receipt = await launchMinecraftLocalLifecycle(request.signal);
      if (!current()) return;
      setOk(true);
      setMessage(
        `Client setup completed for ${receipt.serverAddress} (${receipt.launcherAction}, ${receipt.connectionAction}). Waiting for game observation.`,
      );
    } catch (error) {
      if (!current()) return;
      setMessage(
        error instanceof Error
          ? error.message
          : "Minecraft lifecycle request failed.",
      );
    } finally {
      if (current()) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <div className="rounded border border-cyan-300/20 bg-cyan-400/5 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1 text-[10px] font-semibold text-cyan-100">
            <Gamepad2 className="h-3 w-3" />
            Local Minecraft server and client
          </p>
          <p className="mt-0.5 text-[9px] text-cyan-100/60">
            Start your saved local server and prepared client. Existing EULA acceptance is required; game permissions stay separate.
          </p>
        </div>
        <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.minecraft-local-lifecycle-card.void-launch-and-join"
          type="button"
          disabled={busy}
          onClick={() => void launchAndJoin()}
          className="rounded border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-50"
        >
          {busy ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Starting…
            </span>
          ) : (
            "Start saved Minecraft setup"
          )}
        </button>
      </div>
      {message ? (
        <p className={`mt-1.5 text-[9px] ${ok ? "text-emerald-200" : "text-rose-200"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
