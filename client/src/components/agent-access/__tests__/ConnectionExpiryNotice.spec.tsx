// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ConnectionExpiryNotice from "../ConnectionExpiryNotice";

afterEach(() => { cleanup(); vi.useRealTimers(); });
it("counts down, permits dismissal, and clears expiry on a fresh deadline without granting authority", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T18:00:00Z"));
  const props = {label: "AI task presence", recovery: "Refresh the same task; keep the active binding."};
  const { rerender } = render(<ConnectionExpiryNotice {...props} deadline="2026-09-07T18:00:02Z" />);
  expect(screen.getByText(/0:02 remaining/)).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole("alert").textContent).toContain("does not renew or grant permission");
  fireEvent.click(screen.getByRole("button", {name: "Dismiss expiry notice"}));
  expect(screen.queryByRole("alert")).toBeNull();
  rerender(<ConnectionExpiryNotice {...props} deadline="2026-09-07T18:01:00Z" />);
  expect(screen.getByText(/0:58 remaining/)).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("does not invent a timer for an invalid deadline", () => {
  const { container } = render(<ConnectionExpiryNotice deadline="unknown" label="Claim" recovery="Check status" />);
  expect(container.textContent).toBe("");
});
