import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Helix Ask submit referent dependencies", () => {
  it("refreshes the submit closure when referent reply sources change", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/HelixAskPill.tsx"),
      "utf8",
    );
    const runAskSource = source.slice(
      source.indexOf("const runAsk = useCallback("),
      source.indexOf("runAskRef.current = runAsk;"),
    );

    expect(runAskSource).toContain("chronologicalAskRepliesForTranscript,");
    expect(runAskSource).toContain("helixChatSessions,");
  });
});
