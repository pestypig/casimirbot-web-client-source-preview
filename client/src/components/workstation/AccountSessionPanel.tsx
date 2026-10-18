import React from "react";
import { Archive, ChevronDown, Database, FlaskConical, KeyRound, Languages, Link2, LogIn, LogOut, RefreshCw, ShieldCheck, UserCircle } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Auth0SignInButton } from "@/components/auth/Auth0SignInButton";
import { LocalHostedSubscription } from "@/components/agent-access/LocalHostedSubscription";
import { ManagedWebsiteConnection } from "./ManagedWebsiteConnection";
import { LocalDeveloperAccess } from "./LocalDeveloperAccess";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { readExperimentalAskHelix, writeExperimentalAskHelix } from "@/lib/workstation/experimentalAskHelix";
import {
  getInterfaceLanguageOption,
  getInterfaceLanguageOptionsForAccount,
  getInterfaceLanguageReadiness,
} from "@/lib/i18n/interfaceLanguage";
import { writeInterfaceLanguagePreference } from "@/lib/i18n/interfaceLanguagePreference";
import { useInterfaceText, type InterfaceTextResolver } from "@/lib/i18n/interfaceText";
import type { InterfaceMessageId } from "@/lib/i18n/messages/types";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";
import {
  HELIX_USER_ACCOUNT_POLICY,
  type HelixAccountLinkedAccount,
  type HelixAccountSessionStatus,
} from "@shared/helix-account-session";
import type { HelixProfileIngressTokenSummary } from "@shared/helix-profile-ingress";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { BrokerageConnectionsCard } from
  "@/components/workstation/BrokerageConnectionsCard";
import {
  getProfileStorageSyncStatus,
  grantProfileStorageAttachConsent,
  HELIX_PROFILE_STORAGE_SYNC_STATUS_EVENT,
  type HelixProfileStorageSyncStatus,
  isProfileStorageAttachConsentGranted,
  revokeProfileStorageAttachConsent,
} from "@/lib/workstation/profileStorageSync";
import {
  CLAIMABLE_POSTULATE_RECEIPTS_EVENT,
  claimPostulateReceipt,
  readClaimablePostulateReceipts,
  type ClaimablePostulateReceipt,
} from "@/lib/agi/proposals";

type DiscordSessionView = {
  session_id: string;
  status: string;
  linked_profile_id?: string | null;
  commander_discord_user_id?: string | null;
  thread_id?: string | null;
  live_environment_ids: string[];
  participants: Array<{ discord_user_id: string; display_name: string; role: string; authority: string }>;
  updated_at: string;
};

type ProfileArchiveView = {
  archive_id: string;
  source_family: string;
  session_title: string;
  objective: string;
  started_at: string;
  ended_at: string;
  summary: string;
  evidence_index: Array<{ evidence_id: string; category: string; summary: string; confidence: number }>;
  subgoals: Array<{ label: string; final_status: string; evidence_ids: string[] }>;
  learned_pattern_candidates: string[];
  raw_logs_included: false;
  assistant_answer: false;
};

type CategorizationJobView = {
  job_id: string;
  thread_id: string;
  profile_id?: string | null;
  room_id?: string | null;
  source_family: string;
  source_ids: string[];
  world_id?: string | null;
  objective: string;
  status: string;
  policy: {
    mode: string;
    evidence_budget: string;
    surface_policy: string;
    archive_on_stop: boolean;
    profile_archive_policy: string;
  };
  counters: {
    source_events_seen: number;
    categorization_events: number;
    synthetic_evidence: number;
    utility_hypotheses: number;
    pattern_candidates: number;
  };
  latest_summary?: string | null;
  last_event_ts?: string | null;
  archive_id?: string | null;
  raw_logs_included: false;
  assistant_answer: false;
  updated_at: string;
};

const emptyStatus: HelixAccountSessionStatus = {
  schema: "helix.account_session_status.v1",
  ok: false,
  session: null,
  account_policy: HELIX_USER_ACCOUNT_POLICY,
  linked_accounts: [],
  profile_ingress_tokens: [],
  profile_ingress_usage: {
    request_count: 0,
    accepted_count: 0,
    rejected_count: 0,
    estimated_token_count: 0,
    last_event_at: null,
  },
  usage: {
    thread_count: 0,
    item_count: 0,
    answer_count: 0,
    tool_observation_count: 0,
    validation_count: 0,
    estimated_token_count: 0,
    window_started_at: "",
    window_ended_at: "",
  },
  auth_boundary: {
    credential_collection_allowed_in_agents: false,
    raw_password_stored: false,
    discord_bot_password_collection_allowed: false,
    recommended_flow: "web_auth_or_oauth_link",
  },
};

type Translate = InterfaceTextResolver["t"];
type DisplayMessageMap = Record<string, InterfaceMessageId>;

const sessionStatusMessages = {
  active: "account.display.sessionStatus.active",
  signed_out: "account.display.sessionStatus.signedOut",
} satisfies DisplayMessageMap;

const memoryScopeMessages = {
  profile: "account.display.memoryScope.profile",
  session_only: "account.display.memoryScope.sessionOnly",
} satisfies DisplayMessageMap;

const authModeMessages = {
  web_auth: "account.display.authMode.webAuth",
  local_dev_profile: "account.display.authMode.localDevProfile",
  local_password_profile: "account.display.authMode.localPasswordProfile",
} satisfies DisplayMessageMap;

const providerMessages = {
  google: "account.display.provider.google",
  local: "account.display.provider.local",
  discord: "account.display.provider.discord",
  minehut: "account.display.provider.minehut",
  browser: "account.display.provider.browser",
} satisfies DisplayMessageMap;

const linkedStatusMessages = {
  linked: "account.display.linkStatus.linked",
  pending: "account.display.linkStatus.pending",
  revoked: "account.display.linkStatus.revoked",
} satisfies DisplayMessageMap;

const authorityMessages = {
  owner: "account.display.authority.owner",
  commander: "account.display.authority.commander",
  participant: "account.display.authority.participant",
  viewer: "account.display.authority.viewer",
} satisfies DisplayMessageMap;

const artifactTypeMessages = {
  workstation_note: "account.display.artifactType.workstationNote",
  helix_chat_session: "account.display.artifactType.helixChatSession",
  helix_chat_layout: "account.display.artifactType.helixChatLayout",
  workstation_layout: "account.display.artifactType.workstationLayout",
  workstation_session_draft: "account.display.artifactType.workstationSessionDraft",
  workstation_panel_scroll: "account.display.artifactType.workstationPanelScroll",
  linked_source: "account.display.artifactType.linkedSource",
  remembered_procedure: "account.display.artifactType.rememberedProcedure",
} satisfies DisplayMessageMap;

