import { create } from "zustand";
import type { DocEquationContextArtifactV1 } from "@shared/contracts/doc-equation-context.v1";

const MAX_DOC_EQUATION_CONTEXTS = 24;

type DocEquationContextState = {
  latestContext: DocEquationContextArtifactV1 | null;
  contexts: DocEquationContextArtifactV1[];
  recordContext: (artifact: DocEquationContextArtifactV1) => void;
  clearContexts: () => void;
};

const contextKey = (artifact: DocEquationContextArtifactV1): string =>
  [
    artifact.docPath,
    artifact.equationId,
    artifact.actionId,
    artifact.generatedAt,
  ].join("::");

export const useDocEquationContextStore = create<DocEquationContextState>((set) => ({
  latestContext: null,
  contexts: [],
  recordContext: (artifact) =>
    set((state) => {
      const next = [
        artifact,
        ...state.contexts.filter((entry) => contextKey(entry) !== contextKey(artifact)),
      ].slice(0, MAX_DOC_EQUATION_CONTEXTS);
      return {
        latestContext: artifact,
        contexts: next,
      };
    }),
  clearContexts: () => set({ latestContext: null, contexts: [] }),
}));
