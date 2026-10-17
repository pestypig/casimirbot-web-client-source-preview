// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DurableTaskPairing from "../DurableTaskPairing";
import { HELIX_WORKSTATION_GUIDANCE_EVENT, clearPendingWorkstationGuidance } from "@/lib/workstation/workstationGuidance";

const props = { profileId: "profile:owner", chatId: "chat:exact", environment: { roomId: "room:exact", runId: "run:exact" } };
const destination = { registrationId: "registration:exact", expiresAt: "2026-09-09T12:00:00.000Z",
  destinationDigest: "a".repeat(64),
  proofBasis: "authenticated_client_declaration", currentPresence: false, pairingAuthority: false, executionAuthority: false,
  destination: { issuer: "issuer:exact", profileId: props.profileId, installationId: "installation:exact", clientId: "client:exact", taskId: "task:exact" } };
const listed = { ok: true, destinations: [destination], execution_authority: false, answer_authority: false };
const response = (body: unknown) => new Response(JSON.stringify(body));
afterEach(() => { cleanup(); localStorage.clear(); clearPendingWorkstationGuidance(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function selectAndApprove() {
  await screen.findByRole("option", { name: "task:exact · client:exact" });
  fireEvent.change(screen.getByLabelText("Registered AI task"), { target: { value: destination.registrationId } });
  fireEvent.click(screen.getByLabelText(/Include environment run/));
  fireEvent.click(screen.getByLabelText(/I approve pairing/));
}

it("starts a fresh review with private MCP delivery without selecting or approving a task", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response(listed)));
  render(<DurableTaskPairing {...props} />);
  await screen.findByRole("option", { name: "task:exact · client:exact" });
  expect(screen.getByText(/not a list of every Codex chat/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy setup request to Codex" })).toBeTruthy();
  expect((screen.getByLabelText("Invitation delivery") as HTMLSelectElement).value).toBe("private_mcp");
  expect((screen.getByLabelText("Registered AI task") as HTMLSelectElement).value).toBe("");
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
});

it("preserves a saved copy-mode review rather than converting its consent", async () => {
  restoredGrant("pending");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("reasoning-destinations") ? response(listed)
    : new Response("", { status: 503 })));
  render(<DurableTaskPairing {...props} />);
  await screen.findByRole("option", { name: "task:exact · client:exact" });
  expect((screen.getByLabelText("Invitation delivery") as HTMLSelectElement).value).toBe("copy");
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
});

it("shows pairing guidance inline and highlights only when requested", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response(listed)));
  const guidance = vi.fn();
  window.addEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, guidance);
  try {
    const view = render(<DurableTaskPairing {...props} />);
    await screen.findByRole("option", { name: "task:exact · client:exact" });
    expect(guidance).not.toHaveBeenCalled();
    view.unmount();
    render(<DurableTaskPairing {...props} />);
    await screen.findByRole("option", { name: "task:exact · client:exact" });
    expect(guidance).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Highlight pairing step" }));
    expect(guidance).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, guidance);
  }
});

it("defaults a new review of an expired manual pairing to secret-free private MCP delivery", async () => {
  const expired = restoredGrant("expired");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("reasoning-destinations") ? response(listed)
    : response({ ok: true, pairing: expired, runtime_binding_active: false,
      execution_authority: false, answer_authority: false })));
  render(<DurableTaskPairing {...props} />);
  await screen.findByText(/This task connection has expired/);
  expect((screen.getByLabelText("Invitation delivery") as HTMLSelectElement).value).toBe("copy");
  fireEvent.click(screen.getByRole("button", { name: "Review a new invitation" }));
  expect((screen.getByLabelText("Invitation delivery") as HTMLSelectElement).value).toBe("private_mcp");
  const key = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  expect(JSON.parse(localStorage.getItem(`${key}:draft`)!).invitationDelivery).toBe("private_mcp");
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
});

it("explains recovery when a pending manual invitation's one-time secret is unavailable", async () => {
  const pending = { ...restoredGrant("pending"), invitationExpiresAt: "2099-09-08T12:15:00.000Z",
    pairingExpiresAt: "2099-09-08T20:00:00.000Z" };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.endsWith("reasoning-destinations")
    ? listed : { ok: true, pairing: pending, runtime_binding_active: false,
      execution_authority: false, answer_authority: false })));
  render(<DurableTaskPairing {...props} />);
  await screen.findByText(/one-time secret was not recovered/);
  expect(screen.getByRole("button", { name: "Check acceptance" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Revoke pairing" })).toBeTruthy();
});

it("offers a credential-free registration request when no task is listed without selecting or approving", async () => {
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  const fetch = vi.fn(async () => response({ ...listed, destinations: [] }));
  vi.stubGlobal("fetch", fetch);
  render(<DurableTaskPairing {...props} />);
  const button = await screen.findByRole("button", { name: "Copy setup request to Codex" });
  expect(button.getAttribute("data-helix-guidance-target")).toBe("task-pairing-register");
  expect(screen.getByText(/Current checkpoint: Task check-in and registration/)).toBeTruthy();
  fireEvent.click(button);
  await screen.findByText(/Setup request copied/);
  expect(copy).toHaveBeenCalledTimes(1);
  expect(copy.mock.calls[0][0]).toContain("helix_agent_setup_resume_exact_task");
  expect(copy.mock.calls[0][0]).toContain("helix_reasoning_destination_register");
  expect(copy.mock.calls[0][0]).toContain("helix_reasoning_pairing_accept_private");
  expect(copy.mock.calls[0][0]).toContain(`helix-chat:<the exact Helix chat ID above>`);
  expect(copy.mock.calls[0][0]).toContain("pairing_recovery_not_found");
  expect(copy.mock.calls[0][0]).toContain("requires no copied pairing ID or secret");
  expect(copy.mock.calls[0][0]).toContain("An unchanged accepted result is recovery of the old grant");
  expect(copy.mock.calls[0][0]).toContain("stop only when a different pairing ID is accepted with active runtime binding");
  expect(copy.mock.calls[0][0]).toContain("report the exact non-secret connection error");
  expect(copy.mock.calls[0][0]).toContain("owner_review_required");
  expect(copy.mock.calls[0][0]).toContain("keep this task running for up to two minutes");
  expect(copy.mock.calls[0][0]).toContain("Recheck the same idempotent setup tool about every 15 seconds");
  expect(copy.mock.calls[0][0]).toContain("Never create a replacement invitation while waiting");
  expect(copy.mock.calls[0][0]).toContain("not authorized for the tunnel resource");
  expect(copy.mock.calls[0][0]).not.toContain(props.profileId);
  expect(copy.mock.calls[0][0]).toContain(props.chatId);
  expect((screen.getByLabelText("Registered AI task") as HTMLSelectElement).value).toBe("");
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button", { name: "Approve pairing and create invitation" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/If that task reports MCP 404 or 429/)).toBeTruthy();
  expect(screen.getByText(/already-authorized matching Source/)).toBeTruthy();
  expect(fetch.mock.calls.every((call: any[]) => !call[1]?.method || call[1].method === "GET")).toBe(true);
});

it("distinguishes an unavailable task list from a verified empty list and releases read retry", async () => {
  let available = false;
  vi.stubGlobal("fetch", vi.fn(async () => available ? response({ ...listed, destinations: [] })
    : new Response("", { status: 503 })));
  render(<DurableTaskPairing {...props} />);
  await screen.findByText(/Task list could not be verified/);
  expect(screen.queryByText("No task is available to select yet.")).toBeNull();
  await waitFor(() => expect((screen.getByRole("button", { name: "Refresh registered tasks" }) as HTMLButtonElement).disabled).toBe(false));
  available = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh registered tasks" }));
  await screen.findByText("No task is available to select yet.");
  expect(screen.queryByText(/Task list could not be verified/)).toBeNull();
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
});

it("discovers a task that registers after Agent Access opens without selecting or approving it", async () => {
  vi.useFakeTimers();
  let registered = false;
  vi.stubGlobal("fetch", vi.fn(async () => response({ ...listed,
    destinations: registered ? [destination] : [],
  })));
  await act(async () => { render(<DurableTaskPairing {...props} />); });
  expect((screen.getByLabelText("Registered AI task") as HTMLSelectElement).value).toBe("");
  registered = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(screen.getByRole("option", { name: "task:exact · client:exact" })).toBeTruthy();
  expect((screen.getByLabelText("Registered AI task") as HTMLSelectElement).value).toBe("");
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
});

it.each([
  ["pairing_account_link_required", /The account link for this exact task could not be verified/, 403],
  ["pairing_device_identity_mismatch", /This request does not match the installed device/, 403],
  ["pairing_device_trust_required", /Device trust is not current/, 403],
  ["pairing_registration_expired", /This task's registration expired.*Cancel request and review again/, 409],
])("shows fixed authority guidance and retains the same reviewed request after %s", async (code, guidance, status) => {
  const writes: unknown[] = [];
  const onDeviceTrustMismatch = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === "GET") return response(url.includes("/reasoning-invitations/")
      ? { ok: true, pairing: null, execution_authority: false, answer_authority: false } : listed);
    writes.push(JSON.parse(init.body as string));
    return new Response(JSON.stringify({ schema: "helix.reasoning_task_binding_error.v1", ok: false,
      error: code, message: "fixture-private-detail" }), { status });
  }));
  render(<DurableTaskPairing {...props} onDeviceTrustMismatch={onDeviceTrustMismatch} />);
  await selectAndApprove();
  fireEvent.click(screen.getByRole("button", { name: "Approve pairing and create invitation" }));
  await screen.findByText(guidance);
  expect(screen.getByText(/Current checkpoint: The reviewed invitation has not been confirmed/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reconcile invitation" }).getAttribute("data-helix-guidance-target")).toBe("task-pairing-reconcile");
  expect(onDeviceTrustMismatch).toHaveBeenCalledTimes(code === "pairing_device_trust_required" ? 1 : 0);
  expect(screen.queryByText(/fixture-private-detail/)).toBeNull();
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Reconcile invitation" }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(writes[0]);
});

