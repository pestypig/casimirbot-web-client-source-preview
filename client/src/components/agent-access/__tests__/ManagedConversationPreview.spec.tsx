// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManagedConversationPreview } from "../ManagedConversationPreview";
import { ManagedConversationControllerContext, useManagedConversation } from "../useManagedConversation";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { HELIX_LIVE_CONNECTION_CHANGED_EVENT } from "../LiveConnectionEvents";
import { HELIX_MANAGED_VOICE_REPLY_COMPLETED_EVENT } from "@/lib/helix/managed-voice-reply";

afterEach(() => { cleanup(); delete window.casimirDesktop; });
describe("private managed conversation preview", () => {
  it("offers only a completed voice-origin answer for spoken playback", async () => {
    const invoke = vi.fn(async (request: { action: string; prompt?: string; turn_id?: string }) =>
      request.action === "conversation_send"
        ? { ok: true, code: "conversation_ready", conversation: { active: true, messages: [
          { role: "user", text: request.prompt, turnId: request.turn_id },
          { role: "assistant", text: "Verified reply", turnId: request.turn_id },
        ] } }
        : { ok: true, code: "conversation_ready", conversation: { active: false, messages: [] } });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    let controller!: ReturnType<typeof useManagedConversation>;
    function Harness() { controller = useManagedConversation({ configured: true }); return null; }
    const replies: Array<{ clientEventRef: string; text: string }> = [];
    const listener = (event: Event) => replies.push((event as CustomEvent).detail);
    window.addEventListener(HELIX_MANAGED_VOICE_REPLY_COMPLETED_EVENT, listener);
    try {
      render(<Harness />);
      act(() => expect(controller.sendVoiceTranscript("Hello", "gpt-live:session:one:event:one")).toBe(true));
      await waitFor(() => expect(replies).toEqual([{
        clientEventRef: "gpt-live:session:one:event:one",
        turnId: expect.stringMatching(/^managed-turn:/), text: "Verified reply",
      }]));
    } finally { window.removeEventListener(HELIX_MANAGED_VOICE_REPLY_COMPLETED_EVENT, listener); }
  });
  it("reinspects after first developer-policy hydration without a manual recheck", async () => {
    const invoke = vi.fn(async (request: { action: string }) => request.action === "inspect"
      ? { ok: true, code: "saved", state: { configured: true, source: "saved" } }
      : { ok: true, code: "conversation_ready", conversation: { active: false, messages: [] } });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    render(<ManagedConversationPreview />);
    act(() => window.dispatchEvent(new CustomEvent(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, { detail: {
      account_profile_changed: false, account_profile_identity_known: true,
      account_policy: { account_type: "developer" },
    } })));
    await waitFor(() => expect(screen.getByLabelText("Message to private agent")).not.toBeDisabled());
    expect(screen.queryByText(/Account changed; recheck connection/)).toBeNull();
    expect(invoke.mock.calls.filter(([request]) => request.action === "inspect").length).toBeGreaterThanOrEqual(2);
  });
  it("reinspects an unchanged website account on hydration instead of falsely reporting an account switch", async () => {
    const invoke = vi.fn(async (request: { action: string }) => request.action === "inspect"
      ? { ok: true, code: "saved", state: { configured: true, source: "saved" } }
      : { ok: true, code: "conversation_ready", conversation: { active: false, messages: [] } });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    render(<ManagedConversationPreview />);
    act(() => window.dispatchEvent(new CustomEvent(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, { detail: {
      account_profile_changed: false, account_profile_identity_known: true,
      account_policy: { account_type: "standard" },
    } })));
    await waitFor(() => expect(screen.getByLabelText("Message to private agent")).not.toBeDisabled());
    expect(screen.queryByText(/Account changed; recheck connection/)).toBeNull();
    expect(invoke.mock.calls.filter(([request]) => request.action === "inspect").length).toBeGreaterThanOrEqual(2);
  });
  it("rechecks a newly saved key without remounting the Console owner", async () => {
    let configured = false;
    const invoke = vi.fn(async (request: { action: string }) => request.action === "inspect"
      ? { ok: true, code: "saved", state: { configured, source: configured ? "saved" : "none" } }
      : { ok: true, code: "conversation_ready", conversation: { active: false, messages: [] } });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    render(<ManagedConversationPreview />);
    await waitFor(() => expect(screen.getByLabelText("Message to private agent")).toBeDisabled());
    configured = true;
    act(() => window.dispatchEvent(new Event(HELIX_LIVE_CONNECTION_CHANGED_EVENT)));
    await waitFor(() => expect(screen.getByLabelText("Message to private agent")).not.toBeDisabled());
    expect(screen.getByText(/Saved key for this profile/)).toBeInTheDocument();
  });
  it("shows a first and follow-up turn only from native attributed replies", async () => {
    let count = 0;
    const invoke = vi.fn(async (request: { action: string; prompt?: string }) => {
      if (request.action === "conversation_inspect") return { ok: true, code: "conversation_ready", conversation: { active: false, messages: [] } };
      count++;
      return { ok: true, code: "conversation_ready", conversation: { active: true, messages: [
        { role: "user", text: request.prompt }, { role: "assistant", text: `Answer ${count}`,
          publicContextMcpTools: ["casimir_moral_graph_reflect"] },
      ] } };
    });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    render(<ManagedConversationPreview configured />);
    await screen.findByText(/OpenAI project owning the configured key/);
    expect(screen.getByText(/provider session can retain earlier context/)).toBeTruthy();
    expect(screen.getByText(/restart, which does not confirm provider-session deletion/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Message to private agent"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    await screen.findByText(/Answer 1/);
    expect(screen.getByRole("note", { name: "Public context MCP calls" })).toHaveTextContent("casimir_moral_graph_reflect");
    fireEvent.change(screen.getByLabelText("Message to private agent"), { target: { value: "Follow-up" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    await screen.findByText(/Answer 2/);
    expect(invoke.mock.calls.filter(([request]) => request.action === "conversation_send").map(([request]) => request.prompt))
      .toEqual(["First", "Follow-up"]);
    expect(invoke.mock.calls.every(([request]) => !Object.keys(request).includes("key"))).toBe(true);
  });
  it("does not clear a newer controlled draft when an earlier paid turn completes", async () => {
    let release!: (value: unknown) => void;
    const invoke = vi.fn((request: { action: string }) => request.action === "conversation_inspect"
      ? Promise.resolve({ ok: true, code: "conversation_ready", conversation: { active: false, messages: [] } })
      : new Promise(resolve => { release = resolve; }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    function Harness() {
      const [draft, setDraft] = React.useState("First draft");
      return <><ManagedConversationPreview configured retainedDraft={draft} onRetainedDraftChange={setDraft} />
        <button type="button" onClick={() => setDraft("Different channel draft")}>Replace draft</button></>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace draft" }));
    await act(async () => release({ ok: true, code: "conversation_ready", conversation: {
      active: true, messages: [{ role: "assistant", text: "Answer" }],
    } }));
    expect((screen.getByLabelText("Message to private agent") as HTMLTextAreaElement).value).toBe("Different channel draft");
  });
  it("removes stale conversation history after an uncertain follow-up", async () => {
    let active = false;
    let sends = 0;
    const invoke = vi.fn(async (request: { action: string; prompt?: string }) => {
      if (request.action === "conversation_inspect") return { ok: true, code: "conversation_ready",
        conversation: { active, messages: active ? [
          { role: "user", text: "First" }, { role: "assistant", text: "First answer" },
        ] : [] } };
      if (request.action === "conversation_send") {
        sends++;
        if (sends === 1) { active = true; return { ok: true, code: "conversation_ready",
          conversation: { active: true, messages: [
            { role: "user", text: "First" }, { role: "assistant", text: "First answer" },
          ] } }; }
        active = false;
        return { ok: false, code: "conversation_incomplete" };
      }
      throw new Error("Unexpected native call");
    });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    render(<ManagedConversationPreview configured />);
    fireEvent.change(screen.getByLabelText("Message to private agent"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    await screen.findByText(/First answer/);
    fireEvent.change(screen.getByLabelText("Message to private agent"), { target: { value: "Follow-up" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    await screen.findByText(/earlier context will not carry over/);
    expect(screen.queryByText(/First answer/)).toBeNull();
    expect(screen.getByText("No messages yet.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Start new conversation" }) as HTMLButtonElement).disabled).toBe(true);
    expect(invoke.mock.calls.filter(([request]) => request.action === "conversation_inspect")).toHaveLength(2);
  });
  it("shows a rejected launcher key as an authentication failure after the first turn", async () => {
    const invoke = vi.fn(async (request: { action: string }) => request.action === "conversation_send"
      ? { ok: false, code: "authentication_failed" }
      : { ok: true, code: "conversation_ready", conversation: { active: false, messages: [] } });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    render(<ManagedConversationPreview configured source="launcher" />);
    await screen.findByText(/Key supplied by this launcher/);
    fireEvent.change(screen.getByLabelText("Message to private agent"), { target: { value: "Private probe" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    await screen.findByText(/OpenAI rejected the current key/);
    expect(screen.queryByText(/could not continue/)).toBeNull();
    expect(screen.getByText("No messages yet.")).toBeTruthy();
    expect(invoke.mock.calls.filter(([request]) => request.action === "conversation_send")).toHaveLength(1);
  });
  it("shows only a bounded diagnostic for an unverified provider turn", async () => {
    const invoke = vi.fn(async (request: { action: string }) => request.action === "conversation_send"
      ? { ok: false, code: "conversation_incomplete", diagnostic: "provider_terminal_event" }
      : { ok: true, code: "conversation_ready", conversation: { active: false, messages: [] } });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    render(<ManagedConversationPreview configured />);
    fireEvent.change(screen.getByLabelText("Message to private agent"), { target: { value: "Private prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    await screen.findByText(/provider ended the turn without a verified answer/);
    expect(screen.getByText("No messages yet.")).toBeTruthy();
  });
  it("clears draft and reply when the account changes during a pending turn", async () => {
    let release!: (value: unknown) => void;
    const invoke = vi.fn((request: { action: string }) => request.action === "conversation_inspect"
      ? Promise.resolve({ ok: true, code: "conversation_ready", conversation: { active: false, messages: [] } })
      : request.action === "conversation_stop" ? Promise.resolve({ ok: true, code: "conversation_stopped" })
      : new Promise(resolve => { release = resolve; }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    render(<ManagedConversationPreview configured />);
    await screen.findByText(/OpenAI project owning the configured key/);
    fireEvent.change(screen.getByLabelText("Message to private agent"), { target: { value: "Private prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    fireEvent(window, new CustomEvent(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, { detail: {
      account_profile_changed: true, account_profile_identity_known: true,
      account_policy: { account_type: "developer" },
    } }));
    const send = invoke.mock.calls.find(([request]) => request.action === "conversation_send")?.[0] as { turn_id?: string };
    expect(invoke).toHaveBeenCalledWith({ action: "conversation_stop", turn_id: send.turn_id });
    release({ ok: true, code: "conversation_ready", conversation: { active: true, messages: [
      { role: "assistant", text: "Late private reply" },
    ] } });
    await waitFor(() => expect((screen.getByLabelText("Message to private agent") as HTMLTextAreaElement).value).toBe(""));
    expect(screen.queryByText(/Late private reply/)).toBeNull();
    expect((screen.getByLabelText("Message to private agent") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Send private message" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Account changed; recheck connection/)).toBeTruthy();
    expect(invoke.mock.calls.filter(([request]) => request.action === "conversation_send")).toHaveLength(1);
  });
  it("sends Stop for the same turn and ignores a late managed answer", async () => {
    let release!: (value: unknown) => void;
    const invoke = vi.fn((request: { action: string; turn_id?: string }) => {
      if (request.action === "conversation_inspect") return Promise.resolve({ ok: true, code: "conversation_ready",
        conversation: { active: false, messages: [] } });
      if (request.action === "conversation_stop") return Promise.resolve({ ok: true, code: "conversation_stopped",
        cleanupConfirmed: true });
      return new Promise(resolve => { release = resolve; });
    });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    render(<ManagedConversationPreview configured />);
    await screen.findByText(/OpenAI project owning the configured key/);
    fireEvent.change(screen.getByLabelText("Message to private agent"), { target: { value: "Prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop managed turn" }));
    await screen.findByText(/Managed turn stopped/);
    const send = invoke.mock.calls.find(([request]) => request.action === "conversation_send")?.[0];
    const stop = invoke.mock.calls.find(([request]) => request.action === "conversation_stop")?.[0];
    expect(stop?.turn_id).toBe(send?.turn_id);
    await act(async () => { release({ ok: true, code: "conversation_ready", conversation: { active: true,
      messages: [{ role: "assistant", text: "Late answer" }] } }); });
    expect(screen.queryByText(/Late answer/)).toBeNull();
  });
  it("stops a pending turn when the preview closes", async () => {
    const invoke = vi.fn((request: { action: string }) => request.action === "conversation_inspect"
      ? Promise.resolve({ ok: true, code: "conversation_ready", conversation: { active: false, messages: [] } })
      : request.action === "conversation_stop" ? Promise.resolve({ ok: true, code: "conversation_stopped" })
        : new Promise(() => undefined));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    const rendered = render(<ManagedConversationPreview configured />);
    await screen.findByText(/OpenAI project owning the configured key/);
    fireEvent.change(screen.getByLabelText("Message to private agent"), { target: { value: "Prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    const send = invoke.mock.calls.find(([request]) => request.action === "conversation_send")?.[0] as { turn_id?: string };
    rendered.unmount();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith({ action: "conversation_stop", turn_id: send.turn_id }));
  });
  it("keeps one Console-owned turn when its preview closes", async () => {
    const invoke = vi.fn((request: { action: string }) => request.action === "conversation_inspect"
      ? Promise.resolve({ ok: true, code: "conversation_ready", conversation: { active: false, messages: [] } })
      : request.action === "conversation_stop" ? Promise.resolve({ ok: true, code: "conversation_stopped" })
        : new Promise(() => undefined));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
    function Harness() {
      const conversation = useManagedConversation({ configured: true });
      const [open, setOpen] = React.useState(true);
      return <ManagedConversationControllerContext.Provider value={conversation}>
        <button type="button" onClick={() => setOpen(false)}>Close preview</button>
        {open ? <ManagedConversationPreview /> : null}
      </ManagedConversationControllerContext.Provider>;
    }
    const rendered = render(<Harness />);
    await screen.findByText(/Closing this view keeps the Console-owned turn running/);
    fireEvent.change(screen.getByLabelText("Message to private agent"), { target: { value: "Prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(invoke.mock.calls.filter(([request]) => request.action === "conversation_inspect")).toHaveLength(1);
    expect(invoke.mock.calls.filter(([request]) => request.action === "conversation_stop")).toHaveLength(0);
    const send = invoke.mock.calls.find(([request]) => request.action === "conversation_send")?.[0] as { turn_id?: string };
    rendered.unmount();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith({ action: "conversation_stop", turn_id: send.turn_id }));
  });
});
