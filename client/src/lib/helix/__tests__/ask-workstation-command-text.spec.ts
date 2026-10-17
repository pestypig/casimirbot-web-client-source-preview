import { describe, expect, it } from "vitest";
import {
  normalizeLexiconAlias,
  normalizePanelQuery,
  normalizeWorkstationCommandText,
  parseOpenPanelCommand,
  parseWorkstationNoteCreateLexiconArgs,
  restateWorkstationSubgoal,
  resolvePanelIdFromPath,
  resolvePanelIdFromText,
} from "../ask-workstation-command-text";

describe("ask workstation command text helpers", () => {
  it("normalizes panel lookup queries to lowercase word tokens", () => {
    expect(normalizePanelQuery("  Scientific-Calculator!! ")).toBe("scientific calculator");
    expect(normalizePanelQuery("Docs_Viewer / Current")).toBe("docs viewer current");
  });

  it("resolves panel ids from aliases and panel metadata through injected registry state", () => {
    const config = {
      panels: [
        { id: "scientific-calculator", title: "Scientific Calculator", keywords: ["math", "solver"] },
        { id: "docs-viewer", title: "Docs Viewer", keywords: ["paper", "research"] },
        { id: "disabled-panel", title: "Disabled Panel", keywords: ["disabled"] },
      ],
      hasPanel: (id: string) => id !== "disabled-panel",
    };

    expect(resolvePanelIdFromText("open the docs please", config)).toBe("docs-viewer");
    expect(resolvePanelIdFromText("show me the math solver", config)).toBe("scientific-calculator");
    expect(resolvePanelIdFromText("disabled", config)).toBeNull();
    expect(resolvePanelIdFromText("   ", config)).toBeNull();
  });

  it("resolves docs paths and open-panel commands without consuming conversational doc requests", () => {
    const config = {
      panels: [
        { id: "scientific-calculator", title: "Scientific Calculator", keywords: ["math", "solver"] },
        { id: "docs-viewer", title: "Docs Viewer", keywords: ["paper", "research"] },
      ],
      hasPanel: (id: string) => id === "scientific-calculator" || id === "docs-viewer",
    };

    expect(resolvePanelIdFromPath("docs/research/nhm2.md", { hasPanel: config.hasPanel, docsPanelId: "docs-viewer" })).toBe(
      "docs-viewer",
    );
    expect(resolvePanelIdFromPath("src/components/App.tsx", { hasPanel: config.hasPanel, docsPanelId: "docs-viewer" })).toBeNull();
    expect(parseOpenPanelCommand("/open scientific calculator", config)).toBe("scientific-calculator");
    expect(parseOpenPanelCommand("show panel docs", config)).toBe("docs-viewer");
    expect(parseOpenPanelCommand("open docs about NHM2", config)).toBeNull();
    expect(parseOpenPanelCommand("open docs and read aloud", config)).toBeNull();
  });

  it("normalizes workstation command spelling, spacing, and referents", () => {
    expect(normalizeWorkstationCommandText("  pull   up this file outloud ")).toBe(
      "open this doc out loud",
    );
    expect(normalizeWorkstationCommandText("copy that to clipboard")).toBe("copy this to clipboard");
    expect(normalizeWorkstationCommandText("append that to my note")).toBe("append this to my note");
    expect(normalizeWorkstationCommandText("open the note pad")).toBe("open the note");
    expect(normalizeWorkstationCommandText("“read current aloud”")).toBe("\"read current doc to me\"");
  });

  it("rephrases paper lookup intents into an open-and-read subgoal", () => {
    expect(restateWorkstationSubgoal("please find a paper about NHM2 status.")).toBe(
      "find a paper about NHM2 status and open it and read it to me",
    );
    expect(restateWorkstationSubgoal("paper on Casimir diagnostics?")).toBe(
      "find a paper about Casimir diagnostics and open it and read it to me",
    );
  });

  it("keeps summary and explain requests as stated after trimming assistant prefaces", () => {
    expect(restateWorkstationSubgoal("Hey Helix, can you explain the current doc?")).toBe(
      "explain the current doc?",
    );
    expect(restateWorkstationSubgoal("\"Question: summarize this section\"")).toBe(
      "summarize this section",
    );
  });

  it("normalizes lexicon aliases for panel capability matching", () => {
    expect(normalizeLexiconAlias("Please open up my Clipboard History!")).toBe("open clipboard history");
    expect(normalizeLexiconAlias("could you show the calculator, please")).toBe("show calculator please");
    expect(normalizeLexiconAlias("kindly   Open-Up  Notes")).toBe("open up notes");
  });

  it("parses note-create lexicon args without legacy bridge state", () => {
    expect(
      parseWorkstationNoteCreateLexiconArgs({
        source: 'make a note for me "qwerty"',
        conversationalCandidate: 'make a note for me "qwerty',
      }),
    ).toEqual({ body: "qwerty" });
    expect(
      parseWorkstationNoteCreateLexiconArgs({
        source: "create a note called Warp Notes",
        conversationalCandidate: "create a note called Warp Notes",
      }),
    ).toEqual({ title: "Warp Notes", topic: "Warp Notes" });
  });
});
