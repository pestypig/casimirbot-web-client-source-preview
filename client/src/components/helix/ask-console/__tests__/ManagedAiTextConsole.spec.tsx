// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { ManagedAiTextConsole } from "../ManagedAiTextConsole";

const activeLink = () => ({ phase: "linked", detail: "Website account connected.",
  managedTextAuthorized: true, allowance: { sourceKind: "subscription", processorMode: "test",
    state: "active", remainingMicros: 100_000, minimumTextReservationMicros: 1_368,
    periodEndsAt: "2026-11-01T00:00:00.000Z" } });

afterEach(() => { cleanup(); delete window.casimirDesktop; });

describe("Helix Console funded text channel", () => {
  it("sends a bounded independent question through the native paid route", async () => {
    const ask = vi.fn(async () => ({ ok: true, answer: { requestId: "req-1",
      text: "A bounded answer.", payer: "casimirbot_managed" } }));
    const link = vi.fn(async () => activeLink());
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: link };
    const view = render(<ManagedAiTextConsole active />);
    expect(await screen.findByText(/Stripe test allowance/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Ask managed AI" }),
      { target: { value: "What is admitted?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("A bounded answer.")).toBeInTheDocument();
    expect(screen.getByText("What is admitted?")).toBeInTheDocument();
    expect(ask).toHaveBeenCalledExactlyOnceWith("What is admitted?");
    expect(link).toHaveBeenCalledWith("check");
    expect(screen.getByRole("textbox", { name: "Ask managed AI" })).toHaveValue("");
    view.rerender(<ManagedAiTextConsole active={false} />);
    view.rerender(<ManagedAiTextConsole active />);
    expect(screen.getByText("A bounded answer.")).toBeInTheDocument();
  });

  it("does not send without installation consent and clears history on account change", async () => {
    const ask = vi.fn(async () => ({ ok: true, answer: { requestId: "req-2",
      text: "First answer.", payer: "casimirbot_managed" } }));
    let authorized = true;
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: vi.fn(async () => ({ ...activeLink(), managedTextAuthorized: authorized })) };
    render(<ManagedAiTextConsole active />);
    await screen.findByText(/Stripe test allowance/);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask managed AI" }),
      { target: { value: "Private question" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("First answer.");
    authorized = false;
    await act(async () => { window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)); });
    await screen.findByText(/Managed text is not approved/);
    expect(screen.queryByText("Private question")).toBeNull();
    expect(screen.queryByText("First answer.")).toBeNull();
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("keeps an unconfirmed request visible without automatic retry", async () => {
    const ask = vi.fn(async () => ({ ok: false, code: "outcome_unconfirmed",
      requestId: "managed-ai-request-3" }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: vi.fn(async () => activeLink()) };
    render(<ManagedAiTextConsole active />);
    await screen.findByText(/Stripe test allowance/);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask managed AI" }),
      { target: { value: "Risky retry" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Do not resend this question");
    expect(screen.getByRole("textbox", { name: "Ask managed AI" })).toHaveValue("Risky retry");
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox", { name: "Ask managed AI" }).closest("form")!);
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  });

  it("prevents the same question after an unconfirmed transport result", async () => {
    const ask = vi.fn(async () => { throw new Error("connection reset"); });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: vi.fn(async () => activeLink()) };
    render(<ManagedAiTextConsole active />);
    await screen.findByText(/Stripe test allowance/);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask managed AI" }),
      { target: { value: "Unconfirmed transport" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be confirmed");
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox", { name: "Ask managed AI" }).closest("form")!);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("prevents a duplicate funded call while the first result is pending", async () => {
    let finish!: (value: unknown) => void;
    const ask = vi.fn(() => new Promise<unknown>(resolve => { finish = resolve; }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: vi.fn(async () => activeLink()) };
    render(<ManagedAiTextConsole active />);
    await screen.findByText(/Stripe test allowance/);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask managed AI" }),
      { target: { value: "One question" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    fireEvent.submit(screen.getByRole("textbox", { name: "Ask managed AI" }).closest("form")!);
    expect(ask).toHaveBeenCalledExactlyOnceWith("One question");
    await act(async () => { finish({ ok: true, answer: { requestId: "req-4",
      text: "One answer.", payer: "casimirbot_managed" } }); });
    expect(await screen.findByText("One answer.")).toBeInTheDocument();
  });

  it("discards an in-flight answer when the account changes", async () => {
    let finish!: (value: unknown) => void;
    const ask = vi.fn(() => new Promise<unknown>(resolve => { finish = resolve; }));
    let authorized = true;
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: vi.fn(async () => ({ ...activeLink(), managedTextAuthorized: authorized })) };
    render(<ManagedAiTextConsole active />);
    await screen.findByText(/Stripe test allowance/);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask managed AI" }),
      { target: { value: "Old account question" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(ask).toHaveBeenCalledExactlyOnceWith("Old account question");

    authorized = false;
    await act(async () => {
      window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
      finish({ ok: true, answer: { requestId: "req-old",
        text: "Old account answer.", payer: "casimirbot_managed" } });
    });

    expect(await screen.findByText(/Managed text is not approved/)).toBeInTheDocument();
    expect(screen.queryByText("Old account question")).toBeNull();
    expect(screen.queryByText("Old account answer.")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Ask managed AI" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });

  it("shows an exhausted allowance without opening a funded send path", async () => {
    const ask = vi.fn();
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: vi.fn(async () => ({ ...activeLink(), allowance: {
        ...activeLink().allowance, remainingMicros: 0,
      } })) };
    render(<ManagedAiTextConsole active />);
    expect(await screen.findByText("This allowance cannot cover another text request.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Ask managed AI" })).toBeDisabled();
    expect(ask).not.toHaveBeenCalled();
  });

  it("does not send when a positive balance cannot reserve the cheapest question", async () => {
    const ask = vi.fn();
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: vi.fn(async () => ({ ...activeLink(), allowance: {
        ...activeLink().allowance, remainingMicros: 1_367,
      } })) };
    render(<ManagedAiTextConsole active />);
    expect(await screen.findByText("This allowance cannot cover another text request.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Ask managed AI" })).toBeDisabled();
    expect(ask).not.toHaveBeenCalled();
  });

  it("fails closed if the domain does not report the active text route minimum", async () => {
    const ask = vi.fn();
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), managedAiTextTurn: ask,
      managedAiDeviceLink: vi.fn(async () => ({ ...activeLink(), allowance: {
        ...activeLink().allowance, minimumTextReservationMicros: undefined,
      } })) };
    render(<ManagedAiTextConsole active />);
    expect(await screen.findByText("Text capacity cannot be confirmed. Recheck the website connection.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    expect(ask).not.toHaveBeenCalled();
  });
});
