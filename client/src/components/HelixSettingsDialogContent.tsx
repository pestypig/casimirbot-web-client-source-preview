import * as React from "react";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AgiKnowledgePanel } from "@/components/AgiKnowledgePanel";
import CoreKnowledgePanel from "@/components/CoreKnowledgePanel";
import { buildHelixAskMathRenderDebugForText } from "@/lib/helix/ask-answer-rendering";
import type { SettingsTab, StartSettings } from "@/hooks/useHelixStartSettings";
import { isFlagEnabled } from "@/lib/envFlags";
import {
  getVoiceCaptureDiagnosticsSnapshot,
  subscribeVoiceCaptureDiagnostics,
  type VoiceCaptureCheckpointStatus,
  type VoiceCaptureDiagnosticsSnapshot,
  type VoiceLaneTimelineDebugEvent,
  type VoiceCaptureWarningCode,
} from "@/lib/helix/voice-capture-diagnostics";
import {
  buildAlcubierreDebugLogExport,
  clearAlcubierreDebugEvents,
  getAlcubierreDebugLogSnapshot,
  subscribeAlcubierreDebugLog,
  type AlcubierreDebugEvent,
  type AlcubierreDebugLogSnapshot,
} from "@/lib/alcubierre-debug-log";
import {
  buildWorkstationDebugExport,
  clearWorkstationDebugEvents,
  getWorkstationDebugSnapshot,
  subscribeWorkstationDebug,
  type WorkstationDebugEvent,
  type WorkstationDebugSnapshot,
} from "@/lib/helix/workstation-debug";
import {
  buildDottieVoiceDebugClipExport,
  clearDottieVoiceDebugClips,
  getDottieVoiceDebugClipsSnapshot,
  subscribeDottieVoiceDebugClips,
  type DottieVoiceDebugClip,
} from "@/lib/helix/dottie-voice-debug-clips";

type Props = {
  settingsTab: SettingsTab;
  onSettingsTabChange: (tab: SettingsTab) => void;
  userSettings: StartSettings;
  updateSettings: (patch: Partial<StartSettings>) => void;
  onClearSavedChoice?: () => void;
  onClose: () => void;
};

const VOICE_WARNING_LABEL: Record<VoiceCaptureWarningCode, string> = {
  loopback_source: "Input appears to be loopback/output source.",
  flat_signal: "Signal looks flat for the active track.",
  recorder_stalled: "Recorder heartbeat stalled (no chunks recently).",
};

const VOICE_CHECKPOINT_STATUS_CLASS: Record<VoiceCaptureCheckpointStatus, string> = {
  idle: "border-slate-300/25 bg-slate-400/10 text-slate-200",
  ok: "border-emerald-300/40 bg-emerald-500/12 text-emerald-100",
  warn: "border-amber-300/40 bg-amber-500/12 text-amber-100",
  error: "border-rose-300/45 bg-rose-500/15 text-rose-100",
};

export function HelixSettingsDialogContent({
  settingsTab,
  onSettingsTabChange,
  userSettings,
  updateSettings,
  onClearSavedChoice,
  onClose,
}: Props) {
  const knowledgeEnabled = isFlagEnabled("ENABLE_KNOWLEDGE_PROJECTS", true);
  const activeSection = knowledgeEnabled ? settingsTab : "preferences";
  const [knowledgeSource, setKnowledgeSource] = React.useState<"my" | "core">("my");
  const [voiceDiagnostics, setVoiceDiagnostics] = React.useState<VoiceCaptureDiagnosticsSnapshot | null>(() =>
    getVoiceCaptureDiagnosticsSnapshot(),
  );

  React.useEffect(() => {
    setVoiceDiagnostics(getVoiceCaptureDiagnosticsSnapshot());
    return subscribeVoiceCaptureDiagnostics((snapshot) => {
      setVoiceDiagnostics(snapshot);
    });
  }, []);

  const helixAskUnifiedDebugEnabled = userSettings.showHelixAskDebug;

  return (
    <DialogContent className="max-h-[88vh] w-full max-w-[min(44rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-0 text-slate-100 shadow-xl">
      <div className="sticky top-0 z-10 border-b border-slate-700 bg-slate-950 px-4 py-3">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Helix Start Settings</DialogTitle>
          <DialogDescription className="text-slate-300">
            Tune this device behavior with simple controls.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="helix-settings-section" className="text-xs font-medium text-slate-300">
            Section
          </label>
          <select
            id="helix-settings-section"
            value={activeSection}
            onChange={(event) => onSettingsTabChange(event.target.value as SettingsTab)}
            className="h-9 min-w-[220px] rounded-md border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100"
          >
            <option value="preferences">Preferences</option>
            {knowledgeEnabled ? <option value="knowledge">AGI Knowledge</option> : null}
          </select>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        {activeSection === "preferences" ? (
          <>
            <PreferenceToggleRow
              id="remember-choice"
              label="Remember my mission view"
              description="Auto-select the profile you last explored."
              checked={userSettings.rememberChoice}
              onChange={(value) => updateSettings({ rememberChoice: value })}
            />
            <PreferenceToggleRow
              id="prefer-desktop"
              label="Prefer Desktop launch"
              description="Use Desktop as the primary action button."
              checked={userSettings.preferDesktop}
              onChange={(value) => updateSettings({ preferDesktop: value })}
            />
            <PreferenceToggleRow
              id="show-moral"
              label="Show mission mantra"
              description="Keep the profile quote visible."
              checked={userSettings.showZen}
              onChange={(value) => updateSettings({ showZen: value })}
            />
            <PreferenceToggleRow
              id="splash-cursor"
              label="Splash cursor trail"
              description="Show a cursor ribbon effect."
              checked={userSettings.enableSplashCursor}
              onChange={(value) => updateSettings({ enableSplashCursor: value })}
            />
            <PreferenceToggleRow
              id="helix-voice-noisy-environment-mode"
              label="Noisy environment mode"
              description="Harden voice interruption/noise filters for loud places while keeping hands-free listening."
              checked={userSettings.voiceNoisyEnvironmentMode}
              onChange={(value) => updateSettings({ voiceNoisyEnvironmentMode: value })}
            />
            <PreferenceToggleRow
              id="helix-ask-debug"
              label="Helix Ask unified debug"
              description="Single toggle for Helix Ask + voice event timeline debug context, reasoning event log, and Unified Debug Copy surfaces."
              checked={helixAskUnifiedDebugEnabled}
              onChange={(value) => updateSettings({ showHelixAskDebug: value })}
            />
            <PreferenceToggleRow
              id="helix-ask-console-debug"
              label="Helix Ask console debug"
              description="Show the console turn assembly snapshot used to order active stream rows and completed replies."
              checked={userSettings.showHelixAskConsoleDebug}
              onChange={(value) => updateSettings({ showHelixAskConsoleDebug: value })}
            />
            <PreferenceToggleRow
              id="helix-ask-observer-lane"
              label="Show Observer lane"
              description="Render a live overseer interpretation lane in Helix Ask while actions run."
              checked={userSettings.showHelixAskObserverLane}
              onChange={(value) => updateSettings({ showHelixAskObserverLane: value })}
            />
            <PreferenceToggleRow
              id="dottie-voice-debug-clips"
              label="Dottie voice debug clips"
              description="Show receipt-backed text previews that would be sent to Auntie Dottie before any audio is spoken."
              checked={userSettings.showDottieVoiceDebugClips}
              onChange={(value) => updateSettings({ showDottieVoiceDebugClips: value })}
            />
            {userSettings.showDottieVoiceDebugClips ? <DottieVoiceDebugClipsPanel /> : null}
            {helixAskUnifiedDebugEnabled ? (
              <>
                <HelixAskDebugContextPanel snapshot={voiceDiagnostics} />
                <HelixAskMathFormattingDebugPanel snapshot={voiceDiagnostics} />
                <HelixAskReasoningEventLogPanel snapshot={voiceDiagnostics} />
                <VoiceEventTimelineDebugPanel snapshot={voiceDiagnostics} />
              </>
            ) : null}
            <div
              className="rounded-md border border-cyan-400/30 bg-cyan-950/25 px-3 py-2"
              role="status"
              aria-live="polite"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
                Alcubierre scientific lane policy
              </p>
              <p className="mt-1 text-xs text-cyan-50">
                Research-grade NHM2 frames are enforced globally. Non-scientific render fallbacks are disabled.
              </p>
            </div>
            <PreferenceToggleRow
              id="alcubierre-render-debug-log"
              label="Alcubierre render + calc debug log"
              description="Capture structured expected-vs-rendered warp viewer diagnostics with copy export."
              checked={userSettings.showAlcubierreRenderDebugLog}
              onChange={(value) => updateSettings({ showAlcubierreRenderDebugLog: value })}
            />
            {userSettings.showAlcubierreRenderDebugLog ? <AlcubierreRenderDebugLogPanel /> : null}
            <PreferenceToggleRow
              id="workstation-debug"
              label="Workstation event debug"
              description="Trace Situation Room sources, pipeline jobs, translations, and attachment events for browser UI tests."
              checked={userSettings.showWorkstationDebug}
              onChange={(value) => updateSettings({ showWorkstationDebug: value })}
            />
            {userSettings.showWorkstationDebug ? <WorkstationDebugPanel /> : null}
            <PreferenceToggleRow
              id="helix-voice-diagnostics"
              label="Voice capture diagnostics panel"
              description="Show live mic diagnostics in this settings dialog."
              checked={userSettings.showHelixVoiceCaptureDiagnostics}
              onChange={(value) => updateSettings({ showHelixVoiceCaptureDiagnostics: value })}
            />
            {userSettings.showHelixVoiceCaptureDiagnostics ? (
              <VoiceCaptureDiagnosticsPanel snapshot={voiceDiagnostics} />
            ) : null}
            <PreferenceToggleRow
              id="powershell-debug"
              label="Developer terminal (PowerShell)"
              description="Show local scratchpad command panel."
              checked={userSettings.showPowerShellDebug}
              onChange={(value) => updateSettings({ showPowerShellDebug: value })}
            />
            {userSettings.showPowerShellDebug ? (
              <PowerShellTerminalPad
                value={userSettings.powerShellScratch}
                onChange={(value) => updateSettings({ powerShellScratch: value })}
              />
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
                onClick={() => {
                  onClearSavedChoice?.();
                }}
              >
                Clear saved choice
              </button>
              <button
                className="rounded-md border border-cyan-300 bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-200"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </>
        ) : null}

        {activeSection === "knowledge" ? (
          <>
            {knowledgeEnabled ? (
              <>
                <div className="flex items-center gap-2">
                  <label htmlFor="helix-settings-knowledge-source" className="text-xs font-medium text-slate-300">
                    Knowledge source
                  </label>
                  <select
                    id="helix-settings-knowledge-source"
                    value={knowledgeSource}
                    onChange={(event) => setKnowledgeSource(event.target.value as "my" | "core")}
                    className="h-9 min-w-[220px] rounded-md border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100"
                  >
                    <option value="my">My Knowledge</option>
                    <option value="core">Core Knowledge (read-only)</option>
                  </select>
                </div>
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-slate-700 bg-slate-950 p-2">
                  {knowledgeSource === "my" ? <AgiKnowledgePanel /> : <CoreKnowledgePanel />}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-300">AGI Knowledge is disabled by feature flag.</p>
            )}
            <div className="flex justify-end pt-1">
              <button
                className="rounded-md border border-cyan-300 bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-200"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </>
        ) : null}
      </div>
    </DialogContent>
  );
}

function PreferenceToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-slate-100">{label}</p>
        <p className="text-xs text-slate-300">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
    </div>
  );
}

