import React, { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import {
  parseDesktopUpdateState,
  type DesktopUpdateState,
} from "@shared/desktop-update";
import { useRuntimeSurface } from "@/lib/runtime/RuntimeSurfaceProvider";

const phaseLabel: Record<DesktopUpdateState["phase"], string> = {
  unavailable: "Native updates unavailable",
  idle: "Ready to check",
  checking: "Checking for updates",
  available: "Update available",
  downloading: "Downloading verified update",
  downloaded: "Ready to install",
  error: "Update check failed",
};

const updateErrorMessage = (code: string): string => {
  if (code === "update_install_incomplete") {
    return "The update handoff did not reach the new version. CasimirBot is still on the previous version. Retry a verified update or use the signed repair installer; automatic downgrade is disabled.";
  }
  if (code === "update_handoff_storage_failed") {
    return "CasimirBot could not save the update recovery record, so installation was not started. Restart and try again.";
  }
  if (code === "update_handoff_failed") {
    return "The installer handoff could not start. CasimirBot stayed open and the update was not applied.";
  }
  if (code === "release_manifest_verification_failed") {
    return "The signed release manifest did not match this update channel. The installer was not downloaded.";
  }
  return code;
};

type PrivateDevUpdateState = {
  phase: "unavailable" | "idle" | "ready" | "restarting" | "error";
  runningBuild: string | null;
  selectedBuild: string | null;
  pendingBuild: string | null;
  rollbackBuild: string | null;
  profileSelected: boolean;
  lastHandoff: { from: string; to: string; at: string } | null;
  errorCode: string | null;
};

const parsePrivateDevUpdateState = (value: unknown): PrivateDevUpdateState | null => {
  if (!value || typeof value !== "object") return null;
  const state = value as Record<string, unknown>;
  if (!["unavailable", "idle", "ready", "restarting", "error"].includes(String(state.phase))) return null;
  return state as PrivateDevUpdateState;
};

const privateUpdateError = (code: string | null): string => {
  if (code === "minecraft_must_close_before_update") return "Minecraft or its Fabric server is still running. Finish the current control session and close it before restarting CasimirBot.";
  if (code === "minecraft_process_check_unavailable") return "CasimirBot could not verify that Minecraft control is stopped. Restart was not started.";
  if (code === "private_channel_running_build_mismatch") return "This window is not the build selected by the private launcher. Close it and use the stable launcher before switching again.";
  if (code === "private_channel_handoff_not_ready") return "The staged build changed or is not ready. Refresh and verify it before restarting.";
  if (code === "private_channel_invalid_handoff_request") return "The previous restart request failed before changing builds. The current build and staged candidate are retained; retry after updating the private launcher.";
  if (code === "private_channel_old_process_did_not_exit" || code === "close_running_casimirbot_before_private_launch") return "The previous restart stopped safely because CasimirBot was still running. Close the other CasimirBot window before retrying.";
  return "The private build could not be verified or restarted. The running EXE was left in place.";
};

export default function DesktopUpdatePanel() {
  const runtime = useRuntimeSurface();
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  const [privateState, setPrivateState] = useState<PrivateDevUpdateState | null>(null);
  const [privateDeferred, setPrivateDeferred] = useState(false);

  const acceptState = useCallback((candidate: unknown) => {
    const parsed = parseDesktopUpdateState(candidate);
    if (parsed) setState(parsed);
  }, []);

  useEffect(() => {
    const bridge = window.casimirDesktop;
    if (
      !runtime.capabilities.nativeBinaryUpdate ||
      !bridge?.getUpdateState ||
      !bridge.onUpdateState
    ) {
      setState(null);
      return;
    }
    let active = true;
    void bridge.getUpdateState().then((candidate) => {
      if (active) acceptState(candidate);
    });
    const unsubscribe = bridge.onUpdateState((candidate) => {
      if (active) acceptState(candidate);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [acceptState, runtime.capabilities.nativeBinaryUpdate]);

  const refreshPrivateState = useCallback(async () => {
    const bridge = window.casimirDesktop;
    if (!bridge?.getPrivateDevUpdateState) return;
    try { setPrivateState(parsePrivateDevUpdateState(await bridge.getPrivateDevUpdateState())); }
    catch { setPrivateState(null); }
  }, []);

  useEffect(() => {
    if (!window.casimirDesktop?.getPrivateDevUpdateState) return;
    void refreshPrivateState();
    const timer = window.setInterval(() => void refreshPrivateState(), 30_000);
    const onFocus = () => void refreshPrivateState();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshPrivateState]);

  const restartPrivate = async () => {
    const operation = window.casimirDesktop?.restartIntoPrivateDevUpdate;
    if (!operation) return;
    try { setPrivateState(parsePrivateDevUpdateState(await operation())); }
    catch { setPrivateState(current => current ? { ...current, phase: "error", errorCode: "private_channel_handoff_start_failed" } : null); }
  };

  const runAction = async (
    action: "checkForUpdates" | "downloadUpdate" | "installUpdate",
  ) => {
    const operation = window.casimirDesktop?.[action];
    if (!operation) return;
    acceptState(await operation());
  };

  if (!runtime.capabilities.nativeBinaryUpdate || !state) {
    if (privateState && privateState.phase !== "unavailable") {
      return (
        <section className="flex h-full flex-col bg-slate-950 text-slate-100" data-testid="private-dev-update-panel">
          <header className="border-b border-slate-800 px-5 py-4">
            <h1 className="text-base font-semibold">Desktop Updates</h1>
            <p className="mt-1 text-xs text-slate-400">Private development channel · not a signed public installer</p>
          </header>
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900/70 p-6">
              <p className="text-sm font-semibold">{privateState.phase === "ready"
                ? privateDeferred ? "Update ready for later" : "Verified build ready"
                : privateState.phase === "restarting" ? "Restarting into verified build"
                  : privateState.phase === "error" ? "Private update needs attention" : "Current private build"}</p>
              <p className="mt-2 text-xs text-slate-300">Running {privateState.runningBuild ?? "unknown"}</p>
              {privateState.pendingBuild ? <p className="mt-1 text-xs text-cyan-200">Staged {privateState.pendingBuild}</p> : null}
              {privateState.rollbackBuild ? <p className="mt-1 text-xs text-slate-400">Rollback retained: {privateState.rollbackBuild}</p> : null}
              {privateState.lastHandoff ? <p className="mt-2 text-xs text-slate-400">Last switch: {privateState.lastHandoff.from} → {privateState.lastHandoff.to}</p> : null}
              {privateState.errorCode ? <p className="mt-3 rounded border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-100">{privateUpdateError(privateState.errorCode)}</p> : null}
              <p className="mt-4 text-xs text-slate-400">The same profile is retained. An unexpired exact-task pairing may recover, but Full Harness must be enabled by its owner again after restart. No Minecraft control or grant is renewed by updating.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setPrivateDeferred(false); void refreshPrivateState(); }}
                  className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs hover:border-cyan-400/50">Refresh</button>
                {privateState.phase === "ready" && !privateDeferred ? <>
                  <button type="button" onClick={() => void restartPrivate()}
                    className="rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400">Restart into verified build</button>
                  <button type="button" onClick={() => setPrivateDeferred(true)}
                    className="rounded-md border border-slate-700 px-3 py-2 text-xs hover:border-slate-500">Later</button>
                </> : null}
                {privateState.phase === "ready" && privateDeferred ? <button type="button" onClick={() => setPrivateDeferred(false)}
                  className="rounded-md bg-slate-700 px-3 py-2 text-xs hover:bg-slate-600">Review update</button> : null}
              </div>
            </div>
          </div>
        </section>
      );
    }
    return (
      <section className="flex h-full items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="max-w-md rounded-xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <h1 className="mt-3 text-base font-semibold">Desktop Updates</h1>
          <p className="mt-2 text-sm text-slate-400">
            This build has no installed update channel. Use a newer verified installer
            to replace this developer package.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col bg-slate-950 text-slate-100" data-testid="desktop-update-panel">
      <header className="border-b border-slate-800 px-5 py-4">
        <h1 className="text-base font-semibold">Desktop Updates</h1>
        <p className="mt-1 text-xs text-slate-400">
          CasimirBot checks automatically. You choose when to download and restart to install.
        </p>
      </header>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{phaseLabel[state.phase]}</p>
              <p className="mt-1 text-xs text-slate-400">Installed version {state.currentVersion}</p>
              {state.availableVersion ? (
                <p className="mt-1 text-xs text-cyan-200">Available version {state.availableVersion}</p>
              ) : null}
              {state.phase === "downloaded" ? (
                <p className="mt-2 text-xs text-slate-300">
                  Your profile stays in place. This update installs only if you choose “Restart and install”; closing CasimirBot will not install it.
                </p>
              ) : null}
            </div>
            <ShieldCheck className="h-6 w-6 text-emerald-300" aria-hidden="true" />
          </div>

          {state.progressPercent !== null ? (
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>Download</span>
                <span>{state.progressPercent.toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-slate-800">
                <div
                  className="h-full bg-cyan-400 transition-[width]"
                  style={{ width: `${state.progressPercent}%` }}
                />
              </div>
            </div>
          ) : null}

          {state.errorCode ? (
            <p className="mt-4 rounded border border-rose-400/30 bg-rose-400/10 p-3 font-mono text-xs text-rose-100">
              {updateErrorMessage(state.errorCode)}
            </p>
          ) : null}

          <p className="mt-4 text-xs text-slate-400">
            Updating the app does not renew task pairings, tunnel trust, or other security grants.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {state.canCheck ? (
              <button
                type="button"
                onClick={() => void runAction("checkForUpdates")}
                className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs hover:border-cyan-400/50"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Check for updates
              </button>
            ) : null}
            {state.canDownload ? (
              <button
                type="button"
                onClick={() => void runAction("downloadUpdate")}
                className="inline-flex items-center gap-2 rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download update
              </button>
            ) : null}
            {state.canInstall ? (
              <button
                type="button"
                onClick={() => void runAction("installUpdate")}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Restart and install
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