it("shows only a safe diagnostic code when invitation issuance fails unexpectedly", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === "GET") return response(url.includes("/reasoning-invitations/")
      ? { ok: true, pairing: null, execution_authority: false, answer_authority: false } : listed);
    return new Response(JSON.stringify({ error: "private-server-detail" }), { status: 500 });
  }));
  render(<DurableTaskPairing {...props} />);
  await selectAndApprove();
  fireEvent.click(screen.getByRole("button", { name: "Approve pairing and create invitation" }));
  await screen.findByText(/Diagnostic: pairing_http_500/);
  expect(screen.queryByText(/private-server-detail/)).toBeNull();
  expect(screen.getByRole("button", { name: "Reconcile invitation" })).toBeTruthy();
});

it("recovers a delayed exact-request commit with bounded read-only checks, never a second approval", async () => {
  vi.useFakeTimers();
  const key = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  localStorage.setItem(key, JSON.stringify({ requestId: "request:uncertain", registrationId: destination.registrationId,
    chatId: props.chatId, environment: null, invitationSeconds: 900, pairingSeconds: 3600,
    invitationDelivery: "private_mcp" }));
  localStorage.setItem(`${key}:destination`, destination.destinationDigest);
  const pending = { schema: "helix.pairing_status.v1", id: "pairing:delayed", revision: 1,
    destinationDigest: destination.destinationDigest, chatId: props.chatId, environment: null,
    state: "pending", createdAt: "2099-09-08T12:00:00.000Z",
    invitationExpiresAt: "2099-09-08T12:15:00.000Z", pairingExpiresAt: "2099-09-08T13:00:00.000Z",
    acceptedAt: null, revokedAt: null, executionAuthority: false, answerAuthority: false };
  let reads = 0;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === "POST") throw new Error("Background recovery must never submit owner approval");
    if (url.endsWith("reasoning-destinations")) return response(listed);
    if (url.includes("/reasoning-invitations/")) return response({ ok: true,
      pairing: ++reads === 1 ? null : pending, execution_authority: false, answer_authority: false });
    return response({ ok: true, pairing: pending, runtime_binding_active: false,
      execution_authority: false, answer_authority: false });
  });
  vi.stubGlobal("fetch", fetch);
  await act(async () => { render(<DurableTaskPairing {...props} />); });
  expect(reads).toBe(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(reads).toBe(2);
  expect(screen.getByText(/Pairing: pending\. Current task availability/)).toBeTruthy();
  expect(localStorage.getItem(`${key}:pairing`)).toBe(pending.id);
  expect(fetch.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
});

it("O4 preserves selected run when presence-derived props disappear and requires explicit approval", async () => {
  const fetch = vi.fn().mockImplementation(async () => response(listed)); vi.stubGlobal("fetch", fetch);
  const view = render(<DurableTaskPairing {...props} />);
  await screen.findByRole("option", { name: "task:exact · client:exact" });
  expect((screen.getByRole("button", { name: "Approve pairing and create invitation" }) as HTMLButtonElement).disabled).toBe(true);
  await selectAndApprove();
  view.rerender(<DurableTaskPairing {...props} environment={null} />);
  expect((screen.getByLabelText(/Include environment run/) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("button", { name: "Approve pairing and create invitation" }) as HTMLButtonElement).disabled).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("recovers a refreshed registration for the same exact task without carrying approval", async () => {
  const storageKey = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  localStorage.setItem(`${storageKey}:draft`, JSON.stringify({
    requestId: "request:stale",
    registrationId: "registration:stale",
    chatId: props.chatId,
    environment: null,
    invitationSeconds: 900,
    pairingSeconds: 28800,
  }));
  localStorage.setItem(`${storageKey}:destination`, destination.destinationDigest);
  vi.stubGlobal("fetch", vi.fn(async () => response(listed)));

  render(<DurableTaskPairing {...props} />);

  await waitFor(() => expect((screen.getByLabelText("Registered AI task") as HTMLSelectElement).value)
    .toBe(destination.registrationId));
  expect(screen.getByText(/same authenticated AI task refreshed its registration/i)).toBeTruthy();
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText(/check the pairing approval box/i)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Approve pairing and create invitation" }) as HTMLButtonElement).disabled)
    .toBe(true);
});

it("selects a newer same-task registration while the old proof is still listed, without carrying approval", async () => {
  const newer = { ...destination, registrationId: "registration:renewed",
    expiresAt: "2026-09-09T13:00:00.000Z" };
  let destinations = [destination];
  vi.stubGlobal("fetch", vi.fn(async () => response({ ...listed, destinations })));
  render(<DurableTaskPairing {...props} />);
  await selectAndApprove();
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(true);

  destinations = [newer, destination];
  fireEvent.click(screen.getByRole("button", { name: "Refresh registered tasks" }));
  await waitFor(() => expect((screen.getByLabelText("Registered AI task") as HTMLSelectElement).value)
    .toBe(newer.registrationId));
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText(/Include environment run/) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText("Invitation delivery") as HTMLSelectElement).value).toBe("private_mcp");
  expect((screen.getByRole("button", { name: "Approve pairing and create invitation" }) as HTMLButtonElement).disabled)
    .toBe(true);
});

