import { describe, expect, it } from "vitest";

import {
  formatHelixAskFinalReceiptMeta,
  formatHelixAgentRuntimeShortLabel,
  normalizeHelixAgentProvidersResponse,
  resolveHelixAskActualAgentProviderLabel,
  resolveHelixAskLanguageModelPolicySummary,
  resolveHelixAskModelUsageLabel,
  resolveHelixAgentRuntimePrimaryButtonDecision,
  resolveHelixAgentRuntimeSelectDecision,
  resolveNextSelectableHelixAgentRuntime,
  resolveSelectedHelixAgentRuntime,
} from "@/lib/helix/ask-agent-runtime-display";

describe("Helix Ask agent runtime display", () => {
  it("formats final receipt metadata without legacy punctuation", () => {
    expect(
      formatHelixAskFinalReceiptMeta([
        "agent provider terminal candidate",
        "Provider: Codex Workstation Mode",
        ".Model: not reported by backend",
        "refs 2",
      ]),
    ).toBe(
      "agent provider terminal candidate | Provider: Codex Workstation Mode | Model: not reported by backend | refs 2",
    );
  });

  it("normalizes Helix, Codex, and Future providers from backend provider responses", () => {
    const providers = normalizeHelixAgentProvidersResponse({
      providers: [
        {
          id: "helix",
          label: "Helix Ask Native",
          enabled: true,
          experimental: false,
          supports: { streaming: true, workstationTools: true, codeMutation: false },
        },
        {
          id: "codex",
          label: "Codex Workstation Mode",
          enabled: true,
          experimental: true,
          permission_profile: {
            id: "read-observe",
            label: "Read/observe only; Helix may project non-mutating UI receipts",
            allows: {
              observe: true,
              read: true,
              act: false,
              write: false,
              shell: false,
              codeMutation: false,
            },
          },
          supports: { streaming: true, workstationTools: true, codeMutation: true },
        },
        {
          id: "future",
          label: "Future Agent Wrapper",
          enabled: false,
          experimental: true,
          supports: { streaming: false, workstationTools: true, codeMutation: false },
        },
      ],
    });

    expect(providers.map((provider) => provider.label)).toEqual([
      "Helix Ask Native",
      "Codex Workstation Mode",
      "Future Agent Wrapper",
    ]);
    expect(providers.find((provider) => provider.id === "codex")?.permission_profile).toMatchObject({
      id: "read-observe",
      allows: {
        read: true,
        act: false,
        write: false,
        shell: false,
        codeMutation: false,
      },
    });
    expect(providers.find((provider) => provider.id === "future")?.permission_profile).toMatchObject({
      id: "read-observe",
      allows: {
        read: true,
        write: false,
        shell: false,
        codeMutation: false,
      },
    });
  });

  it("keeps disabled providers visible but not selectable", () => {
    const providers = normalizeHelixAgentProvidersResponse({
      providers: [
        {
          id: "helix",
          label: "Helix Ask Native",
          enabled: true,
          experimental: false,
          supports: { streaming: true, workstationTools: true, codeMutation: false },
        },
        {
          id: "codex",
          label: "Codex Workstation Mode",
          enabled: false,
          experimental: true,
          supports: { streaming: true, workstationTools: true, codeMutation: true },
        },
      ],
    });

    expect(providers.find((provider) => provider.id === "codex")?.enabled).toBe(false);
    expect(resolveSelectedHelixAgentRuntime("codex", providers)).toBe("helix");
    expect(resolveNextSelectableHelixAgentRuntime("helix", providers)).toBe("helix");
  });

  it("respects account-policy filtered provider lists from the server", () => {
    const providers = normalizeHelixAgentProvidersResponse({
      providers: [
        {
          id: "codex",
          label: "Codex Workstation Mode",
          enabled: true,
          experimental: true,
          supports: { streaming: true, workstationTools: true, codeMutation: true },
        },
      ],
      locked_providers: [
        {
          id: "helix",
          label: "Helix Ask Native",
          enabled: true,
          locked: true,
          locked_reason: "runtime_agent_outside_account_policy",
        },
      ],
    });

    expect(providers.map((provider) => provider.id)).toEqual(["codex"]);
    expect(resolveSelectedHelixAgentRuntime("helix", providers)).toBe("codex");
  });

  it("cycles only through enabled providers and formats runtime short labels", () => {
    const providers = normalizeHelixAgentProvidersResponse({
      providers: [
        { id: "helix", label: "Helix Ask Native", enabled: true, supports: {} },
        { id: "codex", label: "Codex Workstation Mode", enabled: true, supports: {} },
        { id: "future", label: "Future Agent Wrapper", enabled: false, supports: {} },
      ],
    });

    expect(resolveSelectedHelixAgentRuntime("codex", providers)).toBe("codex");
    expect(resolveSelectedHelixAgentRuntime("future", providers)).toBe("helix");
    expect(resolveNextSelectableHelixAgentRuntime("helix", providers)).toBe("codex");
    expect(resolveNextSelectableHelixAgentRuntime("codex", providers)).toBe("helix");
    expect(formatHelixAgentRuntimeShortLabel(providers.find((provider) => provider.id === "codex"))).toBe("Codex");
    expect(formatHelixAgentRuntimeShortLabel(providers.find((provider) => provider.id === "future"))).toBe("Future");
    expect(formatHelixAgentRuntimeShortLabel(providers.find((provider) => provider.id === "helix"))).toBe("Helix");
  });

  it("projects runtime picker control decisions without side effects", () => {
    const providers = normalizeHelixAgentProvidersResponse({
      providers: [
        { id: "helix", label: "Helix Ask Native", enabled: true, supports: {} },
        { id: "codex", label: "Codex Workstation Mode", enabled: true, supports: {} },
        { id: "future", label: "Future Agent Wrapper", enabled: false, supports: {} },
      ],
    });

    expect(resolveHelixAgentRuntimeSelectDecision("codex", providers)).toEqual({
      runtime: "codex",
      menuOpen: false,
      invalidSelection: false,
    });
    expect(resolveHelixAgentRuntimeSelectDecision("future", providers)).toEqual({
      runtime: "helix",
      menuOpen: false,
      invalidSelection: true,
    });
    expect(resolveHelixAgentRuntimePrimaryButtonDecision({
      selectedRuntime: "helix",
      providers,
      primaryButtonMode: "cycle",
      currentMenuOpen: true,
    })).toEqual({
      runtime: "codex",
      menuOpen: false,
      persistRuntime: true,
    });
    expect(resolveHelixAgentRuntimePrimaryButtonDecision({
      selectedRuntime: "codex",
      providers,
      primaryButtonMode: "menu",
      currentMenuOpen: false,
    })).toEqual({
      runtime: "codex",
      menuOpen: true,
      persistRuntime: false,
    });
  });

  it("labels actual provider metadata from response/debug fields without inferring from runtime loops", () => {
    expect(
      resolveHelixAskActualAgentProviderLabel({
        agent_runtime: "codex",
        selected_agent_provider: {
          id: "codex",
          label: "Codex Workstation Mode",
        },
      }),
    ).toBe("Provider: Codex Workstation Mode");
    expect(
      resolveHelixAskActualAgentProviderLabel({
        debug: {
          agent_runtime: "future",
          selected_agent_provider: {
            id: "future",
            label: "Future Agent Wrapper",
          },
        },
      }),
    ).toBe("Provider: Future Agent Wrapper");
    expect(
      resolveHelixAskActualAgentProviderLabel({
        debug: {
          agent_runtime_loop: {
            schema: "helix.agent_runtime_loop.v1",
            iterations: [{ chosen_capability: "repo-code.search" }],
          },
        },
      }),
    ).toBeNull();
  });

  it("labels configured model metadata from response/debug fields and Codex args", () => {
    expect(
      resolveHelixAskModelUsageLabel({
        debug: {
          llm_http_model_configured: "gpt-5",
        },
      }),
    ).toBe("Model: gpt-5");
    expect(
      resolveHelixAskModelUsageLabel({
        codex_args: ["--model", "gpt-5-codex"],
      }),
    ).toBe("Model: gpt-5-codex");
    expect(
      resolveHelixAskModelUsageLabel({
        debug: {
          selected_agent_provider: {
            id: "codex",
            label: "Codex Workstation Mode",
            model: "gpt-5-codex",
          },
        },
      }),
    ).toBe("Model: gpt-5-codex");
  });

  it("prefers language model policy summaries over provider/model fallback labels", () => {
    const response = {
      agent_runtime: "codex",
      selected_agent_provider: {
        id: "codex",
        label: "Codex Workstation Mode",
        model: "gpt-4o-mini",
      },
      language_model_debug_summary: "AI: Auto -> Deep | gpt-5.5 | reasoning: high | turn-local",
    };

    expect(resolveHelixAskLanguageModelPolicySummary(response)).toBe(
      "AI: Auto -> Deep | gpt-5.5 | reasoning: high | turn-local",
    );
    expect(resolveHelixAskActualAgentProviderLabel(response)).toBeNull();
    expect(resolveHelixAskModelUsageLabel(response)).toBe(
      "AI: Auto -> Deep | gpt-5.5 | reasoning: high | turn-local",
    );
  });

  it("falls back to provider and runtime model labels only when language model policy is absent", () => {
    const response = {
      agent_runtime: "codex",
      selected_agent_provider: {
        id: "codex",
        label: "Codex Workstation Mode",
        model: "gpt-4o-mini",
      },
    };

    expect(resolveHelixAskLanguageModelPolicySummary(response)).toBeNull();
    expect(resolveHelixAskActualAgentProviderLabel(response)).toBe("Provider: Codex Workstation Mode");
    expect(resolveHelixAskModelUsageLabel(response)).toBe("Model: gpt-4o-mini");
  });

  it("labels models from Codex agent runtime loop metadata", () => {
    expect(
      resolveHelixAskModelUsageLabel({
        debug: {
          agent_runtime_loop: {
            schema: "helix.agent_runtime_loop.v1",
            iterations: [
              {
                chosen_capability: "scientific-calculator.solve_expression",
                llm_model: "gpt-5-codex",
              },
            ],
          },
        },
      }),
    ).toBe("Model: gpt-5-codex");
    expect(
      resolveHelixAskModelUsageLabel({
        debug: {
          agent_runtime_loop: {
            codex_args: ["--sandbox", "read-only", "--model=gpt-5-codex"],
          },
        },
      }),
    ).toBe("Model: gpt-5-codex");
  });

  it("labels models from structured turn runtime model-call metadata", () => {
    expect(
      resolveHelixAskModelUsageLabel({
        debug: {
          agent_runtime: "codex",
          turn_runtime: {
            model_calls: [
              {
                phase: "planner",
                model_name: "gpt-5.1",
              },
              {
                phase: "composer",
                resolved_model_or_service: "gpt-5-codex",
              },
            ],
          },
        },
      }),
    ).toBe("Models: gpt-5.1, gpt-5-codex");
  });

  it("labels multiple models from reasoning metadata and voice gateway receipts", () => {
    expect(
      resolveHelixAskModelUsageLabel({
        debug: {
          agent_runtime: "codex",
          llm_http_model_configured: "gpt-4o-mini",
          workstation_gateway_call_results: [
            {
              capability_id: "live_env.request_interim_voice_callout",
              observation: {
                schema: "helix.interim_voice_callout_tool_result.v1",
                receipt: {
                  model_id: "eleven_multilingual_v2",
                },
              },
            },
          ],
        },
      }),
    ).toBe("Models: gpt-4o-mini, eleven_multilingual_v2");
  });

  it("labels models from transcript event metadata without reading final prose", () => {
    expect(
      resolveHelixAskModelUsageLabel({
        debug: {
          agent_runtime: "codex",
          turn_transcript: {
            events: [
              {
                source_event_type: "model_decision",
                selected_model_or_service: "gpt-5-mini",
                text: "Model decision completed.",
              },
              {
                source_event_type: "terminal_answer",
                text: "The final answer mentions gpt-5-pro in prose, but that is not metadata.",
              },
            ],
          },
        },
      }),
    ).toBe("Model: gpt-5-mini");
  });

  it("ignores object-shaped model fields instead of rendering object placeholders", () => {
    expect(
      resolveHelixAskModelUsageLabel({
        debug: {
          agent_runtime: "codex",
          model: {
            name: "nested-object-should-not-render",
          },
          turn_runtime: {
            model_calls: [
              {
                modelId: "gpt-5-codex",
              },
            ],
          },
        },
      }),
    ).toBe("Model: gpt-5-codex");
  });

  it("shows an honest Codex default label when the provider omits concrete model metadata", () => {
    expect(
      resolveHelixAskModelUsageLabel({
        debug: {
          agent_runtime: "codex",
          selected_agent_provider: {
            id: "codex",
            label: "Codex Workstation Mode",
          },
          codex_args: ["exec", "--sandbox", "read-only"],
        },
      }),
    ).toBe("Model: not reported by backend");
  });
});