const ownerScopeMessages = {
  browser_guest: "account.display.ownerScope.browserGuest",
  profile: "account.display.ownerScope.profile",
  surface_session_only: "account.display.ownerScope.surfaceSessionOnly",
} satisfies DisplayMessageMap;

const storageBackendMessages = {
  localStorage: "account.display.storageBackend.localStorage",
  sessionStorage: "account.display.storageBackend.sessionStorage",
  profile_server: "account.display.storageBackend.profileServer",
} satisfies DisplayMessageMap;

const syncStatusMessages = {
  local_only: "account.display.syncStatus.localOnly",
  profile_candidate: "account.display.syncStatus.profileCandidate",
  profile_synced: "account.display.syncStatus.profileSynced",
} satisfies DisplayMessageMap;

const tokenStatusMessages = {
  active: "account.display.tokenStatus.active",
  revoked: "account.display.tokenStatus.revoked",
} satisfies DisplayMessageMap;

const jobStatusMessages = {
  active: "account.display.jobStatus.active",
  running: "account.display.jobStatus.running",
  paused: "account.display.jobStatus.paused",
  stopped: "account.display.jobStatus.stopped",
  completed: "account.display.jobStatus.completed",
  failed: "account.display.jobStatus.failed",
} satisfies DisplayMessageMap;

const sourceFamilyMessages = {
  "helix-ask:desktop": "account.display.sourceFamily.helixAskDesktop",
  helix_ask_desktop: "account.display.sourceFamily.helixAskDesktop",
} satisfies DisplayMessageMap;

// Account projection is comparatively expensive under the local pg-mem
// fallback. Mutating actions refresh explicitly, so a slower background poll
// preserves freshness without monopolizing the event loop on small machines.
const ACCOUNT_SESSION_POLL_INTERVAL_MS = 15_000;

function displayMappedValue(t: Translate, value: string | null | undefined, messages: DisplayMessageMap): string {
  if (!value) return t("account.common.none");
  const messageId = messages[value];
  return messageId ? t(messageId) : value;
}

function displayBoolean(t: Translate, value: boolean): string {
  return t(value ? "account.display.boolean.true" : "account.display.boolean.false");
}

async function fetchStatus(): Promise<HelixAccountSessionStatus> {
  const response = await fetch("/api/account/session");
  if (!response.ok) throw new Error(`status ${response.status}`);
  return response.json();
}

async function fetchDiscordSessions(): Promise<DiscordSessionView[]> {
  const response = await fetch("/api/discord/sessions");
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body.sessions) ? body.sessions : [];
}

async function fetchProfileArchives(profileId: string): Promise<ProfileArchiveView[]> {
  if (!profileId.trim()) return [];
  const response = await fetch(`/api/agi/situation/profile-archives?profile_id=${encodeURIComponent(profileId.trim())}`);
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body.archives) ? body.archives : [];
}

async function fetchCategorizationJobs(): Promise<CategorizationJobView[]> {
  const response = await fetch("/api/agi/situation/categorization-jobs?thread_id=helix-ask%3Adesktop");
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body.jobs) ? body.jobs : [];
}

