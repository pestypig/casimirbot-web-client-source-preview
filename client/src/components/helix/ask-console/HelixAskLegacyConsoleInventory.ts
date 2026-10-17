export type HelixAskLegacyConsoleSliceClassification =
  | "live_day_to_day_must_move"
  | "pure_display_already_recrowned"
  | "behavior_sensitive_recrowned_with_parity"
  | "behavior_sensitive_quarantined"
  | "unknown_trap_door_quarantined"
  | "obsolete_requires_evidence_before_delete";

export type HelixAskLegacyConsoleSlice = {
  key: string;
  classification: HelixAskLegacyConsoleSliceClassification;
  source: "HelixAskPill.tsx" | "ask-console" | "lib/helix";
  evidence: string;
};

export const HELIX_ASK_LEGACY_CONSOLE_ACTIVE_PATH = [
  "HelixAskConsole",
  "HelixAskConsoleRuntimeShell",
  "HelixAskLegacyRuntimeBridge",
  "HelixAskPill",
] as const;

export const HELIX_ASK_LEGACY_CONSOLE_SOURCE_SNAPSHOT = {
  file: "client/src/components/helix/HelixAskPill.tsx",
  lineCountAtInventory: 23809,
  exportedComponentStartsAtLine: 6391,
  liveRenderSliceStartsAtLine: 23584,
  liveLegacyConsoleViewStartsAtLine: 23584,
  inventoryReason:
    "The normal Ask path remains on the legacy-looking bridge until the recrowned minimal runtime shell reaches live visual parity. Extracted ask-console display owners should continue to grow in the recrowned directory, not inside HelixAskPill.",
} as const;

