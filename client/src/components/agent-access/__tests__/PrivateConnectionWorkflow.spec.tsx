// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EnvironmentHomePanel from "@/components/workstation/EnvironmentHomePanel";
import PrivateAskConnectionMenu from "@/components/helix/ask-console/PrivateAskConnectionMenu";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { clearPendingWorkstationGuidance } from "@/lib/workstation/workstationGuidance";
import { AgentConnectionSetup, AGENT_CONNECTION_READINESS_ENDPOINT } from "../AgentConnectionSetup";
import { AGENT_CONNECTION_SETUP_STORAGE_KEY } from "../agentConnectionSetupState";

const directoryPath = "/api/agi/environment-connectors/private/directory/packages";
const directory = () => ({
  schema: "helix.environment_connector.private_directory.v1", policy_revision: "private:3",
  policy_expires_at: new Date(Date.now() + 60000).toISOString(), public_release: false,
  packages: [{
    package_version_id: "connector_package_version:com.casimirbot.system.clock:1.0.0",
    package_id: "com.casimirbot.system.clock", package_version: "1.0.0",
    publisher_id: "publisher:casimirbot", content_hash: `sha256:${"a".repeat(64)}`,
    lifecycle_status: "active", installation_artifact: {
      version: "1.0.0-private.1", archive_sha256: "b".repeat(64), review_revision: "review:private",
    }, install_available: true, runtime_available: false, provider_required: false,
    subscription_required: false, host_compatibility: ["node:20+", "windows"],
    trust: { package_provenance: "first_party", security_review: "private_review" },
  }],
});

// Minimal panel host: production components, guidance, layout actions and stores
// stay real. Only HTTP is controlled; this is not native/Auth0 acceptance.
function Workflow({ entry, warm }: { entry: "home" | "ask"; warm: boolean }) {
  const active = useWorkstationLayoutStore(state =>
    state.groups[state.activeGroupId]?.activePanelId);
  return <>
    {entry === "home" ? <EnvironmentHomePanel /> : <PrivateAskConnectionMenu enabled scope="codex" />}
    {(warm || active === "agent-access") && <AgentConnectionSetup />}
  </>;
}

let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.localStorage.clear(); clearPendingWorkstationGuidance();
  delete window.casimirDesktop;
  window.history.replaceState(null, "", "/");
  Element.prototype.scrollIntoView = vi.fn();
  useAgiChatStore.setState({ activeId: "retained-workflow-chat" });
  useWorkstationLayoutStore.getState().applyLayoutSnapshot({
    chatDock: { side: "right", widthPx: 420, collapsed: false },
    activeGroupId: "workflow", groups: { workflow: { id: "workflow", panelIds: [], activePanelId: null } },
    root: { type: "group", groupId: "workflow" },
  });
  fetcher = vi.fn();
  fetcher.mockImplementation(async (url: string) => new Response(
    JSON.stringify(url === directoryPath ? directory() : {}),
    { status: url === directoryPath ? 200 : 401, headers: { "Content-Type": "application/json" } },
  ));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); clearPendingWorkstationGuidance(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe.each(["home", "ask"] as const)("%s composed connection workflow", entry => {
  it.each([
    ["codex_app", false], ["codex_app", true],
    ["standard_mcp", false], ["standard_mcp", true],
  ] as const)("preserves %s with warm=%s through the real layout handoff", async (profile, warm) => {
    if (warm) window.localStorage.setItem(AGENT_CONNECTION_SETUP_STORAGE_KEY, JSON.stringify({
      schema: AGENT_CONNECTION_SETUP_STORAGE_KEY,
      selected_profile: profile === "codex_app" ? "standard_mcp" : "codex_app", viewed_step: "account",
    }));
    render(<Workflow entry={entry} warm={warm} />);
    if (warm) await screen.findByText("Sign in to CasimirBot");
    if (entry === "home") {
      fireEvent.click(await screen.findByRole("button", { name: "Options for System Clock" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Configure connection" }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Configure connection" }));
    }
    const picker = await screen.findByRole("combobox", { name: "AI app to inspect" });
    fireEvent.change(picker, { target: { value: profile } });
    const beforeHandoff = fetcher.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Open connection setup" }));
    await waitFor(() => {
      const reads = fetcher.mock.calls.slice(beforeHandoff);
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.every(([url]) => url === `${AGENT_CONNECTION_READINESS_ENDPOINT}?client_profile=${profile}`)).toBe(true);
      expect(JSON.parse(window.localStorage.getItem(AGENT_CONNECTION_SETUP_STORAGE_KEY)!))
        .toMatchObject({ selected_profile: profile, viewed_step: "account" });
    });
    const layout = useWorkstationLayoutStore.getState();
    expect(layout.groups[layout.activeGroupId].activePanelId).toBe("agent-access");
    expect(useAgiChatStore.getState().activeId).toBe("retained-workflow-chat");
    expect(fetcher.mock.calls.every(([url, init]) =>
      (url === directoryPath || url.startsWith(AGENT_CONNECTION_READINESS_ENDPOINT)) &&
      (!init?.method || init.method === "GET"))).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    await screen.findByText("Sign in to CasimirBot");
  });
});
