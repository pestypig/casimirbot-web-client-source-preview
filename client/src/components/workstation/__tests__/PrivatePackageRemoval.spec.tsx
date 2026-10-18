// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrivatePackageRemoval from "../PrivatePackageRemoval";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
const selection = { packageId: "com.casimirbot.system.clock", version: "1.0.0", artifactSha256: "a".repeat(64),
  installationRef: "environment_installation:00000000-0000-4000-8000-000000000001" };
const receipt = (complete = true) => ({ status: "removed", receipt: {
  schema: "casimirbot.environment_package_removal.v1", packageId: selection.packageId, installationRef: selection.installationRef,
  artifactSha256: selection.artifactSha256, selected: false, codeFilesRemoved: complete, removedFileCount: complete ? 3 : 0,
  userDataPreserved: true, observationHistoryPreserved: true,
  ...(!complete ? { cleanupError: "package_removal_cleanup_incomplete" } : {}),
} });
const fixture = () => {
  const bridge = { getPrivateEnvironmentRemovalState: vi.fn(async (): Promise<unknown> => ({ status: "selected", selection })),
    removePrivateEnvironmentPackage: vi.fn(async (): Promise<unknown> => receipt()) };
  const onRemoved = vi.fn(); return { bridge, onRemoved };
};
afterEach(cleanup);
const show = (s: ReturnType<typeof fixture>) => render(<PrivatePackageRemoval {...s} />);
const remove = () => fireEvent.click(screen.getByRole("button", { name: "Remove clock package" }));
describe("private Home cleanup with controlled bridge", () => {
  it("offers cleanup without a catalog, and requires an explicit request", async () => {
    const s = fixture(); show(s); await screen.findByText("System Clock 1.0.0 is installed.");
    expect(s.bridge.removePrivateEnvironmentPackage).not.toHaveBeenCalled(); remove();
    await screen.findByText("Package removed. Saved observations and personal data were kept.");
    expect(s.bridge.removePrivateEnvironmentPackage).toHaveBeenCalledWith(); expect(s.onRemoved).toHaveBeenCalledTimes(1);
  });
  it("retains installation presentation when native confirmation is canceled", async () => {
    const s = fixture(); s.bridge.removePrivateEnvironmentPackage.mockResolvedValue({ status: "cancelled" });
    show(s); await screen.findByText("System Clock 1.0.0 is installed."); remove(); await screen.findByText("Removal canceled.");
    expect((screen.getByRole("button", {name:"Remove clock package"}) as HTMLButtonElement).disabled).toBe(false);
    expect(s.onRemoved).not.toHaveBeenCalled();
  });
  it("reports retained files without claiming complete deletion", async () => {
    const s = fixture(); s.bridge.removePrivateEnvironmentPackage.mockResolvedValue(receipt(false));
    show(s); await screen.findByText("System Clock 1.0.0 is installed."); remove();
    await screen.findByText(/Some code files could not be removed/); expect(s.onRemoved).toHaveBeenCalledTimes(1);
  });
  it.each(["not_installed", "unavailable", "invalid"])("denies removal for %s lookup", async status => {
    const s = fixture(); s.bridge.getPrivateEnvironmentRemovalState.mockResolvedValue(status === "unavailable" ? {status,error:"signed_out"} : {status});
    show(s); await screen.findByText(status === "not_installed" ? "No selected clock package." : /Sign in with your developer account/);
    remove(); expect(s.bridge.removePrivateEnvironmentPackage).not.toHaveBeenCalled();
  });
  it.each(["throw", "wrong-reference"])("does not claim success after %s", async kind => {
    const s = fixture();
    if (kind === "throw") s.bridge.removePrivateEnvironmentPackage.mockRejectedValue(Error("transport"));
    else { const result = receipt(); result.receipt.installationRef = "environment_installation:00000000-0000-4000-8000-000000000002"; s.bridge.removePrivateEnvironmentPackage.mockResolvedValue(result); }
    show(s); await screen.findByText("System Clock 1.0.0 is installed."); remove(); await screen.findByText(/Removal status is uncertain/);
    expect(s.onRemoved).not.toHaveBeenCalled();
  });
  it("ignores a late successful deletion response after account replacement", async () => {
    const s = fixture(); let answer!: (value: unknown) => void;
    s.bridge.removePrivateEnvironmentPackage.mockImplementationOnce(() => new Promise(r => { answer = r; }));
    show(s); await screen.findByText("System Clock 1.0.0 is installed."); remove();
    s.bridge.getPrivateEnvironmentRemovalState.mockResolvedValue({ status: "unavailable", error: "signed_out" });
    await act(async () => { window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)); });
    await act(async () => { answer(receipt()); });
    expect(s.onRemoved).not.toHaveBeenCalled(); expect(screen.queryByText(/Package removed\./)).toBeNull();
    expect((screen.getByRole("button", {name:"Remove clock package"}) as HTMLButtonElement).disabled).toBe(true);
  });
  it("refreshes when a new installation is selected", async () => {
    const s = fixture(); s.bridge.getPrivateEnvironmentRemovalState.mockResolvedValueOnce({ status: "not_installed" });
    const view = show(s); await screen.findByText("No selected clock package.");
    view.rerender(<PrivatePackageRemoval {...s} installationRef={selection.installationRef} />);
    await screen.findByText("System Clock 1.0.0 is installed."); expect(s.bridge.getPrivateEnvironmentRemovalState).toHaveBeenCalledTimes(2);
  });
  it("waits for the parent's native lookup to finish before starting cleanup lookup", async () => {
    const s = fixture(), view = render(<PrivatePackageRemoval {...s} enabled={false} />);
    expect(s.bridge.getPrivateEnvironmentRemovalState).not.toHaveBeenCalled();
    view.rerender(<PrivatePackageRemoval {...s} enabled />);
    await screen.findByText("System Clock 1.0.0 is installed."); expect(s.bridge.getPrivateEnvironmentRemovalState).toHaveBeenCalledTimes(1);
  });
  it("clears the old removal success message after a new installation", async () => {
    const s=fixture(),view=show(s);await screen.findByText("System Clock 1.0.0 is installed.");remove();
    await screen.findByText("Package removed. Saved observations and personal data were kept.");
    view.rerender(<PrivatePackageRemoval {...s} installationRef="environment_installation:00000000-0000-4000-8000-000000000002" />);
    await screen.findByText("System Clock 1.0.0 is installed.");expect(screen.queryByText(/Package removed\./)).toBeNull();
  });
});
