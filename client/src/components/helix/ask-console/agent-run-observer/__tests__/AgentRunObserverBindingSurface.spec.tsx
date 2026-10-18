// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  HELIX_DEVELOPER_ACCOUNT_POLICY,
  HELIX_USER_ACCOUNT_POLICY,
  buildHelixSharedRealtimeRoomsExperimentPolicy,
} from "@shared/helix-account-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgiChatStore } from "@/store/useAgiChatStore";

const mocks = vi.hoisted(() => ({
  createBinding: vi.fn(),
  disconnectBinding: vi.fn(),
  getBinding: vi.fn(),
  listEvents: vi.fn(),
  fetchPolicy: vi.fn(),
  readPolicy: vi.fn(),
  useObserver: vi.fn(),
}));

vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT:
    "helix-account-capability-policy-changed",
  fetchAccountCapabilityPolicy: mocks.fetchPolicy,
  readCachedAccountCapabilityPolicy: mocks.readPolicy,
}));

vi.mock("../AgentRunObserverApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../AgentRunObserverApi")>();
  return {
    ...actual,
    agentRunObserverApi: {
      createBinding: mocks.createBinding,
      disconnectBinding: mocks.disconnectBinding,
      getBinding: mocks.getBinding,
      listEvents: mocks.listEvents,
    },
  };
});

vi.mock("../useAgentRunObserver", () => ({
  useAgentRunObserver: mocks.useObserver,
}));

import { AgentRunObserverApiError } from "../AgentRunObserverApi";
import {
  AgentRunObserverBindingSurface,
  readStoredAgentRunObserverBinding,
  removeStoredAgentRunObserverBinding,
  storeAgentRunObserverBinding,
} from "../AgentRunObserverBindingSurface";

const pendingReceipt = {
  schema: "helix.agent_run_observer.binding_receipt.v1",
  ok: true,
  error: null,
  message: null,
  binding: {
    binding_ref: "chat-binding:opaque-1",
    status: "pending_claim",
    claim_expires_at: "2030-01-01T00:00:00.000Z",
    context_snapshot_ref: "chat-context:opaque-1",
    context_message_count: 2,
    created_at: "2029-12-31T23:59:00.000Z",
    updated_at: "2029-12-31T23:59:00.000Z",
  },
  claim_handle: "chat-claim:shown-once",
  claim_handle_shown_once: true,
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
} as const;

const revokedReceipt = {
  ...pendingReceipt,
  message: "Observer binding disconnected.",
  binding: {
    ...pendingReceipt.binding,
    status: "revoked",
    updated_at: "2030-01-01T00:00:01.000Z",
  },
  claim_handle: null,
  claim_handle_shown_once: false,
} as const;

const activeReceipt = {
  ...pendingReceipt,
  binding: {
    ...pendingReceipt.binding,
    status: "active",
  },
  claim_handle: null,
  claim_handle_shown_once: false,
} as const;

