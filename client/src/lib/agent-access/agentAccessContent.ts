import { buildWorkstationEntryUrl } from "@shared/workstation-link-meta";
import { AGENT_ACCESS_REASONING_BRIEF, PUBLIC_REASONING_CONTEXT } from "@shared/agent-access-reasoning";

export const CASIMIRBOT_PUBLIC_ORIGIN = "https://casimirbot.com";

export const AGENT_ACCESS_CONNECTION_WARNING =
  "A model that retrieves this page can read and cite it, but retrieval alone cannot invoke CasimirBot tools. A user, application developer, plugin, or surrounding agent harness must explicitly add the MCP endpoint and authorize access.";

export const AGENT_ACCESS_CREDENTIAL_WARNING =
  "Complete OAuth through the client or its surrounding harness. Keep access tokens and other secrets out of prompts, URLs, browser code, and copied configuration.";

export type AgentAccessEndpointId =
  "mcp" | "rest" | "oauth" | "manifest" | "workstation";

export type AgentAccessEndpoint = {
  id: AgentAccessEndpointId;
  label: string;
  url: string;
  description: string;
  protected: boolean;
};

export type AgentAccessProviderId =
  | "openai-chatgpt"
  | "openai-responses"
  | "openai-codex"
  | "gemini-interactions"
  | "gemini-code-assist";

export type AgentAccessProviderGuide = {
  id: AgentAccessProviderId;
  provider: "OpenAI" | "Google";
  surface: string;
  format: string;
  summary: string;
  snippet: string;
  authentication: string;
  notes: readonly string[];
};

export type AgentAccessContent = {
  eyebrow: string;
  title: string;
  summary: string;
  connectionNotice: {
    title: string;
    body: string;
    credentialSafety: string;
  };
  reasoningBrief: {
    title: string;
    intro: string;
    steps: readonly string[];
    boundary: string;
  };
  publicContext: {
    title: string;
    intro: string;
    url: string;
    lenses: readonly { title: string; summary: string }[];
    example: string;
  };
  endpoints: readonly AgentAccessEndpoint[];
  providers: readonly AgentAccessProviderGuide[];
  lifecycle: {
    title: string;
    body: string;
    statuses: readonly string[];
  };
  authority: {
    title: string;
    body: string;
  };
};

const withoutTrailingSlash = (origin: string): string =>
  origin.trim().replace(/\/+$/, "");

const stringifyJson = (value: unknown): string =>
  JSON.stringify(value, null, 2);

