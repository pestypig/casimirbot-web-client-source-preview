export type HelixAskSlashCommandTrigger = {
  start: number;
  end: number;
  query: string;
};

const TRIGGER_BOUNDARY_PATTERN = /(^|\s)\/([a-z0-9_-]*)$/i;

export function resolveHelixAskSlashCommandTrigger(args: {
  value: string;
  selectionStart: number;
  selectionEnd?: number;
}): HelixAskSlashCommandTrigger | null {
  if (args.selectionEnd !== undefined && args.selectionStart !== args.selectionEnd) return null;
  const cursor = Math.max(0, Math.min(args.selectionStart, args.value.length));
  const prefix = args.value.slice(0, cursor);
  const match = prefix.match(TRIGGER_BOUNDARY_PATTERN);
  if (!match || match.index === undefined) return null;
  const boundary = match[1] ?? "";
  const query = match[2] ?? "";
  const slashStart = match.index + boundary.length;
  return {
    start: slashStart,
    end: cursor,
    query,
  };
}

export function insertHelixAskSlashCommandPrompt(args: {
  value: string;
  trigger: HelixAskSlashCommandTrigger | null;
  insertionText: string;
}): { value: string; cursor: number } {
  const insertionText = args.insertionText;
  const trigger = args.trigger ?? {
    start: 0,
    end: 0,
    query: "",
  };
  const before = args.value.slice(0, trigger.start);
  const after = args.value.slice(trigger.end);
  const needsTrailingSpace =
    insertionText.length > 0 &&
    after.length > 0 &&
    !/\s$/.test(insertionText) &&
    !/^\s/.test(after);
  const inserted = `${insertionText}${needsTrailingSpace ? " " : ""}`;
  const value = `${before}${inserted}${after}`;
  return {
    value,
    cursor: before.length + inserted.length,
  };
}
