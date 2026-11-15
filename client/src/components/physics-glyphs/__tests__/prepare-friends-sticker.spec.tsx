// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrepareFriendsSticker } from "../PrepareFriendsSticker";
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/components/workstation/friends-parties/FriendBoardApi", () => ({ boardRequest: api.request }));
beforeEach(() => { api.request.mockReset(); });
afterEach(cleanup);
describe("preparing a sticker before leaving its connected workspace", () => {
  it("finalizes the exact verified generation without sending a friend message", async () => {
    api.request.mockResolvedValueOnce({ candidate: { phase: "verified", generation_id: "generation-a", request_id: "request-a" } }).mockResolvedValueOnce({ latest: {} });
    render(<PrepareFriendsSticker profileKey="alice" revision={1} />);
    expect(api.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Prepare Friends sticker" }));
    expect(await screen.findByText(/Sticker prepared\./)).toBeTruthy();
    expect(api.request.mock.calls).toEqual([["/local-candidate"], ["/finalize-local", { generation_id: "generation-a", request_id: "request-a" }]]);
  });
  it.each([null, { phase: "pending", generation_id: "pending" }, { phase: "failed", request_id: "failed" }])("does not finalize an incomplete candidate %j", async candidate => {
    api.request.mockResolvedValue({ candidate });
    render(<PrepareFriendsSticker profileKey="alice" revision={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare Friends sticker" }));
    expect(await screen.findByText(/Complete a new Physics Glyph composition/)).toBeTruthy();
    expect(api.request).toHaveBeenCalledTimes(1);
  });
  it("keeps failed live scene verification unprepared and gives a recovery action", async () => {
    api.request.mockResolvedValueOnce({ candidate: { phase: "verified", generation_id: "a", request_id: "a" } }).mockRejectedValueOnce(new Error("disconnected"));
    render(<PrepareFriendsSticker profileKey="alice" revision={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare Friends sticker" }));
    expect(await screen.findByText(/final scene could not be verified/)).toBeTruthy();
    expect(screen.queryByText(/Sticker prepared\./)).toBeNull();
  });
  it.each(["profile", "scene"])("does not finalize a late candidate after the %s changes", async change => {
    let resolve!: (value: unknown) => void;
    api.request.mockImplementation(() => new Promise(r => { resolve = r; }));
    const view = render(<PrepareFriendsSticker profileKey="alice" revision={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare Friends sticker" }));
    view.rerender(<PrepareFriendsSticker profileKey={change === "profile" ? "bob" : "alice"} revision={change === "scene" ? 2 : 1} />);
    await act(async () => resolve({ candidate: { phase: "verified", generation_id: "a", request_id: "a" } }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Sticker prepared\./)).toBeNull();
  });
});
