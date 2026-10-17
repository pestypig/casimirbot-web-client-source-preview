export type ObserverCommentaryRow = {
  tool?: string | null;
  text?: string | null;
  detail?: string | null;
};

export type ObserverCommentaryOptions = {
  userPrompt?: string | null;
};

function buildObserverUserRestatement(
  rowText: string,
  userPrompt: string | null | undefined,
): string | null {
  const normalizedPrompt = (userPrompt ?? "").replace(/\s+/g, " ").trim();
  if (!normalizedPrompt) return null;
  const promptSnippet =
    normalizedPrompt.length > 96 ? `${normalizedPrompt.slice(0, 93).trimEnd()}...` : normalizedPrompt;
  if (/summarizing current document/i.test(rowText)) {
    return `From your request ("${promptSnippet}"), this means your current document will be summarized in plain language.`;
  }
  if (/opening selected document/i.test(rowText)) {
    return `From your request ("${promptSnippet}"), this means Docs viewer is opening the selected source before explanation.`;
  }
  if (/closed active panel/i.test(rowText)) {
    return `From your request ("${promptSnippet}"), this means the active panel you asked to close was removed.`;
  }
  if (/starting read-aloud/i.test(rowText)) {
    return `From your request ("${promptSnippet}"), this means read-aloud is beginning for the active document context.`;
  }
  if (/^fail:/i.test(rowText)) {
    return `From your request ("${promptSnippet}"), this means execution failed before the requested action completed.`;
  }
  return `From your request ("${promptSnippet}"), this is the current workstation step being executed.`;
}

export function buildObserverCommentaryForRow(
  row: ObserverCommentaryRow,
  options: ObserverCommentaryOptions = {},
): string | null {
  const tool = (row.tool ?? "").trim().toLowerCase();
  const text = (row.text ?? "").trim();
  const detail = (row.detail ?? "").trim().toLowerCase();
  const isWorkstationRow =
    tool === "helix.ask.fast_path" ||
    tool === "helix.observer.plan" ||
    tool.startsWith("workstation.") ||
    detail.startsWith("workstation_") ||
    detail.startsWith("job_") ||
    detail.startsWith("observer_plan_");
  if (!isWorkstationRow || !text) return null;

  const restatement = buildObserverUserRestatement(text, options.userPrompt);
  const withRestatement = (technical: string): string =>
    restatement ? `Observer: ${restatement} ${technical}` : `Observer: ${technical}`;

  if (/focusing panel picker/i.test(text)) {
    return withRestatement("Dispatcher acknowledged request and is moving focus to panel picker.");
  }
  if (/opening panel picker/i.test(text)) {
    return withRestatement("UI control path opened panel picker for action routing.");
  }
  if (/targeting docs panel/i.test(text)) {
    return withRestatement("Action router resolved Docs panel as active destination.");
  }
  if (/opening selected document/i.test(text)) {
    return withRestatement("Selected document is now being opened in Docs viewer.");
  }
  if (/starting read-aloud/i.test(text)) {
    return withRestatement("Read-aloud stage entered; playback dispatch is expected next.");
  }
  if (/summarizing current document/i.test(text)) {
    return withRestatement("Summarize-doc action dispatched using current Docs viewer context.");
  }
  if (/closed active panel/i.test(text)) {
    return withRestatement("Close-panel action completed and active workspace panel was removed.");
  }
  if (/workstation fast-path dispatched/i.test(text)) {
    return withRestatement("Intent resolved to workstation fast-path and handed to action router.");
  }
  if (/request_user_input:/i.test(text)) {
    return withRestatement("Action routing paused because required inputs are missing and were requested.");
  }
  if (/request_user_input resolved:/i.test(text)) {
    return withRestatement("Requested workstation input was resolved and routing resumed.");
  }
  if (/observer plan update:/i.test(text)) {
    return withRestatement("Observer updated the workspace/reasoning execution plan.");
  }
  if (/observer plan step complete:/i.test(text)) {
    return withRestatement("Observer marked a planned execution step as complete.");
  }
  if (/^ok:/i.test(text)) {
    return withRestatement(`Action receipt confirmed - ${text.replace(/^ok:\s*/i, "").trim()}`);
  }
  if (/^fail:/i.test(text)) {
    return withRestatement(`Action failure detected - ${text.replace(/^fail:\s*/i, "").trim()}`);
  }
  return withRestatement(`Interpreted workstation event - ${text}`);
}
