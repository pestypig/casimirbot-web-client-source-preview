import React from "react";
import { Bell, Bug, Copy, Eye, EyeOff, Megaphone, Pause, RotateCcw, Trash2, Volume2 } from "lucide-react";
import { speakVoice } from "@/lib/agi/api";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText } from "@/lib/i18n/interfaceText";
import {
  NARRATOR_AUTHORITY_LABELS,
  NARRATOR_SOURCE_LABELS,
} from "@/lib/narrator/narratorPolicy";
import {
  NarratorPlaybackError,
  createNarratorPlaybackLockedDiagnostic,
  installNarratorAudioUnlockGestureListeners,
  playNarratorVoiceResponse,
  primeNarratorAudioPlayback,
  stopNarratorAudioPlayback,
} from "@/lib/narrator/narratorAudioPlayback";
import { buildNarratorVoiceSpeakPayload } from "@/lib/narrator/narratorVoiceBridge";
import { useNarratorStore } from "@/store/useNarratorStore";
import type {
  NarratorDeliveryMode,
  NarratorEventV1,
  NarratorSourceKind,
} from "@shared/contracts/narrator-event.v1";

const sourceOrder: NarratorSourceKind[] = [
  "final_answer",
  "helix_console",
  "voice_receipt",
  "workstation_panel",
  "live_answer",
  "image_lens",
  "situation_room",
  "microdeck",
  "hover_focus_inspector",
];

const deliveryModes: NarratorDeliveryMode[] = [
  "hidden",
  "visible_only",
  "confirm_to_speak",
  "auto_speak",
];

function formatWhen(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString();
}

function authorityClass(event: NarratorEventV1): string {
  if (event.authority === "terminal_answer") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (event.authority === "voice_receipt") return "border-sky-400/40 bg-sky-500/10 text-sky-200";
  if (event.authority === "inspection_hint") return "border-zinc-400/40 bg-zinc-500/10 text-zinc-200";
  return "border-amber-400/40 bg-amber-500/10 text-amber-200";
}

export type NarratorCopyResult = {
  ok: boolean;
  method: "navigator.clipboard" | "textarea_fallback" | "unavailable" | "failed";
  error?: string;
};

function copyErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "copy_failed");
}

export async function copyNarratorEventText(text: string): Promise<NarratorCopyResult> {
  const value = text.trim();
  if (!value) return { ok: false, method: "unavailable", error: "empty_text" };
  let clipboardError: unknown = null;
  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(value);
      return { ok: true, method: "navigator.clipboard" };
    } catch (error) {
      clipboardError = error;
    }
  }

  if (typeof document === "undefined" || !document.body) {
    return {
      ok: false,
      method: "unavailable",
      error: clipboardError ? copyErrorMessage(clipboardError) : "clipboard_unavailable",
    };
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const copied = document.execCommand("copy");
    return copied
      ? { ok: true, method: "textarea_fallback" }
      : {
          ok: false,
          method: "failed",
          error: clipboardError ? copyErrorMessage(clipboardError) : "textarea_copy_failed",
        };
  } catch (error) {
    return {
      ok: false,
      method: "failed",
      error: `${clipboardError ? `${copyErrorMessage(clipboardError)}; ` : ""}${copyErrorMessage(error)}`,
    };
  } finally {
    textarea.remove();
  }
}

