import React, { useEffect, useRef, useState } from "react";
import { discordTaskConfigurationSchema, type DiscordTaskConfiguration } from "@shared/discord-task-configuration";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { DiscordTaskConfigurationView } from "./DiscordTaskConfigurationView";

/** Website session only. Native metadata is read through its separately
 * authorized, protected task connection in CaptainKeyesTaskAccess. */
export function DiscordTaskConnections({ profileRef, accountSessionRef }: {
  profileRef: string | null; accountSessionRef: string | null;
}) {
  const [refresh, setRefresh] = useState(0), generation = useRef(0);
  const [result, setResult] = useState<{ key: string; state: "ready" | "unavailable" | "hidden"; configuration?: DiscordTaskConfiguration } | null>(null);
  const native = Boolean((window as Window & { casimirDesktop?: unknown }).casimirDesktop);
  const key = JSON.stringify([profileRef, accountSessionRef, refresh]);
  useEffect(() => {
    const invalidate = () => { generation.current++; setResult(null); setRefresh(value => value + 1); };
    window.addEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, invalidate);
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, invalidate);
    return () => { generation.current++; window.removeEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, invalidate);
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, invalidate); };
  }, []);
  useEffect(() => {
    const current = ++generation.current, controller = new AbortController();
    setResult(null);
    if (!profileRef || !accountSessionRef || native) return () => controller.abort();
    void (async () => {
      try {
        const response = await fetch("/api/discord/task-configuration", { credentials: "same-origin", cache: "no-store", signal: controller.signal,
          headers: { Accept: "application/json" } });
        if ([401, 403, 404].includes(response.status)) {
          if (generation.current === current) setResult({ key, state: "hidden" }); return;
        }
        if (!response.ok) throw new Error("configuration_unavailable");
        const body = await response.json(), parsed = discordTaskConfigurationSchema.safeParse(body.configuration);
        if (!body.ok || !parsed.success || parsed.data.owner_profile_ref !== profileRef) throw new Error("configuration_invalid");
        if (generation.current === current) setResult({ key, state: "ready", configuration: parsed.data });
      } catch { if (generation.current === current && !controller.signal.aborted) setResult({ key, state: "unavailable" }); }
    })();
    return () => { controller.abort(); if (generation.current === current) generation.current++; };
  }, [key, profileRef, accountSessionRef, native]);
  if (native || !profileRef || !accountSessionRef || result?.key !== key || result.state === "hidden") return null;
  return <section className="mt-6 rounded-2xl border border-cyan-200/20 bg-slate-950/40 p-5 text-slate-200" aria-label="Captain Keyes saved setup">
    <h2 className="mb-3 text-lg font-semibold">Captain Keyes saved setup</h2>
    {result.configuration ? <DiscordTaskConfigurationView configuration={result.configuration} /> : <p role="status">Saved Discord setup could not be loaded.</p>}
    <button data-helix-control-id="workstation.panel.account-session.discord-task-connections.refresh-saved-setup" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" className="mt-4 rounded border border-white/20 px-3 py-2 text-sm" onClick={() => setRefresh(value => value + 1)}>Refresh saved setup</button>
  </section>;
}