export default function AccountSessionPanel() {
  const [status, setStatus] = React.useState<HelixAccountSessionStatus>(emptyStatus);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const refreshInFlight = React.useRef(false);
  const fallbackProfileId = "DatDamPig";
  const [accountEmail, setAccountEmail] = React.useState("");
  const [accountDisplayName, setAccountDisplayName] = React.useState("");
  const [accountPassword, setAccountPassword] = React.useState("");
  const [accountMode, setAccountMode] = React.useState<"sign-in" | "sign-up">("sign-in");
  const [resetToken, setResetToken] = React.useState("");
  const [accountActionToken, setAccountActionToken] = React.useState<string | null>(null);
  const [showPasswordResetHint, setShowPasswordResetHint] = React.useState(false);
  const [accountRecoveryMessage, setAccountRecoveryMessage] = React.useState<string | null>(null);
  const [profileAttachConsentGranted, setProfileAttachConsentGranted] = React.useState(false);
  const [profileSyncStatus, setProfileSyncStatus] = React.useState<HelixProfileStorageSyncStatus | null>(null);
  const [ingressLabel, setIngressLabel] = React.useState("");
  const [newTokenValue, setNewTokenValue] = React.useState<string | null>(null);
  const [discordSessions, setDiscordSessions] = React.useState<DiscordSessionView[]>([]);
  const [profileArchives, setProfileArchives] = React.useState<ProfileArchiveView[]>([]);
  const [categorizationJobs, setCategorizationJobs] = React.useState<CategorizationJobView[]>([]);
  const [postulateReceipts, setPostulateReceipts] = React.useState<ClaimablePostulateReceipt[]>([]);
  const [claimingPostulateId, setClaimingPostulateId] = React.useState<string | null>(null);
  const [experimentalRoomsBusy, setExperimentalRoomsBusy] = React.useState(false);
  const [experimentalAskHelix, setExperimentalAskHelix] = React.useState(readExperimentalAskHelix);
  const { userSettings, updateSettings } = useHelixStartSettings();
  const memoryRegistrySnapshot = useWorkspaceMemoryRegistryStore((state) =>
    state.buildRegistrySnapshot(),
  );
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const interfaceLanguageOptions = getInterfaceLanguageOptionsForAccount(
    status.account_policy?.account_type ?? status.session?.account_policy?.account_type ?? "user",
  );
  const interfaceText = useInterfaceText(interfaceLanguage.code);
  const t = interfaceText.t;

  const refresh = React.useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      const [nextStatus, nextDiscordSessions, nextCategorizationJobs] = await Promise.all([
        fetchStatus(),
        fetchDiscordSessions(),
        fetchCategorizationJobs(),
      ]);
      setStatus(nextStatus);
      setPostulateReceipts(readClaimablePostulateReceipts());
      cacheAccountCapabilityPolicy(
        nextStatus.account_policy ?? nextStatus.session?.account_policy ?? null,
        nextStatus.session?.profile.profile_id ?? null,
      );
      setDiscordSessions(nextDiscordSessions);
      setCategorizationJobs(nextCategorizationJobs);
      setProfileArchives(await fetchProfileArchives(nextStatus.session?.profile.profile_id ?? fallbackProfileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account session.");
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, ACCOUNT_SESSION_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  React.useEffect(() => {
    const handlePostulateReceiptsChanged = ((event: CustomEvent<{ receipts?: ClaimablePostulateReceipt[] }>) => {
      setPostulateReceipts(
        Array.isArray(event.detail?.receipts)
          ? event.detail.receipts
          : readClaimablePostulateReceipts(),
      );
    }) as EventListener;
    window.addEventListener(CLAIMABLE_POSTULATE_RECEIPTS_EVENT, handlePostulateReceiptsChanged);
    return () => window.removeEventListener(CLAIMABLE_POSTULATE_RECEIPTS_EVENT, handlePostulateReceiptsChanged);
  }, []);

  const submitPasswordAccount = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccountRecoveryMessage(null);
    try {
      const response = await fetch(
        accountMode === "sign-up"
          ? "/api/account/session/sign-up"
          : "/api/account/session/account-sign-in",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: accountEmail,
            password: accountPassword,
            display_name: accountDisplayName,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setShowPasswordResetHint(Boolean(body?.show_password_reset_hint));
        throw new Error(body?.message ?? `account ${response.status}`);
      }
      cacheAccountCapabilityPolicy(
        body?.session?.account_policy ?? body?.account_policy ?? null,
        body?.session?.profile?.profile_id ?? null,
      );
      setAccountPassword("");
      setShowPasswordResetHint(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open profile.");
    } finally {
      setLoading(false);
    }
  }, [accountDisplayName, accountEmail, accountMode, accountPassword, refresh]);

  const requestEmailVerification = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccountActionToken(null);
    try {
      const response = await fetch("/api/account/session/email-verification/request", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message ?? `verify ${response.status}`);
      setAccountActionToken(body.token_value ?? null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request email verification.");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const confirmEmailVerification = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/session/email-verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_value: resetToken }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message ?? `verify ${response.status}`);
      setResetToken("");
      setAccountActionToken(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify email.");
    } finally {
      setLoading(false);
    }
  }, [refresh, resetToken]);

  const requestPasswordReset = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccountActionToken(null);
    setAccountRecoveryMessage(null);
    try {
      const response = await fetch("/api/account/session/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: accountEmail }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message ?? `reset ${response.status}`);
      setAccountActionToken(body.token_value ?? null);
      setAccountRecoveryMessage(body?.message ?? "If a profile exists for that email, a reset link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request password reset.");
    } finally {
      setLoading(false);
    }
  }, [accountEmail]);

  const confirmPasswordReset = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/session/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_value: resetToken, password: accountPassword }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message ?? `reset ${response.status}`);
      setAccountPassword("");
      setResetToken("");
      setAccountActionToken(null);
      setShowPasswordResetHint(false);
      setAccountRecoveryMessage("Password reset complete. Sign in with the new password.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }, [accountPassword, refresh, resetToken]);

  const signOut = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/session/sign-out", {
        method: "POST",
      });
      if (!response.ok) throw new Error(`sign-out ${response.status}`);
      cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign out.");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const exportProfileStorage = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/profile-storage/export");
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message ?? `export ${response.status}`);
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `helix-profile-export-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export profile data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteProfileStorage = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/profile-storage/snapshot", { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message ?? `delete storage ${response.status}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete saved profile data.");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const deleteProfile = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/profile", { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message ?? `delete profile ${response.status}`);
      cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete profile.");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const createIngressToken = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setNewTokenValue(null);
    try {
      const response = await fetch("/api/account/profile-ingress/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: ingressLabel.trim() || t("account.ingress.defaultLabel"),
          scopes: ["source_event", "live_environment_event"],
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message ?? `profile-ingress ${response.status}`);
      setNewTokenValue(body.token_value ?? null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create profile ingress token.");
    } finally {
      setLoading(false);
    }
  }, [ingressLabel, refresh, t]);

  const revokeIngressToken = React.useCallback(
    async (tokenId: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/account/profile-ingress/${encodeURIComponent(tokenId)}/revoke`, {
          method: "POST",
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.message ?? `revoke ${response.status}`);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to revoke profile ingress token.");
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  const claimPostulateCredit = React.useCallback(
    async (receipt: ClaimablePostulateReceipt) => {
      setLoading(true);
      setError(null);
      setClaimingPostulateId(receipt.proposalId);
      try {
        await claimPostulateReceipt({
          proposalId: receipt.proposalId,
          receiptId: receipt.receiptId,
        });
        setPostulateReceipts(readClaimablePostulateReceipts());
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to claim postulate receipt.");
      } finally {
        setClaimingPostulateId(null);
        setLoading(false);
      }
    },
    [refresh],
  );

  const session = status.session;
  const usage = status.usage;
  const sharedRoomsExperiment = status.experimental_features?.shared_realtime_rooms;
  const sharedRoomsEnabled = sharedRoomsExperiment?.enabled ??
    Boolean(
      status.account_policy?.feature_flags?.includes("shared_realtime_rooms") &&
      !status.account_policy?.locked_features?.includes("shared_realtime_rooms"),
    );
  const sharedRoomsAvailable = sharedRoomsExperiment?.available ??
    status.account_policy?.account_type === "developer";
  const sharedRoomsDeveloperIncluded =
    status.account_policy?.account_type === "developer";
  const profileConnectionsEnabled = Boolean(
    session &&
    (status.account_policy ?? HELIX_USER_ACCOUNT_POLICY).feature_flags.includes(
      "profile_connections",
    ) &&
    !(status.account_policy ?? HELIX_USER_ACCOUNT_POLICY).locked_features.includes(
      "profile_connections",
    ),
  );

  const setSharedRoomsExperiment = React.useCallback(async (enabled: boolean) => {
    setExperimentalRoomsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/session/experimental-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const body = await response.json();
      if (!response.ok || !body?.status) {
        throw new Error(body?.message ?? `experimental rooms ${response.status}`);
      }
      const nextStatus = body.status as HelixAccountSessionStatus;
      setStatus(nextStatus);
      cacheAccountCapabilityPolicy(
        nextStatus.account_policy ?? nextStatus.session?.account_policy ?? null,
        nextStatus.session?.profile.profile_id ?? null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update Shared Live Rooms.");
    } finally {
      setExperimentalRoomsBusy(false);
    }
  }, []);

  React.useEffect(() => {
    setProfileAttachConsentGranted(isProfileStorageAttachConsentGranted(session?.profile.profile_id));
    setProfileSyncStatus(getProfileStorageSyncStatus(session?.profile.profile_id));
  }, [session?.profile.profile_id]);

  React.useEffect(() => {
    const handleSyncStatus = ((event: CustomEvent<HelixProfileStorageSyncStatus>) => {
      if (event.detail.profileId === session?.profile.profile_id) {
        setProfileSyncStatus(event.detail);
      }
    }) as EventListener;
    window.addEventListener(HELIX_PROFILE_STORAGE_SYNC_STATUS_EVENT, handleSyncStatus);
    return () => window.removeEventListener(HELIX_PROFILE_STORAGE_SYNC_STATUS_EVENT, handleSyncStatus);
  }, [session?.profile.profile_id]);

  const attachThisBrowser = React.useCallback(() => {
    if (!session?.profile.profile_id) return;
    grantProfileStorageAttachConsent(session.profile.profile_id);
    setProfileAttachConsentGranted(true);
  }, [session?.profile.profile_id]);

  const detachThisBrowser = React.useCallback(() => {
    if (!session?.profile.profile_id) return;
    revokeProfileStorageAttachConsent(session.profile.profile_id);
    setProfileAttachConsentGranted(false);
  }, [session?.profile.profile_id]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <UserCircle className="h-4 w-4 text-cyan-300" />
              {t("account.header.title")}
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
              {t("account.header.description")}
            </p>
          </div>
          <button data-helix-interaction-kind="observe" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.refresh"
            type="button"
            onClick={refresh}
            aria-busy={refreshing}
            aria-label={refreshing ? t("account.action.loading") : t("account.action.refresh")}
            className="inline-flex h-9 w-[92px] shrink-0 items-center justify-center gap-2 rounded border border-white/10 bg-white/5 px-3 text-xs text-slate-200 hover:bg-white/10"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>{t("account.action.refresh")}</span>
          </button>
        </div>
        <label className="mt-3 flex min-w-0 items-center gap-2 rounded border border-white/10 bg-slate-900/70 px-2 py-1.5 text-xs text-slate-300">
          <Languages className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
          <span className="shrink-0 whitespace-nowrap">{interfaceText.t("account.language.interfaceLabel")}</span>
          <select data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.select"
            value={interfaceLanguage.code}
            onChange={(event) => {
              const nextLanguage = getInterfaceLanguageOption(event.target.value).code;
              updateSettings({ interfaceLanguage: nextLanguage });
              writeInterfaceLanguagePreference(nextLanguage, "account_session_panel");
            }}
            aria-label={interfaceText.t("account.language.interfaceLabel")}
            className="h-8 min-w-0 flex-1 rounded border border-white/15 bg-slate-950 px-2 text-xs text-white outline-none focus:border-cyan-400"
          >
            {interfaceLanguageOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {t("account.language.optionReadiness", {
                  label: option.label,
                  nativeLabel: option.nativeLabel,
                  readiness: getInterfaceLanguageReadiness(option),
                })}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        {accountActionToken ? (
          <div className="mt-2 rounded border border-amber-300/30 bg-amber-400/10 p-2 text-xs text-amber-100">
            <div className="font-medium">{t("account.ingress.tokenShownOnce")}</div>
            <div className="mt-1 break-all font-mono text-[11px]">{accountActionToken}</div>
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <LocalDeveloperAccess key={`developer:${status.session?.profile.profile_id ?? "signed-out"}`}
          signedIn={Boolean(status.session)} onChanged={() => { void refresh(); }} />
        <ManagedWebsiteConnection key={status.session?.profile.profile_id ?? "signed-out"}
          signedIn={Boolean(status.session)} />
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,360px)_1fr]">
          <section className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("account.session.title")}
            </div>
            {session ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="font-medium text-white">{session.profile.display_name}</p>
                <p className="break-all text-xs text-slate-400">{session.profile.profile_id}</p>
                {session.profile.email ? <p className="break-all text-xs text-slate-500">{session.profile.email}</p> : null}
                {session.profile.auth_mode === "password_account" ? (
                  <div className="rounded border border-white/10 bg-slate-950/60 p-2 text-xs">
                    <div className="font-medium text-slate-200">
                      {session.profile.email_verified_at ? t("account.profile.emailVerified") : t("account.profile.emailNotVerified")}
                    </div>
                    {!session.profile.email_verified_at ? (
                      <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.request-email-verification"
                        type="button"
                        onClick={requestEmailVerification}
                        disabled={loading}
                        className="mt-2 rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("account.profile.requestVerificationToken")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="rounded bg-white/5 px-2 py-1">
                    {t("account.session.statusValue", { status: displayMappedValue(t, session.status, sessionStatusMessages) })}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1">
                    {t("account.session.memoryValue", { memory: displayMappedValue(t, session.memory_scope, memoryScopeMessages) })}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1">
                    {t("account.session.authValue", {
                      authMode: session.profile.auth_mode === "guest"
                        ? "temporary guest"
                        : displayMappedValue(t, session.profile.auth_mode, authModeMessages),
                    })}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1">
                    {t("account.session.providerValue", {
                      provider: session.profile.provider === "guest"
                        ? "guest session"
                        : displayMappedValue(t, session.profile.provider ?? "local", providerMessages),
                    })}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1">{t("account.session.agentPasswordsOff")}</span>
                </div>
                <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.sign-out"
                  type="button"
                  onClick={signOut}
                  className="mt-2 inline-flex items-center gap-2 rounded border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100 hover:bg-rose-500/20"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t("account.session.signOut")}
                </button>
              </div>
            ) : (
              <div
                className="mt-3 space-y-3"
                data-helix-guidance-target="account-session-sign-in"
              >
                <div className="rounded border border-cyan-400/20 bg-cyan-500/10 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-cyan-100">
                    <LogIn className="h-3.5 w-3.5" />
                    {t("account.profile.saveToProfile")}
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-1 rounded border border-white/10 bg-slate-950/60 p-1 text-xs">
                    <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.set-account-mode-sign-in"
                      type="button"
                      onClick={() => setAccountMode("sign-in")}
                      className={`rounded px-2 py-1 ${accountMode === "sign-in" ? "bg-cyan-500/20 text-cyan-100" : "text-slate-300 hover:bg-white/10"}`}
                    >
                      {t("account.signIn.submit")}
                    </button>
                    <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.set-account-mode-sign-up"
                      type="button"
                      onClick={() => setAccountMode("sign-up")}
                      className={`rounded px-2 py-1 ${accountMode === "sign-up" ? "bg-cyan-500/20 text-cyan-100" : "text-slate-300 hover:bg-white/10"}`}
                    >
                      {t("account.profile.create")}
                    </button>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs text-slate-300">
                      {t("account.profile.email")}
                      <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.input"
                        type="email"
                        value={accountEmail}
                        onChange={(event) => setAccountEmail(event.target.value)}
                        autoComplete="email"
                        className="mt-1 w-full rounded border border-white/15 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400"
                      />
                    </label>
                    {accountMode === "sign-up" ? (
                      <label className="block text-xs text-slate-300">
                        {t("account.profile.displayName")}
                        <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.input.2"
                          value={accountDisplayName}
                          onChange={(event) => setAccountDisplayName(event.target.value)}
                          autoComplete="name"
                          className="mt-1 w-full rounded border border-white/15 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400"
                        />
                      </label>
                    ) : null}
                    <label className="block text-xs text-slate-300">
                      {t("account.signIn.password")}
                      <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.input.3"
                        type="password"
                        value={accountPassword}
                        onChange={(event) => setAccountPassword(event.target.value)}
                        autoComplete={accountMode === "sign-up" ? "new-password" : "current-password"}
                        className="mt-1 w-full rounded border border-white/15 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400"
                      />
                    </label>
                    <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.submit-password-account"
                      type="button"
                      onClick={submitPasswordAccount}
                      disabled={!accountEmail.trim() || !accountPassword || loading}
                      className="inline-flex items-center gap-2 rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <LogIn className="h-3.5 w-3.5" />
                      {accountMode === "sign-up" ? t("account.profile.createProfile") : t("account.signIn.submit")}
                    </button>
                    {showPasswordResetHint && accountMode === "sign-in" ? (
                      <div className="rounded border border-amber-300/30 bg-amber-400/10 p-2 text-xs text-amber-100">
                        <div className="font-medium">{t("account.signIn.trouble")}</div>
                        <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.request-password-reset"
                          type="button"
                          onClick={requestPasswordReset}
                          disabled={!accountEmail.trim() || loading}
                          className="mt-2 rounded border border-amber-200/40 bg-amber-300/10 px-2 py-1 text-xs text-amber-50 hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t("account.signIn.sendResetLink")}
                        </button>
                      </div>
                    ) : null}
                    {accountRecoveryMessage ? (
                      <p className="text-[11px] text-emerald-300">{accountRecoveryMessage}</p>
                    ) : null}
                    <p className="text-[11px] text-slate-500">
                      {t("account.profile.serverSideNote")}
                    </p>
                    <div className="border-t border-cyan-200/10 pt-2">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/80">
                        {t("account.profile.accountRecovery")}
                      </div>
                      <label className="block text-xs text-slate-300">
                        {t("account.profile.token")}
                        <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.input.4"
                          value={resetToken}
                          onChange={(event) => setResetToken(event.target.value)}
                          className="mt-1 w-full rounded border border-white/15 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400"
                        />
                      </label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.request-password-reset.2"
                          type="button"
                          onClick={requestPasswordReset}
                          disabled={!accountEmail.trim() || loading}
                          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t("account.profile.requestReset")}
                        </button>
                        <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.confirm-password-reset"
                          type="button"
                          onClick={confirmPasswordReset}
                          disabled={!resetToken.trim() || !accountPassword || loading}
                          className="rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t("account.profile.resetPassword")}
                        </button>
                        <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.confirm-email-verification"
                          type="button"
                          onClick={confirmEmailVerification}
                          disabled={!resetToken.trim() || loading}
                          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t("account.profile.verifyEmail")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <p className="mb-2 text-xs text-slate-400">
                    Use the same Auth0 identity as your authorized MCP client to
                    open the exact profile-owned rooms without exposing its
                    bearer token to the page or agent.
                  </p>
                  <Auth0SignInButton />
                </div>
                {(typeof window === "undefined" || !window.casimirDesktop?.openAuth0ProfileSignIn) ? (
                  <div className="border-t border-white/10 pt-3">
                    <p className="mb-2 text-xs text-slate-400">
                      {t("account.signIn.googleProfileNote")}
                    </p>
                    <GoogleSignInButton redirectTarget={null} onSignedIn={refresh} />
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <div className="space-y-3">
            <details className="group rounded-lg border border-white/10 bg-black/20 p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                <span>{t("account.usage.title")}</span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                <Metric label={t("account.usage.threads")} value={usage.thread_count} />
                <Metric label={t("account.usage.items")} value={usage.item_count} />
                <Metric label={t("account.usage.answers")} value={usage.answer_count} />
                <Metric label={t("account.usage.observations")} value={usage.tool_observation_count} />
                <Metric label={t("account.usage.estimatedTokens")} value={usage.estimated_token_count} />
              </div>
              <div className="mt-4 text-xs text-slate-400">
                {t("account.usage.window", {
                  startedAt: usage.window_started_at || t("account.common.none"),
                  endedAt: usage.window_ended_at || t("account.common.none"),
                })}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                This is estimated workspace activity, not your included CasimirBot AI allowance or provider-billed usage.
                Calls made with your own API key do not debit the future CasimirBot-managed allowance.
              </p>
            </details>
          </div>
        </div>

        <section className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <Link2 className="h-3.5 w-3.5" />
            {t("account.linked.title")}
          </div>
          <div className="mt-3 space-y-2">
            {status.linked_accounts.length === 0 ? (
              <p className="text-xs text-slate-500">{t("account.linked.empty")}</p>
            ) : (
              status.linked_accounts.map((account: HelixAccountLinkedAccount) => (
                <div
                  key={`${account.provider}:${account.external_id}`}
                  className="grid gap-2 rounded border border-white/10 bg-slate-950/60 p-2 text-xs md:grid-cols-[120px_1fr_120px_120px]"
                >
                  <span className="font-medium text-slate-200">{displayMappedValue(t, account.provider, providerMessages)}</span>
                  <span className="break-all text-slate-400">{account.display_name || account.external_id}</span>
                  <span className="text-slate-300">{displayMappedValue(t, account.status, linkedStatusMessages)}</span>
                  <span className="text-slate-300">{displayMappedValue(t, account.authority ?? "viewer", authorityMessages)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {profileConnectionsEnabled ? <BrokerageConnectionsCard /> : null}
        {session && status.account_policy?.account_type === "developer" &&
          (Boolean(window.casimirDesktop) || ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) ?
          <LocalHostedSubscription key={`${session.profile.profile_id}:${session.session_id}`} /> : null}

        <section className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              <Database className="h-3.5 w-3.5" />
              {t("account.memory.title")}
            </div>
            <div className="flex items-center gap-2">
              <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.export-profile-storage"
                type="button"
                onClick={exportProfileStorage}
                disabled={!session || loading}
                className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("account.memory.export")}
              </button>
              <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.delete-profile-storage"
                type="button"
                onClick={deleteProfileStorage}
                disabled={!session || loading}
                className="rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("account.memory.deleteSaves")}
              </button>
              <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.delete-profile"
                type="button"
                onClick={deleteProfile}
                disabled={!session || loading}
                className="rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("account.memory.deleteProfile")}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {t("account.memory.description")}
          </p>
          {session ? (
            <div className="mt-3 rounded border border-white/10 bg-slate-950/60 p-3 text-xs">
              <div className="font-medium text-slate-200">
                {profileAttachConsentGranted ? t("account.memory.browserAttached") : t("account.memory.browserNotAttached")}
              </div>
              <p className="mt-1 text-slate-500">
                {t("account.memory.attachDescription")}
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded border border-emerald-300/20 bg-emerald-400/10 p-2">
                  <div className="font-medium text-emerald-100">{t("account.memory.browserSavedCopy")}</div>
                  <div className="mt-1 text-slate-400">
                    {memoryRegistrySnapshot.artifacts.length > 0
                      ? `${memoryRegistrySnapshot.artifacts.length} local recovery item${memoryRegistrySnapshot.artifacts.length === 1 ? "" : "s"} available.`
                      : "No browser recovery items yet."}
                  </div>
                </div>
                <div className={`rounded border p-2 ${
                  profileSyncStatus?.pending
                    ? "border-amber-300/25 bg-amber-400/10"
                    : profileSyncStatus?.lastSuccessAt
                      ? "border-cyan-300/20 bg-cyan-400/10"
                      : "border-white/10 bg-white/5"
                }`}>
                  <div className="font-medium text-slate-100">{t("account.memory.profileBackup")}</div>
                  <div className="mt-1 text-slate-400">
                    {profileSyncStatus?.pending
                      ? `${profileSyncStatus.pendingEntryCount} item${profileSyncStatus.pendingEntryCount === 1 ? "" : "s"} waiting to sync.`
                      : profileSyncStatus?.lastSuccessAt
                        ? `Last synced ${new Date(profileSyncStatus.lastSuccessAt).toLocaleTimeString()}.`
                        : "Attach this browser to start profile backup."}
                  </div>
                  {profileSyncStatus?.lastError ? (
                    <div className="mt-1 text-amber-200">{profileSyncStatus.lastError}</div>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.attach-this-browser"
                  type="button"
                  onClick={attachThisBrowser}
                  disabled={profileAttachConsentGranted || loading}
                  className="rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("account.memory.attachThisBrowser")}
                </button>
                <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.detach-this-browser"
                  type="button"
                  onClick={detachThisBrowser}
                  disabled={!profileAttachConsentGranted || loading}
                  className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("account.memory.stopAttaching")}
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <Metric label={t("account.memory.artifacts")} value={memoryRegistrySnapshot.artifacts.length} />
            <Metric label={t("account.memory.profileReady")} value={memoryRegistrySnapshot.profile_ready_artifact_count} />
            <Metric label={t("account.memory.localOnly")} value={memoryRegistrySnapshot.local_only_artifact_count} />
            <Metric label={t("account.memory.sessionOnly")} value={memoryRegistrySnapshot.session_only_artifact_count} />
          </div>
          <div className="mt-3 space-y-1.5">
            {memoryRegistrySnapshot.artifacts.length === 0 ? (
              <p className="text-xs text-slate-500">{t("account.memory.empty")}</p>
            ) : (
              memoryRegistrySnapshot.artifacts.slice(0, 8).map((artifact) => (
                <div
                  key={artifact.artifact_id}
                  className="grid gap-2 rounded border border-white/10 bg-slate-950/60 p-2 text-xs lg:grid-cols-[1fr_130px_130px_130px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-200">
                      {artifact.title || artifact.artifact_id}
                    </div>
                    <div className="mt-1 truncate text-slate-500">
                      {displayMappedValue(t, artifact.artifact_type, artifactTypeMessages)}
                    </div>
                  </div>
                  <span className="rounded bg-white/5 px-2 py-1 text-slate-300">
                    {displayMappedValue(t, artifact.owner_scope, ownerScopeMessages)}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1 text-slate-300">
                    {displayMappedValue(t, artifact.storage_backend, storageBackendMessages)}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1 text-slate-300">
                    {displayMappedValue(t, artifact.sync_status, syncStatusMessages)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("account.postulateReceipts.title")}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {t("account.postulateReceipts.description")}
          </p>
          <div className="mt-3 space-y-2">
            {postulateReceipts.length === 0 ? (
              <p className="text-xs text-slate-500">{t("account.postulateReceipts.empty")}</p>
            ) : (
              postulateReceipts.map((receipt) => {
                const score = typeof receipt.score === "number" ? `${Math.round(receipt.score * 100)}%` : t("account.postulateReceipts.notScored");
                const issued = receipt.status === "issued";
                const claimed = receipt.status === "claimed" || issued;
                const receiptHash = receipt.receiptIntegrityHash
                  ? receipt.receiptIntegrityHash.length > 18
                    ? `${receipt.receiptIntegrityHash.slice(0, 10)}...${receipt.receiptIntegrityHash.slice(-6)}`
                    : receipt.receiptIntegrityHash
                  : null;
                const issuedAt = receipt.receiptIssuedAt
                  ? new Date(receipt.receiptIssuedAt).toLocaleString()
                  : null;
                return (
                  <div
                    key={receipt.proposalId}
                    className="grid gap-2 rounded border border-white/10 bg-slate-950/60 p-2 text-xs lg:grid-cols-[1fr_110px_110px_120px]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-200">{receipt.title}</div>
                      <div className="mt-1 break-all font-mono text-[10px] text-slate-500">{receipt.receiptId}</div>
                      {receiptHash ? (
                        <div className="mt-1 truncate font-mono text-[10px] text-slate-600">
                          {t("account.postulateReceipts.hash", { hash: receiptHash })}
                        </div>
                      ) : null}
                      {issuedAt ? (
                        <div className="mt-1 truncate text-[10px] text-slate-600">
                          {t("account.postulateReceipts.issued", { issuedAt })}
                        </div>
                      ) : null}
                    </div>
                    <span className="rounded bg-white/5 px-2 py-1 text-center text-slate-300">{score}</span>
                    <span className="rounded bg-white/5 px-2 py-1 text-center text-slate-300">
                      {receipt.rewardTokens > 0
                        ? t("account.postulateReceipts.credits", { credits: receipt.rewardTokens.toLocaleString() })
                        : t("account.postulateReceipts.receiptOnly")}
                    </span>
                    <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.void-claim-postulate-credit-receipt"
                      type="button"
                      onClick={() => void claimPostulateCredit(receipt)}
                      disabled={!session || claimed || loading || claimingPostulateId === receipt.proposalId}
                      className="rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {issued
                        ? t("account.postulateReceipts.creditsIssued")
                        : claimed
                          ? t("account.postulateReceipts.claimed")
                          : claimingPostulateId === receipt.proposalId
                            ? t("account.postulateReceipts.claiming")
                            : session
                              ? t("account.postulateReceipts.claim")
                              : t("account.postulateReceipts.signIn")}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <Link2 className="h-3.5 w-3.5" />
            {t("account.discord.title")}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {t("account.discord.description")}
          </p>
          <div className="mt-3 space-y-2">
            {discordSessions.length === 0 ? (
              <p className="text-xs text-slate-500">{t("account.discord.empty")}</p>
            ) : (
              discordSessions.map((discordSession: DiscordSessionView) => {
                const commander = discordSession.participants.find(
                  (participant: DiscordSessionView["participants"][number]) =>
                    participant.discord_user_id === discordSession.commander_discord_user_id,
                );
                return (
                  <div
                    key={discordSession.session_id}
                    className="grid gap-2 rounded border border-white/10 bg-slate-950/60 p-2 text-xs lg:grid-cols-[1fr_110px_160px]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-200">{discordSession.session_id}</div>
                      <div className="mt-1 truncate text-slate-500">
                        {t("account.discord.threadValue", {
                          threadId: discordSession.thread_id ?? t("account.common.unbound"),
                        })}
                      </div>
                    </div>
                    <span className="rounded bg-white/5 px-2 py-1 text-center text-slate-300">
                      {displayMappedValue(t, discordSession.status, sessionStatusMessages)}
                    </span>
                    <div className="text-slate-300">
                      <div>
                        {t("account.discord.profileValue", {
                          profileId: discordSession.linked_profile_id ?? t("account.common.unlinked"),
                        })}
                      </div>
                      <div className="mt-1">
                        {t("account.discord.commanderValue", {
                          commander: commander?.display_name ?? t("account.common.none"),
                        })}
                      </div>
                      <div className="mt-1">
                        {t("account.discord.liveEnvsValue", { count: discordSession.live_environment_ids.length })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <Archive className="h-3.5 w-3.5" />
            {t("account.archives.title")}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {t("account.archives.description")}
          </p>
          <div className="mt-3 space-y-2">
            {profileArchives.length === 0 ? (
              <p className="text-xs text-slate-500">{t("account.archives.empty")}</p>
            ) : (
              profileArchives.slice(-6).reverse().map((archive: ProfileArchiveView) => (
                <div
                  key={archive.archive_id}
                  className="grid gap-2 rounded border border-white/10 bg-slate-950/60 p-2 text-xs lg:grid-cols-[1fr_150px_150px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-200">{archive.session_title}</div>
                    <div className="mt-1 truncate text-slate-500">{archive.archive_id}</div>
                    <p className="mt-2 line-clamp-2 text-slate-400">{archive.summary}</p>
                  </div>
                  <div className="space-y-1 text-slate-300">
                    <div>
                      {t("account.archives.sourceValue", {
                        source: displayMappedValue(t, archive.source_family, sourceFamilyMessages),
                      })}
                    </div>
                    <div>{t("account.archives.evidenceValue", { count: archive.evidence_index.length })}</div>
                    <div>{t("account.archives.patternsValue", { count: archive.learned_pattern_candidates.length })}</div>
                  </div>
                  <div className="space-y-1 text-slate-400">
                    <div>{t("account.archives.rawLogsValue", { value: displayBoolean(t, archive.raw_logs_included) })}</div>
                    <div>{t("account.archives.assistantAnswerValue", { value: displayBoolean(t, archive.assistant_answer) })}</div>
                    <div>{archive.ended_at}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <Archive className="h-3.5 w-3.5" />
            {t("account.jobs.title")}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {t("account.jobs.description")}
          </p>
          <div className="mt-3 space-y-2">
            {categorizationJobs.length === 0 ? (
              <p className="text-xs text-slate-500">{t("account.jobs.empty")}</p>
            ) : (
              categorizationJobs.map((job: CategorizationJobView) => (
                <div
                  key={job.job_id}
                  className="grid gap-2 rounded border border-white/10 bg-slate-950/60 p-2 text-xs xl:grid-cols-[1fr_180px_180px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-200">{job.objective}</div>
                    <div className="mt-1 truncate text-slate-500">{job.job_id}</div>
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-300">
                      <span className="rounded bg-white/5 px-2 py-1">{displayMappedValue(t, job.status, jobStatusMessages)}</span>
                      <span className="rounded bg-white/5 px-2 py-1">
                        {displayMappedValue(t, job.source_family, sourceFamilyMessages)}
                      </span>
                      <span className="rounded bg-white/5 px-2 py-1">
                        {job.room_id ?? t("account.display.room.none")}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-slate-300">
                    <span>{t("account.jobs.eventsValue", { count: job.counters.source_events_seen })}</span>
                    <span>{t("account.jobs.categoriesValue", { count: job.counters.categorization_events })}</span>
                    <span>{t("account.jobs.evidenceValue", { count: job.counters.synthetic_evidence })}</span>
                    <span>{t("account.jobs.patternsValue", { count: job.counters.pattern_candidates })}</span>
                  </div>
                  <div className="space-y-1 text-slate-400">
                    <div>{t("account.jobs.archiveOnStopValue", { value: displayBoolean(t, job.policy.archive_on_stop) })}</div>
                    <div>{t("account.jobs.rawLogsValue", { value: displayBoolean(t, job.raw_logs_included) })}</div>
                    <div>{job.last_event_ts ?? t("account.jobs.waitingForEvents")}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <KeyRound className="h-3.5 w-3.5" />
            {t("account.ingress.title")}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {t("account.ingress.description")}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.input.5"
              value={ingressLabel}
              onChange={(event) => setIngressLabel(event.target.value)}
              disabled={!session}
              className="rounded border border-white/15 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400 disabled:opacity-50"
              placeholder={t("account.ingress.defaultLabel")}
            />
            <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.create-ingress-token"
              type="button"
              onClick={createIngressToken}
              disabled={!session || loading}
              className="rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("account.ingress.createToken")}
            </button>
          </div>
          {newTokenValue ? (
            <div className="mt-3 rounded border border-amber-300/30 bg-amber-400/10 p-2 text-xs text-amber-100">
              <div className="font-medium">{t("account.ingress.tokenShownOnce")}</div>
              <div className="mt-1 break-all font-mono text-[11px]">{newTokenValue}</div>
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <Metric label={t("account.ingress.requests")} value={status.profile_ingress_usage.request_count} />
            <Metric label={t("account.ingress.accepted")} value={status.profile_ingress_usage.accepted_count} />
            <Metric label={t("account.ingress.rejected")} value={status.profile_ingress_usage.rejected_count} />
            <Metric label={t("account.ingress.tokens")} value={status.profile_ingress_tokens.length} />
          </div>
          <div className="mt-3 space-y-2">
            {status.profile_ingress_tokens.length === 0 ? (
              <p className="text-xs text-slate-500">{t("account.ingress.empty")}</p>
            ) : (
              status.profile_ingress_tokens.map((token: HelixProfileIngressTokenSummary) => (
                <div
                  key={token.token_id}
                  className="grid gap-2 rounded border border-white/10 bg-slate-950/60 p-2 text-xs lg:grid-cols-[160px_1fr_100px_90px]"
                >
                  <div>
                    <div className="font-medium text-slate-200">{token.label}</div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {displayMappedValue(t, token.status, tokenStatusMessages)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="break-all text-slate-400">{token.public_ingress_url}</div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {t("account.ingress.prefixValue", { prefix: token.token_prefix })}
                    </div>
                  </div>
                  <div className="text-slate-300">
                    {t("account.ingress.requestsValue", { count: token.request_count })}
                  </div>
                  <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.revoke-ingress-token-token-token-id"
                    type="button"
                    onClick={() => revokeIngressToken(token.token_id)}
                    disabled={token.status !== "active" || loading}
                    className="rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("account.ingress.revoke")}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <details className="mt-3 rounded-lg border border-fuchsia-300/15 bg-fuchsia-500/[0.04] p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-fuchsia-100">
            <span className="flex items-center gap-2">
              <FlaskConical className="h-3.5 w-3.5" />
              Experimental features
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-fuchsia-200/70" />
          </summary>
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
            <label className="mb-4 flex cursor-pointer items-start justify-between gap-4 border-b border-white/10 pb-4">
              <span>
                <span className="block text-sm font-medium text-white">Ask Helix chat</span>
                <span className="mt-1 block text-xs leading-5 text-slate-400">Show the experimental local interpreter chat in Helix Console. Message Codex and Cloud Agent DM remain available when this is off.</span>
              </span>
              <input type="checkbox" aria-label="Show experimental Ask Helix chat"
                checked={experimentalAskHelix}
                onChange={event => {
                  const enabled = event.currentTarget.checked;
                  setExperimentalAskHelix(enabled);
                  writeExperimentalAskHelix(enabled);
                }}
                className="mt-1 h-4 w-4 shrink-0 accent-fuchsia-400" />
            </label>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-white">Shared Live Rooms</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Join a two-person GPT Live room. Without a signed-in profile, this server creates
                  a temporary Xbox-style guest name and session instead.
                </p>
              </div>
              <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.account-session.account-session-panel.shared-live-rooms"
                type="button"
                role="switch"
                aria-checked={sharedRoomsEnabled}
                aria-label="Shared Live Rooms"
                disabled={
                  experimentalRoomsBusy ||
                  sharedRoomsDeveloperIncluded ||
                  !sharedRoomsAvailable
                }
                onClick={() => void setSharedRoomsExperiment(!sharedRoomsEnabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
                  sharedRoomsEnabled
                    ? "border-emerald-300/50 bg-emerald-400/30"
                    : "border-white/20 bg-slate-800"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span
                  className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition ${
                    sharedRoomsEnabled ? "left-[23px]" : "left-[3px]"
                  }`}
                />
              </button>
            </div>
            <div className="mt-3 text-xs">
              {!sharedRoomsAvailable ? (
                <p className="text-amber-200">
                  This deployment has not enabled public Shared Live Rooms testing.
                </p>
              ) : sharedRoomsDeveloperIncluded ? (
                <p className="text-emerald-200">Included with developer access.</p>
              ) : sharedRoomsEnabled && session?.profile.auth_mode === "guest" ? (
                <div className="space-y-1">
                  <p className="text-emerald-200">
                    You appear as <span className="font-semibold">{session.profile.display_name}</span>.
                  </p>
                  <p className="text-slate-500">
                    {sharedRoomsExperiment?.guest_hosting_allowed
                      ? "This guest can create or join a room."
                      : "This guest can join a one-time room invitation."}
                    {sharedRoomsExperiment?.session_expires_at
                      ? ` Session expires ${new Date(sharedRoomsExperiment.session_expires_at).toLocaleString()}.`
                      : ""}
                  </p>
                </div>
              ) : sharedRoomsEnabled ? (
                <p className="text-emerald-200">Enabled for this account session.</p>
              ) : (
                <p className="text-slate-500">
                  Off. Enabling this does not grant developer panels or permissions.
                </p>
              )}
              {experimentalRoomsBusy ? (
                <p className="mt-2 text-fuchsia-200">Updating Shared Live Rooms…</p>
              ) : null}
            </div>
          </div>
        </details>

        <section className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
          <div className="font-semibold uppercase tracking-[0.12em] text-slate-400">{t("account.boundary.title")}</div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <span className="rounded bg-white/5 px-2 py-1">
              {t("account.boundary.agentCredentialsValue", {
                value: displayBoolean(t, status.auth_boundary.credential_collection_allowed_in_agents),
              })}
            </span>
            <span className="rounded bg-white/5 px-2 py-1">
              {t("account.boundary.rawPasswordsValue", {
                value: displayBoolean(t, status.auth_boundary.raw_password_stored),
              })}
            </span>
            <span className="rounded bg-white/5 px-2 py-1">
              {t("account.boundary.discordPasswordCollectionValue", {
                value: displayBoolean(t, status.auth_boundary.discord_bot_password_collection_allowed),
              })}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/10 bg-slate-950/60 p-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value.toLocaleString()}</div>
    </div>
  );
}
