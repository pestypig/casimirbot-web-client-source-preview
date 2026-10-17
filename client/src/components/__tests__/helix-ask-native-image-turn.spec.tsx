import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Helix Ask native image turn client path", () => {
  const sourcePath = path.resolve(process.cwd(), "client/src/components/helix/HelixAskPill.tsx");

  it("does not pre-analyze image attachments before /ask/turn", () => {
    const source = fs.readFileSync(sourcePath, "utf8");

    expect(source).not.toContain('fetch("/api/agi/situation/visual-frame/analyze"');
    expect(source).not.toContain("analyzeAskImageAttachment");
    expect(source).not.toContain("analyzing image...");
    expect(source).toContain("runImageAttachmentLensRun");
    expect(source).toContain("image_base64: nativeImageBase64");
    expect(source).toContain("nativeImageAttachments");
    expect(source).toContain('raw_image_scope: "turn_input_only"');
    expect(source).toContain("image ready");
  });
});
