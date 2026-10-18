// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { SharedRoomInterpreterPreparationPanel } from "../SharedRoomInterpreterPreparationPanel";

const room = (id = "room:one") => ({ room_id: id, self_participant_id: "member:one", status: "active" }) as HelixSharedRealtimeRoom;
const session = (id = "room:one") => ({ schema: "helix.shared_room_interpreter_preparation.v1",
  interpreter_session_id: "room_interpreter:11111111-1111-4111-8111-111111111111", room_id: id,
  generation: 1, state: "configuration_pending", provider: "openai_agents_api",
  credential_source: "unconfigured", expected_payer: "host_openai_project_if_configured",
  usage_ceiling_turns: 0, shared_ai_active: false, model_input: false, provider_calls: 0, task_handoff: false });
const response = (id: string, current: unknown) => new Response(JSON.stringify({
  schema: "helix.shared_room_interpreter_preparation_response.v1", room_id: id,
  session: current, shared_ai_active: false, model_input: false, provider_calls: 0,
}), { status: 200, headers: { "Content-Type": "application/json" } });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("developer shared AI preparation panel", () => {
  it("shows truthful inactive state and lets only the host prepare then remove an exact generation", async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return response("room:one", session());
      if (init?.method === "DELETE") return response("room:one", { ...session(), state: "removed" });
      return response("room:one", null);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<SharedRoomInterpreterPreparationPanel room={room()} isOwner />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare room AI evaluation" }));
    await screen.findByText(/no model is active/i);
    expect(screen.getByText(/credential unconfigured · zero model turns/)).toBeTruthy();
    expect(fetcher.mock.calls[1][1]?.body).toBe("{}");
    fireEvent.click(screen.getByRole("button", { name: "Remove preparation" }));
    await screen.findByText(/Shared AI preparation removed/);
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({
      interpreter_session_id: session().interpreter_session_id, generation: 1,
    });
    expect(screen.getByText(/Status: not prepared/)).toBeTruthy();
  });

  it("lets a guest inspect the state without host controls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("room:one", session())));
    render(<SharedRoomInterpreterPreparationPanel room={room()} isOwner={false} />);
    await screen.findByText(/Only the host can change this preparation/);
    expect(screen.queryByRole("button", { name: /prepar|remove/i })).toBeNull();
  });

  it("shows a configured host payer and fresh-generation limit without claiming AI is active", async () => {
    const configured = { ...session(), generation: 2, state: "configured",
      credential_source: "host_native_profile", expected_payer: "host_openai_project",
      usage_ceiling_turns: 1 };
    vi.stubGlobal("fetch", vi.fn(async () => response("room:one", configured)));
    render(<SharedRoomInterpreterPreparationPanel room={room()} isOwner />);
    await screen.findByText(/host key configured; AI inactive/i);
    expect(screen.getByText(/host's OpenAI project is the expected payer/i)).toBeTruthy();
    expect(screen.getByText(/No provider turn or room AI is active yet/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove room AI setup" })).toBeTruthy();
  });

  it("labels an admitted two-turn developer configuration without claiming a provider turn", async () => {
    const configured = { ...session(), generation: 2, state: "configured",
      credential_source: "host_native_profile", expected_payer: "host_openai_project",
      usage_ceiling_turns: 2, evaluation_profile: "ar2_two_turn_text" };
    vi.stubGlobal("fetch", vi.fn(async () => response("room:one", configured)));
    render(<SharedRoomInterpreterPreparationPanel room={room()} isOwner />);
    await screen.findByText(/two-turn developer evaluation/i);
    expect(screen.getByText(/AI inactive/i)).toBeInTheDocument();
  });

  it("asks native main to select the host key, then confirms the fresh generation", async () => {
    const configured = { ...session(),
      interpreter_session_id: "room_interpreter:22222222-2222-4222-8222-222222222222",
      generation: 2, state: "configured", credential_source: "host_native_profile",
      expected_payer: "host_openai_project", usage_ceiling_turns: 1 };
    const invoke = vi.fn(async () => ({ ok: true, code: "room_interpreter_configured" }));
    vi.stubGlobal("casimirDesktop", { liveConnection: invoke });
    const fetcher = vi.fn(async () => response("room:one", fetcher.mock.calls.length === 1 ? session() : configured));
    vi.stubGlobal("fetch", fetcher);
    render(<SharedRoomInterpreterPreparationPanel room={room()} isOwner />);
    fireEvent.click(await screen.findByRole("button", { name: "Use my configured API key for room AI evaluation" }));
    await screen.findByText(/Every author must approve text again/);
    expect(invoke).toHaveBeenCalledWith({ action: "room_interpreter_configure", room_id: "room:one",
      interpreter_session_id: session().interpreter_session_id, generation: 1 });
    expect(screen.getByText(/host key configured; AI inactive/i)).toBeInTheDocument();
  });

  it("hides the developer-only surface when account policy denies it", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    render(<SharedRoomInterpreterPreparationPanel room={room()} isOwner />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Shared AI preparation")).toBeNull();
  });

  it("does not render a late response from another room", async () => {
    let oldResolve: ((value: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn((url: unknown) => String(url).includes("room%3Aone")
      ? new Promise<Response>(resolve => { oldResolve = resolve; })
      : Promise.resolve(response("room:two", null))));
    const view = render(<SharedRoomInterpreterPreparationPanel room={room("room:one")} isOwner />);
    view.rerender(<SharedRoomInterpreterPreparationPanel room={room("room:two")} isOwner />);
    await screen.findByText(/Status: not prepared/);
    oldResolve?.(response("room:one", session("room:one")));
    await Promise.resolve();
    expect(screen.queryByText(/Generation 1/)).toBeNull();
  });
});
