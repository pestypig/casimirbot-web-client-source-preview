// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { SharedRoomTextReleaseControls } from "../SharedRoomTextReleaseControls";

const room = (id = "room:one") => ({ room_id: id, title: "Team room", self_participant_id: "guest",
  status: "waiting_for_participant" }) as HelixSharedRealtimeRoom;
const sessionId = "room_interpreter:11111111-1111-4111-8111-111111111111";
const messageId = "room_message:22222222-2222-4222-8222-222222222222";
const own = { message_id: messageId, room_id: "room:one", author_participant_id: "guest", text: "My chosen text" };
const other = { message_id: "room_message:33333333-3333-4333-8333-333333333333", room_id: "room:one",
  author_participant_id: "host", text: "Host text stays private from my controls" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status,
  headers: { "Content-Type": "application/json" } });
const prep = (roomId = "room:one") => json({ schema: "helix.shared_room_interpreter_preparation_response.v1",
  room_id: roomId, shared_ai_active: false, model_input: false, provider_calls: 0,
  session: { schema: "helix.shared_room_interpreter_preparation.v1",
    interpreter_session_id: sessionId, room_id: roomId, generation: 1,
    state: "configuration_pending", provider: "openai_agents_api", credential_source: "unconfigured",
    expected_payer: "host_openai_project_if_configured", usage_ceiling_turns: 0,
    shared_ai_active: false, model_input: false, provider_calls: 0, task_handoff: false } });
const releases = (roomId = "room:one", items: unknown[] = []) => json({ schema: "helix.shared_room_text_releases.v1",
  room_id: roomId, model_input: false, provider_calls: 0, releases: items });
const receipt = (state: "released" | "revoked") => ({ message_id: messageId, room_id: "room:one",
  author_participant_id: "guest", interpreter_session_id: sessionId, interpreter_generation: 1,
  state, consent_revision: state === "released" ? 1 : 2, model_input: false, provider_calls: 0 });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("developer room text release control", () => {
  it("shows exact author text and disclosure before release, then permits future-use revocation", async () => {
    const posts: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)); posts.push(body);
        return json({ schema: "helix.shared_room_text_release_response.v1", room_id: "room:one",
          model_input: false, provider_calls: 0, release: receipt(body.action === "release" ? "released" : "revoked") });
      }
      return String(url).endsWith("/interpreter-session") ? prep() : releases();
    }));
    render(<SharedRoomTextReleaseControls room={room()} messages={[own, other]} admitted />);
    await screen.findByRole("button", { name: "Review AI release" });
    expect(screen.getByRole("region", { name: "Room AI text permissions" })).toHaveTextContent("My chosen text");
    expect(screen.getByRole("region", { name: "Room AI text permissions" })).not.toHaveTextContent(other.text);
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Review AI release" }));
    expect(screen.getByText(/Release only this exact message to room Team room \(room:one\), generation 1/)).toBeInTheDocument();
    expect(screen.getByText(/expected future payer: host OpenAI project/)).toBeInTheDocument();
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Approve this message for evaluation" }));
    await screen.findByText(/Future-use approval recorded for this message/);
    expect(posts).toEqual([{ interpreter_session_id: sessionId, generation: 1,
      message_id: messageId, action: "release" }]);
    fireEvent.click(screen.getByRole("button", { name: "Revoke future AI use" }));
    await screen.findByText(/Future use revoked. Text already sent/);
    expect(posts[1]).toEqual({ interpreter_session_id: sessionId, generation: 1,
      message_id: messageId, action: "revoke" });
    expect(screen.queryByRole("button", { name: "Review AI release" })).toBeNull();
  });

  it("hides the developer control on policy denial and never submits", async () => {
    const fetcher = vi.fn(async (url: unknown) => String(url).endsWith("/interpreter-session")
      ? json({}, 403) : json({}, 403));
    vi.stubGlobal("fetch", fetcher);
    render(<SharedRoomTextReleaseControls room={room()} messages={[own]} admitted />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("region", { name: "Room AI text permissions" })).toBeNull();
    expect(fetcher.mock.calls.every(([, init]) => !init || init.method !== "POST")).toBe(true);
  });

  it("shows the configured generation's host payer before a guest approves text", async () => {
    const fetcher = vi.fn(async (url: unknown) => String(url).endsWith("/interpreter-session")
      ? json({ schema: "helix.shared_room_interpreter_preparation_response.v1",
        room_id: "room:one", shared_ai_active: false, model_input: false, provider_calls: 0,
        session: { schema: "helix.shared_room_interpreter_preparation.v1",
          interpreter_session_id: sessionId, room_id: "room:one", generation: 2,
          state: "configured", provider: "openai_agents_api", credential_source: "host_native_profile",
          expected_payer: "host_openai_project", usage_ceiling_turns: 1,
          shared_ai_active: false, model_input: false, provider_calls: 0, task_handoff: false } })
      : releases());
    vi.stubGlobal("fetch", fetcher);
    render(<SharedRoomTextReleaseControls room={room()} messages={[own]} admitted />);
    fireEvent.click(await screen.findByRole("button", { name: "Review AI release" }));
    expect(screen.getByText(/generation 2/)).toBeInTheDocument();
    expect(screen.getByText(/host's OpenAI project would pay/)).toBeInTheDocument();
    expect(screen.getByText(/no turn is enabled yet/)).toBeInTheDocument();
    expect(fetcher.mock.calls.every(([, init]) => !init || init.method !== "POST")).toBe(true);
  });

  it("discards a late preparation from an old room", async () => {
    let releaseOld: ((value: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn((url: unknown) => String(url).includes("room%3Aone") &&
      String(url).endsWith("/interpreter-session")
      ? new Promise<Response>(resolve => { releaseOld = resolve; })
      : Promise.resolve(String(url).endsWith("/interpreter-session") ? prep("room:two") :
        releases(String(url).includes("room%3Atwo") ? "room:two" : "room:one"))));
    const view = render(<SharedRoomTextReleaseControls room={room("room:one")} messages={[own]} admitted />);
    view.rerender(<SharedRoomTextReleaseControls room={room("room:two")} messages={[]} admitted />);
    releaseOld?.(prep("room:one"));
    await Promise.resolve();
    expect(screen.queryByText(/My chosen text/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve this message for evaluation" })).toBeNull();
  });
});
