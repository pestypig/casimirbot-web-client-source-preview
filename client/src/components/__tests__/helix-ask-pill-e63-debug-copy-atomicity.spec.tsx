import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

let copyDebugPayloadToClipboard: typeof import("@/components/helix/HelixAskPill").copyDebugPayloadToClipboard;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({ copyDebugPayloadToClipboard } = await import("@/components/helix/HelixAskPill"));
});

describe("Helix Ask E63 debug copy atomicity", () => {
  it("copies a nonempty parseable debug payload on the first write", async () => {
    const originalNavigator = globalThis.navigator;
    const writes: string[] = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn(async (text: string) => {
            writes.push(text);
          }),
          readText: vi.fn(async () => writes.at(-1) ?? ""),
        },
      },
    });

    const payload = JSON.stringify({
      active_turn_id: "turn-e63",
      selected_final_answer: "visible final",
      visible_projection_invariant: {
        violations: [],
      },
    });
    const result = await copyDebugPayloadToClipboard(payload);

    expect(result.ok).toBe(true);
    expect(result.copied_text_length).toBeGreaterThan(0);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0] ?? "{}")).toMatchObject({
      active_turn_id: "turn-e63",
      selected_final_answer: "visible final",
    });

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  });

  it("keeps the debug copy button single-shot instead of pointer-down plus click", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/HelixAskPill.tsx"),
      "utf8",
    );

    expect(source).toContain("debugCopyInFlightRef");
    expect(source).not.toContain("onPointerDown={() => void handleCopyReplyMasterDebug");
  });

  it("binds scoped debug copy to the clicked rendered reply instead of the global event-clock payload", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/HelixAskPill.tsx"),
      "utf8",
    );
    const controlsSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyTurnControls.ts"),
      "utf8",
    );
    const turnControlsSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskTurnControls.tsx"),
      "utf8",
    );

    expect(source).toContain("replyMasterEventClockPayload = buildReplyMasterEventClockExport");
    expect(source).toMatch(/handleCopyReplyMasterDebug\(\s*reply,\s*null,\s*event\.currentTarget/);
    expect(source).not.toMatch(/handleCopyReplyMasterDebug\(\s*reply,\s*replyMasterEventClockPayload/);
    expect(source).toContain("const hasProvidedPayload = typeof payload === \"string\" && payload.trim().length > 0");
    expect(source).toContain("const providedPayloadMatchesRenderedTurn =");
    expect(source).toContain("selectHelixAskLegacyDebugCopyLocalPayload({");
    expect(source).toContain("const renderedButtonScopedPayload = buildReplyScopedDebugExportFromRenderedButton(");
    expect(source).toContain("renderedButtonScopedPayload,");
    expect(source).toContain("extractHelixAskLegacyClickedTurnDebugScope(sourceElement)");
    expect(controlsSource).toContain("readTurnScopeAttribute(\"data-turn-control-question\", \"data-debug-copy-question\")");
    expect(controlsSource).toContain(
      "readTurnScopeAttribute(\"data-turn-control-active-turn-id\", \"data-debug-copy-active-turn-id\")",
    );
    expect(controlsSource).toContain("staleAttributeMismatch");
    expect(source).toContain("resolveAuthoritativeDebugExportPayload(localExportPayload)");
    expect(source).toContain("enforceDebugExportMatchesClickedButton({");
    expect(source).toContain(
      "debugPayloadMatchesHelixAskLegacyRenderedTurnPayload as debugPayloadMatchesRenderedTurnPayload",
    );
    expect(source).toContain(
      "enforceHelixAskLegacyDebugExportMatchesClickedButton as enforceDebugExportMatchesClickedButton",
    );
    expect(source).not.toContain("export function debugPayloadMatchesRenderedTurnPayload");
    expect(controlsSource).toContain("const renderedActiveTurnId = coerceControlText(rendered.activeTurnId).trim()");
    expect(controlsSource).toContain("const renderedClientTurnId = coerceControlText(rendered.clientTurnId).trim()");
    expect(controlsSource).toContain("!turnCandidates.some((candidate) =>");
    expect(controlsSource).toContain("!clientTurnCandidates.some((candidate) => candidate === renderedClientTurnId)");
    expect(controlsSource).toContain("export function enforceHelixAskLegacyDebugExportMatchesClickedButton");
    expect(turnControlsSource).toContain("{...turnScopeAttributes}");
  });

  it("preserves rail-critical fields when debug copy compacts an oversized payload", async () => {
    const originalNavigator = globalThis.navigator;
    const writes: string[] = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn(async (text: string) => {
            writes.push(text);
          }),
          readText: vi.fn(async () => writes.at(-1) ?? ""),
        },
      },
    });

    try {
      const payload = JSON.stringify({
        schema: "helix.ask.debug_export.v1",
        active_turn_id: "ask:test:compact-rails",
        selected_final_answer: "typed failure",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        terminal_error_code: "terminal_projection_mismatch",
        terminal_authority_single_writer: {
          schema: "helix.terminal_authority_single_writer_result.v1",
          selected_terminal_artifact_kind: "workstation_tool_evaluation",
          selected_terminal_artifact_ref: "ask:test:compact-rails:workstation_tool_evaluation",
        },
        terminal_boundary_eligibility: {
          schema: "helix.runtime_authority_boundary_report.v1",
          checks: { selected_capability_observation: true },
        },
        tool_rail_failure_triage: {
          schema: "helix.tool_rail_failure_triage.v1",
          first_broken_rail: "visible_projection",
          repair_target: "presenter_boundary",
        },
        codex_parity_agent_spine_rail_table: {
          schema: "helix.codex_parity_agent_spine_rail_table.v1",
          turn_id: "ask:test:compact-rails",
          prompt: "Call scientific-calculator.solve_expression with this exact expression.",
          requested_capability: "scientific-calculator.solve_expression",
          visible_tool_surface: ["scientific-calculator.solve_expression"],
          selected_capability: "scientific-calculator.solve_expression",
          admitted_capability: "scientific-calculator.solve_expression",
          admission_proof_source: "tool_call_admission_decision.admitted_capability",
          admission_proven: true,
          executed_capability: "scientific-calculator.solve_expression",
          observation_kind: "workstation_tool_evaluation",
          observation_ref: "ask:test:compact-rails:workstation_tool_evaluation",
          required_observation_kinds_for_requested_capability: [
            "calculator_receipt",
            "workstation_tool_evaluation",
          ],
          observed_artifact_supports_requested_capability: true,
          reentry_status: "reentered",
          reentry_proof_source: "final_answer_draft_with_support_refs",
          reentry_proven: true,
          goal_satisfaction: "satisfied",
          required_terminal_kind: "workstation_tool_evaluation",
          selected_terminal_kind: "workstation_tool_evaluation",
          terminal_authority_proof_source: "terminal_authority_single_writer.selected_terminal_artifact_kind",
          terminal_authority_proven: true,
          visible_terminal_kind: "typed_failure",
          visible_projection_source: "payload.terminal_artifact_kind",
          visible_projection_proven: true,
          first_broken_rail: "visible_projection",
          repair_target: "presenter_boundary",
          codex_parity_class: "visible_projection_mismatch",
          normalized_codex_parity_classes: [
            "complete",
            "tool_surface_missing",
            "explicit_capability_demoted",
            "tool_admission_rejected",
            "selected_not_executed",
            "observation_missing",
            "observation_not_reentered",
            "goal_contract_mismatch",
            "terminal_product_not_allowed",
            "terminal_authority_mismatch",
            "visible_projection_mismatch",
            "debug_mirror_stale",
            "provider_config_missing",
          ],
          rail_status: "fail_closed",
          rail_failure_code: "terminal_projection_mismatch",
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        },
        agent_runtime_loop: {
          schema: "helix.agent_runtime_loop.v1",
          iterations: [
            {
              iteration: 1,
              chosen_capability: "scientific-calculator.solve_expression",
              executed_action_key: "scientific-calculator.solve_expression",
              next_step: "next_action",
              observed_artifact_refs: ["ask:test:compact-rails:workstation_tool_evaluation"],
              tool_observation: {
                kind: "workstation_tool_evaluation",
                artifact_id: "ask:test:compact-rails:workstation_tool_evaluation",
                status: "completed",
                ok: true,
              },
            },
            {
              iteration: 2,
              chosen_capability: "model.synthesize_from_tool_observation",
              next_step: "answer",
              observation_role: "model_answer_draft",
            },
          ],
        },
        current_turn_artifact_ledger: [
          {
            artifact_id: "ask:test:compact-rails:workstation_tool_evaluation",
            kind: "workstation_tool_evaluation",
            payload: {
              schema: "helix.workstation_tool_evaluation.v1",
              supports_goal: true,
              summary: "Calculator produced 29.5.",
            },
          },
        ],
        debug: {
          oversized_padding: "x".repeat(800_000),
        },
      });

      const result = await copyDebugPayloadToClipboard(payload);
      const copied = JSON.parse(writes.at(-1) ?? "{}");

      expect(result.ok).toBe(true);
      expect(copied.debug_export_size_control?.bounded_by).toBe("client_copy_path");
      expect(copied.agent_runtime_loop?.iteration_count).toBe(2);
      expect(copied.agent_runtime_loop?.iterations?.[0]?.chosen_capability).toBe(
        "scientific-calculator.solve_expression",
      );
      expect(copied.current_turn_artifact_ledger?.[0]).toMatchObject({
        artifact_id: "ask:test:compact-rails:workstation_tool_evaluation",
        kind: "workstation_tool_evaluation",
        payload_schema: "helix.workstation_tool_evaluation.v1",
      });
      expect(copied.terminal_authority_single_writer?.selected_terminal_artifact_kind).toBe(
        "workstation_tool_evaluation",
      );
      expect(copied.terminal_boundary_eligibility?.checks?.selected_capability_observation).toBe(true);
      expect(copied.tool_rail_failure_triage?.first_broken_rail).toBe("visible_projection");
      expect(copied.codex_parity_agent_spine_rail_table).toMatchObject({
        schema: "helix.codex_parity_agent_spine_rail_table.v1",
        requested_capability: "scientific-calculator.solve_expression",
        selected_capability: "scientific-calculator.solve_expression",
        admitted_capability: "scientific-calculator.solve_expression",
        executed_capability: "scientific-calculator.solve_expression",
        observation_ref: "ask:test:compact-rails:workstation_tool_evaluation",
        selected_terminal_kind: "workstation_tool_evaluation",
        visible_terminal_kind: "typed_failure",
        codex_parity_class: "visible_projection_mismatch",
        rail_failure_code: "terminal_projection_mismatch",
      });
      expect(copied.debug?.codex_parity_agent_spine_rail_table).toMatchObject({
        requested_capability: "scientific-calculator.solve_expression",
        first_broken_rail: "visible_projection",
        repair_target: "presenter_boundary",
      });
      expect(copied.debug?.agent_runtime_loop?.iteration_count).toBe(2);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
    }
  });
});
