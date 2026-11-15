// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readEconomicHistory } from "../../../../server/services/civilization-economy/economic-history";
import { CivilizationEconomicHistory } from "./CivilizationEconomicHistory";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-25T21:15:30Z")); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function fixture(countries: string[], query: Record<string, unknown> = {}) {
  return readEconomicHistory({ countryIso3s: countries, startYear: 2016, endYear: 2025, ...query }, {
    now: new Date("2026-10-25T21:15:30Z"), fetcher: (async () => { throw Error("offline"); }) as typeof fetch,
  });
}
function openHistory() { fireEvent.click(screen.getByText("Wages, wealth and spending · ten-year history")); }
it("fetches only when opened and renders scoped wage history, explicit gaps and the same audit receipt", async () => {
  const receipt = await fixture(["USA"]);
  const fetch = vi.fn(async (_input: string) => ({ ok: true, json: async () => receipt })); vi.stubGlobal("fetch", fetch);
  render(<CivilizationEconomicHistory countryIso3s={["USA"]} />);
  expect(fetch).not.toHaveBeenCalled(); openHistory();
  expect(await screen.findByText("USA · economic evidence")).toBeTruthy();
  expect(screen.getAllByText("7.25 USD per hour")).toHaveLength(20);
  expect(screen.getByText(/Household net worth: 0 observations; 0 years with evidence/)).toBeTruthy();
  expect(screen.getByText(/National net worth \(consolidated\): 0 observations/)).toBeTruthy();
  expect(screen.getByText(/Government net worth: 0 observations/)).toBeTruthy();
  expect(screen.getByText(/not half-year measurements/)).toBeTruthy();
  expect(JSON.parse((screen.getByLabelText("Economic history audit JSON") as HTMLTextAreaElement).value)).toEqual(receipt);
});
it("clears the old country on failure and ignores a stale selection response", async () => {
  const usa = await fixture(["USA"]);
  let resolveOld: (value: unknown) => void = () => {};
  const fetch = vi.fn().mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => usa }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockImplementationOnce(() => Promise.resolve({ ok: false }));
  vi.stubGlobal("fetch", fetch);
  const view = render(<CivilizationEconomicHistory countryIso3s={["USA"]} />); openHistory();
  await screen.findByText("USA · economic evidence");
  view.rerender(<CivilizationEconomicHistory countryIso3s={["CAN"]} />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("USA · economic evidence")).toBeNull();
  view.rerender(<CivilizationEconomicHistory countryIso3s={["GBR"]} />);
  expect((await screen.findByRole("alert")).textContent).toContain("Coverage remains unknown");
  resolveOld({ ok: true, json: async () => await fixture(["CAN"]) });
  await waitFor(() => expect(screen.queryByText("CAN · economic evidence")).toBeNull());
});
it("requests an explicit historical information cutoff and exposes country hypotheses and optional market context", async () => {
  const fetch = vi.fn(async (input: string) => {
    const params = new URL(input, "https://example.org").searchParams;
    return { ok: true, json: () => fixture(params.get("countryIso3s")!.split(","), {
      startYear: Number(params.get("startYear")), endYear: Number(params.get("endYear")), analysisMode: params.get("analysisMode"),
      ...(params.has("reasoningAsOf") ? { reasoningAsOf: params.get("reasoningAsOf") } : {}),
    }) };
  }); vi.stubGlobal("fetch", fetch);
  render(<CivilizationEconomicHistory countryIso3s={["USA"]} />); openHistory();
  await screen.findByText("USA · economic evidence");
  fireEvent.change(screen.getByLabelText("Economic reasoning mode"), { target: { value: "as_known_at" } });
  fireEvent.change(screen.getByLabelText("Economic information cutoff"), { target: { value: "2020-06-30" } });
  await waitFor(() => {
    const url = new URL(fetch.mock.calls.at(-1)![0] as unknown as string, "https://example.org");
    expect(url.searchParams.get("analysisMode")).toBe("as_known_at");
    expect(url.searchParams.get("reasoningAsOf")).toBe("2020-06-30T23:59:59.999Z");
    expect(url.searchParams.get("endYear")).toBe("2019");
  });
  expect(await screen.findByText("Test: small firms and market power")).toBeTruthy();
  expect(screen.getByText("Robinhood and other market signals")).toBeTruthy();
  expect(screen.getByText(/Connection not verified by this read/)).toBeTruthy();
});
