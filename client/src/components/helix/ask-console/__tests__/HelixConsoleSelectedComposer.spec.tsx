// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelixConsoleSelectedComposer } from "../HelixConsoleSelectedComposer";
import type { HelixConsoleChannel } from "../HelixConsoleConversationWorkspace";
import type { HelixAskLegacyComposerSurfaceProps } from "../HelixAskLegacyComposerSurface";
import type { LocalRoomTextOwnerSnapshot } from "../shared-live-room/LocalRoomTextOwnerBridge";
import { cacheAccountCapabilityPolicy, clearCachedAccountCapabilityPolicy } from
  "@/lib/workstation/accountCapabilityPolicy";
import { buildHelixAccountCapabilityPolicy } from "@shared/helix-account-session";

const managed = vi.hoisted(() => ({
  connectionReady: true, busy: false, draft: "API draft", sourceLabel: "Saved key",
  setDraft: vi.fn(), send: vi.fn(), stop: vi.fn(),
}));
const roomSend = vi.fn();
const roomDraft = vi.fn();
vi.mock("@/components/agent-access/useManagedConversation", () => ({
  useSharedManagedConversation: () => managed,
}));
vi.mock("../HelixAskLegacyComposerSurface", () => ({
  HelixAskLegacyComposerSurface: ({ destination, textarea, actionToolbar }: HelixAskLegacyComposerSurfaceProps) =>
    <div data-testid="same-pill-composer">
      {destination}
      <textarea aria-label={textarea.ariaLabel ?? "Ask Helix"} value={textarea.value ?? ""}
        disabled={textarea.disabled} onChange={event => textarea.onInputValue(event.target.value, event.target)}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); textarea.onSubmitRequested(null); } }} />
      <button type="button" disabled={actionToolbar.submitDisabled}
        onClick={actionToolbar.submitViewModel.submitMode === "stop" ? actionToolbar.onStop : actionToolbar.onSubmitIntent}>
        {actionToolbar.submitViewModel.submitAriaLabel}
      </button>
    </div>,
}));

const baseComposer = {
  destination: <span>Private Ask recipient</span>,
  voiceLevelMonitor: {} as HelixAskLegacyComposerSurfaceProps["voiceLevelMonitor"],
  moodAvatar: {} as HelixAskLegacyComposerSurfaceProps["moodAvatar"],
  actionToolbar: { submitViewModel: { submitMode: "submit", submitAriaLabel: "Submit prompt",
    submitTitle: "Submit prompt", submitButtonType: "submit", submitIcon: "search" },
    onSubmitIntent: vi.fn(), onStop: vi.fn() } as unknown as HelixAskLegacyComposerSurfaceProps["actionToolbar"],
  textarea: { className: "", placeholder: "Ask", onInputValue: vi.fn(),
    onSubmitRequested: vi.fn() },
} as HelixAskLegacyComposerSurfaceProps;
const room = { room: { room_id: "room:one", title: "Study room", status: "ready" },
  conversation: { admitted: true, sending: false, draft: "Room draft", send: roomSend,
    updateDraft: roomDraft } } as unknown as LocalRoomTextOwnerSnapshot;

function Fixture() {
  const [selected, setSelected] = useState<HelixConsoleChannel>("private_ask");
  return <>
    <button onClick={() => setSelected("private_ask")}>Select Ask</button>
    <button onClick={() => setSelected("bound_task")}>Select Codex</button>
    <button onClick={() => setSelected("private_api")}>Select API</button>
    <button onClick={() => setSelected("local_room")}>Select room</button>
    <HelixConsoleSelectedComposer composer={baseComposer} selectedChannel={selected} localRoom={room} />
  </>;
}

