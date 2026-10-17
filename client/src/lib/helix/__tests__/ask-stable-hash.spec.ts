import { describe, expect, it } from "vitest";

import { hash32, stableHelixProjectionHash } from "@/lib/helix/ask-stable-hash";

describe("ask stable hash", () => {
  it("keeps deterministic unsigned 32-bit FNV-style vectors", () => {
    expect(hash32("")).toBe(2166136261);
    expect(hash32("hello")).toBe(1335831723);
    expect(hash32("Helix Ask")).toBe(3245358066);
    expect(hash32("8*9")).toBe(3364257770);
  });

  it("formats projection hashes as fixed-width lowercase hex", () => {
    expect(stableHelixProjectionHash("")).toBe("811c9dc5");
    expect(stableHelixProjectionHash("hello")).toBe("4f9f2cab");
    expect(stableHelixProjectionHash("Helix Ask")).toBe("c1703bf2");
    expect(stableHelixProjectionHash("8*9")).toBe("c8867fea");
  });
});
