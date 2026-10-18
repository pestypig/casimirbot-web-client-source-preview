// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomServiceEntry } from "../RoomServiceEntry";
import { HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT as OPEN } from "../SharedLiveRoomGuideProjection";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT as ACCOUNT } from "@/lib/workstation/accountCapabilityPolicy";
const id = "shared_realtime_room:exact";
const setup = () => { window.history.replaceState({}, "", `/desktop?service_room=${encodeURIComponent(id)}`); return render(<RoomServiceEntry />); };
afterEach(() => { cleanup(); delete window.casimirDesktop; window.history.replaceState({}, "", "/"); vi.useRealTimers(); });
describe("room service browser entry", () => {
  it("cancels an unanswered read after twenty seconds without retrying", () => {
    vi.useFakeTimers(); let detail: any;
    const listener = vi.fn((event: Event) => { event.preventDefault(); detail = (event as CustomEvent).detail; });
    window.addEventListener(OPEN, listener);
    setup(); fireEvent.click(screen.getByRole("button", { name: "Open selected room" }));
    act(() => vi.advanceTimersByTime(20000));
    expect(detail.signal.aborted).toBe(true); expect(listener).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toContain("timed out");
    window.removeEventListener(OPEN, listener);
  });
  it("preserves exact selection in sign-in and performs no room request before the click", () => {
    const listener = vi.fn(); window.addEventListener(OPEN, listener);
    setup();
    expect(listener).not.toHaveBeenCalled();
    const href = screen.getByRole("link", { name: "Sign in with Auth0" }).getAttribute("href")!;
    expect(new URL(href, "https://rooms.example").searchParams.get("return_to")).toBe(`/desktop?service_room=${encodeURIComponent(id)}`);
    fireEvent.click(screen.getByRole("button", { name: "Open selected room" }));
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toMatchObject({ roomId: id, refresh: true });
    expect(screen.getByRole("status").textContent).toContain("Sign in with your room account");
    window.removeEventListener(OPEN, listener);
  });
  it.each(["account", "dismiss", "unmount"])("cancels stale navigation on %s", reason => {
    let detail: any;
    const listener = (event: Event) => { event.preventDefault(); detail = (event as CustomEvent).detail; };
    window.addEventListener(OPEN, listener);
    const view = setup(); fireEvent.click(screen.getByRole("button", { name: "Open selected room" }));
    if (reason === "account") act(() => { window.dispatchEvent(new Event(ACCOUNT)); });
    if (reason === "dismiss") fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    if (reason === "unmount") view.unmount();
    expect(detail.signal.aborted).toBe(true);
    act(() => detail.onResult(true));
    expect(screen.queryByText(/Room opened/)).toBeNull();
    window.removeEventListener(OPEN, listener);
  });
  it("reports a denied exact-room read and allows an explicit retry", () => {
    const listener = (event: Event) => { event.preventDefault(); (event as CustomEvent).detail.onResult(false); };
    window.addEventListener(OPEN, listener);
    setup(); fireEvent.click(screen.getByRole("button", { name: "Open selected room" }));
    expect(screen.getByRole("status").textContent).toContain("could not open the requested room");
    expect((screen.getByRole("button", { name: "Open selected room" }) as HTMLButtonElement).disabled).toBe(false);
    window.removeEventListener(OPEN, listener);
  });
  it("does not render on a normal workspace, malformed selector or native host", () => {
    const view = render(<RoomServiceEntry />); expect(screen.queryByRole("region")).toBeNull(); view.unmount();
    window.history.replaceState({}, "", "/desktop?service_room=bad");
    const invalid = render(<RoomServiceEntry />); expect(screen.queryByRole("region")).toBeNull(); invalid.unmount();
    Object.defineProperty(window, "casimirDesktop", { configurable: true, value: {} });
    setup(); expect(screen.queryByRole("region")).toBeNull();
  });
});
