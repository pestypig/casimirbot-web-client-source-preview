/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import React from "react";
import { HelixAccountLanguageTranslationProjection } from "@/components/helix/HelixAccountLanguageTranslationProjection";
import type { HelixAccountLanguageTranslationProjectionState } from "@/lib/helix/account-language-translation-projection";

const baseState = (
  overrides: Partial<HelixAccountLanguageTranslationProjectionState> = {},
): HelixAccountLanguageTranslationProjectionState => ({
  key: "account-language:docs-viewer:translate-button:es",
  status: "ready",
  displayText: "Traducir",
  projection: null,
  projectionTarget: "account_language",
  panelId: "docs-viewer",
  regionId: "docs-viewer:translate-button",
  bbox: { x: 12, y: 24, width: 160, height: 32, source: "account-language-region" },
  docPath: "docs/current.md",
  sourceId: "workstation-shell#docs-viewer:translate-button",
  sourceHash: "fnv1a32:button",
  sourceKind: "button_label",
  sourceTextHash: "sha256:translate-button",
  sourceTextCharCount: 9,
  accountLocale: "es-US",
  targetLanguage: "es",
  chunkId: "docs-viewer:translate-button",
  chunkIndex: 1,
  dedupeKey: "workstation-shell#docs-viewer:translate-button:es",
  sourceEventId: "ui-region:event-1",
  sourceEventMs: 150,
  observedAtMs: 200,
  freshnessStatus: "fresh",
  observationRef: "obs:account-language:button",
  receiptRef: "receipt:account-language:button",
  laneSessionId: null,
  goalBindingId: null,
  selectedRuntimeAgentProvider: "codex",
  selectedBackendProvider: "live_translation.local_runtime",
  terminalAuthorityStatus: "not_terminal_authority",
  contextRole: "tool_evidence",
  answerAuthority: false,
  terminalEligible: false,
  assistantAnswer: false,
  rawContentIncluded: false,
  ...overrides,
});

afterEach(cleanup);

describe("HelixAccountLanguageTranslationProjection", () => {
  it("renders ready account-language text with projection-only authority markers", () => {
    render(<HelixAccountLanguageTranslationProjection state={baseState()} sourceText="Translate" />);

    const projection = screen.getByText("Traducir");
    expect(projection).toHaveAttribute(
      "data-helix-account-language-translation-authority-policy",
      "projection_only_not_answer_authority",
    );
    expect(projection).toHaveAttribute("data-helix-account-language-translation-status", "ready");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-projection-target", "account_language");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-panel-id", "docs-viewer");
    expect(projection).toHaveAttribute(
      "data-helix-account-language-translation-region-id",
      "docs-viewer:translate-button",
    );
    expect(projection).toHaveAttribute(
      "data-helix-account-language-translation-bbox",
      '{"x":12,"y":24,"width":160,"height":32,"source":"account-language-region"}',
    );
    expect(projection).toHaveAttribute("data-helix-account-language-translation-observation-ref", "obs:account-language:button");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-receipt-ref", "receipt:account-language:button");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-source-event-id", "ui-region:event-1");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-source-event-ms", "150");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-observed-at-ms", "200");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-answer-authority", "false");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-terminal-eligible", "false");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-assistant-answer", "false");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-raw-content-included", "false");
    expect(projection).toHaveAccessibleName("translated account-language projection");
  });

  it("falls back to source text for stale projections while preserving debug markers", () => {
    render(
      <HelixAccountLanguageTranslationProjection
        state={baseState({
          status: "stale",
          displayText: null,
          freshnessStatus: "stale",
        })}
        sourceText="Translate"
      />,
    );

    const projection = screen.getByText("Translate");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-status", "stale");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-freshness-status", "stale");
    expect(projection).toHaveAttribute("data-helix-account-language-translation-answer-authority", "false");
    expect(projection).toHaveAccessibleName("stale translation projection");
  });

  it("renders active and pending projection health states as non-authoritative source fallbacks", () => {
    render(
      <>
        <HelixAccountLanguageTranslationProjection
          state={baseState({
            status: "active",
            displayText: null,
            laneSessionId: "lane-session-account-language",
          })}
          sourceText="Translate"
        />
        <HelixAccountLanguageTranslationProjection
          state={baseState({
            key: "account-language:docs-viewer:title:es",
            status: "pending",
            displayText: null,
            regionId: "docs-viewer:title",
            sourceId: "workstation-shell#docs-viewer:title",
            terminalAuthorityStatus: "pending_helix_terminal_authority",
          })}
          sourceText="Current document"
        />
      </>,
    );

    const active = screen.getByText("Translate");
    expect(active).toHaveAttribute("data-helix-account-language-translation-status", "active");
    expect(active).toHaveAttribute("data-helix-account-language-translation-lane-session-id", "lane-session-account-language");
    expect(active).toHaveAttribute("data-helix-account-language-translation-answer-authority", "false");
    expect(active).toHaveAccessibleName("active translation projection");

    const pending = screen.getByText("Current document");
    expect(pending).toHaveAttribute("data-helix-account-language-translation-status", "pending");
    expect(pending).toHaveAttribute(
      "data-helix-account-language-translation-terminal-authority-status",
      "pending_helix_terminal_authority",
    );
    expect(pending).toHaveAttribute("data-helix-account-language-translation-terminal-eligible", "false");
    expect(pending).toHaveAccessibleName("pending translation projection");
  });

  it("renders nothing when neither projection nor source text is displayable", () => {
    const { container } = render(
      <HelixAccountLanguageTranslationProjection
        state={baseState({
          status: "empty",
          displayText: null,
          observationRef: null,
          receiptRef: null,
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
