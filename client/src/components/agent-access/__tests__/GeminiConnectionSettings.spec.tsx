// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GeminiConnectionSettings } from "../GeminiConnectionSettings";

afterEach(() => { cleanup(); delete window.casimirDesktop; });

it("saves a Gemini key through native IPC without rendering the saved value", async () => {
  const key = "AIzaFixtureGeminiKey_1234567890abcdef";
  const invoke = vi.fn(async (request: { action: string; key?: string }) =>
    request.action === "gemini_inspect"
      ? { ok: true, code: "gemini_saved", state: { configured: false, source: "none" } }
      : request.action === "gemini_test"
        ? { ok: true, code: "gemini_test_confirmed", state: { configured: true, source: "saved" } }
      : { ok: true, code: "gemini_saved", state: { configured: true, source: "saved" } });
  window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
  render(<GeminiConnectionSettings />);
  await screen.findByText("Not connected");
  fireEvent.change(screen.getByLabelText("Gemini API key"), { target: { value: key } });
  fireEvent.click(screen.getByRole("button", { name: "Save Gemini key" }));
  await screen.findByText("Personal key saved");
  expect(invoke).toHaveBeenCalledWith({ action: "gemini_save", key });
  expect(screen.getByLabelText("Replace Gemini API key")).toHaveProperty("value", "");
  expect(screen.queryByText(key)).toBeNull();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Gemini key saved for this profile"));
  fireEvent.click(screen.getByRole("button", { name: "Test Gemini connection" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("read-only models request"));
  expect(invoke).toHaveBeenCalledWith({ action: "gemini_test" });
});

it("shows a developer comparison only with native admission and an observed call receipt", async () => {
  const invoke = vi.fn(async (request: { action: string }) => request.action === "gemini_inspect"
    ? { ok: true, code: "gemini_saved", state: { configured: true, source: "saved" },
      geminiReflectionProbeEnabled: true }
    : { ok: true, code: "gemini_reflection_confirmed", geminiComparison: {
      model: "gemini-3.8-flash", question: "Pauli question",
      baseline: { answer: "Baseline answer", status: "completed", toolCalls: [], toolResults: [] },
      withContext: { answer: "Context answer", status: "completed",
        toolCalls: ["casimir_theory_badges_reflect"], toolResults: ["casimir_theory_badges_reflect"] },
    } });
  window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), liveConnection: invoke as never };
  render(<GeminiConnectionSettings />);
  const button = await screen.findByRole("button", { name: "Compare Pauli answers with public Theory MCP" });
  fireEvent.click(button);
  await screen.findByText("Context answer");
  expect(screen.getByLabelText("Gemini reflection comparison")).toHaveTextContent("Theory tool call: observed; result: observed");
  expect(invoke).toHaveBeenCalledWith({ action: "gemini_reflection_probe" });
});
