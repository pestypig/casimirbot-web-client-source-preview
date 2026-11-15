// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalMcpDeviceRegistration } from "../PersonalMcpDeviceRegistration";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";

afterEach(() => { cleanup(); delete window.casimirDesktop; });

describe("personal Codex connection control", () => {
  it.each([
    ["Approve this computer", false], ["Approve this computer", true],
    ["Check approval", false], ["Check approval", true],
    ["Connect Codex locally", false], ["Connect Codex locally", true],
    ["Reconnect Codex", false], ["Reconnect Codex", true],
  ] as const)("ignores an old session's %s result (failure=%s)", async (label, fails) => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async action => action === "inspect"
        ? { available: true, checkAvailable: true } : pending),
      personalMcpP1Connection: vi.fn(async action => action === "inspect"
        ? { available: true, phase: "ready" } : action === "completion"
          ? { completion: null } : pending),
    };
    const invalidated = vi.fn();
    window.addEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, invalidated);
    const { rerender } = render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    try {
      fireEvent.click(await screen.findByRole("button", { name: label }));
      rerender(<PersonalMcpDeviceRegistration sessionId="account_session:two" />);
      await screen.findByRole("button", { name: label });
      await act(async () => {
        if (fails) reject(new Error("Synthetic old-session failure"));
        else resolve({ phase: label === "Check approval" ? "approved"
          : label === "Reconnect Codex" ? "reconnected" : "browser_opened" });
      });
      expect(screen.queryByRole("status")).toBeNull();
      expect(invalidated).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: label })).toBeEnabled();
    } finally {
      window.removeEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, invalidated);
    }
  });

  it("does not start approval polling after the panel unmounts", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise(yes => { resolve = yes; });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async () => ({ available: false })),
      personalMcpP1Connection: vi.fn(async action => action === "inspect"
        ? { available: true, phase: "ready" } : action === "completion"
          ? { completion: null } : pending),
    };
    const { unmount } = render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    fireEvent.click(await screen.findByRole("button", { name: "Connect Codex locally" }));
    unmount();
    const interval = vi.spyOn(globalThis, "setInterval");
    try {
      await act(async () => resolve({ phase: "browser_opened" }));
      expect(interval).not.toHaveBeenCalled();
    } finally {
      for (const result of interval.mock.results) if (result.type === "return") clearInterval(result.value);
      interval.mockRestore();
    }
  });

  it.each(["Connect Codex locally", "Reconnect Codex"])("explains a conflict after %s without retrying setup", async label => {
    const connection = vi.fn(async (action: string) => action === "inspect"
      ? { available: true, phase: "ready" }
      : action === "completion" ? { completion: null }
      : { available: true, phase: "unavailable", stage: "personal_mcp_codex_entry_conflict" });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async () => ({ available: false })),
      personalMcpP1Connection: connection,
    };
    render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    fireEvent.click(await screen.findByRole("button", { name: label }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("restore this account's separate entry");
    expect(status).toHaveTextContent("Keep the other account's connection");
    expect(status).not.toHaveTextContent("personal_mcp_codex_entry_conflict");
    expect(connection.mock.calls.filter(([action]) => action === "start" || action === "resume"))
      .toHaveLength(1);
  });

  it("shows conflict recovery for a retained approval completion", async () => {
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async () => ({ available: false })),
      personalMcpP1Connection: vi.fn(async action => action === "completion"
        ? { completion: { phase: "approval_failed", stage: "codex_registration_conflict" } }
        : { available: true, phase: "ready" }),
    };
    render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    expect(await screen.findByRole("status")).toHaveTextContent("restore this account's separate entry");
  });

  it("stays hidden when the native prototype is unavailable", async () => {
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async () => ({ available: false })),
      personalMcpP1Connection: vi.fn(async () => ({ available: false })),
    };
    render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    await waitFor(() => expect(window.casimirDesktop?.personalMcpP1Connection)
      .toHaveBeenCalledWith("inspect"));
    expect(screen.queryByRole("button", { name: "Connect Codex locally" }))
      .toBeNull();
  });

  it.each([
    ["website_unavailable", "CasimirBot website approval is not ready or does not match this build."],
    ["codex_unavailable", "Codex Desktop was not found on this computer."],
  ])("explains %s without offering a blocked Codex action", async (phase, message) => {
    const inspectPersonalP1 = vi.fn()
      .mockResolvedValueOnce({ available: false, phase })
      .mockResolvedValue({ available: true, phase: "ready" });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async () => ({ available: false })),
      personalMcpP1Connection: inspectPersonalP1,
    };
    render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    expect(await screen.findByRole("status")).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: "Connect Codex locally" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry setup check" }));
    expect(await screen.findByRole("button", { name: "Connect Codex locally" })).toBeTruthy();
    expect(inspectPersonalP1.mock.calls.filter(([action]) => action === "inspect"))
      .toHaveLength(2);
  });

  it("offers separate approval and reports only native completion", async () => {
    const completion: { current: ((state: unknown) => void) | null } = { current: null };
    const start = vi.fn(async (action: "inspect" | "start" | "resume" | "completion") => action === "inspect"
      ? { available: true, phase: "ready" }
      : { available: true, phase: "browser_opened" });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async () => ({ available: true,
        checkAvailable: true })),
      personalMcpP1Connection: start,
      onPersonalMcpP1Completion: listener => {
        completion.current = listener;
        return () => { completion.current = null; };
      },
    };
    render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    const connect = await screen.findByRole("button", { name: "Connect Codex locally" });
    expect(connect.getAttribute("data-helix-guidance-target"))
      .toBe("personal-mcp-local-connection");
    expect(connect.closest("[data-helix-guidance-target='personal-mcp-device-approval']"))
      .toBeTruthy();
    fireEvent.click(connect);
    await screen.findByText("Finish the separate Codex access approval in the browser.");
    expect(start).toHaveBeenCalledWith("start");
    completion.current?.({ phase: "configured" });
    const status = await screen.findByText(/Codex local access is configured/);
    expect(status).toHaveTextContent("Restart Codex to load its MCP server");
    expect(status).toHaveTextContent("return to this same chat");
    expect(status).toHaveTextContent("do not need to repeat computer approval");
    expect(status).not.toHaveTextContent("new chat");
  });

  it("names only a recognized local failure stage after browser approval", async () => {
    const completion: { current: ((state: unknown) => void) | null } = { current: null };
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async () => ({ available: true })),
      personalMcpP1Connection: vi.fn(async () => ({ available: true, phase: "ready" })),
      onPersonalMcpP1Completion: listener => {
        completion.current = listener;
        return () => { completion.current = null; };
      },
    };
    render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    await screen.findByRole("button", { name: "Connect Codex locally" });
    completion.current?.({ phase: "approval_failed", stage: "codex_registration" });
    expect(await screen.findByText(/stage: codex_registration/u)).toBeTruthy();
    completion.current?.({ phase: "approval_failed", stage: "unexpected private detail" });
    expect(screen.queryByText(/unexpected private detail/u)).toBeNull();
  });

  it("recovers a missed failure event from the owner-bound completion read", async () => {
    let completionReads = 0;
    const connection = vi.fn(async (action: string) => {
      if (action === "inspect") return { available: true, phase: "ready" };
      if (action === "start") return { available: true, phase: "browser_opened" };
      completionReads += 1;
      return { completion: completionReads > 1
        ? { phase: "approval_failed", stage: "binding_recheck" } : null };
    });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async () => ({ available: true })),
      personalMcpP1Connection: connection,
    };
    render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    fireEvent.click(await screen.findByRole("button", { name: "Connect Codex locally" }));
    await screen.findByText("Finish the separate Codex access approval in the browser.");
    expect(await screen.findByText(/stage: binding_recheck/u, {}, { timeout: 3_000 }))
      .toBeTruthy();
    expect(connection).toHaveBeenCalledWith("completion");
  });

  it("ignores an earlier completion read after a new approval starts", async () => {
    let resolveEarlier!: (value: unknown) => void;
    const earlier = new Promise<unknown>(resolve => { resolveEarlier = resolve; });
    const connection = vi.fn(async (action: string) => {
      if (action === "inspect") return { available: true, phase: "ready" };
      if (action === "start") return { available: true, phase: "browser_opened" };
      return earlier;
    });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async () => ({ available: true })),
      personalMcpP1Connection: connection,
    };
    render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    fireEvent.click(await screen.findByRole("button", { name: "Connect Codex locally" }));
    await screen.findByText("Finish the separate Codex access approval in the browser.");
    await act(async () => resolveEarlier({ completion:
      { phase: "approval_failed", stage: "codex_registration" } }));
    expect(screen.queryByText(/stage: codex_registration/u)).toBeNull();
  });

  it("directs a restored connection to the actual Codex tool check", async () => {
    const connect = vi.fn(async (action: "inspect" | "start" | "resume" | "completion") => action === "inspect"
      ? { available: true, phase: "ready" }
      : { available: true, phase: "reconnected" });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async () => ({ available: false })),
      personalMcpP1Connection: connect,
    };
    render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reconnect Codex" }));
    const status = await screen.findByText(/Codex local access is restored/);
    expect(status).toHaveTextContent("restored with its saved scopes");
    expect(status).toHaveTextContent("fresh approval");
    expect(status).toHaveTextContent("restart Codex and return to this same chat");
    expect(status).not.toHaveTextContent("new chat");
    expect(connect).toHaveBeenCalledWith("resume");
  });

  it("does not claim a separate Codex approval is still needed after a computer check", async () => {
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => undefined),
      personalMcpDeviceRegistration: vi.fn(async (action: string) => action === "inspect"
        ? { available: true, checkAvailable: true }
        : { phase: "approved" }),
      personalMcpP1Connection: vi.fn(async () => ({ available: true, phase: "ready" })),
    };
    render(<PersonalMcpDeviceRegistration sessionId="account_session:one" />);
    fireEvent.click(await screen.findByRole("button", { name: "Check approval" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("This computer is approved");
    expect(status).toHaveTextContent("Check the Codex connection separately");
    expect(status).not.toHaveTextContent("still needs a separate approval");
  });
});
