import {
  HelixAskContextMemoryStatusLine,
  HelixAskErrorLine,
  HelixAskVoiceStatusPill,
  type HelixAskVoiceInputStatus,
} from "./HelixAskStatusLine";

export type HelixAskConsoleVoiceStatusSurfaceProps = {
  label: string;
  state: HelixAskVoiceInputStatus;
};

export function HelixAskConsoleVoiceStatusSurface({
  label,
  state,
}: HelixAskConsoleVoiceStatusSurfaceProps) {
  return <HelixAskVoiceStatusPill label={label} state={state} />;
}

export type HelixAskConsoleContextMemoryStatusSurfaceProps = {
  text?: string | null;
};

export function HelixAskConsoleContextMemoryStatusSurface({
  text,
}: HelixAskConsoleContextMemoryStatusSurfaceProps) {
  return <HelixAskContextMemoryStatusLine text={text} />;
}

export type HelixAskConsoleErrorSurfaceProps = {
  message?: string | null;
};

export function HelixAskConsoleErrorSurface({
  message,
}: HelixAskConsoleErrorSurfaceProps) {
  return <HelixAskErrorLine message={message} />;
}
