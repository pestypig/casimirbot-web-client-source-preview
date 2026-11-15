// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { readWageAssessment } from "../../../../server/services/civilization-economy/wage-assessment";
import { createWageAssessmentExample } from "@shared/civilization-wage-assessment-example";
import { CivilizationWageAssessment } from "./CivilizationWageAssessment";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const openAssessment = () => fireEvent.click(screen.getByText("Assess wage thresholds · household needs and first hires"));
it("loads only an explicit hypothetical example and shows accounting results without inventing national selection", async () => {
  const fetch = vi.fn(async (_url: string, options: RequestInit) => ({ ok: true, json: async () => readWageAssessment(JSON.parse(options.body as string)) }));
  vi.stubGlobal("fetch", fetch);
  render(<CivilizationWageAssessment countryIso3s={["KEN"]} />); openAssessment();
  expect(fetch).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Load hypothetical example" }));
  expect(screen.getByText(/Synthetic illustration in unspecified money units/)).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Calculate wage assessment" }));
  expect(await screen.findByText("Accounting passes at tested hourly wages: 10, 12")).toBeTruthy();
  expect(screen.getByText("National comparison unavailable: country response estimates are missing.")).toBeTruthy();
  expect(screen.queryByText(/Best tested candidates/)).toBeNull();
  expect(screen.getByText(/NPV 949.27; peak cash shortfall 1484/)).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls[0][1].body as string).countryIso3).toBe("KEN");
  expect(fetch.mock.calls[0][1].method).toBe("POST");
});
it("discards a delayed assessment response after country selection changes", async () => {
  let resolve: (value: unknown) => void = () => {};
  const fetch = vi.fn(() => new Promise(value => { resolve = value; })); vi.stubGlobal("fetch", fetch);
  const view = render(<CivilizationWageAssessment countryIso3s={["USA"]} />); openAssessment();
  fireEvent.click(screen.getByRole("button", { name: "Load hypothetical example" }));
  fireEvent.click(screen.getByRole("button", { name: "Calculate wage assessment" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  view.rerender(<CivilizationWageAssessment countryIso3s={["IDN"]} />);
  resolve({ ok: true, json: async () => readWageAssessment(createWageAssessmentExample("USA")) });
  await waitFor(() => expect(screen.queryByLabelText("Wage assessment results")).toBeNull());
  expect(screen.queryByText(/Declared inputs · USA/)).toBeNull();
});
it("clears stale results on a failed recalculation", async () => {
  const fetch = vi.fn(async (_url: string, options: RequestInit) => ({ ok: true, json: async () => readWageAssessment(JSON.parse(options.body as string)) }));
  vi.stubGlobal("fetch", fetch);
  render(<CivilizationWageAssessment countryIso3s={["USA"]} />); openAssessment();
  fireEvent.click(screen.getByRole("button", { name: "Load hypothetical example" })); fireEvent.click(screen.getByRole("button", { name: "Calculate wage assessment" }));
  await screen.findByText("Accounting passes at tested hourly wages: 10, 12");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  fireEvent.click(screen.getByRole("button", { name: "Calculate wage assessment" }));
  expect((await screen.findByRole("alert")).textContent).toContain("could not be calculated");
  expect(screen.queryByLabelText("Wage assessment results")).toBeNull();
});
it("rejects imported data for a different country", async () => {
  render(<CivilizationWageAssessment countryIso3s={["KEN"]} />); openAssessment();
  const text = JSON.stringify(createWageAssessmentExample("USA"));
  const file = new File([text], "assessment.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => text });
  fireEvent.change(screen.getByLabelText("Import wage assessment data"), { target: { files: [file] } });
  expect((await screen.findByRole("alert")).textContent).toContain("must match one of the selected countries");
  expect(screen.queryByText(/Declared inputs/)).toBeNull();
});
it("rejects malformed imported data and clears the prior example", async () => {
  render(<CivilizationWageAssessment countryIso3s={["KEN"]} />); openAssessment();
  fireEvent.click(screen.getByRole("button", { name: "Load hypothetical example" }));
  const file = new File(["{"], "broken.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => "{" });
  fireEvent.change(screen.getByLabelText("Import wage assessment data"), { target: { files: [file] } });
  expect((await screen.findByRole("alert")).textContent).toContain("could not be read");
  expect(screen.queryByText(/Declared inputs/)).toBeNull();
});
it.each(["different inputs", "wrong input hash", "changed calculation"])("rejects a receipt with %s", async (failure) => {
  const pack = createWageAssessmentExample("USA");
  if (failure === "different inputs") pack.households[0].essentialCostsPerMonth = 2400;
  const receipt = readWageAssessment(pack);
  if (failure === "wrong input hash") receipt.inputSha256 = "0".repeat(64);
  if (failure === "changed calculation") receipt.calculation.candidates[0].householdCoverageFraction = 0.5;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => receipt })));
  render(<CivilizationWageAssessment countryIso3s={["USA"]} />); openAssessment();
  fireEvent.click(screen.getByRole("button", { name: "Load hypothetical example" }));
  fireEvent.click(screen.getByRole("button", { name: "Calculate wage assessment" }));
  expect((await screen.findByRole("alert")).textContent).toContain("could not be calculated");
  expect(screen.queryByLabelText("Wage assessment results")).toBeNull();
  expect(screen.queryByRole("button", { name: "Download assessment receipt" })).toBeNull();
});
