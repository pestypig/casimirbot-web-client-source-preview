import { describe, expect, it } from "vitest";

import {
  buildHelixAskMathRenderDebugForText,
  hasHelixAskRenderableMath,
  shouldShowHelixAskCalculatorPanel,
  splitHelixAskExternalLinkTextSegments,
  splitHelixAskInlineCodeTextSegments,
  splitHelixAskTextPathSegments,
  tokenizeHelixAskMathTokens,
} from "@/lib/helix/ask-answer-rendering";

describe("tokenizeHelixAskMathTokens", () => {
  it("tokenizes inline and display math delimiters", () => {
    const tokens = tokenizeHelixAskMathTokens("Energy $E=mc^2$ and $$\\int_0^1 x^2 dx$$ done.");
    expect(tokens).toHaveLength(5);
    expect(tokens[0]).toMatchObject({ kind: "text", text: "Energy " });
    expect(tokens[1]).toMatchObject({ kind: "math", text: "E=mc^2", displayMode: false });
    expect(tokens[2]).toMatchObject({ kind: "text", text: " and " });
    expect(tokens[3]).toMatchObject({ kind: "math", text: "\\int_0^1 x^2 dx", displayMode: true });
    expect(tokens[4]).toMatchObject({ kind: "text", text: " done." });
  });

  it("keeps escaped dollar signs as text", () => {
    const tokens = tokenizeHelixAskMathTokens("Price is \\$5 and equation $x+y$.");
    const mathTokens = tokens.filter((token) => token.kind === "math");
    expect(mathTokens).toHaveLength(1);
    expect(mathTokens[0]).toMatchObject({ text: "x+y", displayMode: false });
    expect(tokens[0]).toMatchObject({ kind: "text", text: "Price is \\$5 and equation " });
  });

  it("falls back to text when delimiters are unmatched", () => {
    const tokens = tokenizeHelixAskMathTokens("Path client/src/app.tsx and dangling \\(x+y.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      kind: "text",
      text: "Path client/src/app.tsx and dangling \\(x+y.",
    });
  });

  it("tokenizes bare equations without explicit delimiters", () => {
    const tokens = tokenizeHelixAskMathTokens(
      "Primary Equation: tau = hbar / DeltaE, with explicit units and kernel choice.",
    );
    const mathTokens = tokens.filter((token) => token.kind === "math");
    expect(mathTokens).toHaveLength(1);
    expect(mathTokens[0]).toMatchObject({ text: "tau = hbar / DeltaE", displayMode: false });
    expect(hasHelixAskRenderableMath("tau = hbar / DeltaE")).toBe(true);
  });

  it("does not absorb result prose into bare equation math tokens", () => {
    const tokens = tokenizeHelixAskMathTokens("Result: E = 3.313035e-19 J for f = 5e14 Hz.");
    const mathTokens = tokens.filter((token) => token.kind === "math");

    expect(mathTokens.length).toBeGreaterThanOrEqual(1);
    expect(mathTokens[0]).toMatchObject({ text: "E = 3.313035e-19 J", displayMode: false });
    expect(mathTokens.every((token) => !/\bfor\b/i.test(token.text))).toBe(true);
    expect(tokens.map((token) => token.text).join("")).toContain("for f = 5e14 Hz.");
  });

  it("does not treat config-style assignments as equations", () => {
    const text = 'profile = "equation_focus_compact"';
    const tokens = tokenizeHelixAskMathTokens(text);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ kind: "text", text });
    expect(hasHelixAskRenderableMath(text)).toBe(false);
  });

  it("does not treat metadata score assignments as equations", () => {
    const text = "Rejected Candidates: score=84.7";
    const tokens = tokenizeHelixAskMathTokens(text);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ kind: "text", text });
    expect(hasHelixAskRenderableMath(text)).toBe(false);
  });

  it("renders simple numeric assignment tokens as code-style text to avoid duplicate KaTeX text", () => {
    const debug = buildHelixAskMathRenderDebugForText("The current frontier is alpha = 0.7.");

    expect(debug).not.toBeNull();
    expect(
      debug?.tokenStatuses.some(
        (status) =>
          status.status === "formatted" &&
          status.reason === "code_style_plaintext" &&
          status.tokenText === "alpha = 0.7",
      ),
    ).toBe(true);
  });

  it("reports math formatting debug stats including ignored candidates", () => {
    const debug = buildHelixAskMathRenderDebugForText(
      "tau = hbar / DeltaE\nfoo = bar",
    );
    expect(debug).not.toBeNull();
    expect(debug?.bareCandidateCount).toBe(2);
    expect(debug?.bareAcceptedCount).toBe(1);
    expect(debug?.bareIgnoredCount).toBe(1);
    expect(debug?.mathTokenCount).toBeGreaterThanOrEqual(1);
    expect(debug?.tokenStatuses.some((status) => status.status === "formatted")).toBe(true);
    expect(
      debug?.tokenStatuses.some(
        (status) => status.status === "ignored_reason" && status.reason === "rhs_low_math_signal",
      ),
    ).toBe(true);
  });

  it("reports katex errors for invalid latex segments", () => {
    const debug = buildHelixAskMathRenderDebugForText("Bad $\\sqrt{$ token.");
    expect(debug).not.toBeNull();
    expect(debug?.mathTokenCount).toBe(1);
    expect(debug?.katexErrorCount).toBe(1);
    expect(debug?.katexErrorSamples.length).toBeGreaterThan(0);
    expect(debug?.tokenStatuses.some((status) => status.status === "katex_error")).toBe(true);
  });

  it("supports final-answer equation blocks with anchor lines and latex", () => {
    const debug = buildHelixAskMathRenderDebugForText(
      [
        "Primary Equation (Verified):",
        "- [shared/collapse-benchmark.ts:L571] rho_eff_kg_m3 = E_G_J / (Math.max(1e-30, C2 * V_c_m3))",
        "- $\\tau = \\hbar / \\Delta E$",
      ].join("\n"),
    );
    expect(debug).not.toBeNull();
    expect(debug?.mathTokenCount).toBeGreaterThanOrEqual(2);
    expect(debug?.tokenStatuses.some((status) => status.status === "formatted")).toBe(true);
    expect(debug?.tokenStatuses.some((status) => /rho_eff_kg_m3/.test(status.tokenText))).toBe(true);
  });

  it("marks code-style equation tokens as formatted plaintext instead of katex_error", () => {
    const debug = buildHelixAskMathRenderDebugForText(
      "[shared/collapse-benchmark.ts:L570] rho_eff_kg_m3 = E_G_J / (Math.max(1e-30, C2 * V_c_m3))",
    );
    expect(debug).not.toBeNull();
    expect(debug?.katexErrorCount).toBe(0);
    expect(
      debug?.tokenStatuses.some(
        (status) =>
          status.status === "formatted" &&
          status.reason === "code_style_plaintext" &&
          /rho_eff_kg_m3/.test(status.tokenText),
      ),
    ).toBe(true);
  });

  it("suppresses calculator launch for non-equation family even when math-like text exists", () => {
    const show = shouldShowHelixAskCalculatorPanel({
      canLaunchPanel: true,
      hasRenderableMath: true,
      debug: {
        policy_prompt_family: "definition_overview",
        composer_prompt_family: "definition_overview",
      },
    });
    expect(show).toBe(false);
  });

  it("keeps calculator launch for equation-family responses", () => {
    const show = shouldShowHelixAskCalculatorPanel({
      canLaunchPanel: true,
      hasRenderableMath: true,
      debug: {
        policy_prompt_family: "equation_formalism",
        equation_selector_primary_key: "shared/collapse-benchmark.ts:L570",
      },
    });
    expect(show).toBe(true);
  });
});

