import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentRunObserverApiError,
  agentRunObserverApi,
} from "../AgentRunObserverApi";

const binding = {
  binding_ref: "binding-a",
  status: "pending_claim",
  claim_expires_at: "2026-07-26T16:00:00.000Z",
  context_snapshot_ref: "context-a",
  context_message_count: 1,
  created_at: "2026-07-26T15:00:00.000Z",
  updated_at: "2026-07-26T15:00:00.000Z",
};

const falseAuthority = {
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agentRunObserverApi", () => {
  it("creates a cookie-auth binding and returns the one-time claim handle", async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(
      async () =>
        new Response(
          JSON.stringify({
            schema: "helix.agent_run_observer.binding_receipt.v1",
            ok: true,
            error: null,
            message: null,
            binding,
            claim_handle: "https://example.test/agent-claim/once",
            claim_handle_shown_once: true,
            ...falseAuthority,
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const receipt = await agentRunObserverApi.createBinding({
      chat_session_id: "chat-a",
      context: {
        messages: [
          {
            role: "user",
            content: "Observe the selected chat only.",
          },
        ],
      },
    });

    expect(receipt.claim_handle).toContain("/agent-claim/once");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/agent-run-observer/bindings",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        cache: "no-store",
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      chat_session_id: "chat-a",
      context: {
        messages: [
          {
            role: "user",
            content: "Observe the selected chat only.",
          },
        ],
      },
    });
  });

  it("polls from the explicit after_seq cursor", async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(
      async () =>
        new Response(
          JSON.stringify({
            schema: "helix.agent_run_observer.events_page.v1",
            binding_ref: "binding-a",
            events: [],
            next_after_seq: 12,
            has_more: false,
            terminal_message: null,
            ...falseAuthority,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await agentRunObserverApi.listEvents("binding-a", {
      afterSeq: 7,
      limit: 25,
    });

    expect(page.next_after_seq).toBe(12);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/agi/agent-run-observer/bindings/binding-a/events?after_seq=7&limit=25",
    );
  });

  it("normalizes an intentionally handle-free binding read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              schema: "helix.agent_run_observer.binding_receipt.v1",
              ok: true,
              error: null,
              message: null,
              binding: { ...binding, status: "active" },
              ...falseAuthority,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );

    const receipt = await agentRunObserverApi.getBinding("binding-a");

    expect(receipt.claim_handle).toBeNull();
    expect(receipt.claim_handle_shown_once).toBe(false);
  });

  it("disconnects by exact opaque ref with cookies and accepts only a revoked false-authority receipt", async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(
      async () =>
        new Response(
          JSON.stringify({
            schema: "helix.agent_run_observer.binding_receipt.v1",
            ok: true,
            error: null,
            message: "Observer binding disconnected.",
            binding: { ...binding, status: "revoked" },
            claim_handle: null,
            claim_handle_shown_once: false,
            ...falseAuthority,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const receipt = await agentRunObserverApi.disconnectBinding("binding-a");

    expect(receipt.binding.status).toBe("revoked");
    expect(receipt.answer_authority).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/agent-run-observer/bindings/binding-a",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.body).toBeUndefined();
  });

  it("rejects a page whose receipt envelope claims assistant authority", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              schema: "helix.agent_run_observer.events_page.v1",
              binding_ref: "binding-a",
              events: [],
              next_after_seq: 0,
              has_more: false,
              terminal_message: null,
              ...falseAuthority,
              assistant_answer: true,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );

    const expectedError = {
      code: "observer_response_invalid",
      status: 502,
    } satisfies Partial<AgentRunObserverApiError>;
    await expect(
      agentRunObserverApi.listEvents("binding-a"),
    ).rejects.toMatchObject(expectedError);
  });
});
