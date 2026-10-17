import { HelixAskConsoleErrorSurface } from "./HelixAskConsoleStatusSurfaces";

export type HelixAskConsoleErrorLineSurfaceProps = {
  message?: string | null;
};

export function HelixAskConsoleErrorLineSurface({
  message,
}: HelixAskConsoleErrorLineSurfaceProps) {
  return <HelixAskConsoleErrorSurface message={message} />;
}
