import { describe, expect, it } from "vitest";
import { sunpyMaxFramesQuery, sunpyProbeAllowed } from "./sunpy-request";

describe("SunPy frame request", () => {
  it("waits for confirmed runtime capability before an archive probe", () => {
    expect(sunpyProbeAllowed(null, 1)).toBe(false);
    expect(sunpyProbeAllowed({ available: false }, 1)).toBe(false);
    expect(sunpyProbeAllowed({ available: true }, 1)).toBe(true);
  });
  it.each([0, -1, 41, NaN, 0.5])("does not probe HEK-only or invalid frame count %s", count => {
    expect(sunpyProbeAllowed({ available: true }, count)).toBe(false);
  });
  it("preserves HEK-only mode rather than fetching ten images", () => {
    expect(sunpyMaxFramesQuery(0)).toBe("0");
  });
  it("defaults only missing values and preserves requested limits", () => {
    expect(sunpyMaxFramesQuery(undefined)).toBe("10");
    expect(sunpyMaxFramesQuery(null)).toBe("10");
    expect(sunpyMaxFramesQuery(3)).toBe("3");
    expect(sunpyMaxFramesQuery(40)).toBe("40");
  });
  it.each([-1, 41, 0.5, NaN, Infinity])("rejects invalid count %s", (value) => {
    expect(() => sunpyMaxFramesQuery(value)).toThrow();
  });
});