describe("selected Console composer", () => {
  afterEach(() => { cleanup(); managed.send.mockClear(); managed.stop.mockClear();
    managed.setDraft.mockClear(); roomSend.mockReset(); roomDraft.mockClear();
    vi.mocked(baseComposer.actionToolbar.onSubmitIntent).mockClear();
    clearCachedAccountCapabilityPolicy(); });

  it("keeps one mounted pill while recipient, draft and send route follow the channel", () => {
    render(<Fixture />);
    const pill = screen.getByTestId("same-pill-composer");
    expect(screen.getByText("Private Ask recipient")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select API" }));
    expect(screen.getByTestId("same-pill-composer")).toBe(pill);
    expect(screen.getByRole("textbox", { name: "Message Cloud Agent DM" })).toHaveValue("API draft");
    fireEvent.click(screen.getByRole("button", { name: "Send to Cloud Agent DM" }));
    expect(managed.send).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Select Codex" }));
    expect(screen.getByTestId("same-pill-composer")).toBe(pill);
    expect(screen.getByText("Private Ask recipient")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));
    expect(baseComposer.actionToolbar.onSubmitIntent).toHaveBeenCalledTimes(1);
    expect(managed.send).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Select room" }));
    expect(screen.getByTestId("same-pill-composer")).toBe(pill);
    expect(screen.getByRole("textbox", { name: "Message Party Chat members" })).toHaveValue("Room draft");
    fireEvent.click(screen.getByRole("button", { name: "Send to Party Chat" }));
    expect(roomSend).toHaveBeenCalledTimes(1);
    expect(managed.send).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Select Ask" }));
    expect(screen.getByTestId("same-pill-composer")).toBe(pill);
    expect(screen.getByText("Private Ask recipient")).toBeInTheDocument();
  });

  it("updates only the selected channel's draft", () => {
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "Select API" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message Cloud Agent DM" }),
      { target: { value: "API edit" } });
    expect(managed.setDraft).toHaveBeenCalledWith("API edit");
    expect(roomDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Select room" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message Party Chat members" }),
      { target: { value: "Room edit" } });
    expect(roomDraft).toHaveBeenCalledWith("Room edit");
    expect(managed.setDraft).toHaveBeenCalledTimes(1);
  });

  it("cannot send when room membership is no longer admitted", () => {
    const denied = { ...room, conversation: { ...room.conversation, admitted: false } } as LocalRoomTextOwnerSnapshot;
    render(<HelixConsoleSelectedComposer composer={baseComposer} selectedChannel="local_room" localRoom={denied} />);
    expect(screen.getByRole("textbox", { name: "Message Party Chat members" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send to Party Chat" })).toBeDisabled();
    expect(roomSend).not.toHaveBeenCalled();
  });

  it("posts /agent text as a human message before opening exact-message approval", async () => {
    cacheAccountCapabilityPolicy(buildHelixAccountCapabilityPolicy("developer"), "profile:shortcut-dev");
    const selectAgent = vi.fn();
    const textRoom = { ...room, room: { ...room.room, capacity_profile: "three_human_text" },
      conversation: { ...room.conversation, draft: "/agent Check the current clock" } } as LocalRoomTextOwnerSnapshot;
    roomSend.mockResolvedValueOnce(true);
    render(<HelixConsoleSelectedComposer composer={baseComposer} selectedChannel="local_room"
      localRoom={textRoom} onSelectRoomAgent={selectAgent} />);
    expect(screen.getByText(/No AI call occurs now/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Post for Room Agent review" }));
    expect(roomSend).toHaveBeenCalledWith("Check the current clock");
    await waitFor(() => expect(selectAgent).toHaveBeenCalledWith("local"));
    expect(managed.send).not.toHaveBeenCalled();
  });

  it("keeps an uncertain /agent post in Party Chat without granting AI access", async () => {
    cacheAccountCapabilityPolicy(buildHelixAccountCapabilityPolicy("developer"), "profile:shortcut-dev");
    const selectAgent = vi.fn();
    const textRoom = { ...room, room: { ...room.room, capacity_profile: "three_human_text" },
      conversation: { ...room.conversation, draft: "/agent Check the current clock" } } as LocalRoomTextOwnerSnapshot;
    roomSend.mockResolvedValueOnce(false);
    render(<HelixConsoleSelectedComposer composer={baseComposer} selectedChannel="local_room"
      localRoom={textRoom} onSelectRoomAgent={selectAgent} />);
    fireEvent.click(screen.getByRole("button", { name: "Post for Room Agent review" }));
    await waitFor(() => expect(roomSend).toHaveBeenCalledTimes(1));
    expect(selectAgent).not.toHaveBeenCalled();
  });

  it("does not misroute /agent as ordinary text in an ineligible room", () => {
    const textRoom = { ...room, conversation: { ...room.conversation,
      draft: "/agent Check the current clock" } } as LocalRoomTextOwnerSnapshot;
    render(<HelixConsoleSelectedComposer composer={baseComposer} selectedChannel="local_room"
      localRoom={textRoom} />);
    expect(screen.getByRole("button", { name: "Room Agent unavailable" })).toBeDisabled();
    expect(roomSend).not.toHaveBeenCalled();
  });

  it("keeps Room Agent read-only until an exact Party Chat message is released", () => {
    render(<HelixConsoleSelectedComposer composer={baseComposer}
      selectedChannel="local_room_agent" localRoom={room} />);
    expect(screen.getByRole("textbox", { name: "Room Agent input unavailable" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit prompt" })).toBeDisabled();
    expect(roomSend).not.toHaveBeenCalled();
    expect(managed.send).not.toHaveBeenCalled();
  });

  it("routes an in-flight API stop to its own conversation", () => {
    managed.busy = true;
    try {
      render(<HelixConsoleSelectedComposer composer={baseComposer} selectedChannel="private_api" />);
      fireEvent.click(screen.getByRole("button", { name: "Stop cloud agent response" }));
      expect(managed.stop).toHaveBeenCalledTimes(1);
      expect(roomSend).not.toHaveBeenCalled();
    } finally { managed.busy = false; }
  });
});
