// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkstationGuidanceOverlay from "../WorkstationGuidanceOverlay";
import {
  HELIX_WORKSTATION_GUIDANCE_EVENT,
  coerceWorkstationGuidanceRequest,
  requestWorkstationGuidance,
} from "@/lib/workstation/workstationGuidance";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WorkstationGuidanceOverlay", () => {
  it("inherits readiness explanation when MCP targets a nested disabled consent control", async () => {
    render(<><WorkstationGuidanceOverlay /><section data-helix-guidance-label="Pickup is unavailable."
      data-helix-guidance-integration-blocked="true"><button disabled data-helix-control-id="fixture.bind"
      ref={element => { if (element) element.scrollIntoView = vi.fn(); }}>Bind task</button></section></>);
    requestWorkstationGuidance({ kind: "user_attention", controlId: "fixture.bind", label: "Review the control." });
    expect(await screen.findByText("Connection limitation: Pickup is unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(/Your action is required:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bind task" })).toBeDisabled();
  });
  it("distinguishes an integration blocker from human consent and follows recovery", async () => {
    const click = vi.fn();
    render(<><WorkstationGuidanceOverlay /><button data-helix-guidance-target="reasoning-task-binding"
      data-helix-guidance-integration-blocked="true" data-helix-guidance-label="Pickup is unavailable."
      onClick={click} ref={element => { if (element) element.scrollIntoView = vi.fn(); }}>Bind task</button></>);
    requestWorkstationGuidance({ kind: "user_attention", targetId: "reasoning-task-binding", label: "Review binding." });
    expect(await screen.findByText("Connection limitation: Pickup is unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(/Your action is required:/)).not.toBeInTheDocument();
    const target = screen.getByRole("button", { name: "Bind task" });
    target.removeAttribute("data-helix-guidance-integration-blocked");
    target.setAttribute("data-helix-guidance-label", "Review consent.");
    expect(await screen.findByText("Your action is required: Review consent.")).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
  });

  it("opens the requested panel, scrolls to the consent target, and never clicks it", async () => {
    const opened: string[] = [];
    const handleOpen = (event: Event) => {
      opened.push((event as CustomEvent<{ id: string }>).detail.id);
    };
    window.addEventListener("open-helix-panel", handleOpen);
    const click = vi.fn();
    const scrollIntoView = vi.fn();
    render(
      <>
        <WorkstationGuidanceOverlay />
        <button
          data-helix-guidance-target="full-harness-trust"
          onClick={click}
          ref={(element) => {
            if (!element) return;
            element.scrollIntoView = scrollIntoView;
            element.getBoundingClientRect = () => ({
              x: 20,
              y: 100,
              left: 20,
              top: 100,
              right: 220,
              bottom: 140,
              width: 200,
              height: 40,
              toJSON: () => ({}),
            });
          }}
        >
          Trust device
        </button>
      </>,
    );

    requestWorkstationGuidance({
      kind: "user_attention",
      panelId: "agent-access",
      targetId: "full-harness-trust",
      label: "Review this choice.",
    });

    expect(
      await screen.findByText(/Your action is required: Review this choice/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(opened).toEqual(["agent-access"]);
    expect(click).not.toHaveBeenCalled();
    window.removeEventListener("open-helix-panel", handleOpen);
  });

  it("does not spotlight an entire panel when a human-action target is missing", async () => {
    const opened: string[] = [];
    const handleOpen = (event: Event) => {
      opened.push((event as CustomEvent<{ id: string }>).detail.id);
    };
    window.addEventListener("open-helix-panel", handleOpen);
    render(
      <>
        <WorkstationGuidanceOverlay />
        <section data-workstation-panel-id="agent-access">
          <button type="button">Unrelated setup control</button>
        </section>
      </>,
    );

    requestWorkstationGuidance({
      kind: "user_attention",
      panelId: "agent-access",
      targetId: "stale-registration-control",
      label: "Register this exact task.",
    });

    await waitFor(() => expect(opened).toContain("agent-access"));
    expect(screen.queryByTestId("workstation-guidance-spotlight")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    window.removeEventListener("open-helix-panel", handleOpen);
  });

  it("samples the target after deterministic nested-panel scrolling", async () => {
    let top = 500;
    const scrollIntoView = vi.fn(() => {
      top = 100;
    });
    render(
      <>
        <WorkstationGuidanceOverlay />
        <button
          data-helix-control-id="workstation.panel.agent-access.agent-connection-setup.bind-current-helix-chat"
          ref={(element) => {
            if (!element) return;
            element.scrollIntoView = scrollIntoView;
            element.getBoundingClientRect = () => ({
              x: 20,
              y: top,
              left: 20,
              top,
              right: 220,
              bottom: top + 40,
              width: 200,
              height: 40,
              toJSON: () => ({}),
            });
          }}
        >
          Bind current Helix chat
        </button>
      </>,
    );

    requestWorkstationGuidance({
      kind: "user_attention",
      panelId: "agent-access",
      controlId:
        "workstation.panel.agent-access.agent-connection-setup.bind-current-helix-chat",
      label: "Review the binding control.",
    });

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "center",
      inline: "nearest",
    }));
    expect(await screen.findByTestId("workstation-guidance-spotlight"))
      .toHaveStyle({ top: "93px" });
  });

  it("marks tool engagement as view-only and rejects malformed guidance", async () => {
    render(
      <>
        <WorkstationGuidanceOverlay />
        <div
          data-workstation-panel-id="narrator"
          ref={(element) => {
            if (element) element.scrollIntoView = vi.fn();
          }}
        />
      </>,
    );
    window.dispatchEvent(
      new CustomEvent(HELIX_WORKSTATION_GUIDANCE_EVENT, {
        detail: {
          kind: "tool_activity",
          panelId: "narrator",
          label: "Narrator tool receipt; no authority.",
        },
      }),
    );
    expect(
      await screen.findByText(/Agent activity \(view only\).*no authority/i),
    ).toBeInTheDocument();
    expect(
      coerceWorkstationGuidanceRequest({
        kind: "user_attention",
        targetId: "unsafe selector [x]",
        label: "ok",
      })?.targetId,
    ).toBe("unsafeselectorx");
    expect(
      coerceWorkstationGuidanceRequest({ kind: "execute", label: "click" }),
    ).toBeNull();
  });

  it("advances past a satisfied prerequisite to its next guidance target", async () => {
    const scrollIntoView = vi.fn();
    render(
      <>
        <div
          data-helix-guidance-target="full-harness-trust"
          data-helix-guidance-satisfied="true"
          data-helix-guidance-next-target="reasoning-task-binding"
        />
        <div
          data-helix-guidance-target="reasoning-task-binding"
          data-helix-guidance-label="Bind this exact AI task."
          ref={(element) => {
            if (element) element.scrollIntoView = scrollIntoView;
          }}
        />
        <WorkstationGuidanceOverlay />
      </>,
    );

    window.dispatchEvent(
      new CustomEvent(HELIX_WORKSTATION_GUIDANCE_EVENT, {
        detail: {
          kind: "user_attention",
          panelId: "agent-access",
          targetId: "full-harness-trust",
          label: "Complete the next required setup action.",
          durationMs: 8000,
        },
      }),
    );

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(
      await screen.findByText(
        /Your action is required: Bind this exact AI task/i,
      ),
    ).toBeInTheDocument();
  });

  it("selects the first mounted unmet step and allows the operator to dismiss guidance", async () => {
    const scrollIntoView = vi.fn();
    render(
      <>
        <div
          data-helix-guidance-target="full-harness-trust"
          data-helix-guidance-satisfied="true"
          data-helix-guidance-next-targets="reasoning-task-binding agent-connection-fast-start"
        />
        <div
          data-helix-guidance-target="agent-connection-fast-start"
          data-helix-guidance-label="Start the harness."
          ref={(element) => {
            if (element) element.scrollIntoView = scrollIntoView;
          }}
        />
        <WorkstationGuidanceOverlay />
      </>,
    );

    requestWorkstationGuidance({
      kind: "user_attention",
      panelId: "agent-access",
      targetId: "full-harness-trust",
      label: "Trust this device.",
    });

    expect(
      await screen.findByText(/Your action is required: Start the harness/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    screen.getByRole("button", { name: "Dismiss guidance" }).click();
    await waitFor(() =>
      expect(
        screen.queryByTestId("workstation-guidance-overlay"),
      ).not.toBeInTheDocument(),
    );
  });

  it("follows the prerequisite chain when the wizard mounts the next control", async () => {
    const { rerender } = render(
      <>
        <div
          data-helix-guidance-target="full-harness-trust"
          data-helix-guidance-satisfied="true"
          data-helix-guidance-next-targets="reasoning-task-binding agent-connection-fast-start"
        />
        <div
          data-helix-guidance-target="agent-connection-fast-start"
          data-helix-guidance-label="Start the harness."
          ref={(element) => {
            if (element) element.scrollIntoView = vi.fn();
          }}
        />
        <WorkstationGuidanceOverlay />
      </>,
    );
    requestWorkstationGuidance({
      kind: "user_attention",
      panelId: "agent-access",
      targetId: "full-harness-trust",
      label: "Continue setup.",
      durationMs: 8000,
    });
    expect(
      await screen.findByText(/Your action is required: Start the harness/i),
    ).toBeInTheDocument();

    rerender(
      <>
        <div
          data-helix-guidance-target="full-harness-trust"
          data-helix-guidance-satisfied="true"
          data-helix-guidance-next-targets="reasoning-task-binding agent-connection-fast-start"
        />
        <div
          data-helix-guidance-target="reasoning-task-binding"
          data-helix-guidance-label="Bind this exact AI task."
          ref={(element) => {
            if (element) element.scrollIntoView = vi.fn();
          }}
        />
        <WorkstationGuidanceOverlay />
      </>,
    );

    expect(
      await screen.findByText(/Your action is required: Bind this exact AI task/i),
    ).toBeInTheDocument();
  });

  it("removes a stale spotlight while a satisfied prerequisite waits for its next control", async () => {
    const { rerender } = render(
      <>
        <div
          data-testid="trust-target"
          data-helix-guidance-target="full-harness-trust"
          data-helix-guidance-satisfied="false"
          data-helix-guidance-next-target="reasoning-task-binding"
          ref={(element) => {
            if (element) element.scrollIntoView = vi.fn();
          }}
        />
        <WorkstationGuidanceOverlay />
      </>,
    );
    requestWorkstationGuidance({
      kind: "user_attention",
      targetId: "full-harness-trust",
      label: "Trust this device.",
      durationMs: 8000,
    });
    expect(await screen.findByTestId("workstation-guidance-overlay")).toBeInTheDocument();

    rerender(
      <>
        <div
          data-testid="trust-target"
          data-helix-guidance-target="full-harness-trust"
          data-helix-guidance-satisfied="true"
          data-helix-guidance-next-target="reasoning-task-binding"
        />
        <WorkstationGuidanceOverlay />
      </>,
    );

    await waitFor(() =>
      expect(screen.queryByTestId("workstation-guidance-overlay")).not.toBeInTheDocument(),
    );
  });

  it("skips multiple satisfied prerequisites and closes with Escape", async () => {
    const finalScroll = vi.fn();
    render(
      <>
        <div
          data-helix-guidance-target="full-harness-trust"
          data-helix-guidance-satisfied="true"
          data-helix-guidance-next-target="agent-connection-fast-start"
        />
        <div
          data-helix-guidance-target="agent-connection-fast-start"
          data-helix-guidance-satisfied="true"
          data-helix-guidance-next-target="reasoning-task-binding"
        />
        <div
          data-helix-guidance-target="reasoning-task-binding"
          data-helix-guidance-label="Bind this exact AI task."
          ref={(element) => {
            if (element) element.scrollIntoView = finalScroll;
          }}
        />
        <WorkstationGuidanceOverlay />
      </>,
    );
    requestWorkstationGuidance({
      kind: "user_attention",
      targetId: "full-harness-trust",
      label: "Continue setup.",
      durationMs: 8000,
    });
    await waitFor(() => expect(finalScroll).toHaveBeenCalled());
    expect(await screen.findByText(/Bind this exact AI task/i)).toBeInTheDocument();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await waitFor(() =>
      expect(screen.queryByTestId("workstation-guidance-overlay")).not.toBeInTheDocument(),
    );
  });
});