export const createAgentAccessContent = (
  origin = CASIMIRBOT_PUBLIC_ORIGIN,
): AgentAccessContent => {
  const publicOrigin = withoutTrailingSlash(origin) || CASIMIRBOT_PUBLIC_ORIGIN;
  const mcpUrl = `${publicOrigin}/mcp`;

  return {
    eyebrow: "CasimirBot / Helix",
    title: "Agent Access",
    summary:
      "Connect an AI client or surrounding harness to CasimirBot's OAuth-protected, provider-neutral Streamable HTTP MCP service.",
    connectionNotice: {
      title: "An explicit connection is required",
      body: AGENT_ACCESS_CONNECTION_WARNING,
      credentialSafety: AGENT_ACCESS_CREDENTIAL_WARNING,
    },
    reasoningBrief: AGENT_ACCESS_REASONING_BRIEF,
    publicContext: {
      ...PUBLIC_REASONING_CONTEXT,
      url: `${publicOrigin}${PUBLIC_REASONING_CONTEXT.path}`,
    },
    endpoints: [
      {
        id: "mcp",
        label: "Streamable HTTP MCP",
        url: mcpUrl,
        description:
          "Agent-facing tool discovery and invocation over OAuth-protected Streamable HTTP.",
        protected: true,
      },
      {
        id: "rest",
        label: "Durable run REST API",
        url: `${publicOrigin}/api/v1/agent-runs`,
        description:
          "Application-facing start, continue, inspect, evidence, event, and cancel operations.",
        protected: true,
      },
      {
        id: "oauth",
        label: "OAuth protected-resource metadata",
        url: `${publicOrigin}/.well-known/oauth-protected-resource/mcp`,
        description:
          "Authorization-server and resource discovery for clients that connect to the MCP endpoint.",
        protected: false,
      },
      {
        id: "manifest",
        label: "CasimirBot discovery metadata",
        url: `${publicOrigin}/agent-access.json`,
        description:
          "Machine-readable CasimirBot links. This is discovery metadata, not an MCP or provider-standard manifest.",
        protected: false,
      },
      {
        id: "workstation",
        label: "Workstation configuration",
        url: buildWorkstationEntryUrl({
          baseUrl: publicOrigin,
          search: "?panels=agent-access&focus=agent-access",
          entry: "workstation",
        }),
        description:
          "Human-facing connection guidance inside the CasimirBot workstation.",
        protected: false,
      },
    ],
    providers: [
      {
        id: "openai-chatgpt",
        provider: "OpenAI",
        surface: "ChatGPT",
        format: "Developer mode connection",
        summary:
          "Add CasimirBot's public MCP endpoint in ChatGPT Developer mode, review the discovered tools, and authorize the connection before use.",
        snippet: [
          "Settings → Security and login → Developer mode: On",
          "Settings → Plugins → +",
          "MCP server URL:",
          mcpUrl,
        ].join("\n"),
        authentication:
          "ChatGPT discovers the OAuth metadata and starts its authorization-code + PKCE flow when protected tools require an account.",
        notes: [
          "Developer mode availability depends on the user's account and workspace policy.",
          "A broadly distributed ChatGPT integration must be packaged and published as a reviewed plugin; finding this page does not install it.",
        ],
      },
      {
        id: "openai-responses",
        provider: "OpenAI",
        surface: "Responses API",
        format: "JSON request fragment",
        summary:
          "Add CasimirBot as a remote MCP tool and keep approval enabled while establishing the trust boundary.",
        snippet: stringifyJson({
          tools: [
            {
              type: "mcp",
              server_label: "casimirbot",
              server_url: mcpUrl,
              authorization: "<OAUTH_ACCESS_TOKEN>",
              require_approval: "always",
            },
          ],
        }),
        authentication:
          "The application obtains OAuth authorization and supplies it from a server-side connection at request time.",
        notes: [
          "Use a stable server_label so tool-call history remains intelligible.",
          "Narrow allowed tools and approval policy in the surrounding application once its workflow is defined.",
        ],
      },
      {
        id: "openai-codex",
        provider: "OpenAI",
        surface: "Codex",
        format: "~/.codex/config.toml",
        summary:
          "Register the remote MCP server in Codex, then start the supported OAuth login flow for that named connection.",
        snippet: [
          "[mcp_servers.casimirbot]",
          `url = "${mcpUrl}"`,
          'auth = "oauth"',
          `oauth_resource = "${mcpUrl}"`,
          'scopes = ["helix.agent_runs.read", "helix.agent_runs.write"]',
          "",
          "# Authenticate after saving the configuration:",
          "codex mcp login casimirbot",
        ].join("\n"),
        authentication:
          "Use `codex mcp login casimirbot`; do not place bearer tokens in config.toml or a prompt.",
        notes: [
          "The same named connection can be used across Codex sessions after authorization.",
          "Tool availability remains limited by the scopes granted to the authorized CasimirBot account.",
        ],
      },
      {
        id: "gemini-interactions",
        provider: "Google",
        surface: "Gemini Interactions API",
        format: "JSON request fragment",
        summary:
          "Declare CasimirBot as a remote MCP server using Streamable HTTP and a provider-safe connection name.",
        snippet: stringifyJson({
          tools: [
            {
              type: "mcp_server",
              name: "casimirbot",
              url: mcpUrl,
              headers: {
                Authorization: "Bearer <OAUTH_ACCESS_TOKEN>",
              },
            },
          ],
        }),
        authentication:
          "The application completes OAuth and injects authorization from its server-side secret store or credential broker.",
        notes: [
          "Use `casimirbot` as the connection name; it contains no hyphen.",
          "This endpoint uses Streamable HTTP. Do not configure it as an SSE-only server.",
        ],
      },
      {
        id: "gemini-code-assist",
        provider: "Google",
        surface: "Gemini Code Assist",
        format: "MCP settings JSON",
        summary:
          "Add the remote endpoint to the MCP server map used by the Code Assist agentic chat surface.",
        snippet: stringifyJson({
          mcpServers: {
            casimirbot: {
              httpUrl: mcpUrl,
              headers: {
                Authorization: "Bearer <OAUTH_ACCESS_TOKEN>",
              },
            },
          },
        }),
        authentication:
          "Authorize through a supported client or credential helper; keep credential material outside the checked-in settings file.",
        notes: [
          "The `httpUrl` property selects the remote Streamable HTTP transport.",
          "Replace the placeholder only through the user's approved local credential workflow; never commit the resolved settings file.",
          "If the client cannot complete the OAuth flow, a surrounding harness must broker the authorized connection.",
        ],
      },
    ],
    lifecycle: {
      title: "Bounded, durable runs",
      body: "A client starts a run, retains the opaque run_id, and continues or inspects that same run until a typed completion state is reached.",
      statuses: [
        "completed",
        "needs_more_evidence",
        "needs_input",
        "conflict_detected",
        "blocked",
        "failed",
        "budget_exhausted",
      ],
    },
    authority: {
      title: "Evidence returns to Helix",
      body: "The external-agent service returns typed evidence and run receipts. Those observations do not write Helix's final answer: provenance, contradiction, completion, and terminal-eligibility checks remain authoritative.",
    },
  };
};

export const AGENT_ACCESS_CONTENT = createAgentAccessContent();