it("keeps polling when a saved registration is stale and highlights the manual refresh", async () => {
  vi.useFakeTimers();
  const storageKey = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  localStorage.setItem(`${storageKey}:draft`, JSON.stringify({
    requestId: "request:stale",
    registrationId: "registration:stale",
    chatId: props.chatId,
    environment: null,
    invitationSeconds: 900,
    pairingSeconds: 28800,
  }));
  localStorage.setItem(`${storageKey}:destination`, destination.destinationDigest);
  let renewed = false;
  vi.stubGlobal("fetch", vi.fn(async () => response({ ...listed, destinations: renewed ? [destination] : [] })));
  await act(async () => { render(<DurableTaskPairing {...props} />); });
  const refresh = screen.getByRole("button", { name: "Refresh registered tasks" });
  expect(refresh.className).toContain("border-cyan-300/50");
  expect(screen.getByText(/Current checkpoint: The selected task registration is no longer current/)).toBeTruthy();
  renewed = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect((screen.getByLabelText("Registered AI task") as HTMLSelectElement).value).toBe(destination.registrationId);
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
});

it("retains an unselected run candidate through idle presence without granting consent or leaking across chats", async () => {
  const fetch = vi.fn(async () => response(listed)); vi.stubGlobal("fetch", fetch);
  const view = render(<DurableTaskPairing {...props} />);
  await screen.findByRole("option", { name: "task:exact · client:exact" });
  view.rerender(<DurableTaskPairing {...props} environment={null} />);
  expect((screen.getByLabelText(/Include environment run/) as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText(/Last verified run; availability is checked again when you approve/)).toBeTruthy();
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  expect(fetch.mock.calls).toHaveLength(1);
  view.rerender(<DurableTaskPairing {...props} chatId="chat:other" environment={null} />);
  expect(screen.queryByLabelText(/Include environment run/)).toBeNull();
  view.rerender(<DurableTaskPairing {...props} />);
  view.rerender(<DurableTaskPairing {...props} profileId="profile:other" environment={null} />);
  expect(screen.queryByLabelText(/Include environment run/)).toBeNull();
});

it("O4 reload reconciles an uncertain write with identical scope and never persists an invitation secret", async () => {
  const writes: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === "GET") return response(_url.includes("/reasoning-invitations/")
      ? { ok: true, pairing: null, execution_authority: false, answer_authority: false } : listed);
    writes.push(JSON.parse(init.body as string)); throw new Error("lost response");
  }));
  const view = render(<DurableTaskPairing {...props} />);
  await selectAndApprove();
  fireEvent.click(screen.getByRole("button", { name: "Approve pairing and create invitation" }));
  await screen.findByRole("alert");
  view.unmount(); render(<DurableTaskPairing {...props} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Reconcile invitation" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Reconcile invitation" }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]).toMatchObject({ environment: props.environment, registrationId: destination.registrationId });
  expect(localStorage.getItem(localStorage.key(0)!)).not.toContain("secret");
});

it("O4 account changes cannot reuse a previous owner's reviewed destination", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response(listed)));
  const view = render(<DurableTaskPairing {...props} />);
  await selectAndApprove();
  view.rerender(<DurableTaskPairing {...props} profileId="profile:other" />);
  await waitFor(() => expect(screen.queryByRole("option", { name: "task:exact · client:exact" })).toBeNull());
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button", { name: "Approve pairing and create invitation" }) as HTMLButtonElement).disabled).toBe(true);
});

it("O4 cancels an expired-run request before releasing a new unchecked review, including a lost cancellation reply", async () => {
  const issued: any[] = [], cancelled: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/reasoning-destinations")) return response(listed);
    if (url.endsWith("/cancel")) {
      const id = decodeURIComponent(url.split("/").at(-2)!); cancelled.push(id);
      if (cancelled.length === 1) throw new Error("fixture-cancellation-reply-lost");
      return response({ ok: true, cancelled: true, request_id: id, pairing: null, execution_authority: false, answer_authority: false });
    }
    if (init.method === "POST") {
      issued.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ ok: false, schema: "helix.reasoning_task_binding_error.v1",
        error: "pairing_environment_unavailable" }), { status: 409 });
    }
    return response({ ok: true, pairing: null, execution_authority: false, answer_authority: false });
  }));
  const view = render(<DurableTaskPairing {...props} />);
  await selectAndApprove();
  fireEvent.click(screen.getByRole("button", { name: "Approve pairing and create invitation" }));
  await screen.findByText(/The selected run is no longer available/);
  fireEvent.click(screen.getByRole("button", { name: "Cancel request and review again" }));
  await screen.findByText(/The request could not be confirmed/);
  expect((screen.getByLabelText("Registered AI task") as HTMLSelectElement).disabled).toBe(true);
  view.unmount(); render(<DurableTaskPairing {...props} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Cancel request and review again" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Cancel request and review again" }));
  await screen.findByText(/The previous request is cancelled/);
  expect(cancelled).toEqual([issued[0].requestId, issued[0].requestId]);
  expect(issued).toHaveLength(1);
  expect((screen.getByLabelText("Registered AI task") as HTMLSelectElement).disabled).toBe(false);
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText(/Include environment run/) as HTMLInputElement).checked).toBe(false);
  const key = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  expect(localStorage.getItem(key)).toBeNull();
  expect(JSON.parse(localStorage.getItem(`${key}:draft`)!).requestId).not.toBe(issued[0].requestId);
});

it("releases a cancelled review when the reply is lost but the exact server row is revoked", async () => {
  const pending = restoredGrant("pending");
  const revoked = { ...pending, state: "revoked", revision: pending.revision + 1,
    revokedAt: "2026-09-08T12:03:00.000Z" };
  let current: typeof pending | typeof revoked = pending;
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith("/reasoning-destinations")) return response(listed);
    if (url.endsWith("/cancel")) { current = revoked; throw new Error("fixture-lost-cancel-reply"); }
    if (url.includes("/reasoning-invitations/")) return response({ ok: true, pairing: current,
      execution_authority: false, answer_authority: false });
    return response({ ok: true, pairing: current, runtime_binding_active: false,
      execution_authority: false, answer_authority: false });
  });
  vi.stubGlobal("fetch", fetch);
  render(<DurableTaskPairing {...props} />);
  await screen.findByText(/Pairing: pending/);
  fireEvent.click(screen.getByRole("button", { name: "Cancel request and review again" }));
  await screen.findByText(/The previous request is cancelled/);
  expect((screen.getByLabelText("Registered AI task") as HTMLSelectElement).disabled).toBe(false);
  expect((screen.getByLabelText("Invitation delivery") as HTMLSelectElement).value).toBe("private_mcp");
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});

