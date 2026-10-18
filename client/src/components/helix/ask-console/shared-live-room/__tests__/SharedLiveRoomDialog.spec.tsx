/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from
  "@shared/helix-shared-realtime-room";
import { SharedLiveRoomDialog } from "../SharedLiveRoomDialog";
import type { HelixSharedLiveRoomController } from "../useHelixSharedLiveRoom";
import { HELIX_PRIVATE_API_CHAT_OPEN_EVENT, HELIX_PRIVATE_ASK_COMPOSER_OPEN_EVENT } from "../../ConsoleConversationEvents";
import { createRoomTextDraftStore } from "../RoomTextDraftStore";

vi.mock("../SharedLiveRoomConsentPanel", () => ({
  SharedLiveRoomConsentPanel: () => null,
}));
vi.mock("../SharedLiveRoomDebugPanel", () => ({
  SharedLiveRoomDebugPanel: () => <div data-testid="voice-transport-debug">Voice transport debug</div>,
}));
vi.mock("../SharedLiveRoomParticipantsPanel", () => ({
  SharedLiveRoomParticipantsPanel: () => null,
}));
vi.mock("../SharedLiveRoomRuntimePanel", () => ({
  SharedLiveRoomRuntimePanel: () => null,
}));
vi.mock("../SharedLiveRoomTextConversation", () => ({
  SharedLiveRoomTextConversation: () => <div>Room text conversation
    <textarea aria-label="Message to room members" /></div>,
}));
vi.mock("../SharedLiveRoomVisualLanes", () => ({
  SharedLiveRoomVisualLanes: () => <div data-testid="voice-visual-lanes">Voice visual lanes</div>,
}));
vi.mock("../SharedLiveRoomOwnerWorkflow", () => ({
  SharedLiveRoomOwnerWorkflow: () => <div>Owner mission controls</div>,
}));

const buildController = (): HelixSharedLiveRoomController => ({
  rooms: [],
  room: null,
  selfParticipant: null,
  frames: [],
  debug: null,
  inviteCode: null,
  inviteExpiresAt: null,
  busyAction: null,
  error: null,
  runtimeActive: false,
  realtimeSessionId: null,
  frameUpload: {
    status: "idle",
    sourceId: null,
    historyId: null,
    observedAt: null,
    providerDelivery: null,
    error: null,
  },
  mediaBridge: {
    state: "idle",
    role: "participant",
    peer_audio_connected: false,
    remote_audio_playback_ready: false,
    provider_input_mixed: false,
    provider_input_enabled: false,
    provider_audio_forwarded: false,
    active_model_speaker_participant_id: null,
    latest_shared_transcript: null,
    ice_configuration: "default_stun",
    ice_configuration_error: null,
    failure: null,
  },
  clearError: vi.fn(),
  createRoom: vi.fn(async () => true),
  joinRoom: vi.fn(async () => true),
  openRoom: vi.fn(async () => true),
  createInvite: vi.fn(async () => true),
  patchOwnConsent: vi.fn(async () => true),
  connectRuntime: vi.fn(async () => true),
  reserveRuntime: vi.fn(async () => true),
  bindRuntime: vi.fn(async () => true),
  takeFloor: vi.fn(async () => true),
  releaseFloor: vi.fn(async () => true),
  startMediaBridge: vi.fn(async () => undefined),
  stopMediaBridge: vi.fn(async () => undefined),
  resumeMediaPlayback: vi.fn(async () => true),
  refreshDebug: vi.fn(async () => true),
  leaveRoom: vi.fn(async () => true),
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  delete window.casimirDesktop;
});

