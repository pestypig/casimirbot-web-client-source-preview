// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MoralGraphBiomeScaleViewModel, MoralGraphNode } from "@/lib/moral-graph/biomeScaleViewModel";
import { buildMoralGraphSelectionTraceViewModel } from "@/lib/moral-graph/selectionTraceViewModel";
import MoralGraphBiomeMap from "../panels/moral-graph/MoralGraphBiomeMap";

function buildGraph(): MoralGraphBiomeScaleViewModel {
  const nodes: MoralGraphNode[] = [
    {
      id: "boundary-before-obligation",
      label: "Boundary Before Obligation",
      tone: "principle",
      glyph: "S",
      x: 120,
      y: 190,
      summary: "Identify the living boundary first.",
      biome: "substrate_boundary",
      scaleBand: "cellular",
      cadence: "fast_local",
      maturity: "substrate",
      actionManifestation: "boundary",
      sourceTheoryBadgeIds: ["biophysics.organism_environment_boundary"],
      claimBoundaryNotes: ["Evidence-only substrate context."],
      biomeReason: "living substrate principle",
    },
    {
      id: "direct-observation-before-claim",
      label: "Direct Observation Before Claim",
      tone: "principle",
      glyph: "O",
      x: 760,
      y: 310,
      summary: "Separate observation from interpretation.",
      proceduralExpression: "principle.direct-observation-before-claim supports result.procedural_posture",
      biome: "substrate_sensing",
      scaleBand: "organism",
      cadence: "regulated",
      maturity: "procedural",
      actionManifestation: "sensing",
      sourceTheoryBadgeIds: [],
      claimBoundaryNotes: [],
      biomeReason: "procedural observation badge",
    },
    {
      id: "missing:organism_boundary_context",
      label: "Organism Boundary Context",
      tone: "boundary",
      glyph: "!",
      x: 1460,
      y: 430,
      summary: "Missing check keeps the reflection diagnostic.",
      biome: "claim_boundary",
      scaleBand: "group",
      cadence: "delayed",
      maturity: "boundary",
      actionManifestation: "blocking",
      sourceTheoryBadgeIds: [],
      claimBoundaryNotes: ["Resolve missing organism boundary context."],
      biomeReason: "claim boundary or blocked action",
    },
    {
      id: "wisdom-objective",
      label: "Wisdom Objective",
      tone: "objective",
      glyph: "W",
      x: 1120,
      y: 350,
      summary: "Objective binding requires earlier substrate trace.",
      biome: "objective_binding",
      scaleBand: "institution",
      cadence: "long_horizon",
      maturity: "objective",
      actionManifestation: "objective_binding",
      sourceTheoryBadgeIds: [],
      claimBoundaryNotes: [],
      biomeReason: "objective binding",
    },
  ];
  return {
    nodes,
    edges: [
      {
        id: "trace:substrate:observation",
        from: "boundary-before-obligation",
        to: "direct-observation-before-claim",
        label: "procedural emergence",
        tone: "cyan",
      },
      {
        id: "boundary:missing",
        from: "wisdom-objective",
        to: "missing:organism_boundary_context",
        label: "claim boundary",
        tone: "rose",
      },
      {
        id: "trace:observation:objective",
        from: "direct-observation-before-claim",
        to: "wisdom-objective",
        label: "objective binding",
        tone: "cyan",
      },
    ],
    biomeLanes: [
      { id: "substrate_boundary", label: "Boundary", summary: "Boundary first.", x: 80, width: 140 },
      { id: "substrate_sensing", label: "Sensing", summary: "State discrimination.", x: 720, width: 150 },
      { id: "claim_boundary", label: "Boundary", summary: "Claim limits.", x: 1420, width: 160 },
    ],
    scaleLanes: [
      { id: "cellular", label: "Cellular", y: 188 },
      { id: "organism", label: "Organism", y: 300 },
      { id: "group", label: "Group", y: 420 },
    ],
    cells: [
      {
        id: "substrate_boundary:cellular",
        biomeId: "substrate_boundary",
        scaleBand: "cellular",
        label: "Boundary / Cellular",
        x: 80,
        y: 178,
        width: 140,
        height: 120,
      },
      {
        id: "substrate_sensing:organism",
        biomeId: "substrate_sensing",
        scaleBand: "organism",
        label: "Sensing / Organism",
        x: 720,
        y: 290,
        width: 150,
        height: 120,
      },
      {
        id: "claim_boundary:group",
        biomeId: "claim_boundary",
        scaleBand: "group",
        label: "Boundary / Group",
        x: 1420,
        y: 410,
        width: 160,
        height: 120,
      },
    ],
    width: 1640,
    height: 780,
  };
}

