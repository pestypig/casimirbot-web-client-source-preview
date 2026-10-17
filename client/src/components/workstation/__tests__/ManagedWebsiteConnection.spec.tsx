// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManagedWebsiteConnection } from "../ManagedWebsiteConnection";

afterEach(() => { cleanup(); vi.useRealTimers(); delete window.casimirDesktop; });

describe("installed website connection control", () => {
  it("recovers a locally claimed grant when the native website check stalls", async () => {
    vi.useFakeTimers();
    const connect = vi.fn((action: string) => action === "check"
      ? new Promise<never>(() => {})
      : Promise.resolve({ phase: "linked", detail: "Website Owner connected.",
        managedTextAuthorized: true }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiDeviceLink: connect };
    render(<ManagedWebsiteConnection signedIn />);
    expect(screen.getByText("Checking this installation…")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByText("Website Owner connected.")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check connection" })).toBeEnabled();
    expect(connect).toHaveBeenCalledWith("inspect");
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("recovers a staged browser approval when the native start reply stalls", async () => {
    vi.useFakeTimers();
    const pending = { phase: "pending", detail: "Approve this installation in the browser.",
      fingerprint: "b".repeat(64), expiresAt: "2026-10-10T12:00:00.000Z" };
    const connect = vi.fn((action: string) => action === "start"
      ? new Promise<never>(() => {})
      : Promise.resolve(action === "inspect" ? pending :
        { phase: "unlinked", detail: "Connect this installation." }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiDeviceLink: connect };
    render(<ManagedWebsiteConnection signedIn />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole("button", { name: "Connect in browser" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByText("Approve this installation in the browser.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a new request" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Check connection" })).toBeEnabled();
    expect(connect).toHaveBeenCalledWith("inspect");
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it("starts browser approval from the signed-in harness and gives no model authority", async () => {
    const connect = vi.fn(async (action: string) => action === "start"
      ? { phase: "pending", detail: "Approve this installation in the browser.",
        fingerprint: "a".repeat(64), expiresAt: "2026-10-10T12:00:00.000Z" }
      : { phase: "unlinked", detail: "Connect this installation." });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiDeviceLink: connect };
    render(<ManagedWebsiteConnection signedIn />);
    await screen.findByText("Connect this installation.");
    fireEvent.click(screen.getByRole("button", { name: "Connect in browser" }));
    await screen.findByText("Approve this installation in the browser.");
    expect(connect).toHaveBeenCalledWith("start");
    expect(screen.getByText(/does not unlock managed AI/)).toBeTruthy();
    expect(screen.queryByText(/API key:/)).toBeNull();
  });

  it("requires a harness session before a device can start linking", async () => {
    const connect = vi.fn();
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiDeviceLink: connect };
    render(<ManagedWebsiteConnection signedIn={false} />);
    expect(screen.getByText("Sign in to the harness first.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect in browser" }).hasAttribute("disabled")).toBe(true);
    await waitFor(() => expect(connect).not.toHaveBeenCalled());
  });

  it("offers a direct disconnect for a linked installation", async () => {
    const connect = vi.fn(async (action: string) => action === "disconnect"
      ? { phase: "unlinked", detail: "Grant revoked." }
      : { phase: "linked", detail: "Website Owner connected." });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiDeviceLink: connect };
    render(<ManagedWebsiteConnection signedIn />);
    await screen.findByText("Website Owner connected.");
    fireEvent.click(screen.getByRole("button", { name: "Disconnect this app" }));
    await screen.findByText("Grant revoked.");
    expect(connect).toHaveBeenCalledWith("disconnect");
  });

  it("labels a domain-recognized test term as unavailable for model calls", async () => {
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      managedAiDeviceLink: vi.fn(async () => ({
        phase: "linked", detail: "Website Owner connected. Managed AI is not available yet.",
        managedTextAuthorized: true,
        allowance: { planTier: "ai_5", processorMode: "test", state: "active",
          remainingMicros: 800_000, periodEndsAt: "2026-11-01T00:00:00.000Z" },
      })) };
    render(<ManagedWebsiteConnection signedIn />);
    expect(await screen.findByText(/Stripe test · \$5 AI plan active/)).toBeInTheDocument();
    expect(screen.getByText(/Recorded unreserved capacity \$0\.8000/)).toBeInTheDocument();
    expect(screen.getByText(/Managed answers are not enabled by this status check/)).toBeInTheDocument();
    expect(screen.getByText(/Managed text permission approved for this installation/)).toBeInTheDocument();
  });

  it("runs one explicit, consented text qualification without an own key", async () => {
    const ask = vi.fn(async () => ({ ok: true, answer: {
      text: "A short provider answer.", payer: "casimirbot_managed",
      remainingMicros: 799_000,
    } }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: vi.fn(async () => ({ phase: "linked",
        detail: "Website Owner connected.", managedTextAuthorized: true,
        allowance: { planTier: "ai_5", processorMode: "test", state: "active",
          remainingMicros: 800_000, periodEndsAt: "2026-11-01T00:00:00.000Z" },
      })) };
    render(<ManagedWebsiteConnection signedIn />);
    await screen.findByText("Website Owner connected.");
    expect(ask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Private managed-text qualification"));
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }),
      { target: { value: "What can you observe?" } });
    fireEvent.click(screen.getByRole("button", { name: "Run private text check" }));
    expect(await screen.findByText("A short provider answer.")).toBeInTheDocument();
    expect(ask).toHaveBeenCalledOnce();
    expect(ask).toHaveBeenCalledWith("What can you observe?");
    expect(screen.getByText(/No own API key is used/)).toBeInTheDocument();
  });

  it("offers the same bounded check for a private developer allowance", async () => {
    const ask = vi.fn(async () => ({ ok: true, answer: {
      text: "Developer answer.", payer: "casimirbot_managed",
    } }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: vi.fn(async () => ({ phase: "linked",
        detail: "Website Owner connected.", managedTextAuthorized: true,
        allowance: { sourceKind: "developer", planTier: null,
          processorMode: "unknown", state: "active",
          remainingMicros: 100_000, periodEndsAt: "2026-11-01T00:00:00.000Z" },
      })) };
    render(<ManagedWebsiteConnection signedIn />);
    expect(await screen.findByText(/Private developer test · AI allowance active/))
      .toBeInTheDocument();
    fireEvent.click(screen.getByText("Private managed-text qualification"));
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }),
      { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Run private text check" }));
    expect(await screen.findByText("Developer answer.")).toBeInTheDocument();
    expect(ask).toHaveBeenCalledWith("Hello");
  });

  it("does not retry an unconfirmed provider outcome", async () => {
    const ask = vi.fn(async () => ({ ok: false, code: "outcome_unconfirmed",
      requestId: "managed_ai:00000000-0000-4000-8000-000000000001" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: vi.fn(async () => ({ phase: "linked",
        detail: "Website Owner connected.", managedTextAuthorized: true,
        allowance: { planTier: "ai_5", processorMode: "test", state: "active",
          remainingMicros: 800_000, periodEndsAt: "2026-11-01T00:00:00.000Z" },
      })) };
    render(<ManagedWebsiteConnection signedIn />);
    await screen.findByText("Website Owner connected.");
    fireEvent.click(screen.getByText("Private managed-text qualification"));
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }),
      { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Run private text check" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Do not resend this request");
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