export default function NarratorPanel() {
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);
  const events = useNarratorStore((state) => state.events);
  const sourcePolicies = useNarratorStore((state) => state.sourcePolicies);
  const queueState = useNarratorStore((state) => state.queueState);
  const publishEvent = useNarratorStore((state) => state.publishEvent);
  const setSourcePolicy = useNarratorStore((state) => state.setSourcePolicy);
  const markQueued = useNarratorStore((state) => state.markQueued);
  const markSpoken = useNarratorStore((state) => state.markSpoken);
  const markFailed = useNarratorStore((state) => state.markFailed);
  const recordPlaybackDiagnostic = useNarratorStore((state) => state.recordPlaybackDiagnostic);
  const setReadRegion = useNarratorStore((state) => state.setReadRegion);
  const clearReadRegion = useNarratorStore((state) => state.clearReadRegion);
  const clearFeed = useNarratorStore((state) => state.clearFeed);
  const resetPolicies = useNarratorStore((state) => state.resetPolicies);
  const [speakingEventId, setSpeakingEventId] = React.useState<string | null>(null);
  const autoSpeakAttemptedEventIdsRef = React.useRef<Set<string>>(new Set());
  const activeSpeakRef = React.useRef<{ eventId: string; controller: AbortController } | null>(null);
  const eventArticleRefs = React.useRef<Map<string, HTMLElement>>(new Map());

  const setEventArticleRef = React.useCallback((eventId: string, node: HTMLElement | null) => {
    if (node) {
      eventArticleRefs.current.set(eventId, node);
    } else {
      eventArticleRefs.current.delete(eventId);
    }
  }, []);

  const readRegionForEvent = React.useCallback((event: NarratorEventV1) => {
    const node =
      eventArticleRefs.current.get(event.eventId) ??
      document.querySelector<HTMLElement>("[data-narrator-panel-root]");
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      left: Math.max(0, rect.left),
      top: Math.max(0, rect.top),
      width: Math.max(8, Math.min(rect.width, window.innerWidth - Math.max(0, rect.left))),
      height: Math.max(8, Math.min(rect.height, window.innerHeight - Math.max(0, rect.top))),
    };
  }, []);

  const speakEvent = React.useCallback(async (event: NarratorEventV1) => {
    if (!event.speakable || event.sourceKind === "voice_receipt") return;
    if (activeSpeakRef.current && activeSpeakRef.current.eventId !== event.eventId) {
      activeSpeakRef.current.controller.abort();
      markFailed(activeSpeakRef.current.eventId);
    }
    const controller = new AbortController();
    activeSpeakRef.current = { eventId: event.eventId, controller };
    setSpeakingEventId(event.eventId);
    const policy = sourcePolicies[event.sourceKind];
    const showReadRegion = policy?.deliveryMode === "auto_speak" || event.requestedDeliveryMode === "auto_speak";
    if (showReadRegion) {
      setReadRegion({
        phase: "voice_loading",
        eventId: event.eventId,
        sourceId: event.sourceId,
        textPreview: event.text,
        rect: readRegionForEvent(event),
        pointer: null,
        startedAtMs: Date.now(),
        durationMs: 1200,
      });
    }
    markQueued(event.eventId);
    try {
      const unlocked = await primeNarratorAudioPlayback();
      if (!unlocked) {
        markFailed(event.eventId, createNarratorPlaybackLockedDiagnostic());
        return;
      }
      const payload = buildNarratorVoiceSpeakPayload({ event });
      const response = await speakVoice(payload, { signal: controller.signal });
      if (showReadRegion) {
        setReadRegion({
          phase: "speaking",
          eventId: event.eventId,
          sourceId: event.sourceId,
          textPreview: event.text,
          rect: readRegionForEvent(event),
          pointer: null,
          startedAtMs: Date.now(),
          durationMs: 2200,
        });
      }
      const diagnostic = await playNarratorVoiceResponse(response, {
        signal: controller.signal,
        onDiagnostic: (nextDiagnostic) => recordPlaybackDiagnostic(event.eventId, nextDiagnostic),
      });
      markSpoken(event.eventId, undefined, diagnostic);
    } catch (error) {
      markFailed(
        event.eventId,
        error instanceof NarratorPlaybackError ? error.diagnostic : undefined,
      );
    } finally {
      if (activeSpeakRef.current?.eventId === event.eventId) activeSpeakRef.current = null;
      setSpeakingEventId(null);
      window.setTimeout(() => clearReadRegion(event.sourceId), 260);
    }
  }, [clearReadRegion, markFailed, markQueued, markSpoken, readRegionForEvent, recordPlaybackDiagnostic, setReadRegion, sourcePolicies]);

  React.useEffect(() => installNarratorAudioUnlockGestureListeners(), []);

  React.useEffect(() => () => {
    activeSpeakRef.current?.controller.abort();
    activeSpeakRef.current = null;
    stopNarratorAudioPlayback();
  }, []);

  React.useEffect(() => {
    if (speakingEventId) return;
    const nextEvent = [...events].reverse().find((event) => {
      if (!event.speakable || event.sourceKind === "voice_receipt") return false;
      if (autoSpeakAttemptedEventIdsRef.current.has(event.eventId)) return false;
      const policy = sourcePolicies[event.sourceKind];
      const status = queueState.deliveryStatusByEventId[event.eventId] ?? "visible";
      return Boolean(
        status === "visible" &&
          policy?.enabled &&
          (policy.deliveryMode === "auto_speak" || event.requestedDeliveryMode === "auto_speak"),
      );
    });
    if (!nextEvent) return;
    autoSpeakAttemptedEventIdsRef.current.add(nextEvent.eventId);
    void speakEvent(nextEvent);
  }, [events, queueState.deliveryStatusByEventId, sourcePolicies, speakEvent, speakingEventId]);

  const publishDebugProbe = React.useCallback(() => {
    const nowMs = Date.now();
    const event = publishEvent({
      sourceKind: "workstation_panel",
      sourceId: "panel:narrator:debug_probe",
      sourceLabelMessageId: "narrator.source.workstationPanel",
      text: "Narrator debug probe. This should route through the existing voice stack when auto-speak is eligible.",
      authority: "panel_observation",
      assistant_answer: false,
      terminal_eligible: false,
      certainty: "low",
      evidenceRefs: ["narrator:debug_probe"],
      traceId: `narrator:debug:${nowMs}`,
      rawContentIncluded: false,
      speakable: true,
      requestedDeliveryMode: "auto_speak",
      defaultDeliveryMode: "visible_only",
    }, { voiceArmed: true, nowMs });
    if (event) {
      autoSpeakAttemptedEventIdsRef.current.add(event.eventId);
      void speakEvent(event);
    }
  }, [publishEvent, speakEvent]);

  return (
    <div data-narrator-panel-root="true" className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Bell className="h-4 w-4 text-cyan-200" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{t("narrator.panel.title")}</div>
            <div className="truncate text-[11px] text-zinc-400">{t("narrator.panel.subtitle")}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.narrator.narrator-panel.publish-debug-probe"
            type="button"
            onClick={publishDebugProbe}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
            title={t("narrator.action.debugProbe")}
            aria-label={t("narrator.action.debugProbe")}
          >
            <Bug className="h-4 w-4" />
          </button>
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.narrator.narrator-panel.reset-policies"
            type="button"
            onClick={resetPolicies}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
            title={t("narrator.action.resetPolicies")}
            aria-label={t("narrator.action.resetPolicies")}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.narrator.narrator-panel.clear-feed"
            type="button"
            onClick={clearFeed}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
            title={t("narrator.action.clearFeed")}
            aria-label={t("narrator.action.clearFeed")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,280px)_1fr] overflow-hidden">
        <aside className="min-h-0 overflow-auto border-r border-white/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-zinc-400">
            <Megaphone className="h-3.5 w-3.5" />
            {t("narrator.section.sources")}
          </div>
          <div className="space-y-2">
            {sourceOrder.map((sourceKind) => {
              const policy = sourcePolicies[sourceKind];
              return (
                <div key={sourceKind} className="rounded border border-white/10 bg-white/[0.03] p-2">
                  <label className="flex items-center justify-between gap-2 text-xs font-medium">
                    <span className="truncate">{NARRATOR_SOURCE_LABELS[sourceKind]}</span>
                    <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.narrator.narrator-panel.input"
                      type="checkbox"
                      checked={policy.enabled}
                      onChange={(event) => setSourcePolicy(sourceKind, { enabled: event.target.checked })}
                      aria-label={`${NARRATOR_SOURCE_LABELS[sourceKind]} enabled`}
                    />
                  </label>
                  <select data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.narrator.narrator-panel.select"
                    value={policy.deliveryMode}
                    onChange={(event) => setSourcePolicy(sourceKind, { deliveryMode: event.target.value as NarratorDeliveryMode })}
                    className="mt-2 w-full rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                    aria-label={`${NARRATOR_SOURCE_LABELS[sourceKind]} delivery mode`}
                  >
                    {deliveryModes.map((mode) => (
                      <option key={mode} value={mode}>{mode.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="min-h-0 overflow-auto p-3">
          {events.length === 0 ? (
            <div className="flex h-full min-h-[180px] items-center justify-center rounded border border-dashed border-white/10 text-sm text-zinc-500">
              {t("narrator.feed.empty")}
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event) => {
                const status = queueState.deliveryStatusByEventId[event.eventId] ?? "visible";
                const playbackDiagnostic = queueState.playbackDiagnosticsByEventId[event.eventId];
                const canSpeak = event.speakable && event.sourceKind !== "voice_receipt";
                return (
                  <article
                    key={event.eventId}
                    ref={(node) => setEventArticleRef(event.eventId, node)}
                    className="rounded border border-white/10 bg-black/20 p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-zinc-500">{formatWhen(event.createdAtMs)}</span>
                      <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-200">
                        {NARRATOR_SOURCE_LABELS[event.sourceKind]}
                      </span>
                      <span className={`rounded border px-1.5 py-0.5 text-[11px] ${authorityClass(event)}`}>
                        {NARRATOR_AUTHORITY_LABELS[event.authority]}
                      </span>
                      <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-300">
                        {status}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-zinc-100">{event.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                      <span>source={event.sourceId}</span>
                      {event.traceId ? <span>trace={event.traceId}</span> : null}
                      {event.evidenceRefs.length ? <span>evidence={event.evidenceRefs.length}</span> : null}
                    </div>
                    {playbackDiagnostic ? (
                      <div className="mt-2 rounded border border-white/10 bg-zinc-950/80 px-2 py-1 font-mono text-[10px] leading-4 text-zinc-400">
                        playback={playbackDiagnostic.stage}
                        {" "}
                        playResolved={String(playbackDiagnostic.playResolved)}
                        {" "}
                        playing={String(playbackDiagnostic.playingObserved)}
                        {" "}
                        ended={String(playbackDiagnostic.endedObserved)}
                        {" "}
                        timeupdates={playbackDiagnostic.timeupdateCount}
                        {" "}
                        current={playbackDiagnostic.maxCurrentTime.toFixed(2)}
                        {" "}
                        duration={playbackDiagnostic.duration === null ? "n/a" : playbackDiagnostic.duration.toFixed(2)}
                        {" "}
                        volume={playbackDiagnostic.volume === null ? "n/a" : playbackDiagnostic.volume.toFixed(2)}
                        {" "}
                        muted={String(playbackDiagnostic.muted)}
                        {playbackDiagnostic.errorMessage ? ` error=${playbackDiagnostic.errorMessage}` : ""}
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center gap-1">
                      <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.narrator.narrator-panel.void-speak-event-event"
                        type="button"
                        disabled={!canSpeak || speakingEventId === event.eventId}
                        onClick={() => void speakEvent(event)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        title={t("narrator.action.speak")}
                        aria-label={t("narrator.action.speak")}
                      >
                        {speakingEventId === event.eventId ? <Pause className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      </button>
                      <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.narrator.narrator-panel.void-copy-narrator-event-text-event-text"
                        type="button"
                        onClick={() => void copyNarratorEventText(event.text)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                        title={t("narrator.action.copy")}
                        aria-label={t("narrator.action.copy")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {event.speakable ? <Eye className="ml-auto h-3.5 w-3.5 text-emerald-300" /> : <EyeOff className="ml-auto h-3.5 w-3.5 text-zinc-500" />}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
