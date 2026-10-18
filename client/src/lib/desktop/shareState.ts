import {
  encodeLegacyLayoutHash,
  parseWorkstationViewStateFromUrl,
  resolveWorkstationPanelIds,
} from "@/lib/workstation/workstationDeepLink";

export type DesktopLayoutHash = {
  projectSlug?: string;
  panels?: string[];
};

export function encodeLayout({ projectSlug, panels }: DesktopLayoutHash): string {
  return encodeLegacyLayoutHash({ projectSlug, panels: panels ?? [] });
}

export function decodeLayout(hash: string): DesktopLayoutHash {
  const state = parseWorkstationViewStateFromUrl({ hash });
  return {
    projectSlug: state.projectSlug,
    panels: state.panels.length > 0 ? state.panels : undefined,
  };
}

export function resolvePanelIds(aliases?: string[]): string[] {
  return resolveWorkstationPanelIds(aliases);
}
