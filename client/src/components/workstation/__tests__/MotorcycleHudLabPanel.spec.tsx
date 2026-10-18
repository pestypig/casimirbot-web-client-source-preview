// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MotorcycleHudLabPanel from "../MotorcycleHudLabPanel";

describe("MotorcycleHudLabPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("runs the default frozen fixture through the shared renderer and passes its oracle", () => {
    render(<MotorcycleHudLabPanel />);

    expect(screen.getByTestId("motorcycle-hud-lab")).toBeTruthy();
    expect(screen.getByText(/simulation only/i)).toBeTruthy();
    expect(screen.getByText(/disabled · future semantic supervisor/i)).toBeTruthy();
    expect(screen.getByTestId("normalized-hud-plane-notice").textContent).toMatch(/no visor curvature/i);
    expect(screen.getByTestId("codex-reasoning-preview").textContent).toMatch(/advisory only/i);
    expect(screen.getByLabelText("HUD reaction state legend")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Run fixture" }));

    expect(screen.getByTestId("fixture-verdict").textContent).toBe("PASS");
    expect(screen.getByLabelText(/sector 5, rear left, urgent_pulse approach/i)).toBeTruthy();
    expect(screen.getAllByText(/fnv1a32:/i).length).toBeGreaterThan(0);
  });

  it("shows watchdog blanking and no active sector after a source dropout", () => {
    render(<MotorcycleHudLabPanel />);
    fireEvent.change(screen.getByLabelText(/frozen scenario/i), { target: { value: "dropout-watchdog" } });
    fireEvent.click(screen.getByRole("button", { name: "Run fixture" }));

    expect(screen.getByTestId("fixture-verdict").textContent).toBe("PASS");
    expect(screen.getByTestId("hud-blank-overlay").textContent).toMatch(/watchdog/i);
    expect(screen.getAllByText("none").length).toBeGreaterThan(0);
  });

  it("keeps future environment bridges visibly disabled", () => {
    render(<MotorcycleHudLabPanel />);

    expect(screen.getByRole("button", { name: "Minecraft sensing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "FiveM bridge" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Physical sensors" })).toBeDisabled();
  });
});