export const HELIX_ASK_LEGACY_CONSOLE_SLICES = [
  {
    key: "legacy_active_bridge",
    classification: "live_day_to_day_must_move",
    source: "HelixAskPill.tsx",
    evidence:
      "HelixAskLegacyRuntimeBridge returns <HelixAskPill {...props} /> and remains the default only because live visual parity is not accepted yet. Do not grow HelixAskPill; move needed surface slices into ask-console before replacing the bridge.",
  },
  {
    key: "visible_console_layout",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The bottom render slice enters HelixAskLegacyConsoleView, which delegates to HelixAskConsoleRuntimeLayout and composes HelixAskSurfaceFrameSurface, HelixAskSurfaceComposerPanel, HelixAskSurfaceSupplementStack, HelixAskTurnListSurface, and HelixAskDebugDrawer.",
  },
  {
    key: "legacy_console_view_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The active legacy-console view state object now runs through buildHelixAskLegacyConsoleViewState, which packages already-derived top-level display props while reply rendering, refs, debug drawer close mutation, stream lifecycle, copy/debug/read-aloud execution, request transport, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "legacy_console_root_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The active legacy-console root props now run through buildHelixAskLegacyConsoleRootState, which packages already-derived className and layoutVariant while width/layout derivation, runtime shell selection, request transport, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "surface_frame_surface_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The active legacy-console frame/chrome slot now runs through HelixAskSurfaceFrameSurface while submit handling, audio-prime interaction handling, width/palette derivation, and offline state remain in the bridge.",
  },
  {
    key: "legacy_console_surface_frame_state_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "HelixAskLegacyConsoleView now owns surface-frame state-to-slot composition while max-width/palette/offline derivation, submit handling, and audio-prime behavior remain in the bridge.",
  },
  {
    key: "surface_frame_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live surface-frame state object now runs through buildHelixAskSurfaceFrameState, which packages already-derived width, palette, offline, submit, and audio-prime props while width/palette derivation, submit handling, audio-prime behavior, request transport, and voice playback side effects remain in the bridge.",
  },
  {
    key: "legacy_surface_content_state_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "HelixAskLegacyConsoleView now owns legacy surface-content state-to-slot composition through HelixAskLegacySurfaceContent, which instantiates and orders the composer, supplement stack, and reasoning theater while all derived state, callbacks, refs, submit/stop behavior, media behavior, and request transport remain in the bridge.",
  },
  {
    key: "legacy_surface_content_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live legacy surface-content state object now runs through buildHelixAskLegacySurfaceContentState, which packages the already-derived composer, supplement, and reasoning-theater props while all state derivation, callbacks, refs, submit/stop behavior, media behavior, request transport, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "legacy_procedural_timeline_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The procedural timeline display handoff runs through HelixAskLegacyProceduralTimelineSlot while terminal-kind selection and terminal authority remain in the bridge.",
  },
  {
    key: "legacy_procedural_timeline_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The obsolete bridge-local renderProceduralTurnTimeline row builder has been moved to HelixAskLegacyProceduralTimelineProjection; it reads already-produced debug/truth-table/runtime records and delegates visible terminal-kind selection back to the bridge.",
  },
  {
    key: "prompt_composer_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live render slice uses HelixAskComposerTextarea, HelixAskMoodAvatar, and HelixAskComposerActionToolbarSurface for runtime picker, submit button, and action toolbar composition.",
  },
  {
    key: "composer_action_toolbar_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The action-toolbar composition for runtime picker and submit/stop button moved to HelixAskComposerActionToolbarSurface, which mounts the shared recrowned carousel controller, while haptic policy, mic toggles, attachment selection, visual/audio source controls, runtime selection behavior, submit/stop behavior, and request submission remain in the bridge.",
  },
  {
    key: "composer_action_carousel_controller",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Action-carousel refs, physical action-endpoint measurement, viewport, track, delayed-child, and interface-direction observation, and scroll commands now live in useHelixAskActionCarousel and are shared by legacy and minimal runtimes through HelixAskComposerActionToolbarSurface. HelixAskPill retains only the injected haptic intent callback.",
  },
  {
    key: "composer_action_toolbar_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live composer action-toolbar props now run through buildHelixAskComposerActionToolbarState while only an injected carousel haptic-intent callback, mic/media toggles, runtime selection, submit/stop behavior, and request submission remain in the bridge.",
  },
  {
    key: "legacy_composer_surface_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live composer slot now runs through HelixAskLegacyComposerSurface, which composes the voice-level monitor, mood avatar, action toolbar, and textarea surfaces while all draft syncing, haptics, mic/media behavior, runtime selection, submit/stop behavior, and request submission remain in the bridge.",
  },
  {
    key: "legacy_composer_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live composer state object now runs through buildHelixAskLegacyComposerState, which packages already-derived voice-level monitor, mood avatar, action toolbar, textarea, and textarea ref props while draft syncing, haptics, mic/media behavior, runtime selection, submit/stop behavior, and request submission remain in the bridge.",
  },
  {
    key: "reasoning_theater_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live reasoning-theater state object now runs through buildHelixAskReasoningTheaterState, which packages already-derived busy visibility, palette classes, Mirek field data, status/medal props, meter refs, frontier icon props, and floating action text props while reasoning-state derivation, medal/frontier broken-image mutation, ref lifecycle, stream behavior, request transport, and terminal authority remain in the bridge.",
  },
  {
    key: "reasoning_theater_status_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live reasoning-theater status and medal strip props now run through buildHelixAskReasoningTheaterStatusState while reasoning label derivation, medal queue mapping inputs, broken-image mutation, stream behavior, request transport, and terminal authority remain in the bridge.",
  },
  {
    key: "reasoning_theater_meter_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live reasoning-theater meter and frontier props now run through buildHelixAskReasoningTheaterMeterState while beat/ambient derivation, frontier label derivation, refs, broken-image mutation, stream behavior, request transport, and terminal authority remain in the bridge.",
  },
  {
    key: "voice_level_monitor_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live composer voice-level meter slot now runs through HelixAskVoiceLevelMonitorSurface while voice capture state, signal metrics, refs, and media lifecycle stay in the bridge.",
  },
  {
    key: "voice_level_monitor_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live composer voice-level meter props now run through buildHelixAskVoiceLevelMonitorState, deriving visibility from supplied mic-arm state while signal metrics, refs, resize measurement, voice capture state, and media lifecycle stay in the bridge.",
  },
  {
    key: "mood_avatar_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live composer mood-avatar slot now runs through HelixAskMoodAvatarSurface while mood asset selection, broken-image state mutation, palette derivation, and mood updates stay in the bridge.",
  },
  {
    key: "mood_avatar_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live composer mood-avatar props now run through buildHelixAskMoodAvatarState while mood asset selection, palette derivation, broken-image state mutation, and mood updates stay in the bridge.",
  },
  {
    key: "composer_textarea_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live composer textarea slot now runs through HelixAskComposerTextareaSurface while draft syncing, paste handling, submit request wiring, input refs, and prompt admission remain in the bridge.",
  },
  {
    key: "composer_textarea_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live composer textarea props now run through buildHelixAskComposerTextareaState while draft syncing, paste handling, submit request wiring, input refs, and prompt admission remain in the bridge.",
  },
  {
    key: "composer_textarea_sizing_controller",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Textarea value synchronization, focus/cursor placement, bounded auto-sizing, cached style metrics, native-input write avoidance, and scroll positioning now run through HelixAskComposerTextareaSizing while the legacy bridge retains only the textarea ref and controller call-through.",
  },
  {
    key: "composer_prompt_history_navigation",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic prompt-history entry shaping, up/down navigation, draft restoration, and textarea-boundary key admission moved to HelixAskPromptHistory with tests while prompt-history refs, draft mutation, textarea focus, and submit recording remain in the bridge.",
  },
  {
    key: "composer_slash_command_discovery",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic slash-command catalog shaping, account-policy filtering, menu state/key projection, visible menu rendering, and slash-token prompt insertion moved to HelixAskSlashCommand* owners with tests while draft mutation, textarea focus, open/query refs, selected runtime/account-policy state, and submit behavior remain in the bridge.",
  },
  {
    key: "reply_projection_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live render slice uses HelixAskTurnListSurface for the reply lane, HelixAskReplyTurnSurface for completed turn streams, HelixAskActiveTurnReplySurface for the active turn stream slot, HelixAskFinalAnswerSurface for final answer blocks, latest-turn binding helpers, and recrowned final-text, reply-event ordering, and fail-context helpers.",
  },
  {
    key: "final_answer_surface_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The completed-turn final-answer slot now runs through HelixAskFinalAnswerSurface while visible answer selection, source labeling, path-link callbacks, math rendering callbacks, terminal authority, copy/read-aloud targets, and debug payloads stay in the bridge.",
  },
  {
    key: "final_answer_path_text_segments",
    classification: "pure_display_already_recrowned",
    source: "lib/helix",
    evidence:
      "Final-answer file-path text segmentation moved to splitHelixAskTextPathSegments in ask-answer-rendering.ts, removing the local path regex from HelixAskPill while panel-id resolution, button rendering, and openPanelById side effects stay in the bridge.",
  },
  {
    key: "path_linked_text_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "Final-answer file-path link button rendering now runs through HelixAskPathLinkedTextSurface while path-to-panel resolution, panel registry reads, and openPanelById side effects remain bridge-owned callbacks.",
  },
  {
    key: "legacy_content_renderers",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "Final-answer text/path-link, math-aware content, standalone final-answer renderer callbacks, and plain/response-envelope answer slot render callbacks now run through useHelixAskLegacyContentRenderers while path-to-panel resolution, panel registry reads, openPanelById side effects, envelope selection, calculator-panel affordance decisions, terminal authority, copy/debug/read-aloud targets, and debug payloads remain in the bridge.",
  },
  {
    key: "legacy_answer_envelope_renderer_callbacks",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "HelixAskPill no longer directly renders HelixAskLegacyAnswerEnvelopeSlot for plain or response-envelope replies; it derives the same selected text, section grouping, extension toggle callback, and calculator launch state, then delegates the visible slot rendering to useHelixAskLegacyContentRenderers.",
  },
  {
    key: "final_answer_inline_code_segments",
    classification: "pure_display_already_recrowned",
    source: "lib/helix",
    evidence:
      "Final-answer inline-code text segmentation moved to splitHelixAskInlineCodeTextSegments in ask-answer-rendering.ts, removing the embedded code-span regex loop from HelixAskPill while React <code> rendering and math/path rendering callbacks stay in the bridge.",
  },
  {
    key: "envelope_sections_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "Envelope section display moved to HelixAskEnvelopeSectionsSurface while envelope answer selection, detail/proof grouping, extension state, calculator-panel affordance decisions, citation normalization, and content rendering callbacks stay in the bridge.",
  },
  {
    key: "envelope_supplement_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "Envelope extension, Details, and Proof disclosure wrappers moved to HelixAskEnvelopeSupplementSurface while extension availability/open state, detail/proof section grouping, citation normalization, content rendering callbacks, and reply-scoped toggle state mutation stay in the bridge.",
  },
  {
    key: "calculator_panel_launch_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The final-answer calculator launch affordance moved to HelixAskCalculatorPanelLaunchSurface while equation-family detection, panel availability checks, and openPanelById side effects stay in the bridge.",
  },
  {
    key: "inline_code_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "Inline code and code-style math token chip rendering moved to HelixAskInlineCodeSurface while math tokenization, inline-code segmentation, code-style classification, and final-answer content ordering stay in the bridge/lib owners.",
  },
  {
    key: "math_html_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "KaTeX math HTML span rendering moved to HelixAskMathHtmlSurface while KaTeX HTML generation, math tokenization, display-mode selection, and error fallback handling stay in the bridge/lib owners.",
  },
  {
    key: "rendered_content_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "Math-aware final-answer content rendering, inline-code segmentation, KaTeX rendering, and inline math/code surface composition now run through HelixAskRenderedContentSurface while path-link panel resolution/opening, final answer selection, envelope selection, calculator-panel affordance decisions, and terminal authority remain in the bridge.",
  },
  {
    key: "legacy_answer_envelope_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "Plain-answer and response-envelope display composition now runs through HelixAskLegacyAnswerEnvelopeSlot, which owns the nested plain answer, envelope answer, final-answer surface, calculator launch affordance, envelope supplement, and envelope section surfaces while answer text selection, section grouping, extension open-state mutation, calculator visibility decisions, panel opening callback ownership, terminal authority, copy/debug/read-aloud targets, and debug payloads remain in the bridge.",
  },
  {
    key: "plain_answer_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The non-envelope plain answer layout moved to HelixAskPlainAnswerSurface while reply content selection, content rendering callbacks, calculator-panel affordance decisions, and openPanelById side effects stay in the bridge.",
  },
  {
    key: "envelope_answer_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The response-envelope answer layout wrapper moved to HelixAskEnvelopeAnswerSurface while final answer node construction, calculator launch construction, supplement construction, answer text selection, and extension state mutation stay in the bridge.",
  },
  {
    key: "turn_list_surface_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The legacy-console reply-list slot, empty-list null state, and active-turn reply node composition now run through HelixAskTurnListSurface while chronological reply selection, active stream row derivation, scroll refs, console debug snapshot construction, and bottom-scroll scheduling stay in the bridge.",
  },
  {
    key: "legacy_console_turn_list_state_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "HelixAskLegacyConsoleView now owns turn-list state-to-slot composition while chronological reply selection, completed reply mapping, active stream row derivation, scroll refs, console debug snapshot construction, latest-turn selection, debug/copy/read-aloud callbacks, and bottom-scroll scheduling remain in the bridge.",
  },
  {
    key: "active_turn_list_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The active-turn list state object now runs through buildHelixAskActiveTurnListState, which packages already-derived active stream rows, ids, refs, status line, debug snapshot, and display callbacks while stream event admission, row derivation, quiet-gap timing, terminal authority, clipboard, fetch, and TTS stay in the bridge.",
  },
  {
    key: "reply_turn_surface_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The completed legacy-console reply slot now runs through HelixAskReplyTurnSurface while latest reply selection, terminal projection, debug payloads, copy/read-aloud callbacks, job link execution, and reply state remain in the bridge.",
  },
  {
    key: "reply_turn_item_surface_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The completed reply item div wrapper moved to HelixAskReplyTurnItemSurface while reply projection, latest-turn selection, terminal projection, debug payloads, copy/read-aloud callbacks, job link execution, and reply state remain in the bridge.",
  },
  {
    key: "completed_reply_turn_surface_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The completed reply item wrapper plus reply-turn surface composition moved to HelixAskCompletedReplyTurnSurface while reply projection, latest-turn selection, terminal projection, debug payloads, copy/read-aloud callbacks, job link execution, and reply state remain in the bridge.",
  },
  {
    key: "legacy_completed_reply_slot_state",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The bridge now passes an already-derived completed-reply turn state object through HelixAskLegacyCompletedReplySlot instead of directly instantiating HelixAskCompletedReplyTurnSurface; reply projection, latest-turn selection, terminal projection, debug payloads, copy/read-aloud callbacks, and job execution remain in the bridge.",
  },
  {
    key: "legacy_completed_reply_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The completed legacy-console reply slot props now run through buildHelixAskLegacyCompletedReplyState, which packages the already-derived reply id and turn state while reply projection, latest-turn selection, terminal projection, debug payload materialization, copy/read-aloud callbacks, job execution, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "reply_turn_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The completed reply-turn props now run through buildHelixAskReplyTurnState, which packages the already-derived latest flag, card props, and stream props while reply projection, latest-turn selection, terminal projection, debug payload materialization, copy/read-aloud callbacks, job execution, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "completed_reply_stream_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The completed reply stream props now run through buildHelixAskCompletedReplyStreamState, which packages already-derived stream rows, final-answer display props, provider/model metadata, control labels, and callback references while row derivation, latest-turn selection, terminal projection, debug payload materialization, clipboard/debug/TTS execution, job execution, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "completed_reply_card_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The completed reply card props now run through buildHelixAskCompletedReplyCardState, which packages already-derived card test id, tint class, context capsule, runtime-goal debug summary, and prompt-ingested flag while reply projection, latest-turn selection, terminal projection, debug payload materialization, copy/read-aloud callbacks, job execution, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "completed_reply_battle_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The completed reply battle/tint state now runs through buildHelixAskCompletedReplyBattleState, which packages already-derived causal timeline events, live events, and reasoning-theater state into display-only beats, ambient state, and answer tint while event collection, reasoning-theater debug extraction, active theater state, stream behavior, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "debug_drawer_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The visible debug drawer slot and drawer-state-to-visible-props projection now run through HelixAskDebugDrawerSurface while selected debug state, drawer close mutation, debug payload materialization, backend debug-export fetch, clipboard writes, and copied-id timers remain in the bridge.",
  },
  {
    key: "legacy_console_debug_drawer_state_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "HelixAskLegacyConsoleView now owns debug drawer state-to-slot composition while selected drawer React state, close mutation, debug payload materialization, backend debug-export fetch, clipboard writes, and copied-id timers remain in the bridge.",
  },
  {
    key: "active_turn_reply_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The in-progress active-turn reply card composition moved to HelixAskActiveTurnReply with the same HelixAskReplyTurn shell, active-turn test ids, disabled debug/copy/read-aloud controls, empty-row null rendering, default no-final placeholder rendering, and no stream state, request, terminal-authority, or side-effect ownership.",
  },
  {
    key: "active_turn_reply_surface_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The active legacy-console live-progress reply slot now runs through HelixAskActiveTurnReplySurface via HelixAskTurnListSurface while visible row derivation, active turn ids, quiet-gap status, scroll refs, and stream admission stay in the bridge; the bridge no longer guards this slot with a local empty-row display condition or constructs the active-turn reply node locally.",
  },
  {
    key: "operator_supplement_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live render slice uses extracted goal and steering queue components, and delegates the attachment, context capsule, situation room, observer, voice status, voice confirmation, context chooser, and context-memory status stack to HelixAskConsoleSupplementSurface.",
  },
  {
    key: "goal_pill_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The conditional goal-pill slot moved to HelixAskGoalPillSurface while goal session state, expansion state, busy/error state, and goal action execution remain in the bridge.",
  },
  {
    key: "legacy_console_goal_pill_state_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "HelixAskLegacyConsoleView now owns goal-pill state-to-slot composition while goal session state, expansion mutation, busy/error mutation, and goal action execution remain in the bridge.",
  },
  {
    key: "goal_pill_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The visible goal-pill state object now runs through buildHelixAskGoalPillState, which packages the already-owned session, expanded flag, busy/error state, and callbacks while goal session state, expansion mutation, busy/error mutation, goal action execution, request transport, and terminal authority stay in the bridge.",
  },
  {
    key: "steering_queue_surface_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The active legacy-console steering-queue slot now runs through HelixAskSteeringQueueSurface, preserving the current empty-slot behavior while queue item state and any future queue toggle mutation stay outside the bridge render seam.",
  },
  {
    key: "legacy_console_steering_queue_default_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "HelixAskLegacyConsoleView now owns the default empty steering-queue slot composition while queue item derivation, auto-wake checks, and future queue toggle mutation remain outside the view.",
  },
  {
    key: "console_supplement_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The visible supplement stack composition moved to HelixAskConsoleSupplementSurface while attachment removal, voice command execution, transcript confirmation, context chooser execution, observer event selection, source capture, audio stop behavior, and context-memory derivation remain in the bridge.",
  },
  {
    key: "console_supplement_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The visible supplement state object now runs through buildHelixAskConsoleSupplementState, which packages already-derived attachment, context capsule, voice status, Situation Room source, confirmation, context chooser, observer lane, and context-memory props while attachment removal, voice command execution, transcript confirmation, context chooser execution, observer event selection, and context-memory derivation remain in the bridge; visual/audio source capture is supplied by the recrowned runtime hook.",
  },
  {
    key: "situation_room_source_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The Situation Room source panel props now run through buildHelixAskSituationRoomSourceState, which packages already-derived visible label/status/error/transcript/audio props supplied by the recrowned visual-source capture runtime; the bridge only wires the resulting state into the legacy view.",
  },
  {
    key: "situation_room_source_display_derivation",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The Situation Room source visible label/status/count/transcript/audio-active derivation now runs through buildHelixAskSituationRoomSourceDerivedState from snapshots owned by the recrowned visual-source capture runtime; source refs, media capture, display-audio lifecycle, and stop-audio execution no longer live in the bridge.",
  },
  {
    key: "voice_confirmation_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The voice command and transcript confirmation panel props now run through buildHelixAskVoiceCommandConfirmationState and buildHelixAskTranscriptConfirmationState, which package already-derived visible text/countdown/callback props while command policy, transcript confirmation policy, candidate state mutation, voice execution, and retry execution remain injected by the active runtime.",
  },
  {
    key: "voice_confirmation_countdown_runtime",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "HelixAskVoiceConfirmationRuntime owns the shared three-second command/transcript countdown lifecycle, candidate identity guards, transcript-over-command precedence, live-activity reset, transcript policy rechecks, cleanup, typed events, and an independent minimal-shell surface. Fake-timer lifecycle tests cover exact-once auto-confirm, manual cancellation, preemption, reset, fail-closed policy, mic disable, unmount cleanup, and minimal-shell use without HelixAskPill; execution and candidate mutation remain injected.",
  },
  {
    key: "workflow_next_prompt_qte_runtime",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "HelixAskWorkflowSuggestionRuntime owns the shared legacy/ReCrowned next-prompt surface. It observes only typed workflow/workbench objects, projects a non-terminal editable QTE, and inserts through launchHelixAskPrompt with autoSubmit false. Deterministic progress reduction and persisted demo-session state live outside HelixAskPill; model sampling, tool execution, route authority, terminal authority, and automatic submission are forbidden here.",
  },
  {
    key: "context_chooser_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The context chooser panel props now run through buildHelixAskContextChooserState, which packages already-derived visibility, mode, countdown, and action callbacks while chooser policy, countdown lifecycle, attached/isolated execution, cancellation, and state mutation remain in the bridge. The old attached-workspace-context prompt is retired behind HELIX_ASK_LEGACY_ATTACHED_CONTEXT_CHOOSER_ENABLED and must not be recrowned as active request-context behavior.",
  },
  {
    key: "observer_supplement_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The observer lane and conversation-brief supplement props now run through buildHelixAskObserverSupplementState, which packages already-derived observer visibility, brief text, and event props while timeline selection, observer event derivation, busy-state policy, and observer execution remain in the bridge.",
  },
  {
    key: "context_memory_status_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The context-memory status supplement prop now runs through buildHelixAskContextMemoryStatusState, which packages already-derived context-memory status text while session capsule confidence derivation and memory state ownership remain in the bridge.",
  },
  {
    key: "voice_status_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The voice status supplement props now run through buildHelixAskVoiceStatusState, which packages already-derived voice status label and state while voice capture, transcription, and mic state mutation remain in the bridge.",
  },
  {
    key: "voice_status_label_derivation",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The voice status supplement label now runs through buildHelixAskVoiceStatusDerivedState, which delegates to the pure voice copy display helper from supplied mic/input/error state while voice capture, transcription, mic state mutation, recorder lifecycle, and TTS remain in the bridge.",
  },
  {
    key: "voice_capture_health_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The voice capture health snapshot now runs through buildHelixAskVoiceCaptureHealthState, which packages already-derived voice meter, recorder, warning, checkpoint, and roundtrip fields with an injected timestamp while MediaRecorder setup, mic state mutation, voice capture lifecycle, diagnostics publication, browser audio inspection, and TTS remain in the bridge.",
  },
  {
    key: "voice_capture_diagnostics_base_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The shared voice capture diagnostics base snapshot now runs through buildHelixAskVoiceCaptureDiagnosticsBaseState, which packages already-derived voice health, checkpoint, segment, pending-confirmation, and feature-flag fields while diagnostics publication, playback diagnostics, browser audio inspection, voice capture lifecycle, request transport, and TTS remain in the bridge.",
  },
  {
    key: "voice_feature_flags_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The shared voice diagnostics feature-flag bundle now runs through buildHelixAskVoiceFeatureFlagsState while rollout decisions, command lane policy, local audio gate state, speaker state, diagnostics publication, browser audio inspection, voice capture lifecycle, request transport, and TTS remain in the bridge.",
  },
  {
    key: "voice_timeline_build_info_event_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The visible voice timeline build-info event now runs through buildHelixAskVoiceTimelineBuildInfoEvent while event source admission, chunk/segment/timeline merge policy, fetch/abort lifecycle, diagnostics publication, mic/STT runtime, and TTS stay in the bridge.",
  },
  {
    key: "context_capsule_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The context capsule supplement props now run through buildHelixAskContextCapsuleState, which packages already-derived context capsule preview and auto-applied flag while session capsule derivation and capsule copy behavior remain in the bridge.",
  },
  {
    key: "active_context_capsule_display_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The active context-capsule preview and memory-status display text now run through buildHelixAskActiveContextCapsuleDerivedState, which projects an already-derived session capsule state into visible supplement props while ledger ranking/selection, context capsule session mutation, copy behavior, request transport, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "attachment_strip_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The attachment strip supplement props now run through buildHelixAskAttachmentStripState, which packages already-derived attachment commit checks and the bridge-owned remove callback while attachment mutation, validation, and request payload shaping stay in their existing owners.",
  },
  {
    key: "supplement_clip_text_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The supplement text-clipping callback now runs through buildHelixAskSupplementClipTextState, which packages the already-imported display trimming callback while the trimming implementation and text normalization remain in lib/helix.",
  },
  {
    key: "reasoning_meter_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The busy reasoning meter, battle-stage slot, Mirek bar particles, frontier icon slot, frontier particle refs, and floating action text rendering moved to HelixAskReasoningMeterSurface while theater state, animation timing, refs, icon-broken state mutation, and reasoning beat construction remain in the bridge.",
  },
  {
    key: "reasoning_theater_surface",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live busy reasoning theater composition now runs through HelixAskReasoningTheaterSurface, including busy panel chrome, Mirek field placement, background particle overlay, status/medal strip placement, and meter surface placement while theater state derivation, medal queue state, animation timing, refs, broken-image state mutation, and reasoning beat construction remain in the bridge.",
  },
  {
    key: "console_status_surfaces",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live render slice now delegates error-line, voice-status, and context-memory status composition to HelixAskConsoleStatusSurfaces while error state, voice capture state, and context-memory derivation remain in the bridge.",
  },
  {
    key: "error_line_surface_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The active legacy-console error-line slot now runs through HelixAskConsoleErrorLineSurface while askError state mutation, clearing, and request error handling remain in the bridge.",
  },
  {
    key: "console_error_line_state_projection",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "The live error-line state object now runs through buildHelixAskConsoleErrorLineState, which packages the already-derived ask error message while request error handling, clearing behavior, state mutation, runtime transport, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "legacy_console_error_line_message_slot",
    classification: "pure_display_already_recrowned",
    source: "ask-console",
    evidence:
      "HelixAskLegacyConsoleView now owns errorMessage-to-errorLine slot composition while askError state mutation, clearing, and request error handling remain in the bridge.",
  },
  {
    key: "legacy_chat_persistence_binding",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "The injected chat-store write adapter moved to HelixAskLegacyChatPersistenceBinding with tests preserving session id, payload shape, null-session behavior, and keeping pure payload shaping separate from store mutation.",
  },
  {
    key: "agent_runtime_preference_storage",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Agent runtime localStorage preference moved to HelixAskRuntimePreference with tests preserving default fallback, id validation, write behavior, and storage exception handling; deterministic runtime picker select/primary-button decisions moved to ask-agent-runtime-display with tests while provider fetch transport, haptics, React state mutation, persistence side effects, and request payload wiring remain in the bridge.",
  },
  {
    key: "visual_capture_audio_preference_sync",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Visual capture audio route preference lives in HelixAskVisualCapturePreference, and the browser screen/camera, frame-producer, descriptor/heartbeat, optional shared-tab-audio transcript, cancellation, source-snapshot, and cleanup lifecycle moved to useHelixAskVisualSourceCaptureRuntime with the pill reduced to injected availability/panel/event/error wiring and observation-state consumption.",
  },
  {
    key: "visual_frame_explicit_promotion_ingress",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Explicit selected-frame promotion is owned by HelixAskVisualFramePromotion, while useHelixAskVisualFrameAttachmentIngress owns data-URL validation, attachment-limit admission, and composer mutation. The legacy pill only supplies its existing attachment read/commit/error seams; GPT Live consent and transport remain in useHelixAskLiveRuntimeSession.",
  },
  {
    key: "context_compaction_resume_frame_storage",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Context compaction pause text parsing, resume-frame extraction, and session-storage cache moved to HelixAskContextCompactionResumeFrameStorage with tests preserving schema validation, nested frame lookup, latest-reply selection, read fallback, write behavior, and storage exception handling while request handoff remains in the bridge.",
  },
  {
    key: "context_compaction_pause_pending_classifier",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic context-compaction pause-pending reply classification moved to HelixAskContextCompactionResumeFrameStorage with tests preserving pending-request and explicit content fallback detection while context-compaction state mutation, queue unblocking, and request metadata handoff remain in the bridge.",
  },
  {
    key: "legacy_fallback_output_cleanup",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic legacy/local fallback output cleanup moved to ask-output-cleanup with tests preserving answer-boundary extraction, evidence-block pruning, scaffold cleanup, and stage-tag preservation while fallback admission and execution stay in the bridge.",
  },
  {
    key: "pasted_text_attachment_materialization",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Pasted-text attachment encoding, SHA-256 hashing, metadata materialization, and text turn-input item shaping moved to HelixAskTextAttachment with tests preserving Unicode base64, deterministic filename/id/hash dependency seams, preview trimming, and assistant-answer=false turn-input shape while attachment admission and request-envelope construction remain in the bridge.",
  },
  {
    key: "image_attachment_materialization",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Image attachment materialization and clipboard image-file selection moved to HelixAskImageAttachment with tests preserving pasted-image filename fallback, injected base64/object-url seams, image-only admission, 8 MB size limits, and reuse by both file-select and paste handlers while attachment mutation, source admission, request-envelope construction, image-lens execution, and turn submission remain in the bridge.",
  },
  {
    key: "attachment_commit_validation",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic image/text attachment submit-readiness commit checks, composer commit-check list projection, ready-state selection, structured preview metadata, and stale/too-large/unsupported/error reason shaping moved to HelixAskAttachmentCommit with tests while attachment mutation, source admission, request-envelope construction, attachment payload authority, and turn submission remain in the bridge.",
  },
  {
    key: "submitted_attachment_payload_shaping",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic submitted-attachment selection, native-image selection, first submit-ready image selection, submitted attachment validation-entry shaping, first-invalid selection, submitted-attachment context-pack projection, visual-evidence turn-input context, explicit-item precedence, turn-input item shaping, and submit run-options payload selection moved to HelixAskAttachmentPayload with tests preserving text/image metadata, assistant_answer=false, raw-content/raw-image flags, image_base64 trimming, image_ref/evidence_ref item construction, visual evidence refs, invalid attachment reason selection, diagnostic visual evidence suppression, attachment-over-visual payload priority, and stale attachment filtering while attachment mutation, visual evidence admission, image-lens execution, request-envelope construction, and turn submission remain in the bridge.",
  },
  {
    key: "voice_playback_runtime_predicates",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic voice playback user-agent gain selection, iOS desktop-mode touch-point classification, graph/direct path selection, graph-bypass timing, and active-audio identity checks moved to ask-voice-playback-runtime with tests while audio graph setup, playback scheduling, TTS transport, diagnostics, and queue mutation remain in the bridge.",
  },
  {
    key: "atomic_viewer_launch_suppression",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic docs-summary prompt suppression for explicit docs-viewer context/path moved to ask-doc-viewer-context with tests while atomic viewer event dispatch, storage writes, URL/store reads, and panel launch side effects remain in the bridge.",
  },
  {
    key: "voice_language_policy",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic voice language-tag normalization, English-like classification, script-based source-language inference, source/response language selection, and high-risk translation-context detection moved to ask-voice-language-policy with tests while STT lifecycle, dispatch, translation transport, and workstation calculator fast-path execution remain in the bridge.",
  },
  {
    key: "voice_transcript_confirm_policy",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic transcript-confirm policy reason parsing, dispatch-state normalization, low-pivot translation blocking, policy resolution, and auto-confirm eligibility projection moved to ask-voice-transcript-confidence with tests while confirmation state mutation, live activity observation, STT lifecycle, voice dispatch, and request submission remain in the bridge.",
  },
  {
    key: "voice_dispatch_suppression_policy",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic reasoning-dispatch lexical admission, suppressed-route cause mapping, timeline suppression metadata projection, forced-observe rescue checks, and low-info draft rescue transcript selection moved to ask-voice-dispatch-suppression with tests while observer arbitration, document quick-lane policy, dispatch-mode normalization, request submission, and in-flight voice lifecycle remain in the bridge.",
  },
  {
    key: "voice_reasoning_dispatch_prompt_context",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic context-dependent voice follow-up classification, prior-user anchor extraction, and follow-up dispatch prompt shaping moved to ask-voice-reasoning-dispatch-prompt with tests while simple-doc lane policy, background workspace queueing, dispatch-mode normalization, request submission, and in-flight voice lifecycle remain in the bridge.",
  },
  {
    key: "voice_doc_quick_lane_background_policy",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic simple current-document prompt lane detection, title/path-only prompt classification, and background workspace reasoning queue predicate moved to ask-voice-reasoning-dispatch-prompt with tests while queue mutation, request submission, and in-flight voice lifecycle remain in the bridge.",
  },
  {
    key: "voice_conversation_dispatch_mode_normalization",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic conversation dispatch-mode normalization moved to ask-voice-reasoning-dispatch-prompt with tests while observer arbitration, request submission, queue mutation, and in-flight voice lifecycle remain in the bridge.",
  },
  {
    key: "voice_continuation_merge_and_restart_predicates",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic voice continuation merge windows, in-flight lexical merge predicate, supersede restart predicate, short addendum classification, and tail-fragment classification moved to ask-voice-continuation-lexical with tests while transcript lifecycle, queue mutation, active-turn cancellation, request submission, and voice runtime side effects remain in the bridge.",
  },
  {
    key: "voice_held_transcript_and_pending_confirmation_policy",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic held-transcript recovery, watchdog flush, close-silence/flush-age constants, and pending-confirmation transcript merge policy moved to ask-voice-held-transcript-policy with tests while held-transcript state writes, transcript queues, active-turn cancellation, request submission, and voice runtime side effects remain in the bridge.",
  },
  {
    key: "voice_auto_dispatch_governance",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic voice auto-dispatch admission trace, explicit voice Ask candidate detection, confidence/echo/queue/budget/mic gates, and env-backed auto-dispatch defaults moved to ask-voice-auto-dispatch-governance with tests while dispatch-window mutation, transcript queues, active-turn cancellation, request submission, and voice runtime side effects remain in the bridge.",
  },
  {
    key: "observer_dispatch_plan_derivation",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic observer dispatch-plan derivation for chat/workspace/reasoning combinations moved to ask-voice-reasoning-dispatch-prompt with tests while workspace dispatch, reasoning queue mutation, request submission, and in-flight voice lifecycle remain in the bridge.",
  },
  {
    key: "observer_lane_event_projection",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic observer lane event projection from supplied timeline entries, active trace id, observer-commentary detail, and duplicate keys moved to HelixAskObserverLaneEvents with tests while timeline React state, event publication, observer execution, workstation dispatch, request submission, route authority, terminal authority, and panel rendering remain in the bridge.",
  },
  {
    key: "timeline_feed_projection",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic live timeline feed sorting and active-turn filtering from supplied timeline entries and active trace id moved to HelixAskTimelineFeed with tests while timeline React state, event publication, observer execution, stream lifecycle, request submission, route authority, terminal authority, and panel rendering remain in the bridge.",
  },
  {
    key: "mic_off_voice_playback_admission_predicate",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic mic-off voice utterance playback admission predicate, read-aloud button press action projection, clicked-reply queue filtering, and read-aloud per-reply state-map transition projection moved to ask-read-aloud-display with tests while mic arm state mutation, queue mutation assignment, audio scheduling, TTS transport, and playback side effects remain in the bridge.",
  },
  {
    key: "workstation_calculator_fast_path_parsing",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic workstation action argument reading, calculator prompt expression extraction, and calculator fast-path action selection moved to ask-workstation-fast-path with tests while calculator solve execution, workstation dispatch, panel mutation, reply insertion, and terminal authority remain in the bridge.",
  },
  {
    key: "docs_viewer_workstation_action_arg_reading",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Docs-viewer workstation action path/anchor argument extraction now executes the recrowned readWorkstationActionArgText helper from ask-workstation-fast-path while docs-viewer store mutation, last-known active-doc cache mutation, workstation dispatch, panel mutation, and request-envelope handoff remain in the bridge.",
  },
  {
    key: "workstation_pending_input_helper_policy",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic workstation confirmation parsing, pending-argument extraction, run-panel action arg cloning, docs-topic resolution metadata reading, and private docs-topic metadata stripping moved to ask-workstation-pending-input with tests while pending request creation/state, request ids, panel capability lookup, docs-viewer handoff, workstation dispatch, panel mutation, and terminal authority remain in the bridge.",
  },
  {
    key: "external_prompt_claim_id_normalization",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic external prompt claim-id normalization moved to ask-external-prompt-claim with tests while pending prompt consumption, browser-window single-flight claim tracking, duplicate dispatch suppression, route admission, request submission, and lifecycle cleanup remain in the bridge.",
  },
  {
    key: "workstation_command_text_normalization",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic workstation command text normalization, panel-query normalization, operator subgoal restatement, and lexicon alias normalization moved to ask-workstation-command-text with tests while panel lookup, natural-language panel resolution, panel capability matching, action construction, workstation dispatch, panel mutation, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "exploration_repo_file_location_prompt_detection",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic repo file-location prompt detection moved to ask-exploration-policy with tests while retry/escalation prompt construction, artifact retry behavior, fallback brief construction, context/source chooser policy, exploration ladder decisions, request submission, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "attachment_prompt_policy_predicates",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic visual-input, pasted-text resume recall, and explicit pasted-text attachment prompt predicates moved to ask-attachment-prompt-policy with tests while route metadata, source admission authority, attachment payload authority, request submission, active-doc context, and terminal authority remain in the bridge.",
  },
  {
    key: "backend_entrypoint_route_metadata_policy",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic hard backend-entrypoint family detection, pasted-text recall route metadata shaping, and hard tool-family route metadata shaping moved to HelixAskBackendEntrypointPolicy with tests; the live bridge imports the hard route-metadata builder directly instead of preserving a local wrapper while source admission behavior, turn submission, runtime transport, and terminal authority remain in the bridge.",
  },
  {
    key: "queued_ask_turn_shaping",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic queued Ask turn question trimming, context-resume route metadata attachment, and pasted-text resume recall queued-route shaping moved to HelixAskQueuedTurn with tests and an injected queuedAtMs while queue React state, Date.now clock reads, queue draining, retry scheduling, context-chooser handoff, request submission, runtime transport, and terminal authority remain in the bridge.",
  },
  {
    key: "visual_evidence_summary_readers",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic visual evidence summary extraction and diagnostic vision-provider summary classification moved to ask-visual-evidence-readers with tests while visual diagnostic evidence admission, request-envelope construction, route metadata, attachment payload authority, active-doc context, and turn submission remain in the bridge.",
  },
  {
    key: "runtime_authority_reader_helpers",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic runtime/action authority object readers, theory-reflection extraction, action-key normalization, selected-capability collection, and workstation action runtime-key projection moved to ask-runtime-authority-readers with tests while backend route guardrails, action-envelope allow/deny authority, debug authority attachment, workstation dispatch, shortcut prevention, and terminal authority remain in the bridge.",
  },
  {
    key: "runtime_audit_array_reader",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic agent-loop audit array coercion moved to ask-runtime-authority-readers with tests while procedural timeline rendering, backend route guardrails, action-envelope authority, debug authority attachment, and terminal authority remain in the bridge.",
  },
  {
    key: "backend_ask_turn_id_reader",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic backend Ask turn-id shape detection moved to ask-runtime-authority-readers with tests while backend route guardrails, backend-entrypoint admission behavior, debug authority attachment, and shortcut prevention remain in the bridge.",
  },
  {
    key: "pending_input_reader_helpers",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic pending-input record detection plus pending-transition marker and trace normalization moved to ask-pending-input-readers with tests while visible terminal-kind selection, latest-turn lifecycle, terminal projection, and workstation transition mutation remain in the bridge.",
  },
  {
    key: "pending_input_cancellation_and_resolution_readers",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic pending-cancellation marker interpretation, recursive canceled-pending turn classification, and nested pending request resolution now execute through ask-pending-input-readers with tests while turn transition mutation, visible terminal-kind selection, latest-turn lifecycle, terminal projection, and workstation transition mutation remain in the bridge.",
  },
  {
    key: "voice_local_audio_analysis_and_speaker_matching",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic voice segment local-audio analysis and speaker-profile matching moved to ask-voice-capture-display with tests while speaker-profile refs, mic/STT lifecycle, sample accumulation, queue mutation, dispatch submission, and voice runtime side effects remain in the bridge.",
  },
  {
    key: "voice_command_lane_policy",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic voice command-lane envelope normalization and low-quality transcript barge suppression moved to ask-voice-command-lane-policy with tests while active voice playback/reasoning state ownership, transcript confirmation mutation, STT lifecycle, queue mutation, dispatch-window mutation, and request submission remain in the bridge.",
  },
  {
    key: "voice_recorder_mime_support_probe",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic recorder MIME candidate support probing moved to ask-voice-capture-display with injected support checks and tests while direct MediaRecorder/navigator reads, mic recorder lifecycle, stream capture, STT dispatch, and diagnostics publication remain in the bridge.",
  },
  {
    key: "workstation_panel_text_resolution",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic workstation panel text resolution, docs-path panel detection, alias table, and open-panel command parsing moved to ask-workstation-command-text with injected panel registry state and tests while live panel registry reads, capability matching, HelixWorkstationAction construction, workstation dispatch, and panel mutation remain in the bridge.",
  },
  {
    key: "exploration_retry_prompt_construction",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic exploration verify/act escalation prompt construction and artifact-retry prompt construction moved to ask-exploration-policy with tests while ladder decisions, retry execution, context/source chooser policy, request submission, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "ask_mode_inference",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic observe/act/verify Ask mode inference moved to ask-exploration-policy with tests while planner policy, retry execution, request submission, route authority, terminal authority, and dispatch side effects remain in the bridge.",
  },
  {
    key: "voice_timeline_build_info_projection",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic voice timeline build-info initial state plus /version success/error payload shaping moved to HelixAskVoiceTimelineBuildInfo with tests while browser/env reads, fetch/abort lifecycle, diagnostics publication, mic/STT runtime, and TTS stay in the bridge.",
  },
  {
    key: "context_chooser_auto_mode_classification",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic repo-code evidence prompt detection and context chooser auto-mode classification moved to ask-exploration-policy with tests while context chooser state/countdown, source chooser execution, request submission, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "legacy_attached_context_chooser_retired",
    classification: "behavior_sensitive_quarantined",
    source: "HelixAskPill.tsx",
    evidence:
      "The old quick-time event that asked whether to attach current workspace context to reasoning is disabled by HELIX_ASK_LEGACY_ATTACHED_CONTEXT_CHOOSER_ENABLED. Its generic panel/state shape may remain for future quick decisions, but the attached-context policy, countdown auto-run, and request-context mutation are quarantined in the legacy bridge and must not be extracted into the recrowned console.",
  },
  {
    key: "active_turn_stream_membership_admission",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic active-turn live event membership admission moved to ask-active-turn-stream with tests while submit/stream ingress, active turn ids, stale completion, reply mutation, final response projection, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "stage_play_mailbox_wake_admission_policy",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic compact Stage Play mailbox wake prompt detection, route-metadata validation, and missing-metadata block predicate moved to ask-stage-play-mailbox-wake-policy with tests while pending prompt consumption, wake execution, request submission, route authority, and terminal authority remain in the bridge.",
  },
  {
    key: "legacy_turn_control_target_selection",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic visible-final text selection for copy/read-aloud controls, copy/read-aloud action payload selection, final-answer copy text selection, and local debug-copy payload selection moved to HelixAskLegacyTurnControls with tests while clipboard writes, backend debug-export materialization, selected debug state, drawer mutation, and TTS execution remain in the bridge.",
  },
  {
    key: "legacy_debug_export_backend_target_selection",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic backend debug-export ref eligibility, rendered-button backend turn-id trust gating, rendered-reply debug payload matching, matching backend target selection, backend-merge client turn-id selection, selected debug turn-id resolution, clicked DOM client-reply selection, terminal transcript text collection for rendered final matching, clicked-button payload mismatch guarding, clicked-turn payload identity matching, clicked export fallback guarding, and clicked DOM turn-scope extraction with stale-attribute visible-row veto moved to HelixAskLegacyTurnControls with tests; stale visible-row attributes and unproven rendered ask turn ids may not carry stale backend turn ids or stale client reply ids. Rendered-button fallback construction, backend debug-export materialization/fetch, authoritative payload merging, drawer mutation, clipboard writes, and TTS execution remain in the bridge.",
  },
  {
    key: "legacy_turn_control_button_state_projection",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic copy/debug/read-aloud button test ids, debug-copy visibility/disabled state, stale-safe copied-debug-id timer clearing, and read-aloud active/label/title projection moved to HelixAskLegacyTurnControls with tests while click handlers, clipboard writes, backend debug-export materialization, drawer mutation, timer scheduling, and TTS execution remain in the bridge.",
  },
  {
    key: "legacy_debug_drawer_state_projection",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic debug drawer state, copy-result-to-drawer projection, and stale selected-debug drawer clearing moved to HelixAskDebugDrawerState with tests while clipboard writes, backend debug-export materialization/fetch, window debug globals, selected drawer React state mutation, and copied-id timers remain in the bridge.",
  },
  {
    key: "legacy_debug_export_size_control",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic debug export UI size bounding, critical rail field copy shaping, and compacted debug payload projection moved to HelixAskDebugExportSizeControl with tests while backend debug-export materialization/fetch, drawer mutation, clipboard writes, and selected debug state remain in the bridge.",
  },
  {
    key: "legacy_response_capsule_and_debug_clipboard_adapter",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Plain final-answer, context-capsule, and prepared debug JSON clipboard write/readback, stale-readback rejection, plus textarea fallback moved to HelixAskClipboard with tests while debug-copy payload materialization, backend debug-export fetch, drawer mutation, copied-id timers, and TTS execution remain in the bridge.",
  },
  {
    key: "doc_viewer_snapshot_path_resolution",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic active docs-viewer snapshot path priority moved to ask-doc-viewer-context, and active Ask snapshot binding for desktop URL doc parsing plus last-known doc path memory moved to HelixAskActiveDocContextBinding with tests preserving store > debug snapshot > desktop URL doc param > last-known fallback ordering while docs-viewer store reads, workspace snapshots, request-envelope construction, source admission, and route metadata remain in the bridge.",
  },
  {
    key: "doc_viewer_debug_snapshot_projection",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic docs-viewer debug snapshot projection moved to ask-doc-viewer-context, and active Ask debug-snapshot binding with retained active-doc cache mutation moved to HelixAskActiveDocContextBinding with tests preserving mode, retained current path, anchor, pending auto-read nonce, and recent count while docs-viewer store reads, request-envelope construction, source admission, and route metadata remain in the bridge.",
  },
  {
    key: "doc_viewer_anchor_path_deictic_resolution",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic current-document/current-whitepaper/docs-viewer cue detection, explicit document path precedence, and current-path anchor normalization moved to ask-doc-viewer-context with tests while the active current-path read, answer-contract source handoff, workspace snapshots, request-envelope construction, source admission, and route metadata remain in the bridge.",
  },
  {
    key: "workstation_layout_debug_snapshot_projection",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic workstation layout debug snapshot projection moved to ask-workspace-context-snapshot, and the active layout snapshot binding moved to HelixAskWorkspaceContextBinding with tests preserving group count, sorted/deduped open panel ids, chat dock fields, and mobile drawer fields while the layout store read, workspace context assembly, request-envelope construction, source admission, and route metadata remain in the bridge.",
  },
  {
    key: "ask_turn_workspace_context_snapshot_shaping",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "lib/helix",
    evidence:
      "Deterministic Ask turn workspace context snapshot shaping moved to ask-workspace-context-snapshot, and the active workspace context snapshot binding moved to HelixAskWorkspaceContextBinding with tests preserving active panel, camelCase and snake_case active-doc identity fields, calculator context clipping, focused empty Workstation Notes stale-recent-note suppression, Situation Room context passthrough, clipboard-panel detection, and injected timestamp while layout/notes/calculator/Situation Room store reads, active-doc path resolution, Date.now, source admission, route metadata, and turn submission remain in the bridge.",
  },
  {
    key: "active_doc_backend_payload_binding",
    classification: "behavior_sensitive_recrowned_with_parity",
    source: "ask-console",
    evidence:
      "Deterministic context-file shaping and backend turn payload shaping now include top-level doc_path and active_doc_path derived from the recrowned active-doc context files in HelixAskRequestEnvelope with tests; the live submit path calls the request-envelope owner directly while URL/store reads, source admission, route metadata, and turn submission remain in the bridge.",
  },
  {
    key: "request_and_stream_lifecycle",
    classification: "behavior_sensitive_quarantined",
    source: "HelixAskPill.tsx",
    evidence:
      "Submit, stream ingress, stale completion, active turn ids, and final response projection still live in HelixAskPill and must move only with parity tests.",
  },
  {
    key: "active_doc_and_workspace_context",
    classification: "behavior_sensitive_quarantined",
    source: "HelixAskPill.tsx",
    evidence:
      "Docs-viewer store reads, active current-path reads, layout/notes/calculator/Situation Room store reads, Date.now, route metadata, and turn submission remain behavior-sensitive after deterministic doc debug snapshot projection, active doc snapshot binding, doc snapshot path priority, deictic anchor-path resolution, workstation layout debug snapshot projection, Ask turn workspace context snapshot shaping, focused empty Workstation Notes stale-recent-note suppression, context-file shaping, backend doc_path/active_doc_path payload binding, and the server-side focused-notes stale snapshot merge guard were recrowned/tested; HASK-BSQ-001 still needs live browser parity proof.",
  },
  {
    key: "latest_debug_copy_and_read_aloud_binding",
    classification: "behavior_sensitive_quarantined",
    source: "HelixAskPill.tsx",
    evidence:
      "Backend debug-export materialization/fetch, rendered-button fallback construction, selected debug state, drawer mutation, click handlers, copied-id timer scheduling, window debug globals, and TTS execution still bind from legacy state after pure target/backend-ref/debug-turn-id/button-state/drawer-state/DOM scope selection plus stale-safe copied-debug-id timer clearing and final-answer/context-capsule/prepared-debug clipboard writes were moved; clicked Debug copy now delegates clicked client-reply selection before payload normalization only when the DOM scope is not visibly stale, and routes payload identity matching, fail-closed backend turn-id trust gating, stale client-id veto, backend-merge client-id selection, and stale export fallback guarding through HelixAskLegacyTurnControls before backend export fetch/copy.",
  },
  {
    key: "voice_capture_and_command_runtime",
    classification: "behavior_sensitive_quarantined",
    source: "HelixAskPill.tsx",
    evidence:
      "MediaRecorder setup, STT dispatch, command confirmation, auto-dispatch, and voice steering remain active runtime behavior in the legacy file.",
  },
  {
    key: "legacy_backend_transport_selection",
    classification: "behavior_sensitive_quarantined",
    source: "HelixAskPill.tsx",
    evidence:
      "The default manual canary sends turns through runAskTurnStream and falls back to runAskTurn on a stream error. Legacy askLocal remains reachable from non-canary callers; its lane-parity flag defaults to /ask/turn, while disabling the flag admits the jobs and /ask routes. Preserve the path identity and turn-id continuity until G1 proves transport fallback cannot duplicate execution.",
  },
  {
    key: "legacy_multilang_and_scope_retry",
    classification: "behavior_sensitive_quarantined",
    source: "HelixAskPill.tsx",
    evidence:
      "askLocalWithPreflightScopeFallback can retry once with multilangConfirm and can remove mode, allowTools, requiredEvidence, and verify after an AGI-bot preflight-scope error. This is now inventoried as a client-owned retry/downgrade path and remains quarantined for G1 runtime-path and downgrade observability.",
  },
  {
    key: "legacy_client_workstation_execution_fast_path",
    classification: "behavior_sensitive_quarantined",
    source: "HelixAskPill.tsx",
    evidence:
      "When the manual Ask-turn canary is disabled and a prompt is not backend-forced, client parser/classifier code may call dispatchWorkstationActionSequence and getWorkstationFastPathReplyText without a completed backend solver turn. The default canary suppresses the ordinary manual path, but the branch remains reachable and is assigned to G6 removal after parity.",
  },
  {
    key: "legacy_client_process_graph_answer_shortcut",
    classification: "behavior_sensitive_quarantined",
    source: "HelixAskPill.tsx",
    evidence:
      "A prompt admitted by shouldUseProcessGraphContextPack can build and project buildProcessGraphOverviewText directly from the client store without a backend Ask turn. This is a known presentation/answer shortcut assigned to G6 removal after an equivalent governed route exists.",
  },
  {
    key: "legacy_conversation_preflight_classifier",
    classification: "behavior_sensitive_quarantined",
    source: "HelixAskPill.tsx",
    evidence:
      "When the manual canary is disabled and workstation intent needs classification, runConversationTurn may return a clarification that short-circuits the main Ask turn; preflight failures are swallowed before deterministic client routing continues. This known classifier branch is assigned to G6 removal after backend intent parity.",
  },
] as const satisfies readonly HelixAskLegacyConsoleSlice[];