describe("AgentRunObserverBindingSurface", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.readPolicy.mockReturnValue(HELIX_DEVELOPER_ACCOUNT_POLICY);
    mocks.fetchPolicy.mockResolvedValue(HELIX_DEVELOPER_ACCOUNT_POLICY);
    mocks.createBinding.mockResolvedValue(pendingReceipt);
    mocks.disconnectBinding.mockResolvedValue(revokedReceipt);
    mocks.useObserver.mockReturnValue({
      bindingRef: null,
      chatSessionId: null,
      phase: "idle",
      events: [],
      afterSeq: 0,
      terminalMessageId: null,
      error: null,
    });
    useAgiChatStore.setState({
      sessions: {
        "chat-selected": {
          id: "chat-selected",
          title: "Selected room chat",
          contextId: "desktop",
          createdAt: "2029-12-31T23:00:00.000Z",
          updatedAt: "2029-12-31T23:30:00.000Z",
          personaId: "default",
          messages: [
            {
              id: "message-user",
              role: "user",
              content: "Please observe the room.",
              at: "2029-12-31T23:10:00.000Z",
              tokens: 6,
            },
            {
              id: "message-assistant",
              role: "assistant",
              content: "I will wait for current evidence.",
              at: "2029-12-31T23:11:00.000Z",
              tokens: 8,
            },
          ],
        },
      },
      activeId: "chat-selected",
      hydrated: true,
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
    useAgiChatStore.setState({
      sessions: {},
      activeId: undefined,
      hydrated: false,
    });
  });

  it("requires an explicit click and binds only the selected chat", async () => {
    render(<AgentRunObserverBindingSurface contextId="desktop" />);

    expect(mocks.createBinding).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Authorize selected chat",
      }),
    );

    await waitFor(() => expect(mocks.createBinding).toHaveBeenCalledTimes(1));
    expect(mocks.createBinding).toHaveBeenCalledWith({
      chat_session_id: "chat-selected",
      context: {
        messages: [
          {
            role: "user",
            content: "Please observe the room.",
            at: "2029-12-31T23:10:00.000Z",
          },
          {
            role: "assistant",
            content: "I will wait for current evidence.",
            at: "2029-12-31T23:11:00.000Z",
          },
        ],
      },
    });
    expect(
      await screen.findByText("chat-claim:shown-once"),
    ).toBeInTheDocument();
    expect(readStoredAgentRunObserverBinding("chat-selected")).toEqual({
      bindingRef: "chat-binding:opaque-1",
      chatSessionId: "chat-selected",
    });
  });

  it("disconnects the exact binding, clears both browser stores, and returns to authorization", async () => {
    const key = "helix.agent-run-observer.binding.v1:chat-selected";
    const view = render(<AgentRunObserverBindingSurface contextId="desktop" />);
    fireEvent.click(
      await view.findByRole("button", {
        name: "Authorize selected chat",
      }),
    );
    expect(await view.findByText("chat-claim:shown-once")).toBeInTheDocument();
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        bindingRef: "chat-binding:opaque-1",
        chatSessionId: "chat-selected",
      }),
    );

    fireEvent.click(view.getByRole("button", { name: "Disconnect" }));

    await waitFor(() =>
      expect(mocks.disconnectBinding).toHaveBeenCalledWith(
        "chat-binding:opaque-1",
      ),
    );
    expect(
      await view.findByRole("button", {
        name: "Authorize selected chat",
      }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(view.queryByText("chat-claim:shown-once")).toBeNull();
  });

  it.each([404, 410])(
    "clears an already unavailable binding locally when disconnect returns %s",
    async (status) => {
      const key = "helix.agent-run-observer.binding.v1:chat-selected";
      mocks.disconnectBinding.mockRejectedValueOnce(
        new AgentRunObserverApiError({
          code: status === 404 ? "not_found" : "binding_expired",
          status,
          message: status === 404
            ? "Observer binding not found."
            : "The observer binding has expired.",
        }),
      );
      const view = render(
        <AgentRunObserverBindingSurface contextId="desktop" />,
      );
      fireEvent.click(
        await view.findByRole("button", {
          name: "Authorize selected chat",
        }),
      );
      expect(await view.findByText("chat-claim:shown-once")).toBeInTheDocument();
      window.sessionStorage.setItem(
        key,
        JSON.stringify({
          bindingRef: "chat-binding:opaque-1",
          chatSessionId: "chat-selected",
        }),
      );

      fireEvent.click(view.getByRole("button", { name: "Disconnect" }));

      await waitFor(() =>
        expect(mocks.disconnectBinding).toHaveBeenCalledWith(
          "chat-binding:opaque-1",
        ),
      );
      expect(
        await view.findByRole("button", {
          name: "Authorize selected chat",
        }),
      ).toBeInTheDocument();
      expect(window.localStorage.getItem(key)).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
      expect(view.queryByRole("alert")).toBeNull();
    },
  );

  it("self-heals a durable binding from a previous browser profile after an inspect 404", async () => {
    const key = "helix.agent-run-observer.binding.v1:chat-selected";
    const otherKey = "helix.agent-run-observer.binding.v1:chat-other";
    const stale = JSON.stringify({
      bindingRef: "chat-binding:previous-profile",
      chatSessionId: "chat-selected",
    });
    window.localStorage.setItem(key, stale);
    window.sessionStorage.setItem(key, stale);
    window.localStorage.setItem(
      otherKey,
      JSON.stringify({
        bindingRef: "chat-binding:other-chat",
        chatSessionId: "chat-other",
      }),
    );
    mocks.getBinding.mockRejectedValueOnce(
      new AgentRunObserverApiError({
        code: "not_found",
        status: 404,
        message: "Observer binding not found.",
      }),
    );

    const view = render(<AgentRunObserverBindingSurface contextId="desktop" />);

    await waitFor(() =>
      expect(mocks.getBinding).toHaveBeenCalledWith(
        "chat-binding:previous-profile",
      ),
    );
    await waitFor(() => {
      expect(window.localStorage.getItem(key)).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    });
    expect(window.localStorage.getItem(otherKey)).toContain(
      "chat-binding:other-chat",
    );
    expect(
      view.getByRole("button", { name: "Authorize selected chat" }),
    ).toBeInTheDocument();
    expect(view.queryByRole("button", { name: "Disconnect" })).toBeNull();
    expect(view.queryByRole("alert")).toBeNull();
    expect(mocks.disconnectBinding).not.toHaveBeenCalled();
  });

  it.each([404, 410])(
    "locally detaches an active binding after a non-enumerating events or terminal $status",
    async (status) => {
      const unavailable = new AgentRunObserverApiError({
        code: status === 404 ? "not_found" : "binding_revoked",
        status,
        message: "Observer binding not found.",
      });
      mocks.createBinding.mockResolvedValueOnce(activeReceipt);
      mocks.useObserver.mockImplementation(
        (input: { bindingRef?: string | null }) => ({
          bindingRef: input.bindingRef ?? null,
          chatSessionId: input.bindingRef ? "chat-selected" : null,
          phase: input.bindingRef ? "error" : "idle",
          events: [],
          afterSeq: 0,
          terminalMessageId: null,
          error: input.bindingRef ? unavailable : null,
        }),
      );
      const key = "helix.agent-run-observer.binding.v1:chat-selected";
      const view = render(
        <AgentRunObserverBindingSurface contextId="desktop" />,
      );

      fireEvent.click(
        await view.findByRole("button", {
          name: "Authorize selected chat",
        }),
      );

      await waitFor(() =>
        expect(mocks.useObserver).toHaveBeenCalledWith(
          expect.objectContaining({
            bindingRef: "chat-binding:opaque-1",
            chatSessionId: "chat-selected",
            enabled: true,
          }),
        ),
      );
      await waitFor(() => expect(window.localStorage.getItem(key)).toBeNull());
      expect(
        view.getByRole("button", { name: "Authorize selected chat" }),
      ).toBeInTheDocument();
      expect(view.queryByRole("button", { name: "Disconnect" })).toBeNull();
      expect(view.queryByRole("alert")).toBeNull();
      expect(mocks.disconnectBinding).not.toHaveBeenCalled();
    },
  );

  it("stays absent for the public user policy", () => {
    mocks.readPolicy.mockReturnValue(HELIX_USER_ACCOUNT_POLICY);
    mocks.fetchPolicy.mockResolvedValue(HELIX_USER_ACCOUNT_POLICY);

    render(<AgentRunObserverBindingSurface contextId="desktop" />);

    expect(
      screen.queryByRole("button", { name: "Authorize selected chat" }),
    ).not.toBeInTheDocument();
  });

  it("follows the shared-room feature policy for an enabled user account", async () => {
    const enabledUserPolicy =
      buildHelixSharedRealtimeRoomsExperimentPolicy("user");
    mocks.readPolicy.mockReturnValue(enabledUserPolicy);
    mocks.fetchPolicy.mockResolvedValue(enabledUserPolicy);
    mocks.getBinding.mockResolvedValue(activeReceipt);
    window.localStorage.setItem(
      "helix.agent-run-observer.binding.v1:chat-selected",
      JSON.stringify({
        bindingRef: "chat-binding:opaque-1",
        chatSessionId: "chat-selected",
      }),
    );

    render(<AgentRunObserverBindingSurface contextId="desktop" />);

    await waitFor(() =>
      expect(mocks.getBinding).toHaveBeenCalledWith("chat-binding:opaque-1"),
    );
    await waitFor(() =>
      expect(mocks.useObserver).toHaveBeenCalledWith(
        expect.objectContaining({
          bindingRef: "chat-binding:opaque-1",
          chatSessionId: "chat-selected",
          enabled: true,
        }),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
    expect(mocks.createBinding).not.toHaveBeenCalled();
  });

  it("synchronizes an exact binding created and removed by another browser tab", async () => {
    mocks.getBinding.mockResolvedValue(activeReceipt);
    const key = "helix.agent-run-observer.binding.v1:chat-selected";
    const serialized = JSON.stringify({
      bindingRef: "chat-binding:opaque-1",
      chatSessionId: "chat-selected",
    });
    const view = render(<AgentRunObserverBindingSurface contextId="desktop" />);
    expect(
      await view.findByRole("button", {
        name: "Authorize selected chat",
      }),
    ).toBeInTheDocument();

    window.localStorage.setItem(key, serialized);
    fireEvent(
      window,
      new StorageEvent("storage", {
        key,
        newValue: serialized,
        storageArea: window.localStorage,
      }),
    );

    await waitFor(() =>
      expect(mocks.getBinding).toHaveBeenCalledWith("chat-binding:opaque-1"),
    );
    await waitFor(() =>
      expect(mocks.useObserver).toHaveBeenCalledWith(
        expect.objectContaining({
          bindingRef: "chat-binding:opaque-1",
          chatSessionId: "chat-selected",
          enabled: true,
        }),
      ),
    );
    expect(
      view.getByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();

    window.localStorage.removeItem(key);
    fireEvent(
      window,
      new StorageEvent("storage", {
        key,
        oldValue: serialized,
        newValue: null,
        storageArea: window.localStorage,
      }),
    );

    expect(
      await view.findByRole("button", {
        name: "Authorize selected chat",
      }),
    ).toBeInTheDocument();
    expect(view.queryByRole("button", { name: "Disconnect" })).toBeNull();
    expect(mocks.disconnectBinding).not.toHaveBeenCalled();
  });

  it("shows an observer only in its exact bound chat and restores it when that chat is selected again", async () => {
    const key = "helix.agent-run-observer.binding.v1:chat-selected";
    window.localStorage.setItem(
      key,
      JSON.stringify({
        bindingRef: "chat-binding:opaque-1",
        chatSessionId: "chat-selected",
      }),
    );
    mocks.getBinding.mockResolvedValue(activeReceipt);
    const view = render(<AgentRunObserverBindingSurface contextId="desktop" />);

    expect(
      await view.findByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
    useAgiChatStore.setState((state) => ({
      sessions: {
        ...state.sessions,
        "chat-other": {
          ...state.sessions["chat-selected"],
          id: "chat-other",
          title: "Other chat",
          messages: [],
        },
      },
      activeId: "chat-other",
    }));

    expect(
      await view.findByRole("button", {
        name: "Authorize selected chat",
      }),
    ).toBeInTheDocument();
    expect(view.queryByRole("button", { name: "Disconnect" })).toBeNull();
    expect(window.localStorage.getItem(key)).toContain("chat-binding:opaque-1");

    useAgiChatStore.getState().setActive("chat-selected");

    await waitFor(() => expect(mocks.getBinding).toHaveBeenCalledTimes(2));
    expect(
      await view.findByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
    expect(mocks.disconnectBinding).not.toHaveBeenCalled();
  });

  it("omits context when the selected chat has no admissible messages", async () => {
    useAgiChatStore.setState((state) => ({
      sessions: {
        ...state.sessions,
        "chat-selected": {
          ...state.sessions["chat-selected"],
          messages: [],
        },
      },
    }));

    render(<AgentRunObserverBindingSurface contextId="desktop" />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Authorize selected chat",
      }),
    );

    await waitFor(() => expect(mocks.createBinding).toHaveBeenCalledTimes(1));
    expect(mocks.createBinding).toHaveBeenCalledWith({
      chat_session_id: "chat-selected",
      context: undefined,
    });
  });

  it("stores only the opaque binding and selected chat identifiers durably", () => {
    storeAgentRunObserverBinding({
      bindingRef: "chat-binding:opaque-2",
      chatSessionId: "chat-selected",
    });

    const serialized =
      window.localStorage.getItem(
        "helix.agent-run-observer.binding.v1:chat-selected",
      ) ?? "";
    expect(serialized).toContain("chat-binding:opaque-2");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("tenant");
    expect(serialized).not.toContain("profile");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("migrates a valid legacy tab binding and removes both stores explicitly", () => {
    const key = "helix.agent-run-observer.binding.v1:chat-selected";
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        bindingRef: "chat-binding:legacy",
        chatSessionId: "chat-selected",
      }),
    );

    expect(readStoredAgentRunObserverBinding("chat-selected")).toEqual({
      bindingRef: "chat-binding:legacy",
      chatSessionId: "chat-selected",
    });
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(window.localStorage.getItem(key)).toContain("chat-binding:legacy");

    removeStoredAgentRunObserverBinding("chat-selected");
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it("removes only the expected stale ref when the same chat already has a newer durable binding", () => {
    const key = "helix.agent-run-observer.binding.v1:chat-selected";
    window.localStorage.setItem(
      key,
      JSON.stringify({
        bindingRef: "chat-binding:new-profile",
        chatSessionId: "chat-selected",
      }),
    );
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        bindingRef: "chat-binding:previous-profile",
        chatSessionId: "chat-selected",
      }),
    );

    removeStoredAgentRunObserverBinding(
      "chat-selected",
      "chat-binding:previous-profile",
    );

    expect(window.localStorage.getItem(key)).toContain(
      "chat-binding:new-profile",
    );
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });
});