it.each(["account", "chat"])("O4 a late cancellation reply cannot reset another %s review", async kind => {
  let finish!: (response: Response) => void, requestId = "";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/reasoning-destinations")) return response(listed);
    if (url.endsWith("/cancel")) return new Promise<Response>(resolve => { finish = resolve; });
    if (init.method === "POST") { requestId = JSON.parse(init.body as string).requestId; throw new Error("fixture-lost-reply"); }
    return response({ ok: true, pairing: null, execution_authority: false, answer_authority: false });
  }));
  const view = render(<DurableTaskPairing {...props} />);
  await selectAndApprove();
  fireEvent.click(screen.getByRole("button", { name: "Approve pairing and create invitation" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Cancel request and review again" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  view.rerender(<DurableTaskPairing {...props} {...(kind === "account" ? { profileId: "profile:other" } : { chatId: "chat:other" })} />);
  await act(async () => { finish(response({ ok: true, cancelled: true, request_id: requestId, pairing: null,
    execution_authority: false, answer_authority: false })); });
  expect(screen.queryByText(/The previous request is cancelled/)).toBeNull();
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
});

function restoredGrant(state = "accepted") {
  const key = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  localStorage.setItem(key, JSON.stringify({ requestId: "request:original", registrationId: destination.registrationId,
    chatId: props.chatId, environment: props.environment, invitationSeconds: 900, pairingSeconds: 28800 }));
  localStorage.setItem(`${key}:pairing`, "pairing:exact");
  localStorage.setItem(`${key}:destination`, destination.destinationDigest);
  return { schema: "helix.pairing_status.v1", id: "pairing:exact", revision: 2, chatId: props.chatId,
    destinationDigest: destination.destinationDigest,
    environment: props.environment, state, createdAt: "2026-09-08T12:00:00.000Z",
    invitationExpiresAt: "2026-09-08T12:15:00.000Z", pairingExpiresAt: "2026-09-08T20:00:00.000Z",
    acceptedAt: state === "accepted" ? "2026-09-08T12:01:00.000Z" : null,
    revokedAt: null, executionAuthority: false, answerAuthority: false };
}
it.each(["account", "chat"])("O4/O5 %s switch during absent-invitation reconciliation cannot send the old consent request", async (change) => {
  restoredGrant();
  let finishLookup!: (value: Response) => void;
  let reconcileCount = 0;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("reasoning-destinations")) return response(listed);
    if (url.includes("/reasoning-invitations/")) {
      reconcileCount += 1;
      return new Promise<Response>(resolve => { finishLookup = resolve; });
    }
    if (init.method === "POST") return new Response("", { status: 409 });
    return new Response("", { status: 503 });
  });
  vi.stubGlobal("fetch", fetch);
  const view = render(<DurableTaskPairing {...props} />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Reconcile invitation" }));
  await waitFor(() => expect(reconcileCount).toBe(1));
  view.rerender(<DurableTaskPairing {...props} {...(change === "account" ? { profileId: "profile:other" } : { chatId: "chat:other" })} />);
  await act(async () => { finishLookup(response({ ok: true, pairing: null, execution_authority: false, answer_authority: false })); });
  expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(0);
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
});
it("preserves the previous pairing through a lost replacement reply and reloads the exact reviewed request", async () => {
  const old = restoredGrant();
  const writes: any[] = [];
  let pending: any = null;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("reasoning-destinations")) return response(listed);
    if (url.includes("reasoning-bindings")) return new Response("", { status: 409 });
    if (init.method === "POST") {
      const body = JSON.parse(init.body as string); writes.push(body);
      pending = { ...old, id: "pairing:replacement", revision: 1, acceptedAt: null, state: "pending", replacement: body.replacement };
      throw new Error("fixture-lost-issuance-reply");
    }
    if (url.includes("/reasoning-invitations/")) return response({ ok: true, pairing: pending,
      execution_authority: false, answer_authority: false });
    return response({ ok: true, pairing: url.endsWith(encodeURIComponent(old.id)) ? old : pending,
      runtime_binding_active: null, execution_authority: false, answer_authority: false });
  });
  vi.stubGlobal("fetch", fetch);
  const onRuntimeBinding = vi.fn();
  const view = render(<DurableTaskPairing {...props} onRuntimeBinding={onRuntimeBinding} />);
  await screen.findByRole("button", { name: "Review replacement pairing" });
  await waitFor(() => expect((screen.getByRole("button", { name: "Review replacement pairing" }) as HTMLButtonElement).disabled).toBe(false));
  onRuntimeBinding.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Review replacement pairing" }));
  await screen.findByRole("button", { name: "Return to previous pairing" });
  expect(screen.getByText("Previous pairing: accepted.")).toBeTruthy();
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button", { name: "Approve pairing and create invitation" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText(/I approve pairing/));
  fireEvent.click(screen.getByRole("button", { name: "Approve pairing and create invitation" }));
  await screen.findByRole("alert");
  expect(writes).toHaveLength(1);
  expect(writes[0].replacement).toEqual({ pairingId: old.id, revision: old.revision });
  expect(onRuntimeBinding).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Return to previous pairing" })).toBeNull();
  view.unmount(); render(<DurableTaskPairing {...props} onRuntimeBinding={onRuntimeBinding} />);
  await screen.findByText("Previous pairing: accepted.");
  await waitFor(() => expect((screen.getByRole("button", { name: "Reconcile invitation" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Reconcile invitation" }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(writes[0]);
  expect(screen.getByText("Previous pairing: accepted.")).toBeTruthy();
});

it("can return from an unsubmitted replacement to the same accepted pairing without a write", async () => {
  const old = restoredGrant();
  const fetch = vi.fn(async (url: string) => url.endsWith("reasoning-destinations") ? response(listed)
    : url.includes("reasoning-bindings") ? new Response("", { status: 409 })
    : response({ ok: true, pairing: old, runtime_binding_active: null, execution_authority: false, answer_authority: false }));
  vi.stubGlobal("fetch", fetch);
  render(<DurableTaskPairing {...props} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Review replacement pairing" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Review replacement pairing" }));
  const back = await screen.findByRole("button", { name: "Return to previous pairing" });
  fireEvent.click(back);
  await screen.findByText(/Pairing: accepted/);
  expect(screen.queryByRole("region", { name: "Replacement review" })).toBeNull();
  expect(fetch.mock.calls.every(call => (call as unknown as [string, RequestInit])[1].method === "GET")).toBe(true);
  const key = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  expect(localStorage.getItem(`${key}:pairing`)).toBe(old.id);
  expect(JSON.parse(localStorage.getItem(key)!).replacement).toBeUndefined();
});
it("identifies an expired replacement without presenting the still-accepted previous pairing as expired", async () => {
  const old = restoredGrant();
  const key = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  const originalReview = JSON.parse(localStorage.getItem(key)!);
  const replacementReview = { ...originalReview, requestId: "request:replacement",
    replacement: { pairingId: old.id, revision: old.revision } };
  const expired = { ...old, id: "pairing:replacement", state: "expired", revision: 1,
    acceptedAt: null, replacement: replacementReview.replacement };
  localStorage.setItem(key, JSON.stringify(replacementReview));
  localStorage.setItem(`${key}:pairing`, expired.id);
  localStorage.setItem(`${key}:previous`, JSON.stringify({ review: originalReview, pairing: old }));
  const fetch = vi.fn(async (url: string, init: RequestInit) => url.endsWith("reasoning-destinations") ? response(listed)
    : url.includes("reasoning-bindings") ? new Response("", { status: 409 })
    : response({ ok: true, pairing: url.endsWith(encodeURIComponent(old.id)) ? old : expired,
      runtime_binding_active: false, execution_authority: false, answer_authority: false }));
  vi.stubGlobal("fetch", fetch);
  render(<DurableTaskPairing {...props} />);
  await screen.findByText(/The replacement invitation has expired; the previous pairing is still accepted/);
  expect(screen.getByRole("status").textContent).toContain("Replacement pairing: expired. Previous pairing: accepted.");
  expect(screen.queryByRole("button", { name: "Review a new invitation" })).toBeNull();
  const back = screen.getByRole("button", { name: "Return to previous pairing" });
  expect(back.getAttribute("data-helix-guidance-target")).toBe("task-pairing-restore");
  fireEvent.click(back);
  await screen.findByText(/Pairing: accepted/);
  expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
});
it.each(["expired", "revoked", "superseded"])("offers direct unchecked review when the previous pairing becomes %s", async state => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:02:00Z"));
  const old = restoredGrant();
  let current = old;
  const fetch = vi.fn(async (url: string) => url.endsWith("reasoning-destinations") ? response(listed)
    : url.includes("reasoning-bindings") ? new Response("", { status: 409 })
    : response({ ok: true, pairing: current, runtime_binding_active: null, execution_authority: false, answer_authority: false }));
  vi.stubGlobal("fetch", fetch);
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<DurableTaskPairing {...props} />); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Review replacement pairing" })); });
  fireEvent.click(screen.getByLabelText(/I approve pairing/));
  const key = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  const draft = JSON.parse(localStorage.getItem(`${key}:draft`)!);
  current = { ...old, state, revision: 3 };
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect((screen.getByRole("button", { name: "Approve pairing and create invitation" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Review a new invitation" })); });
  expect(screen.queryByLabelText("Replacement review")).toBeNull();
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  const next = JSON.parse(localStorage.getItem(`${key}:draft`)!);
  expect(next).toMatchObject({ registrationId: draft.registrationId, chatId: draft.chatId,
    environment: draft.environment, invitationSeconds: draft.invitationSeconds, pairingSeconds: draft.pairingSeconds });
  expect(next.requestId).not.toBe(draft.requestId);
  expect(next.replacement).toBeUndefined();
  expect(localStorage.getItem(`${key}:previous`)).toBeNull();
  expect(localStorage.getItem(key)).toBeNull();
  expect(fetch.mock.calls.every(call => (call as unknown as [string, RequestInit])[1].method === "GET")).toBe(true);
  view.unmount();
  await act(async () => { render(<DurableTaskPairing {...props} />); });
  expect(screen.queryByLabelText("Replacement review")).toBeNull();
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
});

it.each(["unavailable", "scope-mismatch", "accepted"])("retains replacement review when the explicit expiry check returns %s", async result => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:02:00Z"));
  const old = restoredGrant();
  let current = old;
  let fail = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("reasoning-destinations")) return response(listed);
    if (url.includes("reasoning-bindings")) return new Response("", { status: 409 });
    if (fail) throw new Error("fixture-read-unavailable");
    return response({ ok: true, pairing: current, runtime_binding_active: null, execution_authority: false, answer_authority: false });
  }));
  await act(async () => { render(<DurableTaskPairing {...props} />); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Review replacement pairing" })); });
  current = { ...old, state: "expired", revision: 3 };
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  const recover = screen.getByRole("button", { name: "Review a new invitation" });
  const key = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  const draft = localStorage.getItem(`${key}:draft`);
  if (result === "unavailable") fail = true;
  else current = result === "accepted" ? old : { ...current, chatId: "chat:wrong" };
  await act(async () => { fireEvent.click(recover); });
  expect(localStorage.getItem(`${key}:draft`)).toBe(draft);
  expect(screen.getByLabelText("Replacement review")).toBeTruthy();
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
});

