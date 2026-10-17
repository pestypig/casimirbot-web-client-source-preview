import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockEnvFlag = (enabled: boolean) => {
  vi.doMock("../envFlags", async () => {
    const actual = await vi.importActual<typeof import("../envFlags")>("../envFlags");
    return {
      ...actual,
      isFlagEnabled: (key: string, defaultValue = false) =>
        key === "HELIX_DEV_MOCKS" ? enabled : defaultValue,
    };
  });
};

describe("apiRequest dev mock behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.doUnmock("../envFlags");
    vi.unstubAllGlobals();
  });

  it("bubbles errors when HELIX_DEV_MOCKS is disabled", async () => {
    mockEnvFlag(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    const { apiRequest } = await import("../queryClient");
    await expect(apiRequest("GET", "/api/helix/pipeline")).rejects.toThrow("boom");
  });

  it("falls back to the dev mock when HELIX_DEV_MOCKS is enabled in dev", async () => {
    mockEnvFlag(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    const { apiRequest } = await import("../queryClient");
    const res = await apiRequest("GET", "/api/helix/pipeline");

    expect(res.ok).toBe(true);
    const payload = await res.json();
    expect(payload.__mockData).toBe(true);
    expect(payload.__mockSource).toBe("helix-dev-defaults");
  });
});