export const HELIX_ASK_LEGACY_CONSOLE_SLICE_PROGRESS = {
  activeDefaultImplementation: "legacy_bridge",
  replacementTarget: "legacy_equivalent_recrowned_runtime",
  simplifiedMinimalShellIsDefault: false,
  bridgeReplacementReady: false,
  liveDayToDaySliceCount: HELIX_ASK_LEGACY_CONSOLE_SLICES.filter(
    (slice) => slice.classification === "live_day_to_day_must_move",
  ).length,
  pureDisplayRecrownedSliceCount: HELIX_ASK_LEGACY_CONSOLE_SLICES.filter(
    (slice) => slice.classification === "pure_display_already_recrowned",
  ).length,
  behaviorSensitiveRecrownedWithParitySliceCount: HELIX_ASK_LEGACY_CONSOLE_SLICES.filter(
    (slice) => slice.classification === "behavior_sensitive_recrowned_with_parity",
  ).length,
  behaviorSensitiveQuarantinedSliceCount: HELIX_ASK_LEGACY_CONSOLE_SLICES.filter(
    (slice) => slice.classification === "behavior_sensitive_quarantined",
  ).length,
  unknownTrapDoorSliceCount: HELIX_ASK_LEGACY_CONSOLE_SLICES.filter(
    (slice) => slice.classification === "unknown_trap_door_quarantined",
  ).length,
} as const;
