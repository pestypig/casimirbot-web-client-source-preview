// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readDiplomaticMoveLedger } from "../../../../server/services/civilization-diplomacy/diplomatic-move-ledger";
import { CivilizationDiplomaticMoveLedger } from "./CivilizationDiplomaticMoveLedger";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const fixtureFetch = vi.fn(async (input: string) => {
  const params = new URL(input,"http://localhost").searchParams;
  return { ok:true,json:async () => readDiplomaticMoveLedger({
    countryIso3s:params.get("countryIso3s")?.split(",") ?? [],
    issueIds:params.get("issueIds")?.split(",") ?? [],limit:10,offset:Number(params.get("offset") ?? 0) }) };
});
it("renders the shared receipt, separates candidates and exposes source review and sovereign alternatives", async () => {
  vi.stubGlobal("fetch",fixtureFetch);
  render(<CivilizationDiplomaticMoveLedger countryIso3s={["RUS","USA"]} />);
  expect(await screen.findByText(/4 reviewed records/)).toBeTruthy();
  expect(screen.getAllByText(/Candidate · not admitted country evidence/)).toHaveLength(3);
  expect(screen.getAllByText(/possible sequence/)).toHaveLength(2);
  expect(screen.getByText(/explicit dependency/)).toBeTruthy();
  expect(screen.getByText(/Public records expose only part of the decision space/, { selector: "p" })).toBeTruthy();
  expect(screen.getAllByText(/Private motives: unknown/).length).toBe(3);
  const copiedReceipt = JSON.parse((screen.getByLabelText("Diplomatic ledger audit JSON") as HTMLTextAreaElement).value);
  expect(copiedReceipt).toEqual(readDiplomaticMoveLedger({ countryIso3s: ["RUS", "USA"], limit: 10 }));
  const license = screen.getByText(/US Treasury \/ OFAC · Page 1/).closest("a");
  expect(license?.getAttribute("href")).toBe("https://ofac.treasury.gov/media/937216/download?inline");
  fireEvent.change(screen.getByLabelText("Diplomatic move issue"), {target:{value:"humanitarian_cooperation"}});
  expect(await screen.findByText(/0 reviewed records · 2 candidates/)).toBeTruthy();
  expect(screen.queryByText("Bounded next questions")).toBeNull();
});
it("clears the prior country's evidence on a failed new selection and reports a gap", async () => {
  vi.stubGlobal("fetch",fixtureFetch);
  const view=render(<CivilizationDiplomaticMoveLedger countryIso3s={["USA"]} />);
  await screen.findByText(/US diesel authorization/, { selector: "div.font-semibold" });
  vi.stubGlobal("fetch",vi.fn(async () => ({ok:false})));
  view.rerender(<CivilizationDiplomaticMoveLedger countryIso3s={["CAN"]} />);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Evidence remains unknown"));
  expect(screen.queryByText(/US diesel authorization/)).toBeNull();
});
