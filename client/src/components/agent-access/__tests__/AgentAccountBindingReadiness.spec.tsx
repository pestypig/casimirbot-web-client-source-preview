// @vitest-environment jsdom

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";
import {
  AGENT_ACCOUNT_BINDINGS_ENDPOINT,
  AgentAccountBindingReadiness,
  parseAgentAccountBindingReadiness,
} from "../AgentAccountBindingReadiness";

const binding = {
  binding_ref: "agent-binding:sha256:private-binding-reference",
  issuer: "https://issuer.example/oauth?private=query#private-fragment",
  tenant_ref: "tenant:sha256:1234567890abcdef12345678",
  provider: "workos",
  status: "active",
  created_at: "2026-07-26T12:00:00.000Z",
  updated_at: "2026-07-26T12:00:00.000Z",
  revoked_at: null,
  subject_included: false,
  bearer_included: false,
  provider_subject: "private-provider-subject",
  access_token: "private-access-token",
} as const;

const response = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const bindingsBody = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  schema: "helix.agent_account_bindings.v1",
  oauth_ready: true,
  bindings: [binding],
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.casimirDesktop;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AgentAccountBindingReadiness", () => {
  it("rechecks invalidation and rejects the prior in-flight projection",async()=>{
    let finish!:()=>void;
    const oldBody=new Promise(resolve=>{finish=()=>resolve(bindingsBody());});
    const json=vi.fn(()=>oldBody);
    const fetchMock=vi.fn().mockResolvedValueOnce({ok:true,status:200,json})
      .mockResolvedValueOnce(response(bindingsBody({oauth_ready:false,bindings:[]})));
    vi.stubGlobal("fetch",fetchMock);const view=render(<AgentAccountBindingReadiness/>);
    await waitFor(()=>expect(json).toHaveBeenCalledTimes(1));
    act(()=>window.dispatchEvent(new CustomEvent(AGENT_CONNECTION_INVALIDATED_EVENT,{detail:{oauth_ready:true,bindings:[binding]}})));
    await screen.findByText("No active agent binding");expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async()=>finish());expect(screen.queryByText("Account linked for agent access")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);expect(fetchMock.mock.calls.every(call=>call[1].method==="GET")).toBe(true);
    view.unmount();act(()=>window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT)));expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(["request", "body"])("O4 recovery: hung status %s releases refresh and ignores late success", async (stage) => {
    vi.useFakeTimers();
    let release!: () => void;
    const pending = new Promise<any>(resolve => {
      release = () => resolve(stage === "request" ? response(bindingsBody()) : bindingsBody());
    });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => stage === "request" ? pending : Promise.resolve({ ok: true, status: 200, json: () => pending }))
      .mockResolvedValueOnce(response(bindingsBody({ oauth_ready: false, bindings: [] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentAccountBindingReadiness />);
    await act(async () => { await vi.advanceTimersByTimeAsync(14_999); });
    expect(screen.getByRole("button", { name: "Refresh binding status" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText("Binding readiness unavailable")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh binding status" })); });
    expect(screen.getByText("No active agent binding")).toBeInTheDocument();
    await act(async () => { release(); });
    expect(screen.getByText("No active agent binding")).toBeInTheDocument();
    expect(screen.queryByText("Account linked for agent access")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(call => call[1].method === "GET")).toBe(true);
  });
  it("O4 identity: an aborted status body cannot overwrite the newer binding projection", async () => {
    let release!: () => void;
    let completion!: (value: unknown) => void;
    const oldBody = new Promise(resolve => { release = () => resolve(bindingsBody()); });
    const json = vi.fn(() => oldBody);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json })
      .mockResolvedValueOnce(response(bindingsBody({ oauth_ready: false, bindings: [] })));
    vi.stubGlobal("fetch", fetchMock);
    window.casimirDesktop = {
      onAuth0AccountLinkCompletion: (listener: (value: unknown) => void) => {
        completion = listener;
        return () => {};
      },
    } as any;
    render(<AgentAccountBindingReadiness />);
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    await act(async () => { completion({
      schema: "casimir_desktop_auth0_account_link_completion/1", ok: true,
      bearer_included: false, subject_included: false,
    }); });
    expect(await screen.findByText("No active agent binding")).toBeInTheDocument();
    await act(async () => { release(); });
    expect(screen.getByText("No active agent binding")).toBeInTheDocument();
    expect(screen.queryByText("Account linked for agent access")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(call => call[1].method === "GET")).toBe(true);
  });
  it.each(["request", "body"])("O4 recovery: hung start %s times out and late receipt never opens a browser", async (stage) => {
    const receipt = {
      schema: "casimir_desktop_auth0_account_link_start/1", ok: true,
      authorization_url: "https://fixture.invalid/authorize",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      provider: "auth0", pkce: "S256", client_secret_used: false,
      bearer_included: false, subject_included: false,
    };
    let release!: () => void;
    const pending = new Promise<any>(resolve => {
      release = () => resolve(stage === "request" ? response(receipt) : receipt);
    });
    let startSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (_url, options) => {
      if (options?.method !== "POST") return response(bindingsBody({ oauth_ready: false, bindings: [] }));
      startSignal = options.signal;
      return stage === "request" ? pending : { ok: true, json: () => pending };
    });
    vi.stubGlobal("fetch", fetchMock);
    const open = vi.fn(async () => ({ opened: true }));
    window.casimirDesktop = { openAuth0AccountLink: open } as any;
    render(<AgentAccountBindingReadiness />);
    const start = await screen.findByRole("button", { name: "Link Auth0" });
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(start); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByRole("alert")).toHaveTextContent("reached its deadline");
    expect(startSignal?.aborted).toBe(true);
    await act(async () => { release(); });
    expect(screen.getByRole("button", { name: "Link Auth0" })).not.toBeDisabled();
    expect(open).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
    expect(screen.queryByText("Account linked for agent access")).not.toBeInTheDocument();
  });
  it.each(["resolve", "reject"])("O4 recovery: a hung native open expires and late %s cannot replace the deadline", async (settlement) => {
    let settleOpen!: () => void;
    const open = vi.fn(() => new Promise<{ opened: boolean }>((resolve, reject) => {
      settleOpen = () => settlement === "resolve" ? resolve({ opened: true }) : reject(new Error("late native failure"));
    }));
    const fetchMock = vi.fn(async (_url, options) => response(options?.method === "POST" ? {
      schema: "casimir_desktop_auth0_account_link_start/1", ok: true,
      authorization_url: "https://tenant.auth0.com/authorize",
      expires_at: new Date(Date.now() - 1).toISOString(),
      provider: "auth0", pkce: "S256", client_secret_used: false,
      bearer_included: false, subject_included: false,
    } : bindingsBody({ oauth_ready: false, bindings: [] })));
    vi.stubGlobal("fetch", fetchMock);
    window.casimirDesktop = { openAuth0AccountLink: open } as any;
    render(<AgentAccountBindingReadiness />);
    fireEvent.click(await screen.findByRole("button", { name: "Link Auth0" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("reached its deadline");
    await act(async () => { settleOpen(); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Link Auth0" })).not.toBeDisabled());
    expect(screen.queryByRole("button", { name: "Stop waiting" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("reached its deadline");
    expect(open).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
    expect(screen.queryByText("Account linked for agent access")).not.toBeInTheDocument();
  });
  it("releases an elapsed callback wait without another OAuth write", async () => {
    const fetchMock = vi.fn(async (_url, options) => response(options?.method === "POST" ? {
      schema: "casimir_desktop_auth0_account_link_start/1", ok: true,
      authorization_url: "https://tenant.auth0.com/authorize",
      expires_at: new Date(Date.now() - 1).toISOString(),
      provider: "auth0", pkce: "S256", client_secret_used: false,
      bearer_included: false, subject_included: false,
    } : bindingsBody({ oauth_ready: false, bindings: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const open = vi.fn(async () => ({ opened: true }));
    window.casimirDesktop = { openAuth0AccountLink: open } as any;
    render(<AgentAccountBindingReadiness />);
    fireEvent.click(await screen.findByRole("button", { name: "Link Auth0" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("reached its deadline");
    expect(await screen.findByRole("button", { name: "Link Auth0" })).not.toBeDisabled();
    expect(open).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "GET")).toHaveLength(2);
    expect(screen.queryByText("Account linked for agent access")).not.toBeInTheDocument();
  });
  it("shows a callback-route failure without leaving account linking busy", async () => {
    const fetchMock = vi.fn(async (_url, options) => response(options?.method === "POST" ? {
      schema: "casimir_desktop_auth0_account_link_start/1", ok: true,
      authorization_url: "https://tenant.auth0.com/authorize",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      provider: "auth0", pkce: "S256", client_secret_used: false,
      bearer_included: false, subject_included: false,
    } : bindingsBody({ oauth_ready: false, bindings: [] })));
    vi.stubGlobal("fetch", fetchMock);
    window.casimirDesktop = {
      openAuth0AccountLink: vi.fn(async () => {
        throw new Error("Error invoking remote method 'account-link': Error: desktop_auth0_callback_route_unavailable");
      }),
    } as any;
    render(<AgentAccountBindingReadiness />);
    fireEvent.click(await screen.findByRole("button", { name: "Link Auth0" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot receive its Auth0 callback");
    expect(screen.getByRole("button", { name: "Link Auth0" })).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: "Stop waiting" })).not.toBeInTheDocument();
  });
  it("renders only sanitized provider, issuer, status, and tenant references", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(bindingsBody()));
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentAccountBindingReadiness />);

    expect(
      await screen.findByText("Account linked for agent access"),
    ).toBeInTheDocument();
    expect(screen.getByText("workos")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(
      screen.getByText("https://issuer.example/oauth"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("tenant:sha256:1234567890abcdef12345678"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("agent-binding:sha256:private-binding-reference"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("private-provider-subject"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("private-access-token")).not.toBeInTheDocument();
    expect(
      screen.queryByText("2026-07-26T12:00:00.000Z"),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      AGENT_ACCOUNT_BINDINGS_ENDPOINT,
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("distinguishes a signed-in profile with no active binding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(
          bindingsBody({
            oauth_ready: false,
            bindings: [
              {
                ...binding,
                status: "revoked",
                revoked_at: "2026-07-26T13:00:00.000Z",
              },
            ],
          }),
        ),
      ),
    );

    render(<AgentAccountBindingReadiness />);

    expect(
      await screen.findByText("No active agent binding"),
    ).toBeInTheDocument();
    expect(screen.getByText("revoked")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This signed-in profile has no active OAuth agent binding. This read-only panel cannot create, reactivate, or authorize one.",
      ),
    ).toBeInTheDocument();
  });

  it("distinguishes signed-out state from service configuration failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          {
            ok: false,
            error: "session_required",
            message: "Private server detail must not render.",
          },
          401,
        ),
      )
      .mockResolvedValueOnce(
        response(
          {
            ok: false,
            error: "oauth_provider_not_configured",
            message: "Private configuration detail must not render.",
          },
          503,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const first = render(<AgentAccountBindingReadiness />);
    expect(
      await screen.findByText("Sign in to check binding status"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Private server detail must not render."),
    ).not.toBeInTheDocument();
    first.unmount();

    render(<AgentAccountBindingReadiness />);
    expect(
      await screen.findByText("Binding readiness unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Private configuration detail must not render."),
    ).not.toBeInTheDocument();
  });

  it("fails closed when oauth_ready disagrees with the sanitized bindings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(
          bindingsBody({
            oauth_ready: true,
            bindings: [],
          }),
        ),
      ),
    );

    render(<AgentAccountBindingReadiness />);

    expect(
      await screen.findByText("Binding readiness unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Account linked for agent access"),
    ).not.toBeInTheDocument();
  });

  it("offers only a read-only GET refresh and no generic link action", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response(bindingsBody({ oauth_ready: false, bindings: [] })),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentAccountBindingReadiness />);
    await screen.findByText("No active agent binding");

    expect(
      screen.queryByRole("button", { name: /link|authorize|connect/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh binding status" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe(AGENT_ACCOUNT_BINDINGS_ENDPOINT);
      expect(call[1]).toEqual(
        expect.objectContaining({
          method: "GET",
        }),
      );
    }
  });

  it("starts the narrow Auth0 PKCE link only through the native bridge", async () => {
    let completion: ((state: unknown) => void) | null = null;
    const authorizationUrl =
      "https://tenant.auth0.com/authorize?response_type=code&client_id=nativeClientId_123456&redirect_uri=casimirbot%3A%2F%2Foauth%2Fcallback&scope=openid+profile&audience=https%3A%2F%2Fcasimirbot.com%2Fmcp&state=sssssssssssssssssssssssssssssssssssssssssss&code_challenge=ccccccccccccccccccccccccccccccccccccccccccc&code_challenge_method=S256";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(bindingsBody({ oauth_ready: false, bindings: [] })),
      )
      .mockResolvedValueOnce(
        response({
          schema: "casimir_desktop_auth0_account_link_start/1",
          ok: true,
          authorization_url: authorizationUrl,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          provider: "auth0",
          pkce: "S256",
          client_secret_used: false,
          bearer_included: false,
          subject_included: false,
        }),
      )
      .mockResolvedValueOnce(response(bindingsBody({ oauth_ready: false, bindings: [] })))
      .mockResolvedValueOnce(response(bindingsBody()));
    vi.stubGlobal("fetch", fetchMock);
    const openAuth0AccountLink = vi.fn(async () => ({ opened: true }));
    window.casimirDesktop = Object.freeze({
      getRuntimeSnapshot: vi.fn(async () => null),
      openAuth0AccountLink,
      onAuth0AccountLinkCompletion: (listener) => {
        completion = listener;
        return () => {
          completion = null;
        };
      },
    });

    render(<AgentAccountBindingReadiness />);
    const linkButton = await screen.findByRole("button", { name: "Link Auth0" });
    expect(linkButton).toHaveAttribute(
      "data-helix-guidance-target",
      "auth0-account-link",
    );
    fireEvent.click(linkButton);
    await waitFor(() =>
      expect(openAuth0AccountLink).toHaveBeenCalledWith(authorizationUrl),
    );
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/account/session/agent-bindings/auth0/start",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    ]);

    fireEvent.click(await screen.findByRole("button", { name: "Stop waiting" }));
    expect(await screen.findByRole("button", { name: "Link Auth0" })).not.toBeDisabled();
    expect(openAuth0AccountLink).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("does not cancel an authorization already submitted");
    expect(screen.queryByText("Account linked for agent access")).not.toBeInTheDocument();

    completion?.({
      schema: "casimir_desktop_auth0_account_link_completion/1",
      ok: true,
      bearer_included: false,
      subject_included: false,
    });
    expect(
      await screen.findByText("Account linked for agent access"),
    ).toBeInTheDocument();
  });

  it("shows a safe actionable error when Auth0 omits the signed tenant claim", async () => {
    let completion: ((state: unknown) => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(bindingsBody({ oauth_ready: false, bindings: [] })),
      ),
    );
    window.casimirDesktop = Object.freeze({
      getRuntimeSnapshot: vi.fn(async () => null),
      openAuth0AccountLink: vi.fn(async () => ({ opened: true })),
      onAuth0AccountLinkCompletion: (listener) => {
        completion = listener;
        return () => {
          completion = null;
        };
      },
    });

    render(<AgentAccountBindingReadiness />);
    await screen.findByText("No active agent binding");
    completion?.({
      schema: "casimir_desktop_auth0_account_link_completion/1",
      ok: false,
      error: "signed_tenant_claim_missing",
      bearer_included: false,
      subject_included: false,
    });

    expect(
      await screen.findByText(/missing the CasimirBot tenant claim/i),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Bearer|auth0\|/);
  });
});

describe("parseAgentAccountBindingReadiness", () => {
  it("rejects projections that could include subjects or bearer material", () => {
    expect(
      parseAgentAccountBindingReadiness(
        bindingsBody({
          bindings: [
            {
              ...binding,
              bearer_included: true,
            },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      parseAgentAccountBindingReadiness(
        bindingsBody({
          bindings: [
            {
              ...binding,
              subject_included: true,
            },
          ],
        }),
      ),
    ).toBeNull();
  });
});

