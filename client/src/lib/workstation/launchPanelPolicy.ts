import {
  HELIX_LOCKED_WORKSTATION_PANEL_IDS,
  HELIX_USER_HIDDEN_WORKSTATION_PANEL_IDS,
  resolveHelixAccountPanelAccess,
} from "@shared/helix-account-session";
import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import { getPanelDef } from "@/lib/desktop/panelRegistry";

// Panel visibility is independent of the operation-specific server checks.
const USER_HIDDEN_PANEL_IDS = new Set<string>(HELIX_USER_HIDDEN_WORKSTATION_PANEL_IDS);
const USER_LOCKED_PANEL_IDS = new Set<string>(HELIX_LOCKED_WORKSTATION_PANEL_IDS);

const LEGACY_DEBUG_PANEL_IDS = new Set<string>([
  "agi-essence-console",
]);

export function isUserLaunchPanel(panelId: string): boolean {
  return Boolean(getPanelDef(panelId)) && !USER_HIDDEN_PANEL_IDS.has(panelId);
}

export function isAccountLaunchPanel(
  panelId: string,
  policy: HelixAccountCapabilityPolicy | null | undefined,
): boolean {
  return isAccountPanelAccessible(panelId, policy) &&
    (policy?.account_type === "developer" || !USER_HIDDEN_PANEL_IDS.has(panelId));
}

export function isAccountPanelAccessible(
  panelId: string,
  policy: HelixAccountCapabilityPolicy | null | undefined,
): boolean {
  if (!getPanelDef(panelId)) return false;
  if (policy?.account_type !== "developer" && USER_LOCKED_PANEL_IDS.has(panelId)) return false;
  const access = resolveHelixAccountPanelAccess(policy, panelId);
  return access.state === "available" ||
    (access.reason === "panel_outside_account_policy" && isUserLaunchPanel(panelId));
}

export function isLegacyDebugPanel(panelId: string): boolean {
  return LEGACY_DEBUG_PANEL_IDS.has(panelId);
}

export function isUnfinishedPanel(panelId: string): boolean {
  return USER_HIDDEN_PANEL_IDS.has(panelId) && !isLegacyDebugPanel(panelId);
}

export function isLockedLaunchPanel(panelId: string): boolean {
  return isLegacyDebugPanel(panelId) || isUnfinishedPanel(panelId);
}

export function isDiscoverableLaunchPanel(panelId: string): boolean {
  return isUserLaunchPanel(panelId);
}
