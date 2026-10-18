import { describe, expect, it } from "vitest";

import {
  extractAskLevelTheoryReflection,
  normalizeHelixRuntimeActionKey,
  readHelixWorkstationActionRuntimeKeys,
} from "../ask-runtime-authority-readers";

describe("ask runtime authority readers", () => {
  it("matches account-session workstation actions to account_session gateway capability authority", () => {
    expect(normalizeHelixRuntimeActionKey("account-session.set_interface_language")).toBe(
      "account_session.set_interface_language",
    );
    expect(readHelixWorkstationActionRuntimeKeys({
      action: "run_panel_action",
      panel_id: "account-session",
      action_id: "set_interface_language",
      args: { language: "haw" },
    })).toContain("account_session.set_interface_language");
  });

  it("extracts theory formula context from Codex gateway observations", () => {
    const reflection = extractAskLevelTheoryReflection({
      workstation_gateway_call_results: [
        {
          ok: true,
          capability_id: "theory-badge-graph.reflect_discussion_context",
          observation: {
            schema: "helix.theory_context_reflection_observation.v1",
            capability_key: "theory-badge-graph.reflect_discussion_context",
            prompt: "no i mean retry theory badge graph reflection for fusion",
            reflection_id: "reflection:fusion-ui",
            summary: "Theory Badge Graph reflection found a thermonuclear rate context.",
            exact_badge_ids: [],
            likely_badge_ids: ["physics.nuclear.reaction.thermonuclear_rate_context"],
            highlighted_badge_ids: ["physics.nuclear.reaction.thermonuclear_rate_context"],
            claim_boundary_notes: ["diagnostic/proxy only"],
            calculator_payloads: [
              {
                badge_id: "physics.nuclear.reaction.thermonuclear_rate_context",
                badge_title: "Thermonuclear Rate Context",
                payload_id: "thermonuclear-rate-context",
                expression: "rate_proxy_m3_s = n1_m3 * n2_m3 * sigma_m2 * v_m_s",
                target_variable: "rate_proxy_m3_s",
                claim_boundary_notes: ["diagnostic/proxy only"],
              },
            ],
          },
        },
      ],
    });

    expect(reflection).toMatchObject({
      reflectionId: "reflection:fusion-ui",
      input: {
        prompt: "no i mean retry theory badge graph reflection for fusion",
        source: "helix_ask",
      },
      evidenceForAsk: {
        calculatorPayloads: [
          expect.objectContaining({
            badgeId: "physics.nuclear.reaction.thermonuclear_rate_context",
            expression: "rate_proxy_m3_s = n1_m3 * n2_m3 * sigma_m2 * v_m_s",
            targetVariable: "rate_proxy_m3_s",
          }),
        ],
      },
      assistant_answer: false,
      raw_content_included: false,
      terminal_eligible: false,
    });
  });

  it("preserves restricted scientific branch gates when calculators are filtered out", () => {
    const reflection = extractAskLevelTheoryReflection({
      workstation_gateway_call_results: [
        {
          ok: true,
          capability_id: "theory-badge-graph.reflect_discussion_context",
          observation: {
            schema: "helix.theory_context_reflection_observation.v1",
            capability_key: "theory-badge-graph.reflect_discussion_context",
            prompt: "Reflect Image Lens Bianchi/Weyl crop evidence against the graph.",
            reflection_id: "reflection:weyl-bianchi-gated",
            summary: "Theory Badge Graph reflection found Weyl/Bianchi context.",
            exact_badge_ids: ["nhm2.curvature.weyl_bianchi"],
            likely_badge_ids: ["nhm2.observer.curvature_context"],
            highlighted_badge_ids: ["nhm2.curvature.weyl_bianchi"],
            claim_boundary_notes: ["final_answer_guard=OCR candidates and graph matches are not proof."],
            calculator_payloads: [],
            rejected_calculator_payload_ids: [
              "tokamak_thermal_pressure_payload",
              "tokamak_confinement_energy_payload",
            ],
            scientific_evidence_packet: {
              schema: "helix.scientific_evidence_packet.v1",
              primary_domain: "weyl_bianchi",
            },
            scientific_branch_gate: {
              schema: "helix.scientific_branch_gate.v1",
              status: "restricted",
              primary_domain: "weyl_bianchi",
              rejected_calculator_payload_ids: [
                "tokamak_thermal_pressure_payload",
                "tokamak_confinement_energy_payload",
              ],
            },
            scientific_run_trace: {
              schema: "helix.scientific_run_trace.v1",
              trace_id: "scientific_run:test",
            },
          },
        },
      ],
    });

    expect(reflection).toMatchObject({
      reflectionId: "reflection:weyl-bianchi-gated",
      input: {
        mentionedDomains: ["weyl_bianchi"],
      },
      inferredDomains: [
        expect.objectContaining({
          atlasBlockId: "weyl_bianchi",
          title: "weyl bianchi",
        }),
      ],
      evidenceForAsk: {
        claimBoundaries: expect.arrayContaining([
          "scientific_branch_gate=restricted; domain=weyl_bianchi",
          "rejected_calculator_payloads=tokamak_thermal_pressure_payload,tokamak_confinement_energy_payload",
          "scientific_run_trace=scientific_run:test",
        ]),
        calculatorPayloads: [],
      },
      terminal_eligible: false,
    });
  });
});
