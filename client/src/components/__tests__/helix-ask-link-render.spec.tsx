import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HelixAskPathLinkedTextSurface } from "@/components/helix/ask-console/HelixAskPathLinkedTextSurface";

describe("HelixAskPathLinkedTextSurface external links", () => {
  it("renders safe scholarly Markdown links as isolated user-click anchors", () => {
    const html = renderToStaticMarkup(
      <HelixAskPathLinkedTextSurface
        keyPrefix="answer"
        onOpenPanel={vi.fn()}
        resolvePanelId={() => null}
        text="Read [arXiv 2408.08592](https://arxiv.org/abs/2408.08592)."
      />,
    );

    expect(html).toContain('href="https://arxiv.org/abs/2408.08592"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(">arXiv 2408.08592</a>");
  });

  it("leaves non-web Markdown destinations inert", () => {
    const html = renderToStaticMarkup(
      <HelixAskPathLinkedTextSurface
        keyPrefix="answer"
        onOpenPanel={vi.fn()}
        resolvePanelId={() => null}
        text="Keep [unsafe](javascript:alert(1)) inert."
      />,
    );

    expect(html).not.toContain("<a");
    expect(html).toContain("[unsafe](javascript:alert(1))");
  });
});
