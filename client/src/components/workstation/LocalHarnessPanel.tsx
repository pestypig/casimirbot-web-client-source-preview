import React, { useCallback, useEffect, useState } from "react";
import { Laptop, RefreshCw, ShieldCheck, Users } from "lucide-react";
import {
  helixLocalSupervisorStatusSchema,
  type HelixLocalSupervisorStatus,
} from "@shared/helix-local-supervisor";
import { useRuntimeSurface } from "@/lib/runtime/RuntimeSurfaceProvider";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";

const SUPERVISOR_ENDPOINT = "/api/local-supervisor/status";

const statusLabel = (status: HelixLocalSupervisorStatus | null): string => {
  if (
    status?.ready === true &&
    status.one_instance_enforced === true &&
    (status.supervisor_mode === "desktop_single_instance" ||
      status.supervisor_mode === "external_keyed_launcher")
  ) return "Ready";
  return status ? "Not protected" : "Unavailable";
};

const statusDetail = (status: HelixLocalSupervisorStatus | null): string => {
  if (status?.supervisor_mode === "desktop_single_instance") {
    return "The installed EXE started and supervises one private CasimirBot node. You do not need an opaque launcher or a developer account for this local bootstrap.";
  }
  if (status?.supervisor_mode === "external_keyed_launcher") {
    return "This source-tree node has a verified signed developer-launcher receipt. Normal users receive the equivalent boundary automatically from the installed EXE.";
  }
  if (status) {
    return "This service is an ordinary external process. Open the installed CasimirBot EXE for the protected user harness; a child UI cannot upgrade its parent process.";
  }
  return "The installed-node supervisor could not be verified. No key, receipt, process identity, workspace path, or private endpoint is exposed here.";
};

export default function LocalHarnessPanel() {
  const runtime = useRuntimeSurface();
  const openPanel = useWorkstationLayoutStore((state) =>
    state.openPanelInActiveGroup);
  const [status, setStatus] = useState<HelixLocalSupervisorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (runtime.surface !== "desktop_native" || runtime.nativeHandshake !== "ready") {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(SUPERVISOR_ENDPOINT, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const parsed = helixLocalSupervisorStatusSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!response.ok || !parsed.success) {
        throw new Error("Local harness status failed verification.");
      }
      setStatus(parsed.data);
    } catch (caught) {
      setStatus(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [runtime.nativeHandshake, runtime.surface]);

  useEffect(() => {
    void load();
  }, [load]);

  if (runtime.surface !== "desktop_native") {
    return (
      <main className="flex min-h-full items-center justify-center bg-slate-950 p-6 text-slate-100">
        <section className="max-w-lg rounded-xl border border-cyan-300/20 bg-cyan-500/[0.06] p-6">
          <Laptop className="h-8 w-8 text-cyan-200" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">Installed app required</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            The local harness is supervised by the installed CasimirBot EXE. A
            website tab cannot become the device supervisor.
          </p>
        </section>
      </main>
    );
  }

  const label = statusLabel(status);
  return (
    <main className="min-h-full bg-slate-950 p-5 text-slate-100" data-testid="local-harness-panel">
      <header className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 via-slate-950 to-violet-500/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
              Installed CasimirBot node
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Local Harness</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Verify the protected service shared by this EXE and authorized AI
              clients. Supervisor readiness is device-local and does not require
              sign-in.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || runtime.nativeHandshake !== "ready"}
            data-helix-control-id="workstation.panel.local-harness.refresh"
            data-helix-interaction-kind="observe"
            data-helix-authority-state="client_local"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-xs disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh status
          </button>
        </div>
      </header>

      <section className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="rounded-xl border border-white/10 bg-black/25 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-cyan-200" />
              <h2 className="font-semibold">Installed node supervisor</h2>
            </div>
            <span className={`rounded-full border px-2 py-1 text-xs ${
              label === "Ready"
                ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-100"
                : "border-amber-300/30 bg-amber-400/10 text-amber-100"
            }`}>
              {label}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{statusDetail(status)}</p>
          {error ? <p role="alert" className="mt-3 text-xs text-rose-200">{error}</p> : null}
        </article>

        <article className="rounded-xl border border-white/10 bg-black/25 p-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-200" />
            <h2 className="font-semibold">When sign-in is required</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Sign in when you connect an MCP client, join or create a shared room,
            or grant access to a profile-owned environment. Sign-in never exposes
            the supervisor key and does not create mutation authority.
          </p>
          <button
            type="button"
            onClick={() => openPanel("account-session")}
            data-helix-control-id="workstation.panel.local-harness.open-account-session"
            data-helix-interaction-kind="navigate"
            data-helix-authority-state="client_local"
            className="mt-4 rounded border border-violet-300/30 px-3 py-2 text-xs text-violet-100"
          >
            Open Account &amp; Sessions
          </button>
        </article>
      </section>
    </main>
  );
}
