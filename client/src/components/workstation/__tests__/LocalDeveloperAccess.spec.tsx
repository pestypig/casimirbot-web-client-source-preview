// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalDeveloperAccess } from "../LocalDeveloperAccess";
afterEach(() => { cleanup(); delete window.casimirDesktop; });
describe("local developer USB setup", () => {
  it("is absent without native bridge and never invokes while signed out", async () => {
    const { unmount } = render(<LocalDeveloperAccess signedIn={false} onChanged={() => {}} />);
    expect(screen.queryByRole("region")).toBeNull(); unmount();
    const bridge = vi.fn(); window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), localDeveloperAccess: bridge };
    render(<LocalDeveloperAccess signedIn={false} onChanged={() => {}} />);
    expect(screen.getByRole("button", { name: "Import my USB grant" })).toBeDisabled();
    expect(bridge).not.toHaveBeenCalled();
  });
  it("delegates import to native approval and refreshes account policy only after a result", async () => {
    const changed = vi.fn(); const bridge = vi.fn(async (action: string) => action === "inspect"
      ? { phase: "inactive", detail: "No grant." }
      : { phase: "active", detail: "Local grant active.", expiresAt: Date.now() + 60000 });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), localDeveloperAccess: bridge };
    render(<LocalDeveloperAccess signedIn onChanged={changed} />);
    await screen.findByText("No grant.");
    fireEvent.click(screen.getByRole("button", { name: "Import my USB grant" }));
    await screen.findByText("Local grant active."); expect(changed).toHaveBeenCalledOnce();
    expect(bridge).toHaveBeenCalledWith("import-grant", undefined);
    expect(screen.getByText(/removing it does not revoke/)).toBeInTheDocument();
    expect(screen.getByText(/Offline recipients receive revocations/)).toBeInTheDocument();
  });
  it("offers one visible private-profile activation instead of requiring the hidden issuer disclosure", async () => {
    const bridge = vi.fn(async (action: string) => action === "inspect"
      ? { phase: "inactive", detail: "No grant.", issuerInitialized: false, ownsIssuer: false }
      : { phase: "active", detail: "Local developer access active." });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), localDeveloperAccess: bridge };
    render(<LocalDeveloperAccess signedIn onChanged={() => {}} />);
    const activate = await screen.findByRole("button", { name: "Activate this private development profile" });
    fireEvent.click(activate);
    await screen.findByText("Local developer access active.");
    expect(bridge).toHaveBeenCalledWith("activate-self", undefined);
  });
  it("does not infer access from malformed bridge responses", async () => {
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), localDeveloperAccess: vi.fn(async () => ({ phase: "active", token: "not-public" })) };
    render(<LocalDeveloperAccess signedIn onChanged={() => {}} />);
    await screen.findByText(/No access is inferred/);
    expect(screen.queryByText("not-public")).toBeNull();
  });
  it("does not claim a native confirmation is open during a read-only access check", async () => {
    let resolveInspect!: (value: { phase: "inactive"; detail: string }) => void;
    const bridge = vi.fn(() => new Promise<{ phase: "inactive"; detail: string }>(resolve => { resolveInspect = resolve; }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), localDeveloperAccess: bridge };
    render(<LocalDeveloperAccess signedIn onChanged={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking local developer access…");
    expect(screen.queryByText("Complete the native dialog…")).toBeNull();
    resolveInspect({ phase: "inactive", detail: "No grant." });
    await screen.findByText("No grant.");
  });
  it("distinguishes a USB grant from a confirmed native lease and exposes bounded refresh diagnostics", async () => {
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), localDeveloperAccess: vi.fn(async () => ({
      phase: "active", detail: "Local grant active.", nativeLease: {
        lastAcknowledgedAt: null, lastRefreshIssue: { at: 1800000000000, reason: "account_unavailable" },
      },
    })) };
    render(<LocalDeveloperAccess signedIn onChanged={() => {}} />);
    expect(await screen.findByText(/Native lease last acknowledged: not confirmed/)).toHaveTextContent(/account unavailable/);
    expect(screen.getByText(/A USB grant alone does not confirm current room-source access/)).toBeInTheDocument();
  });
  it("does not re-run inspection when parent refresh changes callback identity", async () => {
    const bridge = vi.fn(async () => ({ phase: "inactive", detail: "No grant." }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), localDeveloperAccess: bridge };
    const { rerender } = render(<LocalDeveloperAccess signedIn onChanged={() => {}} />);
    await screen.findByText("No grant."); rerender(<LocalDeveloperAccess signedIn onChanged={() => {}} />);
    await waitFor(() => expect(bridge).toHaveBeenCalledTimes(1));
  });
});
