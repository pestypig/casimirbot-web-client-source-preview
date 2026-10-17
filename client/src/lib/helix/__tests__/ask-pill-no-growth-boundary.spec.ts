import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (repoPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), repoPath), "utf8");

const HELIX_ASK_PILL_PATH = "client/src/components/helix/HelixAskPill.tsx";
const HELIX_ASK_PILL_NO_GROWTH_MAX_LINES = 25_485;

describe("HelixAskPill recrown no-growth boundary", () => {
  it("blocks accidental growth of the legacy bridge", () => {
    const source = read(HELIX_ASK_PILL_PATH);
    const lineCount = source.split(/\r?\n/).length;

    expect(lineCount, [
      `HelixAskPill.tsx is ${lineCount} lines; the recrown ceiling is ${HELIX_ASK_PILL_NO_GROWTH_MAX_LINES}.`,
      "Move new UI/display/pure behavior into client/src/components/helix/ask-console/.",
      "Only lower this ceiling after extracting code from the legacy bridge.",
    ].join(" ")).toBeLessThanOrEqual(HELIX_ASK_PILL_NO_GROWTH_MAX_LINES);
  });

  it("documents the no-growth policy in the ownership map", () => {
    const map = read("client/src/lib/helix/ASK_UI_OWNERSHIP.md");

    expect(map).toContain("HelixAskPill no-growth guard");
    expect(map).toContain("client/src/components/helix/ask-console/");
    expect(map).toContain("Only lower this ceiling after extraction shrinks the bridge");
  });
});
