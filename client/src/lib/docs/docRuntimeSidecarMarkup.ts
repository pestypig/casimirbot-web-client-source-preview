import type { DocRuntimeCalculatorLaunchV1 } from "@shared/contracts/doc-calculator-launch.v1";
import { buildDocRuntimeCalculatorLaunch } from "./docRuntimeCommandRegistry";

function escapeRuntimeMarkup(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRuntimeSidecar(
  launch: DocRuntimeCalculatorLaunchV1,
  fallback: string,
  element: "div" | "span",
): string {
  const className = element === "span"
    ? "doc-runtime-command doc-runtime-command-inline"
    : "doc-runtime-command";
  const runtimeId = escapeRuntimeMarkup(launch.runtime.runtimeId);
  const command = escapeRuntimeMarkup(launch.runtime.command);
  const label = escapeRuntimeMarkup(launch.runtime.label);
  return `<${element} class="${className}" data-doc-runtime-command="${command}" data-doc-runtime-id="${runtimeId}"><span class="doc-equation-action-chip" data-doc-runtime-command-id="${runtimeId}" role="button" tabindex="0" title="Open ${label} in Scientific Calculator">R</span>${fallback}</${element}>`;
}

export function renderDocRuntimeCodeBlock(
  code: string,
  language?: string,
  docPath?: string | null,
): string {
  const escapedCode = escapeRuntimeMarkup(code);
  const languageClass = language?.trim()
    ? ` class="language-${escapeRuntimeMarkup(language.trim())}"`
    : "";
  const fallback = `<pre><code${languageClass}>${escapedCode}</code></pre>`;
  const launch = buildDocRuntimeCalculatorLaunch({ commandText: code, docPath });
  return launch ? renderRuntimeSidecar(launch, fallback, "div") : fallback;
}

export function renderDocRuntimeCodeSpan(
  referenceText: string,
  docPath?: string | null,
): string {
  const fallback = `<code>${escapeRuntimeMarkup(referenceText)}</code>`;
  const launch = buildDocRuntimeCalculatorLaunch({ commandText: referenceText, docPath });
  return launch ? renderRuntimeSidecar(launch, fallback, "span") : fallback;
}
