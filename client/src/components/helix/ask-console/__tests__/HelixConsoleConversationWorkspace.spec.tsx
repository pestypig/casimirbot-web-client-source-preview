// @vitest-environment jsdom
import React, { useEffect, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheAccountCapabilityPolicy, clearCachedAccountCapabilityPolicy } from
  "@/lib/workstation/accountCapabilityPolicy";
import { buildHelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import { ManagedConversationPillSurface } from "@/components/agent-access/ManagedConversationPillSurface";
import { LocalRoomPillSurface } from "../shared-live-room/LocalRoomConsoleChannel";
import { HostedRoomPillSurface } from "../shared-live-room/HostedRoomConsoleChannel";
import { UnavailableRoomPillSurface } from "../shared-live-room/UnavailableRoomPillSurface";
import { isHostedRoomTextOwnerAdmitted,
  type HostedRoomTextOwnerSnapshot } from "../shared-live-room/NativeHostedRoomTextOwnerBridge";
import type { LocalRoomTextOwnerSnapshot } from "../shared-live-room/LocalRoomTextOwnerBridge";
import { HelixAskLegacyConsoleView } from "../HelixAskLegacyConsoleView";
import { HelixConsoleConversationWorkspace, type HelixConsoleChannel } from "../HelixConsoleConversationWorkspace";

const { sendManaged } = vi.hoisted(() => ({ sendManaged: vi.fn() }));
const { voiceMount, voiceUnmount } = vi.hoisted(() => ({ voiceMount: vi.fn(), voiceUnmount: vi.fn() }));
const sendRoom = vi.fn();
const unmountOriginalPill = vi.fn();
vi.mock("../shared-live-room/SharedRoomTextReleaseControls", () => ({
  SharedRoomTextReleaseControls: () => <div>Reviewed sharing controls</div>,
}));
vi.mock("../shared-live-room/SharedRoomInterpreterTurnHistory", () => ({
  SharedRoomInterpreterTurnHistory: () => <div>Local shared AI replies</div>,
}));
vi.mock("../shared-live-room/SharedLiveRoomOwnerWorkflow", () => ({
  SharedLiveRoomOwnerWorkflow: () => <div>Exact-task owner review</div>,
}));
vi.mock("../shared-live-room/NativeHostedRoomTaskPanel", () => ({
  NativeHostedRoomTaskPanel: () => <div>Hosted exact-task owner review</div>,
}));
vi.mock("../shared-live-room/NativeSharedRoomReportsPanel", () => ({
  NativeSharedRoomReportsPanel: () => <div>Hosted shared reports</div>,
}));
vi.mock("../shared-live-room/NativeSharedInterpreterReportsPanel", () => ({
  NativeSharedInterpreterReportsPanel: () => <div>Hosted AI reports</div>,
}));
vi.mock("../shared-live-room/NativeHostedRoomTextReleaseControls", () => ({
  NativeHostedRoomTextReleaseControls: () => <div>Hosted author release controls</div>,
}));
vi.mock("../shared-live-room/NativeHostedRoomInterpreterTurnHistory", () => ({
  NativeHostedRoomInterpreterTurnHistory: () => <div>Hosted shared AI replies</div>,
}));
vi.mock("../shared-live-room/NativeHostedRoomInterpreterProposalReview", () => ({
  NativeHostedRoomInterpreterProposalReview: () => <div>Reviewed AI reply to Codex</div>,
}));
vi.mock("../shared-live-room/NativeHostedRoomVoiceChannel", () => ({
  NativeHostedRoomVoiceChannel: () => {
    React.useEffect(() => { voiceMount(); return () => voiceUnmount(); }, []);
    return <div>Hosted human voice channel</div>;
  },
}));
vi.mock("@/components/agent-access/useManagedConversation", () => ({
  useSharedManagedConversation: () => ({ available: true,
    view: { active: true, messages: [{ role: "user", text: "API question" },
      { role: "assistant", text: "API answer" }] },
    message: "Completed private answer.", busy: false, draft: "Next API question",
    setDraft: vi.fn(), connectionReady: true, sourceLabel: "Saved key",
    send: sendManaged, clear: vi.fn(), stop: vi.fn() }),
}));

const frameState = { maxWidthClassName: "max-w-4xl", surfaceBorderClassName: "border-cyan-300/20",
  surfaceTintClassName: "bg-cyan-400/[0.03]", surfaceHaloClassName: "shadow-cyan-950/40",
  isOffline: false, onSubmit: vi.fn(), onPrimeInteraction: vi.fn(),
  settings: <button type="button">Connections</button> };

function OriginalPillProbe() {
  useEffect(() => () => unmountOriginalPill(), []);
  return <div>Original Helix pill</div>;
}

function ConsoleFixture({ apiAvailable = true, localRoom = null, hostedRoom = null,
  boundChatId = "chat:fixture" }: {
  apiAvailable?: boolean; localRoom?: LocalRoomTextOwnerSnapshot | null;
  hostedRoom?: HostedRoomTextOwnerSnapshot | null;
  boundChatId?: string | undefined;
}) {
  const [selected, setSelected] = useState<HelixConsoleChannel>("private_ask");
  const [localRoomView, setLocalRoomView] = useState<"chat" | "mission">("chat");
  const [hostedRoomView, setHostedRoomView] = useState<"chat" | "mission">("chat");
  return <HelixAskLegacyConsoleView layoutVariant="dock"
    surfaceFrameState={frameState} surfaceContent={<OriginalPillProbe />}
    surface={selected === "private_api" ? <ManagedConversationPillSurface frameState={frameState} />
      : selected === "hosted_room" && isHostedRoomTextOwnerAdmitted(hostedRoom)
        ? <HostedRoomPillSurface frameState={frameState} snapshot={hostedRoom} />
      : selected === "local_room" && localRoom ? <LocalRoomPillSurface frameState={frameState} snapshot={localRoom} />
      : selected === "local_room" || selected === "hosted_room"
        ? <UnavailableRoomPillSurface frameState={frameState} onReturnToPrivateAsk={() => setSelected("private_ask")} />
        : undefined}
    errorLine={<span />} debugDrawer={<span />} steeringQueue={<span />}
    turnList={<div>Private Ask answer</div>}
    conversationWorkspace={{ selectedChannel: selected, onSelectChannel: setSelected,
      privateApiAvailable: apiAvailable, localRoom, hostedRoom,
      privateApiBindingConversationId: boundChatId,
      boundTaskMessages: [{ id: "reasoning_steering:fixture", at: "2026-09-29T17:35:20.487Z",
        content: "Read the connector status through MCP." }],
      boundTaskConversationId: boundChatId,
      boundTaskStatus: "Steering queued for exact agent pickup.",
      localRoomView, onSelectLocalRoomView: setLocalRoomView,
      hostedRoomView, onSelectHostedRoomView: setHostedRoomView }} />;
}

describe("Helix Console conversation workspace", () => {
  it("retains separate display preferences without persisting a task identity", () => {
    const view = render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    fireEvent.change(screen.getByLabelText("Display"), { target: { value: "reports" } });
    fireEvent.click(screen.getByRole("button", { name: "# Cloud Agent DM" }));
    expect(screen.getByLabelText("Overlay display")).toHaveValue("all");
    view.unmount();
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    expect(screen.getByLabelText("Display")).toHaveValue("reports");
    expect(localStorage.getItem("helix.conversation-display.v1:codex")).toBe("reports");
  });
  it("uses channel labels instead of duplicate headings and puts pairing/settings first", () => {
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    expect(screen.queryByRole("heading", { name: "Message Codex" })).toBeNull();
    expect(screen.getByLabelText("Exact task pairing")).toHaveTextContent("Task: not verified");
    expect(screen.getByLabelText("Display")).toHaveValue("conversation");
    expect(screen.getByText(/Conversation reader unavailable in this build/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "# Cloud Agent DM" }));
    expect(screen.queryByRole("heading", { name: "Cloud Agent DM" })).toBeNull();
    expect(screen.getByText(/Talk with your cloud agent here.*bounded MCP handoff/)).toBeInTheDocument();
  });

  it("floats Cloud Agent DM with its own source and preserves it across channel switches", async () => {
    const showMessageCloud = vi.fn(async (_frame: unknown) => ({ status: "showing" }));
    const stopMessageCloud = vi.fn(async () => ({ status: "stopped" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), showMessageCloud, stopMessageCloud
    } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Cloud Agent DM" }));
    fireEvent.click(screen.getByRole("button", { name: "Float activity" }));
    await waitFor(() => expect(showMessageCloud).toHaveBeenCalledWith(expect.objectContaining({
      source: "session_activity", helixConversationId: "chat:fixture",
      turns: [expect.objectContaining({ author: "user", lane: "cloud_agent_dm" }),
        expect.objectContaining({ author: "cloud_agent", lane: "cloud_agent_dm" })],
    })));
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    expect(stopMessageCloud).not.toHaveBeenCalled();
    const count = showMessageCloud.mock.calls.length;
    await waitFor(() => expect(showMessageCloud.mock.calls.length).toBeGreaterThanOrEqual(count));
    expect(showMessageCloud.mock.calls.at(-1)?.[0]).toMatchObject({ source: "session_activity" });
  });
  it("opens the combined activity cloud directly from Message Codex", async () => {
    const showMessageCloud = vi.fn(async (_frame: unknown) => ({ status: "showing" }));
    const stopMessageCloud = vi.fn(async () => ({ status: "stopped" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), showMessageCloud, stopMessageCloud
    } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    fireEvent.click(screen.getByRole("button", { name: "Float activity" }));
    await waitFor(() => expect(showMessageCloud).toHaveBeenCalledWith(expect.objectContaining({
      source: "session_activity", helixConversationId: "chat:fixture",
    })));
    expect(stopMessageCloud).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Hide floating activity" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "# Cloud Agent DM" }));
    expect(screen.getAllByRole("button", { name: "Hide floating activity" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "# Ask Helix" }));
    expect(screen.getByRole("button", { name: "Hide floating activity" })).toBeInTheDocument();
  });
  afterEach(() => { cleanup(); clearCachedAccountCapabilityPolicy(); sendManaged.mockClear();
    localStorage.removeItem("helix.conversation-display.v1:codex");
    localStorage.removeItem("helix.conversation-display.v1:cloud_agent_dm");
    sendRoom.mockClear(); unmountOriginalPill.mockClear(); voiceMount.mockClear(); voiceUnmount.mockClear();
    delete window.casimirDesktop; vi.unstubAllGlobals(); });

  it("keeps hosted human voice mounted while switching Party Chat, Mission, and Room Agent", () => {
    cacheAccountCapabilityPolicy(buildHelixAccountCapabilityPolicy("developer"), "profile:hosted-voice-dev");
    const hostedRoom = { room: { room_id: "hosted:voice", title: "Voice room", status: "open",
      capacity_profile: "three_human_text", self_participant_id: "owner",
      participants: [{ participant_id: "owner", display_name: "Owner", role: "owner" }] },
    authority: "https://rooms.test", conversation: { admitted: true, messages: [], draft: "",
      sending: false, error: "", send: sendRoom, updateDraft: vi.fn() } } as unknown as HostedRoomTextOwnerSnapshot;
    render(<ConsoleFixture hostedRoom={hostedRoom} />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Voice room" }));
    expect(screen.getByText("Hosted human voice channel")).toBeVisible();
    expect(voiceMount).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Mission" }));
    expect(screen.getByText("Hosted human voice channel")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "# Room Agent · Voice room" }));
    expect(voiceMount).toHaveBeenCalledTimes(1);
    expect(voiceUnmount).not.toHaveBeenCalled();
    expect(screen.getByText("Reviewed AI reply to Codex")).toBeInTheDocument();
    expect(screen.getByText("Hosted AI reports")).toBeInTheDocument();
  });

  it("shows hosted Room Agent reports to a guest without host task handoff controls", () => {
    cacheAccountCapabilityPolicy(buildHelixAccountCapabilityPolicy("developer"), "profile:hosted-agent-guest");
    const hostedRoom = { room: { room_id: "hosted:guest", title: "Study room", status: "open",
      capacity_profile: "three_human_text", self_participant_id: "guest",
      participants: [{ participant_id: "owner", display_name: "Owner", role: "owner" },
        { participant_id: "guest", display_name: "Guest", role: "participant" }] },
    authority: "https://rooms.test", conversation: { admitted: true, messages: [], draft: "",
      sending: false, error: "", send: sendRoom, updateDraft: vi.fn() } } as unknown as HostedRoomTextOwnerSnapshot;
    render(<ConsoleFixture hostedRoom={hostedRoom} />);
    fireEvent.click(screen.getByRole("button", { name: "# Room Agent · Study room" }));
    expect(screen.getByText("Hosted shared AI replies")).toBeInTheDocument();
    expect(screen.getByText("Hosted AI reports")).toBeInTheDocument();
    expect(screen.queryByText("Reviewed AI reply to Codex")).toBeNull();
  });

  it("shows the selected three-person text room's voice limit without inventing voice presence", () => {
    cacheAccountCapabilityPolicy(buildHelixAccountCapabilityPolicy("developer"), "profile:room-agent-dev");
    const localRoom = { room: { room_id: "room:text", title: "Study room", status: "ready",
      capacity_profile: "three_human_text", self_participant_id: "host",
      participants: [{ participant_id: "host", display_name: "Host", presence: "present" }] },
    conversation: { admitted: true, messages: [], draft: "", sending: false, error: "",
      send: sendRoom, updateDraft: vi.fn() } } as unknown as LocalRoomTextOwnerSnapshot;
    render(<ConsoleFixture localRoom={localRoom} />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Study room" }));
    const voice = screen.getByLabelText("Room voice channel");
    expect(voice).toHaveTextContent("Unavailable in this text room");
    expect(screen.queryByRole("button", { name: "Open voice controls" })).toBeNull();
    expect(screen.queryByText("Local shared AI replies")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "# Room Agent · Study room" }));
    expect(screen.getByText("Local shared AI replies")).toBeInTheDocument();
    expect(screen.getByText("Reviewed sharing controls")).toBeInTheDocument();
  });

  it("does not offer developer Room Agent evaluation to an ordinary room member", () => {
    cacheAccountCapabilityPolicy(buildHelixAccountCapabilityPolicy("user"), "profile:room-agent-member");
    const localRoom = { room: { room_id: "room:text", title: "Study room", status: "ready",
      capacity_profile: "three_human_text", self_participant_id: "member",
      participants: [{ participant_id: "member", display_name: "Member", presence: "present" }] },
    conversation: { admitted: true, messages: [], draft: "", sending: false, error: "",
      send: sendRoom, updateDraft: vi.fn() } } as unknown as LocalRoomTextOwnerSnapshot;
    render(<ConsoleFixture localRoom={localRoom} />);
    expect(screen.getByRole("button", { name: "# Party Chat · Study room" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "# Room Agent · Study room" })).toBeNull();
  });

  it("opens exact-room voice controls for the two-person voice profile", () => {
    const localRoom = { room: { room_id: "room:voice", title: "Voice room", status: "ready",
      capacity_profile: "two_person_voice", self_participant_id: "host",
      participants: [{ participant_id: "host", display_name: "Host", presence: "present" }] },
    conversation: { admitted: true, messages: [], draft: "", sending: false, error: "",
      send: sendRoom, updateDraft: vi.fn() } } as unknown as LocalRoomTextOwnerSnapshot;
    const opened = vi.fn();
    window.addEventListener("helix-shared-live-room-open-dialog", opened);
    try {
      render(<ConsoleFixture localRoom={localRoom} />);
      fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Voice room" }));
      fireEvent.click(screen.getByRole("button", { name: "Open voice controls" }));
      expect(opened).toHaveBeenCalledTimes(1);
      expect((opened.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ roomId: "room:voice", refresh: true });
    } finally {
      window.removeEventListener("helix-shared-live-room-open-dialog", opened);
    }
  });

  it("keeps the original pill owner mounted while a room or API pill is visible", () => {
    const localRoom = { room: { room_id: "room:one", title: "Study room", status: "ready",
      self_participant_id: "host", participants: [{ participant_id: "host", display_name: "Host", presence: "present" }] },
    conversation: { admitted: true, messages: [], draft: "Room draft", sending: false, error: "",
      send: sendRoom, updateDraft: vi.fn() } } as unknown as LocalRoomTextOwnerSnapshot;
    render(<ConsoleFixture localRoom={localRoom} />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Study room" }));
    expect(unmountOriginalPill).not.toHaveBeenCalled();
    expect(screen.getByText("Original Helix pill").closest("[aria-hidden='true']")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "# Cloud Agent DM" }));
    expect(unmountOriginalPill).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "# Ask Helix" }));
    expect(screen.getByText("Original Helix pill").closest("[aria-hidden='true']")).toBeNull();
    expect(unmountOriginalPill).not.toHaveBeenCalled();
  });

  it("switches history and the existing pill position together without sending", () => {
    render(<ConsoleFixture />);
    const workspace = screen.getByRole("region", { name: "Helix Console conversations" });
    expect(workspace).toHaveTextContent("Private Ask answer");
    expect(workspace).not.toHaveTextContent("Original Helix pill");
    expect(screen.getByText("Original Helix pill")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Connections" }).filter(button =>
      button.closest("[aria-hidden='true']") === null)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "# Cloud Agent DM" }));
    expect(workspace).toHaveTextContent("API answer");
    expect(workspace).not.toHaveTextContent("Private Ask answer");
    expect(screen.getByRole("textbox", { name: "Message Cloud Agent DM" })).toHaveValue("Next API question");
    expect(screen.getByText("# Cloud Agent DM").parentElement).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("button", { name: "Connections" }).filter(button =>
      button.closest("[aria-hidden='true']") === null)).toHaveLength(1);
    expect(sendManaged).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "# Ask Helix" }));
    expect(workspace).toHaveTextContent("Private Ask answer");
    expect(screen.getByText("Original Helix pill")).toBeInTheDocument();
  });

  it("routes the API pill submit to the shared managed conversation owner", () => {
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Cloud Agent DM" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(sendManaged).toHaveBeenCalledTimes(1);
  });

  it("shows bound-task steering in its own Console history without labeling it an answer", () => {
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    const history = screen.getByRole("log", { name: "Message Codex history" });
    expect(history).toHaveTextContent("Read the connector status through MCP.");
    expect(history).toHaveTextContent("Steering queued for exact agent pickup.");
    expect(history).not.toHaveTextContent("Private Ask answer");
    expect(screen.getByRole("button", { name: "# Message Codex" })).toHaveAttribute("aria-current", "page");
    expect(sendManaged).not.toHaveBeenCalled();
  });

  it("opens and closes the native Message Codex cloud from the chat header", async () => {
    const showMessageCloud = vi.fn(async () => ({ status: "showing" }));
    const stopMessageCloud = vi.fn(async () => ({ status: "stopped" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), showMessageCloud,
      stopMessageCloud } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    fireEvent.click(screen.getByRole("button", { name: "Float Message Codex reports" }));
    await waitFor(() => expect(showMessageCloud).toHaveBeenCalledWith(expect.objectContaining({
      schema: "helix.message_cloud_frame.v1", helixConversationId: "chat:fixture",
      turns: [expect.objectContaining({ prompt: "Read the connector status through MCP." })],
    })));
    fireEvent.click(screen.getByRole("button", { name: "Hide floating task reports" }));
    await waitFor(() => expect(stopMessageCloud).toHaveBeenCalled());
  });

  it("explains why task reports cannot float before a Helix chat is saved", () => {
    const showMessageCloud = vi.fn(async () => ({ status: "showing" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), showMessageCloud,
      stopMessageCloud: vi.fn(async () => ({ status: "stopped" }))
    } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture boundChatId="" />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    fireEvent.click(screen.getByRole("button", { name: "Float Message Codex reports" }));
    expect(screen.getByText("Open a saved Helix chat before floating its task reports."))
      .toHaveAttribute("role", "status");
    expect(showMessageCloud).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Float Message Codex reports" })).toBeInTheDocument();
  });

  it("keeps the report cloud open while switching Console channels", async () => {
    const showMessageCloud = vi.fn(async () => ({ status: "showing" }));
    const stopMessageCloud = vi.fn(async () => ({ status: "stopped" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), showMessageCloud,
      stopMessageCloud } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    fireEvent.click(screen.getByRole("button", { name: "Float Message Codex reports" }));
    await waitFor(() => expect(showMessageCloud).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "# Ask Helix" }));
    expect(stopMessageCloud).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    expect(screen.getByRole("button", { name: "Hide floating task reports" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide floating task reports" }));
    await waitFor(() => expect(stopMessageCloud).toHaveBeenCalledTimes(1));
  });

  it("restores the cloud button state after the Console remounts", async () => {
    const stopMessageCloud = vi.fn(async () => ({ status: "stopped" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getMessageCloudStatus: vi.fn(async () => ({ visible: true, source: "message_codex",
        helixConversationId: "chat:fixture" })),
      showMessageCloud: vi.fn(async () => ({ status: "showing" })),
      stopMessageCloud } as unknown as NonNullable<Window["casimirDesktop"]>;
    const view = render(<ConsoleFixture />);
    view.unmount();
    expect(stopMessageCloud).not.toHaveBeenCalled();
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    expect(await screen.findByRole("button", { name: "Hide floating task reports" })).toBeInTheDocument();
  });

  it("resumes the exact chat's activity feed when a native cloud outlives the Console", async () => {
    const showMessageCloud = vi.fn(async (_frame: unknown) => ({ status: "showing" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getMessageCloudStatus: vi.fn(async () => ({ visible: true, source: "session_activity",
        helixConversationId: "chat:fixture" })), showMessageCloud,
      stopMessageCloud: vi.fn(async () => ({ status: "stopped" })),
    } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    expect(await screen.findByRole("button", { name: "Hide floating activity" })).toBeInTheDocument();
    await waitFor(() => expect(showMessageCloud).toHaveBeenCalledWith(expect.objectContaining({
      source: "session_activity", helixConversationId: "chat:fixture",
    })));
  });

  it("does not relabel another chat's retained activity as the selected chat", async () => {
    const showMessageCloud = vi.fn(async (_frame: unknown) => ({ status: "showing" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getMessageCloudStatus: vi.fn(async () => ({ visible: true, source: "session_activity",
        helixConversationId: "chat:other" })), showMessageCloud,
      stopMessageCloud: vi.fn(async () => ({ status: "stopped" })),
    } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    expect(await screen.findByRole("button", { name: "Float activity" })).toBeInTheDocument();
    expect(showMessageCloud).not.toHaveBeenCalled();
  });

  it("switches two saved Helix chats without showing the prior task's history or floating cloud", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const chatId = new URL(input, "http://localhost").searchParams.get("helix_conversation_id");
      return new Response(JSON.stringify({ binding: {
        reasoning_binding_id: `binding:${chatId}`, helix_conversation_id: chatId,
        status: "active", continuation_transport: "polling", binding_epoch: 1,
      } }), { status: 200 });
    }));
    const stopMessageCloud = vi.fn(async () => ({ status: "stopped" }));
    const readCodexMirror = vi.fn(async ({ helixConversationId }: { helixConversationId: string }) => ({
      status: "ready", frame: {
        schema: "helix.codex_conversation_cloud_frame.v1",
        taskId: helixConversationId === "chat:first"
          ? "01a03464-1f5e-7f93-bd17-e4ca8a0bec9e" : "01a0eded-a444-7330-9313-fbbbe61285dd",
        turns: [{ id: `turn:${helixConversationId}`, user: `${helixConversationId} only`,
          assistant: "Done", assistantPhase: "final_answer", status: "completed" }],
      },
    }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), readCodexMirror,
      showCodexMirror: vi.fn(async () => ({ status: "showing" })), stopMessageCloud,
      getMessageCloudStatus: vi.fn(async () => ({ visible: true, source: "codex_mirror",
        helixConversationId: "chat:first" })),
    } as unknown as NonNullable<Window["casimirDesktop"]>;
    function TwoChatFixture() {
      const [chatId, setChatId] = useState("chat:first");
      return <HelixConsoleConversationWorkspace selectedChannel="bound_task"
        onSelectChannel={vi.fn()} privateApiAvailable={false} boundTaskConversationId={chatId}
        savedCodexChats={[{ id: "chat:first", title: "First project" },
          { id: "chat:second", title: "Second project" }]}
        onSelectCodexChat={setChatId}><div>Other channel</div></HelixConsoleConversationWorkspace>;
    }
    render(<TwoChatFixture />);
    expect(await screen.findByText("chat:first only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide floating Codex conversation" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Saved Codex chats"), { target: { value: "chat:second" } });
    expect(screen.getByLabelText("Saved Codex chats")).toHaveValue("chat:second");
    expect(screen.queryByText("chat:first only")).toBeNull();
    expect(await screen.findByText("chat:second only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Float Codex conversation" })).toBeInTheDocument();
    expect(stopMessageCloud).toHaveBeenCalled();
    expect(readCodexMirror).toHaveBeenCalledWith({ bindingId: "binding:chat:second",
      helixConversationId: "chat:second" });
  });

  it("treats an expired saved chat as a recovery choice, not an active connected task", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ binding: {
      reasoning_binding_id: "binding:expired", helix_conversation_id: "chat:expired",
      status: "expired", continuation_transport: "unavailable", binding_epoch: 2,
    } }), { status: 200 })));
    render(<HelixConsoleConversationWorkspace selectedChannel="bound_task"
      onSelectChannel={vi.fn()} privateApiAvailable={false} boundTaskConversationId="chat:expired"
      savedCodexChats={[{ id: "chat:expired", title: "Expired project" },
        { id: "chat:other", title: "Other project" }]}
      onSelectCodexChat={vi.fn()}><div /></HelixConsoleConversationWorkspace>);
    expect(await screen.findByText(/This chat's finite Codex pairing expired/)).toBeInTheDocument();
    expect(screen.getByLabelText("Exact task pairing")).toHaveTextContent("Codex task connection: expired");
    expect(screen.getByLabelText("Exact task pairing")).toHaveTextContent("Task: not verified");
  });

  it("reconciles a closed cloud when the main window regains focus", async () => {
    let visible = true;
    const getMessageCloudStatus = vi.fn(async () => ({ visible, source: "message_codex",
      helixConversationId: visible ? "chat:fixture" : null }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), getMessageCloudStatus,
      showMessageCloud: vi.fn(async () => ({ status: "showing" })),
      stopMessageCloud: vi.fn(async () => ({ status: "stopped" }))
    } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    expect(await screen.findByRole("button", { name: "Hide floating task reports" })).toBeInTheDocument();
    visible = false; // The native close event was missed while another app had focus.
    fireEvent.focus(window);
    expect(await screen.findByRole("button", { name: "Float Message Codex reports" })).toBeInTheDocument();
    expect(getMessageCloudStatus).toHaveBeenCalledTimes(2);
  });

  it("opens the exact paired Codex conversation mirror when the native bridge is available", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => new Response(JSON.stringify(
      input.includes("reasoning-bindings/current")
        ? { binding: { reasoning_binding_id: "binding:owner", helix_conversation_id: "chat:fixture",
          status: "active", continuation_transport: "polling", binding_epoch: 3 } }
        : { display_only: true, deliveries: [] }), { status: 200 })));
    const showCodexMirror = vi.fn(async () => ({ status: "showing" }));
    const showMessageCloud = vi.fn(async () => ({ status: "showing" }));
    const stopMessageCloud = vi.fn(async () => ({ status: "stopped" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), showCodexMirror,
      showMessageCloud, stopMessageCloud } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    fireEvent.click(screen.getByRole("button", { name: "Float Codex conversation" }));
    await waitFor(() => expect(showCodexMirror).toHaveBeenCalledWith({
      bindingId: "binding:owner", helixConversationId: "chat:fixture",
    }));
    expect(showMessageCloud).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Hide floating Codex conversation" }));
    await waitFor(() => expect(stopMessageCloud).toHaveBeenCalled());
  });

  it("explains a changed exact-chat pairing when the native mirror denies the read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      binding: { reasoning_binding_id: "binding:owner", helix_conversation_id: "chat:fixture",
        status: "active", continuation_transport: "polling", binding_epoch: 3 },
    }), { status: 200 })));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      showCodexMirror: vi.fn(async () => ({ status: "unavailable",
        code: "codex_mirror_target_reasoning_binding_identity_mismatch" })),
      stopMessageCloud: vi.fn(async () => ({ status: "stopped" }))
    } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    fireEvent.click(screen.getByRole("button", { name: "Float Codex conversation" }));
    expect(await screen.findByText("This chat no longer matches the selected Codex task. Review the exact pairing in Agent Access."))
      .toHaveAttribute("role", "status");
  });

  it("shows the paired Codex turns in Message Codex while keeping MCP receipts separate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      binding: { reasoning_binding_id: "binding:owner", helix_conversation_id: "chat:fixture",
        status: "active", continuation_transport: "polling", binding_epoch: 3 },
    }), { status: 200 })));
    const readCodexMirror = vi.fn(async () => ({ status: "ready", frame: {
      schema: "helix.codex_conversation_cloud_frame.v1", taskId: "01a0798b-b5bd-7bf2-946a-9a77e086316a",
      turns: [{ id: "turn:one", user: "A question in Codex", assistant: "A **formatted** answer",
        assistantPhase: "final_answer", status: "completed" }],
    } }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), showCodexMirror: vi.fn(),
      readCodexMirror, stopMessageCloud: vi.fn() } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    const history = await screen.findByRole("log", { name: "Codex conversation history" });
    await waitFor(() => expect(history).toHaveTextContent("A question in Codex"));
    expect(history).toHaveTextContent("A formatted answer");
    expect(screen.getByText("MCP delivery receipts")).toBeInTheDocument();
    expect(readCodexMirror).toHaveBeenCalledWith({
      bindingId: "binding:owner", helixConversationId: "chat:fixture",
    });
  });

  it("explains an accepted pairing that needs the same task to reconnect after restart", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "reasoning_binding_not_found",
    }), { status: 404 })));
    const readCodexMirror = vi.fn();
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), showCodexMirror: vi.fn(),
      readCodexMirror, stopMessageCloud: vi.fn() } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    expect(await screen.findByText(/If Agent Access shows an accepted pairing, ask that same task to recover it/))
      .toHaveAttribute("role", "status");
    expect(readCodexMirror).not.toHaveBeenCalled();
  });

  it("explains the missing exact-task pairing without starting the mirror", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "reasoning_binding_not_found",
    }), { status: 404 })));
    const showCodexMirror = vi.fn(async () => ({ status: "showing" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), showCodexMirror,
      stopMessageCloud: vi.fn(async () => ({ status: "stopped" })) } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ConsoleFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Message Codex" }));
    fireEvent.click(screen.getByRole("button", { name: "Float Codex conversation" }));
    expect(await screen.findByText("No current Codex task connection. Check Agent Access; an accepted pairing can be recovered by the same task through CasimirBot MCP."))
      .toHaveAttribute("role", "status");
    expect(showCodexMirror).not.toHaveBeenCalled();
  });

  it("does not show a channel without its native owner", () => {
    render(<ConsoleFixture apiAvailable={false} />);
    expect(screen.queryByRole("button", { name: "# Cloud Agent DM" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Party Chat/ })).toBeNull();
    expect(screen.getByText("Original Helix pill")).toBeInTheDocument();
  });

  it("uses one admitted local room owner for the selected history and pill send", () => {
    const localRoom = { room: { room_id: "room:one", title: "Study room", status: "ready",
      self_participant_id: "host", participants: [{ participant_id: "host", display_name: "Host", presence: "present" }] },
    conversation: { admitted: true, messages: [{ message_id: "m1", author_participant_id: "host",
      text: "Room-only history" }], draft: "Room-only draft", sending: false, error: "",
      send: sendRoom, updateDraft: vi.fn() } } as unknown as LocalRoomTextOwnerSnapshot;
    render(<ConsoleFixture localRoom={localRoom} />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Study room" }));
    const workspace = screen.getByRole("region", { name: "Helix Console conversations" });
    expect(workspace).toHaveTextContent("Room-only history");
    expect(screen.getByLabelText("Local room presence")).toHaveTextContent("1 present in room · Host");
    expect(workspace).not.toHaveTextContent("Private Ask answer");
    expect(screen.getByRole("textbox", { name: "Message Party Chat members" })).toHaveValue("Room-only draft");
    fireEvent.click(screen.getByRole("button", { name: "Send to Party Chat" }));
    expect(sendRoom).toHaveBeenCalledTimes(1);
    expect(sendManaged).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "# Ask Helix" }));
    expect(workspace).toHaveTextContent("Private Ask answer");
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Study room" }));
    expect(screen.getByRole("textbox", { name: "Message Party Chat members" })).toHaveValue("Room-only draft");
  });

  it("does not offer a room channel until membership read is admitted", () => {
    const localRoom = { room: { room_id: "room:one", title: "Study room", status: "ready" },
      conversation: { admitted: false, messages: [], draft: "" } } as unknown as LocalRoomTextOwnerSnapshot;
    render(<ConsoleFixture localRoom={localRoom} />);
    expect(screen.queryByRole("button", { name: "# Party Chat · Study room" })).toBeNull();
  });

  it("places an owner's mission in the selected room center while the pill stays room-text-only", () => {
    const localRoom = { room: { room_id: "room:one", title: "Study room", status: "ready",
      self_participant_id: "host", public_terminal_results: [],
      participants: [{ participant_id: "host", display_name: "Host", role: "owner", presence: "present" }] },
    onMissionProcessed: vi.fn(),
    conversation: { admitted: true, messages: [{ message_id: "m1", author_participant_id: "host",
      text: "Chat stays separate" }], draft: "Message members", sending: false, error: "",
      send: sendRoom, updateDraft: vi.fn() } } as unknown as LocalRoomTextOwnerSnapshot;
    render(<ConsoleFixture localRoom={localRoom} />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Study room" }));
    fireEvent.click(screen.getByRole("button", { name: "Mission" }));
    const workspace = screen.getByRole("region", { name: "Helix Console conversations" });
    expect(workspace).toHaveTextContent("Exact-task owner review");
    expect(workspace).not.toHaveTextContent("Chat stays separate");
    expect(screen.getByRole("textbox", { name: "Message Party Chat members" })).toHaveValue("Message members");
    expect(sendRoom).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    expect(workspace).toHaveTextContent("Chat stays separate");
  });

  it("shows a guest shared mission results without owner task controls", () => {
    const localRoom = { room: { room_id: "room:guest", title: "Guest room", status: "ready",
      self_participant_id: "guest", public_terminal_results: [],
      participants: [{ participant_id: "guest", display_name: "Guest", role: "participant", presence: "present" }] },
    onMissionProcessed: vi.fn(), conversation: { admitted: true, messages: [], draft: "", sending: false,
      error: "", send: sendRoom, updateDraft: vi.fn() } } as unknown as LocalRoomTextOwnerSnapshot;
    render(<ConsoleFixture localRoom={localRoom} />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Guest room" }));
    fireEvent.click(screen.getByRole("button", { name: "Mission" }));
    const workspace = screen.getByRole("region", { name: "Helix Console conversations" });
    expect(workspace).toHaveTextContent("No authorized room result has been published yet");
    expect(workspace).not.toHaveTextContent("Exact-task owner review");
    expect(workspace).toHaveTextContent("does not expose the owner's private task connection");
  });

  it("unmounts mission review when the selected room loses admission", () => {
    const room = { room: { room_id: "room:one", title: "Owner room", status: "ready",
      self_participant_id: "host", public_terminal_results: [],
      participants: [{ participant_id: "host", display_name: "Host", role: "owner", presence: "present" }] },
    onMissionProcessed: vi.fn(), conversation: { admitted: true, messages: [], draft: "Room draft",
      sending: false, error: "", send: sendRoom, updateDraft: vi.fn() } } as unknown as LocalRoomTextOwnerSnapshot;
    function RevocableMissionFixture() {
      const [snapshot, setSnapshot] = useState<LocalRoomTextOwnerSnapshot | null>(room);
      return <><button type="button" onClick={() => setSnapshot(null)}>Lose mission room</button>
        <ConsoleFixture localRoom={snapshot} /></>;
    }
    render(<RevocableMissionFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Owner room" }));
    fireEvent.click(screen.getByRole("button", { name: "Mission" }));
    expect(screen.getByText("Exact-task owner review")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lose mission room" }));
    expect(screen.queryByText("Exact-task owner review")).toBeNull();
    expect(screen.getByText(/Room history is hidden/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message Party Chat members" })).toBeNull();
  });

  it("keeps a lost room selection inert instead of exposing the Private Ask composer or history", () => {
    const room = { room: { room_id: "room:one", title: "Study room", status: "ready",
      self_participant_id: "host", participants: [{ participant_id: "host", presence: "away" }] },
    conversation: { admitted: true, messages: [], draft: "Room draft", sending: false, error: "",
      send: sendRoom, updateDraft: vi.fn() } } as unknown as LocalRoomTextOwnerSnapshot;
    function RevocableFixture() {
      const [snapshot, setSnapshot] = useState<LocalRoomTextOwnerSnapshot | null>(room);
      return <><button type="button" onClick={() => setSnapshot(null)}>Lose room access</button>
        <ConsoleFixture localRoom={snapshot} /></>;
    }
    render(<RevocableFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Study room" }));
    fireEvent.click(screen.getByRole("button", { name: "Lose room access" }));
    const workspace = screen.getByRole("region", { name: "Helix Console conversations" });
    expect(workspace).toHaveTextContent("Room history is hidden");
    expect(screen.queryByLabelText("Local room presence")).toBeNull();
    expect(workspace).not.toHaveTextContent("Private Ask answer");
    expect(screen.getByText("Original Helix pill").closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: "Message Party Chat members" })).toBeNull();
    expect(screen.getByRole("button", { name: "# Party Chat · Room unavailable" })).toBeDisabled();
    expect(sendRoom).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Return to Ask Helix" })[0]);
    expect(workspace).toHaveTextContent("Private Ask answer");
  });

  it("uses one admitted hosted owner for the selected history and pill send", () => {
    const hostedRoom = { room: { room_id: "hosted:one", title: "Guest room", status: "open",
      self_participant_id: "guest", participants: [{ participant_id: "guest", display_name: "Guest" }] },
    authority: "https://rooms.test",
    conversation: { admitted: true, messages: [{ message_id: "hm1", author_participant_id: "guest",
      text: "Guest room history" }], draft: "Guest room draft", sending: false, error: "",
      send: sendRoom, updateDraft: vi.fn() } } as unknown as HostedRoomTextOwnerSnapshot;
    render(<ConsoleFixture hostedRoom={hostedRoom} />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Guest room" }));
    const workspace = screen.getByRole("region", { name: "Helix Console conversations" });
    expect(workspace).toHaveTextContent("Guest room history");
    expect(screen.getByLabelText("Hosted room membership")).toHaveTextContent("1 member · Guest");
    expect(workspace).not.toHaveTextContent("Private Ask answer");
    expect(screen.getByRole("textbox", { name: "Message Party Chat members" })).toHaveValue("Guest room draft");
    fireEvent.click(screen.getByRole("button", { name: "Send to Party Chat" }));
    expect(sendRoom).toHaveBeenCalledTimes(1);
    expect(sendManaged).not.toHaveBeenCalled();
  });

  it("separates the developer's shared-AI dialogue from hosted Party Chat", () => {
    cacheAccountCapabilityPolicy(buildHelixAccountCapabilityPolicy("developer"), "profile:hosted-console-dev");
    const hostedRoom = { room: { room_id: "hosted:ai", title: "AI room", status: "open",
      self_participant_id: "owner", participants: [{ participant_id: "owner", display_name: "Owner", role: "owner" }] },
    authority: "https://rooms.test", conversation: { admitted: true, messages: [], draft: "",
      sending: false, error: "", send: sendRoom, updateDraft: vi.fn() } } as unknown as HostedRoomTextOwnerSnapshot;
    render(<ConsoleFixture hostedRoom={hostedRoom} />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · AI room" }));
    const workspace = screen.getByRole("region", { name: "Helix Console conversations" });
    expect(workspace).not.toHaveTextContent("Hosted author release controls");
    expect(workspace).not.toHaveTextContent("Hosted shared AI replies");
    fireEvent.click(screen.getByRole("button", { name: "# Room Agent · AI room" }));
    expect(workspace).toHaveTextContent("Hosted author release controls");
    expect(workspace).toHaveTextContent("Hosted shared AI replies");
    expect(workspace).toHaveTextContent("Reviewed AI reply to Codex");
    expect(workspace).toHaveTextContent("Hosted AI reports");
    fireEvent.click(screen.getByRole("button", { name: "Select or inspect the Codex task in Mission" }));
    expect(workspace).toHaveTextContent("Hosted exact-task owner review");
    expect(workspace).not.toHaveTextContent("Hosted shared AI replies");
  });

  it("shows the hosted owner's mission in the selected center while the pill remains room text", () => {
    const hostedRoom = { room: { room_id: "hosted:owner", title: "Owner room", status: "open",
      self_participant_id: "owner", participants: [{ participant_id: "owner", display_name: "Owner", role: "owner" }] },
    authority: "https://rooms.test", conversation: { admitted: true, messages: [{ message_id: "hm1",
      author_participant_id: "owner", text: "Hosted chat only" }], draft: "Room message", sending: false,
      error: "", send: sendRoom, updateDraft: vi.fn() } } as unknown as HostedRoomTextOwnerSnapshot;
    render(<ConsoleFixture hostedRoom={hostedRoom} />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Owner room" }));
    fireEvent.click(screen.getByRole("button", { name: "Mission" }));
    const workspace = screen.getByRole("region", { name: "Helix Console conversations" });
    expect(workspace).toHaveTextContent("Hosted exact-task owner review");
    expect(workspace).toHaveTextContent("Hosted shared reports");
    expect(workspace).not.toHaveTextContent("Hosted chat only");
    expect(screen.getByRole("textbox", { name: "Message Party Chat members" })).toHaveValue("Room message");
    expect(sendRoom).not.toHaveBeenCalled();
  });

  it("shows the Discord stream control to an ordinary hosted-room owner", async () => {
    cacheAccountCapabilityPolicy(buildHelixAccountCapabilityPolicy("user"), "profile:stream-owner");
    const showMessageCloud = vi.fn(async () => ({ status: "showing" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), showMessageCloud,
      stopMessageCloud: vi.fn(async () => ({ status: "stopped" }))
    } as unknown as NonNullable<Window["casimirDesktop"]>;
    const hostedRoom = { room: { room_id: "hosted:stream", title: "Stream room", status: "open",
      self_participant_id: "owner", participants: [
        { participant_id: "owner", display_name: "Owner", role: "owner" }] },
      authority: "https://rooms.test", conversation: { admitted: true, messages: [], draft: "",
        sending: false, error: "", send: sendRoom, updateDraft: vi.fn() } } as unknown as HostedRoomTextOwnerSnapshot;
    render(<ConsoleFixture apiAvailable={false} hostedRoom={hostedRoom} />);
    expect(screen.queryByRole("button", { name: "# Cloud Agent DM" })).toBeNull();
    expect(screen.getByRole("button", { name: "Float activity" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Discord stream", { selector: "summary" }));
    expect(screen.getByLabelText("Discord stream sources")).toHaveValue("all");
    fireEvent.click(screen.getByRole("button", { name: "Float activity" }));
    await waitFor(() => expect(showMessageCloud).toHaveBeenCalledWith(expect.objectContaining({
      source: "session_activity", helixConversationId: "hosted:stream",
    })));
  });

  it("shows a hosted guest only shared mission reports, then removes them on lost admission", () => {
    const room = { room: { room_id: "hosted:guest", title: "Guest room", status: "open",
      self_participant_id: "guest", participants: [{ participant_id: "guest", display_name: "Guest", role: "participant" }] },
    authority: "https://rooms.test", conversation: { admitted: true, messages: [], draft: "Guest text",
      sending: false, error: "", send: sendRoom, updateDraft: vi.fn() } } as unknown as HostedRoomTextOwnerSnapshot;
    function RevocableHostedMission() {
      const [snapshot, setSnapshot] = useState<HostedRoomTextOwnerSnapshot | null>(room);
      return <><button type="button" onClick={() => setSnapshot(null)}>Lose hosted mission</button>
        <ConsoleFixture hostedRoom={snapshot} /></>;
    }
    render(<RevocableHostedMission />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Guest room" }));
    fireEvent.click(screen.getByRole("button", { name: "Mission" }));
    const workspace = screen.getByRole("region", { name: "Helix Console conversations" });
    expect(workspace).toHaveTextContent("Hosted shared reports");
    expect(workspace).not.toHaveTextContent("Hosted exact-task owner review");
    fireEvent.click(screen.getByRole("button", { name: "Lose hosted mission" }));
    expect(workspace).not.toHaveTextContent("Hosted shared reports");
    expect(workspace).toHaveTextContent("Room history is hidden");
  });

  it("withholds the hosted channel when its membership read is not admitted", () => {
    const hostedRoom = { room: { room_id: "hosted:one", title: "Guest room", status: "open" },
      authority: "https://rooms.test", conversation: { admitted: false, messages: [], draft: "" } } as unknown as HostedRoomTextOwnerSnapshot;
    render(<ConsoleFixture hostedRoom={hostedRoom} />);
    expect(screen.queryByRole("button", { name: "# Party Chat · Guest room" })).toBeNull();
    expect(screen.getByText("Original Helix pill")).toBeInTheDocument();
  });

  it("keeps a selected hosted room inert after its membership read is revoked", () => {
    const room = { room: { room_id: "hosted:one", title: "Guest room", status: "open",
      self_participant_id: "guest", participants: [{ participant_id: "guest", display_name: "Guest" }] },
    authority: "https://rooms.test", conversation: { admitted: true, messages: [], draft: "Guest draft",
      sending: false, error: "", send: sendRoom, updateDraft: vi.fn() } } as unknown as HostedRoomTextOwnerSnapshot;
    function RevocableHostedFixture() {
      const [snapshot, setSnapshot] = useState<HostedRoomTextOwnerSnapshot | null>(room);
      return <><button type="button" onClick={() => setSnapshot(null)}>Revoke hosted read</button>
        <ConsoleFixture hostedRoom={snapshot} /></>;
    }
    render(<RevocableHostedFixture />);
    fireEvent.click(screen.getByRole("button", { name: "# Party Chat · Guest room" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke hosted read" }));
    const workspace = screen.getByRole("region", { name: "Helix Console conversations" });
    expect(workspace).toHaveTextContent("Room history is hidden");
    expect(workspace).not.toHaveTextContent("Private Ask answer");
    expect(screen.queryByRole("textbox", { name: "Message Party Chat members" })).toBeNull();
    expect(screen.getByRole("button", { name: "# Party Chat · Hosted room unavailable" })).toBeDisabled();
    expect(sendRoom).not.toHaveBeenCalled();
  });

  it("withholds a hosted channel without the selected participant in that room", () => {
    const hostedRoom = { room: { room_id: "hosted:one", title: "Guest room", status: "open",
      self_participant_id: "guest", participants: [{ participant_id: "other", display_name: "Other" }] },
      authority: "https://rooms.test", conversation: { admitted: true, messages: [], draft: "" } } as unknown as HostedRoomTextOwnerSnapshot;
    render(<ConsoleFixture hostedRoom={hostedRoom} />);
    expect(screen.queryByRole("button", { name: "# Party Chat · Guest room" })).toBeNull();
  });
});
