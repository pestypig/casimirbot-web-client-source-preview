import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentAccessGuide } from "@/components/agent-access/AgentAccessGuide";
import {
  AGENT_ACCESS_CONNECTION_WARNING,
  CASIMIRBOT_PUBLIC_ORIGIN,
  createAgentAccessContent,
} from "../agentAccessContent";

const provider = (
  content: ReturnType<typeof createAgentAccessContent>,
  id: (typeof content.providers)[number]["id"],
) => {
  const match = content.providers.find((entry) => entry.id === id);
  if (!match) throw new Error(`Missing provider guide: ${id}`);
  return match;
};

describe("agent access content", () => {
  it("links the same public reasoning context from the workstation guide", () => {
    const content = createAgentAccessContent();
    const markup = renderToStaticMarkup(createElement(AgentAccessGuide, { content }));
    expect(content.publicContext.url).toBe(`${CASIMIRBOT_PUBLIC_ORIGIN}/llms.txt`);
    expect(markup).toContain("Civilization Bounds");
    expect(markup).toContain("Theory Badge Graph");
    expect(markup).toContain("Moral Graph");
    expect(markup).toContain("/llms.txt");
  });
  it("states that retrieval cannot create an MCP connection", () => {
    const content = createAgentAccessContent();
    const warning = content.connectionNotice.body.toLowerCase();

    expect(content.connectionNotice.body).toBe(AGENT_ACCESS_CONNECTION_WARNING);
    expect(warning).toContain("retrieval alone cannot invoke");
    expect(warning).toContain("must explicitly add the mcp endpoint");
    expect(warning).toContain(
      "user, application developer, plugin, or surrounding agent harness",
    );
    expect(content.connectionNotice.credentialSafety.toLowerCase()).toContain(
      "keep access tokens and other secrets out of prompts",
    );
  });

  it("publishes ChatGPT, Responses, and Codex connection shapes", () => {
    const content = createAgentAccessContent();
    const chatgpt = provider(content, "openai-chatgpt").snippet;
    const responses = provider(content, "openai-responses").snippet;
    const codex = provider(content, "openai-codex").snippet;

    expect(chatgpt).toContain("Developer mode: On");
    expect(chatgpt).toContain("Settings → Plugins → +");
    expect(chatgpt).toContain(`${CASIMIRBOT_PUBLIC_ORIGIN}/mcp`);
    expect(responses).toContain('"type": "mcp"');
    expect(responses).toContain('"server_label": "casimirbot"');
    expect(responses).toContain(
      `"server_url": "${CASIMIRBOT_PUBLIC_ORIGIN}/mcp"`,
    );
    expect(responses).toContain('"authorization": "<OAUTH_ACCESS_TOKEN>"');
    expect(responses).toContain('"require_approval": "always"');
    expect(codex).toContain("[mcp_servers.casimirbot]");
    expect(codex).toContain(`url = "${CASIMIRBOT_PUBLIC_ORIGIN}/mcp"`);
    expect(codex).toContain(
      `oauth_resource = "${CASIMIRBOT_PUBLIC_ORIGIN}/mcp"`,
    );
    expect(codex).toContain(
      'scopes = ["helix.agent_runs.read", "helix.agent_runs.write"]',
    );
    expect(codex).toContain("codex mcp login casimirbot");
  });

  it("publishes Gemini Interactions and Code Assist Streamable HTTP shapes", () => {
    const content = createAgentAccessContent();
    const interactions = provider(content, "gemini-interactions").snippet;
    const codeAssist = provider(content, "gemini-code-assist").snippet;

    expect(interactions).toContain('"type": "mcp_server"');
    expect(interactions).toContain('"name": "casimirbot"');
    expect(interactions).toContain(`"url": "${CASIMIRBOT_PUBLIC_ORIGIN}/mcp"`);
    expect(interactions).toContain(
      '"Authorization": "Bearer <OAUTH_ACCESS_TOKEN>"',
    );
    expect(interactions).not.toContain('"name": "casimir-bot"');
    expect(codeAssist).toContain('"mcpServers"');
    expect(codeAssist).toContain('"casimirbot"');
    expect(codeAssist).toContain(
      `"httpUrl": "${CASIMIRBOT_PUBLIC_ORIGIN}/mcp"`,
    );
    expect(codeAssist).toContain(
      '"Authorization": "Bearer <OAUTH_ACCESS_TOKEN>"',
    );
  });

  it("uses explicit placeholders without embedding credential values", () => {
    const content = createAgentAccessContent();
    const snippets = content.providers.map((entry) => entry.snippet).join("\n");
    const authorizationValues = Array.from(
      snippets.matchAll(/"(?:authorization|Authorization)": "([^"]+)"/g),
      (match) => match[1],
    );

    expect(authorizationValues).toEqual([
      "<OAUTH_ACCESS_TOKEN>",
      "Bearer <OAUTH_ACCESS_TOKEN>",
      "Bearer <OAUTH_ACCESS_TOKEN>",
    ]);
    expect(snippets).not.toMatch(/\b(?:sk|ya29)\.[A-Za-z0-9_-]{8,}/);
    expect(snippets).not.toMatch(/api[_-]?key/i);
    expect(snippets).not.toMatch(/client[_-]?secret/i);
  });

  it("retains the Helix evidence and terminal-authority boundary", () => {
    const content = createAgentAccessContent();
    const authority = content.authority.body.toLowerCase();

    expect(authority).toContain("typed evidence and run receipts");
    expect(authority).toContain("do not write helix's final answer");
    expect(authority).toContain(
      "terminal-eligibility checks remain authoritative",
    );
  });

  it("renders the shared warning and all five provider surfaces in the reusable guide", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentAccessGuide, { compact: true }),
    );

    expect(markup).toContain('data-agent-access-guide="panel"');
    expect(markup).toContain("An explicit connection is required");
    expect(markup).toContain("retrieval alone cannot invoke CasimirBot tools");
    expect(markup).toContain("ChatGPT");
    expect(markup).toContain("Responses API");
    expect(markup).toContain("Codex");
    expect(markup).toContain("Gemini Interactions API");
    expect(markup).toContain("Gemini Code Assist");
  });
});