function Harness() {
  const [hoveredNode, setHoveredNode] = useState<MoralGraphNode | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const graph = buildGraph();
  const selectionTrace = buildMoralGraphSelectionTraceViewModel({
    nodes: graph.nodes,
    edges: graph.edges,
    selectedNodeIds,
  });
  return (
    <MoralGraphBiomeMap
      graph={graph}
      highlighted={new Set([...selectionTrace.activeNodeIds, ...selectionTrace.candidateNodeIds])}
      hasFocus={selectedNodeIds.length > 0}
      selectedNodeIds={selectedNodeIds}
      selectionTrace={selectionTrace}
      hoveredNode={hoveredNode}
      onHoverNode={(id: string | null) =>
        setHoveredNode(id ? graph.nodes.find((node: MoralGraphNode) => node.id === id) ?? null : null)
      }
      onClearSelection={() => setSelectedNodeIds([])}
      onToggleNode={(id: string) => setSelectedNodeIds((current: string[]) => (current.includes(id) ? current : [...current, id]))}
    />
  );
}

describe("MoralGraphBiomeMap", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders biome lanes, scale lanes, and selectable badge nodes", () => {
    render(<Harness />);

    expect(screen.getByTestId("moral-graph-biome-map")).toBeTruthy();
    expect(screen.getByTestId("moral-graph-biome-lane-substrate_boundary")).toBeTruthy();
    expect(screen.getByTestId("moral-graph-biome-lane-claim_boundary")).toBeTruthy();
    expect(screen.getByTestId("moral-graph-scale-lane-cellular")).toBeTruthy();
    expect(screen.getByTestId("moral-graph-cell-watermarks")).toBeTruthy();
    expect(screen.getAllByText("Boundary").length).toBeGreaterThan(2);
    expect(screen.getAllByText("Cellular").length).toBeGreaterThan(2);
    expect(screen.getAllByText("Sensing").length).toBeGreaterThan(2);
    expect(screen.getAllByText("Organism").length).toBeGreaterThan(2);
    expect(screen.getByRole("button", { name: "Boundary Before Obligation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Organism Boundary Context" }).getAttribute("data-biome")).toBe(
      "claim_boundary",
    );
  });

  it("shows biome metadata in the hover card", () => {
    render(<Harness />);

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Direct Observation Before Claim" }));

    expect(screen.getByTestId("moral-graph-hover-card")).toBeTruthy();
    expect(screen.getByText("substrate sensing")).toBeTruthy();
    expect(screen.getByText("regulated")).toBeTruthy();
    expect(screen.getByText("procedural")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Direct Observation Before Claim" }).getAttribute("data-trace-state")).toBe(
      "background",
    );
  });

  it("renders deterministic trace states and clears local selection from the map background", () => {
    render(<Harness />);

    const boundary = screen.getByRole("button", { name: "Boundary Before Obligation" });
    const objective = screen.getByRole("button", { name: "Wisdom Objective" });
    const blocked = screen.getByRole("button", { name: "Organism Boundary Context" });

    expect(boundary.getAttribute("data-trace-state")).toBe("background");
    expect(blocked.getAttribute("data-trace-state")).toBe("background");

    fireEvent.click(objective);

    expect(boundary.getAttribute("data-trace-state")).toBe("candidate");
    expect(objective.getAttribute("data-trace-state")).toBe("active");
    expect(blocked.getAttribute("data-trace-state")).toBe("candidate");
    expect(screen.getByTestId("moral-graph-biome-map").querySelector('[data-edge-id="trace:substrate:observation"]')?.getAttribute("data-trace-state"))
      .toBe("candidate");
    expect(screen.getByTestId("moral-graph-biome-map").querySelector('[data-edge-id="boundary:missing"]')?.getAttribute("data-trace-state"))
      .toBe("candidate");

    fireEvent.click(screen.getByTestId("moral-graph-biome-map"));

    expect(objective.getAttribute("data-trace-state")).not.toBe("active");
    expect(boundary.getAttribute("data-trace-state")).toBe("background");
  });
});