it.each(["pending", "unknown"])("does not discard a %s submitted replacement after the previous grant ends", async state => {
  const old = restoredGrant();
  const key = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  const priorReview = JSON.parse(localStorage.getItem(key)!);
  const review = { ...priorReview, requestId: "request:submitted", replacement: { pairingId: old.id, revision: 2 } };
  localStorage.setItem(key, JSON.stringify(review));
  localStorage.setItem(`${key}:previous`, JSON.stringify({ review: priorReview, pairing: old }));
  localStorage.removeItem(`${key}:pairing`);
  const pending = { ...old, id: "pairing:pending", state: "pending", revision: 1, acceptedAt: null,
    replacement: review.replacement };
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("reasoning-destinations")) return response(listed);
    const value = url.includes("/reasoning-invitations/") || url.endsWith(encodeURIComponent(pending.id))
      ? state === "pending" ? pending : null : { ...old, state: "expired", revision: 3 };
    return response({ ok: true, pairing: value, runtime_binding_active: null, execution_authority: false, answer_authority: false });
  });
  vi.stubGlobal("fetch", fetch);
  render(<DurableTaskPairing {...props} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Reconcile invitation" }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByText("Previous pairing: expired.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Review a new invitation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Return to previous pairing" })).toBeNull();
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(review);
  expect(fetch.mock.calls.every(call => (call as unknown as [string, RequestInit])[1].method === "GET")).toBe(true);
});