function DottieVoiceDebugClipsPanel() {
  const [clips, setClips] = React.useState<DottieVoiceDebugClip[]>(() => getDottieVoiceDebugClipsSnapshot());
  const [copied, setCopied] = React.useState(false);
  const exportPayload = React.useMemo(() => buildDottieVoiceDebugClipExport(clips), [clips]);

  React.useEffect(() => {
    setClips(getDottieVoiceDebugClipsSnapshot());
    return subscribeDottieVoiceDebugClips((nextClips) => {
      setClips(nextClips);
    });
  }, []);

  const handleCopy = async () => {
    if (!exportPayload || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(exportPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const handleClear = () => {
    clearDottieVoiceDebugClips();
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Dottie voice debug clips</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={clips.length === 0}
            className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
              clips.length > 0
                ? "border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700"
                : "border-slate-600 text-slate-500"
            }`}
          >
            clear
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!exportPayload}
            className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
              exportPayload
                ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-300/25"
                : "border-slate-600 text-slate-500"
            }`}
          >
            {copied ? "copied" : "copy clips"}
          </button>
        </div>
      </div>
      <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] leading-5 text-slate-200">
        <p>clips: {clips.length} | source: dottie voice proposal receipts | audio: not played</p>
      </div>
      {clips.length === 0 ? (
        <p className="text-xs text-slate-300">
          No Dottie voice proposals captured yet. Run a prompt that prepares a Dottie voice proposal from a public trace event.
        </p>
      ) : (
        <div className="max-h-[36vh] space-y-2 overflow-y-auto rounded border border-slate-700/80 bg-slate-950/70 p-2 font-mono text-[10px] leading-5 text-slate-200">
          {[...clips]
            .sort((a, b) => a.atMs - b.atMs)
            .slice(-80)
            .map((clip) => (
              <div key={clip.id} className="rounded border border-white/10 bg-white/5 p-1.5">
                <p className="whitespace-pre-wrap break-words text-slate-100">
                  {new Date(clip.atMs).toISOString()} | {clip.status} | mode={clip.voiceMode ?? "n/a"} | spoken=
                  {clip.spoken ? "yes" : "no"}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-cyan-100">
                  {clip.spokenText ? clipDiagnosticsText(clip.spokenText, 360) : "No spoken text available."}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-slate-400">
                  source={clip.sourceEventId} | observer={clip.observerId} | turn={clip.targetTurnId ?? "n/a"}
                  {clip.suppressionReason ? ` | suppressed=${clip.suppressionReason}` : ""}
                </p>
                <p className="whitespace-pre-wrap break-words text-slate-500">
                  spoken_hash={clip.spokenTextHash ?? "n/a"} | source_hash={clip.sourceTextHash ?? "n/a"} | max=
                  {clip.maxChars ?? "n/a"}
                </p>
                <details className="mt-1 rounded border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-slate-300">
                  <summary className="cursor-pointer select-none uppercase tracking-[0.14em] text-slate-400">
                    raw receipt
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(clip.receipt, null, 2)}</pre>
                </details>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function VoiceCaptureDiagnosticsPanel({
  snapshot,
}: {
  snapshot: VoiceCaptureDiagnosticsSnapshot | null;
}) {
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const [copied, setCopied] = React.useState(false);
  const exportPayload = React.useMemo(
    () => (snapshot ? buildVoiceAudioDebugCopyPayload(snapshot) : ""),
    [snapshot],
  );

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formatCaptureTimestamp = React.useCallback(
    (value: number | null): string => {
      if (value === null) return "never";
      const elapsedMs = Math.max(0, nowMs - value);
      if (elapsedMs < 1000) return "just now";
      if (elapsedMs < 60_000) return `${Math.round(elapsedMs / 1000)}s ago`;
      return `${Math.round(elapsedMs / 60_000)}m ago`;
    },
    [nowMs],
  );

  const handleCopy = async () => {
    if (!exportPayload || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(exportPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Capture diagnostics</p>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!exportPayload}
          className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
            exportPayload
              ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-300/25"
              : "border-slate-600 text-slate-500"
          }`}
        >
          {copied ? "copied" : "copy audio debug"}
        </button>
      </div>
      {!snapshot ? (
        <p className="text-xs text-slate-300">
          No active voice capture yet. Enable the mic in Helix Ask to stream diagnostics here.
        </p>
      ) : (
        <div className="max-h-[44vh] space-y-2 overflow-y-auto pr-1 text-[10px] text-foreground/90">
          <p className="uppercase tracking-[0.14em] text-slate-400">
            Input level{" "}
            {snapshot.voiceSignalState === "speech"
              ? "(speech-level signal)"
              : snapshot.voiceSignalState === "low"
                ? "(low-level signal)"
                : "(waiting for device audio)"}
          </p>
          <div className="grid grid-cols-12 gap-0.5 rounded border border-white/10 bg-slate-900/70 p-1">
            {Array.from({ length: 12 }).map((_, index) => {
              const threshold = (index + 1) / 12;
              const active = snapshot.voiceMonitorLevel >= threshold;
              return (
                <span
                  key={`settings-voice-level-${index}`}
                  className={`h-2 rounded-[2px] ${
                    active
                      ? snapshot.voiceMonitorLevel >= 0.75
                        ? "bg-emerald-300"
                        : snapshot.voiceMonitorLevel >= 0.45
                          ? "bg-cyan-300"
                          : "bg-sky-300"
                      : "bg-slate-700/80"
                  }`}
                />
              );
            })}
          </div>
          {snapshot.warnings.length > 0 ? (
            <div className="space-y-1">
              {snapshot.warnings.map((warning) => (
                <p
                  key={`settings-voice-warning-${warning}`}
                  className="rounded border border-amber-300/35 bg-amber-500/12 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-amber-100"
                >
                  {VOICE_WARNING_LABEL[warning]}
                </p>
              ))}
            </div>
          ) : null}
          <p className="uppercase tracking-[0.14em] text-slate-500">
            rms {snapshot.rmsRaw.toFixed(4)} | db {snapshot.rmsDb.toFixed(1)} | peak {snapshot.peak.toFixed(4)} |
            floor {snapshot.noiseFloor.toFixed(4)}
          </p>
          <p className="uppercase tracking-[0.14em] text-slate-500">
            roundtrip {snapshot.lastRoundtripMs ?? "--"}ms | adaptive gate{" "}
            {Math.round(snapshot.voiceMonitorThreshold * 1000) / 1000}
          </p>
          {snapshot.playback ? (
            <>
              <p className="uppercase tracking-[0.14em] text-slate-500">
                playback {snapshot.playback.kind} | chunks {snapshot.playback.chunkCount} | first audio{" "}
                {snapshot.playback.enqueueToFirstAudioMs ?? "--"}ms
              </p>
              <p className="uppercase tracking-[0.14em] text-slate-500">
                total {snapshot.playback.totalPlaybackMs ?? "--"}ms | cache h/m{" "}
                {snapshot.playback.cacheHitCount}/{snapshot.playback.cacheMissCount}
                {snapshot.playback.cancelReason ? ` | cancel ${snapshot.playback.cancelReason}` : ""}
              </p>
              <p className="uppercase tracking-[0.14em] text-slate-500">
                provider {snapshot.playback.providerHeader ?? "n/a"} | profile {snapshot.playback.profileHeader ?? "n/a"}
                {snapshot.playback.normalizationBenchmarkHeader
                  ? ` | norm ${clipDiagnosticsText(snapshot.playback.normalizationBenchmarkHeader, 84)}`
                  : ""}
                {snapshot.playback.normalizationSkipReasonHeader
                  ? ` | skip ${clipDiagnosticsText(snapshot.playback.normalizationSkipReasonHeader, 84)}`
                  : ""}
              </p>
            </>
          ) : null}
          {snapshot.playbackOutput ? (
            <>
              <p className="uppercase tracking-[0.14em] text-slate-500">
                output {snapshot.playbackOutput.expectedPath} | gain target{" "}
                {snapshot.playbackOutput.gainTarget.toFixed(2)} | unlocked{" "}
                {snapshot.playbackOutput.audioUnlocked ? "yes" : "no"}
                {snapshot.playbackOutput.audioSessionType
                  ? ` | session ${snapshot.playbackOutput.audioSessionType}`
                  : ""}
                {snapshot.playbackOutput.forcedDirectMobile ? " | forced-direct-mobile" : ""}
                {typeof snapshot.playbackOutput.graphAttemptCount === "number"
                  ? ` | graph attempts ${snapshot.playbackOutput.graphAttemptCount}`
                  : ""}
                {typeof snapshot.playbackOutput.fallbackCount === "number"
                  ? ` | fallbacks ${snapshot.playbackOutput.fallbackCount}`
                  : ""}
                {snapshot.playbackOutput.graphBypassActive ? " | graph bypass active" : ""}
                {snapshot.playbackOutput.unlockLastFailureReason
                  ? ` | unlock fail ${clipDiagnosticsText(snapshot.playbackOutput.unlockLastFailureReason, 64)}`
                  : ""}
              </p>
              <p className="uppercase tracking-[0.14em] text-slate-500">
                element{" "}
                {snapshot.playbackOutput.audioElementReady
                  ? `${snapshot.playbackOutput.audioElementMuted ? "muted" : "live"} @ ${
                      snapshot.playbackOutput.audioElementVolume ?? "--"
                    }`
                  : "none"}{" "}
                | graph {snapshot.playbackOutput.audioGraphAttached ? "attached" : "detached"} | ctx{" "}
                {snapshot.playbackOutput.audioContextState ?? "n/a"}
                {typeof snapshot.playbackOutput.audioContextSampleRate === "number"
                  ? ` ${Math.round(snapshot.playbackOutput.audioContextSampleRate)}hz`
                  : ""}
                {typeof snapshot.playbackOutput.gainNodeValue === "number"
                  ? ` | gain ${snapshot.playbackOutput.gainNodeValue.toFixed(2)}`
                  : ""}
              </p>
            </>
          ) : null}
          <p className="uppercase tracking-[0.14em] text-slate-500">
            recorder {snapshot.voiceRecorderMimeType ?? "unknown"} | track {snapshot.voiceTrackMuted ? "muted" : "live"}
            {snapshot.voiceInputDeviceLabel ? ` | ${clipDiagnosticsText(snapshot.voiceInputDeviceLabel, 56)}` : ""}
          </p>
          <p className="uppercase tracking-[0.14em] text-slate-500">
            chunk cadence {snapshot.chunksPerSecond.toFixed(2)} /s | chunks {snapshot.mediaChunkCount} | bytes{" "}
            {snapshot.mediaBytes}
          </p>
          <p className="uppercase tracking-[0.14em] text-slate-500">
            last chunk age{" "}
            {snapshot.lastChunkAgeMs === null ? "--" : `${Math.round(Math.max(0, snapshot.lastChunkAgeMs))}ms`}
          </p>
          <div className="flex flex-wrap gap-1">
            {snapshot.checkpoints.map((checkpoint) => (
              <span
                key={`settings-checkpoint-${checkpoint.key}`}
                className={`inline-flex rounded border px-1.5 py-0.5 uppercase tracking-[0.14em] ${VOICE_CHECKPOINT_STATUS_CLASS[checkpoint.status]}`}
                title={checkpoint.message ?? undefined}
              >
                {checkpoint.label}
                {checkpoint.lastAtMs !== null ? ` (${formatCaptureTimestamp(checkpoint.lastAtMs)})` : ""}
              </span>
            ))}
          </div>
          {snapshot.segments.length > 0 ? (
            <div className="space-y-1">
              <p className="uppercase tracking-[0.18em] text-slate-400">Last 5 segments</p>
              {snapshot.segments.map((segment) => (
                <div
                  key={`settings-segment-attempt-${segment.id}`}
                  className="rounded border border-white/10 bg-white/5 px-1.5 py-1"
                >
                  <p className="uppercase tracking-[0.14em] text-slate-500">
                    {segment.status} | dispatch {segment.dispatch} | {Math.round(segment.durationMs)}ms
                  </p>
                  <p className="uppercase tracking-[0.14em] text-slate-500">
                    captured {formatCaptureTimestamp(segment.cutAtMs)}
                    {segment.sttLatencyMs !== null ? ` | stt ${Math.round(segment.sttLatencyMs)}ms` : ""}
                    {segment.engine ? ` | ${segment.engine}` : ""}
                  </p>
                  {segment.transcriptPreview ? (
                    <p className="mt-1 text-[10px] text-slate-200">
                      {clipDiagnosticsText(segment.transcriptPreview, 220)}
                    </p>
                  ) : null}
                  {segment.error ? <p className="mt-1 text-[10px] text-rose-200">{segment.error}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-300">Listening for first segment...</p>
          )}
        </div>
      )}
    </div>
  );
}

function HelixAskDebugContextPanel({
  snapshot,
}: {
  snapshot: VoiceCaptureDiagnosticsSnapshot | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const [selectedTurnKey, setSelectedTurnKey] = React.useState<string>("latest");
  const turnSelectId = React.useId();
  const debugEvents = React.useMemo(
    () =>
      [...(snapshot?.timelineEvents ?? [])]
        .sort((a, b) => a.atMs - b.atMs)
        .map((event) => {
          const context = readHelixAskDebugContextRecord(event.debugContext);
          if (!context) return null;
          return { event, context };
        })
        .filter((entry): entry is { event: VoiceLaneTimelineDebugEvent; context: Record<string, unknown> } => Boolean(entry))
        .slice(-220),
    [snapshot?.timelineEvents],
  );
  const turnOptions = React.useMemo(() => {
    const grouped = new Map<string, { count: number; lastAtMs: number }>();
    debugEvents.forEach(({ event }) => {
      const key = getReasoningTimelineTurnKey(event);
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
        current.lastAtMs = Math.max(current.lastAtMs, event.atMs);
        return;
      }
      grouped.set(key, { count: 1, lastAtMs: event.atMs });
    });
    return [...grouped.entries()]
      .map(([key, meta]) => ({ key, ...meta }))
      .sort((a, b) => b.lastAtMs - a.lastAtMs);
  }, [debugEvents]);
  const latestTurnKey = turnOptions[0]?.key ?? null;
  const latestTurnCount = turnOptions[0]?.count ?? 0;

  React.useEffect(() => {
    if (selectedTurnKey === "all" || selectedTurnKey === "latest") return;
    const selectedStillExists = turnOptions.some((option) => option.key === selectedTurnKey);
    if (!selectedStillExists) {
      setSelectedTurnKey("latest");
    }
  }, [selectedTurnKey, turnOptions]);

  const selectedEntries = React.useMemo(() => {
    if (debugEvents.length === 0) return [];
    if (selectedTurnKey === "all") return debugEvents;
    const targetKey = selectedTurnKey === "latest" ? latestTurnKey : selectedTurnKey;
    if (!targetKey) return [];
    return debugEvents.filter(({ event }) => getReasoningTimelineTurnKey(event) === targetKey);
  }, [debugEvents, latestTurnKey, selectedTurnKey]);
  const exportPayload = React.useMemo(() => {
    if (selectedEntries.length === 0) return "";
    return selectedEntries
      .map(({ event, context }) =>
        JSON.stringify({
          id: event.id,
          atMs: event.atMs,
          source: event.source,
          kind: event.kind,
          traceId: event.traceId ?? null,
          turnKey: event.turnKey ?? null,
          attemptId: event.attemptId ?? null,
          debugContext: context,
        }),
      )
      .join("\n");
  }, [selectedEntries]);

  const handleCopy = async () => {
    if (!exportPayload || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(exportPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">
          Helix Ask debug context
        </p>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!exportPayload}
          className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
            exportPayload
              ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-300/25"
              : "border-slate-600 text-slate-500"
          }`}
        >
          {copied ? "copied" : "copy logs"}
        </button>
      </div>
      {debugEvents.length === 0 ? (
        <p className="text-xs text-slate-300">
          No Helix Ask debug payloads captured yet. Complete a reply with debug enabled to populate this panel.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={turnSelectId} className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              Turn
            </label>
            <select
              id={turnSelectId}
              value={selectedTurnKey}
              onChange={(event) => setSelectedTurnKey(event.target.value)}
              className="h-7 min-w-[240px] rounded-md border border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-100"
            >
              <option value="latest">Latest turn ({latestTurnCount})</option>
              <option value="all">All turns ({debugEvents.length})</option>
              {turnOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {clipDiagnosticsText(option.key, 64)} ({option.count})
                </option>
              ))}
            </select>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              {selectedEntries.length} entries shown
            </p>
          </div>
          <div className="max-h-[44vh] space-y-2 overflow-y-auto rounded border border-slate-700/80 bg-slate-950/70 p-2 font-mono text-[10px] leading-5 text-slate-200">
            {selectedEntries.map(({ event, context }) => {
              const contextFiles = readHelixAskDebugStringArray(context.contextFiles);
              const rawPayload = formatHelixAskDebugRawPayload(event, context);
              return (
                <div key={`${event.id}-helix-debug`} className="rounded border border-white/10 bg-white/5 p-1.5">
                  <p className="whitespace-pre-wrap break-words">{formatVoiceTimelineDebugEvent(event)}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-cyan-100">
                    {formatHelixAskDebugContextSummary(context)}
                  </p>
                  {contextFiles.length > 0 ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-slate-300">
                      files:
                      {"\n"}
                      {contextFiles.slice(0, 10).join("\n")}
                    </p>
                  ) : null}
                  <details className="mt-1 rounded border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-slate-300">
                    <summary className="cursor-pointer select-none uppercase tracking-[0.14em] text-slate-400">
                      raw event + debugContext
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words">{rawPayload}</pre>
                  </details>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

type HelixAskMathRenderDebugSnapshot = NonNullable<
  ReturnType<typeof buildHelixAskMathRenderDebugForText>
>;

function buildMathTokenStatusKey(
  status: HelixAskMathRenderDebugSnapshot["tokenStatuses"][number],
): string {
  return [
    status.status,
    status.reason ?? "",
    status.displayMode === null ? "na" : status.displayMode ? "display" : "inline",
    status.openDelimiter ?? "",
    status.closeDelimiter ?? "",
    status.tokenText,
  ].join("|");
}

function mergeHelixAskMathRenderDebugSnapshot(
  current: HelixAskMathRenderDebugSnapshot | null,
  next: HelixAskMathRenderDebugSnapshot | null,
): HelixAskMathRenderDebugSnapshot | null {
  if (!current) return next;
  if (!next) return current;
  const katexErrorSamples = [...current.katexErrorSamples];
  for (const sample of next.katexErrorSamples) {
    if (katexErrorSamples.includes(sample)) continue;
    katexErrorSamples.push(sample);
    if (katexErrorSamples.length >= 5) break;
  }
  const bareIgnoredSamples = [...current.bareIgnoredSamples];
  for (const sample of next.bareIgnoredSamples) {
    if (bareIgnoredSamples.includes(sample)) continue;
    bareIgnoredSamples.push(sample);
    if (bareIgnoredSamples.length >= 5) break;
  }
  const tokenStatuses = [...current.tokenStatuses];
  const seenTokenStatuses = new Set(tokenStatuses.map((status) => buildMathTokenStatusKey(status)));
  for (const status of next.tokenStatuses) {
    const key = buildMathTokenStatusKey(status);
    if (seenTokenStatuses.has(key)) continue;
    seenTokenStatuses.add(key);
    tokenStatuses.push(status);
    if (tokenStatuses.length >= 120) break;
  }
  return {
    sourceChars: current.sourceChars + next.sourceChars,
    tokenCount: current.tokenCount + next.tokenCount,
    mathTokenCount: current.mathTokenCount + next.mathTokenCount,
    delimiterMathCount: current.delimiterMathCount + next.delimiterMathCount,
    bareMathCount: current.bareMathCount + next.bareMathCount,
    katexErrorCount: current.katexErrorCount + next.katexErrorCount,
    bareCandidateCount: current.bareCandidateCount + next.bareCandidateCount,
    bareAcceptedCount: current.bareAcceptedCount + next.bareAcceptedCount,
    bareIgnoredCount: current.bareIgnoredCount + next.bareIgnoredCount,
    katexErrorSamples,
    bareIgnoredSamples,
    tokenStatuses,
  };
}

function HelixAskMathFormattingDebugPanel({
  snapshot,
}: {
  snapshot: VoiceCaptureDiagnosticsSnapshot | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const [selectedTurnKey, setSelectedTurnKey] = React.useState<string>("latest");
  const turnSelectId = React.useId();
  const mathEntries = React.useMemo(
    () =>
      [...(snapshot?.timelineEvents ?? [])]
        .sort((a, b) => a.atMs - b.atMs)
        .map((event) => {
          const text = typeof event.text === "string" ? event.text.trim() : "";
          if (!text) return null;
          const debug = buildHelixAskMathRenderDebugForText(text);
          if (!debug) return null;
          return { event, debug };
        })
        .filter(
          (
            entry,
          ): entry is { event: VoiceLaneTimelineDebugEvent; debug: HelixAskMathRenderDebugSnapshot } =>
            Boolean(entry),
        )
        .slice(-260),
    [snapshot?.timelineEvents],
  );
  const turnOptions = React.useMemo(() => {
    const grouped = new Map<string, { count: number; lastAtMs: number }>();
    mathEntries.forEach(({ event }) => {
      const key = getReasoningTimelineTurnKey(event);
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
        current.lastAtMs = Math.max(current.lastAtMs, event.atMs);
        return;
      }
      grouped.set(key, { count: 1, lastAtMs: event.atMs });
    });
    return [...grouped.entries()]
      .map(([key, meta]) => ({ key, ...meta }))
      .sort((a, b) => b.lastAtMs - a.lastAtMs);
  }, [mathEntries]);
  const latestTurnKey = turnOptions[0]?.key ?? null;
  const latestTurnCount = turnOptions[0]?.count ?? 0;

  React.useEffect(() => {
    if (selectedTurnKey === "all" || selectedTurnKey === "latest") return;
    const selectedStillExists = turnOptions.some((option) => option.key === selectedTurnKey);
    if (!selectedStillExists) {
      setSelectedTurnKey("latest");
    }
  }, [selectedTurnKey, turnOptions]);

  const selectedEntries = React.useMemo(() => {
    if (mathEntries.length === 0) return [];
    if (selectedTurnKey === "all") return mathEntries;
    const targetKey = selectedTurnKey === "latest" ? latestTurnKey : selectedTurnKey;
    if (!targetKey) return [];
    return mathEntries.filter(({ event }) => getReasoningTimelineTurnKey(event) === targetKey);
  }, [latestTurnKey, mathEntries, selectedTurnKey]);
  const aggregateDebug = React.useMemo(() => {
    let merged: HelixAskMathRenderDebugSnapshot | null = null;
    for (const entry of selectedEntries) {
      merged = mergeHelixAskMathRenderDebugSnapshot(merged, entry.debug);
    }
    return merged;
  }, [selectedEntries]);
  const aggregateStatusCounts = React.useMemo(() => {
    if (!aggregateDebug) {
      return {
        formatted: 0,
        katex_error: 0,
        ignored_reason: 0,
      };
    }
    return aggregateDebug.tokenStatuses.reduce(
      (acc, status) => {
        if (status.status === "formatted") acc.formatted += 1;
        else if (status.status === "katex_error") acc.katex_error += 1;
        else acc.ignored_reason += 1;
        return acc;
      },
      {
        formatted: 0,
        katex_error: 0,
        ignored_reason: 0,
      },
    );
  }, [aggregateDebug]);
  const exportPayload = React.useMemo(() => {
    if (selectedEntries.length === 0) return "";
    return selectedEntries
      .map(({ event, debug }) =>
        JSON.stringify({
          id: event.id,
          atMs: event.atMs,
          source: event.source,
          kind: event.kind,
          turnKey: getReasoningTimelineTurnKey(event),
          traceId: event.traceId ?? null,
          text: clipDiagnosticsText(event.text ?? "", 420),
          mathDebug: debug,
        }),
      )
      .join("\n");
  }, [selectedEntries]);

  const handleCopy = async () => {
    if (!exportPayload || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(exportPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">
          Helix Ask math formatting debug
        </p>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!exportPayload}
          className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
            exportPayload
              ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-300/25"
              : "border-slate-600 text-slate-500"
          }`}
        >
          {copied ? "copied" : "copy logs"}
        </button>
      </div>
      {mathEntries.length === 0 ? (
        <p className="text-xs text-slate-300">
          No equation text found in timeline replies yet.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={turnSelectId} className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              Turn
            </label>
            <select
              id={turnSelectId}
              value={selectedTurnKey}
              onChange={(event) => setSelectedTurnKey(event.target.value)}
              className="h-7 min-w-[240px] rounded-md border border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-100"
            >
              <option value="latest">Latest turn ({latestTurnCount})</option>
              <option value="all">All turns ({mathEntries.length})</option>
              {turnOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {clipDiagnosticsText(option.key, 64)} ({option.count})
                </option>
              ))}
            </select>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              {selectedEntries.length} entries shown
            </p>
          </div>
          {aggregateDebug ? (
            <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] leading-5 text-slate-200">
              <p>
                Tokens: {aggregateDebug.mathTokenCount}/{aggregateDebug.tokenCount} math
                {" "}(
                delimiter {aggregateDebug.delimiterMathCount}, bare {aggregateDebug.bareMathCount})
              </p>
              <p>
                KaTeX: {Math.max(0, aggregateDebug.mathTokenCount - aggregateDebug.katexErrorCount)} formatted | errors(red):{" "}
                {aggregateDebug.katexErrorCount}
              </p>
              <p>
                Bare candidates: {aggregateDebug.bareAcceptedCount}/{aggregateDebug.bareCandidateCount} accepted | ignored:{" "}
                {aggregateDebug.bareIgnoredCount}
              </p>
              <p>
                Token status: formatted={aggregateStatusCounts.formatted} | katex_error=
                {aggregateStatusCounts.katex_error} | ignored_reason={aggregateStatusCounts.ignored_reason}
              </p>
              {aggregateDebug.katexErrorSamples.length > 0 ? (
                <p className="mt-1 whitespace-pre-wrap">Error samples: {aggregateDebug.katexErrorSamples.join(" | ")}</p>
              ) : null}
              {aggregateDebug.bareIgnoredSamples.length > 0 ? (
                <p className="mt-1 whitespace-pre-wrap">Ignored samples: {aggregateDebug.bareIgnoredSamples.join(" | ")}</p>
              ) : null}
            </div>
          ) : null}
          <div className="max-h-[32vh] overflow-y-auto rounded border border-slate-700/80 bg-slate-950/70 p-2 font-mono text-[10px] leading-5 text-slate-200">
            {selectedEntries.map(({ event, debug }) => (
              <div key={`${event.id}-helix-math-debug`} className="rounded border border-white/10 bg-white/5 p-1.5">
                <p className="whitespace-pre-wrap break-words">{formatVoiceTimelineDebugEvent(event)}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-emerald-100">
                  math={debug.mathTokenCount}/{debug.tokenCount} | formatted=
                  {Math.max(0, debug.mathTokenCount - debug.katexErrorCount)} | error={debug.katexErrorCount} |
                  bare_ignored={debug.bareIgnoredCount}
                </p>
                {debug.tokenStatuses.length > 0 ? (
                  <div className="mt-1 space-y-1">
                    {debug.tokenStatuses.slice(0, 10).map((status, index) => (
                      <p
                        key={`${event.id}-math-status-${index}`}
                        className={
                          status.status === "katex_error"
                            ? "whitespace-pre-wrap break-words text-rose-200"
                            : status.status === "ignored_reason"
                              ? "whitespace-pre-wrap break-words text-amber-200"
                              : "whitespace-pre-wrap break-words text-cyan-100"
                        }
                      >
                        {status.status}
                        {status.reason ? `(${status.reason})` : ""}
                        {status.displayMode === null ? "" : status.displayMode ? " [display]" : " [inline]"}:{" "}
                        {status.tokenText}
                      </p>
                    ))}
                    {debug.tokenStatuses.length > 10 ? (
                      <p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">
                        +{debug.tokenStatuses.length - 10} more statuses
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HelixAskReasoningEventLogPanel({
  snapshot,
}: {
  snapshot: VoiceCaptureDiagnosticsSnapshot | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const [selectedTurnKey, setSelectedTurnKey] = React.useState<string>("latest");
  const turnSelectId = React.useId();
  const reasoningEvents = React.useMemo(
    () =>
      [...(snapshot?.timelineEvents ?? [])]
        .filter((event) => isHelixAskReasoningStepEvent(event))
        .sort((a, b) => a.atMs - b.atMs)
        .slice(-420),
    [snapshot?.timelineEvents],
  );
  const turnOptions = React.useMemo(() => {
    const grouped = new Map<string, { count: number; lastAtMs: number }>();
    reasoningEvents.forEach((event) => {
      const key = getReasoningTimelineTurnKey(event);
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
        current.lastAtMs = Math.max(current.lastAtMs, event.atMs);
        return;
      }
      grouped.set(key, { count: 1, lastAtMs: event.atMs });
    });
    return [...grouped.entries()]
      .map(([key, meta]) => ({ key, ...meta }))
      .sort((a, b) => b.lastAtMs - a.lastAtMs);
  }, [reasoningEvents]);
  const latestTurnKey = turnOptions[0]?.key ?? null;
  const latestTurnCount = turnOptions[0]?.count ?? 0;

  React.useEffect(() => {
    if (selectedTurnKey === "all" || selectedTurnKey === "latest") return;
    const selectedStillExists = turnOptions.some((option) => option.key === selectedTurnKey);
    if (!selectedStillExists) {
      setSelectedTurnKey("latest");
    }
  }, [selectedTurnKey, turnOptions]);

  const selectedEvents = React.useMemo(() => {
    if (reasoningEvents.length === 0) return [];
    if (selectedTurnKey === "all") return reasoningEvents;
    const targetKey = selectedTurnKey === "latest" ? latestTurnKey : selectedTurnKey;
    if (!targetKey) return [];
    return reasoningEvents.filter((event) => getReasoningTimelineTurnKey(event) === targetKey);
  }, [latestTurnKey, reasoningEvents, selectedTurnKey]);
  const objectiveReasoningTrace = React.useMemo(() => {
    const merged = new Map<string, HelixAskObjectiveReasoningTraceEntry>();
    for (const event of [...selectedEvents].reverse()) {
      const context = readHelixAskDebugContextRecord(event.debugContext);
      if (!context) continue;
      const rows = readHelixAskObjectiveReasoningTraceFromContext(context);
      for (const row of rows) {
        if (merged.has(row.objectiveId)) continue;
        merged.set(row.objectiveId, row);
      }
    }
    return [...merged.values()].slice(0, 12);
  }, [selectedEvents]);
  const objectiveTelemetry = React.useMemo(() => {
    for (const event of [...selectedEvents].reverse()) {
      const context = readHelixAskDebugContextRecord(event.debugContext);
      if (!context) continue;
      const summary = readHelixAskObjectiveTelemetryFromContext(context);
      if (summary) return summary;
    }
    return null;
  }, [selectedEvents]);
  const exportPayload = React.useMemo(() => {
    if (selectedEvents.length === 0) return "";
    return JSON.stringify(buildSettingsHelixAskMasterEventClockExport(selectedEvents), null, 2);
  }, [selectedEvents]);

  const handleCopy = async () => {
    if (!exportPayload || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(exportPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">
          Helix Ask reasoning event log
        </p>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!exportPayload}
          className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
            exportPayload
              ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-300/25"
              : "border-slate-600 text-slate-500"
          }`}
        >
          {copied ? "copied" : "copy logs"}
        </button>
      </div>
      {reasoningEvents.length === 0 ? (
        <p className="text-xs text-slate-300">
          No Helix Ask reasoning events yet. Start a turn to capture chronological reasoning logs.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={turnSelectId} className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              Turn
            </label>
            <select
              id={turnSelectId}
              value={selectedTurnKey}
              onChange={(event) => setSelectedTurnKey(event.target.value)}
              className="h-7 min-w-[240px] rounded-md border border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-100"
            >
              <option value="latest">Latest turn ({latestTurnCount})</option>
              <option value="all">All turns ({reasoningEvents.length})</option>
              {turnOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {clipDiagnosticsText(option.key, 64)} ({option.count})
                </option>
              ))}
            </select>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              {selectedEvents.length} events shown
            </p>
          </div>
          {objectiveReasoningTrace.length > 0 ? (
            <div className="rounded border border-indigo-400/20 bg-indigo-950/20 p-2 text-[10px] leading-5 text-indigo-100">
              <p className="uppercase tracking-[0.14em] text-indigo-200">
                Plain-English objective reasoning trace
              </p>
              {objectiveTelemetry ? (
                <p className="mt-1">
                  finalize={objectiveTelemetry.finalizeGateMode ?? "n/a"} | gate_pass=
                  {objectiveTelemetry.finalizeGatePassed === null
                    ? "n/a"
                    : objectiveTelemetry.finalizeGatePassed
                      ? "true"
                      : "false"}{" "}
                  | coverage_unresolved={objectiveTelemetry.coverageUnresolvedCount ?? "n/a"} |
                  unknown_blocks={objectiveTelemetry.unknownBlockCount ?? "n/a"} |
                  unresolved_without_unknown=
                  {objectiveTelemetry.unresolvedWithoutUnknownBlockCount ?? "n/a"} |
                  missing_scoped_retrieval={objectiveTelemetry.missingScopedRetrievalCount ?? "n/a"}
                </p>
              ) : null}
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                {objectiveReasoningTrace.map((entry) => (
                  <details
                    key={`objective-trace-${entry.objectiveId}`}
                    className="rounded border border-indigo-300/20 bg-black/20 p-2"
                  >
                    <summary className="cursor-pointer select-none">
                      {entry.objectiveLabel} [{entry.finalStatus}]
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap text-indigo-50">{entry.plainReasoning}</p>
                    {entry.transitionTail.length > 0 ? (
                      <p className="mt-1 whitespace-pre-wrap text-indigo-100/80">
                        Transition tail:
                        {"\n"}
                        {entry.transitionTail.join("\n")}
                      </p>
                    ) : null}
                  </details>
                ))}
              </div>
            </div>
          ) : null}
          <div className="max-h-[44vh] overflow-y-auto rounded border border-slate-700/80 bg-slate-950/70 p-2 font-mono text-[10px] leading-5 text-slate-200">
            {selectedEvents.map((event) => {
              const context = readHelixAskDebugContextRecord(event.debugContext);
              const rawPayload = context
                ? formatHelixAskDebugRawPayload(event, context)
                : JSON.stringify(event, null, 2);
              return (
                <details
                  key={event.id}
                  className="mb-1 rounded border border-slate-700/70 bg-black/20 px-1.5 py-1 last:mb-0"
                >
                  <summary className="cursor-pointer select-none whitespace-pre-wrap break-words text-slate-100">
                    {formatVoiceTimelineDebugEvent(event)}
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap break-words text-slate-300">{rawPayload}</pre>
                </details>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function AlcubierreRenderDebugLogPanel() {
  const [snapshot, setSnapshot] = React.useState<AlcubierreDebugLogSnapshot>(() =>
    getAlcubierreDebugLogSnapshot(),
  );
  const [copied, setCopied] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");
  const categorySelectId = React.useId();

  React.useEffect(() => {
    setSnapshot(getAlcubierreDebugLogSnapshot());
    return subscribeAlcubierreDebugLog((next) => {
      setSnapshot(next);
    });
  }, []);

  const categoryOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    snapshot.events.forEach((event) => {
      counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [snapshot.events]);

  React.useEffect(() => {
    if (selectedCategory === "all") return;
    if (categoryOptions.some((entry) => entry.category === selectedCategory)) return;
    setSelectedCategory("all");
  }, [categoryOptions, selectedCategory]);

  const filteredEvents = React.useMemo(() => {
    if (selectedCategory === "all") return snapshot.events;
    return snapshot.events.filter((event) => event.category === selectedCategory);
  }, [selectedCategory, snapshot.events]);

  const exportPayload = React.useMemo(
    () => buildAlcubierreDebugLogExport(filteredEvents),
    [filteredEvents],
  );

  const handleCopy = async () => {
    if (!exportPayload || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(exportPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const handleClear = () => {
    clearAlcubierreDebugEvents();
  };

  const handleDownload = () => {
    if (!exportPayload || typeof window === "undefined") return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `alcubierre-debug-log-${stamp}.jsonl`;
    const blob = new Blob([exportPayload], { type: "application/x-ndjson;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">
          Alcubierre render + calculation log
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleClear}
            disabled={snapshot.events.length === 0}
            className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
              snapshot.events.length > 0
                ? "border-amber-300/50 bg-amber-400/15 text-amber-100 hover:bg-amber-300/20"
                : "border-slate-600 text-slate-500"
            }`}
          >
            clear
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!exportPayload}
            className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
              exportPayload
                ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-300/25"
                : "border-slate-600 text-slate-500"
            }`}
          >
            {copied ? "copied" : "copy logs"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!exportPayload}
            className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
              exportPayload
                ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-300/25"
                : "border-slate-600 text-slate-500"
            }`}
          >
            download .jsonl
          </button>
        </div>
      </div>
      <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] leading-5 text-slate-200">
        <p>
          status: {snapshot.enabled ? "enabled" : "disabled"} | events: {snapshot.total} | dropped: {snapshot.dropped}
        </p>
        <p>updated: {snapshot.updatedAtMs > 0 ? new Date(snapshot.updatedAtMs).toISOString() : "never"}</p>
      </div>
      {snapshot.events.length === 0 ? (
        <p className="text-xs text-slate-300">
          No Alcubierre debug events yet. Open the Alcubierre panel and interact with renderer/mode controls.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={categorySelectId} className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              Category
            </label>
            <select
              id={categorySelectId}
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="h-7 min-w-[240px] rounded-md border border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-100"
            >
              <option value="all">All ({snapshot.events.length})</option>
              {categoryOptions.map((entry) => (
                <option key={entry.category} value={entry.category}>
                  {entry.category} ({entry.count})
                </option>
              ))}
            </select>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              {filteredEvents.length} events shown
            </p>
          </div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
            expected / rendered / delta fields are included per event for measurement-grade review
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
            category solve_to_render_pipeline logs equation-&gt;metric-&gt;constraints-&gt;optics-&gt;render chain evidence
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
            benchmark command: npm run warp:render:congruence:check -- --debug-log &lt;path-to-jsonl&gt;
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
            command capture: npm run warp:render:capture -- --base-url http://127.0.0.1:5050 --scenario all --frames 12
          </p>
          <div className="max-h-[44vh] space-y-2 overflow-y-auto rounded border border-slate-700/80 bg-slate-950/70 p-2 font-mono text-[10px] leading-5 text-slate-200">
            {[...filteredEvents]
              .sort((a, b) => a.atMs - b.atMs)
              .slice(-220)
              .map((event: AlcubierreDebugEvent) => (
                <div key={event.id} className="rounded border border-white/10 bg-white/5 p-1.5">
                  <p className="whitespace-pre-wrap break-words">
                    {event.isoTime} | {event.level.toUpperCase()} | {event.category} | src={event.source} | mode=
                    {event.mode ?? "n/a"} | backend={event.rendererBackend ?? "n/a"} | skybox={event.skyboxMode ?? "n/a"}
                  </p>
                  {event.note ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-amber-100">
                      note: {clipDiagnosticsText(event.note, 240)}
                    </p>
                  ) : null}
                  <details className="mt-1 rounded border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-slate-300">
                    <summary className="cursor-pointer select-none uppercase tracking-[0.14em] text-slate-400">
                      raw event payload
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(event, null, 2)}</pre>
                  </details>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function WorkstationDebugPanel() {
  const [snapshot, setSnapshot] = React.useState<WorkstationDebugSnapshot>(() => getWorkstationDebugSnapshot());
  const [copied, setCopied] = React.useState(false);
  const [selectedChannel, setSelectedChannel] = React.useState<string>("all");
  const channelSelectId = React.useId();

  React.useEffect(() => {
    setSnapshot(getWorkstationDebugSnapshot());
    return subscribeWorkstationDebug((next) => {
      setSnapshot(next);
    });
  }, []);

  const channelOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    snapshot.events.forEach((event) => {
      counts.set(event.channel, (counts.get(event.channel) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => a.channel.localeCompare(b.channel));
  }, [snapshot.events]);

  React.useEffect(() => {
    if (selectedChannel === "all") return;
    if (channelOptions.some((entry) => entry.channel === selectedChannel)) return;
    setSelectedChannel("all");
  }, [channelOptions, selectedChannel]);

  const filteredEvents = React.useMemo(() => {
    if (selectedChannel === "all") return snapshot.events;
    return snapshot.events.filter((event) => event.channel === selectedChannel);
  }, [selectedChannel, snapshot.events]);

  const exportPayload = React.useMemo(
    () => buildWorkstationDebugExport({ ...snapshot, events: filteredEvents }),
    [filteredEvents, snapshot],
  );

  const handleCopy = async () => {
    if (!exportPayload || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(exportPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Workstation event debug</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={clearWorkstationDebugEvents}
            disabled={snapshot.events.length === 0}
            className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
              snapshot.events.length > 0
                ? "border-amber-300/50 bg-amber-400/15 text-amber-100 hover:bg-amber-300/20"
                : "border-slate-600 text-slate-500"
            }`}
          >
            clear
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!exportPayload}
            className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
              exportPayload
                ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-300/25"
                : "border-slate-600 text-slate-500"
            }`}
          >
            {copied ? "copied" : "copy events"}
          </button>
        </div>
      </div>
      <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] leading-5 text-slate-200">
        <p>status: {snapshot.enabled ? "enabled" : "disabled"} | events: {snapshot.events.length}</p>
        <p>browser hook: window.__helixWorkstationDebug</p>
      </div>
      {snapshot.events.length === 0 ? (
        <p className="text-xs text-slate-300">
          No workstation debug events yet. Attach a Situation Room source or run a pipeline job.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={channelSelectId} className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              Channel
            </label>
            <select
              id={channelSelectId}
              value={selectedChannel}
              onChange={(event) => setSelectedChannel(event.target.value)}
              className="h-7 min-w-[240px] rounded-md border border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-100"
            >
              <option value="all">All ({snapshot.events.length})</option>
              {channelOptions.map((entry) => (
                <option key={entry.channel} value={entry.channel}>
                  {entry.channel} ({entry.count})
                </option>
              ))}
            </select>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              {filteredEvents.length} events shown
            </p>
          </div>
          <div className="max-h-[36vh] space-y-2 overflow-y-auto rounded border border-slate-700/80 bg-slate-950/70 p-2 font-mono text-[10px] leading-5 text-slate-200">
            {[...filteredEvents]
              .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
              .slice(-180)
              .map((event: WorkstationDebugEvent) => (
                <div key={event.id} className="rounded border border-white/10 bg-white/5 p-1.5">
                  <p className="whitespace-pre-wrap break-words">
                    {event.ts} | {event.channel} | {event.action} | room={event.room_id ?? "n/a"} | source=
                    {event.source_id ?? "n/a"} | job={event.job_id ?? "n/a"}
                  </p>
                  <details className="mt-1 rounded border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-slate-300">
                    <summary className="cursor-pointer select-none uppercase tracking-[0.14em] text-slate-400">
                      raw event payload
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(event, null, 2)}</pre>
                  </details>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function VoiceEventTimelineDebugPanel({
  snapshot,
}: {
  snapshot: VoiceCaptureDiagnosticsSnapshot | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const [selectedTurnKey, setSelectedTurnKey] = React.useState<string>("latest");
  const turnSelectId = React.useId();
  const timelineEvents = React.useMemo(
    () =>
      [...(snapshot?.timelineEvents ?? [])]
        .filter((event) => isVoiceLaneTrafficEvent(event))
        .sort((a, b) => a.atMs - b.atMs)
        .slice(-360),
    [snapshot?.timelineEvents],
  );
  const turnOptions = React.useMemo(() => {
    const grouped = new Map<string, { count: number; lastAtMs: number }>();
    timelineEvents.forEach((event) => {
      const key = getReasoningTimelineTurnKey(event);
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
        current.lastAtMs = Math.max(current.lastAtMs, event.atMs);
        return;
      }
      grouped.set(key, { count: 1, lastAtMs: event.atMs });
    });
    return [...grouped.entries()]
      .map(([key, meta]) => ({ key, ...meta }))
      .sort((a, b) => b.lastAtMs - a.lastAtMs);
  }, [timelineEvents]);
  const latestTurnKey = turnOptions[0]?.key ?? null;
  const latestTurnCount = turnOptions[0]?.count ?? 0;

  React.useEffect(() => {
    if (selectedTurnKey === "all" || selectedTurnKey === "latest") return;
    const selectedStillExists = turnOptions.some((option) => option.key === selectedTurnKey);
    if (!selectedStillExists) {
      setSelectedTurnKey("latest");
    }
  }, [selectedTurnKey, turnOptions]);

  const selectedEvents = React.useMemo(() => {
    if (timelineEvents.length === 0) return [];
    if (selectedTurnKey === "all") return timelineEvents;
    const targetKey = selectedTurnKey === "latest" ? latestTurnKey : selectedTurnKey;
    if (!targetKey) return [];
    return timelineEvents.filter((event) => getReasoningTimelineTurnKey(event) === targetKey);
  }, [latestTurnKey, selectedTurnKey, timelineEvents]);
  const exportPayload = React.useMemo(() => {
    if (selectedEvents.length === 0) return "";
    return selectedEvents.map((event) => JSON.stringify(event)).join("\n");
  }, [selectedEvents]);

  const handleCopy = async () => {
    if (!exportPayload || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(exportPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">
          Voice lane event timeline
        </p>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!exportPayload}
          className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
            exportPayload
              ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-300/25"
              : "border-slate-600 text-slate-500"
          }`}
        >
          {copied ? "copied" : "copy logs"}
        </button>
      </div>
      {timelineEvents.length === 0 ? (
        <p className="text-xs text-slate-300">
          No voice lane events yet. Start a mic turn and reasoning run to capture timeline continuity.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={turnSelectId} className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              Turn
            </label>
            <select
              id={turnSelectId}
              value={selectedTurnKey}
              onChange={(event) => setSelectedTurnKey(event.target.value)}
              className="h-7 min-w-[240px] rounded-md border border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-100"
            >
              <option value="latest">Latest turn ({latestTurnCount})</option>
              <option value="all">All turns ({timelineEvents.length})</option>
              {turnOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {clipDiagnosticsText(option.key, 64)} ({option.count})
                </option>
              ))}
            </select>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              {selectedEvents.length} events shown
            </p>
          </div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
            scoped to prompt / brief / final / chunk traffic
          </p>
          <div className="max-h-[44vh] overflow-y-auto rounded border border-slate-700/80 bg-slate-950/70 p-2 font-mono text-[10px] leading-5 text-slate-200">
            {selectedEvents.map((event) => (
              <details
                key={event.id}
                className="mb-1 rounded border border-slate-700/70 bg-black/20 px-1.5 py-1 last:mb-0"
              >
                <summary className="cursor-pointer select-none whitespace-pre-wrap break-words text-slate-100">
                  {formatVoiceTimelineDebugEvent(event)}
                </summary>
                <pre className="mt-1 whitespace-pre-wrap break-words text-slate-300">
                  {JSON.stringify(event, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function buildVoiceAudioDebugCopyPayload(snapshot: VoiceCaptureDiagnosticsSnapshot): string {
  const timelineTail = [...(snapshot.timelineEvents ?? [])]
    .sort((a, b) => a.atMs - b.atMs)
    .slice(-60);
  const payload = {
    capturedAt: new Date(snapshot.updatedAtMs).toISOString(),
    micArmState: snapshot.micArmState,
    voiceInputState: snapshot.voiceInputState,
    voiceSignalState: snapshot.voiceSignalState,
    voiceInputDeviceLabel: snapshot.voiceInputDeviceLabel,
    voiceTrackMuted: snapshot.voiceTrackMuted,
    voiceRecorderMimeType: snapshot.voiceRecorderMimeType,
    audioLevels: {
      rmsRaw: snapshot.rmsRaw,
      rmsDb: snapshot.rmsDb,
      peak: snapshot.peak,
      noiseFloor: snapshot.noiseFloor,
      monitorLevel: snapshot.voiceMonitorLevel,
      monitorThreshold: snapshot.voiceMonitorThreshold,
    },
    captureCadence: {
      chunksPerSecond: snapshot.chunksPerSecond,
      mediaChunkCount: snapshot.mediaChunkCount,
      mediaBytes: snapshot.mediaBytes,
      lastChunkAgeMs: snapshot.lastChunkAgeMs,
      lastRoundtripMs: snapshot.lastRoundtripMs,
      warnings: snapshot.warnings,
    },
    playback: snapshot.playback ?? null,
    playbackOutput: snapshot.playbackOutput ?? null,
    checkpoints: snapshot.checkpoints.map((checkpoint) => ({
      key: checkpoint.key,
      status: checkpoint.status,
      message: checkpoint.message,
      lastAtMs: checkpoint.lastAtMs,
    })),
    recentSegments: snapshot.segments.slice(-5),
    timelineTail,
  };
  return JSON.stringify(payload, null, 2);
}

function isHelixAskReasoningStepEvent(event: VoiceLaneTimelineDebugEvent): boolean {
  if (event.source === "system") return false;
  if (event.source === "voice_capture") return false;
  if (event.source === "chunk_playback") return false;
  if (event.source === "reasoning") {
    return (
      event.kind === "reasoning_attempt" ||
      event.kind === "reasoning_stream" ||
      event.kind === "reasoning_final" ||
      event.kind === "action_receipt" ||
      event.kind === "suppressed"
    );
  }
  if (event.source === "conversation") {
    return (
      event.kind === "prompt_recorded" ||
      event.kind === "brief" ||
      event.kind === "reasoning_attempt" ||
      event.kind === "reasoning_stream" ||
      event.kind === "reasoning_final" ||
      event.kind === "action_receipt" ||
      event.kind === "suppressed"
    );
  }
  return false;
}

function isVoiceLaneTrafficEvent(event: VoiceLaneTimelineDebugEvent): boolean {
  if (event.source === "system" || event.source === "voice_capture") return false;
  return (
    event.kind === "prompt_recorded" ||
    event.kind === "brief" ||
    event.kind === "reasoning_stream" ||
    event.kind === "reasoning_final" ||
    event.kind === "action_receipt" ||
    event.kind === "chunk_enqueue" ||
    event.kind === "chunk_synth_start" ||
    event.kind === "chunk_synth_ok" ||
    event.kind === "chunk_synth_error" ||
    event.kind === "chunk_play_start" ||
    event.kind === "chunk_play_end" ||
    event.kind === "chunk_drop"
  );
}

function getReasoningTimelineTurnKey(event: VoiceLaneTimelineDebugEvent): string {
  const turn = event.turnKey?.trim();
  if (turn) return turn;
  const trace = event.traceId?.trim();
  if (trace) return `trace:${trace}`;
  return "unkeyed";
}

function readHelixAskDebugContextRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function buildSettingsHelixAskMasterEventClockExport(events: VoiceLaneTimelineDebugEvent[]) {
  const latestContext = [...events]
    .reverse()
    .map((event) => readHelixAskDebugContextRecord(event.debugContext))
    .find((context): context is Record<string, unknown> => Boolean(context));
  const agentLoopAudit = readHelixAskDebugContextRecord(latestContext?.agent_loop_audit);
  const runtimeSummary =
    readHelixAskDebugContextRecord(latestContext?.turn_runtime) ??
    readHelixAskDebugContextRecord(agentLoopAudit?.runtime_summary);
  const finalAnswerContract =
    readHelixAskDebugContextRecord(agentLoopAudit?.final_answer_contract) ??
    readHelixAskDebugContextRecord(
      readHelixAskDebugContextRecord(
        readHelixAskDebugContextRecord(agentLoopAudit?.turn_truth_table)?.terminal,
      )?.contract,
    ) ??
    {
      family:
        typeof latestContext?.final_answer_contract_family === "string"
          ? latestContext.final_answer_contract_family
          : null,
      pass:
        typeof latestContext?.final_answer_contract_pass === "boolean"
          ? latestContext.final_answer_contract_pass
          : null,
      fail_reason:
        typeof latestContext?.final_answer_contract_fail_reason === "string"
          ? latestContext.final_answer_contract_fail_reason
          : null,
      repair_attempted: latestContext?.final_answer_contract_repair_attempted === true,
      repair_applied: latestContext?.final_answer_contract_repair_applied === true,
    };
  return {
    schema: "helix.ask.master_event_clock.v2",
    exportedAt: new Date().toISOString(),
    source: "helix_start_settings",
    counts: {
      eventLogRows: events.length,
      traceIds: new Set(events.map((event) => event.traceId).filter(Boolean)).size,
      turnKeys: new Set(events.map((event) => getReasoningTimelineTurnKey(event)).filter(Boolean)).size,
      attemptIds: new Set(events.map((event) => event.attemptId).filter(Boolean)).size,
    },
    trace: {
      traceIds: [...new Set(events.map((event) => event.traceId).filter(Boolean))],
      turnKeys: [...new Set(events.map((event) => getReasoningTimelineTurnKey(event)).filter(Boolean))],
      attemptIds: [...new Set(events.map((event) => event.attemptId).filter(Boolean))],
    },
    debugContext: latestContext ?? null,
    agentLoop: {
      audit: agentLoopAudit,
      final_answer_contract: finalAnswerContract,
      final_answer_contract_family: finalAnswerContract?.family ?? null,
      final_answer_contract_pass: finalAnswerContract?.pass ?? null,
      final_answer_contract_fail_reason: finalAnswerContract?.fail_reason ?? null,
      planner_contract:
        readHelixAskDebugContextRecord(latestContext?.planner_contract) ??
        readHelixAskDebugContextRecord(agentLoopAudit?.planner_contract),
      execution_trace: Array.isArray(latestContext?.execution_trace)
        ? latestContext?.execution_trace
        : Array.isArray(agentLoopAudit?.execution_trace)
          ? agentLoopAudit?.execution_trace
          : [],
      execution_lifecycle: Array.isArray(latestContext?.execution_lifecycle)
        ? latestContext?.execution_lifecycle
        : Array.isArray(agentLoopAudit?.execution_lifecycle)
          ? agentLoopAudit?.execution_lifecycle
          : [],
      step_results: Array.isArray(latestContext?.step_results)
        ? latestContext?.step_results
        : Array.isArray(agentLoopAudit?.step_results)
          ? agentLoopAudit?.step_results
          : [],
      runtime_summary: runtimeSummary,
      artifact_store_keys: Array.isArray(runtimeSummary?.artifact_keys) ? runtimeSummary?.artifact_keys : [],
      pending_request:
        readHelixAskDebugContextRecord(latestContext?.pending_request) ??
        readHelixAskDebugContextRecord(agentLoopAudit?.pending_request),
      terminal_contract:
        readHelixAskDebugContextRecord(latestContext?.turn_contract) ??
        readHelixAskDebugContextRecord(agentLoopAudit?.terminal_contract),
      invariant_violations: Array.isArray(latestContext?.invariant_violations)
        ? latestContext?.invariant_violations
        : Array.isArray(agentLoopAudit?.invariant_violations)
          ? agentLoopAudit?.invariant_violations
          : [],
      latest_result_artifact:
        readHelixAskDebugContextRecord(latestContext?.latest_result_artifact) ??
        readHelixAskDebugContextRecord(agentLoopAudit?.latest_result_artifact),
    },
    eventLog: events,
  };
}

function readHelixAskDebugStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

type HelixAskObjectiveReasoningTraceEntry = {
  objectiveId: string;
  objectiveLabel: string;
  finalStatus: string;
  plainReasoning: string;
  transitionTail: string[];
};

type HelixAskObjectiveTelemetrySummary = {
  coverageUnresolvedCount: number | null;
  unknownBlockCount: number | null;
  unresolvedWithoutUnknownBlockCount: number | null;
  missingScopedRetrievalCount: number | null;
  finalizeGateMode: string | null;
  finalizeGatePassed: boolean | null;
};

function readHelixAskObjectiveReasoningTraceFromContext(
  context: Record<string, unknown> | null,
): HelixAskObjectiveReasoningTraceEntry[] {
  if (!context) return [];
  const traceRows = Array.isArray(context.objective_reasoning_trace)
    ? context.objective_reasoning_trace
    : [];
  const readString = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  const out: HelixAskObjectiveReasoningTraceEntry[] = [];
  for (const row of traceRows) {
    const record = readHelixAskDebugContextRecord(row);
    if (!record) continue;
    const objectiveId = readString(record.objective_id) ?? "unknown_objective";
    out.push({
      objectiveId,
      objectiveLabel: readString(record.objective_label) ?? objectiveId,
      finalStatus: readString(record.final_status) ?? "unknown",
      plainReasoning: readString(record.plain_reasoning) ?? "No plain reasoning emitted.",
      transitionTail: readHelixAskDebugStringArray(record.transition_tail).slice(0, 8),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function readHelixAskObjectiveTelemetryFromContext(
  context: Record<string, unknown> | null,
): HelixAskObjectiveTelemetrySummary | null {
  if (!context) return null;
  const telemetryRecord =
    readHelixAskDebugContextRecord(context.objective_telemetry_used) ??
    readHelixAskDebugContextRecord(context.objectiveTelemetryUsed);
  const readNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
  const readBoolean = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
  const readString = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  const coverageUnresolvedCount =
    readNumber(telemetryRecord?.objective_coverage_unresolved_count) ??
    readNumber(context.objective_coverage_unresolved_count);
  const unknownBlockCount =
    readNumber(telemetryRecord?.objective_unknown_block_count) ??
    readNumber(context.objective_unknown_block_count);
  const unresolvedWithoutUnknownBlockCount =
    readNumber(telemetryRecord?.objective_unresolved_without_unknown_block_count) ??
    readNumber(context.objective_unresolved_without_unknown_block_count);
  const missingScopedRetrievalCount = readNumber(
    telemetryRecord?.objective_missing_scoped_retrieval_count ?? context.objective_missing_scoped_retrieval_count,
  );
  const finalizeGateMode =
    readString(telemetryRecord?.objective_finalize_gate_mode) ??
    readString(context.objective_finalize_gate_mode);
  const finalizeGatePassed =
    readBoolean(telemetryRecord?.objective_finalize_gate_passed) ??
    readBoolean(context.objective_finalize_gate_passed);
  if (
    coverageUnresolvedCount === null &&
    unknownBlockCount === null &&
    unresolvedWithoutUnknownBlockCount === null &&
    missingScopedRetrievalCount === null &&
    finalizeGateMode === null &&
    finalizeGatePassed === null
  ) {
    return null;
  }
  return {
    coverageUnresolvedCount,
    unknownBlockCount,
    unresolvedWithoutUnknownBlockCount,
    missingScopedRetrievalCount,
    finalizeGateMode,
    finalizeGatePassed,
  };
}

function formatHelixAskDebugContextSummary(context: Record<string, unknown>): string {
  const readNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const readBoolean = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
  const readString = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  const readNumberArray = (value: unknown): number[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) =>
        typeof entry === "number" && Number.isFinite(entry) ? Math.max(0, Math.floor(entry)) : null,
      )
      .filter((entry): entry is number => entry !== null);
  };
  const readStringArray = (...values: unknown[]): string[] => {
    const seen = new Set<string>();
    const merged: string[] = [];
    values.forEach((value) => {
      readHelixAskDebugStringArray(value).forEach((entry) => {
        if (seen.has(entry)) return;
        seen.add(entry);
        merged.push(entry);
      });
    });
    return merged;
  };
  const contextFileCount =
    readNumber(context.contextFileCount) !== null
      ? Math.max(0, Math.floor(readNumber(context.contextFileCount) ?? 0))
      : readHelixAskDebugStringArray(context.contextFiles).length;
  const composerV2PreLinkFailReasons = readStringArray(
    context.composer_v2_pre_link_fail_reasons,
    context.composerV2PreLinkFailReasons,
  );
  const composerV2PostLinkFailReasons = readStringArray(
    context.composer_v2_post_link_fail_reasons,
    context.composerV2PostLinkFailReasons,
  );
  const answerPathEntries = readStringArray(context.answer_path, context.answerPath);
  const retrievalChannelHitsRaw =
    context.retrievalChannelHits && typeof context.retrievalChannelHits === "object"
      ? (context.retrievalChannelHits as Record<string, unknown>)
      : null;
  const retrievalChannelHits =
    retrievalChannelHitsRaw
      ? Object.entries(retrievalChannelHitsRaw)
          .map(([channel, value]) => {
            const count = readNumber(value);
            return count !== null ? `${channel}:${Math.max(0, Math.floor(count))}` : null;
          })
          .filter((entry): entry is string => Boolean(entry))
          .join(",")
      : readString(context.retrievalChannelHits);
  const stage05KindCountsRaw =
    context.stage05KindCounts && typeof context.stage05KindCounts === "object"
      ? (context.stage05KindCounts as Record<string, unknown>)
      : null;
  const stage05KindCounts =
    stage05KindCountsRaw
      ? ["code", "doc", "config", "data", "binary"]
          .map((kind) => {
            const value = stage05KindCountsRaw[kind];
            const count = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
            return `${kind}:${count}`;
          })
          .join(",")
      : null;
  const stage05SoftRuntimeFailOpen = readBoolean(
    context.stage05SoftRuntimeFailOpen ?? context.stage05_soft_runtime_fail_open,
  );
  const stage05SoftRuntimeFailReason = readString(
    context.stage05SoftRuntimeFailReason ?? context.stage05_soft_runtime_fail_reason,
  );
  const stage05SlotCoverageRaw =
    context.stage05_slot_coverage && typeof context.stage05_slot_coverage === "object"
      ? (context.stage05_slot_coverage as Record<string, unknown>)
      : context.stage05SlotCoverage && typeof context.stage05SlotCoverage === "object"
        ? (context.stage05SlotCoverage as Record<string, unknown>)
        : null;
  const slotCoverageRatio = readNumber(
    context.slot_coverage_ratio ??
      context.stage05SlotCoverageRatio ??
      stage05SlotCoverageRaw?.ratio,
  );
  const slotCoverageOk = readBoolean(
    context.slot_coverage_ok ??
      context.stage05SlotCoverageOk ??
      stage05SlotCoverageRaw?.ok,
  );
  const slotCoverageRequired = readStringArray(
    context.slot_coverage_required,
    context.stage05SlotCoverageRequired,
    stage05SlotCoverageRaw?.required,
  );
  const slotCoverageMissing = readStringArray(
    context.slot_coverage_missing,
    context.stage05SlotCoverageMissing,
    stage05SlotCoverageRaw?.missing,
  );
  const llmRetryDelaysMs = readNumberArray(context.llm_retry_delays_ms);
  const llmCalls = Array.isArray(context.llm_calls)
    ? context.llm_calls
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => entry as Record<string, unknown>)
    : [];
  const latestLlmCall = llmCalls.length > 0 ? llmCalls[llmCalls.length - 1] : null;
  const slotMissingEntries = readStringArray(context.slotMissing, context.slot_missing);
  const fields = [
    readString(context.intentDomain) ? `domain=${readString(context.intentDomain)}` : null,
    readString(context.intentId) ? `intent=${readString(context.intentId)}` : null,
    readString(context.helixAskFailClass) ? `fail_class=${readString(context.helixAskFailClass)}` : null,
    readString(context.helixAskFailReason) ? `fail_reason=${readString(context.helixAskFailReason)}` : null,
    readBoolean(context.llm_invoke_attempted) !== null
      ? `llm_invoke_attempted=${readBoolean(context.llm_invoke_attempted) ? "true" : "false"}`
      : null,
    readString(context.llm_skip_reason) ? `llm_skip_reason=${readString(context.llm_skip_reason)}` : null,
    readString(context.llm_skip_reason_detail)
      ? `llm_skip_detail=${clipDiagnosticsText(readString(context.llm_skip_reason_detail) ?? "", 80)}`
      : null,
    readString(context.llm_backend_used) ? `llm_backend=${readString(context.llm_backend_used)}` : null,
    readBoolean(context.llm_provider_called) !== null
      ? `llm_provider_called=${readBoolean(context.llm_provider_called) ? "true" : "false"}`
      : null,
    readString(context.llm_model) ? `llm_model=${clipDiagnosticsText(readString(context.llm_model) ?? "", 40)}` : null,
    readString(context.llm_call_stage) ? `llm_stage=${readString(context.llm_call_stage)}` : null,
    readNumber(context.llm_http_status) !== null
      ? `llm_http_status=${Math.floor(readNumber(context.llm_http_status) ?? 0)}`
      : null,
    readString(context.llm_error_class) ? `llm_error_class=${readString(context.llm_error_class)}` : null,
    readString(context.llm_error_code) ? `llm_error_code=${readString(context.llm_error_code)}` : null,
    readNumber(context.llm_error_status) !== null
      ? `llm_error_status=${Math.floor(readNumber(context.llm_error_status) ?? 0)}`
      : null,
    readNumber(context.llm_error_retry_after_ms) !== null
      ? `llm_error_retry_after_ms=${Math.max(0, Math.floor(readNumber(context.llm_error_retry_after_ms) ?? 0))}`
      : null,
    readNumber(context.llm_error_timeout_ms) !== null
      ? `llm_error_timeout_ms=${Math.max(0, Math.floor(readNumber(context.llm_error_timeout_ms) ?? 0))}`
      : null,
    readNumber(context.llm_error_max_tokens_requested) !== null
      ? `llm_error_max_tokens_requested=${Math.max(
          0,
          Math.floor(readNumber(context.llm_error_max_tokens_requested) ?? 0),
        )}`
      : null,
    readNumber(context.llm_error_max_tokens_effective) !== null
      ? `llm_error_max_tokens_effective=${Math.max(
          0,
          Math.floor(readNumber(context.llm_error_max_tokens_effective) ?? 0),
        )}`
      : null,
    readBoolean(context.llm_error_transient) !== null
      ? `llm_error_transient=${readBoolean(context.llm_error_transient) ? "true" : "false"}`
      : null,
    readBoolean(context.llm_error_circuit_open) !== null
      ? `llm_error_circuit_open=${readBoolean(context.llm_error_circuit_open) ? "true" : "false"}`
      : null,
    readNumber(context.llm_error_circuit_remaining_ms) !== null
      ? `llm_error_circuit_remaining_ms=${Math.max(
          0,
          Math.floor(readNumber(context.llm_error_circuit_remaining_ms) ?? 0),
        )}`
      : null,
    readNumber(context.llm_retry_count) !== null
      ? `llm_retry_count=${Math.max(0, Math.floor(readNumber(context.llm_retry_count) ?? 0))}`
      : null,
    readNumber(context.llm_attempt_count) !== null
      ? `llm_attempt_count=${Math.max(0, Math.floor(readNumber(context.llm_attempt_count) ?? 0))}`
      : null,
    llmRetryDelaysMs.length > 0
      ? `llm_retry_delays_ms=${clipDiagnosticsText(llmRetryDelaysMs.join(","), 90)}`
      : null,
    llmCalls.length > 0 ? `llm_calls=${llmCalls.length}` : null,
    latestLlmCall && readString(latestLlmCall.stage)
      ? `llm_last_stage=${readString(latestLlmCall.stage)}`
      : null,
    latestLlmCall && readNumber(latestLlmCall.status) !== null
      ? `llm_last_status=${Math.floor(readNumber(latestLlmCall.status) ?? 0)}`
      : null,
    latestLlmCall && readString(latestLlmCall.errorClass)
      ? `llm_last_error_class=${readString(latestLlmCall.errorClass)}`
      : null,
    latestLlmCall && readString(latestLlmCall.errorCode)
      ? `llm_last_error_code=${readString(latestLlmCall.errorCode)}`
      : null,
    readBoolean(context.llm_breaker_prewait_enabled) !== null
      ? `llm_prewait=${readBoolean(context.llm_breaker_prewait_enabled) ? "true" : "false"}`
      : null,
    readBoolean(context.llm_breaker_open_at_start) !== null
      ? `llm_breaker_open_start=${readBoolean(context.llm_breaker_open_at_start) ? "true" : "false"}`
      : null,
    readNumber(context.llm_breaker_remaining_ms_at_start) !== null
      ? `llm_breaker_remaining_ms=${Math.max(
          0,
          Math.floor(readNumber(context.llm_breaker_remaining_ms_at_start) ?? 0),
        )}`
      : null,
    readNumber(context.llm_breaker_wait_applied_ms) !== null
      ? `llm_wait_applied_ms=${Math.max(0, Math.floor(readNumber(context.llm_breaker_wait_applied_ms) ?? 0))}`
      : null,
    readString(context.llm_breaker_wait_result)
      ? `llm_wait_result=${readString(context.llm_breaker_wait_result)}`
      : null,
    readBoolean(context.llm_unavailable_at_turn_start) !== null
      ? `llm_unavailable_start=${readBoolean(context.llm_unavailable_at_turn_start) ? "true" : "false"}`
      : null,
    readString(context.llm_unavailable_root_stage)
      ? `llm_unavailable_root=${readString(context.llm_unavailable_root_stage)}`
      : null,
    retrievalChannelHits ? `channels=${retrievalChannelHits}` : null,
    readString(context.stage0RolloutMode) ? `stage0_mode=${readString(context.stage0RolloutMode)}` : null,
    readBoolean(context.stage0Used) !== null
      ? `stage0_used=${readBoolean(context.stage0Used) ? "true" : "false"}`
      : null,
    readBoolean(context.stage0ShadowOnly) !== null
      ? `stage0_shadow_only=${readBoolean(context.stage0ShadowOnly) ? "true" : "false"}`
      : null,
    readNumber(context.stage0CandidateCount) !== null
      ? `stage0_candidates=${Math.max(0, Math.floor(readNumber(context.stage0CandidateCount) ?? 0))}`
      : null,
    readNumber(context.stage0HitRate) !== null
      ? `stage0_hit_rate=${(readNumber(context.stage0HitRate) ?? 0).toFixed(4)}`
      : null,
    readBoolean(context.stage0SoftMustIncludeApplied) !== null
      ? `stage0_soft_must_include=${readBoolean(context.stage0SoftMustIncludeApplied) ? "true" : "false"}`
      : null,
    readString(context.stage0PolicyDecision) ? `stage0_policy=${readString(context.stage0PolicyDecision)}` : null,
    readString(context.stage0FailOpenReason) ? `stage0_fail_open=${readString(context.stage0FailOpenReason)}` : null,
    readString(context.stage0FallbackReason) ? `stage0_fallback=${readString(context.stage0FallbackReason)}` : null,
    readBoolean(context.stage0CodeFloorPass) !== null
      ? `code_floor_pass=${readBoolean(context.stage0CodeFloorPass) ? "true" : "false"}`
      : null,
    readNumber(context.stage0CodePathCount) !== null
      ? `code_paths=${Math.max(0, Math.floor(readNumber(context.stage0CodePathCount) ?? 0))}`
      : null,
    readNumber(context.stage0DocPathCount) !== null
      ? `doc_paths=${Math.max(0, Math.floor(readNumber(context.stage0DocPathCount) ?? 0))}`
      : null,
    readBoolean(context.stage05Used) !== null
      ? `stage05_used=${readBoolean(context.stage05Used) ? "true" : "false"}`
      : null,
    readNumber(context.stage05FileCount) !== null
      ? `stage05_files=${Math.max(0, Math.floor(readNumber(context.stage05FileCount) ?? 0))}`
      : null,
    readString(context.stage05InputScope ?? context.stage05_input_scope)
      ? `stage05_input_scope=${readString(context.stage05InputScope ?? context.stage05_input_scope)}`
      : null,
    readNumber(context.stage05InputPathCount ?? context.stage05_input_path_count) !== null
      ? `stage05_input_paths=${Math.max(
          0,
          Math.floor(readNumber(context.stage05InputPathCount ?? context.stage05_input_path_count) ?? 0),
        )}`
      : null,
    readNumber(context.stage05InputWideAddedCount ?? context.stage05_input_wide_added_count) !== null
      ? `stage05_wide_added=${Math.max(
          0,
          Math.floor(
            readNumber(context.stage05InputWideAddedCount ?? context.stage05_input_wide_added_count) ?? 0,
          ),
        )}`
      : null,
    readNumber(
      context.stage05InputConnectivityAddedCount ?? context.stage05_input_connectivity_added_count,
    ) !== null
      ? `stage05_connectivity_added=${Math.max(
          0,
          Math.floor(
            readNumber(
              context.stage05InputConnectivityAddedCount ?? context.stage05_input_connectivity_added_count,
            ) ?? 0,
          ),
        )}`
      : null,
    readNumber(
      context.stage05InputSeedSignalTokenCount ?? context.stage05_input_seed_signal_token_count,
    ) !== null
      ? `stage05_seed_tokens=${Math.max(
          0,
          Math.floor(
            readNumber(
              context.stage05InputSeedSignalTokenCount ?? context.stage05_input_seed_signal_token_count,
            ) ?? 0,
          ),
        )}`
      : null,
    readNumber(
      context.stage05InputConnectedHintPathCount ?? context.stage05_input_connected_hint_path_count,
    ) !== null
      ? `stage05_connected_hints=${Math.max(
          0,
          Math.floor(
            readNumber(
              context.stage05InputConnectedHintPathCount ?? context.stage05_input_connected_hint_path_count,
            ) ?? 0,
          ),
        )}`
      : null,
    readNumber(context.stage05CardCount) !== null
      ? `stage05_cards=${Math.max(0, Math.floor(readNumber(context.stage05CardCount) ?? 0))}`
      : null,
    slotCoverageRatio !== null ? `slot_coverage_ratio=${slotCoverageRatio.toFixed(3)}` : null,
    slotCoverageOk !== null ? `slot_coverage_ok=${slotCoverageOk ? "true" : "false"}` : null,
    slotCoverageRequired.length > 0 ? `slot_coverage_required=${slotCoverageRequired.length}` : null,
    slotCoverageMissing.length > 0
      ? `slot_coverage_missing=${clipDiagnosticsText(slotCoverageMissing.join(","), 110)}`
      : slotCoverageRatio !== null
        ? "slot_coverage_missing=none"
        : null,
    stage05KindCounts ? `stage05_kinds=${stage05KindCounts}` : null,
    readBoolean(context.stage05LlmUsed) !== null
      ? `stage05_llm=${readBoolean(context.stage05LlmUsed) ? "true" : "false"}`
      : null,
    readString(context.stage05FallbackReason) ? `stage05_fallback=${readString(context.stage05FallbackReason)}` : null,
    readNumber(context.stage05ExtractMs) !== null
      ? `stage05_extract_ms=${Math.max(0, Math.floor(readNumber(context.stage05ExtractMs) ?? 0))}`
      : null,
    readNumber(context.stage05TotalMs) !== null
      ? `stage05_total_ms=${Math.max(0, Math.floor(readNumber(context.stage05TotalMs) ?? 0))}`
      : null,
    readBoolean(context.stage05BudgetCapped) !== null
      ? `stage05_budget_capped=${readBoolean(context.stage05BudgetCapped) ? "true" : "false"}`
      : null,
    readBoolean(context.stage05SummaryRequired) !== null
      ? `stage05_summary_required=${readBoolean(context.stage05SummaryRequired) ? "true" : "false"}`
      : null,
    readBoolean(context.stage05SummaryHardFail) !== null
      ? `stage05_summary_hard_fail=${readBoolean(context.stage05SummaryHardFail) ? "true" : "false"}`
      : null,
    readString(context.stage05SummaryFailReason)
      ? `stage05_summary_fail=${readString(context.stage05SummaryFailReason)}`
      : null,
    stage05SoftRuntimeFailOpen !== null
      ? `stage05_soft_runtime_fail_open=${stage05SoftRuntimeFailOpen ? "true" : "false"}`
      : null,
    stage05SoftRuntimeFailReason ? `stage05_soft_runtime_reason=${stage05SoftRuntimeFailReason}` : null,
    readBoolean(context.stage05FullfileMode) !== null
      ? `stage05_fullfile=${readBoolean(context.stage05FullfileMode) ? "true" : "false"}`
      : null,
    readBoolean(context.stage05TwoPassUsed) !== null
      ? `stage05_two_pass=${readBoolean(context.stage05TwoPassUsed) ? "true" : "false"}`
      : null,
    readNumber(context.stage05TwoPassBatches) !== null
      ? `stage05_two_pass_batches=${Math.max(0, Math.floor(readNumber(context.stage05TwoPassBatches) ?? 0))}`
      : null,
    readString(context.stage05OverflowPolicy) ? `stage05_overflow=${readString(context.stage05OverflowPolicy)}` : null,
    readBoolean(context.stage05AdaptiveExpandAttempted ?? context.stage05_adaptive_expand_attempted) !== null
      ? `stage05_adaptive_attempted=${
          readBoolean(context.stage05AdaptiveExpandAttempted ?? context.stage05_adaptive_expand_attempted)
            ? "true"
            : "false"
        }`
      : null,
    readBoolean(context.stage05AdaptiveExpandApplied ?? context.stage05_adaptive_expand_applied) !== null
      ? `stage05_adaptive_applied=${
          readBoolean(context.stage05AdaptiveExpandApplied ?? context.stage05_adaptive_expand_applied)
            ? "true"
            : "false"
        }`
      : null,
    readString(context.stage05AdaptiveExpandReason ?? context.stage05_adaptive_expand_reason)
      ? `stage05_adaptive_reason=${clipDiagnosticsText(
          readString(context.stage05AdaptiveExpandReason ?? context.stage05_adaptive_expand_reason) ?? "",
          120,
        )}`
      : null,
    readNumber(context.stage05AdaptiveExpandMaxFiles ?? context.stage05_adaptive_expand_max_files) !== null
      ? `stage05_adaptive_max_files=${Math.max(
          0,
          Math.floor(
            readNumber(context.stage05AdaptiveExpandMaxFiles ?? context.stage05_adaptive_expand_max_files) ?? 0,
          ),
        )}`
      : null,
    readNumber(context.stage05AdaptiveExpandMaxCards ?? context.stage05_adaptive_expand_max_cards) !== null
      ? `stage05_adaptive_max_cards=${Math.max(
          0,
          Math.floor(
            readNumber(context.stage05AdaptiveExpandMaxCards ?? context.stage05_adaptive_expand_max_cards) ?? 0,
          ),
        )}`
      : null,
    readString(context.policyRetrievalScope ?? context.policy_retrieval_scope)
      ? `retrieval_scope=${readString(context.policyRetrievalScope ?? context.policy_retrieval_scope)}`
      : null,
    readString(context.intentContractHash)
      ? `intent_contract=${clipDiagnosticsText(readString(context.intentContractHash) ?? "", 24)}`
      : null,
    readBoolean(context.intentContractMutationDetected) !== null
      ? `intent_contract_mutation=${readBoolean(context.intentContractMutationDetected) ? "true" : "false"}`
      : null,
    readString(context.turnContractHash ?? context.turn_contract_hash)
      ? `turn_contract=${clipDiagnosticsText(
          readString(context.turnContractHash ?? context.turn_contract_hash) ?? "",
          24,
        )}`
      : null,
    readBoolean(context.plannerValid ?? context.planner_valid) !== null
      ? `planner_valid=${readBoolean(context.plannerValid ?? context.planner_valid) ? "true" : "false"}`
      : null,
    readString(context.plannerMode ?? context.planner_mode)
      ? `planner_mode=${readString(context.plannerMode ?? context.planner_mode)}`
      : null,
    readString(context.plannerSource ?? context.planner_source)
      ? `planner_source=${clipDiagnosticsText(
          readString(context.plannerSource ?? context.planner_source) ?? "",
          36,
        )}`
      : null,
    readNumber(context.objectiveCount ?? context.objective_count) !== null
      ? `objectives=${Math.max(
          0,
          Math.floor(readNumber(context.objectiveCount ?? context.objective_count) ?? 0),
        )}`
      : null,
    slotMissingEntries.length > 0
      ? `slot_missing=${clipDiagnosticsText(
          slotMissingEntries.join(","),
          110,
        )}`
      : null,
    readBoolean(context.evidenceGap ?? context.evidence_gap) !== null
      ? `evidence_gap=${readBoolean(context.evidenceGap ?? context.evidence_gap) ? "true" : "false"}`
      : null,
    readString(context.answerMode ?? context.answer_mode)
      ? `answer_mode=${readString(context.answerMode ?? context.answer_mode)}`
      : null,
    readString(context.degradeMode ?? context.degrade_mode)
      ? `degrade_mode=${clipDiagnosticsText(
          readString(context.degradeMode ?? context.degrade_mode) ?? "",
          48,
        )}`
      : null,
    readBoolean(context.anchorIntegrityOk ?? context.anchor_integrity_ok) !== null
      ? `anchor_integrity_ok=${
          readBoolean(context.anchorIntegrityOk ?? context.anchor_integrity_ok) ? "true" : "false"
        }`
      : null,
    Array.isArray(context.objectiveSupport ?? context.objective_support)
      ? `objective_supports=${Math.max(
          0,
          ((context.objectiveSupport ?? context.objective_support) as unknown[]).length,
        )}`
      : null,
    readNumber(context.equationCandidateTotal) !== null
      ? `eq_candidates=${Math.max(0, Math.floor(readNumber(context.equationCandidateTotal) ?? 0))}`
      : null,
    readNumber(context.equationCandidateRejectedTotal) !== null
      ? `eq_rejected=${Math.max(0, Math.floor(readNumber(context.equationCandidateRejectedTotal) ?? 0))}`
      : null,
    readNumber(context.equationSelectorPrimaryConfidence) !== null
      ? `eq_primary_conf=${(readNumber(context.equationSelectorPrimaryConfidence) ?? 0).toFixed(2)}`
      : null,
    readBoolean(context.equationSelectorPrimaryFamilyMatch) !== null
      ? `eq_family_match=${readBoolean(context.equationSelectorPrimaryFamilyMatch) ? "true" : "false"}`
      : null,
    readNumber(context.equationSelectorSupportCount) !== null
      ? `eq_supports=${Math.max(0, Math.floor(readNumber(context.equationSelectorSupportCount) ?? 0))}`
      : null,
    readString(context.equationSelectorPrimaryKey)
      ? `eq_primary_key=${clipDiagnosticsText(readString(context.equationSelectorPrimaryKey) ?? "", 64)}`
      : null,
    readString(context.equationRendererPrimaryKey)
      ? `eq_renderer_key=${clipDiagnosticsText(readString(context.equationRendererPrimaryKey) ?? "", 64)}`
      : null,
    readBoolean(context.equationPrimaryAnchorMatch) !== null
      ? `eq_anchor_match=${readBoolean(context.equationPrimaryAnchorMatch) ? "true" : "false"}`
      : null,
    readString(context.equationDominantFamily) ? `eq_family=${readString(context.equationDominantFamily)}` : null,
    readString(context.equationPrimaryClass) ? `eq_class=${readString(context.equationPrimaryClass)}` : null,
    readString(context.equationPrimaryDerivationLevel)
      ? `eq_derivation=${readString(context.equationPrimaryDerivationLevel)}`
      : null,
    readNumber(context.equationPrimaryScore) !== null
      ? `eq_score=${(readNumber(context.equationPrimaryScore) ?? 0).toFixed(2)}`
      : null,
    readBoolean(context.equationBypassTriggered) !== null
      ? `eq_bypass=${readBoolean(context.equationBypassTriggered) ? "true" : "false"}`
      : null,
    readString(context.equationBypassReason) ? `eq_bypass_reason=${readString(context.equationBypassReason)}` : null,
    readString(context.equationRuntimeBudgetStage)
      ? `eq_budget_stage=${readString(context.equationRuntimeBudgetStage)}`
      : null,
    readNumber(context.equationSecondaryCrossTopicCount) !== null
      ? `eq_cross_topic_supports=${Math.max(0, Math.floor(readNumber(context.equationSecondaryCrossTopicCount) ?? 0))}`
      : null,
    readString(context.shadowPrimaryKey)
      ? `shadow_primary=${clipDiagnosticsText(readString(context.shadowPrimaryKey) ?? "", 64)}`
      : null,
    readBoolean(context.shadowPrimaryAnchorMatch) !== null
      ? `shadow_anchor_match=${readBoolean(context.shadowPrimaryAnchorMatch) ? "true" : "false"}`
      : null,
    readNumber(context.shadowSymbolHitRate) !== null
      ? `shadow_symbol_hit_rate=${(readNumber(context.shadowSymbolHitRate) ?? 0).toFixed(4)}`
      : null,
    readString(context.composerPromptFamily) ? `composer_family=${readString(context.composerPromptFamily)}` : null,
    readString(context.composerPromptSpecificity)
      ? `composer_specificity=${readString(context.composerPromptSpecificity)}`
      : null,
    readBoolean(context.composerSchemaValid) !== null
      ? `composer_schema_valid=${readBoolean(context.composerSchemaValid) ? "true" : "false"}`
      : null,
    readNumber(context.composerFamilyFormatAccuracy) !== null
      ? `composer_format_accuracy=${(readNumber(context.composerFamilyFormatAccuracy) ?? 0).toFixed(2)}`
      : null,
    readBoolean(context.composerSoftEnforceApplied) !== null
      ? `composer_soft_enforce=${readBoolean(context.composerSoftEnforceApplied) ? "true" : "false"}`
      : null,
    readString(context.composerSoftEnforceTriggerReason)
      ? `composer_soft_reason=${readString(context.composerSoftEnforceTriggerReason)}`
      : null,
    readBoolean(context.composer_v2_enabled) !== null
      ? `composer_v2_enabled=${readBoolean(context.composer_v2_enabled) ? "true" : "false"}`
      : null,
    readBoolean(context.composer_v2_applied) !== null
      ? `composer_v2_applied=${readBoolean(context.composer_v2_applied) ? "true" : "false"}`
      : null,
    readString(context.composer_v2_brief_source)
      ? `composer_v2_brief=${readString(context.composer_v2_brief_source)}`
      : null,
    readString(context.composer_v2_evidence_digest_source)
      ? `composer_v2_digest=${readString(context.composer_v2_evidence_digest_source)}`
      : null,
    readString(context.composer_v2_handoff_source)
      ? `composer_v2_handoff_source=${readString(context.composer_v2_handoff_source)}`
      : null,
    readNumber(context.composer_v2_evidence_digest_claim_count) !== null
      ? `composer_v2_digest_claims=${Math.max(
          0,
          Math.floor(readNumber(context.composer_v2_evidence_digest_claim_count) ?? 0),
        )}`
      : null,
    readNumber(context.composer_v2_handoff_block_count) !== null
      ? `composer_v2_handoff_blocks=${Math.max(
          0,
          Math.floor(readNumber(context.composer_v2_handoff_block_count) ?? 0),
        )}`
      : null,
    readNumber(context.composer_v2_handoff_chars) !== null
      ? `composer_v2_handoff_chars=${Math.max(0, Math.floor(readNumber(context.composer_v2_handoff_chars) ?? 0))}`
      : null,
    readBoolean(context.composer_v2_handoff_truncated) !== null
      ? `composer_v2_handoff_truncated=${readBoolean(context.composer_v2_handoff_truncated) ? "true" : "false"}`
      : null,
    composerV2PreLinkFailReasons.length > 0
      ? `composer_v2_pre_link_fails=${clipDiagnosticsText(composerV2PreLinkFailReasons.join(","), 96)}`
      : null,
    composerV2PostLinkFailReasons.length > 0
      ? `composer_v2_post_link_fails=${clipDiagnosticsText(composerV2PostLinkFailReasons.join(","), 96)}`
      : null,
    readString(context.composer_v2_best_attempt_stage)
      ? `composer_v2_best_stage=${readString(context.composer_v2_best_attempt_stage)}`
      : null,
    readString(context.composer_v2_fallback_reason)
      ? `composer_v2_fallback=${readString(context.composer_v2_fallback_reason)}`
      : null,
    readNumber(context.composer_v2_expand_attempts) !== null
      ? `composer_v2_expand_attempts=${Math.max(
          0,
          Math.floor(readNumber(context.composer_v2_expand_attempts) ?? 0),
        )}`
      : null,
    readNumber(context.composer_v2_repair_attempts) !== null
      ? `composer_v2_repair_attempts=${Math.max(
          0,
          Math.floor(readNumber(context.composer_v2_repair_attempts) ?? 0),
        )}`
      : null,
    readNumber(context.composer_v2_transient_retries) !== null
      ? `composer_v2_transient_retries=${Math.max(
          0,
          Math.floor(readNumber(context.composer_v2_transient_retries) ?? 0),
        )}`
      : null,
    readBoolean(context.composer_v2_repair_attempted) !== null
      ? `composer_v2_repair_attempted=${readBoolean(context.composer_v2_repair_attempted) ? "true" : "false"}`
      : null,
    readBoolean(context.composer_v2_repair_skipped_due_to_expand_error) !== null
      ? `composer_v2_repair_skipped=${readBoolean(context.composer_v2_repair_skipped_due_to_expand_error) ? "true" : "false"}`
      : null,
    readString(context.composer_v2_expand_error_code)
      ? `composer_v2_expand_error=${readString(context.composer_v2_expand_error_code)}`
      : null,
    readBoolean(context.composer_v2_projection_applied) !== null
      ? `composer_v2_projection=${readBoolean(context.composer_v2_projection_applied) ? "true" : "false"}`
      : null,
    answerPathEntries.length > 0 ? `answer_path_steps=${answerPathEntries.length}` : null,
    answerPathEntries.length > 0
      ? `answer_path_tail=${clipDiagnosticsText(answerPathEntries.slice(-4).join(" > "), 120)}`
      : null,
    answerPathEntries.length > 0
      ? `answer_path=${clipDiagnosticsText(answerPathEntries.join(" > "), 260)}`
      : null,
    `context_files=${contextFileCount}`,
  ]
    .filter(Boolean)
    .join(" | ");
  return fields || "no debug summary fields";
}

function formatHelixAskDebugRawPayload(
  event: VoiceLaneTimelineDebugEvent,
  context: Record<string, unknown>,
): string {
  return JSON.stringify(
    {
      id: event.id,
      atMs: event.atMs,
      source: event.source,
      kind: event.kind,
      status: event.status ?? null,
      traceId: event.traceId ?? null,
      turnKey: event.turnKey ?? null,
      attemptId: event.attemptId ?? null,
      utteranceId: event.utteranceId ?? null,
      detail: event.detail ?? null,
      text: event.text ?? null,
      debugContext: context,
    },
    null,
    2,
  );
}

function formatVoiceTimelineDebugEvent(event: VoiceLaneTimelineDebugEvent): string {
  const timestamp = Number.isFinite(event.atMs)
    ? new Date(event.atMs).toISOString().split("T")[1]?.replace("Z", "") ?? "time"
    : "time";
  const hasDebugContext = Boolean(
    event.debugContext && typeof event.debugContext === "object" && !Array.isArray(event.debugContext),
  );
  const fields = [
    `source=${event.source}`,
    `kind=${event.kind}`,
    event.status ? `status=${event.status}` : null,
    event.turnKey ? `turn=${clipDiagnosticsText(event.turnKey, 28)}` : null,
    event.traceId ? `trace=${clipDiagnosticsText(event.traceId, 26)}` : null,
    typeof event.hlcMs === "number" ? `hlc=${event.hlcMs}` : null,
    typeof event.seq === "number" ? `seq=${event.seq}` : null,
    typeof event.revision === "number" ? `rev=${event.revision}` : null,
    event.attemptId ? `attempt=${clipDiagnosticsText(event.attemptId, 18)}` : null,
    event.utteranceId ? `utt=${clipDiagnosticsText(event.utteranceId, 18)}` : null,
    typeof event.chunkIndex === "number" ? `chunk=${event.chunkIndex + 1}/${event.chunkCount ?? "?"}` : null,
    event.briefSource ? `brief=${event.briefSource}` : null,
    event.finalSource ? `final=${event.finalSource}` : null,
    event.suppressionCause ? `cause=${event.suppressionCause}` : null,
    event.authorityRejectStage ? `stage=${event.authorityRejectStage}` : null,
    event.causalRefId ? `causal=${clipDiagnosticsText(event.causalRefId, 24)}` : null,
    hasDebugContext ? "debug_context=1" : null,
    event.detail ? `detail=${clipDiagnosticsText(event.detail, 96)}` : null,
    event.text ? `text=${clipDiagnosticsText(event.text, 150)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  return `[${timestamp}] ${fields}`;
}

function clipDiagnosticsText(source: string, maxChars: number): string {
  const text = source.trim();
  if (!text) return "";
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}...`;
}

function PowerShellTerminalPad({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const [status, setStatus] = React.useState<"idle" | "running" | "done" | "error">("idle");
  const [output, setOutput] = React.useState("");
  const [exitCode, setExitCode] = React.useState<number | null>(null);
  const [truncated, setTruncated] = React.useState(false);
  const canCopy = value.trim().length > 0;
  const canRun = value.trim().length > 0 && status !== "running";

  const handleCopy = async () => {
    if (!navigator?.clipboard?.writeText || !canCopy) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore clipboard failures
    }
  };

  const handleClear = () => onChange("");

  const handleRun = async () => {
    if (!canRun) return;
    setStatus("running");
    setOutput("");
    setExitCode(null);
    setTruncated(false);
    try {
      const response = await fetch("/api/dev-terminal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.message || payload?.error || `Command failed (${response.status})`;
        throw new Error(message);
      }
      const stdout = typeof payload.stdout === "string" ? payload.stdout : "";
      const stderr = typeof payload.stderr === "string" ? payload.stderr : "";
      const combined = [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean).join("\n");
      const decorated = appendTerminalHints(combined);
      setOutput(decorated || "Command completed with no output.");
      setExitCode(typeof payload.code === "number" ? payload.code : null);
      setTruncated(Boolean(payload.truncated));
      setStatus("done");
    } catch (error) {
      setOutput(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-slate-100">Developer terminal</p>
        <p className="text-xs text-slate-300">
          Scratchpad only. Use Copy to send the command to your local terminal.
        </p>
      </div>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type PowerShell commands here..."
        className="min-h-[140px] border-slate-600 bg-slate-950 font-mono text-xs text-slate-100 placeholder:text-slate-500"
      />
      <div className="flex items-center gap-2">
        <button
          className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleRun}
          disabled={!canRun}
        >
          {status === "running" ? "Running" : "Run"}
        </button>
        <button
          className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleCopy}
          disabled={!canCopy}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleClear}
          disabled={!value}
        >
          Clear
        </button>
      </div>
      {status !== "idle" ? (
        <div className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">
            {status === "running" ? "Running" : status === "error" ? "Error" : "Output"}
            {exitCode != null ? ` (exit ${exitCode})` : ""}
            {truncated ? " (truncated)" : ""}
          </div>
          <pre className="whitespace-pre-wrap">{output || "..."}</pre>
        </div>
      ) : null}
    </div>
  );
}

function appendTerminalHints(output: string): string {
  if (!output) return output;
  const hints: string[] = [];
  if (
    /rg\s+:\s+The term 'rg' is not recognized/i.test(output) ||
    /rg: command not found/i.test(output)
  ) {
    hints.push(
      "rg not found. Install with: winget install BurntSushi.ripgrep",
      "PowerShell alternative: Select-String -Path <file> -Pattern \"<text>\"",
    );
  }
  if (!hints.length) return output;
  return `${output}\n\n[hint] ${hints.join("\n[hint] ")}`;
}
