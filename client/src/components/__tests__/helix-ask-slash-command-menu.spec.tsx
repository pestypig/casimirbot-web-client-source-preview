// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HELIX_DEVELOPER_ACCOUNT_POLICY,
  HELIX_USER_ACCOUNT_POLICY,
} from "@shared/helix-account-session";
import { HelixAskSlashCommandMenu } from "@/components/helix/ask-console/HelixAskSlashCommandMenu";
import {
  buildHelixAskSlashCommandCatalogForPolicy,
  buildHelixAskSlashCommandMenuItems,
} from "@/components/helix/ask-console/HelixAskSlashCommandCatalog";
import {
  insertHelixAskSlashCommandPrompt,
  resolveHelixAskSlashCommandTrigger,
} from "@/components/helix/ask-console/HelixAskSlashCommandInsertion";
import {
  buildHelixAskSlashCommandMenuState,
  resolveHelixAskSlashCommandMenuKey,
} from "@/components/helix/ask-console/HelixAskSlashCommandMenuState";

afterEach(() => cleanup());

describe("Helix Ask slash command menu", () => {
  it("builds account-scoped command items without exposing developer-only commands to user accounts", () => {
    const userItems = buildHelixAskSlashCommandMenuItems({
      accountPolicy: HELIX_USER_ACCOUNT_POLICY,
      runtime: { id: "codex", label: "Codex Workstation Mode" },
    });
    expect(userItems.map((item) => item.command)).toEqual(
      expect.arrayContaining(["/calculator", "/research", "/docs", "/image", "/postulate"]),
    );
    expect(userItems.find((item) => item.command === "/postulate")).toMatchObject({
      accessState: "available",
      insertionText: "Send this postulate to be reviewed: ",
      expectedTerminalProductKind: "postulate_runtime_review",
      allowedTerminalProductKinds: ["postulate_runtime_review", "typed_failure"],
    });
    expect(userItems.some((item) => item.command === "/situation")).toBe(false);

    const developerItems = buildHelixAskSlashCommandMenuItems({
      accountPolicy: HELIX_DEVELOPER_ACCOUNT_POLICY,
      runtime: { id: "codex", label: "Codex Workstation Mode" },
    });
    expect(developerItems.some((item) => item.command === "/situation")).toBe(true);
  });

  it("generates commands from the active account capability list", () => {
    const policy = {
      ...HELIX_USER_ACCOUNT_POLICY,
      allowed_workstation_capabilities: [
        ...HELIX_USER_ACCOUNT_POLICY.allowed_workstation_capabilities,
        "repo.search",
      ],
    };
    const catalog = buildHelixAskSlashCommandCatalogForPolicy(policy);
    expect(catalog.find((item) => item.capabilityId === "repo.search")).toMatchObject({
      command: "/repo-search",
      label: "Repo Search",
      generated: true,
      insertionText: "Use the repo.search capability to ",
    });

    const items = buildHelixAskSlashCommandMenuItems({
      accountPolicy: policy,
      runtime: { id: "codex", label: "Codex Workstation Mode" },
    });
    expect(items.find((item) => item.capabilityId === "repo.search")).toMatchObject({
      command: "/repo-search",
      accessState: "available",
    });
  });

  it("declares terminal product contracts for curated slash commands", () => {
    const catalog = buildHelixAskSlashCommandCatalogForPolicy(HELIX_USER_ACCOUNT_POLICY);
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: "/calculator",
          expectedTerminalProductKind: "workstation_tool_evaluation",
          allowedTerminalProductKinds: expect.arrayContaining(["workstation_tool_evaluation", "typed_failure"]),
        }),
        expect.objectContaining({
          command: "/image",
          expectedTerminalProductKind: "image_lens_observation_report",
          allowedTerminalProductKinds: expect.arrayContaining(["image_lens_observation_report", "typed_failure"]),
        }),
        expect.objectContaining({
          command: "/moral",
          expectedTerminalProductKind: "agent_provider_terminal_candidate",
          allowedTerminalProductKinds: expect.arrayContaining(["agent_provider_terminal_candidate", "typed_failure"]),
        }),
        expect.objectContaining({
          command: "/theory",
          expectedTerminalProductKind: "theory_context_reflection_answer",
          allowedTerminalProductKinds: expect.arrayContaining(["theory_context_reflection_answer", "typed_failure"]),
        }),
        expect.objectContaining({
          command: "/postulate",
          expectedTerminalProductKind: "postulate_runtime_review",
          allowedTerminalProductKinds: ["postulate_runtime_review", "typed_failure"],
        }),
      ]),
    );
  });

  it("keeps the postulate scaffold visible when cached policy has the public board but not the new capability", () => {
    const stalePolicy = {
      ...HELIX_USER_ACCOUNT_POLICY,
      allowed_workstation_capabilities: HELIX_USER_ACCOUNT_POLICY.allowed_workstation_capabilities.filter(
        (capability) => capability !== "postulate.submit_proposal",
      ),
    };

    const items = buildHelixAskSlashCommandMenuItems({
      accountPolicy: stalePolicy,
      runtime: { id: "codex", label: "Codex Workstation Mode" },
    });

    expect(items.find((item) => item.command === "/postulate")).toMatchObject({
      accessState: "available",
      fallbackPanelId: "postulate-board",
    });
  });

  it("keeps the postulate scaffold visible when live policy has not caught up to canonical public panels", () => {
    const livePolicyWithoutPostulate = {
      ...HELIX_USER_ACCOUNT_POLICY,
      allowed_panels: HELIX_USER_ACCOUNT_POLICY.allowed_panels.filter((panelId) => panelId !== "postulate-board"),
      allowed_workstation_capabilities: HELIX_USER_ACCOUNT_POLICY.allowed_workstation_capabilities.filter(
        (capability) => capability !== "postulate.submit_proposal",
      ),
    };

    const items = buildHelixAskSlashCommandMenuItems({
      accountPolicy: livePolicyWithoutPostulate,
      runtime: { id: "codex", label: "Codex Workstation Mode" },
    });

    expect(items.find((item) => item.command === "/postulate")).toMatchObject({
      accessState: "available",
      fallbackPanelId: "postulate-board",
    });
  });

  it("filters commands and tracks keyboard navigation without executing tools", () => {
    const items = buildHelixAskSlashCommandMenuItems({
      accountPolicy: HELIX_USER_ACCOUNT_POLICY,
      runtime: { id: "codex", label: "Codex Workstation Mode" },
    });
    const state = buildHelixAskSlashCommandMenuState({
      open: true,
      query: "calc",
      items,
      selectedIndex: 0,
    });
    expect(state.items.length).toBeGreaterThan(1);
    expect(state.selectedItem?.command).toBe("/calculator");
    expect(
      resolveHelixAskSlashCommandMenuKey({
        key: "ArrowDown",
        open: true,
        selectedIndex: 0,
        itemCount: 2,
      }),
    ).toMatchObject({ handled: true, action: "select", selectedIndex: 1 });
    expect(
      resolveHelixAskSlashCommandMenuKey({
        key: "Enter",
        open: true,
        selectedIndex: 0,
        itemCount: 1,
      }),
    ).toMatchObject({ handled: true, action: "insert" });
    expect(
      resolveHelixAskSlashCommandMenuKey({
        key: "Enter",
        open: true,
        selectedIndex: -1,
        itemCount: 0,
      }),
    ).toMatchObject({ handled: true, action: "none" });
  });

  it("replaces only the active slash token with safe prompt scaffold text", () => {
    const value = "Before /calc";
    const trigger = resolveHelixAskSlashCommandTrigger({
      value,
      selectionStart: value.length,
      selectionEnd: value.length,
    });
    expect(trigger).toMatchObject({ query: "calc" });

    expect(
      insertHelixAskSlashCommandPrompt({
        value,
        trigger,
        insertionText: "Use the scientific calculator capability to ",
      }),
    ).toEqual({
      value: "Before Use the scientific calculator capability to ",
      cursor: "Before Use the scientific calculator capability to ".length,
    });
  });

  it("renders command descriptions and calls selection without submitting or fetching", () => {
    const onSelect = vi.fn();
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    const items = buildHelixAskSlashCommandMenuItems({
      accountPolicy: HELIX_USER_ACCOUNT_POLICY,
      runtime: { id: "codex", label: "Codex Workstation Mode" },
    });
    render(
      <HelixAskSlashCommandMenu
        state={buildHelixAskSlashCommandMenuState({
          open: true,
          query: "",
          items,
          selectedIndex: 0,
        })}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByTestId("helix-ask-slash-command-anchor")).toBeTruthy();
    const menu = screen.getByTestId("helix-ask-slash-command-menu");
    expect(menu).toBeTruthy();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.className).toContain("fixed");
    expect(menu.className).toContain("pointer-events-auto");
    expect(menu.className).toContain("z-[2147483000]");
    expect(menu.className).toContain("bg-slate-950");
    expect(menu.className).not.toContain("absolute");
    expect(menu.className).not.toContain("bottom-full");
    expect(menu.className).not.toContain("bg-slate-950/95");
    expect(screen.getByText("/calculator")).toBeTruthy();
    expect(screen.getByText(/Solve or inspect a mathematical expression/)).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId("helix-ask-slash-command-calculator"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ command: "/calculator" }));
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
  });
});
