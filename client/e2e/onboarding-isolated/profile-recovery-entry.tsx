import React from "react";
import { createRoot } from "react-dom/client";
import { AgentConnectionSetup } from "../../src/components/agent-access/AgentConnectionSetup";
import { useProfileStorageSync } from "../../src/lib/workstation/profileStorageSync";
import { useAgiChatStore } from "../../src/store/useAgiChatStore";
import { cacheAccountCapabilityPolicy } from "../../src/lib/workstation/accountCapabilityPolicy";
import { HELIX_USER_ACCOUNT_POLICY } from "../../../shared/helix-account-session";

// Fixture entry only. Uses the real stores, sync hook and preference controls.
function RecoveryFixture() {
  useProfileStorageSync();
  const activeId = useAgiChatStore(state => state.activeId);
  const changeFixtureAccount = async (signedIn: boolean) => {
    const response = await fetch(`/api/account/session/${signedIn ? "sign-in" : "sign-out"}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signedIn ? { profile_id: "profile:account-event-fixture" } : {}),
    });
    if (!response.ok) throw new Error("fixture_account_change_failed");
    const status = await response.json();
    cacheAccountCapabilityPolicy(signedIn ? status.session?.account_policy ?? status.account_policy ?? null : HELIX_USER_ACCOUNT_POLICY,
      signedIn ? status.session?.profile.profile_id ?? null : null);
  };
  return <>
    {new URLSearchParams(location.search).has("account-events") && <>
      <button onClick={() => void changeFixtureAccount(true)}>Sign in fixture account</button>
      <button onClick={() => void changeFixtureAccount(false)}>Sign out fixture account</button>
    </>}
    <button onClick={() => useAgiChatStore.getState().newSession("Recovery fixture chat")}>Create fixture chat</button>
    <output data-testid="active-chat">{activeId ?? "none"}</output>
    <AgentConnectionSetup />
  </>;
}
createRoot(document.getElementById("root")!).render(<RecoveryFixture />);
