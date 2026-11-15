// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManagedWebsiteConnection } from "../ManagedWebsiteConnection";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from
  "@/lib/workstation/accountCapabilityPolicy";

afterEach(() => { cleanup(); vi.useRealTimers(); delete window.casimirDesktop; });

describe("installed website connection control", () => {
  it.each(["resolve", "reject"])("ignores a private text %s after the account changes", async (outcome) => {
    let finish!: () => void;
    const ask = vi.fn(() => new Promise((resolve, reject) => {
      finish = () => outcome === "resolve"
        ? resolve({ ok: true, answer: { text: "Previous private answer", payer: "casimirbot_managed" } })
        : reject(new Error("Previous account failure"));
    }));
    const connect = vi.fn(async () => ({ phase: "linked", detail: "Current account connected.",
      managedTextAuthorized: true, allowance: { sourceKind: "developer", state: "active",
        processorMode: "test", remainingMicros: 100_000, periodEndsAt: "2026-11-28T00:00:00.000Z" } }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiDeviceLink: connect,
      managedAiTextTurn: ask } as any;
    render(<ManagedWebsiteConnection signedIn />);
    fireEvent.click(await screen.findByText("Private managed-text qualification"));
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: "Old account question" } });
    fireEvent.click(screen.getByRole("button", { name: "Run private text check" }));
    expect(ask).toHaveBeenCalledOnce();
    fireEvent(window, new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
    await act(async () => { finish(); });
    expect(screen.queryByText("Previous private answer")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue("");
    expect(connect).toHaveBeenCalledTimes(2);
    expect(ask).toHaveBeenCalledOnce();
  });

  it("rechecks the new account while an older connection check is pending", async () => {
    let finish!: (value: unknown) => void;
    const connect = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ phase: "unlinked", detail: "New account needs connection." });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiDeviceLink: connect };
    render(<ManagedWebsiteConnection signedIn />);
    expect(connect).toHaveBeenCalledTimes(1);
    fireEvent(window, new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    await act(async () => { finish({ phase: "linked", detail: "Old account connected." }); });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("New account needs connection.")).toBeInTheDocument();
    expect(screen.queryByText("Old account connected.")).not.toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(connect.mock.calls.every(call => call[0] === "check")).toBe(true);
  });

  it("does not recheck a connection for a private answer completed after unmount", async () => {
    let finish!: (value: unknown) => void;
    const ask = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const connect = vi.fn(async () => ({ phase: "linked", detail: "Account connected.",
      managedTextAuthorized: true, allowance: { sourceKind: "developer", state: "active",
        processorMode: "test", remainingMicros: 100_000, periodEndsAt: "2026-11-28T00:00:00.000Z" } }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiDeviceLink: connect,
      managedAiTextTurn: ask } as any;
    const view = render(<ManagedWebsiteConnection signedIn />);
    fireEvent.click(await screen.findByText("Private managed-text qualification"));
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Run private text check" }));
    view.unmount();
    await act(async () => { finish({ ok: true, answer: { text: "Late answer", payer: "casimirbot_managed" } }); });
    expect(connect).toHaveBeenCalledOnce();
    expect(ask).toHaveBeenCalledOnce();
  });

  it("offers the fixed Responses check only after the signed owner status enables it", async () => {
    const probe = vi.fn(async () => ({ ok: true, answer: {
      answerMatchesProbe: true, measuredProviderMicrosUsd: 9,
    } }));
    const status = vi.fn(async () => ({ ok: true, status: {
      state: "active", textCallsEnabled: true, agentProbeEnabled: false,
      currency: "USD", capMinor: 500, remainingMinor: 0,
      includedProviderRemainingMicrosUsd: 800_000,
      periodEndsAt: "2026-11-28T00:00:00.000Z",
    } }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      managedAiDeviceLink: vi.fn(async () => ({ phase: "linked",
        detail: "Website Owner connected.", managedTextAuthorized: true })),
      cappedMembershipStatus: status,
      cappedMembershipAgentProbe: probe };
    render(<ManagedWebsiteConnection signedIn />);
    await waitFor(() => expect(status).toHaveBeenCalledOnce());
    expect(screen.queryByText("Private managed Responses billing check"))
      .not.toBeInTheDocument();
    status.mockResolvedValue({ ok: true, status: {
      state: "active", textCallsEnabled: true, agentProbeEnabled: true,
      currency: "USD", capMinor: 500, remainingMinor: 0,
      includedProviderRemainingMicrosUsd: 800_000,
      periodEndsAt: "2026-11-28T00:00:00.000Z",
    } });
    fireEvent(window, new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    fireEvent.click(await screen.findByText("Private managed Responses billing check"));
    const run = screen.getByRole("button", {
      name: "Run one installed Responses check" });
    expect(run).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", {
      name: /I approve one bounded Responses sandbox call/u }));
    fireEvent.click(run);
    expect(await screen.findByText(/settled with a provider usage receipt/u))
      .toBeInTheDocument();
    expect(probe).toHaveBeenCalledOnce();
    expect(run).toBeDisabled();
  });

  it("offers the capped sandbox text action only after a funded owner status", async () => {
    const ask = vi.fn(async () => ({ ok: true, answer: {
      text: "Capped answer.", remainingMinor: 0,
    } }));
    const status = vi.fn(async () => ({ ok: true, status: {
      state: "active", textCallsEnabled: true, currency: "USD",
      capMinor: 500, remainingMinor: 0,
      includedProviderRemainingMicrosUsd: 800_000,
      periodEndsAt: "2026-11-28T00:00:00.000Z",
    } }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      managedAiDeviceLink: vi.fn(async () => ({ phase: "linked",
        detail: "Website account connected. No single current funded text allowance was confirmed. Review your subscriptions on the website.",
        managedTextAuthorized: true })),
      cappedMembershipStatus: status,
      cappedMembershipTextTurn: ask };
    render(<ManagedWebsiteConnection signedIn />);
    fireEvent.click(await screen.findByText("Private capped-membership text check"));
    expect(screen.getByText("Website account connected. Active capped Stripe sandbox period confirmed below."))
      .toBeInTheDocument();
    expect(screen.queryByText(/No single current funded text allowance was confirmed/))
      .not.toBeInTheDocument();
    expect(screen.getByText(/Included provider cost left: \$0\.8000/))
      .toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }),
      { target: { value: "A bounded question" } });
    fireEvent.click(screen.getByRole("button", {
      name: "Run private capped-text check" }));
    expect(await screen.findByText("Capped answer.")).toBeInTheDocument();
    expect(ask).toHaveBeenCalledOnce();
    expect(ask).toHaveBeenCalledWith("A bounded question");
  });

  it("does not expose the capped action for an inactive sandbox period", async () => {
    const ask = vi.fn();
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      managedAiDeviceLink: vi.fn(async () => ({ phase: "linked",
        detail: "Website Owner connected.", managedTextAuthorized: true })),
      cappedMembershipStatus: vi.fn(async () => ({ ok: true, status: {
        state: "inactive", textCallsEnabled: false,
      } })), cappedMembershipTextTurn: ask };
    render(<ManagedWebsiteConnection signedIn />);
    await screen.findByText("Website Owner connected.");
    await waitFor(() => expect(window.casimirDesktop?.cappedMembershipStatus)
      .toHaveBeenCalledOnce());
    expect(screen.queryByText("Private capped-membership text check"))
      .not.toBeInTheDocument();
    expect(ask).not.toHaveBeenCalled();
  });

  it("does not display an answer after the signed-in account changes", async () => {
    let finish!: (value: unknown) => void;
    const ask = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      managedAiDeviceLink: vi.fn(async () => ({ phase: "linked",
        detail: "Website Owner connected.", managedTextAuthorized: true })),
      cappedMembershipStatus: vi.fn(async () => ({ ok: true, status: {
        state: "active", textCallsEnabled: true, currency: "USD",
        capMinor: 500, remainingMinor: 0,
        includedProviderRemainingMicrosUsd: 800_000,
        periodEndsAt: "2026-11-28T00:00:00.000Z",
      } })), cappedMembershipTextTurn: ask };
    render(<ManagedWebsiteConnection signedIn />);
    fireEvent.click(await screen.findByText("Private capped-membership text check"));
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }),
      { target: { value: "A bounded question" } });
    fireEvent.click(screen.getByRole("button", {
      name: "Run private capped-text check" }));
    expect(ask).toHaveBeenCalledOnce();
    fireEvent(window, new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    await act(async () => { finish({ ok: true, answer: {
      text: "Previous account answer.", remainingMinor: 0,
    } }); });
    expect(screen.queryByText("Previous account answer.")).not.toBeInTheDocument();
  });

  it("rechecks a transient unavailable identity when the owner returns to the app", async () => {
    const connect = vi.fn()
      .mockResolvedValueOnce({ phase: "unavailable", detail: "Sign in to this harness profile first." })
      .mockResolvedValue({ phase: "linked", detail: "Website account connected." });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiDeviceLink: connect };
    render(<ManagedWebsiteConnection signedIn />);
    await screen.findByText("Sign in to this harness profile first.");
    fireEvent.focus(window);
    await screen.findByText("Website account connected.");
    expect(connect).toHaveBeenNthCalledWith(2, "inspect");
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

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
