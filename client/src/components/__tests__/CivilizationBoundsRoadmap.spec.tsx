// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CivilizationBoundsRoadmap from "../CivilizationBoundsRoadmap";

vi.mock("react-simple-maps", async () => {
  const ReactActual = await import("react");
  return {
    ComposableMap: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement("svg", { "data-testid": "mock-civilization-map" }, children),
    Geographies: ({
      children,
    }: {
      children: (args: { geographies: Array<{ rsmKey: string }> }) => React.ReactNode;
    }) =>
      ReactActual.createElement(
        "g",
        { "data-testid": "mock-geographies" },
        children({ geographies: [{ rsmKey: "earth" }] }),
      ),
    Geography: ({
      geography,
      style,
    }: {
      geography: { rsmKey: string };
      style?: Record<string, Record<string, unknown>>;
    }) =>
      ReactActual.createElement("path", {
        "data-testid": "mock-geography",
        "data-rsm-key": geography.rsmKey,
        "data-default-stroke-width": String(style?.default?.strokeWidth ?? ""),
        "data-hover-stroke-width": String(style?.hover?.strokeWidth ?? ""),
        "data-hover-filter": String(style?.hover?.filter ?? ""),
      }),
    Line: ({
      from,
      to,
      ...props
    }: {
      from: [number, number];
      to: [number, number];
      [key: string]: unknown;
    }) =>
      ReactActual.createElement("line", {
        "data-testid": "civilization-bounds-edge",
        "data-from": from.join(","),
        "data-to": to.join(","),
        ...props,
      }),
    Marker: ({
      children,
      onClick,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      [key: string]: unknown;
    }) =>
      ReactActual.createElement(
        "g",
        { "data-testid": "civilization-bounds-badge", onClick, ...props },
        children,
      ),
  };
});

afterEach(() => {
  cleanup();
});

describe("CivilizationBoundsRoadmap", () => {
  it("renders a map-first atlas without persistent control panels", () => {
    render(<CivilizationBoundsRoadmap />);

    expect(screen.getByTestId("mock-civilization-map")).toBeTruthy();
    expect(screen.getAllByTestId("civilization-bounds-badge").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("civilization-environmental-flow").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("civilization-tectonic-plate-boundary").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("civilization-bounds-country-inspector")).toBeNull();
    expect(screen.getByLabelText("Civilization evidence lens")).toBeTruthy();
    expect(screen.queryAllByTestId("civilization-bounds-edge")).toHaveLength(0);
    expect(screen.queryAllByTestId("civilization-route-candidate")).toHaveLength(0);

    expect(screen.queryByText("Civilization Bounds Atlas")).toBeNull();
    expect(screen.queryByRole("button", { name: "Material" })).toBeNull();
    expect(screen.queryByLabelText("dependency edges")).toBeNull();
    expect(screen.queryByLabelText("event pulse")).toBeNull();
    expect(screen.queryByLabelText("missing evidence")).toBeNull();
    expect(screen.queryByText("ideal bounds")).toBeNull();
    expect(screen.queryByText(/Active partners/i)).toBeNull();
    expect(screen.queryByText(/Focus site/i)).toBeNull();
    expect(screen.queryByText(/Projection map - bubble partners/i)).toBeNull();
    expect(screen.queryByText(/Anchor nm-gap metrology/i)).toBeNull();
    expect(screen.queryByText(/Assumes Casimir/i)).toBeNull();
  });

  it("renders tectonic plate boundaries bolder than nation borders while preserving country hover glow", () => {
    render(<CivilizationBoundsRoadmap />);

    const nation = screen.getByTestId("mock-geography");
    const plateBoundary = screen.getAllByTestId("civilization-tectonic-plate-boundary")[0];
    const environmentalFlow = screen.getAllByTestId("civilization-environmental-flow")[0];

    expect(Number(plateBoundary.getAttribute("stroke-width"))).toBeGreaterThan(
      Number(nation.getAttribute("data-default-stroke-width")),
    );
    expect(Number(plateBoundary.getAttribute("stroke-width"))).toBeGreaterThan(
      Number(environmentalFlow.getAttribute("stroke-width")),
    );
    expect(Number(nation.getAttribute("data-hover-stroke-width"))).toBeGreaterThan(
      Number(nation.getAttribute("data-default-stroke-width")),
    );
    expect(nation.getAttribute("data-hover-filter")).toContain("drop-shadow");
    expect(plateBoundary.getAttribute("stroke")).toBe("#facc15");
  });

  it("opens a country receipt from a selected nation marker", () => {
    render(<CivilizationBoundsRoadmap />);

    const markers = screen.getAllByTestId("civilization-bounds-badge");
    fireEvent.click(markers[1]);

    const inspector = screen.getByTestId("civilization-bounds-country-inspector");
    expect(inspector.textContent).toContain("China");
    expect(inspector.textContent).toContain("Material");
    expect(inspector.textContent).toContain("Governance");
    expect(inspector.textContent).toContain("confidence");
    expect(inspector.textContent).toContain("selected lens");
    expect(inspector.textContent).toContain("Resource flow");
    expect(inspector.textContent).toContain("material base");
    expect(inspector.textContent).toContain("missing");
    expect(inspector.textContent).toContain("sources");
    expect(screen.getAllByTestId("civilization-bounds-edge").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("civilization-route-candidate").length).toBeGreaterThan(0);
    expect(inspector.textContent).not.toMatch(/Host early|Mass-produce|Build one of the global/i);
    expect(inspector.textContent).not.toMatch(/\bbalance\b/i);
  });

  it("changes marker color semantics by explicit evidence lens and leaves unbound lenses visible", () => {
    render(<CivilizationBoundsRoadmap />);

    const selector = screen.getByLabelText("Civilization evidence lens");
    const marker = screen.getAllByTestId("civilization-bounds-badge")[0];
    expect(marker.getAttribute("data-evidence-lens")).toBe("resource_flow");
    expect(marker.getAttribute("data-evidence-state")).toBe("bound");

    fireEvent.change(selector, { target: { value: "transport_energy" } });
    expect(screen.getAllByTestId("civilization-bounds-badge")[0].getAttribute("data-evidence-lens")).toBe(
      "transport_energy",
    );
    expect(screen.getAllByTestId("civilization-bounds-badge")[0].getAttribute("data-evidence-state")).toBe(
      "unbound",
    );
  });

  it("compares selected countries and surfaces direct dependency relations", () => {
    render(<CivilizationBoundsRoadmap />);

    const markers = screen.getAllByTestId("civilization-bounds-badge");
    fireEvent.click(markers[1]);
    fireEvent.click(markers[2]);

    const inspector = screen.getByTestId("civilization-bounds-country-inspector");
    expect(inspector.textContent).toContain("Compare selected countries");
    expect(inspector.textContent).toContain("CHN + DEU");
    expect(inspector.textContent).toContain("China");
    expect(inspector.textContent).toContain("Germany");
    expect(inspector.textContent).toContain("Industrial trade dependency");
    expect(inspector.textContent).toContain("Material spread");
    expect(screen.getAllByTestId("civilization-bounds-edge").length).toBeGreaterThan(0);

    fireEvent.click(markers[1]);
    expect(screen.getByTestId("civilization-bounds-country-inspector").textContent).toContain(
      "Germany",
    );
  });
});
