// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from
  "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalTotpEnrollment } from "../PersonalTotpEnrollment";

const intentId = "totp_enroll_01234567-89ab-4cde-8fab-0123456789ab";
const recoveryIntentId = "totp_recover_01234567-89ab-4cde-8fab-0123456789ab";
const recoveryCode = "CBR1-" + "a".repeat(27);
const response = (body: unknown, status = 200) => new Response(
  JSON.stringify(body), { status,
    headers: { "Content-Type": "application/json" } });

describe("private account authenticator enrollment", () => {
  afterEach(() => {
    cleanup(); vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/account");
  });

  it("stays hidden while the private website API is disabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: false }, 404)));
    const { container } = render(<PersonalTotpEnrollment profileId="auth0:owner" />);
    await waitFor(() => expect(container.querySelector("section")).toBeNull());
  });

  it("confirms a code, shows recovery codes once, and requires saved-code acknowledgment", async () => {
    window.history.replaceState(null, "",
      `/account?totp_enrollment=${intentId}`);
    const codes = Array.from({ length: 10 }, (_, index) => `CODE-${index}`);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/enrollment/status")) return response({ ok: true,
        status: "pending" });
      if (url.includes("/enrollment/provisioning?")) return response({ ok: true,
        provisioning_uri: "otpauth://totp/CasimirBot:owner?secret=SETUPKEY",
        expires_at: "2026-10-14T12:10:00.000Z" });
      if (url.endsWith("/enrollment/confirm")) return response({ ok: true,
        recovery_codes: codes });
      if (url.endsWith("/enrollment/acknowledge")) return response({ ok: true,
        status: "active" });
      throw Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PersonalTotpEnrollment profileId="auth0:owner" />);
    expect(await screen.findByText("SETUPKEY")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Scan with authenticator app" }))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm code" }));
    expect(await screen.findByText("CODE-0")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Scan with authenticator app" }))
      .toBeNull();
    expect(screen.getByRole("button", { name: "Finish setup" }))
      .toBeDisabled();
    fireEvent.click(screen.getByLabelText("I saved these recovery codes"));
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/personal-totp/enrollment/confirm",
      expect.objectContaining({ body: JSON.stringify({
        intent_id: intentId, code: "123456",
      }) }),
    );
  });

  it("redeems a recovery code only after the returned intent is ready", async () => {
    window.history.replaceState(null, "",
      `/account?totp_recovery=${recoveryIntentId}`);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/enrollment/status")) return response({ ok: true,
        status: "active" });
      if (url.endsWith("/recovery/enabled")) return response({ ok: true });
      if (url.includes("/recovery/ready?")) return response({ ok: true,
        expires_at: "2026-10-15T12:05:00.000Z" });
      if (url.endsWith("/recovery/redeem")) return response({ ok: true,
        status: "pending" });
      throw Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PersonalTotpEnrollment profileId="auth0:owner" />);
    const input = await screen.findByLabelText("Saved recovery code");
    expect(screen.queryByRole("button", { name: "Recover authenticator" }))
      .toBeNull();
    fireEvent.change(input, { target: { value: recoveryCode } });
    fireEvent.click(screen.getByRole("button", { name: "Use recovery code" }));
    expect(await screen.findByText(/Recovery approved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart setup" }))
      .toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/personal-totp/recovery/redeem",
      expect.objectContaining({ body: JSON.stringify({
        intent_id: recoveryIntentId, recovery_code: recoveryCode,
      }) }),
    );
  });

  it("does not offer recovery when the private route is unavailable", async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith("/enrollment/status")
      ? response({ ok: true, status: "active" }) : response({ ok: false }, 404));
    vi.stubGlobal("fetch", fetchMock);
    render(<PersonalTotpEnrollment profileId="auth0:owner" />);
    expect(await screen.findByText("Active")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/personal-totp/recovery/enabled",
      expect.any(Object),
    ));
    expect(screen.queryByRole("button", { name: "Recover authenticator" }))
      .toBeNull();
  });
});