describe("Shared Live Room dialog plane", () => {
  it("presents a three-human room as text only without a voice-bridge control", () => {
    const controller = buildController();
    controller.selfParticipant = { participant_id: "host", display_name: "Host", role: "owner",
      presence: "present" } as HelixSharedLiveRoomController["selfParticipant"];
    const room = { room_id: "shared_realtime_room:three", title: "Three-human room",
      capacity_profile: "three_human_text", max_participants: 3, status: "text_ready",
      public_terminal_results: [], self_participant_id: "host", participant_context_cards: [],
      participants: ["Host", "Guest A", "Guest B"].map((display_name, index) => ({
        participant_id: index ? `guest:${index}` : "host", display_name,
        role: index ? "participant" : "owner", presence: "present" })),
      readiness: { ready: false, missing_participant_count: 0, missing_consent_by_participant: {} },
      runtime: { state: "idle", transport_owner: "unbound", realtime_session_ref_hash: null },
    } as unknown as HelixSharedRealtimeRoom;
    controller.room = room;
    render(<SharedLiveRoomDialog room={room} controller={controller}
      titleId="three-title" descriptionId="three-description" onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Three-person text room · developer evaluation");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Shared GPT Live room · assisted evaluation");
    expect(screen.getByText(/Text-only developer room · 3\/3 people joined/)).toBeInTheDocument();
    expect(screen.getByText(/Room text goes to members \(up to three people\)/)).toBeInTheDocument();
    expect(screen.getByText(/this local room view cannot start one/)).toBeInTheDocument();
    expect(screen.getByText(/Three-person voice is unavailable in this profile/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect room audio" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("voice-transport-debug")).not.toBeInTheDocument();
    expect(screen.queryByTestId("voice-visual-lanes")).not.toBeInTheDocument();
    expect(screen.getByText(/This text room does not use the GPT Live audio and visual transport/)).toBeInTheDocument();
  });

  it("shows a solo host the room mission without inventing a guest", async () => {
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: vi.fn() as never };
    const openPrivateApiChat = vi.fn();
    window.addEventListener(HELIX_PRIVATE_API_CHAT_OPEN_EVENT, openPrivateApiChat, { once: true });
    const controller = buildController();
    controller.selfParticipant = { participant_id: "dan", display_name: "Dan", role: "owner", presence: "present" } as HelixSharedLiveRoomController["selfParticipant"];
    const room = {
      room_id: "shared_realtime_room:solo",
      title: "Solo room",
      public_terminal_results: [],
      status: "waiting_for_participant",
      readiness: { ready: false, missing_participant_count: 1, missing_consent_by_participant: {} },
      runtime: { state: "idle", transport_owner: "none", realtime_session_ref_hash: null },
      participants: [{ participant_id: "dan", display_name: "Dan", role: "owner", presence: "present" }],
      participant_context_cards: [],
      self_participant_id: "dan",
    } as unknown as HelixSharedRealtimeRoom;
    controller.room = room;

    const onClose = vi.fn();
    const draftStore = createRoomTextDraftStore();
    const draftIdentity = { source: "local" as const, authority: "", roomId: room.room_id, participantId: "dan" };
    draftStore.write(draftIdentity, { text: "Unsent room note", pendingMessageId: null });
    render(<><textarea aria-label="Ask Helix" />
      <SharedLiveRoomDialog room={room} controller={controller} titleId="solo-title" descriptionId="solo-description" onClose={onClose} draftStore={draftStore} /></>);

    expect(screen.getByText(/Your role: Host/)).toBeInTheDocument();
    expect(screen.getByText(/Shared AI needs each author's exact release and a separate turn/)).toBeInTheDocument();
    expect(screen.getByText(/You review each mission handoff/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Room mission" })).toHaveTextContent("Owner mission controls");
    expect(screen.getByRole("region", { name: "Party Chat conversation" })).toHaveTextContent("Recent lines stay in this live connection only");
    expect(screen.getByTestId("voice-transport-debug")).toBeInTheDocument();
    expect(screen.getByTestId("voice-visual-lanes")).toBeInTheDocument();
    expect(screen.queryByText(/Your role: Guest/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Write to room members" }));
    expect(screen.getByRole("textbox", { name: "Message to room members" })).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open Cloud Agent DM" }));
    await waitFor(() => expect(openPrivateApiChat).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
    const openPrivateAsk = vi.fn();
    window.addEventListener(HELIX_PRIVATE_ASK_COMPOSER_OPEN_EVENT, openPrivateAsk, { once: true });
    fireEvent.click(screen.getByRole("button", { name: "Open Ask Helix" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(openPrivateAsk).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Close room" }));
    await waitFor(() => expect(controller.leaveRoom).toHaveBeenCalledOnce());
    expect(draftStore.read(draftIdentity).text).toBe("");
  });

  it("routes mission review to the Console without mounting a second owner workflow", () => {
    const controller = buildController();
    controller.selfParticipant = { participant_id: "host", display_name: "Host", role: "owner",
      presence: "present" } as HelixSharedLiveRoomController["selfParticipant"];
    const room = { room_id: "shared_realtime_room:owner", title: "Owner room", status: "ready",
      capacity_profile: "three_human_text", public_terminal_results: [], self_participant_id: "host",
      participants: [{ participant_id: "host", display_name: "Host", role: "owner", presence: "present" }],
      readiness: { ready: false, missing_participant_count: 0, missing_consent_by_participant: {} },
      runtime: { state: "idle", transport_owner: "none", realtime_session_ref_hash: null },
    } as unknown as HelixSharedRealtimeRoom;
    controller.room = room;
    const openMission = vi.fn();
    render(<SharedLiveRoomDialog room={room} controller={controller} titleId="owner-title"
      descriptionId="owner-description" onClose={vi.fn()} onOpenMissionConsole={openMission} />);
    expect(screen.queryByText("Owner mission controls")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review task handoff" }));
    expect(openMission).toHaveBeenCalledOnce();
  });

  it("separates a guest's conversation, mission and permission views", () => {
    const controller = buildController();
    controller.selfParticipant = { participant_id: "sam", display_name: "Sam", role: "participant", presence: "present" } as HelixSharedLiveRoomController["selfParticipant"];
    const guestLine = { speaker_kind: "participant" as const, speaker_label: "Sam", transcript: "Safety first", observed_at_ms: 1 };
    const hostLine = { speaker_kind: "participant" as const, speaker_label: "Dan", transcript: "Agreed", observed_at_ms: 2 };
    controller.mediaBridge.latest_shared_transcript = hostLine;
    controller.mediaBridge.recent_shared_transcripts = [guestLine, hostLine];
    const room = {
      room_id: "shared_realtime_room:guest",
      title: "Dan's room",
      public_terminal_results: [],
      status: "ready",
      readiness: { ready: true, missing_participant_count: 0, missing_consent_by_participant: {} },
      runtime: { state: "idle", transport_owner: "none", realtime_session_ref_hash: null },
      participants: [{ participant_id: "sam", display_name: "Sam", role: "participant", presence: "present" }],
      participant_context_cards: [],
      self_participant_id: "sam",
    } as unknown as HelixSharedRealtimeRoom;
    controller.room = room;

    render(<SharedLiveRoomDialog room={room} controller={controller} titleId="guest-title" descriptionId="guest-description" onClose={vi.fn()} />);

    expect(screen.getByText(/Your role: Guest/)).toBeInTheDocument();
    expect(screen.getByText(/The host reviews mission handoffs/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Conversation destinations" })).toContainElement(
      screen.getByRole("button", { name: "People & permissions" }));
    expect(screen.getByRole("region", { name: "Party Chat conversation" })).toHaveTextContent("Sam: Safety first");
    expect(screen.getByRole("region", { name: "Party Chat conversation" })).toHaveTextContent("Dan: Agreed");
    expect(screen.getByRole("region", { name: "Room mission" })).toHaveTextContent("does not expose their private task connection");
    expect(screen.getByRole("region", { name: "Room people and permissions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select room task" })).not.toBeInTheDocument();
  });

  it("creates another room without leaving the active room", async () => {
    const controller = buildController();
    const room = {
      room_id: "shared_realtime_room:active",
      title: "Existing M1 room",
      public_terminal_results: [],
      status: "ready",
      readiness: {
        ready: true,
        missing_participant_count: 0,
        missing_consent_by_participant: {},
      },
      runtime: {
        state: "idle",
        transport_owner: "none",
        realtime_session_ref_hash: null,
      },
      participants: [],
      participant_context_cards: [],
      self_participant_id: null,
    } as unknown as HelixSharedRealtimeRoom;
    controller.room = room;

    render(
      <SharedLiveRoomDialog
        room={room}
        controller={controller}
        titleId="room-title"
        descriptionId="room-description"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Switch or create another room"));
    fireEvent.change(screen.getByLabelText("Create a room"), {
      target: { value: "C0 combat testing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));

    await waitFor(() =>
      expect(controller.createRoom).toHaveBeenCalledWith("C0 combat testing"),
    );
    expect(controller.leaveRoom).not.toHaveBeenCalled();
  });

  it("portals above the Ask plane with an opaque top-down viewport layout", async () => {
    const controller = buildController();
    const askPlaneClick = vi.fn();
    const host = document.createElement("div");
    host.style.transform = "translate3d(0, 0, 0)";
    document.body.appendChild(host);

    const view = render(
      <div data-testid="ask-plane" onClick={askPlaneClick}>
        <SharedLiveRoomDialog
          room={null}
          controller={controller}
          titleId="room-title"
          descriptionId="room-description"
          onClose={vi.fn()}
        />
      </div>,
      { container: host },
    );

    const overlay = screen.getByTestId("shared-live-room-overlay");
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay).toHaveClass("fixed", "inset-0", "items-start", "z-[2147483000]");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("bg-slate-950", "opacity-100");
    expect(dialog).toHaveTextContent("The native hosted room service is a separate path and supplies no model");
    expect(dialog).toHaveTextContent("Local rooms · choose a conversation profile");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Create room" }));
    await waitFor(() => expect(controller.createRoom).toHaveBeenCalledWith(""));
    expect(askPlaneClick).not.toHaveBeenCalled();

    view.unmount();
    expect(document.body.style.overflow).toBe("");
    host.remove();
  });

  it("closes from both the shield and Escape", () => {
    const onClose = vi.fn();
    render(
      <SharedLiveRoomDialog
        room={null}
        controller={buildController()}
        titleId="room-title"
        descriptionId="room-description"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Close Rooms dialog",
    }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