describe("splitHelixAskTextPathSegments", () => {
  it("splits file paths from final-answer text without changing surrounding text", () => {
    expect(splitHelixAskTextPathSegments("See client/src/components/helix/HelixAskPill.tsx for details.")).toEqual([
      { kind: "text", text: "See " },
      { kind: "path", text: "client/src/components/helix/HelixAskPill.tsx", start: 4 },
      { kind: "text", text: " for details." },
    ]);
  });

  it("keeps ordinary final-answer text as one text segment", () => {
    expect(splitHelixAskTextPathSegments("No file path was referenced.")).toEqual([
      { kind: "text", text: "No file path was referenced." },
    ]);
  });
});

describe("splitHelixAskExternalLinkTextSegments", () => {
  it("turns Markdown scholarly citations into safe external-link segments", () => {
    const text =
      "See [arXiv 2408.08592](https://arxiv.org/abs/2408.08592) and [DOI](https://doi.org/10.29007/slnn).";
    expect(
      splitHelixAskExternalLinkTextSegments(text),
    ).toEqual([
      { kind: "text", text: "See " },
      {
        kind: "external_link",
        text: "arXiv 2408.08592",
        href: "https://arxiv.org/abs/2408.08592",
        start: 4,
        syntax: "markdown",
      },
      { kind: "text", text: " and " },
      {
        kind: "external_link",
        text: "DOI",
        href: "https://doi.org/10.29007/slnn",
        start: text.indexOf("[DOI]"),
        syntax: "markdown",
      },
      { kind: "text", text: "." },
    ]);
  });

  it("links bare web URLs without swallowing sentence punctuation", () => {
    expect(splitHelixAskExternalLinkTextSegments("Open https://arxiv.org/abs/2401.12345, then continue.")).toEqual([
      { kind: "text", text: "Open " },
      {
        kind: "external_link",
        text: "https://arxiv.org/abs/2401.12345",
        href: "https://arxiv.org/abs/2401.12345",
        start: 5,
        syntax: "bare",
      },
      { kind: "text", text: ", then continue." },
    ]);
  });

  it("does not admit non-web or malformed destinations", () => {
    const text = "Keep [unsafe](javascript:alert(1)), artifact://local/ref, and https:// as text.";
    expect(splitHelixAskExternalLinkTextSegments(text)).toEqual([{ kind: "text", text }]);
  });
});

describe("splitHelixAskInlineCodeTextSegments", () => {
  it("splits inline code spans from final-answer text", () => {
    expect(splitHelixAskInlineCodeTextSegments("Use `alpha = 0.7` and continue.")).toEqual([
      { kind: "text", text: "Use " },
      { kind: "inline_code", text: "alpha = 0.7", start: 4 },
      { kind: "text", text: " and continue." },
    ]);
  });

  it("leaves unmatched or multiline backticks as plain text", () => {
    const text = "Keep `this\nas plain and `dangling.";
    expect(splitHelixAskInlineCodeTextSegments(text)).toEqual([{ kind: "text", text }]);
  });
});
