import { describe, expect, it } from "vitest";
import { auth0AccountStartHref } from "./Auth0SignInButton";

describe("Auth0SignInButton", () => {
  it("uses the same-origin start route with an encoded local return path", () => {
    const href = auth0AccountStartHref(
      "/desktop?panels=account-session&focus=account-session",
    );
    expect(href).toBe(
      "/api/auth/auth0/start?return_to=%2Fdesktop%3Fpanels%3Daccount-session%26focus%3Daccount-session",
    );
    expect(href).not.toContain("access_token");
    expect(href).not.toContain("client_secret");
  });
});
