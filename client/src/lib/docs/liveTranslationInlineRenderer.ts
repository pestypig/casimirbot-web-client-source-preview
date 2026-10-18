import type { DocumentTranslationUnit } from "@shared/document-translation";
import {
  buildDocumentInlineTranslationDataAttributes,
  formatDocumentInlineTranslationText,
  resolveDocumentInlineTranslationDisplayStatus,
  type DocumentInlineTranslationRenderState,
} from "@/lib/docs/liveTranslationInlineProjection";

export type RenderDocumentMarkdownWithInlineTranslationsInput = {
  units: DocumentTranslationUnit[];
  translations: Record<string, DocumentInlineTranslationRenderState>;
  loadingText: string;
  errorText: (reason: string) => string;
  fallbackErrorText: string;
};

export function renderDocumentMarkdownWithInlineTranslations(
  input: RenderDocumentMarkdownWithInlineTranslationsInput,
): string {
  return input.units
    .map((unit) => {
      if (!unit.translatable) return unit.source_markdown;
      const state = input.translations[unit.unit_id];
      const anchor = buildDocumentInlineTranslationAnchor(unit.unit_id, state);
      if (!state) return `${unit.source_markdown}\n\n${anchor}`;
      const projectionAttrs = Object.entries(buildDocumentInlineTranslationDataAttributes(state))
        .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
        .join(" ");
      const projectionLanguageAttrs = buildDocumentInlineTranslationLanguageAttributes(state);
      const projectionAttrSuffix = [projectionAttrs, projectionLanguageAttrs].filter(Boolean).join(" ");
      const projectionAttributes = projectionAttrSuffix ? ` ${projectionAttrSuffix}` : "";
      const displayStatus = resolveDocumentInlineTranslationDisplayStatus(state);
      const projectionClassName = buildDocumentInlineTranslationProjectionClassName(displayStatus);
      const projectionBaseAttrs =
        `data-doc-translation-line="${escapeHtml(unit.unit_id)}" ` +
        `data-doc-translation-role="governed-inline-projection" ` +
        `data-doc-translation-answer-authority="false"`;
      if (state.status === "loading") {
        return `${unit.source_markdown}\n\n${anchor}\n\n<div class="${projectionClassName}" ${projectionBaseAttrs}${projectionAttributes}>${escapeHtml(input.loadingText)}</div>`;
      }
      if (state.status === "error") {
        return `${unit.source_markdown}\n\n${anchor}\n\n<div class="${projectionClassName}" ${projectionBaseAttrs}${projectionAttributes}>${escapeHtml(input.errorText(state.error ?? input.fallbackErrorText))}</div>`;
      }
      const translatedText = formatDocumentInlineTranslationText(state.text ?? "");
      return `${unit.source_markdown}\n\n${anchor}\n\n<div class="${projectionClassName}" ${projectionBaseAttrs}${projectionAttributes}>${escapeHtml(translatedText).replace(/\n/g, "<br />")}</div>`;
    })
    .join("\n\n");
}

function buildDocumentInlineTranslationLanguageAttributes(
  state: DocumentInlineTranslationRenderState,
): string {
  const language = normalizeHtmlLanguageTag(state.targetLanguage) || normalizeHtmlLanguageTag(state.accountLocale);
  const langAttr = language ? `lang="${escapeHtml(language)}"` : "";
  return [langAttr, `dir="auto"`].filter(Boolean).join(" ");
}

function normalizeHtmlLanguageTag(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(text) ? text : null;
}

function buildDocumentInlineTranslationAnchor(
  unitId: string,
  state: DocumentInlineTranslationRenderState | undefined,
): string {
  const stateAttrs = state
    ? buildDocumentInlineTranslationDataAttributes(state)
    : {
      "data-doc-translation-governed-projection": "true",
      "data-doc-translation-authority-policy": "projection_only_not_answer_authority",
      "data-doc-translation-terminal-authority-owner": "helix",
      "data-doc-translation-display-status": "empty",
      "data-doc-translation-display-status-reason": "no_projection_activity",
      "data-doc-translation-render-status": "empty",
      "data-doc-translation-projection-status": "missing",
      "data-doc-translation-reentry-required": "true",
      "data-doc-translation-terminal-eligible": "false",
      "data-doc-translation-assistant-answer": "false",
      "data-doc-translation-raw-content-included": "false",
    };
  const projectionAttrs = Object.entries(stateAttrs)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(" ");
  return [
    `<div class="doc-translation-anchor not-prose h-0"`,
    `data-doc-translation-anchor="${escapeHtml(unitId)}"`,
    `data-doc-translation-role="governed-inline-projection-anchor"`,
    `data-doc-translation-answer-authority="false"`,
    projectionAttrs,
    `></div>`,
  ].join(" ");
}

function buildDocumentInlineTranslationProjectionClassName(
  displayStatus: ReturnType<typeof resolveDocumentInlineTranslationDisplayStatus>,
): string {
  const baseClassName =
    "doc-generated-translation not-prose my-2 border-l-2 pl-3 text-sm leading-relaxed";
  switch (displayStatus) {
    case "active":
      return `${baseClassName} border-cyan-400/70 text-cyan-300/85 animate-pulse`;
    case "pending":
      return `${baseClassName} border-emerald-400/60 text-emerald-300/80 animate-pulse`;
    case "ready":
      return `${baseClassName} border-emerald-400/70 text-emerald-300`;
    case "stale":
      return `${baseClassName} border-amber-400/70 text-amber-300`;
    case "cancelled":
      return `${baseClassName} border-zinc-400/70 text-zinc-300`;
    case "failed":
      return `${baseClassName} border-rose-400/70 text-rose-300`;
    case "blocked":
      return `${baseClassName} border-amber-400/70 text-amber-300`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