it("O4 accepted recovery uses GET even when task registration has expired", async () => {
  const pairing = restoredGrant();
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  const fetch = vi.fn(async (url: string) => url.endsWith("reasoning-destinations")
    ? new Response("", { status: 503 })
    : response({ ok: true, pairing, runtime_binding_active: null, execution_authority: false, answer_authority: false }));
  vi.stubGlobal("fetch", fetch);
  render(<DurableTaskPairing {...props} />);
  expect((await screen.findByRole("status")).textContent).toContain("Pairing: accepted");
  expect(screen.getByRole("heading", { name: "Message Codex pairing accepted" })).toBeTruthy();
  expect(screen.getByText(/No new invitation is needed to recheck this pairing/)).toBeTruthy();
  expect(screen.getByText(/Saved pairing accepted · waiting for this exact task to reconnect/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Copy reconnect request to Codex" }));
  await waitFor(() => expect(copy).toHaveBeenCalledOnce());
  expect(copy.mock.calls[0][0]).toContain("helix_reasoning_pairing_recover_current");
  expect(copy.mock.calls[0][0]).toContain(props.chatId);
  expect(copy.mock.calls[0][0]).not.toContain("Approve pairing and create invitation");
  expect(screen.getByRole("status").textContent).toContain("Runtime binding, task availability, and game permissions are checked separately");
  const reviewDetails = screen.getByText("Review pairing details and replacement options").closest("details");
  expect(reviewDetails?.open).toBe(false);
  expect(fetch.mock.calls).toHaveLength(3);
  expect(fetch.mock.calls.every(call => (call as unknown as [string, RequestInit])[1].method === "GET")).toBe(true);
});
it("recovers an accepted pairing's matching runtime binding on the next poll without owner action", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:02:00Z"));
  const pairing = restoredGrant();
  let bindingAvailable = false;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("reasoning-destinations")) return response(listed);
    if (url.includes("reasoning-bindings/current")) return bindingAvailable
      ? response({ ok: true, binding: restoredRuntimeBinding(pairing) })
      : new Response("", { status: 404 });
    return response({ ok: true, pairing, runtime_binding_active: null,
      execution_authority: false, answer_authority: false });
  });
  vi.stubGlobal("fetch", fetch);
  const onRuntimeBinding = vi.fn();
  await act(async () => { render(<DurableTaskPairing {...props} onRuntimeBinding={onRuntimeBinding} />); });
  expect(screen.getByText(/could not verify the matching runtime binding yet.*pairing_http_404/)).toBeTruthy();
  expect(screen.getByText(/Current checkpoint: Pairing is saved; this exact task must check in through MCP/)).toBeTruthy();
  bindingAvailable = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByText(/Session binding recovered/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Copy reconnect request to Codex" })).toBeNull();
  expect(screen.queryByText(/could not verify the matching runtime binding yet/)).toBeNull();
  expect(onRuntimeBinding).toHaveBeenLastCalledWith(restoredRuntimeBinding(pairing), pairing.id);
  expect(fetch.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
});
it("clears a stale reconcile timeout once the same reviewed invitation is accepted", async () => {
  const pairing = restoredGrant();
  let reads = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("reasoning-destinations")) return response(listed);
    if (url.includes("/reasoning-invitations/")) return response({ ok: true, pairing,
      execution_authority: false, answer_authority: false });
    if (url.includes("/reasoning-pairings/") && reads++ === 0)
      return new Response("", { status: 503 });
    return response({ ok: true, pairing, runtime_binding_active: null,
      execution_authority: false, answer_authority: false });
  }));
  render(<DurableTaskPairing {...props} />);
  await screen.findByText(/The request could not be confirmed/);
  fireEvent.click(screen.getByRole("button", { name: "Reconcile invitation" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Pairing: accepted"));
  await waitFor(() => expect(screen.queryByText(/The request could not be confirmed/)).toBeNull());
});
it.each([{ chatId: "chat:other" }, { destinationDigest: "b".repeat(64) },
  { replacement: { pairingId: "pairing:unreviewed", revision: 2 } }])("O4 rejects restored scope mismatch %j without displaying acceptance", async mismatch => {
  const pairing = { ...restoredGrant(), ...mismatch };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("reasoning-destinations") ? response(listed)
    : response({ ok: true, pairing, runtime_binding_active: null, execution_authority: false, answer_authority: false })));
  render(<DurableTaskPairing {...props} />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("status")).toBeNull();
});
it("renders a superseded pairing and invalidates its cached runtime without requesting consent again", async () => {
  const pairing = { ...restoredGrant(), state: "superseded", revision: 3,
    supersession: { pairingId: "pairing:successor", at: "2026-09-08T12:02:00.000Z" } };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("reasoning-destinations") ? response(listed)
    : response({ ok: true, pairing, runtime_binding_active: false, execution_authority: false, answer_authority: false })));
  const onRuntimeBinding = vi.fn();
  render(<DurableTaskPairing {...props} onRuntimeBinding={onRuntimeBinding} />);
  expect((await screen.findByRole("status")).textContent).toContain("Pairing: superseded");
  expect(onRuntimeBinding).toHaveBeenCalledWith(null, pairing.id);
  expect(screen.getByRole("button", { name: "Review a new invitation" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Approve pairing and create invitation" })).toBeNull();
});
it("O4 refreshes pending status without another write and releases new review only after server expiry", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:14:58.000Z"));
  const pairing = restoredGrant("pending");
  let expired = false;
  const fetch = vi.fn(async (url: string) => url.endsWith("reasoning-destinations") ? response(listed)
    : response({ ok: true, pairing: { ...pairing, state: expired ? "expired" : "pending" },
      runtime_binding_active: false, execution_authority: false, answer_authority: false }));
  vi.stubGlobal("fetch", fetch);
  const onRuntimeBinding = vi.fn();
  await act(async () => { render(<DurableTaskPairing {...props} onRuntimeBinding={onRuntimeBinding} />); });
  expect(screen.queryByRole("button", { name: "Review a new invitation" })).toBeNull();
  expired = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByRole("status").textContent).toContain("Pairing: expired");
  expect(onRuntimeBinding).toHaveBeenCalledWith(null, "pairing:exact");
  expect(screen.getByRole("button", { name: "Review a new invitation" })).toBeTruthy();
  expect(fetch.mock.calls.every(call => (call as unknown as [string, RequestInit])[1].method === "GET")).toBe(true);
});
function restoredRuntimeBinding(pairing: ReturnType<typeof restoredGrant>) {
  return { schema: "helix.reasoning_task_binding.v1", reasoning_binding_id: "binding:current",
    pairing_id: pairing.id, binding_epoch: 2, status: "active", service_instance_ref: "service:current",
    authenticated_profile_ref: props.profileId, authenticated_mcp_client_ref: "client:exact",
    client_session_ref: "session:current", provider_thread_ref_hash: "a".repeat(64), helix_conversation_id: props.chatId,
    mission_id: null, run_id: props.environment.runId, reasoning_role: "principal", continuation_transport: "unavailable",
    negotiated_observability_level: "tool_activity_only", created_by: "signed_in_operator",
    created_at: pairing.createdAt, expires_at: pairing.pairingExpiresAt, claimed_at: pairing.createdAt, revoked_at: null,
    provider_thread_content_included: false, hidden_reasoning_included: false, execution_authority: false,
    evidence_authority: false, answer_authority: false, terminal_eligible: false };
}
it("keeps replacement review editable during polling and runs an explicit refresh once after that read", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:02:00Z"));
  const old = restoredGrant();
  let pendingRead = false;
  let finishRead!: (value: Response) => void;
  let listings = 0;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("reasoning-destinations")) { listings += 1; return response(listed); }
    if (url.includes("reasoning-bindings")) return response({ ok: true, binding: restoredRuntimeBinding(old) });
    if (pendingRead) return new Promise<Response>(resolve => { finishRead = resolve; });
    return response({ ok: true, pairing: old, runtime_binding_active: null, execution_authority: false, answer_authority: false });
  });
  vi.stubGlobal("fetch", fetch);
  await act(async () => { render(<DurableTaskPairing {...props} />); });
  expect(screen.getByText(/picker shows the registration used by the accepted pairing/)).toBeTruthy();
  expect((screen.getByLabelText("Registered AI task") as HTMLSelectElement).disabled).toBe(true);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Review replacement pairing" })); });
  expect(screen.queryByText(/picker shows the registration used by the accepted pairing/)).toBeNull();
  pendingRead = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(finishRead).toBeTypeOf("function");
  for (const label of ["Registered AI task", "Pairing duration", /Include environment run/, /I approve pairing/]) {
    expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(false);
  }
  fireEvent.change(screen.getByLabelText("Pairing duration"), { target: { value: "3600" } });
  fireEvent.click(screen.getByLabelText(/I approve pairing/));
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Refresh registered tasks" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh registered tasks" }));
  expect(listings).toBe(1);
  await act(async () => { pendingRead = false; finishRead(response({ ok: true, pairing: old,
    runtime_binding_active: null, execution_authority: false, answer_authority: false })); });
  expect(listings).toBe(2);
  expect((screen.getByLabelText("Pairing duration") as HTMLSelectElement).value).toBe("3600");
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(true);
  expect(fetch.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
});

it("executes one explicit fixture revocation after an outstanding poll without replaying it", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:02:00Z"));
  const old = restoredGrant();
  let pendingRead = false;
  let finishRead!: (value: Response) => void;
  let writes = 0;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("reasoning-destinations")) return response(listed);
    if (url.includes("reasoning-bindings")) return response({ ok: true, binding: restoredRuntimeBinding(old) });
    if (init.method === "POST") {
      writes += 1;
      return response({ ok: true, pairing: { ...old, state: "revoked", revision: 3, revokedAt: new Date().toISOString() },
        runtime_binding_active: false, execution_authority: false, answer_authority: false });
    }
    if (pendingRead) return new Promise<Response>(resolve => { finishRead = resolve; });
    return response({ ok: true, pairing: old, runtime_binding_active: null, execution_authority: false, answer_authority: false });
  });
  vi.stubGlobal("fetch", fetch);
  await act(async () => { render(<DurableTaskPairing {...props} />); });
  pendingRead = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  const revoke = screen.getByRole("button", { name: "Revoke pairing" });
  expect((revoke as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(revoke); fireEvent.click(revoke);
  expect(writes).toBe(0);
  await act(async () => { pendingRead = false; finishRead(response({ ok: true, pairing: old,
    runtime_binding_active: null, execution_authority: false, answer_authority: false })); });
  expect(writes).toBe(1);
  expect(screen.getByRole("status").textContent).toContain("Pairing: revoked");
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(writes).toBe(1);
});

