import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const panelSource = () =>
  fs.readFileSync(
    path.resolve(__dirname, "../workstation/LiveAnswerEnvironmentPanel.tsx"),
    "utf8",
  );

const circuitSource = () =>
  fs.readFileSync(
    path.resolve(__dirname, "../workstation/LiveAnswerReasoningCircuit.tsx"),
    "utf8",
  );

const producerSource = () =>
  fs.readFileSync(
    path.resolve(__dirname, "../../lib/helix/visualFrameProducer.ts"),
    "utf8",
  );

describe("LiveAnswerEnvironmentPanel visual observer shades controls", () => {
  it("surfaces doc equation context as observation-only context", () => {
    const source = panelSource();

    expect(source).toContain('data-testid="live-answer-doc-equation-context"');
    expect(source).toContain("Doc Equation Context");
    expect(source).toContain("observation only");
    expect(source).toContain("docEquationScopeLabel");
    expect(source).toContain("buildDocEquationContextAskPrompt");
    expect(source).toContain('aria-label="Ask Helix to explain current doc equation context"');
  });

  it("exposes explicit apply controls in the visual capture panel", () => {
    const source = panelSource();

    expect(source).toContain('aria-label="Visual observer shade subject"');
    expect(source).toContain('aria-label="Apply selected visual observer shade"');
    expect(source).toContain("Apply selected shade");
    expect(source).toContain("Selected shade applied");
  });

  it("orders live source controls around the visual capture workflow", () => {
    const source = panelSource();

    expect(source).toContain('<div className="hidden">');
    expect(source).toContain('className="order-30 mt-3 rounded border border-white/10 bg-slate-950/60 p-3"');
    expect(source).toContain('className="mt-3 flex flex-wrap gap-1.5"');
    expect(source.indexOf("Route screen share to")).toBeLessThan(source.indexOf("Visual capture source"));
    expect(source).toContain('data-testid="live-answer-microdeck-catalog"');
    expect(source).toContain('className="order-4 mt-3 rounded border border-cyan-300/20 bg-cyan-950/10 px-2 py-2"');
    expect(source).toContain('className="order-5 mt-3 rounded border border-violet-300/20 bg-violet-950/10 px-2 py-2"');
    expect(source).toContain('className="order-6 mt-3 rounded border border-teal-300/20 bg-teal-950/10 p-2"');
    expect(source).toContain('className="order-7 mt-3 rounded border border-violet-300/20 bg-violet-950/10 p-2"');
    expect(source).toContain('className="order-8 mt-3 rounded border border-cyan-300/20 bg-cyan-950/10 px-2 py-2"');
  });

  it("organizes visual observer shades by subject category", () => {
    const source = panelSource();

    expect(source).toContain("visualShadeSubjectCategory");
    expect(source).toContain("Science");
    expect(source).toContain("stage_play_visual_observer_profile:solar-sdo-aia-193:v1");
    expect(source).toContain("Selected subject:");
    expect(source).toContain('label={`${group.category} subject`}');
  });

  it("applies shades through the Stage Play visual observer profile route", () => {
    const source = panelSource();

    expect(source).toContain("/api/helix/stage-play/visual-observer-profile/apply");
    expect(source).toContain("profileId: profile.profileId");
    expect(source).toContain("sourceIds: [source.source_id]");
    expect(source).toContain("Future visual frames will use this observer prompt.");
  });

  it("lets shade prompt edits save as custom profiles without mutating presets", () => {
    const source = panelSource();

    expect(source).toContain('aria-label="Visual observer shade prompt"');
    expect(source).toContain('aria-label="Save visual observer shade prompt as custom"');
    expect(source).toContain("Presets are read-only. Edits save as the next Custom slot.");
    expect(source).toContain("Save As");
    expect(source).toContain("nextVisualShadeCustomSlot");
    expect(source).toContain('title = `Custom ${slot}`');
    expect(source).toContain("/api/helix/stage-play/visual-observer-profile");
    expect(source).toContain("setSessionVisualObserverProfiles");
  });

  it("surfaces source and preset loading state for inaccessible shades", () => {
    const source = panelSource();

    expect(source).toContain('Phase: capture prompt / Source: {activeVisualSourceId ?? "will register on apply"}');
    expect(source).toContain("Shade presets are still loading. Refresh shades if the server was just restarted.");
    expect(source).toContain("Refresh shades");
  });

  it("catalogs capture prompts and mail reasoning decks without merging runtime phases", () => {
    const source = panelSource();

    expect(source).toContain("LiveAnswerMicroDeckCatalogItem");
    expect(source).toContain("LiveAnswerMicroDeckCatalogGroup");
    expect(source).toContain("microDeckCatalogGroups");
    expect(source).toContain("MicroDeck catalog");
    expect(source).toContain("CheckCircle2");
    expect(source).toContain("checked applied");
    expect(source).toContain("} applied");
    expect(source).toContain("liveAnswerMicroDeckColorKey");
    expect(source).toContain("liveAnswerMicroDeckSwatch");
    expect(source).toContain("colorKey:");
    expect(source).toContain('data-testid="live-answer-microdeck-color-key"');
    expect(source).toContain("color={item.colorKey}");
    expect(source).toContain("Visual Capture Decks");
    expect(source).toContain("Visual Mail Decks");
    expect(source).toContain("Audio Transcript Decks");
    expect(source).toContain('phase: "capture_prompt"');
    expect(source).toContain('phase: "mail_reasoning"');
    expect(source).toContain("capture prompt");
    expect(source).toContain("mail reasoning");
    expect(source).toContain("sortLiveAnswerMicroDeckCatalogItems");
    expect(source).toContain("if (left.applied !== right.applied) return left.applied ? -1 : 1");
    expect(source).toContain("selectMicroDeckCatalogItem");
    expect(source).toContain("setSelectedVisualObserverProfileId(item.id)");
    expect(source).toContain("setSelectedEarbudMicroReasonerPromptPresetId(item.id)");
    expect(source).toContain("setSelectedMicroReasonerPromptPresetId(item.id)");
  });

  it("mirrors Stage Play goal-context updates as a non-terminal reasoning circuit", () => {
    const source = `${panelSource()}\n${circuitSource()}`;

    expect(source).toContain("@shared/contracts/workstation-goal-context.v1");
    expect(source).toContain("/api/helix/stage-play/goal-context?threadId=");
    expect(source).toContain("setGoalContextUpdates");
    expect(source).toContain("setAgentGoalSessions");
    expect(source).toContain("liveAnswerCircuitRows");
    expect(source).toContain("liveAnswerCircuitSummary");
    expect(source).toContain('data-testid="live-answer-reasoning-circuit"');
    expect(source).toContain('data-testid="live-answer-narrator-binding-count"');
    expect(source).toContain('data-testid="live-answer-microdeck-output-count"');
    expect(source).toContain('data-testid="live-answer-visual-summary-count"');
    expect(source).toContain('data-testid="live-answer-feed-policy-ref-count"');
    expect(source).toContain('data-testid="live-answer-actuator-policy-ref-count"');
    expect(source).toContain('data-testid="live-answer-observation-authority-count"');
    expect(source).toContain('data-testid="live-answer-terminal-authority-count"');
    expect(source).toContain('data-testid="live-answer-terminal-authority-posture"');
    expect(source).toContain('data-testid="live-answer-goal-context-row"');
    expect(source).toContain('data-testid="live-answer-goal-context-refs"');
    expect(source).toContain('data-testid="live-answer-goal-context-policy-refs"');
    expect(source).toContain('data-testid="live-answer-goal-context-policy-split"');
    expect(source).toContain('data-testid="live-answer-goal-context-circuit-route"');
    expect(source).toContain('data-testid="live-answer-goal-context-authority-chips"');
    expect(source).toContain('data-testid="live-answer-goal-context-dispatch"');
    expect(source).toContain('data-testid="live-answer-agent-goal-session"');
    expect(source).toContain("Reasoning circuit");
    expect(source).toContain("Stage Play goal context mirrored into Live Answer as observation state.");
    expect(source).toContain("sourceRefs: update.sourceRefs");
    expect(source).toContain("loopRefs: update.loopRefs");
    expect(source).toContain("evidenceRefs: update.evidenceRefs");
    expect(source).toContain("policyRefs: liveAnswerPolicyRefsForUpdate(update)");
    expect(source).toContain('ref.startsWith("context_feed:")');
    expect(source).toContain('ref.startsWith("allowed_actuator:")');
    expect(source).toContain('ref.startsWith("workstation_context_feed:")');
    expect(source).toContain('ref.startsWith("workstation_actuator:")');
    expect(source).toContain("feedPolicyRefCount");
    expect(source).toContain("actuatorPolicyRefCount");
    expect(source).toContain("feed_policy_refs");
    expect(source).toContain("actuator_policy_refs");
    expect(source).toContain("liveAnswerCircuitHops");
    expect(source).toContain("circuitDestinationLabel");
    expect(source).toContain("blocked terminal claim");
    expect(source).toContain("evidence only");
    expect(source).toContain("wake interrupt");
    expect(source).toContain("narrator bind");
    expect(source).toContain("narrator bindings");
    expect(source).toContain("microdeck_outputs");
    expect(source).toContain("visual_summaries");
    expect(source).toContain("liveAnswerVisualSummaryUpdate");
    expect(source).toContain('update.producerKind === "visual_capture"');
    expect(source).toContain('update.updateKind === "visual_observation"');
    expect(source).not.toContain('update.updateKind === "visual_capture"');
    expect(source).toContain("producerKind === \"microdeck\"");
    expect(source).toContain("observation-only");
    expect(source).toContain("assistantAnswer: update.authority.assistantAnswer");
    expect(source).toContain("terminalEligible: update.authority.terminalEligible");
    expect(source).toContain("rawContentIncluded: update.authority.rawContentIncluded");
    expect(source).toContain("assistant={String(row.authority.assistantAnswer)}");
    expect(source).toContain("terminal={String(row.authority.terminalEligible)}");
    expect(source).toContain("raw={String(row.authority.rawContentIncluded)}");
    expect(source).toContain("terminal authority required");
    expect(source).toContain("terminal_authority_sessions");
    expect(source).toContain("Receipts, MicroDeck outputs, narrator bindings, and panel projections stay evidence until the completed solver path selects a terminal answer.");
  });

  it("mirrors visual mail deck status without duplicating Stage Play setup controls", () => {
    const source = panelSource();

    expect(source).toContain("/api/helix/stage-play/micro-reasoner-prompt-preset/apply");
    expect(source).toContain("Future mail-loop packets will use this prompt deck.");
    expect(source).toContain("MicroDeck presets are still loading. Refresh deck if the server was just restarted.");
    expect(source).toContain('Phase: mail reasoning / Source: {activeVisualSourceId ?? "will register on apply"}');
    expect(source).toContain("Full processed-mail MicroDeck setup and prompt preview belong in the Stage Play Badge Graph processed mail UI.");
    expect(source).not.toContain('aria-label="Micro-reasoner prompt preset"');
    expect(source).not.toContain('aria-label="Apply selected micro-reasoner prompt preset"');
    expect(source).not.toContain("selectedMicroPromptPreview");
  });

  it("gates adaptive expert lens evaluation behind the adaptive visual mail preset", () => {
    const source = panelSource();

    expect(source).toContain("ADAPTIVE_VISUAL_LENS_CONTROLLER_PRESET_ID");
    expect(source).toContain("selectedMicroReasonerPromptPresetId === ADAPTIVE_VISUAL_LENS_CONTROLLER_PRESET_ID");
    expect(source).toContain('data-testid="live-answer-adaptive-visual-lens"');
    expect(source).toContain("Adaptive Expert Lens");
    expect(source).toContain("mail reasoning -&gt; capture prompt suggestion");
    expect(source).toContain('aria-label="Evaluate adaptive visual lens"');
    expect(source).toContain('aria-label="Apply adaptive visual lens suggested shade"');
    expect(source).toContain("/api/helix/stage-play/adaptive-visual-lens/evaluate");
    expect(source).toContain("/api/helix/stage-play/adaptive-visual-lens/apply");
    expect(source).toContain("adaptiveVisualLensCanApply");
    expect(source).toContain("adaptiveVisualLensProposal.microReasonerRunRefs");
    expect(source).toContain("setSelectedVisualObserverProfileId(profile.profileId)");
  });

  it("renders a local-only last-frame preview in the visual capture source panel", () => {
    const source = panelSource();

    expect(source).toContain("Latest captured visual frame preview");
    expect(source).toContain("visualProducerState?.last_frame_preview_data_url");
    expect(source).toContain("No frame preview");
    expect(source).toContain("Hook up a visual source to start preview.");
    expect(source).toContain("local only");
  });

  it("keeps a bounded local review carousel for recent visual frames", () => {
    const source = panelSource();
    const producer = producerSource();

    expect(source).toContain('data-testid="visual-frame-review-carousel"');
    expect(source).toContain("Recent frame review");
    expect(source).toContain("capped at 20 frames and auto-expiring after 10 minutes");
    expect(source).toContain("selectedVisualFrameHistory.summary");
    expect(source).toContain("selectedVisualFrameHistory.visual_prompt_hash");
    expect(source).toContain("Review previous visual frame");
    expect(source).toContain("Review next visual frame");
    expect(source).toContain("Recent visual frame thumbnails");
    expect(source).toContain('data-testid="visual-frame-explicit-promotion-actions"');
    expect(source).toContain("Send now to GPT Live");
    expect(source).toContain("Use in next Ask");
    expect(source).toContain("Open frozen frame in Image Lens");
    expect(source).toContain("requestHelixAskVisualFrameLivePromotion");
    expect(source).toContain("requestHelixAskVisualFrameAttachmentPromotion");
    expect(source).toContain("useDocumentImageRegionStore.getState().setSourceImage");
    expect(producer).toContain("const visualFrameHistoryLimit = 20");
    expect(producer).toContain("const visualFrameHistoryTtlMs = 10 * 60 * 1000");
    expect(producer).toContain("frame_history: pruneVisualFrameHistory");
  });

  it("uses the freshest local visual producer when server visual latest has no source", () => {
    const source = panelSource();

    expect(source).toContain("Object.values(state.producers)");
    expect(source).toContain("producer.thread_id === threadId");
    expect(source).toContain("visualProducerState?.source_id ?? null");
    expect(source).toContain('visualCaptureStatus');
    expect(source).toContain('"manual_frame_ready"');
    expect(source).toContain('window.addEventListener("helix:image-lens:visual-frame-sent"');
  });

  it("offers multi-route screen sharing with Image Lens and audio transcript lanes", () => {
    const source = panelSource();

    expect(source).toContain('aria-label="Visual capture route"');
    expect(source).toContain("Live Answer visual");
    expect(source).toContain("Image Lens");
    expect(source).toContain("Audio transcript");
    expect(source).toContain("Start selected live sources");
    expect(source).toContain("visualCaptureRoutes");
    expect(source).toContain("VISUAL_CAPTURE_ROUTE_STORAGE_KEY");
    expect(source).toContain('VISUAL_CAPTURE_ROUTE_SYNC_EVENT = "helix:live-answer:visual-capture-routes"');
    expect(source).toContain("readStoredVisualCaptureRoutes");
    expect(source).toContain("coerceVisualCaptureRoutes");
    expect(source).toContain("window.localStorage.setItem(VISUAL_CAPTURE_ROUTE_STORAGE_KEY");
    expect(source).toContain("window.addEventListener(VISUAL_CAPTURE_ROUTE_SYNC_EVENT");
    expect(source).toContain("toggleVisualCaptureRoute");
    expect(source).toContain("routeVisualCaptureToImageLensWithStream");
    expect(source).toContain("startAudioTranscriptRoute");
    expect(source).toContain("/api/agi/situation/audio-source/permission-granted");
    expect(source).toContain("/api/agi/situation/audio-source/transcript-chunk");
    expect(source).toContain("postAudioTranscriptLiveSourceDescriptor");
    expect(source).toContain("AUDIO_TRANSCRIPT_DEFAULT_CHUNK_MS = 10_000");
    expect(source).toContain('data-testid="audio-transcript-review"');
    expect(source).toContain("Earbud outputs");
    expect(source).toContain("Audio Transcript Decks");
    expect(source).toContain('aria-label="Earbud micro-reasoner prompt preset"');
    expect(source).toContain('aria-label="Apply selected earbud micro-reasoner prompt preset"');
    expect(source).toContain("Apply earbud deck");
    expect(source).toContain('sourceKind: "audio_transcript"');
    expect(source).toContain("Future audio transcript chunks will use this prompt deck.");
    expect(source).toContain("Phase: mail reasoning / Source: {activeAudioTranscriptSourceId ?? `audio_transcript:${threadId}`}");
    expect(source).toContain("earbudMicroReasonerPromptPresets");
    expect(source).toContain("earbudMicroReasonerRuns");
    expect(source).toContain("/api/helix/stage-play/live-source-mail?");
    expect(source).toContain('data-testid="earbud-micro-reasoner-output"');
    expect(source).toContain("activeServerAudioTranscriptSource");
    expect(source).toContain("effectiveAudioTranscriptStatus");
    expect(source).toContain("Earbud output candidates");
    expect(source).toContain("latestEarbudMicroReasonerOutput");
    expect(source).toContain("completed earbud packet_composer run");
    expect(source).toContain("readEarbudRunText");
    expect(source).toContain("Document Markdown Decks");
    expect(source).toContain('data-testid="document-markdown-micro-reasoner"');
    expect(source).toContain('data-testid="document-markdown-micro-reasoner-output"');
    expect(source).toContain('data-testid="document-markdown-micro-reasoner-trace"');
    expect(source).toContain('sourceKind: "document_markdown"');
    expect(source).toContain('view: "full"');
    expect(source).toContain("documentMarkdownSourceIdFromLocation");
    expect(source).toContain("Future visible document Markdown packets will use this prompt deck.");
    expect(source).toContain("Document inline translation candidates");
    expect(source).toContain("Document source trace");
    expect(source).toContain("documentSourceWakeRequests");
    expect(source).toContain("isDocumentTranslationProductRun");
    expect(source).toContain('run.deckExecutionMode !== "baseline_fallback"');
    expect(source).toContain('run.deckProductRole === true');
    expect(source).toContain("readDocumentTranslationRunText");
    expect(source).toContain("audioTranscriptHistory");
    expect(source).toContain("pruneAudioTranscriptHistory");
    expect(source).toContain("Transcript chunks will appear here");
    expect(source).toContain("Chunk traffic {Math.round(audioTranscriptChunkMs / 1000)}s");
    expect(source).toContain("audioTranscriptStatus");
    expect(source).toContain("display_audio_track_missing");
    expect(source).toContain("audioRouteNeedsFreshShare");
    expect(source).toContain("Restart selected live sources");
    expect(source).toContain("Current visual share has no audio track");
    expect(source).toContain("selectedAudioTranscriptHistoryId");
    expect(source).toContain("selectAudioTranscriptByOffset");
    expect(source).toContain("Review previous audio transcript chunk");
    expect(source).toContain("Review next audio transcript chunk");
    expect(source).toContain("Review audio transcript chunk");
    expect(source).toContain("eventToPrimaryKey");
    expect(source).toContain("selectedVisualFrameHistory.captured_at");
    expect(source).toContain("setImageLensLiveSource");
    expect(source).toContain("Raw frames will not be summarized until a crop is sent");
    expect(source).toContain('window.dispatchEvent(new CustomEvent("open-helix-panel", { detail: { id: "image-lens" } }))');
  });

  it("labels Image Lens crop frames as bounded crop-only evidence in the carousel", () => {
    const source = panelSource();

    expect(source).toContain("selectedVisualFrameHistory.crop_only");
    expect(source).toContain("Image Lens crop-only frame");
    expect(source).toContain("submitted crop pixels");
    expect(source).toContain("selectedVisualFrameHistory.crop_bbox_px");
    expect(source).toContain("image_lens_crop");
  });

  it("adds a separate action replay section for re-lensing captured frames", () => {
    const source = panelSource();

    expect(source).toContain('data-testid="visual-frame-action-replay"');
    expect(source).toContain("Action replay");
    expect(source).toContain("Live capture can keep running.");
    expect(source).toContain('aria-label="Replay selected visual frame with selected shade"');
    expect(source).toContain("replaySelectedVisualFrame");
    expect(source).toContain("/api/agi/situation/visual-frame/analyze");
    expect(source).toContain("image_data_url: input.frame.preview_data_url");
    expect(source).toContain("visual_observer_profile_id: profileIsSessionOnly ? undefined : input.profile.profileId");
    expect(source).toContain("Replay results will appear here without replacing the live capture carousel.");
  });

  it("adopts tool-requested visual action replay jobs from the local carousel", () => {
    const source = panelSource();

    expect(source).toContain("HelixVisualFrameActionReplayRequest");
    expect(source).toContain("/api/agi/situation/visual-frame/replay/pending");
    expect(source).toContain("/api/agi/situation/visual-frame/replay/result");
    expect(source).toContain("visualReplayFramesForRequest");
    expect(source).toContain("request.requested_frame_history_ids");
    expect(source).toContain("request.summary_query");
    expect(source).toContain("missing_client_frames");
    expect(source).toContain("missing_shade_profile");
    expect(source).toContain("runVisualFrameActionReplayAnalysis");
  });

  it("does not mark a missing shade preset as applied", () => {
    const source = panelSource();

    expect(source).toContain("Boolean(");
    expect(source).toContain("activeVisualObserverProfile &&");
    expect(source).toContain("selectedVisualObserverProfile &&");
    expect(source).toContain("selectedShadeApplied");
  });
});
