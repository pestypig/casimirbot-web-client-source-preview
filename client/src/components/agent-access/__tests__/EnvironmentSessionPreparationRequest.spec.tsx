// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import EnvironmentSessionPreparationRequest from "../EnvironmentSessionPreparationRequest";
const { listRooms } = vi.hoisted(() => ({ listRooms: vi.fn() }));
vi.mock("../../helix/ask-console/shared-live-room/SharedLiveRoomApi", () => ({
  helixSharedLiveRoomApi: { listRooms },
}));
const props = { profileRef: "profile:a", serviceInstanceRef: "service:a", clientSessionRef: "session:a", continuationRef: "task:a", chatId: "chat:a" };
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.restoreAllMocks(); });
it("requires explicit selection for multiple rooms and sends only a setup request", async () => {
  listRooms.mockResolvedValue([{ room_id: "room:a", title: "A", status: "open" },
    { room_id: "room:b", title: "B", status: "open" }, { room_id: "room:closed", title: "Closed", status: "closed" }]);
  const fetcher = vi.fn().mockResolvedValue({ status: 202, json: async () => ({ ok: true,
    intent: { status: "pending" }, execution_authority: false, task_binding_authority: false }) });
  vi.stubGlobal("fetch", fetcher);
  render(<EnvironmentSessionPreparationRequest {...props} />);
  await screen.findByRole("option", { name: "A · room:a" });
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("option", { name: /Closed/ })).toBeNull();
  fireEvent.change(screen.getByLabelText("Preparation room"), { target: { value: "room:b" } });
  fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("button", { name: "Check preparation" });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ request_id: expect.any(String),
    client_session_ref: "session:a", client_continuation_ref: "task:a", helix_conversation_id: "chat:a",
    room_id: "room:b", requested_duration_seconds: 3600 });
  expect(screen.getByRole("status").textContent).toContain("does not wake an idle task");
});
it("retries uncertain delivery with the same request ID and never treats an authority response as success", async () => {
  listRooms.mockResolvedValue([{ room_id: "room:a", title: "A", status: "open" }]);
  const fetcher = vi.fn().mockResolvedValue({ status: 202, json: async () => ({ ok: true,
    intent: { status: "pending" }, execution_authority: true, task_binding_authority: false }) });
  vi.stubGlobal("fetch", fetcher);
  render(<EnvironmentSessionPreparationRequest {...props} />);
  await waitFor(() => expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("not confirmed"));
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[0][1].body).request_id).toBe(JSON.parse(fetcher.mock.calls[1][1].body).request_id);
  expect(screen.queryByRole("button", { name: "Check preparation" })).toBeNull();
});
it("aborts delivery when the exact target component is replaced", async () => {
  listRooms.mockResolvedValue([{ room_id: "room:a", title: "A", status: "open" }]);
  const fetcher = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<EnvironmentSessionPreparationRequest key="a" {...props} />);
  await waitFor(() => expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button"));
  view.rerender(<EnvironmentSessionPreparationRequest key="b" {...props} continuationRef="task:b" />);
  expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
});
it("retains uncertain delivery identity across panel remounts but isolates service epochs", async () => {
  listRooms.mockResolvedValue([{ room_id: "room:a", title: "A", status: "open" }]);
  const fetcher = vi.fn().mockRejectedValue(new Error("transport lost"));
  vi.stubGlobal("fetch", fetcher);
  for (const serviceInstanceRef of ["service:a", "service:a", "service:b"]) {
    const view = render(<EnvironmentSessionPreparationRequest {...props} serviceInstanceRef={serviceInstanceRef} />);
    await waitFor(() => expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("not confirmed"));
    view.unmount();
  }
  const ids = fetcher.mock.calls.map(call => JSON.parse(call[1].body).request_id);
  expect(ids[0]).toBe(ids[1]);
  expect(ids[2]).not.toBe(ids[0]);
});
it("does not deliver when retry identity cannot be retained", async () => {
  listRooms.mockResolvedValue([{ room_id: "room:a", title: "A", status: "open" }]);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<EnvironmentSessionPreparationRequest {...props} />);
  await waitFor(() => expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("status").textContent).toContain("was not sent");
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires server-confirmed expiry and an explicit replacement, retaining an uncertain replacement ID", async () => {
  listRooms.mockResolvedValue([{ room_id: "room:a", title: "A", status: "open" }]);
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ status: 202, json: async () => ({ ok: true, intent: { status: "pending",
      expiresAt: new Date(Date.now() - 1000).toISOString() }, execution_authority: false, task_binding_authority: false }) })
    .mockResolvedValueOnce({ status: 409, json: async () => ({ ok: false, error: "preparation_intent_expired" }) })
    .mockRejectedValue(new Error("delivery unknown"));
  vi.stubGlobal("fetch", fetcher);
  render(<EnvironmentSessionPreparationRequest {...props} />);
  await waitFor(() => expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("button", { name: "Check preparation" });
  expect(screen.queryByRole("button", { name: "Request preparation again" })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Check preparation" }));
  fireEvent.click(await screen.findByRole("button", { name: "Request preparation again" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("not confirmed"));
  fireEvent.click(screen.getByRole("button", { name: "Ready up this room" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  const ids = fetcher.mock.calls.map(call => JSON.parse(call[1].body).request_id);
  expect(ids[0]).toBe(ids[1]); expect(ids[2]).not.toBe(ids[0]); expect(ids[3]).toBe(ids[2]);
});
it("distinguishes expired task presence from expired request without offering replacement", async () => {
  listRooms.mockResolvedValue([{ room_id: "room:a", title: "A", status: "open" }]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 409,
    json: async () => ({ ok: false, error: "preparation_target_unavailable" }) }));
  render(<EnvironmentSessionPreparationRequest {...props} />);
  await waitFor(() => expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("presence is unavailable"));
  expect(screen.queryByRole("button", { name: "Request preparation again" })).toBeNull();
});
