// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";
import { fetchAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { WorkstationPanelHost } from "../WorkstationPanelHost";

const testState = vi.hoisted(() => ({
  interfaceLanguage: "en",
}));

vi.mock("@/hooks/useHelixStartSettings", () => ({
  useHelixStartSettings: () => ({
    userSettings: { interfaceLanguage: testState.interfaceLanguage },
  }),
}));

describe("WorkstationPanelHost account policy", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    testState.interfaceLanguage = "en";
  });

  it.each([["code-admin", "Code Admin"]])("renders a lock screen for locked %s deep links", async (id, title) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ account_policy: HELIX_USER_ACCOUNT_POLICY }),
      })),
    );
    await fetchAccountCapabilityPolicy();

    render(<WorkstationPanelHost panelId={id} />);

    expect(screen.getByText(`${title} is locked`)).toBeTruthy();
    expect(screen.getByText(/reserved for developer mode/i)).toBeTruthy();
  });

  it("renders the workflow demo lab for public user-policy deep links", async () => {
    vi.stubGlobal("React", React);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ account_policy: HELIX_USER_ACCOUNT_POLICY }),
      })),
    );
    await fetchAccountCapabilityPolicy();

    render(<WorkstationPanelHost panelId="workflow-demo-lab" />);

    expect(await screen.findByTestId("workflow-demo-lab-panel")).toBeTruthy();
    expect(screen.queryByText(/reserved for developer mode/i)).toBeNull();
  });

  it("renders Home for a signed-out user even though the server tool policy stays restricted", async () => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ account_policy: HELIX_USER_ACCOUNT_POLICY }),
    })));
    await fetchAccountCapabilityPolicy();

    render(<WorkstationPanelHost panelId="environment-home" />);

    expect(await screen.findByRole("heading", { name: "Home" })).toBeTruthy();
    expect(screen.queryByText(/reserved for developer mode/i)).toBeNull();
  });

  it("keeps the motorcycle HUD engineering lab developer-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ account_policy: HELIX_USER_ACCOUNT_POLICY }),
      })),
    );
    await fetchAccountCapabilityPolicy();

    render(<WorkstationPanelHost panelId="motorcycle-hud-lab" />);

    expect(screen.getByText("Motorcycle HUD Lab is locked")).toBeTruthy();
    expect(screen.getByText(/reserved for developer mode/i)).toBeTruthy();
    expect(screen.queryByTestId("motorcycle-hud-lab")).toBeNull();
  });

  it("keeps the general Surface Workspace developer-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ account_policy: HELIX_USER_ACCOUNT_POLICY }),
      })),
    );
    await fetchAccountCapabilityPolicy();

    render(<WorkstationPanelHost panelId="surface-workspace" />);

    expect(screen.getByText("Surface Workspace is locked")).toBeTruthy();
    expect(screen.getByText(/reserved for developer mode/i)).toBeTruthy();
    expect(screen.queryByTestId("surface-workspace-panel")).toBeNull();
  });

  it("renders the safe local harness status surface for public users", async () => {
    vi.stubGlobal("React", React);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ account_policy: HELIX_USER_ACCOUNT_POLICY }),
      })),
    );
    await fetchAccountCapabilityPolicy();

    render(<WorkstationPanelHost panelId="local-harness" />);

    expect(await screen.findByText("Installed app required")).toBeTruthy();
    expect(screen.queryByText(/reserved for developer mode/i)).toBeNull();
  });

  it("renders locked panel chrome through the selected interface language", async () => {
    testState.interfaceLanguage = "haw";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ account_policy: HELIX_USER_ACCOUNT_POLICY }),
      })),
    );
    await fetchAccountCapabilityPolicy();

    render(<WorkstationPanelHost panelId="code-admin" />);

    expect(await screen.findByText(
      "Ua laka \u02bbia \u02bbo Luna Ho\u02bbokele Code",
    )).toBeTruthy();
    expect(await screen.findByText(
      /M\u0101lama \u02bbia k\u0113ia hi\u02bbohi\u02bbona workstation/,
    )).toBeTruthy();
  });

  it("shows the installed service panel to public users without granting its account operations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ account_policy: HELIX_USER_ACCOUNT_POLICY }),
      })),
    );
    await fetchAccountCapabilityPolicy();

    render(<WorkstationPanelHost panelId="connections-billing-security" />);

    expect(await screen.findByText("Installed app required")).toBeTruthy();
    expect(screen.queryByText(/reserved for developer mode/i)).toBeNull();
  });
});