it.each(["account", "chat"])("drops a foreground request waiting for a poll after a %s switch", async change => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:02:00Z"));
  const old = restoredGrant();
  let pendingRead = false;
  let finishRead!: (value: Response) => void;
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("reasoning-destinations")) return response(listed);
    if (url.includes("reasoning-bindings")) return response({ ok: true, binding: restoredRuntimeBinding(old) });
    if (pendingRead) return new Promise<Response>(resolve => { finishRead = resolve; });
    return response({ ok: true, pairing: old, runtime_binding_active: null, execution_authority: false, answer_authority: false });
  });
  vi.stubGlobal("fetch", fetch);
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<DurableTaskPairing {...props} />); });
  pendingRead = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  // Isolated fixture only: this tests the UI's queued explicit operation, not production consent.
  fireEvent.click(screen.getByRole("button", { name: "Revoke pairing" }));
  await act(async () => { view.rerender(<DurableTaskPairing {...props}
    {...(change === "account" ? { profileId: "profile:other" } : { chatId: "chat:other" })} />); });
  await act(async () => { pendingRead = false; finishRead(response({ ok: true, pairing: old,
    runtime_binding_active: null, execution_authority: false, answer_authority: false })); });
  expect(fetch.mock.calls.every(call => (call as unknown as [string, RequestInit])[1].method === "GET")).toBe(true);
});

it("offers the new run for explicit review without changing a submitted request or inheriting consent", async () => {
  const old = restoredGrant();
  const nextEnvironment = { roomId: props.environment.roomId, runId: "run:new-finite" };
  const fetch = vi.fn(async (url: string) => url.endsWith("reasoning-destinations") ? response(listed)
    : url.includes("reasoning-bindings") ? response({ ok: true, binding: restoredRuntimeBinding(old) })
    : response({ ok: true, pairing: old, runtime_binding_active: null, execution_authority: false, answer_authority: false }));
  vi.stubGlobal("fetch", fetch);
  render(<DurableTaskPairing {...props} environment={nextEnvironment} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Review replacement pairing" }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByRole("button", { name: /Review current environment run/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Review replacement pairing" }));
  const reviewNewRun = await screen.findByRole("button", { name: /Review current environment run run:new-finite/ });
  fireEvent.click(screen.getByLabelText(/I approve pairing/));
  fireEvent.click(reviewNewRun);
  expect((screen.getByLabelText(/Include environment run run:new-finite/) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText("Previous pairing: accepted.")).toBeTruthy();
  expect(fetch.mock.calls.every(call => (call as unknown as [string, RequestInit])[1].method === "GET")).toBe(true);
  const key = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  expect(JSON.parse(localStorage.getItem(`${key}:draft`)!).environment).toBeNull();
  expect(JSON.parse(localStorage.getItem(`${key}:previous`)!).review.environment).toEqual(props.environment);
});
it("O4/O5 clears a previously published runtime when its fresh projection no longer matches", async () => {
  const pairing = restoredGrant();
  const binding = restoredRuntimeBinding(pairing);
  let current = binding;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.endsWith("reasoning-destinations") ? listed
    : url.includes("reasoning-bindings/current") ? { ok: true, binding: current }
    : { ok: true, pairing, runtime_binding_active: null, execution_authority: false, answer_authority: false })));
  const onRuntimeBinding = vi.fn();
  render(<DurableTaskPairing {...props} onRuntimeBinding={onRuntimeBinding} />);
  await waitFor(() => expect(onRuntimeBinding).toHaveBeenLastCalledWith(binding, pairing.id));
  current = { ...binding, pairing_id: "pairing:different" };
  fireEvent.click(screen.getByRole("button", { name: "Check acceptance" }));
  await screen.findByText(/could not verify the matching runtime binding yet.*pairing_runtime_binding_mismatch/);
  expect(onRuntimeBinding).toHaveBeenLastCalledWith(null, pairing.id);
  expect(screen.getByRole("status").textContent).toContain("Pairing: accepted");
});
it.each([
  ["account", "failure"], ["chat", "failure"],
  ["account", "success"], ["chat", "success"],
])("O4/O5 late runtime %s switch response (%s) cannot change the new selection", async (change, outcome) => {
  const pairing = restoredGrant();
  let finishRuntime!: (value: Response) => void;
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("reasoning-destinations")) return response(listed);
    if (url.includes("reasoning-bindings/current")) return new Promise<Response>(resolve => { finishRuntime = resolve; });
    return response({ ok: true, pairing, runtime_binding_active: null, execution_authority: false, answer_authority: false });
  });
  vi.stubGlobal("fetch", fetch);
  const onRuntimeBinding = vi.fn();
  const view = render(<DurableTaskPairing {...props} onRuntimeBinding={onRuntimeBinding} />);
  await waitFor(() => expect(finishRuntime).toBeTypeOf("function"));
  view.rerender(<DurableTaskPairing {...props} onRuntimeBinding={onRuntimeBinding}
    {...(change === "account" ? { profileId: "profile:other" } : { chatId: "chat:other" })} />);
  await act(async () => { finishRuntime(outcome === "success"
    ? response({ ok: true, binding: restoredRuntimeBinding(pairing) })
    : new Response("", { status: 409 })); });
  expect(onRuntimeBinding).not.toHaveBeenCalled();
  expect(screen.queryByText(/could not verify the matching runtime binding yet/)).toBeNull();
  expect(screen.queryByText(/Session binding recovered/)).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  expect(fetch.mock.calls.every(call => (call as unknown as [string, RequestInit])[1].method === "GET")).toBe(true);
});
it("O4/O5 initial recovery retains a typed storage blocker even when registration lookup also fails", async () => {
  restoredGrant();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("reasoning-destinations")
    ? new Response("", { status: 503 })
    : new Response(JSON.stringify({ schema: "helix.reasoning_task_binding_error.v1", ok: false,
      error: "pairing_storage_unreadable", message: "fixture-private-diagnostic" }), { status: 503 })));
  render(<DurableTaskPairing {...props} />);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("could not be opened");
  expect(alert.textContent).not.toContain("fixture-private-diagnostic");
  expect(screen.queryByRole("button", { name: "Approve pairing and create invitation" })).toBeNull();
});


