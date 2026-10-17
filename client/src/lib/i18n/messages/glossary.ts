export type InterfaceGlossaryTermPolicy =
  | "retain"
  | "translate_after_review"
  | "retain_or_explain"
  | "decision_required";

export type InterfaceGlossaryTerm = {
  source: string;
  policy: InterfaceGlossaryTermPolicy;
  target: string | null;
  note: string;
};

export type InterfaceGlossary = {
  schema: "casimir.interface_glossary.v1";
  locale: string;
  terms: InterfaceGlossaryTerm[];
};

export const hawInterfaceGlossary: InterfaceGlossary = {
  schema: "casimir.interface_glossary.v1",
  locale: "haw",
  terms: [
    {
      source: "workstation",
      policy: "retain",
      target: "workstation",
      note: "Product surface term. Do not translate until reviewed.",
    },
    {
      source: "session",
      policy: "translate_after_review",
      target: null,
      note: "Could mean login session or work session depending on UI context.",
    },
    {
      source: "memory",
      policy: "translate_after_review",
      target: null,
      note: "Product concept, not biological memory.",
    },
    {
      source: "ingress",
      policy: "retain_or_explain",
      target: null,
      note: "Technical API-link concept.",
    },
    {
      source: "receipt",
      policy: "retain_or_explain",
      target: null,
      note: "System evidence artifact, not a purchase receipt.",
    },
  ],
};
