// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildMoralGraphLaunchReflectionArtifacts } from "@/lib/moral-graph/fruitionLaunchArtifact";
import { useFruitionCalculatorStore } from "@/store/useFruitionCalculatorStore";
import FruitionCalculatorPanel from "../panels/FruitionCalculatorPanel";

afterEach(() => {
  useFruitionCalculatorStore.getState().clear();
  cleanup();
});

describe("FruitionCalculatorPanel", () => {
  it("renders the standalone Fruition calculator expression view", () => {
    render(<FruitionCalculatorPanel />);

    expect(screen.getByTestId("fruition-calculator-panel")).toBeTruthy();
    expect(screen.getByText("Fruition Calculator")).toBeTruthy();
    expect(screen.getByText("Procedural expression")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Solve" })).toBeTruthy();
    expect(screen.getByTestId("fruition-answer-box")).toBeTruthy();
    expect(screen.getByText("Answer")).toBeTruthy();
    expect(screen.getByText("Trace")).toBeTruthy();
    expect(screen.getAllByText(/first principle/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/supports/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Evidence only/i)).toBeTruthy();
    expect(screen.getByText(/Executable: false/i)).toBeTruthy();
  });

  it("renders a Moral Badge Graph-loaded expression from the calculator store", () => {
    const { fruition } = buildMoralGraphLaunchReflectionArtifacts();
    useFruitionCalculatorStore.getState().loadExpression(fruition, { source: "moral_badge_graph" });

    render(<FruitionCalculatorPanel />);

    expect(screen.getByText(fruition.expression)).toBeTruthy();
    expect(screen.getAllByText(`${fruition.terms.length} terms`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`${fruition.operators.length} operators`).length).toBeGreaterThan(0);
    expect(screen.getByText("1 history entries")).toBeTruthy();
  });
});