it("offers explicit private pickup and copies only a secret-free exact-task request", async () => {
  const pairing = { ...restoredGrant("pending"), createdAt: new Date().toISOString(),
    invitationExpiresAt: new Date(Date.now() + 900000).toISOString(), pairingExpiresAt: new Date(Date.now() + 28800000).toISOString() };
  localStorage.clear();
  const clipboard = vi.fn(async (_text: string) => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
  const writes: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("reasoning-destinations")) return response(listed);
    if (init.method === "POST") writes.push(JSON.parse(init.body as string));
    if (url.endsWith("reasoning-invitations")) return response({ ok: true, pairing,
      invitation: null, privatePickup: true, execution_authority: false, answer_authority: false });
    return response({ ok: true, pairing, runtime_binding_active: null, execution_authority: false, answer_authority: false });
  }));
  render(<DurableTaskPairing {...props} />);
  await selectAndApprove();
  fireEvent.change(screen.getByLabelText("Invitation delivery"), { target: { value: "private_mcp" } });
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByLabelText(/I approve pairing/));
  fireEvent.click(screen.getByRole("button", { name: "Approve pairing and create invitation" }));
  await screen.findByText("Owner approval recorded. Ask the same task to continue setup.");
  expect(writes[0].invitationDelivery).toBe("private_mcp");
  expect(screen.queryByRole("button", { name: "Copy invitation" })).toBeNull();
  const acceptanceButton = screen.getByRole("button", { name: "Copy continue request to Codex" });
  expect(acceptanceButton.getAttribute("data-helix-guidance-target")).toBe("task-pairing-handoff");
  expect(screen.getByText(/Current checkpoint: Owner invitation is pending/)).toBeTruthy();
  fireEvent.click(acceptanceButton);
  await screen.findByText(/Continue request copied. Paste it into the selected Codex chat/);
  expect(clipboard).toHaveBeenCalledOnce();
  expect(clipboard.mock.calls[0][0]).toContain("helix_agent_setup_resume_exact_task");
  expect(clipboard.mock.calls[0][0]).toContain(props.chatId);
  expect(clipboard.mock.calls[0][0]).not.toContain(pairing.id);
  fireEvent.click(screen.getByRole("button", { name: "Copy request for older MCP tools" }));
  await screen.findByText(/Compatibility request copied/);
  expect(clipboard).toHaveBeenCalledTimes(2);
  expect(clipboard.mock.calls[1][0]).toContain("helix_reasoning_pairing_accept_private");
  expect(clipboard.mock.calls[1][0]).toContain(pairing.id);
  expect(clipboard.mock.calls[1][0]).not.toContain("invitation secret:");
  expect(localStorage.getItem(`helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`)).not.toContain('"secret"');
});

it("retains a selectable secret-free private pickup request when clipboard access fails", async () => {
  const pairing = { ...restoredGrant("pending"),
    invitationExpiresAt: new Date(Date.now() + 900000).toISOString(),
    pairingExpiresAt: new Date(Date.now() + 3600000).toISOString() };
  const key = `helix.pairing.review.v1:${JSON.stringify([props.profileId, props.chatId])}`;
  localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), invitationDelivery: "private_mcp" }));
  Object.defineProperty(navigator, "clipboard", { configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("clipboard_unavailable")) } });
  const fetch = vi.fn(async (url: string) => url.endsWith("reasoning-destinations") ? response(listed)
    : response({ ok: true, pairing, runtime_binding_active: null, execution_authority: false, answer_authority: false }));
  vi.stubGlobal("fetch", fetch);
  render(<DurableTaskPairing {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "Copy continue request to Codex" }));
  await screen.findByText(/Copy failed/);
  const fallback = screen.getByLabelText("Secret-free continue request");
  expect(fallback.textContent).toContain("helix_agent_setup_resume_exact_task");
  expect(fallback.textContent).toContain(props.chatId);
  expect(fallback.textContent).not.toContain(pairing.id);
  expect(fallback.textContent).not.toContain(destination.destinationDigest);
  expect(fetch.mock.calls.every((call: any[]) => !call[1]?.method || call[1].method === "GET")).toBe(true);
  expect(screen.queryByRole("button", { name: "Copy invitation" })).toBeNull();
});

it("requires fresh approval for automatic delivery and keeps delivery distinct from acceptance", async () => {
  const pairing = { ...restoredGrant("pending"), createdAt: new Date().toISOString(),
    invitationExpiresAt: new Date(Date.now() + 900000).toISOString(), pairingExpiresAt: new Date(Date.now() + 28800000).toISOString() };
  localStorage.clear();
  const writes: Array<{ url: string; body: any }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("reasoning-destinations")) return response({ ...listed, automatic_delivery_available: true });
    if (init.method === "POST") writes.push({ url, body: JSON.parse(init.body as string) });
    if (url.endsWith("reasoning-invitations")) return response({ ok: true, pairing,
      invitation: { id: pairing.id, secret: "a".repeat(43) }, execution_authority: false, answer_authority: false });
    if (url.includes("reasoning-deliveries/")) return response({ ok: true, execution_authority: false, answer_authority: false,
      delivery: { schema: "helix.pairing_delivery.v1", id: "delivery:fixture", pairingId: pairing.id,
        destinationDigest: pairing.destinationDigest, revision: 3, state: "delivered", providerMessageId: "message:fixture",
        createdAt: pairing.createdAt, updatedAt: pairing.createdAt } });
    return response({ ok: true, pairing, runtime_binding_active: null, execution_authority: false, answer_authority: false });
  }));
  render(<DurableTaskPairing {...props} />);
  await selectAndApprove();
  fireEvent.change(screen.getByLabelText("Invitation delivery"), { target: { value: "automatic" } });
  expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByLabelText(/I approve pairing/));
  fireEvent.click(screen.getByRole("button", { name: "Approve pairing and create invitation" }));
  await screen.findByText("Invitation delivered. Waiting for authenticated task acceptance.");
  expect(writes).toHaveLength(2);
  expect(writes[0].body.invitationDelivery).toBe("automatic");
  expect(writes[1].body).toEqual({});
  expect(screen.getByText(/Pairing: pending/).getAttribute("role")).toBe("status");
});


it.each([["account", "issuance"], ["chat", "issuance"], ["account", "delivery"], ["chat", "delivery"]])(
  "ignores late automatic %s switch response during %s", async (change, phase) => {
    const pairing = { ...restoredGrant("pending"), createdAt: new Date().toISOString(),
      invitationExpiresAt: new Date(Date.now() + 900000).toISOString(), pairingExpiresAt: new Date(Date.now() + 28800000).toISOString() };
    localStorage.clear();
    let finish!: (value: Response) => void;
    let lateBody: unknown;
    const writes: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("reasoning-destinations")) return response({ ...listed, automatic_delivery_available: true });
      if (init.method === "POST") writes.push(url);
      const issuance = url.endsWith("reasoning-invitations");
      const body = issuance ? { ok: true, pairing, invitation: { id: pairing.id, secret: "a".repeat(43) },
        execution_authority: false, answer_authority: false }
        : { ok: true, execution_authority: false, answer_authority: false,
          delivery: { schema: "helix.pairing_delivery.v1", id: "delivery:fixture", pairingId: pairing.id,
            destinationDigest: pairing.destinationDigest, revision: 3, state: "delivered", providerMessageId: "message:fixture",
            createdAt: pairing.createdAt, updatedAt: pairing.createdAt } };
      if ((phase === "issuance" && issuance) || (phase === "delivery" && url.includes("reasoning-deliveries/"))) {
        lateBody = body; return new Promise<Response>(resolve => { finish = resolve; });
      }
      return response(body);
    }));
    const onRuntimeBinding = vi.fn();
    const view = render(<DurableTaskPairing {...props} onRuntimeBinding={onRuntimeBinding} />);
    await selectAndApprove();
    fireEvent.change(screen.getByLabelText("Invitation delivery"), { target: { value: "automatic" } });
    fireEvent.click(screen.getByLabelText(/I approve pairing/));
    fireEvent.click(screen.getByRole("button", { name: "Approve pairing and create invitation" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    const before = writes.length;
    view.rerender(<DurableTaskPairing {...props} onRuntimeBinding={onRuntimeBinding}
      {...(change === "account" ? { profileId: "profile:other" } : { chatId: "chat:other" })} />);
    await act(async () => { finish(response(lateBody)); });
    expect(writes).toHaveLength(before);
    expect(writes.filter(url => url.includes("reasoning-deliveries/"))).toHaveLength(phase === "delivery" ? 1 : 0);
    expect(screen.queryByText(/Invitation delivered/)).toBeNull();
    expect(screen.queryByText(/Pairing: pending/)).toBeNull();
    expect((screen.getByLabelText(/I approve pairing/) as HTMLInputElement).checked).toBe(false);
    expect(onRuntimeBinding).not.toHaveBeenCalled();
  });
